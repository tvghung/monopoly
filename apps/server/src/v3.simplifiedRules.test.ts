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
  progressPaymentQueue,
  removePlayerFromGame,
  resolveTile,
  resumePaymentContinuation,
  sellPropertyToBankForPayment,
  streetRent,
  surrenderPlayerToBank,
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
    progressPaymentQueue(state, { now: 0, paymentShortfallActionTimeoutMs: 120_000 });

    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.players.p1).toBeUndefined();
    expect(state.boardState.paymentQueue).toBeNull();
  });

  it('rejects a repeated forced-sale command without a second mutation', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    addPlayer(state, 'p2', { accountBalance: 1500, color: 'blue' });
    own(state, 1, 'p1');
    own(state, 3, 'p1');
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p1',
        creditor: 'PLAYER',
        creditorPlayerId: 'p2',
        amount: 500,
        source: { kind: 'OTHER', description: 'stale sale' },
      }],
      { playerId: 'p1', turnNumber: 1 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;
    const claimId = queue.orderedClaims[0].claimId;
    const first = sellPropertyToBankForPayment(
      state,
      'p1',
      queue.operationId,
      claimId,
      1,
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    expect(first).toMatchObject({ ok: true, changed: true });
    const balanceAfterFirstSale = state.players.p1.accountBalance;
    const queueAfterFirstSale = structuredClone(state.boardState.paymentQueue);

    const repeated = sellPropertyToBankForPayment(
      state,
      'p1',
      queue.operationId,
      claimId,
      1,
      { now: 1, paymentShortfallActionTimeoutMs: 120_000 },
    );
    expect(repeated).toMatchObject({ ok: false, changed: false });
    expect(state.players.p1.accountBalance).toBe(balanceAfterFirstSale);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.paymentQueue).toEqual(queueAfterFirstSale);
  });

  it('keeps the shortfall open while another property remains', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    addPlayer(state, 'p2', { accountBalance: 1500, color: 'blue' });
    own(state, 1, 'p1');
    own(state, 3, 'p1');
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p1',
        creditor: 'PLAYER',
        creditorPlayerId: 'p2',
        amount: 500,
        source: { kind: 'OTHER', description: 'remaining property' },
      }],
      { playerId: 'p1', turnNumber: 1 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;
    const claimId = queue.orderedClaims[0].claimId;

    const sale = sellPropertyToBankForPayment(
      state,
      'p1',
      queue.operationId,
      claimId,
      1,
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    expect(sale.ok).toBe(true);
    const progress = progressPaymentQueue(state, {
      now: 1,
      paymentShortfallActionTimeoutMs: 120_000,
    });

    expect(progress.status).toBe('WAITING_FOR_LIQUIDATION');
    expect(state.players.p1).toBeDefined();
    expect(state.boardState.ownedProps[3]).toMatchObject({ id: 'p1' });
    expect(state.boardState.paymentQueue?.orderedClaims[0].remainingAmount).toBeGreaterThan(0);
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
    progressPaymentQueue(state, { now: 1, paymentShortfallActionTimeoutMs: 120_000 });

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

    bankruptActiveDebtor(state, 'p1', 'BANKRUPT');

    expect(state.players.p1).toBeUndefined();
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p2', hasMoved: false });
    expect(state.boardState.paymentQueue?.activeClaimIndex).toBe(1);
    expect(state.boardState.paymentQueue?.continuation).toEqual({
      playerId: 'p2',
      turnNumber: 2,
      resume: { kind: 'NO_TURN_CHANGE' },
    });
  });

  it('rebases the continuation when the current creditor leaves another debtor shortfall', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1500 });
    addPlayer(state, 'p2', { accountBalance: 0, color: 'blue' });
    addPlayer(state, 'p3', { accountBalance: 1500, color: 'green' });
    own(state, 1, 'p2');
    state.boardState.currentPlayer = { id: 'p1', hasMoved: true };
    state.boardState.turnNumber = 5;
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p2',
        creditor: 'PLAYER',
        creditorPlayerId: 'p1',
        amount: 500,
        source: { kind: 'OTHER', description: 'creditor leaves' },
      }],
      { playerId: 'p1', turnNumber: 5 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;

    expect(surrenderPlayerToBank(state, 'p1', {
      now: 1,
      paymentShortfallActionTimeoutMs: 120_000,
    }).changed).toBe(true);

    expect(state.players.p1).toBeUndefined();
    expect(state.players.p2).toBeDefined();
    expect(state.players.p3).toBeDefined();
    expect(state.boardState.currentPlayer).toEqual({ id: 'p2', hasMoved: false });
    expect(state.boardState.turnNumber).toBe(6);
    expect(state.boardState.ownedProps[1]).toMatchObject({ id: 'p2' });
    expect(state.boardState.paymentQueue?.orderedClaims[0]).toMatchObject({
      debtorPlayerId: 'p2',
      creditor: 'BANK',
      remainingAmount: 500,
    });
    expect(state.boardState.paymentQueue?.orderedClaims[0].creditorPlayerId).toBeUndefined();
    expect(state.boardState.paymentQueue?.continuation).toEqual({
      playerId: 'p2',
      turnNumber: 6,
      resume: { kind: 'NO_TURN_CHANGE' },
    });

    state.players.p2.accountBalance = 500;
    const progress = progressPaymentQueue(state, {
      now: 2,
      paymentShortfallActionTimeoutMs: 120_000,
    });
    expect(progress.continuation).toEqual({
      playerId: 'p2',
      turnNumber: 6,
      resume: { kind: 'NO_TURN_CHANGE' },
    });
    if (progress.continuation) resumePaymentContinuation(state, progress.continuation);
    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.turnNumber).toBe(6);
  });

  it('preserves an unrelated forced-sale proposal when another player leaves', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1500 });
    addPlayer(state, 'p2', { accountBalance: 0, color: 'blue' });
    addPlayer(state, 'p3', { accountBalance: 1500, color: 'green' });
    own(state, 1, 'p2');
    state.boardState.currentPlayer = { id: 'p1', hasMoved: true };
    state.boardState.turnNumber = 5;
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p2',
        creditor: 'PLAYER',
        creditorPlayerId: 'p1',
        amount: 500,
        source: { kind: 'OTHER', description: 'proposal survives' },
      }],
      { playerId: 'p1', turnNumber: 5 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;
    const proposal = createForcedSaleProposal(
      state,
      'p2',
      queue.operationId,
      queue.orderedClaims[0].claimId,
      1,
      'p3',
      0,
    );
    expect(proposal).not.toBeNull();

    expect(surrenderPlayerToBank(state, 'p1', {
      now: 1,
      paymentShortfallActionTimeoutMs: 120_000,
    }).changed).toBe(true);

    expect(state.privateState.forcedSaleProposal).toEqual(proposal);
    expect(state.privateState.forcedSaleProposal).toMatchObject({
      sellerPlayerId: 'p2',
      buyerPlayerId: 'p3',
      paymentOperationId: queue.operationId,
      claimId: queue.orderedClaims[0].claimId,
    });
  });

  it('clears a forced-sale proposal when its seller or buyer leaves', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1500 });
    addPlayer(state, 'p2', { accountBalance: 0, color: 'blue' });
    addPlayer(state, 'p3', { accountBalance: 1500, color: 'green' });
    own(state, 1, 'p2');
    state.boardState.currentPlayer = { id: 'p1', hasMoved: true };
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p2',
        creditor: 'PLAYER',
        creditorPlayerId: 'p1',
        amount: 500,
        source: { kind: 'OTHER', description: 'proposal participant leaves' },
      }],
      { playerId: 'p1', turnNumber: 1 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;
    expect(createForcedSaleProposal(
      state,
      'p2',
      queue.operationId,
      queue.orderedClaims[0].claimId,
      1,
      'p3',
      0,
    )).not.toBeNull();

    expect(removePlayerFromGame(state, 'p3')).toBe(true);
    expect(state.privateState.forcedSaleProposal).toBeNull();
  });

  it('does not rewrite a valid continuation when an unrelated non-current player leaves', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1500 });
    addPlayer(state, 'p2', { accountBalance: 0, color: 'blue' });
    addPlayer(state, 'p3', { accountBalance: 1500, color: 'green' });
    own(state, 1, 'p2');
    state.boardState.currentPlayer = { id: 'p1', hasMoved: true };
    state.boardState.turnNumber = 5;
    const queue = createPaymentQueue(
      [{
        debtorPlayerId: 'p2',
        creditor: 'PLAYER',
        creditorPlayerId: 'p1',
        amount: 500,
        source: { kind: 'OTHER', description: 'unrelated removal' },
      }],
      { playerId: 'p1', turnNumber: 5 },
      { now: 0, paymentShortfallActionTimeoutMs: 120_000 },
    );
    state.boardState.paymentQueue = queue;

    expect(removePlayerFromGame(state, 'p3')).toBe(true);
    expect(state.boardState.currentPlayer).toEqual({ id: 'p1', hasMoved: true });
    expect(state.boardState.turnNumber).toBe(5);
    expect(state.boardState.paymentQueue?.continuation).toEqual({
      playerId: 'p1',
      turnNumber: 5,
    });
  });
});
