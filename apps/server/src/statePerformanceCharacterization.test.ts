import { randomUUID } from 'node:crypto';

import {
  type Ack,
  tileState,
  type MakeOfferResult,
  type PrivateOffer,
  type PublicRoomState,
  type TradeBundle,
} from '@monopoly/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import {
  ack,
  connect,
  dataOf,
  failureOf,
  lobbyOfFour,
  mutateRoom,
  okOf,
  ready,
  readyEveryone,
  resume,
  start,
  stored,
  useHarnessCleanup,
  type Player,
} from './testing/teamHarness.js';

useHarnessCleanup();

const offerBundle = (cash: number, ...propertyIds: number[]): TradeBundle => ({
  cash,
  propertyIds,
  jailFreeCardIds: [],
});

const makeOffer = (
  proposer: Player,
  recipient: Player,
  terms: { offered: TradeBundle; requested: TradeBundle },
  requestId: string,
) => ack<MakeOfferResult>((acknowledge) => proposer.socket.emit('make offer', {
  recipientPlayerId: recipient.playerId,
  ...terms,
  requestId,
}, acknowledge));

const revisionOf = <T>(acknowledgement: Ack<T>): number => {
  if (!acknowledgement.ok) throw new Error(`Expected successful ACK, received ${acknowledgement.error.code}`);
  if (typeof acknowledgement.revision !== 'number') throw new Error('Expected a room revision on the ACK');
  return acknowledgement.revision;
};

const nextUpdate = (player: Player): Promise<PublicRoomState> => new Promise((resolve) => {
  player.socket.once('update', resolve);
});

describe('C2 terminal offer retention characterization', () => {
  it('retains every terminal status until the room is deleted', async () => {
    const store = new InMemoryPersistenceStore<{ marker: string }>();
    const roomId = randomUUID();
    const proposerPlayerId = randomUUID();
    const recipientPlayerId = randomUUID();
    const statuses = ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'] as const;
    const offerIds: string[] = [];

    await store.rooms.create({
      id: roomId,
      code: 'C2-RETENTION',
      status: 'IN_PROGRESS',
      snapshotSchemaVersion: 12,
      gameSnapshot: { marker: 'retention fixture' },
    });

    for (const [index, status] of statuses.entries()) {
      const offerId = randomUUID();
      offerIds.push(offerId);
      const expiresAt = new Date(Date.now() + 60_000);
      await store.tradeOffers.create({
        id: offerId,
        roomId,
        proposerPlayerId,
        recipientPlayerId,
        offered: offerBundle(100 + index),
        requested: offerBundle(0),
        expiresAt,
      });
      const resolvedAt = status === 'EXPIRED'
        ? new Date(expiresAt.getTime() + 1)
        : new Date();
      await store.tradeOffers.resolve(offerId, status, resolvedAt);
    }

    const retained = await Promise.all(offerIds.map((offerId) => store.tradeOffers.findById(offerId)));
    expect(retained.map((offer) => offer?.status)).toEqual(statuses);
    expect(await store.tradeOffers.listPendingForRoom(roomId)).toEqual([]);

    expect(await store.rooms.delete(roomId)).toBe(true);
    expect(await Promise.all(offerIds.map((offerId) => store.tradeOffers.findById(offerId))))
      .toEqual([null, null, null, null]);
  });
});

describe('C2 room revision and replay characterization', () => {
  it('revises, broadcasts, and ACKs an unchanged repeated ready value', async () => {
    const game = await lobbyOfFour();
    const player = game.players[0];
    const updates: PublicRoomState[] = [];
    const privateStates: unknown[] = [];
    player.socket.on('update', (room) => updates.push(room));
    player.socket.on('private player state', (state) => privateStates.push(state));
    const initialVersion = (await stored(game.persistence, game.roomId)).aggregateVersion;

    const first = await ready(player.socket, true);
    const second = await ready(player.socket, true);

    expect(first).toMatchObject({ ok: true, revision: initialVersion + 1 });
    expect(second).toMatchObject({ ok: true, revision: initialVersion + 2 });
    expect(updates.map((room) => room.version).filter((version) => version > initialVersion))
      .toEqual([initialVersion + 1, initialVersion + 2]);
    expect(privateStates.length).toBeGreaterThanOrEqual(2);
    expect((await stored(game.persistence, game.roomId)).gameSnapshot.members[player.playerId]?.ready).toBe(true);
  });

  it('increments revisions and broadcasts on a successful sell-house request replay while applying the sale once', async () => {
    const game = await lobbyOfFour();
    await readyEveryone(game.players);
    okOf(await start(game.players[0].socket));
    const owner = game.players[0];
    await mutateRoom(game.persistence, game.roomId, (room) => {
      room.gameSnapshot.gameState.boardState.ownedProps[1] = {
        id: owner.playerId,
        color: room.gameSnapshot.gameState.players[owner.playerId].color,
        houses: 3,
      };
      room.gameSnapshot.gameState.players[owner.playerId].accountBalance = 1_000;
    });

    const updates: PublicRoomState[] = [];
    const privateStates: unknown[] = [];
    owner.socket.on('update', (room) => updates.push(room));
    owner.socket.on('private player state', (state) => privateStates.push(state));
    const initialVersion = (await stored(game.persistence, game.roomId)).aggregateVersion;
    const requestId = randomUUID();
    const sell = () => ack((acknowledge) => owner.socket.emit('sell house', {
      tileID: 1,
      requestId,
    }, acknowledge));

    const first = await sell();
    const replay = await sell();

    expect(first).toMatchObject({ ok: true, revision: initialVersion + 1 });
    expect(replay).toMatchObject({ ok: true, revision: initialVersion + 2 });
    expect(updates.map((room) => room.version).filter((version) => version > initialVersion))
      .toEqual([initialVersion + 1, initialVersion + 2]);
    expect(privateStates.length).toBeGreaterThanOrEqual(2);
    const room = await stored(game.persistence, game.roomId);
    expect(room.gameSnapshot.gameState.boardState.ownedProps[1]?.houses).toBe(2);
    expect(room.gameSnapshot.gameState.players[owner.playerId].accountBalance)
      .toBe(1_000 + Math.floor((tileState[1].houseCost ?? 0) / 2));
  });

  it('replays make-offer after reconnect with the same result, one private event, and one additional revision', async () => {
    const game = await lobbyOfFour();
    await readyEveryone(game.players);
    const [proposer, recipient] = game.players;
    const updates: PublicRoomState[] = [];
    recipient.socket.on('update', (room) => updates.push(room));
    const startPublished = nextUpdate(recipient);
    okOf(await start(game.players[0].socket));
    await startPublished;
    await mutateRoom(game.persistence, game.roomId, (room) => {
      room.gameSnapshot.gameState.boardState.ownedProps[3] = {
        id: recipient.playerId,
        color: room.gameSnapshot.gameState.players[recipient.playerId].color,
        houses: 0,
      };
      room.gameSnapshot.gameState.players[proposer.playerId].accountBalance = 1_000;
      room.gameSnapshot.gameState.boardState.currentPlayer.id = recipient.playerId;
    });

    const received: PrivateOffer[] = [];
    recipient.socket.on('offer on prop', (offer) => received.push(offer));
    const terms = { offered: offerBundle(100), requested: offerBundle(0, 3) };
    const requestId = randomUUID();
    const first = await makeOffer(proposer, recipient, terms, requestId);
    const firstResult = dataOf(first);
    expect(received).toHaveLength(1);
    expect(revisionOf(first)).toBeDefined();

    const disconnectPublished = nextUpdate(recipient);
    proposer.socket.disconnect();
    await disconnectPublished;
    const reconnectedSocket = await connect(game.subject.url);
    const resumePublished = nextUpdate(recipient);
    const resumeResult = await resume(reconnectedSocket, proposer.token);
    await resumePublished;
    expect(resumeResult.pendingOffers.map((offer) => offer.offerId)).toContain(firstResult.offerId);

    const reconnectedProposer: Player = { ...proposer, socket: reconnectedSocket, room: resumeResult.room };
    const versionBeforeReplay = (await stored(game.persistence, game.roomId)).aggregateVersion;
    const updatesBeforeReplay = updates.length;
    const replay = await makeOffer(reconnectedProposer, recipient, terms, requestId);

    expect(dataOf(replay)).toEqual(firstResult);
    expect(revisionOf(replay)).toBe(versionBeforeReplay + 1);
    expect((await stored(game.persistence, game.roomId)).aggregateVersion).toBe(versionBeforeReplay + 1);
    expect(received).toHaveLength(1);
    expect(updates).toHaveLength(updatesBeforeReplay);
    expect(await game.persistence.tradeOffers.listPendingForRoom(game.roomId)).toHaveLength(1);
  });

  it('serializes concurrent make-offer retries, advancing each revision but emitting one offer', async () => {
    const game = await lobbyOfFour();
    await readyEveryone(game.players);
    const [proposer, recipient] = game.players;
    const startPublished = nextUpdate(recipient);
    okOf(await start(game.players[0].socket));
    await startPublished;
    await mutateRoom(game.persistence, game.roomId, (room) => {
      room.gameSnapshot.gameState.boardState.ownedProps[3] = {
        id: recipient.playerId,
        color: room.gameSnapshot.gameState.players[recipient.playerId].color,
        houses: 0,
      };
    });

    const received: PrivateOffer[] = [];
    const updates: PublicRoomState[] = [];
    recipient.socket.on('offer on prop', (offer) => received.push(offer));
    recipient.socket.on('update', (room) => updates.push(room));
    const initialVersion = (await stored(game.persistence, game.roomId)).aggregateVersion;
    const requestId = randomUUID();
    const terms = { offered: offerBundle(100), requested: offerBundle(0, 3) };
    const answers = await Promise.all([
      makeOffer(proposer, recipient, terms, requestId),
      makeOffer(proposer, recipient, terms, requestId),
      makeOffer(proposer, recipient, terms, requestId),
    ]);

    const results = answers.map(dataOf);
    expect(new Set(results.map((result) => result.offerId)).size).toBe(1);
    expect(answers.map(revisionOf).sort()).toEqual([
      initialVersion + 1,
      initialVersion + 2,
      initialVersion + 3,
    ]);
    expect((await stored(game.persistence, game.roomId)).aggregateVersion).toBe(initialVersion + 3);
    expect(await game.persistence.tradeOffers.listPendingForRoom(game.roomId)).toHaveLength(1);
    expect(received).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it('keeps a declined record and rejects a repeated decline without another revision or event', async () => {
    const game = await lobbyOfFour();
    await readyEveryone(game.players);
    const [proposer, recipient] = game.players;
    const updates: PublicRoomState[] = [];
    recipient.socket.on('update', (room) => updates.push(room));
    const startPublished = nextUpdate(recipient);
    okOf(await start(game.players[0].socket));
    await startPublished;
    await mutateRoom(game.persistence, game.roomId, (room) => {
      room.gameSnapshot.gameState.boardState.ownedProps[3] = {
        id: recipient.playerId,
        color: room.gameSnapshot.gameState.players[recipient.playerId].color,
        houses: 0,
      };
    });

    const offer = dataOf(await makeOffer(proposer, recipient, {
      offered: offerBundle(100),
      requested: offerBundle(0, 3),
    }, randomUUID()));
    const proposerResults: unknown[] = [];
    const recipientResults: unknown[] = [];
    proposer.socket.on('offer declined', (result) => proposerResults.push(result));
    recipient.socket.on('offer declined', (result) => recipientResults.push(result));
    const versionBeforeDecline = (await stored(game.persistence, game.roomId)).aggregateVersion;
    const updatesBeforeDecline = updates.length;
    const decline = () => ack((acknowledge) => recipient.socket.emit('decline offer', {
      offerId: offer.offerId,
    }, acknowledge));

    const first = await decline();
    const afterFirst = (await stored(game.persistence, game.roomId)).aggregateVersion;
    const duplicate = await decline();

    expect(first).toMatchObject({ ok: true, revision: versionBeforeDecline + 1 });
    expect(afterFirst).toBe(versionBeforeDecline + 1);
    expect(failureOf(duplicate).code).toBe('CONFLICT');
    expect((await stored(game.persistence, game.roomId)).aggregateVersion).toBe(afterFirst);
    expect((await game.persistence.tradeOffers.findById(offer.offerId))?.status).toBe('DECLINED');
    expect(proposerResults).toHaveLength(1);
    expect(recipientResults).toHaveLength(1);
    expect(updates).toHaveLength(updatesBeforeDecline);
  });
});
