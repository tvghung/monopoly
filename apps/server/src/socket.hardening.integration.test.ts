import { randomUUID } from 'node:crypto';

import {
  tileState,
  type AckCallback,
  type MakeOfferResult,
  type PrivateOffer,
  type PublicRoomState,
  type TradeBundle,
} from '@monopoly/shared';
import { describe, expect, it } from 'vitest';

import type { PersistenceStore } from './persistence/types.js';
import { assertSupportedRoomSnapshot, type RoomSnapshot } from './rooms.js';
import {
  ack,
  dataOf,
  failureOf,
  mutateRoom,
  okOf,
  readyEveryone,
  lobbyOfFour,
  start,
  stored,
  useHarnessCleanup,
  type Player,
} from './testing/teamHarness.js';

useHarnessCleanup();

/** A started Solo game of four. Every test sets the turn, cash and properties itself through the store. */
async function soloGame() {
  const lobby = await lobbyOfFour();
  await readyEveryone(lobby.players);
  okOf(await start(lobby.players[0].socket));
  return lobby;
}

type Persistence = PersistenceStore<RoomSnapshot>;

async function arrange(
  persistence: Persistence,
  roomId: string,
  change: (state: RoomSnapshot['gameState'], room: Awaited<ReturnType<typeof stored>>) => void,
): Promise<void> {
  await mutateRoom(persistence, roomId, (room) => change(room.gameSnapshot.gameState, room));
}

function collectUpdates(player: Player): PublicRoomState[] {
  const updates: PublicRoomState[] = [];
  player.socket.on('update', (room) => updates.push(room));
  return updates;
}

const settle = (milliseconds = 150): Promise<void> => new Promise((resolve) => { setTimeout(resolve, milliseconds); });

const sellHouse = (player: Player, tileID: number, requestId: string = randomUUID()) => (
  ack((cb) => player.socket.emit('sell house', { tileID, requestId }, cb))
);

const bundle = (cash = 0, ...propertyIds: number[]): TradeBundle => ({ cash, propertyIds, jailFreeCardIds: [] });

const makeOffer = (
  player: Player,
  recipient: Player,
  terms: { offered: TradeBundle; requested: TradeBundle },
  requestId: string = randomUUID(),
) => ack<MakeOfferResult>((cb) => player.socket.emit('make offer', {
  recipientPlayerId: recipient.playerId,
  ...terms,
  requestId,
}, cb));

describe('sell house idempotency', () => {
  const STREET = 1;
  const refund = Math.floor((tileState[STREET].houseCost ?? 0) / 2);

  async function ownerWithHouses(houses: number) {
    const game = await soloGame();
    const [owner] = game.players;
    await arrange(game.persistence, game.roomId, (state) => {
      state.boardState.ownedProps[STREET] = { id: owner.playerId, color: state.players[owner.playerId].color, houses };
      state.players[owner.playerId].accountBalance = 1_000;
    });
    return { ...game, owner };
  }

  const houses = async (persistence: Persistence, roomId: string): Promise<number | undefined> => (
    (await stored(persistence, roomId)).gameSnapshot.gameState.boardState.ownedProps[STREET]?.houses
  );
  const balance = async (persistence: Persistence, roomId: string, playerId: string): Promise<number> => (
    (await stored(persistence, roomId)).gameSnapshot.gameState.players[playerId].accountBalance
  );

  it('sells exactly one house, pays the refund and tells the other players', async () => {
    const { persistence, roomId, owner, players } = await ownerWithHouses(3);
    const watcherUpdates = collectUpdates(players[1]);

    okOf(await sellHouse(owner, STREET));

    expect(await houses(persistence, roomId)).toBe(2);
    expect(await balance(persistence, roomId, owner.playerId)).toBe(1_000 + refund);
    await settle();
    expect(watcherUpdates.at(-1)?.gameState.boardState.ownedProps[STREET]).toMatchObject({ houses: 2 });
  });

  it('answers a retransmitted request with the first outcome and sells nothing more', async () => {
    const { persistence, roomId, owner } = await ownerWithHouses(3);
    const requestId = randomUUID();

    okOf(await sellHouse(owner, STREET, requestId));
    okOf(await sellHouse(owner, STREET, requestId));
    okOf(await sellHouse(owner, STREET, requestId));

    expect(await houses(persistence, roomId)).toBe(2);
    expect(await balance(persistence, roomId, owner.playerId)).toBe(1_000 + refund);
    assertSupportedRoomSnapshot(await stored(persistence, roomId));
  });

  it('sells once when the same request arrives concurrently', async () => {
    const { persistence, roomId, owner } = await ownerWithHouses(3);
    const requestId = randomUUID();

    const answers = await Promise.all([
      sellHouse(owner, STREET, requestId),
      sellHouse(owner, STREET, requestId),
      sellHouse(owner, STREET, requestId),
    ]);

    answers.forEach((answer) => okOf(answer));
    expect(await houses(persistence, roomId)).toBe(2);
    expect(await balance(persistence, roomId, owner.playerId)).toBe(1_000 + refund);
  });

  it('still sells another house when the player legitimately asks again (a new request)', async () => {
    const { persistence, roomId, owner } = await ownerWithHouses(3);
    const first = randomUUID();

    okOf(await sellHouse(owner, STREET, first));
    okOf(await sellHouse(owner, STREET, randomUUID()));
    okOf(await sellHouse(owner, STREET, first)); // the first one retransmitted: nothing

    expect(await houses(persistence, roomId)).toBe(1);
    expect(await balance(persistence, roomId, owner.playerId)).toBe(1_000 + 2 * refund);
  });

  it('refuses a sale that is not valid, and does not remember the refused request', async () => {
    const { persistence, roomId, owner, players } = await ownerWithHouses(0);
    const requestId = randomUUID();

    expect(failureOf(await sellHouse(owner, STREET, requestId)).code).toBe('CONFLICT'); // no house to sell
    // Not the owner: refused as well, whoever sends it.
    expect(failureOf(await sellHouse(players[1], STREET)).code).toBe('CONFLICT');
    expect(await houses(persistence, roomId)).toBe(0);

    // The refusal was not recorded: once a house exists, the same request id sells it.
    await arrange(persistence, roomId, (state) => { state.boardState.ownedProps[STREET].houses = 2; });
    okOf(await sellHouse(owner, STREET, requestId));
    expect(await houses(persistence, roomId)).toBe(1);
  });

  it('never lets one player\'s request id answer for another player', async () => {
    const { persistence, roomId, owner, players } = await ownerWithHouses(2);
    const requestId = randomUUID();
    okOf(await sellHouse(owner, STREET, requestId));

    // Same id, different actor: it is a different request and fails on ownership, not as a replay.
    expect(failureOf(await sellHouse(players[1], STREET, requestId)).code).toBe('CONFLICT');
    expect(await houses(persistence, roomId)).toBe(1);
  });

  it('rejects a payload without a request id, a malformed id and the old bare tile number', async () => {
    const { persistence, roomId, owner } = await ownerWithHouses(2);
    const emit = (payload: unknown) => ack((cb) => owner.socket.emit('sell house', payload as never, cb as AckCallback));

    expect(failureOf(await emit({ tileID: STREET })).code).toBe('INVALID_REQUEST');
    expect(failureOf(await emit({ tileID: STREET, requestId: 'not-a-uuid' })).code).toBe('INVALID_REQUEST');
    expect(failureOf(await emit(STREET)).code).toBe('INVALID_REQUEST');
    expect(failureOf(await emit({ tileID: 99, requestId: randomUUID() })).code).toBe('INVALID_REQUEST');
    expect(await houses(persistence, roomId)).toBe(2);
  });
});

describe('make offer idempotency and decline guards', () => {
  const STREET = 1;

  /** Player 0 offers cash for player 1's street. */
  async function offerSetup() {
    const game = await soloGame();
    const [proposer, recipient, third] = game.players;
    await arrange(game.persistence, game.roomId, (state) => {
      state.boardState.ownedProps[STREET] = { id: recipient.playerId, color: state.players[recipient.playerId].color, houses: 0 };
      state.players[proposer.playerId].accountBalance = 1_000;
    });
    const terms = { offered: bundle(100), requested: bundle(0, STREET) };
    return { ...game, proposer, recipient, third, terms };
  }

  const pending = (persistence: Persistence, roomId: string) => persistence.tradeOffers.listPendingForRoom(roomId);

  it('creates one offer and delivers it once to the recipient', async () => {
    const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
    const received: PrivateOffer[] = [];
    recipient.socket.on('offer on prop', (offer) => received.push(offer));

    const result = dataOf(await makeOffer(proposer, recipient, terms));

    await settle();
    expect(await pending(persistence, roomId)).toHaveLength(1);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ offerId: result.offerId, proposerPlayerId: proposer.playerId });
  });

  it('answers a retransmitted request with the same offer and creates no second one', async () => {
    const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
    const received: PrivateOffer[] = [];
    recipient.socket.on('offer on prop', (offer) => received.push(offer));
    const requestId = randomUUID();

    const first = dataOf(await makeOffer(proposer, recipient, terms, requestId));
    const again = dataOf(await makeOffer(proposer, recipient, terms, requestId));

    expect(again).toEqual(first);
    await settle();
    expect(await pending(persistence, roomId)).toHaveLength(1);
    expect(received).toHaveLength(1);
  });

  it('creates one offer when the same request arrives concurrently', async () => {
    const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
    const requestId = randomUUID();

    const answers = await Promise.all([
      makeOffer(proposer, recipient, terms, requestId),
      makeOffer(proposer, recipient, terms, requestId),
      makeOffer(proposer, recipient, terms, requestId),
    ]);

    const offerIds = new Set(answers.map((answer) => dataOf(answer).offerId));
    expect(offerIds.size).toBe(1);
    expect(await pending(persistence, roomId)).toHaveLength(1);
  });

  it('keeps legitimate separate offers separate, even with identical terms', async () => {
    const { persistence, roomId, proposer, recipient, terms } = await offerSetup();

    const first = dataOf(await makeOffer(proposer, recipient, terms));
    const second = dataOf(await makeOffer(proposer, recipient, terms));

    expect(second.offerId).not.toBe(first.offerId);
    expect(await pending(persistence, roomId)).toHaveLength(2);
  });

  it('does not create a new offer for a retry after the first one was declined', async () => {
    const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
    const requestId = randomUUID();
    const first = dataOf(await makeOffer(proposer, recipient, terms, requestId));
    okOf(await ack((cb) => recipient.socket.emit('decline offer', { offerId: first.offerId }, cb)));

    const retry = dataOf(await makeOffer(proposer, recipient, terms, requestId));

    expect(retry.offerId).toBe(first.offerId);
    expect(await pending(persistence, roomId)).toHaveLength(0);
  });

  it('refuses an invalid offer and does not remember the refused request', async () => {
    const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
    const requestId = randomUUID();
    await arrange(persistence, roomId, (state) => { delete state.boardState.ownedProps[STREET]; });

    expect(failureOf(await makeOffer(proposer, recipient, terms, requestId)).code).toBe('CONFLICT');
    expect(await pending(persistence, roomId)).toHaveLength(0);

    await arrange(persistence, roomId, (state) => {
      state.boardState.ownedProps[STREET] = { id: recipient.playerId, color: state.players[recipient.playerId].color, houses: 0 };
    });
    okOf(await makeOffer(proposer, recipient, terms, requestId));
    expect(await pending(persistence, roomId)).toHaveLength(1);
  });

  it('rejects a payload without a valid request id', async () => {
    const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
    const emit = (payload: unknown) => ack((cb) => proposer.socket.emit('make offer', payload as never, cb as never));
    const base = { recipientPlayerId: recipient.playerId, ...terms };

    expect(failureOf(await emit(base)).code).toBe('INVALID_REQUEST');
    expect(failureOf(await emit({ ...base, requestId: 'nope' })).code).toBe('INVALID_REQUEST');
    expect(await pending(persistence, roomId)).toHaveLength(0);
  });

  describe('decline offer', () => {
    const decline = (player: Player, offerId: string) => ack((cb) => player.socket.emit('decline offer', { offerId }, cb));

    it('lets the recipient decline a live offer, tells both sides and resolves it once', async () => {
      const { persistence, proposer, recipient, terms } = await offerSetup();
      const offer = dataOf(await makeOffer(proposer, recipient, terms));
      const proposerHears = new Promise<unknown>((resolve) => { proposer.socket.once('offer declined', resolve); });

      okOf(await decline(recipient, offer.offerId));

      await expect(proposerHears).resolves.toMatchObject({ offerId: offer.offerId, status: 'DECLINED' });
      expect((await persistence.tradeOffers.findById(offer.offerId))?.status).toBe('DECLINED');
      // A repeated decline of an offer that is no longer pending changes nothing.
      expect(failureOf(await decline(recipient, offer.offerId)).code).toBe('CONFLICT');
    });

    it('refuses everyone but the recipient, and an unknown offer', async () => {
      const { persistence, proposer, recipient, third, terms } = await offerSetup();
      const offer = dataOf(await makeOffer(proposer, recipient, terms));

      expect(failureOf(await decline(proposer, offer.offerId)).code).toBe('FORBIDDEN');
      expect(failureOf(await decline(third, offer.offerId)).code).toBe('FORBIDDEN');
      expect(failureOf(await decline(recipient, randomUUID())).code).toBe('FORBIDDEN');
      expect((await persistence.tradeOffers.findById(offer.offerId))?.status).toBe('PENDING');
    });

    it('refuses an expired offer', async () => {
      const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
      const expired = await persistence.tradeOffers.create({
        id: randomUUID(),
        roomId,
        proposerPlayerId: proposer.playerId,
        recipientPlayerId: recipient.playerId,
        offered: terms.offered,
        requested: terms.requested,
        expiresAt: new Date(Date.now() + 60),
      });
      await settle(200); // the repository only creates offers that are still live: let this one run out

      expect(failureOf(await decline(recipient, expired.id)).code).toBe('CONFLICT');
      expect((await persistence.tradeOffers.findById(expired.id))?.status).toBe('PENDING');
    });

    it('refuses to decline once the room is no longer in progress, like accepting does', async () => {
      const { persistence, roomId, proposer, recipient, terms } = await offerSetup();
      const offer = dataOf(await makeOffer(proposer, recipient, terms));
      await arrange(persistence, roomId, (state, room) => {
        const winner = state.players[proposer.playerId];
        state.boardState.winner = {
          playerId: proposer.playerId, name: winner.name, color: winner.color, characterId: winner.characterId, teamId: winner.teamId,
        };
        room.status = 'FINISHED';
      });

      expect(failureOf(await decline(recipient, offer.offerId)).code).toBe('CONFLICT');
      expect(failureOf(await ack((cb) => recipient.socket.emit('accept offer', { offerId: offer.offerId }, cb))).code).toBe('CONFLICT');
    });

    it('rejects a malformed payload', async () => {
      const { recipient } = await offerSetup();
      const emit = (payload: unknown) => ack((cb) => recipient.socket.emit('decline offer', payload as never, cb as AckCallback));

      expect(failureOf(await emit({ offerId: 'nope' })).code).toBe('INVALID_REQUEST');
      expect(failureOf(await emit({})).code).toBe('INVALID_REQUEST');
    });
  });
});

describe('socket commands that had no coverage', () => {
  const STREET = 1;
  const price = tileState[STREET].price ?? 0;

  /** Players 0 (creditor, current turn), 1 (debtor) and 2 (buyer): the debtor is short by `amount` and owns the street. */
  async function shortfallGame(amount = 20) {
    const game = await soloGame();
    const [creditor, debtor, buyer, bystander] = game.players;
    const paymentOperationId = randomUUID();
    const claimId = randomUUID();
    const turnNumber = 5;
    await arrange(game.persistence, game.roomId, (state, room) => {
      state.boardState.players = game.players.map((player) => player.playerId);
      state.boardState.currentPlayer = { id: creditor.playerId, hasMoved: true };
      state.boardState.turnNumber = turnNumber;
      state.boardState.ownedProps = { [STREET]: { id: debtor.playerId, color: state.players[debtor.playerId].color, houses: 0 } };
      state.players[creditor.playerId].accountBalance = 1_500;
      state.players[debtor.playerId].accountBalance = 0;
      state.players[buyer.playerId].accountBalance = 1_500;
      state.turnInfo = {};
      const actionDeadlineAt = new Date(Date.now() + 120_000).toISOString();
      state.boardState.paymentQueue = {
        operationId: paymentOperationId,
        orderedClaims: [{
          claimId,
          debtorPlayerId: debtor.playerId,
          creditor: 'PLAYER',
          creditorPlayerId: creditor.playerId,
          amount,
          remainingAmount: amount,
          source: { kind: 'OTHER', description: 'socket coverage' },
          status: 'PENDING',
        }],
        activeClaimIndex: 0,
        continuation: { playerId: creditor.playerId, turnNumber },
        actionDeadlineAt,
        rescue: null,
      };
      room.nextActionAt = new Date(actionDeadlineAt);
    });
    return { ...game, creditor, debtor, buyer, bystander, paymentOperationId, claimId };
  }

  describe('sell property to bank', () => {
    const sell = (player: Player, request: unknown) => ack((cb) => player.socket.emit('sell property to bank', request as never, cb as AckCallback));

    it('lets the debtor settle the claim with a sale, once, and informs the room', async () => {
      const { persistence, roomId, creditor, debtor, buyer, paymentOperationId, claimId } = await shortfallGame(20);
      const updates = collectUpdates(buyer);
      const proceeds = Math.floor(price * 70 / 100);
      const request = { paymentOperationId, claimId, tileID: STREET };

      okOf(await sell(debtor, request));

      const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
      assertSupportedRoomSnapshot(await stored(persistence, roomId));
      expect(state.boardState.ownedProps[STREET]).toBeUndefined();
      expect(state.boardState.paymentQueue).toBeNull();
      expect(state.players[creditor.playerId].accountBalance).toBe(1_520);
      expect(state.players[debtor.playerId].accountBalance).toBe(proceeds - 20);
      await settle();
      expect(updates.at(-1)?.gameState.boardState.ownedProps[STREET]).toBeUndefined();
      // The same request again: the claim is gone, so nothing is sold or paid twice.
      expect(failureOf(await sell(debtor, request)).code).toBe('FORBIDDEN');
      expect((await stored(persistence, roomId)).gameSnapshot.gameState.players[creditor.playerId].accountBalance).toBe(1_520);
    });

    it('refuses everyone who is not the debtor, and a payload that is not valid', async () => {
      const { persistence, roomId, creditor, debtor, buyer, paymentOperationId, claimId } = await shortfallGame(20);
      const request = { paymentOperationId, claimId, tileID: STREET };

      expect(failureOf(await sell(creditor, request)).code).toBe('FORBIDDEN');
      expect(failureOf(await sell(buyer, request)).code).toBe('FORBIDDEN');
      expect(failureOf(await sell(debtor, { ...request, tileID: 77 })).code).toBe('INVALID_REQUEST');
      expect(failureOf(await sell(debtor, { ...request, claimId: 'nope' })).code).toBe('INVALID_REQUEST');
      expect(failureOf(await sell(debtor, { paymentOperationId })).code).toBe('INVALID_REQUEST');
      expect(failureOf(await sell(debtor, { ...request, claimId: randomUUID() })).code).toBe('CONFLICT');

      const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
      expect(state.boardState.ownedProps[STREET]).toMatchObject({ id: debtor.playerId });
      expect(state.boardState.paymentQueue).not.toBeNull();
    });

    it('refuses when nothing is owed', async () => {
      const { persistence, roomId, debtor, paymentOperationId, claimId } = await shortfallGame(20);
      await arrange(persistence, roomId, (state) => { state.boardState.paymentQueue = null; });

      expect(failureOf(await sell(debtor, { paymentOperationId, claimId, tileID: STREET })).code).toBe('FORBIDDEN');
    });
  });

  describe('reject forced sale', () => {
    const reject = (player: Player, request: unknown) => ack((cb) => player.socket.emit('reject forced sale', request as never, cb as AckCallback));

    async function withProposal() {
      const game = await shortfallGame(300);
      const proposalId = randomUUID();
      await arrange(game.persistence, game.roomId, (state, room) => {
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        state.privateState.forcedSaleProposal = {
          proposalId,
          paymentOperationId: game.paymentOperationId,
          claimId: game.claimId,
          sellerPlayerId: game.debtor.playerId,
          buyerPlayerId: game.buyer.playerId,
          tileID: STREET,
          grossPrice: 100,
          expectedHouses: 0,
          expiresAt,
        };
        room.nextActionAt = new Date(expiresAt);
      });
      return { ...game, proposalId };
    }

    it('lets the buyer reject: the proposal is cleared for both sides and nothing is sold', async () => {
      const { persistence, roomId, debtor, buyer, creditor, proposalId } = await withProposal();
      const cleared: string[] = [];
      debtor.socket.on('forced sale proposal', (proposal) => { if (proposal === null) cleared.push('seller'); });
      buyer.socket.on('forced sale proposal', (proposal) => { if (proposal === null) cleared.push('buyer'); });
      const creditorUpdates = collectUpdates(creditor);

      okOf(await reject(buyer, { proposalId }));

      const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
      expect(state.privateState.forcedSaleProposal).toBeNull();
      expect(state.boardState.ownedProps[STREET]).toMatchObject({ id: debtor.playerId });
      expect(state.players[buyer.playerId].accountBalance).toBe(1_500);
      expect(state.boardState.paymentQueue).not.toBeNull();
      await settle();
      expect(cleared.sort()).toEqual(['buyer', 'seller']);
      expect(creditorUpdates.length).toBeGreaterThan(0);
    });

    it('lets the seller withdraw too, and refuses a repeated or foreign rejection', async () => {
      const { persistence, roomId, debtor, buyer, creditor, bystander, proposalId } = await withProposal();

      expect(failureOf(await reject(creditor, { proposalId })).code).toBe('CONFLICT');
      expect(failureOf(await reject(bystander, { proposalId })).code).toBe('CONFLICT');
      expect((await stored(persistence, roomId)).gameSnapshot.gameState.privateState.forcedSaleProposal).not.toBeNull();

      okOf(await reject(debtor, { proposalId }));
      expect(failureOf(await reject(debtor, { proposalId })).code).toBe('CONFLICT');
      expect(failureOf(await reject(buyer, { proposalId })).code).toBe('CONFLICT');
    });

    it('refuses a wrong proposal id, an expired proposal and a malformed payload', async () => {
      const { persistence, roomId, buyer, proposalId } = await withProposal();

      expect(failureOf(await reject(buyer, { proposalId: randomUUID() })).code).toBe('CONFLICT');
      expect(failureOf(await reject(buyer, { proposalId: 'nope' })).code).toBe('INVALID_REQUEST');
      expect(failureOf(await reject(buyer, {})).code).toBe('INVALID_REQUEST');

      await arrange(persistence, roomId, (state) => {
        const proposal = state.privateState.forcedSaleProposal;
        if (proposal) proposal.expiresAt = new Date(Date.now() - 1_000).toISOString();
      });
      expect(failureOf(await reject(buyer, { proposalId })).code).toBe('CONFLICT');
    });
  });

  describe('do not buy', () => {
    const doNotBuy = (player: Player, request: unknown) => ack((cb) => player.socket.emit('do not buy', request as never, cb as AckCallback));

    async function landingDecision() {
      const game = await soloGame();
      const [current, next] = game.players;
      const operationId = randomUUID();
      await arrange(game.persistence, game.roomId, (state) => {
        const board = state.boardState;
        board.players = game.players.map((player) => player.playerId);
        board.currentPlayer = { id: current.playerId, hasMoved: true };
        board.ownedProps = {};
        board.paymentQueue = null;
        state.players[current.playerId].currentTile = STREET;
        state.players[current.playerId].accountBalance = 1_500;
        state.turnInfo = {
          pendingPropertyDecision: {
            operationId,
            playerId: current.playerId,
            tileID: STREET,
            continuation: { playerId: current.playerId, turnNumber: board.turnNumber },
          },
        };
      });
      return { ...game, current, next, operationId };
    }

    it('declines the purchase: no sale, no charge, the turn moves on and others are told', async () => {
      const { persistence, roomId, current, next, players, operationId } = await landingDecision();
      const updates = collectUpdates(players[2]);

      okOf(await doNotBuy(current, { operationId }));

      const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
      assertSupportedRoomSnapshot(await stored(persistence, roomId));
      expect(state.boardState.ownedProps[STREET]).toBeUndefined();
      expect(state.players[current.playerId].accountBalance).toBe(1_500);
      expect(state.turnInfo.pendingPropertyDecision).toBeUndefined();
      expect(state.boardState.currentPlayer.id).toBe(next.playerId);
      await settle();
      expect(updates.at(-1)?.gameState.boardState.currentPlayer.id).toBe(next.playerId);
    });

    it('refuses a repeated request, a wrong operation, another player and a malformed payload', async () => {
      const { persistence, roomId, current, next, operationId } = await landingDecision();

      expect(failureOf(await doNotBuy(next, { operationId })).code).toBe('CONFLICT'); // not the decider
      expect(failureOf(await doNotBuy(current, { operationId: randomUUID() })).code).toBe('CONFLICT');
      expect(failureOf(await doNotBuy(current, {})).code).toBe('INVALID_REQUEST');
      expect(failureOf(await doNotBuy(current, { operationId: 'nope' })).code).toBe('INVALID_REQUEST');
      expect((await stored(persistence, roomId)).gameSnapshot.gameState.turnInfo.pendingPropertyDecision).toBeDefined();

      okOf(await doNotBuy(current, { operationId }));
      expect(failureOf(await doNotBuy(current, { operationId })).code).toBe('CONFLICT');
      expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.currentPlayer.id).toBe(next.playerId);
    });
  });

  describe('wait in jail', () => {
    const waitInJail = (player: Player) => ack((cb) => player.socket.emit('wait in jail', cb));

    async function jailedTurn() {
      const game = await soloGame();
      const [jailed, next] = game.players;
      await arrange(game.persistence, game.roomId, (state) => {
        const board = state.boardState;
        board.players = game.players.map((player) => player.playerId);
        board.currentPlayer = { id: jailed.playerId, hasMoved: false };
        board.paymentQueue = null;
        state.turnInfo = {};
        state.players[jailed.playerId].isJail = true;
        state.players[jailed.playerId].currentTile = 10;
      });
      return { ...game, jailed, next };
    }

    it('spends the jailed player\'s turn waiting: they stay in jail, the turn moves on, others are told', async () => {
      const { persistence, roomId, jailed, next, players } = await jailedTurn();
      const updates = collectUpdates(players[2]);
      const turnBefore = (await stored(persistence, roomId)).gameSnapshot.gameState.boardState.turnNumber;

      okOf(await waitInJail(jailed));

      const room = await stored(persistence, roomId);
      assertSupportedRoomSnapshot(room);
      const state = room.gameSnapshot.gameState;
      expect(state.players[jailed.playerId].isJail).toBe(true);
      expect(state.boardState.currentPlayer.id).toBe(next.playerId);
      expect(state.boardState.turnNumber).toBe(turnBefore + 1);
      await settle();
      expect(updates.at(-1)?.gameState.boardState.currentPlayer.id).toBe(next.playerId);
    });

    it('refuses a repeated request, a player who is not jailed and a player whose turn it is not', async () => {
      const { persistence, roomId, jailed, next, players } = await jailedTurn();

      expect(failureOf(await waitInJail(next)).code).toBe('CONFLICT'); // not their turn
      expect(failureOf(await waitInJail(players[3])).code).toBe('CONFLICT');
      okOf(await waitInJail(jailed));
      expect(failureOf(await waitInJail(jailed)).code).toBe('CONFLICT'); // the turn already moved on
      // The next player is free, so waiting is not available to them either.
      expect(failureOf(await waitInJail(next)).code).toBe('CONFLICT');
      expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.currentPlayer.id).toBe(next.playerId);
    });

    it('refuses while a payment shortfall is open', async () => {
      const { persistence, roomId, jailed } = await jailedTurn();
      await arrange(persistence, roomId, (state) => {
        state.boardState.paymentQueue = {
          operationId: randomUUID(),
          orderedClaims: [{
            claimId: randomUUID(),
            debtorPlayerId: jailed.playerId,
            creditor: 'BANK',
            amount: 10,
            remainingAmount: 10,
            source: { kind: 'OTHER', description: 'socket coverage' },
            status: 'PENDING',
          }],
          activeClaimIndex: 0,
          continuation: { playerId: jailed.playerId, turnNumber: state.boardState.turnNumber },
          actionDeadlineAt: new Date(Date.now() + 120_000).toISOString(),
          rescue: null,
        };
      });

      expect(failureOf(await waitInJail(jailed)).code).toBe('CONFLICT');
    });
  });
});

