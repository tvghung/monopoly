import { describe, expect, it } from 'vitest';
import type { PublicGameState } from '@monopoly/shared';
import { REVIVE_COST, REVIVE_STARTING_CASH, REVIVE_WINDOW_SURVIVOR_TURNS } from '@monopoly/shared';
import { makeRoom, makeTeamRoom } from '../presentation/testFixtures';
import {
  getReviveStatus,
  getTeamVictorySummary,
  isTeamGame,
  PERMANENT_ELIMINATION_LABEL,
  relationBetween,
  relationLabel,
  REVIVABLE_LABEL,
  reviveTurnsLabel,
  selectRescueOffer,
  selectRevivePrompt,
  teamOfPlayer,
} from './teamView';

/** Dũng (player-d, Team 2) is bankrupt; Bình (player-b) is the survivor of the window unless a test changes it. */
function teamStateWithBankruptDung(turnsRemaining: number = REVIVE_WINDOW_SURVIVOR_TURNS, openedAtTurnNumber = 2): PublicGameState {
  const state = makeTeamRoom().gameState;
  delete state.players['player-d'];
  state.boardState.players = ['player-a', 'player-b', 'player-c'];
  state.boardState.finishedPlayers['player-d'] = {
    teamId: 'TEAM_2', name: 'Dũng', color: 'blue', characterId: 'duck', reason: 'BANKRUPT', accountBalance: 0,
  };
  state.boardState.teamPlay.reviveWindows = [{
    playerId: 'player-d',
    teamId: 'TEAM_2',
    survivorPlayerId: 'player-b',
    turnsRemaining,
    openedAtTurnNumber,
  }];
  state.boardState.turnNumber = openedAtTurnNumber + 1;
  state.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
  return state;
}

describe('relations in a 2v2 game', () => {
  it('answers "no team" in Solo for every helper', () => {
    const solo = makeRoom().gameState;
    expect(isTeamGame(solo)).toBe(false);
    expect(teamOfPlayer(solo, 'player-a')).toBeNull();
    expect(relationBetween(solo, 'player-a', 'player-b')).toBeNull();
    expect(getReviveStatus(solo, 'player-b')).toBeNull();
    expect(selectRevivePrompt(solo, 'player-a')).toBeNull();
    expect(getTeamVictorySummary(solo)).toBeNull();
  });

  it('tells self, teammate and opponent apart and labels only the latter two', () => {
    const state = makeTeamRoom().gameState;
    expect(isTeamGame(state)).toBe(true);
    expect(teamOfPlayer(state, 'player-c')).toMatchObject({ teamId: 'TEAM_1', name: 'Team 1' });
    expect(relationBetween(state, 'player-a', 'player-a')).toBe('SELF');
    expect(relationBetween(state, 'player-a', 'player-c')).toBe('TEAMMATE');
    expect(relationBetween(state, 'player-a', 'player-d')).toBe('OPPONENT');
    expect(relationBetween(state, null, 'player-d')).toBeNull();
    expect(relationLabel('TEAMMATE')).toBe('Đồng đội');
    expect(relationLabel('OPPONENT')).toBe('Đối thủ');
    expect(relationLabel('SELF')).toBeNull();
    expect(relationLabel(null)).toBeNull();
  });

  it('keeps an eliminated player on their team', () => {
    const state = teamStateWithBankruptDung();
    expect(teamOfPlayer(state, 'player-d')?.teamId).toBe('TEAM_2');
    expect(relationBetween(state, 'player-b', 'player-d')).toBe('TEAMMATE');
  });
});

describe('revive labels', () => {
  it('uses the public Vietnamese wording for every remaining count of a window', () => {
    expect(REVIVABLE_LABEL).toBe('Có thể hồi sinh');
    expect(PERMANENT_ELIMINATION_LABEL).toBe('Đã bị loại vĩnh viễn');
    expect(reviveTurnsLabel(REVIVE_WINDOW_SURVIVOR_TURNS)).toBe(`Còn ${REVIVE_WINDOW_SURVIVOR_TURNS} lượt`);
    expect(reviveTurnsLabel(2)).toBe('Còn 2 lượt');
    expect(reviveTurnsLabel(1)).toBe('Cơ hội cuối');
  });

  it('reports revivable with the turns left, permanent without a window, and nothing for a player who left', () => {
    const state = teamStateWithBankruptDung(2);
    expect(getReviveStatus(state, 'player-d')).toMatchObject({ kind: 'REVIVABLE', turnsLabel: 'Còn 2 lượt' });
    state.boardState.teamPlay.reviveWindows = [];
    expect(getReviveStatus(state, 'player-d')).toEqual({ kind: 'PERMANENT' });
    state.boardState.finishedPlayers['player-d'].reason = 'LEFT';
    expect(getReviveStatus(state, 'player-d')).toBeNull();
    expect(getReviveStatus(state, 'player-a')).toBeNull();
  });
});

describe('selectRevivePrompt', () => {
  it('offers the revive to the survivor on their own turn with the price and what the teammate returns with', () => {
    const state = teamStateWithBankruptDung();
    state.players['player-b'].accountBalance = 900;
    expect(selectRevivePrompt(state, 'player-b')).toMatchObject({
      revivedPlayerId: 'player-d',
      revivedName: 'Dũng',
      cost: REVIVE_COST,
      startingCash: REVIVE_STARTING_CASH,
      balance: 900,
      turnsLabel: `Còn ${REVIVE_WINDOW_SURVIVOR_TURNS} lượt`,
      startsThisTurn: true,
      canAfford: true,
    });
  });

  it('says when the survivor cannot afford it and when the window opened this very turn', () => {
    const state = teamStateWithBankruptDung(3, 5);
    state.boardState.turnNumber = 5;
    state.players['player-b'].accountBalance = REVIVE_COST - 1;
    expect(selectRevivePrompt(state, 'player-b')).toMatchObject({ canAfford: false, startsThisTurn: false });
  });

  it('is hidden for everyone but the survivor, off their own turn and while the turn is busy', () => {
    const state = teamStateWithBankruptDung();
    expect(selectRevivePrompt(state, 'player-a')).toBeNull();
    expect(selectRevivePrompt(state, 'player-c')).toBeNull();
    expect(selectRevivePrompt(state, null)).toBeNull();

    state.boardState.currentPlayer = { id: 'player-a', hasMoved: false };
    expect(selectRevivePrompt(state, 'player-b')).toBeNull();

    state.boardState.currentPlayer = { id: 'player-b', hasMoved: true };
    expect(selectRevivePrompt(state, 'player-b')).toBeNull();

    state.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
    state.boardState.paymentShortfall = {
      debtorPlayerId: 'player-b', creditor: 'BANK', amount: 10, remainingAmount: 10, source: { kind: 'OTHER', description: 'x' },
      actionDeadlineAt: new Date().toISOString(), remainingClaimCount: 1, rescue: null,
    };
    expect(selectRevivePrompt(state, 'player-b')).toBeNull();
  });

  it('is hidden once the game has a winner', () => {
    const state = teamStateWithBankruptDung();
    state.boardState.winner = { playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', accountBalance: 1 };
    expect(selectRevivePrompt(state, 'player-b')).toBeNull();
  });
});

describe('selectRescueOffer', () => {
  it('returns the offer only to the teammate it is addressed to', () => {
    const state = makeTeamRoom().gameState;
    const offer = {
      rescueId: 'rescue-1', debtorPlayerId: 'player-a', rescuerPlayerId: 'player-c', amount: 120, expiresAt: '2030-01-01T00:00:30.000Z',
    };
    state.boardState.paymentShortfall = {
      debtorPlayerId: 'player-a', creditor: 'BANK', amount: 120, remainingAmount: 120, source: { kind: 'OTHER', description: 'x' },
      actionDeadlineAt: offer.expiresAt, remainingClaimCount: 1, rescue: offer,
    };
    expect(selectRescueOffer(state, 'player-c')).toEqual(offer);
    expect(selectRescueOffer(state, 'player-a')).toBeNull();
    expect(selectRescueOffer(state, 'player-b')).toBeNull();
    expect(selectRescueOffer(state, null)).toBeNull();
  });
});

describe('getTeamVictorySummary', () => {
  it('lists both members of the winning team, including one eliminated earlier, and totals only the team', () => {
    const state = teamStateWithBankruptDung();
    state.boardState.winningTeamId = 'TEAM_1';
    state.boardState.winner = { playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', accountBalance: 800 };
    state.players['player-a'].accountBalance = 800;
    state.players['player-c'].accountBalance = 450;
    state.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 2 },
      3: { id: 'player-c', color: 'red', houses: 5 },
      6: { id: 'player-b', color: 'blue', houses: 4 },
    };

    const summary = getTeamVictorySummary(state)!;
    expect(summary.team).toMatchObject({ teamId: 'TEAM_1', name: 'Team 1' });
    expect(summary.members.map(member => [member.name, member.status])).toEqual([['An', null], ['Chi', null]]);
    expect(summary).toMatchObject({ totalCash: 1_250, propertyCount: 2, houseCount: 2, hotelCount: 1 });
    expect(summary.completedColorSets).toEqual(['brown']);
  });

  it('names a winning member who was bankrupt or left, since the victory is the whole team\'s', () => {
    const state = makeTeamRoom().gameState;
    delete state.players['player-c'];
    state.boardState.finishedPlayers['player-c'] = {
      teamId: 'TEAM_1', name: 'Chi', color: 'red', characterId: 'cat', reason: 'BANKRUPT', accountBalance: 0,
    };
    state.boardState.winningTeamId = 'TEAM_1';
    state.boardState.winner = { playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', accountBalance: 1_500 };

    expect(getTeamVictorySummary(state)!.members.map(member => [member.name, member.status])).toEqual([
      ['An', null], ['Chi', 'BANKRUPT'],
    ]);
  });

  it('is null until a team has won', () => {
    expect(getTeamVictorySummary(makeTeamRoom().gameState)).toBeNull();
  });
});
