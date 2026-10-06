import { randomUUID } from 'node:crypto';

import {
  REVIVE_COST,
  REVIVE_STARTING_CASH,
  tileState,
  type AckCallback,
  type MakeOfferResult,
} from '@monopoly/shared';
import { describe, expect, it } from 'vitest';

import { calculateNextActionAt, type RoomSnapshot } from './rooms.js';
import { recoverRoomIfDue } from './services/deadlineScheduler.js';
import type { PersistenceStore } from './persistence/types.js';
import type { RoomRecord } from './persistence/types.js';
import {
  acceptRescue,
  ack,
  appearance,
  connect,
  declineRescue,
  develop,
  failureOf,
  leave,
  lobbyOfFour,
  mutateRoom,
  join,
  okOf,
  playAgain,
  readyEveryone,
  ready,
  resume,
  revive,
  setMode,
  setTeamColor,
  setTeamName,
  start,
  startedTeamGame,
  startServer,
  stored,
  swapTeam,
  useHarnessCleanup,
} from './testing/teamHarness.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';

useHarnessCleanup();

describe('2v2 lobby', () => {
  it('balances joiners across the teams and starts every room as Solo with default teams', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    const room = (await stored(persistence, roomId));
    const projected = players[3].room;
    expect(room.gameSnapshot.gameState.boardState.gameMode).toBe('SOLO');
    expect(Object.values(room.gameSnapshot.gameState.players).map((player) => player.teamId))
      .toEqual(['TEAM_1', 'TEAM_2', 'TEAM_1', 'TEAM_2']);
    expect(projected.gameState.boardState.teams.map((team) => team.name)).toEqual(['Team 1', 'Team 2']);
  });

  it('lets only the host switch the mode, only in the lobby, and resets every Ready on a real change', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    await readyEveryone(players);
    expect(failureOf(await setMode(players[1].socket, 'TEAM_2V2')).code).toBe('FORBIDDEN');

    // Choosing the mode that is already active changes nothing and keeps Ready.
    okOf(await setMode(players[0].socket, 'SOLO'));
    expect(Object.values((await stored(persistence, roomId)).gameSnapshot.members).every((member) => member.ready)).toBe(true);

    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.gameMode).toBe('TEAM_2V2');
    expect(Object.values(room.gameSnapshot.members).every((member) => !member.ready)).toBe(true);

    okOf(await setMode(players[0].socket, 'SOLO'));
    expect(Object.values((await stored(persistence, roomId)).gameSnapshot.members).every((member) => !member.ready)).toBe(true);

    await readyEveryone(players);
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    okOf(await ready(players[0].socket));
    okOf(await ready(players[1].socket));
    okOf(await ready(players[2].socket));
    okOf(await ready(players[3].socket));
    okOf(await start(players[0].socket));
    expect(failureOf(await setMode(players[0].socket, 'SOLO')).code).toBe('CONFLICT'); // the game has started
  });

  it('dresses every player in their team colour when the mode becomes 2v2', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    const colors = Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => [id, player.color]),
    );
    expect(colors[players[0].playerId]).toBe('red');
    expect(colors[players[2].playerId]).toBe('red');
    expect(colors[players[1].playerId]).toBe('blue');
    expect(colors[players[3].playerId]).toBe('blue');
  });

  it('clears the later joiner\'s mascot when two teammates had picked the same one in Solo', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await appearance(players[0].socket, { characterId: 'dog' }));
    okOf(await appearance(players[2].socket, { characterId: 'dog', color: 'green' })); // Solo: same mascot, other colour
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    expect(state.players[players[0].playerId].characterId).toBe('dog'); // the earlier joiner keeps it
    expect(state.players[players[2].playerId].characterId).toBeNull();
  });

  it('keeps the team controls for 2v2 only', async () => {
    const { players } = await lobbyOfFour();
    expect(failureOf(await setTeamColor(players[0].socket, 'green')).code).toBe('CONFLICT');
    expect(failureOf(await setTeamName(players[0].socket, 'TEAM_1', 'Rồng')).code).toBe('CONFLICT');
    expect(failureOf(await swapTeam(players[0].socket, players[0].playerId, players[1].playerId)).code).toBe('CONFLICT');
  });

  it('lets any member recolour only their own team, rejects the other team\'s colour, and resets only that team\'s Ready', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    await readyEveryone(players);

    // Alex (Team 1, not the host) recolours Team 1.
    okOf(await setTeamColor(players[2].socket, 'green'));
    let room = await stored(persistence, roomId);
    const state = room.gameSnapshot.gameState;
    expect(state.boardState.teams.TEAM_1.color).toBe('green');
    expect(state.players[players[0].playerId].color).toBe('green');
    expect(state.players[players[2].playerId].color).toBe('green');
    expect(state.players[players[1].playerId].color).toBe('blue');
    expect(room.gameSnapshot.members[players[0].playerId].ready).toBe(false);
    expect(room.gameSnapshot.members[players[2].playerId].ready).toBe(false);
    expect(room.gameSnapshot.members[players[1].playerId].ready).toBe(true);
    expect(room.gameSnapshot.members[players[3].playerId].ready).toBe(true);

    // The other team's colour is refused, from either side, and nothing changes.
    expect(failureOf(await setTeamColor(players[0].socket, 'blue')).code).toBe('CONFLICT');
    expect(failureOf(await setTeamColor(players[1].socket, 'green')).code).toBe('CONFLICT');
    room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.teams.TEAM_2.color).toBe('blue');
    expect(room.gameSnapshot.members[players[1].playerId].ready).toBe(true);

    // Re-choosing the colour a team already has changes nothing (no Ready reset).
    okOf(await ready(players[0].socket));
    okOf(await setTeamColor(players[2].socket, 'green'));
    expect((await stored(persistence, roomId)).gameSnapshot.members[players[0].playerId].ready).toBe(true);
  });

  it('resolves two concurrent colour choices through the room command order: exactly one team wins the colour', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    const [first, second] = await Promise.all([
      setTeamColor(players[0].socket, 'purple'),
      setTeamColor(players[1].socket, 'purple'),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const { teams } = (await stored(persistence, roomId)).gameSnapshot.gameState.boardState;
    expect(teams.TEAM_1.color === teams.TEAM_2.color).toBe(false);
    expect([teams.TEAM_1.color, teams.TEAM_2.color]).toContain('purple');
  });

  it('lets only the host rename a team, sanitizes the name and never resets Ready', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    await readyEveryone(players);

    expect(failureOf(await setTeamName(players[1].socket, 'TEAM_2', 'Hổ')).code).toBe('FORBIDDEN');
    okOf(await setTeamName(players[0].socket, 'TEAM_2', '  <b>Hổ</b> "Vàng"  '));
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.teams.TEAM_2.name).toBe('bHổ/b Vàng');
    expect(Object.values(room.gameSnapshot.members).every((member) => member.ready)).toBe(true);

    expect(failureOf(await setTeamName(players[0].socket, 'TEAM_1', 'x'.repeat(21))).code).toBe('INVALID_REQUEST');
    expect(failureOf(await setTeamName(players[0].socket, 'TEAM_1', '   ')).code).toBe('INVALID_REQUEST');
    expect(failureOf(await setTeamName(players[0].socket, 'TEAM_1', '<>')).code).toBe('INVALID_REQUEST');
    okOf(await setTeamName(players[0].socket, 'TEAM_1', 'x'.repeat(20)));
  });

  it('lets only the host swap two players, applies the new team colour, and resets just those two Ready', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    await readyEveryone(players);

    expect(failureOf(await swapTeam(players[1].socket, players[0].playerId, players[1].playerId)).code).toBe('FORBIDDEN');
    expect(failureOf(await swapTeam(players[0].socket, players[0].playerId, players[2].playerId)).code).toBe('CONFLICT'); // same team
    expect(failureOf(await swapTeam(players[0].socket, players[0].playerId, randomUUID())).code).toBe('CONFLICT');

    // Harvey (Team 1) and Nora (Team 2) trade places.
    okOf(await swapTeam(players[0].socket, players[0].playerId, players[1].playerId));
    const room = await stored(persistence, roomId);
    const state = room.gameSnapshot.gameState;
    expect(state.players[players[0].playerId]).toMatchObject({ teamId: 'TEAM_2', color: 'blue', characterId: 'dog' });
    expect(state.players[players[1].playerId]).toMatchObject({ teamId: 'TEAM_1', color: 'red', characterId: 'dog' });
    expect(room.gameSnapshot.members[players[0].playerId].ready).toBe(false);
    expect(room.gameSnapshot.members[players[1].playerId].ready).toBe(false);
    expect(room.gameSnapshot.members[players[2].playerId].ready).toBe(true);
    expect(room.gameSnapshot.members[players[3].playerId].ready).toBe(true);
  });

  it('keeps a swapped player\'s mascot when it is still valid and clears it when it clashes with the new teammate', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    // Team 1: Harvey dog + Alex cat; Team 2: Nora cat + Zed panda. Swapping Harvey with Nora puts Nora (cat) next to Alex (cat).
    okOf(await appearance(players[0].socket, { characterId: 'dog' }));
    okOf(await appearance(players[2].socket, { characterId: 'cat' }));
    okOf(await appearance(players[1].socket, { characterId: 'cat' }));
    okOf(await appearance(players[3].socket, { characterId: 'panda' }));
    okOf(await swapTeam(players[0].socket, players[0].playerId, players[1].playerId));
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    expect(state.players[players[0].playerId].characterId).toBe('dog'); // joined Zed (panda): still valid
    expect(state.players[players[1].playerId].characterId).toBeNull(); // clashed with Alex, who stayed
    expect(state.players[players[2].playerId].characterId).toBe('cat');
  });

  it('refuses a colour choice and a teammate\'s mascot in 2v2, but allows the same mascot on the other team', async () => {
    const { players } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    okOf(await appearance(players[0].socket, { characterId: 'dog' }));
    expect(failureOf(await appearance(players[0].socket, { color: 'green' })).code).toBe('CONFLICT');
    expect(failureOf(await appearance(players[0].socket, { characterId: 'cat', color: 'green' })).code).toBe('CONFLICT');
    expect(failureOf(await appearance(players[2].socket, { characterId: 'dog' })).code).toBe('CONFLICT'); // Harvey's teammate
    okOf(await appearance(players[1].socket, { characterId: 'dog' })); // the opposing team may use it
    okOf(await appearance(players[2].socket, { characterId: 'cat' }));
  });

  it('keeps Solo appearance behaviour: personal colours, and a duplicate mascot with another colour is fine', async () => {
    const { players } = await lobbyOfFour();
    okOf(await appearance(players[0].socket, { characterId: 'dog', color: 'green' }));
    okOf(await appearance(players[2].socket, { characterId: 'dog', color: 'yellow' }));
    expect(failureOf(await appearance(players[1].socket, { characterId: 'dog', color: 'green' })).code).toBe('CONFLICT');
  });

  it('starts only with exactly four players, exactly two per team, ready and with mascots', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    await readyEveryone(players);

    // A distribution that is not 2v2 (3 vs 1) can be configured but not started.
    await mutateRoom(persistence, roomId, (room) => {
      const { players: seated, boardState } = room.gameSnapshot.gameState;
      seated[players[1].playerId].teamId = 'TEAM_1';
      seated[players[1].playerId].color = boardState.teams.TEAM_1.color;
    });
    const uneven = failureOf(await start(players[0].socket));
    expect(uneven.code).toBe('CONFLICT');
    expect(uneven.message).toContain('2');

    // Fixing the split makes it startable.
    await mutateRoom(persistence, roomId, (room) => {
      const { players: seated, boardState } = room.gameSnapshot.gameState;
      seated[players[1].playerId].teamId = 'TEAM_2';
      seated[players[1].playerId].color = boardState.teams.TEAM_2.color;
    });
    okOf(await start(players[0].socket));
    const room = await stored(persistence, roomId);
    expect(room.status).toBe('IN_PROGRESS');
    const { boardState } = room.gameSnapshot.gameState;
    const teams = boardState.teamPlay.slotOrder.map((id) => room.gameSnapshot.gameState.players[id].teamId);
    expect(teams[0]).not.toBe(teams[1]);
    expect(teams[0]).toBe(teams[2]);
    expect(teams[1]).toBe(teams[3]);
    expect(boardState.players).toEqual(boardState.teamPlay.slotOrder);
    expect(boardState.currentPlayer.id).toBe(boardState.teamPlay.slotOrder[0]);
  });

  it('refuses to start 2v2 with fewer than four players', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    const host = await join(await connect(subject.url), 'Host', 'TEAMS-SMALL');
    const guest = await join(await connect(subject.url), 'Guest', 'TEAMS-SMALL');
    okOf(await setMode(host.socket, 'TEAM_2V2'));
    okOf(await appearance(host.socket, { characterId: 'dog' }));
    okOf(await appearance(guest.socket, { characterId: 'cat' }));
    okOf(await ready(host.socket));
    okOf(await ready(guest.socket));
    expect(failureOf(await start(host.socket)).code).toBe('CONFLICT');
  });

  it('refuses to start when a team is missing a player even with four seated (one team of one)', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    okOf(await setMode(players[0].socket, 'TEAM_2V2'));
    await readyEveryone(players);
    await mutateRoom(persistence, roomId, (room) => {
      const state = room.gameSnapshot.gameState;
      for (const index of [1, 3]) {
        state.players[players[index].playerId].teamId = 'TEAM_1';
        state.players[players[index].playerId].color = state.boardState.teams.TEAM_1.color;
      }
    });
    expect(failureOf(await start(players[0].socket)).code).toBe('CONFLICT');
  });
});

describe('2v2 match', () => {
  /** Puts the room into a chosen position: turn, cash and properties, all through the durable store. */
  async function arrange(
    persistence: PersistenceStore<RoomSnapshot>,
    roomId: string,
    change: (state: RoomSnapshot['gameState'], members: RoomSnapshot['members'], room: RoomRecord<RoomSnapshot>) => void,
  ): Promise<void> {
    await mutateRoom(persistence, roomId, (room) => {
      change(room.gameSnapshot.gameState, room.gameSnapshot.members, room);
    });
  }

  it('alternates the teams in the persisted turn order from the first turn', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    const order = state.boardState.players;
    expect(order).toHaveLength(4);
    for (let index = 0; index < 4; index += 1) {
      expect(state.players[order[index]].teamId).not.toBe(state.players[order[(index + 1) % 4]].teamId);
    }
    expect(new Set(order)).toEqual(new Set(players.map((player) => player.playerId)));
    expect(state.boardState.winner).toBeNull();
  });

  it('Team Investment: a teammate who lands on your street pays for the development, you keep the property', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, , alex] = players;
    const operationId = randomUUID();
    await arrange(persistence, roomId, (state) => {
      state.boardState.currentPlayer = { id: alex.playerId, hasMoved: true };
      state.boardState.turnNumber = 7;
      state.boardState.ownedProps = { 1: { id: harvey.playerId, color: 'red', houses: 1 } };
      state.players[alex.playerId].currentTile = 1;
      state.players[alex.playerId].accountBalance = 400;
      state.players[harvey.playerId].accountBalance = 1000;
      state.turnInfo = {
        pendingDevelopmentDecision: {
          operationId,
          playerId: alex.playerId,
          turnNumber: 7,
          tileID: 1,
          levelAtLanding: 1,
          kind: 'HOUSES',
          continuation: { playerId: alex.playerId, turnNumber: 7 },
        },
      };
    });

    // The owner cannot answer a decision that is not theirs.
    expect(failureOf(await develop(harvey.socket, { operationId, action: 'BUILD_HOUSES', quantity: 1 })).code).toBe('CONFLICT');
    // The lander cannot spend what they do not have, and nothing is pooled from the owner.
    expect(failureOf(await develop(alex.socket, { operationId, action: 'BUILD_HOUSES', quantity: 4 })).code).toBe('CONFLICT');
    expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.ownedProps[1].houses).toBe(1);

    okOf(await develop(alex.socket, { operationId, action: 'BUILD_HOUSES', quantity: 3 }));
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    const cost = 3 * (tileState[1].houseCost ?? 0);
    expect(state.players[alex.playerId].accountBalance).toBe(400 - cost);
    expect(state.players[harvey.playerId].accountBalance).toBe(1000); // the owner contributes nothing and receives nothing
    expect(state.boardState.ownedProps[1]).toMatchObject({ id: harvey.playerId, houses: 4 });
    expect(state.turnInfo.pendingDevelopmentDecision).toBeUndefined();
    const event = state.boardState.activityFeed.events.find((candidate) => candidate.type === 'PROPERTY_DEVELOPMENT');
    expect(event).toMatchObject({
      playerId: alex.playerId, ownerPlayerId: harvey.playerId, ownerName: 'Harvey', action: 'BUILD', cost,
    });
    const transfer = state.boardState.gameplayEvents.events.find(
      (candidate) => candidate.type === 'MONEY_TRANSFER' && candidate.reason === 'DEVELOPMENT',
    );
    expect(transfer).toMatchObject({ source: { kind: 'PLAYER', playerId: alex.playerId }, destination: { kind: 'BANK' } });
  });

  it('Team Investment never lets an opponent answer a development decision that belongs to a teammate pair', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, nora, alex] = players;
    const operationId = randomUUID();
    await arrange(persistence, roomId, (state) => {
      state.boardState.currentPlayer = { id: alex.playerId, hasMoved: true };
      state.boardState.turnNumber = 7;
      state.boardState.ownedProps = { 1: { id: harvey.playerId, color: 'red', houses: 0 } };
      state.players[alex.playerId].currentTile = 1;
      state.turnInfo = {
        pendingDevelopmentDecision: {
          operationId, playerId: alex.playerId, turnNumber: 7, tileID: 1, levelAtLanding: 0, kind: 'HOUSES',
          continuation: { playerId: alex.playerId, turnNumber: 7 },
        },
      };
    });
    // Neither the opposing team nor the property's owner can spend on the lander's behalf.
    expect(failureOf(await develop(nora.socket, { operationId, action: 'BUILD_HOUSES', quantity: 1 })).code).toBe('CONFLICT');
    expect(failureOf(await develop(harvey.socket, { operationId, action: 'BUILD_HOUSES', quantity: 1 })).code).toBe('CONFLICT');
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    expect(state.boardState.ownedProps[1].houses).toBe(0);
    expect(state.players[nora.playerId].accountBalance).toBe(1500);
    expect(state.players[harvey.playerId].accountBalance).toBe(1500);
  });

  it('revives a bankrupt teammate: 750K to the Bank, 300K back at the start, window closed, membership active again', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, nora, alex] = players;
    await arrange(persistence, roomId, (state, members) => {
      const finished = { ...state.players[alex.playerId] };
      state.boardState.finishedPlayers[alex.playerId] = {
        name: finished.name, color: finished.color, characterId: finished.characterId, teamId: finished.teamId,
        reason: 'BANKRUPT', accountBalance: 0,
      };
      delete state.players[alex.playerId];
      members[alex.playerId].membershipStatus = 'FINISHED';
      members[alex.playerId].ready = false;
      state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
      state.boardState.teamPlay.reviveWindows = [{
        playerId: alex.playerId, teamId: 'TEAM_1', turnsRemaining: 3, openedAtTurnNumber: 2,
      }];
      state.boardState.currentPlayer = { id: harvey.playerId, hasMoved: false };
      state.boardState.turnNumber = 5;
      state.turnInfo = {};
      state.players[harvey.playerId].accountBalance = 1000;
    });

    // Not the survivor, not on an opponent's turn.
    expect(failureOf(await revive(nora.socket)).code).toBe('CONFLICT');
    expect(failureOf(await revive(alex.socket)).code).toBe('FORBIDDEN'); // the eliminated player cannot revive anyone

    okOf(await revive(harvey.socket));
    const room = await stored(persistence, roomId);
    const state = room.gameSnapshot.gameState;
    expect(state.players[harvey.playerId].accountBalance).toBe(1000 - REVIVE_COST);
    expect(state.players[alex.playerId]).toMatchObject({
      accountBalance: REVIVE_STARTING_CASH, currentTile: 0, isJail: false, heldJailFreeCardIds: [], teamId: 'TEAM_1',
    });
    expect(state.boardState.finishedPlayers[alex.playerId]).toBeUndefined();
    expect(state.boardState.teamPlay).toMatchObject({ revivedPlayerIds: [alex.playerId], reviveWindows: [] });
    expect(room.gameSnapshot.members[alex.playerId].membershipStatus).toBe('ACTIVE');
    expect(state.boardState.currentPlayer.id).toBe(harvey.playerId); // no bonus turn

    // Once is enough: nothing left to revive.
    expect(failureOf(await revive(harvey.socket)).code).toBe('CONFLICT');

    // The revived player is a full player again: they can use gameplay commands that require being in the game.
    expect(failureOf(await ack((cb) => alex.socket.emit('roll dice', cb))).code).toBe('FORBIDDEN'); // not their turn
  });

  it('refuses a revive the survivor cannot afford, with a Vietnamese reason, and changes nothing', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, , alex] = players;
    await arrange(persistence, roomId, (state, members) => {
      state.boardState.finishedPlayers[alex.playerId] = {
        name: 'Alex', color: 'red', characterId: 'cat', teamId: 'TEAM_1', reason: 'BANKRUPT', accountBalance: 0,
      };
      delete state.players[alex.playerId];
      members[alex.playerId].membershipStatus = 'FINISHED';
      state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
      state.boardState.teamPlay.reviveWindows = [{
        playerId: alex.playerId, teamId: 'TEAM_1', turnsRemaining: 3, openedAtTurnNumber: 2,
      }];
      state.boardState.currentPlayer = { id: harvey.playerId, hasMoved: false };
      state.boardState.turnNumber = 5;
      state.players[harvey.playerId].accountBalance = REVIVE_COST - 1;
    });
    const error = failureOf(await revive(harvey.socket));
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toMatch(/hồi sinh/);
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    expect(state.players[harvey.playerId].accountBalance).toBe(REVIVE_COST - 1);
    expect(state.boardState.teamPlay.reviveWindows).toHaveLength(1);
  });

  it('lets the eliminated, still-revivable player stay connected and chat, but not act', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, , alex] = players;
    await arrange(persistence, roomId, (state, members) => {
      state.boardState.finishedPlayers[alex.playerId] = {
        name: 'Alex', color: 'red', characterId: 'cat', teamId: 'TEAM_1', reason: 'BANKRUPT', accountBalance: 0,
      };
      delete state.players[alex.playerId];
      members[alex.playerId].membershipStatus = 'FINISHED';
      state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
      state.boardState.teamPlay.reviveWindows = [{
        playerId: alex.playerId, teamId: 'TEAM_1', turnsRemaining: 2, openedAtTurnNumber: 2,
      }];
      state.boardState.currentPlayer = { id: harvey.playerId, hasMoved: false };
      state.boardState.turnNumber = 5;
    });
    okOf(await ack((cb) => alex.socket.emit('send chat', 'Cố lên!', cb)));
    for (const request of [
      (cb: AckCallback) => alex.socket.emit('roll dice', cb),
      (cb: AckCallback) => alex.socket.emit('sell house', 1, cb),
      (cb: AckCallback) => alex.socket.emit('pay bail', cb),
      (cb: AckCallback) => alex.socket.emit('revive teammate', cb),
      (cb: AckCallback) => alex.socket.emit('accept rescue', { rescueId: randomUUID() }, cb),
    ]) {
      expect((await ack(request)).ok).toBe(false);
    }
    const offer = await ack<MakeOfferResult>((cb) => alex.socket.emit('make offer', {
      recipientPlayerId: harvey.playerId,
      offered: { cash: 1, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [], jailFreeCardIds: [] },
    }, cb));
    expect(offer.ok).toBe(false);
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.activityFeed.events.some((event) => event.type === 'CHAT')).toBe(true);
  });

  /** Debtor Nora (Team 2) owes the Bank `amount`, owns nothing and has no cash; Zed is her teammate. */
  async function rescueScenario(amount: number, rescuerCash: number) {
    const lobby = await startedTeamGame();
    const [harvey, nora, , zed] = lobby.players;
    const operationId = randomUUID();
    const claimId = randomUUID();
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    await arrange(lobby.persistence, lobby.roomId, (state, _members, room) => {
      room.nextActionAt = new Date(expiresAt);
      state.boardState.currentPlayer = { id: nora.playerId, hasMoved: true };
      state.boardState.turnNumber = 6;
      state.boardState.ownedProps = {};
      state.turnInfo = {};
      state.players[nora.playerId].accountBalance = 0;
      state.players[zed.playerId].accountBalance = rescuerCash;
      state.players[harvey.playerId].accountBalance = 1500;
      state.boardState.paymentQueue = {
        operationId,
        orderedClaims: [{
          claimId, debtorPlayerId: nora.playerId, creditor: 'PLAYER', creditorPlayerId: harvey.playerId,
          amount, remainingAmount: amount, source: { kind: 'OTHER', description: 'rescue scenario' }, status: 'PENDING',
        }],
        activeClaimIndex: 0,
        continuation: { playerId: nora.playerId, turnNumber: 6 },
        actionDeadlineAt: expiresAt,
        rescue: {
          rescueId: randomUUID(), debtorPlayerId: nora.playerId, rescuerPlayerId: zed.playerId, amount, expiresAt,
        },
      };
    });
    const room = await stored(lobby.persistence, lobby.roomId);
    return { ...lobby, harvey, nora, zed, expiresAt, rescueId: room.gameSnapshot.gameState.boardState.paymentQueue!.rescue!.rescueId };
  }

  it('Emergency Rescue: the offered teammate pays the creditor directly, the debtor wallet never changes, the turn continues', async () => {
    const { harvey, nora, zed, persistence, roomId, rescueId } = await rescueScenario(250, 300);
    const publicBefore = (await stored(persistence, roomId));
    expect(publicBefore.gameSnapshot.gameState.boardState.paymentQueue?.rescue?.rescuerPlayerId).toBe(zed.playerId);

    // Only the offered teammate can answer, and only for the real offer.
    expect(failureOf(await acceptRescue(harvey.socket, rescueId)).code).toBe('CONFLICT');
    expect(failureOf(await acceptRescue(nora.socket, rescueId)).code).toBe('CONFLICT');
    expect(failureOf(await acceptRescue(zed.socket, randomUUID())).code).toBe('CONFLICT');

    okOf(await acceptRescue(zed.socket, rescueId));
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    expect(state.players[zed.playerId].accountBalance).toBe(50);
    expect(state.players[harvey.playerId].accountBalance).toBe(1750);
    expect(state.players[nora.playerId].accountBalance).toBe(0);
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.boardState.currentPlayer.id).not.toBe(nora.playerId); // the interrupted turn completed
    expect(state.boardState.activityFeed.events.some(
      (event) => event.type === 'EMERGENCY_RESCUE' && event.action === 'ACCEPTED' && event.amount === 250,
    )).toBe(true);
  });

  it('Emergency Rescue: declining continues into the normal bankruptcy, and the teammate may then revive', async () => {
    const { nora, zed, persistence, roomId, rescueId } = await rescueScenario(250, 300);
    okOf(await declineRescue(zed.socket, rescueId));
    const room = await stored(persistence, roomId);
    const state = room.gameSnapshot.gameState;
    expect(state.players[nora.playerId]).toBeUndefined();
    expect(state.boardState.finishedPlayers[nora.playerId].reason).toBe('BANKRUPT');
    expect(state.players[zed.playerId].accountBalance).toBe(300);
    expect(room.gameSnapshot.members[nora.playerId].membershipStatus).toBe('FINISHED');
    expect(state.boardState.teamPlay.reviveWindows[0]).toMatchObject({ playerId: nora.playerId, turnsRemaining: 3 });
  });

  it('Emergency Rescue: an unanswered offer expires into the same bankruptcy without any client action', async () => {
    const { subject, nora, persistence, roomId, expiresAt } = await rescueScenario(250, 300);
    const room = await stored(persistence, roomId);
    expect(calculateNextActionAt(room.gameSnapshot)?.toISOString()).toBe(expiresAt); // the one durable deadline drives recovery
    await recoverRoomIfDue(subject.io, subject.runtime, roomId, new Date(Date.parse(expiresAt) + 1));
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.boardState.finishedPlayers[nora.playerId].reason).toBe('BANKRUPT');
    expect(state.boardState.activityFeed.events.some(
      (event) => event.type === 'EMERGENCY_RESCUE' && event.action === 'EXPIRED',
    )).toBe(true);
  });

  it('survives a server restart in the middle of a rescue offer and a revive window', async () => {
    const { subject, persistence, roomId, rescueId, zed, harvey } = await rescueScenario(250, 300);
    await subject.close();

    const restarted = await startServer(persistence);
    const resumedZed = await resume(await connect(restarted.url), zed.token);
    expect(resumedZed.room.gameState.boardState.paymentShortfall?.rescue).toMatchObject({
      rescueId, rescuerPlayerId: zed.playerId, amount: 250,
    });
    const resumedHarvey = await resume(await connect(restarted.url), harvey.token);
    expect(resumedHarvey.room.gameState.boardState.gameMode).toBe('TEAM_2V2');

    // The restored offer can still be answered on the new server.
    const socket = await connect(restarted.url);
    await resume(socket, zed.token);
    okOf(await acceptRescue(socket, rescueId));
    expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.paymentQueue).toBeNull();
  });

  it('a bankrupt member who explicitly leaves can never be revived, and the survivor plays on', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, , alex] = players;
    await arrange(persistence, roomId, (state, members) => {
      state.boardState.finishedPlayers[alex.playerId] = {
        name: 'Alex', color: 'red', characterId: 'cat', teamId: 'TEAM_1', reason: 'BANKRUPT', accountBalance: 0,
      };
      delete state.players[alex.playerId];
      members[alex.playerId].membershipStatus = 'FINISHED';
      state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
      state.boardState.teamPlay.reviveWindows = [{
        playerId: alex.playerId, teamId: 'TEAM_1', turnsRemaining: 3, openedAtTurnNumber: 2,
      }];
      state.boardState.currentPlayer = { id: harvey.playerId, hasMoved: false };
      state.boardState.turnNumber = 5;
    });
    okOf(await leave(alex.socket));
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(room.gameSnapshot.members[alex.playerId].membershipStatus).toBe('LEFT');
    expect(room.status).toBe('IN_PROGRESS');
    expect(failureOf(await revive(harvey.socket)).code).toBe('CONFLICT');
  });

  it('an explicit leave never opens a revive window, and the last member of a team leaving ends the game for the other team', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, nora, alex, zed] = players;
    okOf(await leave(alex.socket));
    let room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(room.gameSnapshot.gameState.boardState.finishedPlayers[alex.playerId].reason).toBe('LEFT');
    expect(room.status).toBe('IN_PROGRESS');

    okOf(await leave(nora.socket));
    okOf(await leave(zed.socket));
    room = await stored(persistence, roomId);
    expect(room.status).toBe('FINISHED');
    expect(room.gameSnapshot.gameState.boardState.winningTeamId).toBe('TEAM_1');
    expect(room.gameSnapshot.gameState.boardState.winner?.playerId).toBe(harvey.playerId);
  });

  it('team win, then Play Again keeps the lobby setup, resets the match and lets the host switch the mode', async () => {
    const { players, persistence, roomId } = await startedTeamGame();
    const [harvey, nora, alex, zed] = players;
    // Team 2 leaves: Team 1 wins immediately (Alex stays an active member).
    okOf(await leave(nora.socket));
    okOf(await leave(zed.socket));
    const finished = await stored(persistence, roomId);
    expect(finished.status).toBe('FINISHED');
    expect(finished.gameSnapshot.gameState.boardState.winningTeamId).toBe('TEAM_1');

    okOf(await playAgain(harvey.socket));
    const lobby = await stored(persistence, roomId);
    const { boardState, players: seated } = lobby.gameSnapshot.gameState;
    expect(lobby.status).toBe('LOBBY');
    expect(boardState.gameMode).toBe('TEAM_2V2');
    expect(boardState.teams.TEAM_1.color).toBe('red');
    expect(boardState.teams.TEAM_2.color).toBe('blue');
    expect(boardState.winner).toBeNull();
    expect(boardState.winningTeamId).toBeNull();
    expect(boardState.teamPlay).toEqual({ slotOrder: [], revivedPlayerIds: [], reviveWindows: [] });
    expect(Object.keys(seated).sort()).toEqual([harvey.playerId, alex.playerId].sort());
    expect(seated[harvey.playerId]).toMatchObject({ teamId: 'TEAM_1', color: 'red', accountBalance: 1500, currentTile: 0 });
    expect(seated[alex.playerId]).toMatchObject({ teamId: 'TEAM_1', color: 'red', characterId: 'cat' });
    expect(Object.values(lobby.gameSnapshot.members).every((member) => !member.ready)).toBe(true);

    okOf(await setMode(harvey.socket, 'SOLO'));
    expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.gameMode).toBe('SOLO');
  });

  it('Play Again preserves team names, colours and assignments, and clears revive state', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    const [harvey, nora, alex, zed] = players;
    okOf(await setMode(harvey.socket, 'TEAM_2V2'));
    okOf(await setTeamName(harvey.socket, 'TEAM_1', 'Rồng'));
    okOf(await setTeamName(harvey.socket, 'TEAM_2', 'Hổ'));
    okOf(await setTeamColor(alex.socket, 'green'));
    await readyEveryone(players); // mascots: Harvey dog, Nora dog (other team), Alex cat, Zed panda
    // Alex and Nora trade places: Nora (dog) now sits next to Harvey (dog), so her mascot is cleared; Alex keeps cat.
    okOf(await swapTeam(harvey.socket, alex.playerId, nora.playerId));
    okOf(await appearance(nora.socket, { characterId: 'cat' }));
    okOf(await ready(nora.socket));
    okOf(await ready(alex.socket));
    okOf(await start(harvey.socket));

    await arrange(persistence, roomId, (state, members) => {
      // Zed is eliminated and had already been revived once; the room then ends with a win for Team 1 (Harvey + Nora).
      state.boardState.finishedPlayers[zed.playerId] = {
        name: 'Zed', color: state.boardState.teams.TEAM_2.color, characterId: 'panda', teamId: state.players[zed.playerId].teamId,
        reason: 'BANKRUPT', accountBalance: 0,
      };
      delete state.players[zed.playerId];
      members[zed.playerId].membershipStatus = 'FINISHED';
      state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
      state.boardState.teamPlay.revivedPlayerIds = [zed.playerId];
    });
    const teamsAfterSwap = Object.fromEntries(
      Object.entries((await stored(persistence, roomId)).gameSnapshot.gameState.players).map(([id, player]) => [id, player.teamId]),
    );
    expect(teamsAfterSwap[nora.playerId]).toBe('TEAM_1');
    expect(teamsAfterSwap[alex.playerId]).toBe('TEAM_2');

    okOf(await leave(alex.socket)); // the last active Team 2 member leaves: Team 1 wins
    expect((await stored(persistence, roomId)).status).toBe('FINISHED');
    okOf(await playAgain(harvey.socket));

    const lobby = await stored(persistence, roomId);
    const state = lobby.gameSnapshot.gameState;
    expect(lobby.status).toBe('LOBBY');
    expect(state.boardState.gameMode).toBe('TEAM_2V2');
    expect(state.boardState.teams).toEqual({ TEAM_1: { name: 'Rồng', color: 'green' }, TEAM_2: { name: 'Hổ', color: 'blue' } });
    expect(state.boardState.teamPlay).toEqual({ slotOrder: [], revivedPlayerIds: [], reviveWindows: [] });
    // Zed (eliminated) is still an eligible member and returns on their team; Alex left and is gone.
    expect(state.players[zed.playerId]).toMatchObject({ teamId: 'TEAM_2', color: 'blue', accountBalance: 1500 });
    expect(state.players[alex.playerId]).toBeUndefined();
    for (const id of [harvey.playerId, nora.playerId]) {
      expect(state.players[id]).toMatchObject({ teamId: 'TEAM_1', color: 'green', accountBalance: 1500 });
    }
    expect(Object.values(lobby.gameSnapshot.members).every((member) => !member.ready)).toBe(true);
    expect(Object.keys(lobby.gameSnapshot.members)).not.toContain(alex.playerId);
  });
});
