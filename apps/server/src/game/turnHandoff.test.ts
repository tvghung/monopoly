import { describe, expect, it } from 'vitest';

import {
  createCanonicalDecks,
  gameCardsById,
  type GameState,
  type PlayerId,
} from '@monopoly/shared';

import { createFreshPlayer, freshState } from '../rooms';
import {
  checkBalance,
  createPaymentQueue,
  nextTurn,
  progressPaymentQueue,
  removePlayerFromGame,
  startTeamMatch,
  surrenderPlayerToBank,
} from './index';

const SOLO_COLORS = ['red', 'blue', 'green', 'yellow'] as const;
const SOLO_MASCOTS = ['dog', 'cat', 'panda', 'elephant'] as const;

function soloGame(...playerIds: PlayerId[]): GameState {
  const state = freshState();
  state.boardState.gameStarted = true;
  state.boardState.gameMode = 'SOLO';
  state.boardState.turnNumber = 10;
  playerIds.forEach((playerId, index) => {
    state.players[playerId] = createFreshPlayer(
      playerId,
      SOLO_COLORS[index],
      SOLO_MASCOTS[index],
      'TEAM_1',
    );
  });
  state.boardState.players = [...playerIds];
  state.boardState.currentPlayer = { id: playerIds[0] ?? '', hasMoved: true };
  return state;
}

function teamGame(): GameState {
  const state = freshState();
  state.boardState.gameStarted = true;
  state.boardState.gameMode = 'TEAM_2V2';
  state.boardState.turnNumber = 10;
  const players = [
    ['a1', 'TEAM_1', 'red', 'dog'],
    ['b1', 'TEAM_2', 'blue', 'cat'],
    ['a2', 'TEAM_1', 'red', 'panda'],
    ['b2', 'TEAM_2', 'blue', 'elephant'],
  ] as const;
  for (const [playerId, teamId, color, mascot] of players) {
    state.players[playerId] = createFreshPlayer(playerId, color, mascot, teamId);
  }
  startTeamMatch(state, 'a1', { TEAM_1: ['a1', 'a2'], TEAM_2: ['b1', 'b2'] });
  state.boardState.currentPlayer = { id: 'a1', hasMoved: true };
  state.boardState.turnNumber = 10;
  return state;
}

function putInJail(state: GameState, playerId: PlayerId, elapsedRounds: number): void {
  state.players[playerId].isJail = true;
  state.players[playerId].jailOpponentRoundsElapsed = elapsedRounds;
}

function jailReleaseEvents(state: GameState) {
  return state.boardState.gameplayEvents.events.filter(event => event.type === 'JAIL_RELEASED');
}

function cardCount(state: GameState, cardId: string): number {
  return Object.values(state.privateState.decks).flatMap(deck => deck.drawPile)
    .filter(id => id === cardId).length
    + Object.values(state.players).flatMap(player => player.heldJailFreeCardIds)
      .filter(id => id === cardId).length;
}

describe('authoritative turn handoff jail progression', () => {
  it('keeps an unjailed successor unchanged during an ordinary rotation', () => {
    const state = soloGame('p1', 'p2', 'p3');

    nextTurn(state);

    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.turnNumber).toBe(11);
    expect(state.players.p2).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(state)).toHaveLength(0);
  });

  it('uses the ordinary handoff boundary once and does not consume a held jail-free card', () => {
    const state = soloGame('p1', 'p2', 'p3');
    const cardId = 'chance-jail-free';
    const chanceDeck = state.privateState.decks[gameCardsById[cardId].sourceDeck];
    chanceDeck.drawPile = chanceDeck.drawPile.filter(id => id !== cardId);
    state.players.p2.heldJailFreeCardIds = [cardId];
    putInJail(state, 'p2', 0);

    nextTurn(state);

    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.turnNumber).toBe(11);
    expect(state.players.p2).toMatchObject({ isJail: true, jailOpponentRoundsElapsed: 1 });
    expect(state.players.p2.accountBalance).toBe(1500);
    expect(state.players.p2.heldJailFreeCardIds).toEqual([cardId]);
    expect(cardCount(state, cardId)).toBe(1);
    expect(jailReleaseEvents(state)).toHaveLength(0);

    nextTurn(state);
    nextTurn(state);
    nextTurn(state);

    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.turnNumber).toBe(14);
    expect(state.players.p2).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(state)).toHaveLength(1);
    expect(jailReleaseEvents(state)[0]).toMatchObject({
      type: 'JAIL_RELEASED',
      playerId: 'p2',
      cause: 'TIME_SERVED',
    });
    expect(state.players.p2.heldJailFreeCardIds).toEqual([cardId]);
    expect(cardCount(state, cardId)).toBe(1);

    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.boardState.turnNumber).toBe(15);
    expect(jailReleaseEvents(state)).toHaveLength(1);
  });

  it('prepares multiple jailed successors in turn order without advancing anyone twice', () => {
    const state = soloGame('p1', 'p2', 'p3', 'p4');
    putInJail(state, 'p2', 0);
    putInJail(state, 'p3', 1);

    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.players.p2).toMatchObject({ isJail: true, jailOpponentRoundsElapsed: 1 });
    expect(state.players.p3).toMatchObject({ isJail: true, jailOpponentRoundsElapsed: 1 });
    expect(state.boardState.turnNumber).toBe(11);

    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.players.p3).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(state)).toHaveLength(1);

    nextTurn(state);
    nextTurn(state);
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.players.p2).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(state)).toHaveLength(2);
    expect(state.boardState.turnNumber).toBe(15);
  });

  it('applies the same single jail progression when the current player leaves', () => {
    const state = soloGame('p1', 'p2', 'p3');
    putInJail(state, 'p2', 1);
    const heldCards = ['chance-jail-free', 'chest-jail-free'] as const;
    for (const cardId of heldCards) {
      const deck = state.privateState.decks[gameCardsById[cardId].sourceDeck];
      deck.drawPile = deck.drawPile.filter(id => id !== cardId);
    }
    state.players.p1.heldJailFreeCardIds = [...heldCards];
    const successorBalance = state.players.p2.accountBalance;

    expect(surrenderPlayerToBank(state, 'p1').changed).toBe(true);

    expect(state.players.p1).toBeUndefined();
    expect(state.boardState.finishedPlayers.p1.reason).toBe('LEFT');
    expect(state.boardState.players).toEqual(['p2', 'p3']);
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p2', hasMoved: false });
    expect(state.boardState.turnNumber).toBe(11);
    expect(state.players.p2).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(state.players.p2.accountBalance).toBe(successorBalance);
    expect(jailReleaseEvents(state)).toHaveLength(1);
    for (const cardId of heldCards) {
      expect(state.privateState.decks[gameCardsById[cardId].sourceDeck].drawPile.at(-1)).toBe(cardId);
      expect(cardCount(state, cardId)).toBe(1);
    }

    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.boardState.turnNumber).toBe(12);
    expect(jailReleaseEvents(state)).toHaveLength(1);
  });

  it('applies the same single jail progression when the current player becomes bankrupt', () => {
    const state = soloGame('p1', 'p2', 'p3');
    putInJail(state, 'p2', 1);
    state.players.p1.accountBalance = 0;
    state.privateState.decks = createCanonicalDecks();
    const cardId = 'chest-jail-free';
    state.privateState.decks[gameCardsById[cardId].sourceDeck].drawPile = state.privateState.decks[
      gameCardsById[cardId].sourceDeck
    ].drawPile.filter(id => id !== cardId);
    state.players.p1.heldJailFreeCardIds = [cardId];
    state.boardState.paymentQueue = createPaymentQueue([{
      debtorPlayerId: 'p1',
      creditor: 'PLAYER',
      creditorPlayerId: 'p3',
      amount: 2500,
      source: { kind: 'OTHER', description: 'turn handoff regression' },
    }], { playerId: 'p1', turnNumber: 10 }, { now: 0 });

    const result = progressPaymentQueue(state, { now: 1 });

    expect(result.status).toBe('COMPLETED');
    expect(state.players.p1).toBeUndefined();
    expect(state.boardState.finishedPlayers.p1.reason).toBe('BANKRUPT');
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p2', hasMoved: false });
    expect(state.boardState.turnNumber).toBe(11);
    expect(state.players.p2).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(state)).toHaveLength(1);
    expect(cardCount(state, cardId)).toBe(1);
  });

  it('does not progress jail for non-current leave or bankruptcy', () => {
    const leaving = soloGame('p1', 'p2', 'p3');
    putInJail(leaving, 'p3', 0);
    expect(surrenderPlayerToBank(leaving, 'p2').changed).toBe(true);
    expect(leaving.boardState.currentPlayer.id).toBe('p1');
    expect(leaving.boardState.turnNumber).toBe(10);
    expect(leaving.players.p3).toMatchObject({ isJail: true, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(leaving)).toHaveLength(0);

    const bankrupt = soloGame('p1', 'p2', 'p3');
    bankrupt.players.p2.accountBalance = -1;
    putInJail(bankrupt, 'p3', 0);
    checkBalance(bankrupt);
    expect(bankrupt.players.p2).toBeUndefined();
    expect(bankrupt.boardState.currentPlayer.id).toBe('p1');
    expect(bankrupt.boardState.turnNumber).toBe(10);
    expect(bankrupt.players.p3).toMatchObject({ isJail: true, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(bankrupt)).toHaveLength(0);
  });

  it('skips eliminated players and progresses the surviving successor once after a bankruptcy batch', () => {
    const state = soloGame('p1', 'p2', 'p3', 'p4');
    state.players.p1.accountBalance = -1;
    state.players.p2.accountBalance = -2;
    putInJail(state, 'p3', 1);

    checkBalance(state, true);

    expect(state.boardState.players).toEqual(['p3', 'p4']);
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p3', hasMoved: false });
    expect(state.boardState.turnNumber).toBe(11);
    expect(state.players.p3).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(state.boardState.finishedPlayers.p1.reason).toBe('BANKRUPT');
    expect(state.boardState.finishedPlayers.p2.reason).toBe('BANKRUPT');
    expect(jailReleaseEvents(state)).toHaveLength(1);

    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p4');
    expect(state.boardState.turnNumber).toBe(12);
    expect(jailReleaseEvents(state)).toHaveLength(1);
  });

  it('does not progress a jailed winner when removal finishes the game', () => {
    const state = soloGame('p1', 'p2');
    putInJail(state, 'p2', 1);

    expect(surrenderPlayerToBank(state, 'p1').changed).toBe(true);

    expect(state.boardState.winner).toMatchObject({ playerId: 'p2' });
    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.players.p2).toMatchObject({ isJail: true, jailOpponentRoundsElapsed: 1 });
    expect(state.boardState.turnNumber).toBe(10);
    expect(jailReleaseEvents(state)).toHaveLength(0);
  });

  it('keeps the 2v2 successor slot order and applies jail progression to the selected teammate', () => {
    const state = teamGame();
    putInJail(state, 'b1', 1);

    expect(removePlayerFromGame(state, 'a1', 'LEFT')).toBe(true);

    expect(state.boardState.players).toEqual(['b1', 'a2', 'b2']);
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'b1', hasMoved: false });
    expect(state.boardState.turnNumber).toBe(11);
    expect(state.players.b1).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(state)).toHaveLength(1);
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('a2');
    expect(state.boardState.turnNumber).toBe(12);
    expect(jailReleaseEvents(state)).toHaveLength(1);
  });

  it('does not advance again when the same removal is retried', () => {
    const state = soloGame('p1', 'p2', 'p3');
    putInJail(state, 'p2', 1);

    expect(removePlayerFromGame(state, 'p1', 'LEFT')).toBe(true);
    expect(removePlayerFromGame(state, 'p1', 'LEFT')).toBe(false);

    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.turnNumber).toBe(11);
    expect(state.players.p2).toMatchObject({ isJail: false, jailOpponentRoundsElapsed: 0 });
    expect(jailReleaseEvents(state)).toHaveLength(1);
  });
});
