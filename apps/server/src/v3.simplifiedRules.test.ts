import { describe, expect, it } from 'vitest';
import {
  createCanonicalDecks,
  type GameState,
  type Player,
} from '@monopoly/shared';
import {
  acceptForcedSaleProposal,
  bankruptActiveDebtor,
  createForcedSaleProposal,
  createPaymentQueue,
  forcedSaleGrossPrice,
  forcedSaleNetProceeds,
  handleJailRoll,
  nextTurn,
  resolveTile,
  sellPropertyToBankForPayment,
  streetRent,
} from './game';
import { tileState } from '@monopoly/shared';

const makePlayer = (over: Partial<Player> = {}): Player => ({
  name: 'Player',
  currentTile: 0,
  color: 'red',
  accountBalance: 1500,
  isJail: false,
  jailOpponentRoundsElapsed: 0,
  heldJailFreeCardIds: [],
  ...over,
});

const makeState = (): GameState => ({
  boardState: {
    gameStarted: true,
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false },
    turnNumber: 1,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    ownedProps: {},
    openMarket: {},
    winner: null,
    paymentQueue: null,
  },
  players: {},
  turnInfo: {},
  privateState: { decks: createCanonicalDecks(), forcedSaleProposal: null },
  loaded: true,
});

const addPlayer = (state: GameState, id: string, over: Partial<Player> = {}): void => {
  state.players[id] = makePlayer(over);
  state.boardState.players = Object.keys(state.players);
  if (!state.boardState.currentPlayer.id) state.boardState.currentPlayer.id = id;
};

const own = (
  state: GameState,
  tileID: number,
  playerId: string,
  over: Partial<GameState['boardState']['ownedProps'][number]> = {},
): void => {
  state.boardState.ownedProps[tileID] = {
    id: playerId,
    color: state.players[playerId]?.color ?? 'red',
    houses: 0,
    mortgaged: false,
    ...over,
  };
};

describe('simplified v3 rules', () => {
  it('uses base street rent even when the owner has the full colour group', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1');
    own(state, 3, 'p1');

    expect(streetRent(state, 1)).toBe(tileState[1].rent);
  });

  it('derives forced-sale gross and net values without a mortgage double dip', () => {
    const tileID = 1;
    const price = tileState[tileID].price ?? 0;
    const houseCost = tileState[tileID].houseCost ?? 0;
    const gross = forcedSaleGrossPrice(tileID, 2);

    expect(gross).toBe(Math.floor((price + houseCost * 2) * 0.7));
    expect(forcedSaleNetProceeds(tileID, 2, true)).toBe(
      gross - Math.floor(price / 2),
    );
  });

  it('creates a durable development decision at the level present on landing', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1 });
    own(state, 1, 'p1', { houses: 2 });

    resolveTile(state, 'p1', 0, { playerId: 'p1', turnNumber: 1 });

    expect(state.turnInfo.pendingDevelopmentDecision).toMatchObject({
      playerId: 'p1',
      tileID: 1,
      levelAtLanding: 2,
      kind: 'HOUSES',
    });
    expect(state.turnInfo.pendingDevelopmentDecision?.operationId).toEqual(expect.any(String));
  });

  it('does not charge the tax/expense tile', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 4, accountBalance: 1000 });

    resolveTile(state, 'p1', 0, { playerId: 'p1', turnNumber: 1 });

    expect(state.players.p1.accountBalance).toBe(1000);
    expect(state.boardState.paymentQueue).toBeNull();
  });

  it('counts jailed opponent cycles and releases before the second jailed turn', () => {
    const state = makeState();
    addPlayer(state, 'p1', { isJail: true, jailOpponentRoundsElapsed: 0 });
    addPlayer(state, 'p2');
    state.boardState.currentPlayer.id = 'p1';

    handleJailRoll(state, 'p1', { dice1: 1, dice2: 2 });
    expect(state.players.p1.isJail).toBe(true);
    expect(state.boardState.currentPlayer.id).toBe('p2');

    nextTurn(state);
    expect(state.players.p1.jailOpponentRoundsElapsed).toBe(1);
    nextTurn(state);
    nextTurn(state);

    expect(state.players.p1.isJail).toBe(false);
    expect(state.players.p1.jailOpponentRoundsElapsed).toBe(0);
  });

  it('sells a shortfall property to the Bank at the authoritative net value', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    own(state, 1, 'p1', { mortgaged: true });
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p1',
        creditor: 'BANK',
        amount: 100,
        source: { kind: 'OTHER', description: 'test' },
      }],
      { playerId: 'p1', turnNumber: 1 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;

    sellPropertyToBankForPayment(
      state,
      'p1',
      queue.operationId,
      queue.orderedClaims[0].claimId,
      1,
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );

    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.players.p1.accountBalance).toBe(0);
    expect(state.boardState.paymentQueue?.orderedClaims[0].remainingAmount).toBe(
      100 - forcedSaleNetProceeds(1, 0, true),
    );
  });

  it('accepts a forced-sale proposal only through the active payment claim', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    addPlayer(state, 'p2', { accountBalance: 1000, color: 'blue' });
    own(state, 1, 'p1');
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p1',
        creditor: 'BANK',
        amount: forcedSaleGrossPrice(1, 0),
        source: { kind: 'OTHER', description: 'test' },
      }],
      { playerId: 'p1', turnNumber: 1 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;
    const claimId = queue.orderedClaims[0].claimId;

    const proposal = createForcedSaleProposal(state, 'p1', queue.operationId, claimId, 1, 'p2', 0);
    expect(proposal).not.toBeNull();
    expect(acceptForcedSaleProposal(state, 'p2', proposal?.proposalId ?? '', {
      now: 1,
      paymentShortfallActionTimeoutMs: 120_000,
    })).not.toBeNull();

    expect(state.boardState.ownedProps[1]).toMatchObject({ id: 'p2', mortgaged: false });
    expect(state.players.p2.accountBalance).toBe(1000 - forcedSaleGrossPrice(1, 0));
    expect(state.players.p1.accountBalance).toBe(0);
    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.privateState.forcedSaleProposal).toBeNull();
  });

  it('rebases a remaining payment queue when its current debtor is eliminated', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    addPlayer(state, 'p2', { accountBalance: 1000, color: 'blue' });
    addPlayer(state, 'p3', { accountBalance: 0, color: 'green' });
    state.boardState.currentPlayer = { id: 'p1', hasMoved: true };
    const queue = createPaymentQueue(
      [
        {
          debtorPlayerId: 'p1',
          creditor: 'PLAYER',
          creditorPlayerId: 'p2',
          amount: 100,
          source: { kind: 'OTHER', description: 'first' },
        },
        {
          debtorPlayerId: 'p3',
          creditor: 'PLAYER',
          creditorPlayerId: 'p2',
          amount: 100,
          source: { kind: 'OTHER', description: 'second' },
        },
      ],
      { playerId: 'p1', turnNumber: 1 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;

    bankruptActiveDebtor(state, 'p1', 'BANKRUPT', {
      now: 0,
      paymentShortfallActionTimeoutMs: 120_000,
    });

    expect(state.players.p1).toBeUndefined();
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p2', hasMoved: false });
    expect(state.boardState.paymentQueue?.activeClaimIndex).toBe(1);
    expect(state.boardState.paymentQueue?.continuation).toEqual({
      playerId: 'p2',
      turnNumber: 2,
      resume: { kind: 'NO_TURN_CHANGE' },
    });
  });
});
