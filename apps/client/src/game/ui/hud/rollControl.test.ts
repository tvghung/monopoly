import type { PublicGameState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import type { PresentationState } from '../../presentation/store/types';
import { canRollForState, shouldShowRollButton } from './rollControlLogic';

const presentation = (overrides: Partial<PresentationState> = {}): PresentationState => ({
  displayLogs: [],
  displayPositions: { me: 0 },
  settledPositions: { me: 0 },
  displayActivePlayerId: 'me',
  displayDice: { dice1: 0, dice2: 0 },
  displayRollSequence: 0,
  diceRoll: null,
  status: 'idle',
  tileImpacts: [],
  characterMovements: [],
  characterLandings: [],
  characterReactions: [],
  balanceDeltas: [],
  ownershipChanges: [],
  developmentChanges: [],
  goCrossings: [],
  destinationPreview: null,
  moneyTransfers: [],
  cardPresentation: null,
  animationSpeedMultiplier: 1,
  presentationResetEpoch: 0,
  ...overrides,
});

const state = (overrides: Partial<PublicGameState> = {}): PublicGameState => ({
  boardState: {
    gameStarted: true,
    players: ['me'],
    finishedPlayers: {},
    turnNumber: 1,
    currentPlayer: { id: 'me', hasMoved: false },
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    rollSequence: 0,
    gameplayEvents: { sequence: 0, events: [] },
    ownedProps: {},
    winner: null,
    paymentShortfall: null,
  },
  players: {
    me: {
      name: 'An',
      currentTile: 0,
      color: 'red',
      characterId: 'dog',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      getOutOfJailCardCount: 0,
    },
  },
  turnInfo: {},
  deckCounts: { chance: 16, chest: 16 },
  loaded: true,
  ...overrides,
});

const input = {
  connected: true,
  canMutate: true,
  playerId: 'me',
  pendingRequest: false,
};

describe('roll control gating', () => {
  it('hides Roll for an opponent and retains it only for a local pending request', () => {
    expect(shouldShowRollButton('other', 'me', false, false)).toBe(false);
    expect(shouldShowRollButton('me', 'me', true, false)).toBe(true);
    expect(shouldShowRollButton('me', 'me', false, true)).toBe(true);
  });

  it('requires the complete local turn and settled presentation', () => {
    expect(canRollForState(state(), presentation(), input)).toBe(true);
    expect(canRollForState(state({ boardState: { ...state().boardState, currentPlayer: { id: 'other', hasMoved: false } } }), presentation(), input)).toBe(false);
    expect(canRollForState(state({ boardState: { ...state().boardState, currentPlayer: { id: 'me', hasMoved: true } } }), presentation(), input)).toBe(false);
    expect(canRollForState(state(), presentation({ settledPositions: { me: 3 } }), input)).toBe(false);
  });

  it('mirrors public blocking state and local pending lock', () => {
    expect(canRollForState(state({ turnInfo: { pendingLandingDecision: { kind: 'PURCHASE', operationId: 'op', playerId: 'me', tileID: 1 } } }), presentation(), input)).toBe(false);
    expect(canRollForState(state({ boardState: { ...state().boardState, paymentShortfall: { debtorPlayerId: 'me', creditor: 'BANK', creditorPlayerId: undefined, amount: 1, remainingAmount: 1, actionDeadlineAt: new Date().toISOString(), source: { kind: 'OTHER', description: 'test' }, remainingClaimCount: 1, sellableProperties: [] } } }), presentation(), input)).toBe(false);
    expect(canRollForState(state(), presentation(), { ...input, pendingRequest: true })).toBe(false);
  });
});
