import { describe, expect, it } from 'vitest';
import {
  gameCardsById,
  getTeamMemberIds,
  planEmergencyRescue,
  REVIVE_COST,
  REVIVE_STARTING_CASH,
  REVIVE_WINDOW_SURVIVOR_TURNS,
  tileState,
  buildAlternatingTurnOrder,
  type GameState,
  type PlayerId,
  type TeamId,
} from '@monopoly/shared';
import { createFreshPlayer, freshState } from '../rooms';
import {
  acceptEmergencyRescue,
  applyCard,
  completeTurnResolution,
  createPaymentQueue,
  declineEmergencyRescue,
  enqueuePayments,
  getReviveEligibility,
  handleJailRoll,
  nextTurn,
  openEmergencyRescue,
  progressPaymentQueue,
  railroadRent,
  removePlayerFromGame,
  resolveRescueWithoutPayment,
  resolveTile,
  reviveTeammate,
  sellHouse,
  sellPropertyToBankForPayment,
  startTeamMatch,
  streetRent,
  surrenderPlayerToBank,
  utilityRent,
} from './index';

// Two teams of two: Team 1 is a1 + a2, Team 2 is b1 + b2. The slot order alternates a1, b1, a2, b2.
const TEAMS: Record<string, TeamId> = { a1: 'TEAM_1', a2: 'TEAM_1', b1: 'TEAM_2', b2: 'TEAM_2' };
const MEMBERS = { TEAM_1: ['a1', 'a2'], TEAM_2: ['b1', 'b2'] } as const;
const MASCOTS = { a1: 'dog', a2: 'cat', b1: 'dog', b2: 'panda' } as const;

function teamGame(mode: 'TEAM_2V2' | 'SOLO' = 'TEAM_2V2', starter: PlayerId = 'a1'): GameState {
  const state = freshState();
  state.boardState.gameStarted = true;
  state.boardState.gameMode = mode;
  state.boardState.turnNumber = 1;
  for (const id of ['a1', 'b1', 'a2', 'b2']) {
    const teamId = TEAMS[id];
    state.players[id] = createFreshPlayer(
      id,
      mode === 'TEAM_2V2' ? state.boardState.teams[teamId].color : id.startsWith('a') ? 'red' : 'blue',
      MASCOTS[id as keyof typeof MASCOTS],
      teamId,
    );
  }
  if (mode === 'TEAM_2V2') startTeamMatch(state, starter, MEMBERS);
  else state.boardState.players = ['a1', 'b1', 'a2', 'b2'];
  state.boardState.currentPlayer = { id: starter, hasMoved: false };
  return state;
}

const own = (state: GameState, tileID: number, ownerId: PlayerId, houses = 0): void => {
  state.boardState.ownedProps[tileID] = { id: ownerId, color: state.players[ownerId].color, houses };
};

const BROWN = [1, 3];
const PINK = [11, 13, 14];
const BLUE = [37, 39];

describe('colour-set rent', () => {
  it('Solo: an incomplete set pays the normal rent and a complete set pays 1.5x, rounded down', () => {
    const state = teamGame('SOLO');
    own(state, 1, 'a1');
    expect(streetRent(state, 1)).toBe(tileState[1].rent);

    own(state, 3, 'a1');
    expect(streetRent(state, 1)).toBe(3); // 2 * 1.5
    expect(streetRent(state, 3)).toBe(6); // 4 * 1.5

    // A rent that scales to a fraction of a unit is rounded down: 35 * 1.5 = 52.5.
    own(state, 37, 'a1');
    own(state, 39, 'a1');
    expect(streetRent(state, 37)).toBe(52);
  });

  it('Solo: the bonus scales the development tier, not the base rent', () => {
    const state = teamGame('SOLO');
    PINK.forEach((tile) => own(state, tile, 'a1'));
    state.boardState.ownedProps[11].houses = 2;
    expect(streetRent(state, 11)).toBe(Math.floor(150 * 3 / 2)); // tier of 2 Nhà
    state.boardState.ownedProps[11].houses = 4;
    expect(streetRent(state, 11)).toBe(Math.floor(625 * 3 / 2)); // 937.5 rounded down
    state.boardState.ownedProps[11].houses = 5;
    expect(streetRent(state, 11)).toBe(Math.floor(750 * 3 / 2));
  });

  it('Solo: a set split between two players earns no bonus even when they sit on the same (dormant) team', () => {
    const state = teamGame('SOLO');
    own(state, 1, 'a1');
    own(state, 3, 'a2'); // a1 and a2 share TEAM_1, but Solo never reads teams
    expect(streetRent(state, 1)).toBe(tileState[1].rent);
    expect(streetRent(state, 3)).toBe(tileState[3].rent);
  });

  it('2v2: a set held across both teammates pays double, in either split', () => {
    const state = teamGame();
    own(state, 1, 'a1');
    own(state, 3, 'a2');
    expect(streetRent(state, 1)).toBe((tileState[1].rent ?? 0) * 2);
    expect(streetRent(state, 3)).toBe((tileState[3].rent ?? 0) * 2);

    PINK.forEach((tile, index) => own(state, tile, index === 1 ? 'a2' : 'a1'));
    expect(streetRent(state, 13)).toBe((tileState[13].rent ?? 0) * 2);
  });

  it('2v2: a set held through one member only counts as the team set (double, not 1.5x)', () => {
    const state = teamGame();
    BROWN.forEach((tile) => own(state, tile, 'a1'));
    expect(streetRent(state, 1)).toBe((tileState[1].rent ?? 0) * 2);
  });

  it('2v2: a set shared with an opponent earns nothing, and an incomplete team set earns nothing', () => {
    const state = teamGame();
    own(state, 1, 'a1');
    own(state, 3, 'b1');
    expect(streetRent(state, 1)).toBe(tileState[1].rent);

    PINK.slice(0, 2).forEach((tile) => own(state, tile, 'a1')); // a1 + a1, the third pink street is unowned
    expect(streetRent(state, 11)).toBe(tileState[11].rent);
  });

  it('2v2: buildings and the double multiplier combine as tier x 2', () => {
    const state = teamGame();
    BLUE.forEach((tile, index) => own(state, tile, index === 0 ? 'a1' : 'a2', 3));
    expect(streetRent(state, 37)).toBe(1100 * 2);
    state.boardState.ownedProps[39].houses = 5;
    expect(streetRent(state, 39)).toBe(2000 * 2);
  });

  it('never gates building: a lone street still opens the development choice', () => {
    const solo = teamGame('SOLO');
    solo.players.a1.currentTile = 1;
    own(solo, 1, 'a1');
    resolveTile(solo, 'a1', 0);
    expect(solo.turnInfo.pendingDevelopmentDecision).toMatchObject({ playerId: 'a1', tileID: 1 });
  });

  it('charges an opponent the multiplied rent through a real landing', () => {
    const state = teamGame();
    own(state, 1, 'a1');
    own(state, 3, 'a2');
    state.players.b1.currentTile = 1;
    resolveTile(state, 'b1', 5);
    expect(state.players.b1.accountBalance).toBe(1500 - 4);
    expect(state.players.a1.accountBalance).toBe(1500 + 4);
  });
});

describe('railroad and utility aggregation', () => {
  it('2v2 counts both teammates\' Ga for the rent tier', () => {
    const state = teamGame();
    own(state, 5, 'a1');
    own(state, 15, 'a1');
    expect(railroadRent(state, 5)).toBe(50);
    own(state, 25, 'a2');
    own(state, 35, 'a2');
    expect(railroadRent(state, 5)).toBe(200);
    expect(railroadRent(state, 35)).toBe(200);
  });

  it('Solo keeps every Ga count individual', () => {
    const state = teamGame('SOLO');
    own(state, 5, 'a1');
    own(state, 15, 'a1');
    own(state, 25, 'a2');
    own(state, 35, 'a2');
    expect(railroadRent(state, 5)).toBe(50);
    expect(railroadRent(state, 25)).toBe(50);
  });

  it('an opponent Ga does not join the team count', () => {
    const state = teamGame();
    own(state, 5, 'a1');
    own(state, 15, 'b1');
    expect(railroadRent(state, 5)).toBe(25);
  });

  it('2v2 treats one Công Ty from each teammate as holding both; Solo does not', () => {
    const team = teamGame();
    own(team, 12, 'a1');
    own(team, 28, 'a2');
    expect(utilityRent(team, 12, 7)).toBe(70);

    const solo = teamGame('SOLO');
    own(solo, 12, 'a1');
    own(solo, 28, 'a2');
    expect(utilityRent(solo, 12, 7)).toBe(28);
  });
});

describe('teammate rent exemption and Team Investment', () => {
  it('a teammate landing on a property pays no rent (street, Ga and Công Ty)', () => {
    for (const [tile, count] of [[1, 1], [5, 1], [12, 1]] as const) {
      const state = teamGame();
      own(state, tile, 'a1');
      state.players.a2.currentTile = tile;
      resolveTile(state, 'a2', 6);
      expect(state.boardState.paymentQueue, `tile ${tile}`).toBeNull();
      expect(state.players.a2.accountBalance).toBe(1500);
      expect(state.players.a1.accountBalance).toBe(1500);
      expect(count).toBe(1);
    }
  });

  it('an opponent still pays rent on the same property', () => {
    const state = teamGame();
    own(state, 5, 'a1');
    state.players.b1.currentTile = 5;
    resolveTile(state, 'b1', 6);
    expect(state.players.b1.accountBalance).toBe(1500 - 25);
    expect(state.players.a1.accountBalance).toBe(1500 + 25);
  });

  it('landing on a teammate street offers the lander the development choice, with no rent', () => {
    const state = teamGame();
    own(state, 1, 'a1', 2);
    state.players.a2.currentTile = 1;
    resolveTile(state, 'a2', 4);
    expect(state.turnInfo.pendingDevelopmentDecision).toMatchObject({
      playerId: 'a2', tileID: 1, kind: 'HOUSES', levelAtLanding: 2,
    });
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.boardState.ownedProps[1].id).toBe('a1');
    expect(state.players.a2.accountBalance).toBe(1500);
  });

  it('offers the hotel upgrade at four Nhà and nothing at a hotel', () => {
    const four = teamGame();
    own(four, 1, 'a1', 4);
    four.players.a2.currentTile = 1;
    resolveTile(four, 'a2', 4);
    expect(four.turnInfo.pendingDevelopmentDecision).toMatchObject({ kind: 'HOTEL', levelAtLanding: 4 });

    const hotel = teamGame();
    own(hotel, 1, 'a1', 5);
    hotel.players.a2.currentTile = 1;
    resolveTile(hotel, 'a2', 4);
    expect(hotel.turnInfo.pendingDevelopmentDecision).toBeUndefined();
  });

  it('offers nothing when the lander cannot afford a single level, and the turn goes on', () => {
    const state = teamGame();
    state.boardState.currentPlayer = { id: 'a2', hasMoved: true };
    state.boardState.players = ['a2', 'b2', 'a1', 'b1'];
    own(state, 1, 'a1');
    state.players.a2.currentTile = 1;
    state.players.a2.accountBalance = 49; // one Nhà of the brown group costs 50
    resolveTile(state, 'a2', 4);
    expect(state.turnInfo.pendingDevelopmentDecision).toBeUndefined();
    expect(state.boardState.currentPlayer.id).toBe('b2'); // the turn moved on
  });

  it('offers no development on a teammate Ga or Công Ty', () => {
    const state = teamGame();
    own(state, 5, 'a1');
    state.players.a2.currentTile = 5;
    resolveTile(state, 'a2', 4);
    expect(state.turnInfo.pendingDevelopmentDecision).toBeUndefined();
  });

  it('never offers an opponent the development choice on someone else\'s street', () => {
    const state = teamGame();
    own(state, 1, 'a1');
    state.players.b1.currentTile = 1;
    resolveTile(state, 'b1', 4);
    expect(state.turnInfo.pendingDevelopmentDecision).toBeUndefined();
    expect(state.boardState.paymentQueue).toBeNull(); // the rent was affordable and paid
    expect(state.players.b1.accountBalance).toBeLessThan(1500);
  });

  it('a later sale of a funded level refunds the owner, and the funder cannot sell it', () => {
    const state = teamGame();
    own(state, 1, 'a1', 2);
    const funderBefore = state.players.a2.accountBalance;
    const ownerBefore = state.players.a1.accountBalance;
    expect(sellHouse(state, 'a2', 1)).toBe(false);
    expect(state.players.a2.accountBalance).toBe(funderBefore);
    expect(sellHouse(state, 'a1', 1)).toBe(true);
    expect(state.players.a1.accountBalance).toBe(ownerBefore + Math.floor((tileState[1].houseCost ?? 0) / 2));
    expect(state.players.a2.accountBalance).toBe(funderBefore);
  });
});

describe('cards still include teammates', () => {
  it('"pay each player" owes the teammate too, and "collect from each player" takes from the teammate too', () => {
    const pay = teamGame();
    applyCard(pay, 'a1', gameCardsById['chance-community-event'], { playerId: 'a1', turnNumber: 1 });
    expect(pay.players.a2.accountBalance).toBe(1500 + 50);
    expect(pay.players.b1.accountBalance).toBe(1500 + 50);
    expect(pay.players.b2.accountBalance).toBe(1500 + 50);
    expect(pay.players.a1.accountBalance).toBe(1500 - 150);

    const collect = teamGame();
    applyCard(collect, 'a1', gameCardsById['chest-birthday'], { playerId: 'a1', turnNumber: 1 });
    expect(collect.players.a2.accountBalance).toBe(1500 - 10);
    expect(collect.players.b1.accountBalance).toBe(1500 - 10);
    expect(collect.players.b2.accountBalance).toBe(1500 - 10);
    expect(collect.players.a1.accountBalance).toBe(1500 + 30);
  });
});

describe('alternating turn order', () => {
  it('starts with the starter, the other team, the starter\'s teammate and the other team again', () => {
    expect(buildAlternatingTurnOrder('a1', MEMBERS)).toEqual(['a1', 'b1', 'a2', 'b2']);
    expect(buildAlternatingTurnOrder('b2', MEMBERS)).toEqual(['b2', 'a1', 'b1', 'a2']);
  });

  it('never places two teammates side by side whoever starts', () => {
    for (const starter of ['a1', 'a2', 'b1', 'b2']) {
      const order = buildAlternatingTurnOrder(starter, MEMBERS);
      expect(order[0]).toBe(starter);
      expect(new Set(order).size).toBe(4);
      for (let index = 0; index < 4; index += 1) {
        const next = order[(index + 1) % 4];
        expect(TEAMS[order[index]], `${starter}: ${order.join(',')}`).not.toBe(TEAMS[next]);
      }
    }
  });

  it('rejects an uneven split instead of seating it', () => {
    expect(() => buildAlternatingTurnOrder('a1', { TEAM_1: ['a1', 'a2', 'b1'], TEAM_2: ['b2'] })).toThrow();
    expect(() => buildAlternatingTurnOrder('zz', MEMBERS)).toThrow();
  });

  it('walks the alternating order through nextTurn', () => {
    const state = teamGame('TEAM_2V2', 'b2');
    const seen: PlayerId[] = [state.boardState.currentPlayer.id];
    for (let step = 0; step < 4; step += 1) {
      nextTurn(state);
      seen.push(state.boardState.currentPlayer.id);
    }
    expect(seen).toEqual(['b2', 'a1', 'b1', 'a2', 'b2']);
  });

  it('keeps the remaining players in slot order after an elimination', () => {
    const state = teamGame();
    removePlayerFromGame(state, 'b1', 'BANKRUPT');
    expect(state.boardState.players).toEqual(['a1', 'a2', 'b2']);
    expect(state.boardState.teamPlay.slotOrder).toEqual(['a1', 'b1', 'a2', 'b2']);
  });
});

describe('individual bankruptcy and team elimination', () => {
  it('a bankruptcy removes only that player; their properties go to the Bank, not to the teammate', () => {
    const state = teamGame();
    own(state, 1, 'b1');
    own(state, 3, 'b2');
    removePlayerFromGame(state, 'b1', 'BANKRUPT');
    expect(state.players.b1).toBeUndefined();
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.ownedProps[3]?.id).toBe('b2');
    expect(state.boardState.winner).toBeNull();
    expect(state.boardState.finishedPlayers.b1).toMatchObject({ reason: 'BANKRUPT', teamId: 'TEAM_2' });
  });

  it('declares the other team the winner the moment a team has no active player', () => {
    const state = teamGame();
    removePlayerFromGame(state, 'b1', 'BANKRUPT');
    removePlayerFromGame(state, 'b2', 'BANKRUPT');
    expect(state.boardState.winningTeamId).toBe('TEAM_1');
    expect(state.boardState.winner).toMatchObject({ playerId: 'a1', teamId: 'TEAM_1' });
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
    const finished = state.boardState.activityFeed.events.at(-1);
    expect(finished).toMatchObject({ type: 'GAME_FINISHED', winningTeamId: 'TEAM_1', winningTeamName: 'Team 1' });
  });

  it('a winning team may be one active member plus one permanently eliminated member', () => {
    const state = teamGame();
    removePlayerFromGame(state, 'a2', 'BANKRUPT');
    state.boardState.teamPlay.reviveWindows = []; // the window ran out earlier
    removePlayerFromGame(state, 'b1', 'BANKRUPT');
    removePlayerFromGame(state, 'b2', 'BANKRUPT');
    expect(state.boardState.winningTeamId).toBe('TEAM_1');
    expect(state.boardState.winner?.playerId).toBe('a1');
    expect(getTeamMemberIds(state, 'TEAM_1').sort()).toEqual(['a1', 'a2']); // the eliminated member still belongs to the team
  });

  it('a winning team may be one active member plus one member still inside a revive window', () => {
    const state = teamGame();
    removePlayerFromGame(state, 'a2', 'BANKRUPT');
    expect(state.boardState.teamPlay.reviveWindows).toHaveLength(1);
    removePlayerFromGame(state, 'b1', 'BANKRUPT');
    removePlayerFromGame(state, 'b2', 'BANKRUPT');
    expect(state.boardState.winningTeamId).toBe('TEAM_1');
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
  });

  it('a team whose last member goes bankrupt loses at once even while the other team has a revive window open', () => {
    const state = teamGame();
    removePlayerFromGame(state, 'a2', 'BANKRUPT'); // window for a2, survivor a1
    removePlayerFromGame(state, 'a1', 'BANKRUPT'); // the survivor goes too: Team 1 is out immediately
    expect(state.boardState.winningTeamId).toBe('TEAM_2');
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
  });

  it('Solo keeps the last-player-standing rule and opens no revive window', () => {
    const state = teamGame('SOLO');
    removePlayerFromGame(state, 'b1', 'BANKRUPT');
    removePlayerFromGame(state, 'a2', 'BANKRUPT');
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(state.boardState.winner).toBeNull();
    removePlayerFromGame(state, 'b2', 'BANKRUPT');
    expect(state.boardState.winner).toMatchObject({ playerId: 'a1' });
    expect(state.boardState.winningTeamId).toBeNull();
  });
});

describe('explicit leave', () => {
  it('opens no revive window and lets the survivor play on as 1v2', () => {
    const state = teamGame();
    surrenderPlayerToBank(state, 'a2');
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(state.boardState.finishedPlayers.a2.reason).toBe('LEFT');
    expect(state.boardState.winner).toBeNull();
    expect(Object.keys(state.players).sort()).toEqual(['a1', 'b1', 'b2']);
  });

  it('hands the win to the other team when the last member of a team leaves', () => {
    const state = teamGame();
    surrenderPlayerToBank(state, 'b1');
    surrenderPlayerToBank(state, 'b2');
    expect(state.boardState.winningTeamId).toBe('TEAM_1');
  });
});

describe('revive', () => {
  // a2 goes bankrupt during b1's turn; the survivor is a1 (slot order a1, b1, a2, b2).
  function bankruptA2(): GameState {
    const state = teamGame();
    own(state, 1, 'a2', 2);
    state.players.a2.heldJailFreeCardIds = [];
    state.boardState.currentPlayer = { id: 'b1', hasMoved: true };
    removePlayerFromGame(state, 'a2', 'BANKRUPT');
    return state;
  }

  /** Runs turns until it is `playerId`'s turn and returns how many turns of anyone else were skipped. */
  const advanceTo = (state: GameState, playerId: PlayerId): void => {
    for (let guard = 0; guard < 12 && state.boardState.currentPlayer.id !== playerId; guard += 1) nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe(playerId);
  };

  it('a bankruptcy opens a window of exactly five survivor turns, public to everyone', () => {
    expect(REVIVE_WINDOW_SURVIVOR_TURNS).toBe(5);
    const state = bankruptA2();
    expect(state.boardState.teamPlay.reviveWindows).toEqual([{
      playerId: 'a2', teamId: 'TEAM_1', turnsRemaining: REVIVE_WINDOW_SURVIVOR_TURNS, openedAtTurnNumber: 1,
    }]);
    expect(state.boardState.activityFeed.events.some(
      (event) => event.type === 'TEAM_REVIVE' && event.action === 'WINDOW_OPENED' && event.playerId === 'a2',
    )).toBe(true);
  });

  it('cannot be used before the survivor\'s next turn begins, nor on an opponent\'s turn', () => {
    const state = bankruptA2();
    state.boardState.currentPlayer = { id: 'a1', hasMoved: false }; // the same turn number the bankruptcy happened in
    expect(getReviveEligibility(state, 'a1')).toMatchObject({ ok: false });
    advanceTo(state, 'b2'); // some other turn
    expect(getReviveEligibility(state, 'a1')).toMatchObject({ ok: false });
    expect(getReviveEligibility(state, 'b2')).toMatchObject({ ok: false }); // not the teammate of anyone revivable
  });

  it('costs 750K, returns the teammate with 300K at Xuất Phát with nothing else, and restores their slot', () => {
    const state = bankruptA2();
    advanceTo(state, 'b2');
    nextTurn(state); // a1's first applicable turn
    expect(state.boardState.currentPlayer.id).toBe('a1');
    expect(getReviveEligibility(state, 'a1')).toMatchObject({ ok: true, teammateId: 'a2' });

    const survivorBefore = state.players.a1.accountBalance;
    const result = reviveTeammate(state, 'a1');
    expect(result).toEqual({ ok: true, revivedPlayerId: 'a2' });
    expect(state.players.a1.accountBalance).toBe(survivorBefore - REVIVE_COST);
    expect(REVIVE_COST).toBe(750);
    expect(state.players.a2).toEqual({
      name: 'a2',
      currentTile: 0,
      color: state.boardState.teams.TEAM_1.color,
      characterId: 'cat',
      teamId: 'TEAM_1',
      teamSlot: 1, // the seat the survivor (seat 0) does not hold
      accountBalance: REVIVE_STARTING_CASH,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    });
    expect(REVIVE_STARTING_CASH).toBe(300);
    expect(state.boardState.finishedPlayers.a2).toBeUndefined();
    expect(Object.values(state.boardState.ownedProps).some((property) => property.id === 'a2')).toBe(false);
    expect(state.boardState.teamPlay.revivedPlayerIds).toEqual(['a2']);
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(state.boardState.players).toEqual(['a1', 'b1', 'a2', 'b2']);
    // Paid to the Bank, and the revived player's cash comes from the Bank: both are visible semantic money facts.
    const reasons = state.boardState.gameplayEvents.events.filter(
      (event) => event.type === 'MONEY_TRANSFER' && event.reason === 'REVIVE',
    );
    expect(reasons).toHaveLength(2);
  });

  it('gives the revived player no immediate turn: the order carries on from the survivor', () => {
    const state = bankruptA2();
    advanceTo(state, 'b2');
    nextTurn(state);
    reviveTeammate(state, 'a1');
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('b1'); // not a2
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('a2'); // a2's own slot, when it naturally comes round
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('b2');
  });

  it('returns to the original slot even when that slot has already passed this round', () => {
    // Order a2, b1, a1, b2: a2 sits before the survivor a1.
    const state = teamGame('TEAM_2V2', 'a2');
    state.boardState.currentPlayer = { id: 'b1', hasMoved: true };
    removePlayerFromGame(state, 'a2', 'BANKRUPT');
    advanceTo(state, 'a1');
    state.boardState.turnNumber += 0;
    // Make the window applicable: it opened in turn 1 and a1's turn is later.
    expect(state.boardState.turnNumber).toBeGreaterThan(1);
    expect(reviveTeammate(state, 'a1')).toMatchObject({ ok: true });
    expect(state.boardState.players).toEqual(['a2', 'b1', 'a1', 'b2']);
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('b2');
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('a2');
  });

  it('is refused without the money, or while a payment is open, or after the survivor has already moved on a settled turn', () => {
    const poor = bankruptA2();
    advanceTo(poor, 'b2');
    nextTurn(poor);
    poor.players.a1.accountBalance = REVIVE_COST - 1;
    expect(getReviveEligibility(poor, 'a1')).toMatchObject({ ok: false });

    const moved = bankruptA2();
    advanceTo(moved, 'b2');
    nextTurn(moved);
    moved.boardState.currentPlayer.hasMoved = true; // rolled, and the landing already resolved
    expect(getReviveEligibility(moved, 'a1')).toMatchObject({ ok: false });

    const indebted = bankruptA2();
    advanceTo(indebted, 'b2');
    nextTurn(indebted);
    indebted.boardState.paymentQueue = createPaymentQueue(
      [{ debtorPlayerId: 'a1', creditor: 'BANK', amount: 5, source: { kind: 'OTHER', description: 'x' } }],
      { playerId: 'a1', turnNumber: indebted.boardState.turnNumber },
    );
    expect(getReviveEligibility(indebted, 'a1')).toMatchObject({ ok: false });
  });

  it('is allowed while a purchase or development choice of the survivor is still waiting', () => {
    const state = bankruptA2();
    advanceTo(state, 'b2');
    nextTurn(state);
    state.boardState.currentPlayer.hasMoved = true;
    state.players.a1.currentTile = 6;
    state.turnInfo.pendingPropertyDecision = {
      operationId: '00000000-0000-4000-8000-000000000001',
      playerId: 'a1',
      tileID: 6,
      continuation: { playerId: 'a1', turnNumber: state.boardState.turnNumber },
    };
    expect(getReviveEligibility(state, 'a1')).toMatchObject({ ok: true });
  });

  it('uses up one opportunity per survivor turn and nothing for anyone else\'s turns', () => {
    const state = bankruptA2();
    const survivorTurns: number[] = [];
    for (let step = 0; step < 40 && state.boardState.teamPlay.reviveWindows.length > 0; step += 1) {
      if (state.boardState.currentPlayer.id === 'a1') survivorTurns.push(state.boardState.turnNumber);
      nextTurn(state);
      if (state.boardState.teamPlay.reviveWindows.length > 0) {
        const completed = survivorTurns.length;
        expect(state.boardState.teamPlay.reviveWindows[0].turnsRemaining).toBe(
          REVIVE_WINDOW_SURVIVOR_TURNS - completed,
        );
      }
    }
    expect(survivorTurns).toHaveLength(REVIVE_WINDOW_SURVIVOR_TURNS);
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(state.boardState.finishedPlayers.a2).toBeDefined(); // permanently out
    expect(state.boardState.activityFeed.events.some(
      (event) => event.type === 'TEAM_REVIVE' && event.action === 'EXPIRED' && event.playerId === 'a2',
    )).toBe(true);
    // The opponents took more turns than the survivor did, and none of them counted.
  });

  it('does not count the survivor\'s own turn that was already running when the teammate went bankrupt', () => {
    const state = teamGame();
    state.boardState.currentPlayer = { id: 'a1', hasMoved: true };
    removePlayerFromGame(state, 'a2', 'BANKRUPT'); // the survivor's turn is current
    nextTurn(state); // that turn ends
    expect(state.boardState.teamPlay.reviveWindows[0].turnsRemaining).toBe(REVIVE_WINDOW_SURVIVOR_TURNS);
  });

  it('counts a jailed survivor\'s turn (a failed jail roll and a wait both end the turn)', () => {
    const state = bankruptA2();
    advanceTo(state, 'b2');
    nextTurn(state);
    state.players.a1.isJail = true;
    state.boardState.currentPlayer.hasMoved = false;
    handleJailRoll(state, 'a1', { dice1: 1, dice2: 2 }, { playerId: 'a1', turnNumber: state.boardState.turnNumber });
    expect(state.boardState.currentPlayer.id).toBe('b1');
    expect(state.boardState.teamPlay.reviveWindows[0].turnsRemaining).toBe(REVIVE_WINDOW_SURVIVOR_TURNS - 1);
  });

  it('counts a survivor turn that was skipped (completed without any action, as the disconnect recovery does)', () => {
    const state = bankruptA2();
    advanceTo(state, 'b2');
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('a1');
    nextTurn(state); // what the deadline scheduler does when the survivor never returns
    expect(state.boardState.teamPlay.reviveWindows[0].turnsRemaining).toBe(REVIVE_WINDOW_SURVIVOR_TURNS - 1);
  });

  it('can be used on the fifth and last opportunity, and not on the sixth turn of the survivor', () => {
    const state = bankruptA2();
    for (let survivorTurn = 1; survivorTurn < REVIVE_WINDOW_SURVIVOR_TURNS; survivorTurn += 1) {
      advanceTo(state, 'a1');
      expect(getReviveEligibility(state, 'a1')).toMatchObject({ ok: true }); // every one of the first four turns
      nextTurn(state);
    }
    advanceTo(state, 'a1'); // the fifth turn of the survivor
    expect(state.boardState.teamPlay.reviveWindows[0].turnsRemaining).toBe(1);
    expect(reviveTeammate(state, 'a1')).toMatchObject({ ok: true });

    const late = bankruptA2();
    for (let survivorTurn = 1; survivorTurn <= REVIVE_WINDOW_SURVIVOR_TURNS; survivorTurn += 1) {
      advanceTo(late, 'a1');
      nextTurn(late); // the survivor lets all five turns pass without reviving
    }
    advanceTo(late, 'a1'); // the sixth turn: the elimination is permanent
    expect(late.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(late.boardState.finishedPlayers.a2).toBeDefined();
    expect(getReviveEligibility(late, 'a1')).toMatchObject({ ok: false });
  });

  it('a player can be revived at most once: the next bankruptcy is permanent', () => {
    const state = bankruptA2();
    advanceTo(state, 'b2');
    nextTurn(state);
    reviveTeammate(state, 'a1');
    state.boardState.currentPlayer = { id: 'b1', hasMoved: true };
    removePlayerFromGame(state, 'a2', 'BANKRUPT');
    expect(state.boardState.teamPlay.reviveWindows).toEqual([]);
    expect(state.boardState.teamPlay.revivedPlayerIds).toEqual(['a2']);
    expect(state.boardState.finishedPlayers.a2.reason).toBe('BANKRUPT');
  });

  it('returns held jail-free cards to the deck at a payment bankruptcy so a revived player holds none', () => {
    const state = teamGame();
    state.privateState.decks.chance.drawPile = state.privateState.decks.chance.drawPile
      .filter((cardId) => cardId !== 'chance-jail-free');
    state.players.a2.heldJailFreeCardIds = ['chance-jail-free'];
    state.players.a2.accountBalance = 0;
    state.players.a1.accountBalance = 0; // the teammate cannot rescue, so a2 is eliminated
    state.boardState.currentPlayer = { id: 'a2', hasMoved: true };
    enqueuePayments(
      state,
      [{ debtorPlayerId: 'a2', creditor: 'BANK', amount: 50, source: { kind: 'OTHER', description: 'x' } }],
      { playerId: 'a2', turnNumber: state.boardState.turnNumber },
      { now: 0 },
    );
    progressPaymentQueue(state, { now: 1 });
    expect(state.players.a2).toBeUndefined();
    expect(state.privateState.decks.chance.drawPile).toContain('chance-jail-free');

    state.players.a1.accountBalance = 1500;
    advanceTo(state, 'a1');
    expect(reviveTeammate(state, 'a1')).toMatchObject({ ok: true });
    expect(state.players.a2.heldJailFreeCardIds).toEqual([]);
  });

  it('only the survivor of that team may revive', () => {
    const state = bankruptA2();
    advanceTo(state, 'b2');
    nextTurn(state);
    expect(reviveTeammate(state, 'b1')).toMatchObject({ ok: false });
    expect(reviveTeammate(state, 'zz')).toMatchObject({ ok: false });
  });
});

describe('Emergency Rescue', () => {
  const continuation = (state: GameState, playerId: PlayerId) => ({ playerId, turnNumber: state.boardState.turnNumber });

  /** b1 owes `amount`; b2 is the teammate with `rescuerCash`. b1 owns nothing and has no cash. */
  function indebted(amount: number, rescuerCash = 1000): GameState {
    const state = teamGame('TEAM_2V2', 'b1');
    state.players.b1.accountBalance = 0;
    state.players.b2.accountBalance = rescuerCash;
    enqueuePayments(
      state,
      [{ debtorPlayerId: 'b1', creditor: 'PLAYER', creditorPlayerId: 'a1', amount, source: { kind: 'OTHER', description: 'test' } }],
      continuation(state, 'b1'),
      { now: 0, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 },
    );
    return state;
  }
  const options = { now: 1_000, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 };

  it('is not offered while the debtor still owns something to sell', () => {
    const state = indebted(900);
    own(state, 1, 'b1');
    const progress = progressPaymentQueue(state, options);
    expect(progress.status).toBe('WAITING_FOR_LIQUIDATION');
    expect(state.boardState.paymentQueue?.rescue).toBeNull();
    expect(openEmergencyRescue(state, 'b1', options)).toBe(false); // even asked directly
  });

  /**
   * The spec's example: 900K owed. The debtor holds 90K cash and one street worth 560K when sold (Landmark 81 with two Nhà),
   * so they can ultimately cover 650K and 250K remain once everything has been sold.
   */
  function exhaustedDebtor(rescuerCash: number): { state: GameState } {
    const state = teamGame('TEAM_2V2', 'b1');
    state.players.b1.accountBalance = 90;
    state.players.b2.accountBalance = rescuerCash;
    own(state, 39, 'b1', 2);
    enqueuePayments(
      state,
      [{ debtorPlayerId: 'b1', creditor: 'BANK', amount: 900, source: { kind: 'TAX', tileID: 4 } }],
      continuation(state, 'b1'),
      { now: 0, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 },
    );
    return { state };
  }

  it('is offered only after the debtor has sold everything, for exactly what is still owed (900K owed, 650K covered, 250K left)', () => {
    const { state } = exhaustedDebtor(300);
    // The first pass pays the 90K cash and then waits for a liquidation: no rescue yet.
    expect(progressPaymentQueue(state, options).status).toBe('WAITING_FOR_LIQUIDATION');
    expect(state.boardState.paymentQueue?.rescue).toBeNull();
    expect(state.boardState.paymentQueue?.orderedClaims[0].remainingAmount).toBe(810);

    const queue = state.boardState.paymentQueue!;
    const sale = sellPropertyToBankForPayment(state, 'b1', queue.operationId, queue.orderedClaims[0].claimId, 39, options);
    expect(sale.ok).toBe(true);
    expect(progressPaymentQueue(state, options).status).toBe('WAITING_FOR_RESCUE');
    expect(state.boardState.paymentQueue?.orderedClaims[0].remainingAmount).toBe(250);
    expect(state.boardState.paymentQueue?.rescue).toMatchObject({
      debtorPlayerId: 'b1', rescuerPlayerId: 'b2', amount: 250,
    });
    // The one durable deadline is the rescue's.
    expect(state.boardState.paymentQueue?.actionDeadlineAt).toBe(state.boardState.paymentQueue?.rescue?.expiresAt);
    expect(Date.parse(state.boardState.paymentQueue!.actionDeadlineAt)).toBe(options.now + 30_000);
    expect(state.players.b1).toBeDefined(); // not eliminated while the offer is open
  });

  it('is unavailable when the teammate has only 200K of the 250K left, and the debtor is eliminated as usual', () => {
    const { state } = exhaustedDebtor(200);
    progressPaymentQueue(state, options);
    const queue = state.boardState.paymentQueue!;
    sellPropertyToBankForPayment(state, 'b1', queue.operationId, queue.orderedClaims[0].claimId, 39, options);
    const progress = progressPaymentQueue(state, options);
    expect(progress.status).toBe('COMPLETED');
    expect(state.boardState.finishedPlayers.b1.reason).toBe('BANKRUPT');
    expect(state.players.b2.accountBalance).toBe(200); // no partial rescue, nothing taken
  });

  it('pays the whole shortfall from the rescuer straight to the creditor and never touches the debtor wallet', () => {
    const state = indebted(250, 300);
    progressPaymentQueue(state, options);
    const rescue = state.boardState.paymentQueue!.rescue!;
    const creditorBefore = state.players.a1.accountBalance;

    const result = acceptEmergencyRescue(state, 'b2', rescue.rescueId, options);
    expect(result.ok).toBe(true);
    expect(state.players.b2.accountBalance).toBe(50);
    expect(state.players.a1.accountBalance).toBe(creditorBefore + 250);
    expect(state.players.b1.accountBalance).toBe(0); // the debtor never receives the rescue amount
    expect(state.players.b1).toBeDefined();
    expect(state.boardState.paymentQueue).toBeNull(); // the queue is settled
    const transfer = state.boardState.gameplayEvents.events.find(
      (event) => event.type === 'MONEY_TRANSFER' && event.reason === 'RESCUE',
    );
    expect(transfer).toMatchObject({
      source: { kind: 'PLAYER', playerId: 'b2' }, destination: { kind: 'PLAYER', playerId: 'a1' }, amount: 250,
    });
  });

  it('pays the Bank directly when the debt is owed to the Bank', () => {
    const state = teamGame('TEAM_2V2', 'b1');
    state.players.b1.accountBalance = 0;
    state.players.b2.accountBalance = 500;
    enqueuePayments(
      state,
      [{ debtorPlayerId: 'b1', creditor: 'BANK', amount: 200, source: { kind: 'TAX', tileID: 4 } }],
      continuation(state, 'b1'),
      { now: 0, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 },
    );
    progressPaymentQueue(state, options);
    const rescue = state.boardState.paymentQueue!.rescue!;
    expect(rescue.amount).toBe(200);
    expect(acceptEmergencyRescue(state, 'b2', rescue.rescueId, options).ok).toBe(true);
    expect(state.players.b2.accountBalance).toBe(300);
    expect(state.players.b1.accountBalance).toBe(0);
  });

  it('requires the teammate to cover the entire shortfall: no offer, no partial rescue, normal bankruptcy', () => {
    const state = indebted(250, 249);
    const progress = progressPaymentQueue(state, options);
    expect(progress.status).toBe('COMPLETED');
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.players.b1).toBeUndefined();
    expect(state.boardState.finishedPlayers.b1.reason).toBe('BANKRUPT');
    expect(state.players.b2.accountBalance).toBe(249); // untouched
    // The survivor may now revive b1.
    expect(state.boardState.teamPlay.reviveWindows[0]).toMatchObject({ playerId: 'b1' });
  });

  it('is refused when the teammate\'s balance has fallen below the amount at acceptance time', () => {
    const state = indebted(250, 300);
    progressPaymentQueue(state, options);
    const rescue = state.boardState.paymentQueue!.rescue!;
    state.players.b2.accountBalance = 100;
    const result = acceptEmergencyRescue(state, 'b2', rescue.rescueId, options);
    expect(result.ok).toBe(false);
    expect(state.players.b2.accountBalance).toBe(100);
    expect(state.boardState.paymentQueue?.rescue).not.toBeNull();
  });

  it('only the offered teammate can answer, with the current offer, before it expires', () => {
    const state = indebted(250, 300);
    progressPaymentQueue(state, options);
    const rescue = state.boardState.paymentQueue!.rescue!;
    expect(acceptEmergencyRescue(state, 'a1', rescue.rescueId, options).ok).toBe(false); // the creditor
    expect(acceptEmergencyRescue(state, 'b1', rescue.rescueId, options).ok).toBe(false); // the debtor
    expect(acceptEmergencyRescue(state, 'b2', '00000000-0000-4000-8000-0000000000ff', options).ok).toBe(false);
    expect(acceptEmergencyRescue(state, 'b2', rescue.rescueId, { ...options, now: Date.parse(rescue.expiresAt) }).ok).toBe(false);
    expect(declineEmergencyRescue(state, 'a1', rescue.rescueId, options).ok).toBe(false);
    expect(state.boardState.paymentQueue?.rescue).not.toBeNull();
    expect(state.players.b2.accountBalance).toBe(300);
  });

  it('declining continues the normal bankruptcy resolution', () => {
    const state = indebted(250, 300);
    progressPaymentQueue(state, options);
    const rescue = state.boardState.paymentQueue!.rescue!;
    const result = declineEmergencyRescue(state, 'b2', rescue.rescueId, options);
    expect(result.ok).toBe(true);
    expect(state.players.b1).toBeUndefined();
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.players.b2.accountBalance).toBe(300);
    expect(state.players.a1.accountBalance).toBe(1500); // the creditor only ever receives what the debtor could pay
  });

  it('an unanswered offer expires into the same bankruptcy', () => {
    const state = indebted(250, 300);
    progressPaymentQueue(state, options);
    const offer = state.boardState.paymentQueue!.rescue!;
    const result = resolveRescueWithoutPayment(state, offer, 'EXPIRED', { ...options, now: Date.parse(offer.expiresAt) });
    expect(result.ok).toBe(true);
    expect(state.boardState.finishedPlayers.b1.reason).toBe('BANKRUPT');
    expect(state.boardState.activityFeed.events.some(
      (event) => event.type === 'EMERGENCY_RESCUE' && event.action === 'EXPIRED',
    )).toBe(true);
  });

  it('is never offered in Solo, nor to a teammate who is no longer in the game', () => {
    const solo = teamGame('SOLO', 'b1');
    solo.players.b1.accountBalance = 0;
    enqueuePayments(
      solo,
      [{ debtorPlayerId: 'b1', creditor: 'BANK', amount: 50, source: { kind: 'OTHER', description: 'x' } }],
      continuation(solo, 'b1'),
      { now: 0 },
    );
    expect(progressPaymentQueue(solo, options).status).toBe('COMPLETED');
    expect(solo.players.b1).toBeUndefined();

    const state = teamGame('TEAM_2V2', 'b1');
    state.players.b1.accountBalance = 0;
    removePlayerFromGame(state, 'b2', 'BANKRUPT');
    enqueuePayments(
      state,
      [{ debtorPlayerId: 'b1', creditor: 'BANK', amount: 50, source: { kind: 'OTHER', description: 'x' } }],
      continuation(state, 'b1'),
      { now: 0 },
    );
    progressPaymentQueue(state, options);
    expect(state.boardState.winningTeamId).toBe('TEAM_1'); // b1 was the last member: the team lost, no rescue possible
  });

  it('covers every open claim of the debtor, and a claim owed to the rescuer moves no money', () => {
    const state = teamGame('TEAM_2V2', 'b1');
    state.players.b1.accountBalance = 0;
    state.players.b2.accountBalance = 1000;
    enqueuePayments(
      state,
      [
        { debtorPlayerId: 'b1', creditor: 'PLAYER', creditorPlayerId: 'a1', amount: 100, source: { kind: 'OTHER', description: 'one' } },
        { debtorPlayerId: 'b1', creditor: 'PLAYER', creditorPlayerId: 'b2', amount: 70, source: { kind: 'OTHER', description: 'two' } },
        { debtorPlayerId: 'b1', creditor: 'PLAYER', creditorPlayerId: 'a2', amount: 30, source: { kind: 'OTHER', description: 'three' } },
      ],
      continuation(state, 'b1'),
      { now: 0, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 },
    );
    progressPaymentQueue(state, options);
    const rescue = state.boardState.paymentQueue!.rescue!;
    expect(rescue.amount).toBe(130); // the 70 owed to the rescuer costs them nothing
    const plan = planEmergencyRescue(state.boardState.paymentQueue!.orderedClaims, 0, 'b1', 'b2');
    expect(plan).toMatchObject({ shortfall: 200, payable: 130 });

    expect(acceptEmergencyRescue(state, 'b2', rescue.rescueId, options).ok).toBe(true);
    expect(state.players.b2.accountBalance).toBe(870);
    expect(state.players.a1.accountBalance).toBe(1600);
    expect(state.players.a2.accountBalance).toBe(1530);
    expect(state.players.b1).toBeDefined();
    expect(state.boardState.paymentQueue).toBeNull();
  });

  it('offers nothing when everything owed is owed to the rescuer (a free rescue would be a loophole)', () => {
    const state = teamGame('TEAM_2V2', 'b1');
    state.players.b1.accountBalance = 0;
    enqueuePayments(
      state,
      [{ debtorPlayerId: 'b1', creditor: 'PLAYER', creditorPlayerId: 'b2', amount: 40, source: { kind: 'OTHER', description: 'x' } }],
      continuation(state, 'b1'),
      { now: 0, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 },
    );
    expect(progressPaymentQueue(state, options).status).toBe('COMPLETED');
    expect(state.boardState.finishedPlayers.b1.reason).toBe('BANKRUPT');
  });

  it('ends as a decline when the asked teammate leaves the game, and the debtor is eliminated', () => {
    const state = indebted(250, 300);
    progressPaymentQueue(state, options);
    expect(state.boardState.paymentQueue?.rescue).not.toBeNull();
    const result = surrenderPlayerToBank(state, 'b2', options);
    expect(result.changed).toBe(true);
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.players.b1).toBeUndefined();
    expect(state.boardState.winningTeamId).toBe('TEAM_1'); // both of Team 2 are gone
  });

  it('is cancelled with the debtor when the debtor leaves while an offer is open', () => {
    const state = indebted(250, 300);
    progressPaymentQueue(state, options);
    surrenderPlayerToBank(state, 'b1', options);
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.players.b2).toBeDefined();
    expect(state.boardState.winner).toBeNull();
  });

  it('continues with the queue\'s other debtors after a rescue', () => {
    const state = teamGame('TEAM_2V2', 'a1');
    state.players.b1.accountBalance = 0;
    state.players.b2.accountBalance = 500;
    state.players.a2.accountBalance = 0;
    enqueuePayments(
      state,
      [
        { debtorPlayerId: 'b1', creditor: 'PLAYER', creditorPlayerId: 'a1', amount: 60, source: { kind: 'OTHER', description: 'b1' } },
        { debtorPlayerId: 'a2', creditor: 'BANK', amount: 40, source: { kind: 'OTHER', description: 'a2' } },
      ],
      continuation(state, 'a1'),
      { now: 0, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 },
    );
    progressPaymentQueue(state, options);
    const first = state.boardState.paymentQueue!.rescue!;
    expect(first.debtorPlayerId).toBe('b1');
    const result = acceptEmergencyRescue(state, 'b2', first.rescueId, options);
    expect(result.ok).toBe(true);
    // The next debtor, a2, has a teammate (a1) with 1500: a new, separate offer for a2.
    expect(state.boardState.paymentQueue?.rescue).toMatchObject({ debtorPlayerId: 'a2', rescuerPlayerId: 'a1', amount: 40 });
    expect(state.players.b2.accountBalance).toBe(440);
  });
});

describe('queue completion', () => {
  it('completes the turn after an accepted rescue through the same continuation as any other payment', () => {
    const options = { now: 1_000, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 };
    const state = teamGame('TEAM_2V2', 'b1');
    state.boardState.currentPlayer = { id: 'b1', hasMoved: true };
    state.players.b1.accountBalance = 0;
    state.players.b2.accountBalance = 300;
    enqueuePayments(
      state,
      [{ debtorPlayerId: 'b1', creditor: 'BANK', amount: 100, source: { kind: 'TAX', tileID: 4 } }],
      { playerId: 'b1', turnNumber: state.boardState.turnNumber },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000, emergencyRescueTimeoutMs: 30_000 },
    );
    progressPaymentQueue(state, options);
    const rescue = state.boardState.paymentQueue!.rescue!;
    const result = acceptEmergencyRescue(state, 'b2', rescue.rescueId, options);
    expect(result.ok && result.progress.status === 'COMPLETED' && result.progress.continuation).toBeTruthy();
    if (result.ok && result.progress.continuation) {
      completeTurnResolution(state, result.progress.continuation);
    }
    expect(state.boardState.currentPlayer.id).toBe('a1'); // slot order b1, a1, b2, a2
  });
});
