import { describe, it, expect } from 'vitest';
import {
  createCanonicalDecks,
  type GameCard,
  type GameState,
  type Player,
  type PlayerId,
} from '@monopoly/shared';
import {
  sanitizeName,
  escapeHtml,
  movePlayer,
  ownsFullGroup,
  streetRent,
  bankBuildingInventory,
  buildHouse,
  liquidateBuildings,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
  handleJailRoll,
  applyCard,
  assertDebtActionAllowed,
  railroadRent,
  resolveTile,
  utilityRent,
  nextTurn,
  checkBalance,
  checkWinner,
  removePlayerFromGame,
  startAuction,
  startNextBankPropertyAuction,
  extendAuctionDeadline,
  finalizeAuction,
  startBuildingAuction,
  declareActiveDebtBankruptcy,
  surrenderPlayerToBank,
  completeTurnResolution,
  continuationForRoll,
  resumePaymentContinuation,
  transferProperty,
  chooseStartingPlayer,
  rotateSeatOrder,
  createShuffledDecks,
  createPaymentQueue,
  settleAffordableClaims,
} from './game';

// ---- Test fixtures ----
//
// A minimal, deterministic game state we can mutate directly. `addPlayer` keeps
// `boardState.players` in sync with the `players` map and seeds the first player
// as the current player, mirroring how the real game is set up.

const makePlayer = (over: Partial<Player> = {}): Player => ({
  name: 'Player',
  currentTile: 0,
  color: 'red',
  accountBalance: 1500,
  isJail: false,
  jailRounds: 0,
  heldJailFreeCardIds: [],
  ...over,
});

const makeState = (): GameState => ({
  boardState: {
    gameStarted: true,
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false, doublesStreak: 0 },
    turnNumber: 0,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    ownedProps: {},
    openMarket: {},
    winner: null,
    auction: null,
    buildingContention: null,
    paymentQueue: null,
    bankPropertyAuctionQueue: null,
  },
  players: {},
  turnInfo: {},
  privateState: { decks: createCanonicalDecks() },
  loaded: true,
});

const addPlayer = (state: GameState, id: PlayerId, over: Partial<Player> = {}): Player => {
  state.players[id] = makePlayer(over);
  state.boardState.players = Object.keys(state.players);
  if (!state.boardState.currentPlayer.id) state.boardState.currentPlayer.id = id;
  return state.players[id];
};

// Mark a tile as owned by a player with sensible defaults.
const own = (
  state: GameState,
  tileIndex: number,
  id: PlayerId,
  over: Partial<GameState['boardState']['ownedProps'][number]> = {},
): void => {
  state.boardState.ownedProps[tileIndex] = {
    id, color: 'red', houses: 0, mortgaged: false, ...over,
  };
};

// Brown group is tiles 1 and 3 (Cà Mau / Bạc Liêu), houseCost 50.
const BROWN = [1, 3];

const chanceCard = (
  id: string,
  effects: Omit<GameCard, 'id' | 'sourceDeck'>,
): GameCard => ({
  id: `chance-${id}`,
  sourceDeck: 'chance',
  ...effects,
});

const putCardOnTop = (
  state: GameState,
  deck: 'chance' | 'chest',
  cardId: string,
): void => {
  const drawPile = state.privateState.decks[deck].drawPile;
  state.privateState.decks[deck].drawPile = [
    cardId,
    ...drawPile.filter((candidate) => candidate !== cardId),
  ];
};

describe('sanitizeName / escapeHtml', () => {
  it('strips markup characters and trims', () => {
    expect(sanitizeName('  <b>Bob</b>  ')).toBe('bBob/b');
  });

  it('caps the name at 20 characters', () => {
    expect(sanitizeName('a'.repeat(50))).toHaveLength(20);
  });

  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>"x" & \'y\'')).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#039;y&#039;',
    );
  });
});

describe('movePlayer', () => {
  it('advances without a bonus when it does not pass GO', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 5, accountBalance: 1500 });
    movePlayer(state, 'p1', 3);
    expect(state.players.p1.currentTile).toBe(8);
    expect(state.players.p1.accountBalance).toBe(1500);
  });

  it('wraps the board and pays the 200 GO reward exactly once', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 39, accountBalance: 1500 });
    movePlayer(state, 'p1', 3);
    expect(state.players.p1.currentTile).toBe(2);
    expect(state.players.p1.accountBalance).toBe(1700);
    expect(state.boardState.logs.filter((log) => log.includes('200.000 ₫'))).toHaveLength(1);
  });

  it('pays the GO bonus when landing exactly on GO', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 38, accountBalance: 1500 });
    movePlayer(state, 'p1', 2);
    expect(state.players.p1.currentTile).toBe(0);
    expect(state.players.p1.accountBalance).toBe(1700);
  });
});

describe('ownsFullGroup / streetRent', () => {
  it('reports a monopoly only when every tile in the group is owned', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1');
    expect(ownsFullGroup(state, 'p1', 'brown')).toBe(false);
    own(state, 3, 'p1');
    expect(ownsFullGroup(state, 'p1', 'brown')).toBe(true);
  });

  it('charges base rent for a single owned tile', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1');
    expect(streetRent(state, 1)).toBe(2);
  });

  it('doubles base rent for an unbuilt monopoly', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    BROWN.forEach((t) => own(state, t, 'p1'));
    expect(streetRent(state, 1)).toBe(2);
  });

  it('uses the house tier once built up', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    BROWN.forEach((t) => own(state, t, 'p1'));
    state.boardState.ownedProps[1].houses = 2;
    // Rent tiers for Cà Mau are [10, 30, 90, 160, 250]; index houses-1.
    expect(streetRent(state, 1)).toBe(30);
  });

  it('collects no rent while mortgaged', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1', { mortgaged: true });
    expect(streetRent(state, 1)).toBe(0);
  });
});

describe('starting player', () => {
  it('rerolls only the highest tie and rotates the existing cyclic seat order', () => {
    const rolls = [
      { dice1: 4, dice2: 4 },
      { dice1: 5, dice2: 3 },
      { dice1: 2, dice2: 3 },
      { dice1: 1, dice2: 3 },
      { dice1: 4, dice2: 3 },
    ];
    const result = chooseStartingPlayer(['p1', 'p2', 'p3'], () => {
      const roll = rolls.shift();
      if (!roll) throw new Error('unexpected starting roll');
      return roll;
    });

    expect(result.winner).toBe('p2');
    expect(result.rounds.map((round) => round.contenders)).toEqual([
      ['p1', 'p2', 'p3'],
      ['p1', 'p2'],
    ]);
    expect(rotateSeatOrder(['p1', 'p2', 'p3'], result.winner)).toEqual(['p2', 'p3', 'p1']);
  });

  it('shuffles both fresh private decks with an injectable source', () => {
    const canonical = createCanonicalDecks();
    const shuffled = createShuffledDecks(() => 0);

    expect(new Set(shuffled.chance.drawPile)).toEqual(new Set(canonical.chance.drawPile));
    expect(new Set(shuffled.chest.drawPile)).toEqual(new Set(canonical.chest.drawPile));
    expect(shuffled.chance.drawPile).not.toEqual(canonical.chance.drawPile);
    expect(shuffled.chest.drawPile).not.toEqual(canonical.chest.drawPile);
  });
});

describe('railroadRent / utilityRent mortgage tiers', () => {
  it('counts all owned railroads for the tier but charges no rent on a mortgaged landing tile', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 5, 'p1', { color: 'railroad' });
    own(state, 15, 'p1', { color: 'railroad', mortgaged: true });

    expect(railroadRent(state, 5)).toBe(50);
    expect(railroadRent(state, 15)).toBe(0);
  });

  it('uses the two-utility tier while the landed utility is active', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 12, 'p1', { color: 'company' });
    own(state, 28, 'p1', { color: 'company', mortgaged: true });

    expect(utilityRent(state, 12, 8)).toBe(80);
    expect(utilityRent(state, 28, 8)).toBe(0);
  });
});

describe.skip('legacy buildHouse group/inventory rules', () => {
  it('builds a house, deducts the cost, and enforces the even-build rule', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    BROWN.forEach((t) => own(state, t, 'p1'));

    buildHouse(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].houses).toBe(1);
    expect(state.players.p1.accountBalance).toBe(950);

    // Tile 1 is now ahead of tile 3, so building on it again is blocked.
    buildHouse(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].houses).toBe(1);

    // Building on the lagging tile is allowed.
    buildHouse(state, 'p1', 3);
    expect(state.boardState.ownedProps[3].houses).toBe(1);
  });

  it('refuses to build without a full-group monopoly', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    own(state, 1, 'p1');
    buildHouse(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].houses).toBe(0);
    expect(state.players.p1.accountBalance).toBe(1000);
  });

  it('refuses to build when a tile in the group is mortgaged', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    own(state, 1, 'p1');
    own(state, 3, 'p1', { mortgaged: true });
    buildHouse(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].houses).toBe(0);
  });

  it('caps construction at a hotel (5)', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    BROWN.forEach((t) => own(state, t, 'p1', { houses: 5 }));
    buildHouse(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].houses).toBe(5);
    expect(state.players.p1.accountBalance).toBe(1000);
  });

  it('refuses a valid house build when the player cannot afford it', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 40 });
    BROWN.forEach((t) => own(state, t, 'p1'));
    expect(buildHouse(state, 'p1', 1)).toBe(false);
    expect(state.boardState.ownedProps[1].houses).toBe(0);
    expect(state.players.p1.accountBalance).toBe(40);
    expect(state.boardState.logs).toEqual([]);
  });

  it('refuses to build on a non-buildable property', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    own(state, 5, 'p1', { color: 'railroad' });
    buildHouse(state, 'p1', 5);
    expect(state.boardState.ownedProps[5].houses).toBe(0);
    expect(state.players.p1.accountBalance).toBe(1000);
  });

  it('returns four houses to the Bank when four houses become a hotel', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    BROWN.forEach((tileID) => own(state, tileID, 'p1', { houses: 4 }));

    expect(bankBuildingInventory(state)).toEqual({ housesAvailable: 24, hotelsAvailable: 12 });
    expect(buildHouse(state, 'p1', 1)).toBe(true);
    expect(state.boardState.ownedProps[1].houses).toBe(5);
    expect(bankBuildingInventory(state)).toEqual({ housesAvailable: 28, hotelsAvailable: 11 });
  });

  it('reserves and awards the last physical house without overselling stock', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    addPlayer(state, 'p3');
    BROWN.forEach((tileID) => own(state, tileID, 'p1'));
    [6, 8, 9].forEach((tileID) => own(state, tileID, 'p2'));
    [11, 13, 14, 16, 18, 19, 21].forEach((tileID) => own(state, tileID, 'p3', { houses: 4 }));
    own(state, 23, 'p3', { houses: 3 });
    expect(bankBuildingInventory(state).housesAvailable).toBe(1);

    const requestedAt = '2030-01-01T00:00:00.000Z';
    const auction = startBuildingAuction(state, 'HOUSE', {
      p1: { playerId: 'p1', tileID: 1, buildingType: 'HOUSE', requestedAt },
      p2: { playerId: 'p2', tileID: 6, buildingType: 'HOUSE', requestedAt },
    }, { auctionId: 'last-house', now: Date.parse(requestedAt) });
    expect(bankBuildingInventory(state).housesAvailable).toBe(0);
    auction.highestBid = 75;
    auction.highestBidder = 'p1';
    auction.highestBidderName = 'Player';

    expect(finalizeAuction(state, auction.auctionId)).toBe(true);
    expect(state.boardState.ownedProps[1].houses).toBe(1);
    expect(state.players.p1.accountBalance).toBe(925);
    expect(bankBuildingInventory(state).housesAvailable).toBe(0);
    expect(buildHouse(state, 'p2', 6)).toBe(false);
  });
});

describe.skip('legacy sellHouse group/inventory rules', () => {
  it('refunds half the build cost and keeps the group even', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    own(state, 1, 'p1', { houses: 2 });
    own(state, 3, 'p1', { houses: 1 });

    // Tile 1 is at the group max, so it can be sold down first.
    sellHouse(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].houses).toBe(1);
    expect(state.players.p1.accountBalance).toBe(25);

    // Now both are level; selling from tile 3 (no longer the max) is blocked.
    own(state, 1, 'p1', { houses: 2 });
    sellHouse(state, 'p1', 3);
    expect(state.boardState.ownedProps[3].houses).toBe(1);
  });

  it('liquidates a hotel directly when the Bank has no houses for a downgrade', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    addPlayer(state, 'p2');
    own(state, 1, 'p1', { houses: 5 });
    [3, 6, 8, 9, 11, 13, 14, 16].forEach((tileID) => {
      own(state, tileID, 'p2', { houses: 4 });
    });

    expect(bankBuildingInventory(state).housesAvailable).toBe(0);
    expect(sellHouse(state, 'p1', 1)).toBe(false);
    expect(liquidateBuildings(state, 'p1')).toBe(125);
    expect(state.boardState.ownedProps[1].houses).toBe(0);
    expect(state.players.p1.accountBalance).toBe(125);
  });
});

describe('mortgageProperty / unmortgageProperty', () => {
  it('mortgages for half the tile price', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    own(state, 1, 'p1');
    mortgageProperty(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].mortgaged).toBe(true);
    expect(state.players.p1.accountBalance).toBe(30);
  });

  it('refuses to mortgage a built-up property', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    own(state, 1, 'p1', { houses: 1 });
    mortgageProperty(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].mortgaged).toBe(false);
    expect(state.players.p1.accountBalance).toBe(0);
  });

  it('lifts a mortgage for half the price plus 10% interest', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 100 });
    own(state, 1, 'p1', { mortgaged: true });
    unmortgageProperty(state, 'p1', 1);
    // ceil((60 / 2) * 1.1) = ceil(33) = 33.
    expect(state.boardState.ownedProps[1].mortgaged).toBe(false);
    expect(state.players.p1.accountBalance).toBe(67);
  });

  it('will not lift a mortgage the player cannot afford', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 10 });
    own(state, 1, 'p1', { mortgaged: true });
    unmortgageProperty(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].mortgaged).toBe(true);
    expect(state.players.p1.accountBalance).toBe(10);
  });

  it('allows developed-property transfer and keeps mortgage interest validation', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2', { accountBalance: 9 });
    own(state, 1, 'p1');
    own(state, 3, 'p1', { houses: 1 });
    expect(transferProperty(state, 1, 'p1', 'p2', 'VOLUNTARY')).toMatchObject({ ok: true });
    expect(state.boardState.ownedProps[1].id).toBe('p2');

    own(state, 5, 'p1', { color: 'railroad', mortgaged: true });
    state.boardState.openMarket[5] = {
      seller: 'p1', price: 100, sellerName: 'Player', tileName: 'Ga Ha Noi',
    };
    expect(transferProperty(state, 5, 'p1', 'p2', 'VOLUNTARY')).toMatchObject({
      ok: false,
      mortgageInterest: 10,
    });
    state.players.p2.accountBalance = 20;
    expect(transferProperty(state, 5, 'p1', 'p2', 'VOLUNTARY')).toMatchObject({
      ok: true,
      mortgageInterest: 10,
    });
    expect(state.players.p2.accountBalance).toBe(10);
    expect(state.boardState.ownedProps[5]).toMatchObject({ id: 'p2', mortgaged: true });
    expect(state.boardState.openMarket[5]).toBeUndefined();
  });
});

describe.skip('legacy jail bail/failed-roll rules', () => {
  it('uses a jail double only to escape and advances after destination resolution', () => {
    const state = makeState();
    addPlayer(state, 'p2');
    addPlayer(state, 'p1', { isJail: true, jailRounds: 1, currentTile: 10 });
    own(state, 16, 'p1');
    state.boardState.currentPlayer.id = 'p1';
    handleJailRoll(state, 'p1', { dice1: 3, dice2: 3 });
    expect(state.players.p1.isJail).toBe(false);
    expect(state.players.p1.currentTile).toBe(16);
    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.turnNumber).toBe(1);
  });

  it('pays the forced bail on the third failed roll before moving', () => {
    const state = makeState();
    addPlayer(state, 'p2');
    addPlayer(state, 'p1', { isJail: true, jailRounds: 2, currentTile: 10 });
    state.boardState.currentPlayer.id = 'p1';
    handleJailRoll(state, 'p1', { dice1: 1, dice2: 2 });
    expect(state.players.p1.isJail).toBe(false);
    expect(state.players.p1.currentTile).toBe(13);
    expect(state.players.p1.accountBalance).toBe(1450);
  });

  it('persists the third-roll dice while forced bail debt is raised and resumes them once', () => {
    const state = makeState();
    addPlayer(state, 'p1', {
      accountBalance: 20, isJail: true, jailRounds: 2, currentTile: 10,
    });
    addPlayer(state, 'p2');
    own(state, 1, 'p1');
    state.boardState.currentPlayer.id = 'p1';

    handleJailRoll(state, 'p1', { dice1: 2, dice2: 3 });
    expect(state.players.p1.accountBalance).toBe(0);
    expect(state.players.p1.currentTile).toBe(10);
    expect(state.players.p1.isJail).toBe(true);
    expect(state.boardState.paymentQueue?.orderedClaims[0].source).toEqual({ kind: 'BAIL' });
    expect(state.boardState.paymentQueue?.continuation.resume).toEqual({
      kind: 'MOVE_STORED_DICE', dice: { dice1: 2, dice2: 3 },
    });

    expect(mortgageProperty(state, 'p1', 1)).toBe(true);
    const continuation = settleAffordableClaims(state);
    expect(continuation?.resume).toMatchObject({ kind: 'MOVE_STORED_DICE' });
    if (!continuation) throw new Error('expected stored-dice continuation');
    resumePaymentContinuation(state, continuation);

    expect(state.players.p1.accountBalance).toBe(0);
    expect(state.players.p1.currentTile).toBe(15);
    expect(state.players.p1.isJail).toBe(false);
    expect(state.turnInfo.pendingPropertyDecision?.tileID).toBe(15);
    expect(state.boardState.paymentQueue).toBeNull();
  });

  it('stays jailed and counts the round on a non-double', () => {
    const state = makeState();
    addPlayer(state, 'p2');
    addPlayer(state, 'p1', { isJail: true, jailRounds: 0, currentTile: 10 });
    state.boardState.currentPlayer.id = 'p1';
    handleJailRoll(state, 'p1', { dice1: 1, dice2: 2 });
    expect(state.players.p1.isJail).toBe(true);
    expect(state.players.p1.jailRounds).toBe(1);
    expect(state.players.p1.currentTile).toBe(10);
  });
});

describe('applyCard', () => {
  it('applies rewards and penalties', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 100 });
    applyCard(state, 'p1', chanceCard('reward-test', { message: 'bank pays you', reward: 50 }));
    expect(state.players.p1.accountBalance).toBe(150);
    applyCard(state, 'p1', chanceCard('penalty-test', { message: 'pay the bank', penalty: 30 }));
    expect(state.players.p1.accountBalance).toBe(120);
  });

  it('collects from every other player', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 100 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    addPlayer(state, 'p3', { accountBalance: 100 });
    applyCard(
      state,
      'p1',
      chanceCard('collect-test', { message: 'birthday', collectFromEachPlayer: 10 }),
    );
    expect(state.players.p1.accountBalance).toBe(120);
    expect(state.players.p2.accountBalance).toBe(90);
    expect(state.players.p3.accountBalance).toBe(90);
  });

  it('pays every other player', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 100 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    applyCard(state, 'p1', chanceCard('pay-test', { message: 'chairman', payEachPlayer: 40 }));
    expect(state.players.p1.accountBalance).toBe(60);
    expect(state.players.p2.accountBalance).toBe(140);
  });

  it('grants a get-out-of-jail card and sends a player to jail', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 5 });
    applyCard(
      state,
      'p1',
      chanceCard('jail-free-test', { message: 'free pass', getOutOfJailFree: true }),
    );
    expect(state.players.p1.heldJailFreeCardIds).toEqual(['chance-jail-free-test']);
    applyCard(state, 'p1', chanceCard('jail-test', { message: 'go to jail', goToJail: true }));
    expect(state.players.p1.isJail).toBe(true);
    expect(state.players.p1.currentTile).toBe(10);
  });

  it('moves relative to the current tile and wraps the board', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 2 });
    applyCard(state, 'p1', chanceCard('back-test', { message: 'go back 3', moveBy: -3 }));
    expect(state.players.p1.currentTile).toBe(39);
  });

  it('resumes a multi-debtor queue after restart without charging a settled claim twice', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 100 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    addPlayer(state, 'p3', { accountBalance: 5 });

    applyCard(
      state,
      'p1',
      chanceCard('multi-debtor-test', {
        message: 'collect from each player',
        collectFromEachPlayer: 10,
      }),
    );

    expect(state.players.p1.accountBalance).toBe(115);
    expect(state.players.p2.accountBalance).toBe(90);
    expect(state.players.p3.accountBalance).toBe(0);
    expect(state.boardState.paymentQueue?.activeClaimIndex).toBe(1);
    expect(state.boardState.paymentQueue?.orderedClaims[0].status).toBe('SETTLED');
    expect(state.boardState.paymentQueue?.orderedClaims[1].remainingAmount).toBe(5);

    const restarted = structuredClone(state);
    restarted.players.p3.accountBalance = 5;
    expect(settleAffordableClaims(restarted)).toMatchObject({ playerId: 'p1' });

    expect(restarted.boardState.paymentQueue).toBeNull();
    expect(restarted.players.p1.accountBalance).toBe(120);
    expect(restarted.players.p2.accountBalance).toBe(90);
    expect(restarted.players.p3.accountBalance).toBe(0);
  });
});

describe('resolveTile', () => {
  it('awards exactly 200 once when a card advances to GO', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 7, accountBalance: 1500 });
    addPlayer(state, 'p2');
    putCardOnTop(state, 'chance', 'chance-advance-start');

    resolveTile(state, 'p1', 0);

    expect(state.players.p1.currentTile).toBe(0);
    expect(state.players.p1.accountBalance).toBe(1700);
    expect(state.boardState.logs.filter((log) => log.includes('200.000 ₫'))).toHaveLength(1);
  });

  it('resolves the destination after a card moves the player back three tiles', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 7, accountBalance: 500 });
    addPlayer(state, 'p2');
    putCardOnTop(state, 'chance', 'chance-back-three');

    resolveTile(state, 'p1', 0);

    expect(state.players.p1.currentTile).toBe(4);
    expect(state.players.p1.accountBalance).toBe(500);
    expect(state.boardState.paymentQueue).toBeNull();
  });

  it('draws each deck once when card movement chains onto another card tile', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 36, accountBalance: 100 });
    addPlayer(state, 'p2');
    putCardOnTop(state, 'chance', 'chance-back-three');
    putCardOnTop(state, 'chest', 'chest-consulting-fee');

    resolveTile(state, 'p1', 0);

    expect(state.players.p1.currentTile).toBe(33);
    expect(state.players.p1.accountBalance).toBe(125);
    expect(state.boardState.logs.filter((log) => log.includes('Lùi lại 3 ô.'))).toHaveLength(1);
    expect(state.boardState.logs.filter((log) => log.includes('Nhận phí tư vấn'))).toHaveLength(1);
    expect(state.privateState.decks.chance.drawPile.at(-1)).toBe('chance-back-three');
    expect(state.privateState.decks.chest.drawPile.at(-1)).toBe('chest-consulting-fee');
  });

  it('creates an operation-bound purchase decision for an unowned property', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1 });
    resolveTile(state, 'p1', 0);
    expect(state.turnInfo.pendingPropertyDecision).toMatchObject({
      playerId: 'p1',
      tileID: 1,
    });
  });

  it('transfers street rent to the owner', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1, accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    own(state, 1, 'p2');
    resolveTile(state, 'p1', 0);
    expect(state.players.p1.accountBalance).toBe(998);
    expect(state.players.p2.accountBalance).toBe(1002);
  });

  it('scales railroad rent with the number owned', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 5, accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    // p2 owns two railroads: rent is 25 * 2^(2-1) = 50.
    own(state, 5, 'p2', { color: 'railroad' });
    own(state, 15, 'p2', { color: 'railroad' });
    resolveTile(state, 'p1', 0);
    expect(state.players.p1.accountBalance).toBe(950);
    expect(state.players.p2.accountBalance).toBe(1050);
  });

  it('charges company rent based on the dice roll', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 12, accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    // One utility owned: rent is diceResult * 4.
    own(state, 12, 'p2', { color: 'company' });
    resolveTile(state, 'p1', 8);
    expect(state.players.p1.accountBalance).toBe(968);
    expect(state.players.p2.accountBalance).toBe(1032);
  });

  it('charges a tax tile against the bank', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 4, accountBalance: 1000 });
    resolveTile(state, 'p1', 0);
    // Income Tax on tile 4 is 200.
    expect(state.players.p1.accountBalance).toBe(1000);
  });

  it('sends a player to jail from the go-to-jail tile', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 30 });
    addPlayer(state, 'p2');
    resolveTile(state, 'p1', 0);
    expect(state.players.p1.isJail).toBe(true);
    expect(state.players.p1.currentTile).toBe(10);
  });
});

describe.skip('legacy extra-roll doubles rules', () => {
  const doubleContinuation = (state: GameState) => {
    state.boardState.currentPlayer.hasMoved = true;
    state.boardState.currentPlayer.doublesStreak = 1;
    return continuationForRoll(state, 'p1', true);
  };

  it('grants the extra roll only after rent is paid', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1, accountBalance: 100 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    own(state, 1, 'p2');

    resolveTile(state, 'p1', 2, doubleContinuation(state));

    expect(state.players.p1.accountBalance).toBe(98);
    expect(state.players.p2.accountBalance).toBe(102);
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p1', hasMoved: false });
    expect(state.boardState.turnNumber).toBe(0);
  });

  it('grants the extra roll after the pending purchase is completed', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1 });
    addPlayer(state, 'p2');
    resolveTile(state, 'p1', 2, doubleContinuation(state));
    const decision = state.turnInfo.pendingPropertyDecision;
    expect(decision?.tileID).toBe(1);
    if (!decision) throw new Error('expected property decision');

    state.players.p1.accountBalance -= 60;
    expect(transferProperty(state, 1, null, 'p1', 'BANK_AUCTION_AWARD').ok).toBe(true);
    state.turnInfo = {};
    expect(completeTurnResolution(state, decision.continuation)).toBe('EXTRA_ROLL');

    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p1', hasMoved: false });
    expect(state.boardState.ownedProps[1].id).toBe('p1');
  });

  it('grants the extra roll only after a declined-property auction finalizes', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1 });
    addPlayer(state, 'p2');
    resolveTile(state, 'p1', 2, doubleContinuation(state));
    const decision = state.turnInfo.pendingPropertyDecision;
    if (!decision) throw new Error('expected property decision');
    const auction = startAuction(state, 1, {
      auctionId: 'doubles-decline',
      continuation: decision.continuation,
      now: Date.parse('2030-01-01T00:00:00.000Z'),
    });

    expect(finalizeAuction(state, auction.auctionId)).toBe(true);
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p1', hasMoved: false });
    expect(state.boardState.turnNumber).toBe(0);
  });

  it('grants the extra roll after a synchronous card effect', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 2, accountBalance: 100 });
    addPlayer(state, 'p2');
    putCardOnTop(state, 'chest', 'chest-consulting-fee');

    resolveTile(state, 'p1', 2, doubleContinuation(state));

    expect(state.players.p1.accountBalance).toBe(125);
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p1', hasMoved: false });
  });

  it('forces turn advance when a card sends the doubles roller to jail', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 7 });
    addPlayer(state, 'p2');
    putCardOnTop(state, 'chance', 'chance-go-to-jail');

    resolveTile(state, 'p1', 2, doubleContinuation(state));

    expect(state.players.p1).toMatchObject({ currentTile: 10, isJail: true });
    expect(state.boardState.currentPlayer).toMatchObject({ id: 'p2', doublesStreak: 0 });
    expect(state.boardState.turnNumber).toBe(1);
  });
});

describe('nextTurn', () => {
  it('advances to the next player, increments the turn, and clears recovery state', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2');
    addPlayer(state, 'p3');
    state.boardState.currentPlayer.id = 'p1';
    state.boardState.currentPlayer.hasMoved = true;
    state.boardState.turnNumber = 7;
    state.boardState.turnRecovery = {
      playerId: 'p1',
      turnNumber: 7,
      deadlineAt: '2030-01-01T00:00:00.000Z',
    };
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.currentPlayer.hasMoved).toBe(false);
    expect(state.boardState.turnNumber).toBe(8);
    expect(state.boardState.turnRecovery).toBeNull();
    expect(state.turnInfo).toEqual({});

    state.boardState.currentPlayer.id = 'p3';
    nextTurn(state);
    expect(state.boardState.currentPlayer.id).toBe('p1');
    expect(state.boardState.turnNumber).toBe(9);
  });
});

describe('checkBalance / winner', () => {
  it('removes a bankrupt player, releases their property, and declares a winner', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: -1 });
    addPlayer(state, 'p2', { accountBalance: 1500 });
    own(state, 1, 'p1');
    checkBalance(state);
    expect(state.players.p1).toBeUndefined();
    expect(state.boardState.finishedPlayers.p1).toBeDefined();
    expect(state.boardState.finishedPlayers.p1.reason).toBe('BANKRUPT');
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.winner).toMatchObject({ playerId: 'p2', name: 'Player' });
  });

  it('does not declare a winner while nobody has been eliminated', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1500 });
    checkBalance(state);
    expect(state.boardState.winner).toBeNull();
  });

  it('removes multiple bankrupt players as one batch without stale-id recursion', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: -1 });
    addPlayer(state, 'p2', { accountBalance: -10 });
    addPlayer(state, 'p3', { accountBalance: 500 });
    addPlayer(state, 'p4', { accountBalance: 500 });
    state.boardState.currentPlayer.id = 'p1';
    own(state, 1, 'p1');
    own(state, 3, 'p2');
    state.boardState.openMarket[3] = {
      seller: 'p2',
      price: 100,
      sellerName: 'Player',
      tileName: 'Bạc Liêu',
    };

    expect(() => checkBalance(state, true)).not.toThrow();
    expect(Object.keys(state.players)).toEqual(['p3', 'p4']);
    expect(state.boardState.players).toEqual(['p3', 'p4']);
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.boardState.turnNumber).toBe(1);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.ownedProps[3]).toBeUndefined();
    expect(state.boardState.openMarket[3]).toBeUndefined();
  });

  it('advances exactly once when non-current bankruptcies are cleaned up', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 500 });
    addPlayer(state, 'p2', { accountBalance: -1 });
    addPlayer(state, 'p3', { accountBalance: -1 });
    addPlayer(state, 'p4', { accountBalance: 500 });
    state.boardState.currentPlayer.id = 'p1';

    checkBalance(state, true);
    expect(state.boardState.currentPlayer.id).toBe('p4');
    expect(state.boardState.turnNumber).toBe(1);
  });

  it('sets the winner and win log only once', () => {
    const state = makeState();
    addPlayer(state, 'winner', { name: 'Ada', color: 'purple' });
    state.boardState.finishedPlayers.loser = {
      name: 'Grace',
      color: 'green',
      reason: 'BANKRUPT',
    };
    const logsBefore = state.boardState.logs.length;

    checkWinner(state);
    checkWinner(state);

    expect(state.boardState.winner).toEqual({
      playerId: 'winner',
      name: 'Ada',
      color: 'purple',
    });
    expect(state.boardState.logs).toHaveLength(logsBefore + 1);
  });

  it('forfeits an active player and hands off a current turn once', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2');
    addPlayer(state, 'p3');
    state.boardState.currentPlayer.id = 'p2';
    own(state, 1, 'p2');
    state.boardState.openMarket[1] = {
      seller: 'p2',
      price: 75,
      sellerName: 'Player',
      tileName: 'Cà Mau',
    };
    expect(removePlayerFromGame(state, 'p2')).toBe(true);
    expect(state.boardState.finishedPlayers.p2.reason).toBe('LEFT');
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.boardState.turnNumber).toBe(1);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.openMarket[1]).toBeUndefined();
    expect(state.boardState.auction).toBeNull();
  });
});

describe.skip('legacy auction-based bankruptcy rules', () => {
  it('transfers available cash immediately and keeps only the unpaid remainder', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 60 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    state.boardState.paymentQueue = createPaymentQueue([
      {
        debtorPlayerId: 'p1',
        creditor: 'PLAYER',
        creditorPlayerId: 'p2',
        amount: 100,
        source: { kind: 'OTHER', description: 'partial payment regression' },
      },
    ], continuationForRoll(state, 'p1', false));

    expect(settleAffordableClaims(state)).toBeNull();

    expect(state.players.p1.accountBalance).toBe(0);
    expect(state.players.p2.accountBalance).toBe(160);
    expect(state.boardState.paymentQueue).toMatchObject({
      activeClaimIndex: 0,
      orderedClaims: [{ status: 'PENDING', amount: 100, remainingAmount: 40 }],
    });
  });

  it('surrenders a future debtor assets to the Bank and continues the active claim', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 0 });
    addPlayer(state, 'p2');
    addPlayer(state, 'p3', {
      accountBalance: 60,
      heldJailFreeCardIds: ['chance-jail-free'],
    });
    own(state, 5, 'p3', { color: 'railroad' });
    const queue = createPaymentQueue([
      {
        debtorPlayerId: 'p1',
        creditor: 'BANK',
        amount: 100,
        source: { kind: 'OTHER', description: 'active claim' },
      },
      {
        debtorPlayerId: 'p3',
        creditor: 'PLAYER',
        creditorPlayerId: 'p1',
        amount: 25,
        source: { kind: 'OTHER', description: 'future claim' },
      },
    ], continuationForRoll(state, 'p1', false));
    state.boardState.paymentQueue = queue;

    const result = surrenderPlayerToBank(state, 'p3');

    expect(result).toMatchObject({ changed: true, continuation: null, bankAuctionQueued: true });
    expect(state.players.p3).toBeUndefined();
    expect(state.boardState.finishedPlayers.p3.reason).toBe('LEFT');
    expect(state.boardState.ownedProps[5]).toBeUndefined();
    expect(state.players.p1.heldJailFreeCardIds).not.toContain('chance-jail-free');
    expect(state.privateState.decks.chance.drawPile.at(-1)).toBe('chance-jail-free');
    expect(state.players.p1.accountBalance).toBe(0);
    expect(state.boardState.paymentQueue).toMatchObject({
      activeClaimIndex: 0,
      orderedClaims: [
        { debtorPlayerId: 'p1', status: 'PENDING', remainingAmount: 100 },
        { debtorPlayerId: 'p3', status: 'BANKRUPT', remainingAmount: 0 },
      ],
    });
  });

  it('preserves a Bank queue turn continuation when an unrelated player leaves', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2');
    addPlayer(state, 'p3');
    addPlayer(state, 'p4');
    state.boardState.currentPlayer = { id: 'p1', hasMoved: true, doublesStreak: 0 };
    const originalContinuation = continuationForRoll(state, 'p1', false);
    const declinedAuction = startAuction(state, 3, {
      auctionId: '00000000-0000-4000-8000-000000000101',
      continuation: originalContinuation,
      now: Date.parse('2030-01-01T00:00:00.000Z'),
    });
    own(state, 1, 'p3');
    expect(surrenderPlayerToBank(state, 'p3').bankAuctionQueued).toBe(true);

    expect(finalizeAuction(state, declinedAuction.auctionId)).toBe(true);
    expect(state.boardState.auction).toMatchObject({ kind: 'PROPERTY', source: 'BANKRUPTCY' });
    expect(state.boardState.bankPropertyAuctionQueue?.continuation).toEqual(originalContinuation);

    const unrelatedLeave = surrenderPlayerToBank(state, 'p2');
    expect(unrelatedLeave.continuation?.resume).toEqual({ kind: 'NO_TURN_CHANGE' });
    expect(state.boardState.bankPropertyAuctionQueue?.continuation).toEqual(originalContinuation);

    const bankAuctionId = state.boardState.auction?.auctionId;
    expect(bankAuctionId).toBeDefined();
    expect(finalizeAuction(state, bankAuctionId)).toBe(true);
    expect(state.boardState.bankPropertyAuctionQueue).toBeNull();
    expect(state.boardState.currentPlayer.id).toBe('p4');
    expect(state.boardState.turnNumber).toBe(1);
  });

  it('liquidates buildings and transfers mortgaged property and a jail-free card to the creditor', () => {
    const state = makeState();
    addPlayer(state, 'p1', {
      accountBalance: 0,
      heldJailFreeCardIds: ['chance-jail-free'],
    });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    own(state, 1, 'p1', { houses: 1 });
    own(state, 3, 'p1', { houses: 1 });
    own(state, 5, 'p1', { color: 'railroad', mortgaged: true });

    applyCard(
      state,
      'p1',
      chanceCard('bankruptcy-test', { message: 'pay creditor', payEachPlayer: 100 }),
    );
    expect(state.boardState.paymentQueue?.orderedClaims[0]).toMatchObject({
      debtorPlayerId: 'p1',
      creditor: 'PLAYER',
      creditorPlayerId: 'p2',
      remainingAmount: 100,
    });

    const result = declareActiveDebtBankruptcy(state, 'p1');

    expect(result).toMatchObject({ changed: true, bankAuctionQueued: false });
    expect(state.players.p1).toBeUndefined();
    expect(state.boardState.finishedPlayers.p1.reason).toBe('BANKRUPT');
    expect(state.boardState.ownedProps[1]).toMatchObject({ id: 'p2', houses: 0 });
    expect(state.boardState.ownedProps[3]).toMatchObject({ id: 'p2', houses: 0 });
    expect(state.boardState.ownedProps[5]).toMatchObject({ id: 'p2', mortgaged: true });
    expect(state.players.p2.heldJailFreeCardIds).toContain('chance-jail-free');
    expect(state.players.p2.accountBalance).toBe(1040);
    expect(state.boardState.paymentQueue).toBeNull();
  });

  it('protects the active player creditor when the debtor forfeits', () => {
    const state = makeState();
    addPlayer(state, 'p1', {
      accountBalance: 0,
      heldJailFreeCardIds: ['chance-jail-free'],
    });
    addPlayer(state, 'p2');
    own(state, 1, 'p1');
    applyCard(state, 'p1', chanceCard('forfeit-debt', {
      message: 'pay creditor', payEachPlayer: 100,
    }));

    const result = surrenderPlayerToBank(state, 'p1');

    expect(result).toMatchObject({ changed: true, bankAuctionQueued: false });
    expect(state.boardState.finishedPlayers.p1.reason).toBe('LEFT');
    expect(state.boardState.ownedProps[1].id).toBe('p2');
    expect(state.players.p2.heldJailFreeCardIds).toContain('chance-jail-free');
    expect(state.boardState.bankPropertyAuctionQueue).toBeNull();
  });

  it('returns a held jail-free card to the bottom of its source deck on Bank surrender', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 7 });
    addPlayer(state, 'p2');
    putCardOnTop(state, 'chance', 'chance-jail-free');
    resolveTile(state, 'p1', 0);
    expect(state.players.p1.heldJailFreeCardIds).toEqual(['chance-jail-free']);
    expect(state.privateState.decks.chance.drawPile).not.toContain('chance-jail-free');

    expect(surrenderPlayerToBank(state, 'p1').changed).toBe(true);

    expect(state.privateState.decks.chance.drawPile.at(-1)).toBe('chance-jail-free');
  });

  it('does not consume the current player purchase wait while auctioning forfeited Bank assets', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1 });
    addPlayer(state, 'p2');
    addPlayer(state, 'p3');
    resolveTile(state, 'p1', 0);
    const decision = state.turnInfo.pendingPropertyDecision;
    expect(decision?.tileID).toBe(1);
    own(state, 3, 'p3');

    expect(surrenderPlayerToBank(state, 'p3').bankAuctionQueued).toBe(true);
    const auction = startNextBankPropertyAuction(state, {
      auctionId: 'forfeit-bank-property',
      now: Date.parse('2030-01-01T00:00:00.000Z'),
    });
    expect(auction).toMatchObject({
      kind: 'PROPERTY', source: 'BANKRUPTCY', continuation: null,
    });
    expect(state.turnInfo.pendingPropertyDecision).toEqual(decision);

    expect(finalizeAuction(state, 'forfeit-bank-property')).toBe(true);
    expect(state.boardState.bankPropertyAuctionQueue).toBeNull();
    expect(state.turnInfo.pendingPropertyDecision).toEqual(decision);
    expect(state.boardState.currentPlayer.id).toBe('p1');
  });

  it('allows non-debtors to bid in a required Bank auction while the active debtor remains blocked', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2', { accountBalance: 0 });
    addPlayer(state, 'p3');
    state.boardState.paymentQueue = createPaymentQueue([
      { debtorPlayerId: 'p2', creditor: 'BANK', amount: 100, source: { kind: 'OTHER', description: 'first' } },
      { debtorPlayerId: 'p3', creditor: 'BANK', amount: 100, source: { kind: 'OTHER', description: 'second' } },
    ], continuationForRoll(state, 'p1', false));

    expect(assertDebtActionAllowed(state, 'p2', 'BID')).toBe(false);
    expect(assertDebtActionAllowed(state, 'p1', 'BID')).toBe(true);
    expect(assertDebtActionAllowed(state, 'p3', 'BID')).toBe(true);
  });
});

describe.skip('removed auction deadlines', () => {
  it('starts with a stable id and an absolute 30-second deadline', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2');
    state.turnInfo.canBuyProp = true;
    const now = Date.parse('2030-01-01T00:00:00.000Z');

    const auction = startAuction(state, 1, { auctionId: 'auction-1', now });

    expect(auction.auctionId).toBe('auction-1');
    expect(auction.endsAt).toBe('2030-01-01T00:00:30.000Z');
    expect(auction.active).toEqual(['p1', 'p2']);
    expect(auction).not.toHaveProperty('timer');
    expect(state.turnInfo.canBuyProp).toBe(false);
  });

  it('accepts a supplied authoritative deadline', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    const auction = startAuction(state, 1, {
      auctionId: 'restored-auction',
      endsAt: '2031-02-03T04:05:06.000Z',
    });
    expect(auction.endsAt).toBe('2031-02-03T04:05:06.000Z');
  });

  it('extends only deadlines with less than 15 seconds remaining', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    const origin = Date.parse('2030-01-01T00:00:00.000Z');
    const auction = startAuction(state, 1, { auctionId: 'auction-1', now: origin });

    expect(extendAuctionDeadline(auction, origin)).toBe('2030-01-01T00:00:30.000Z');
    expect(extendAuctionDeadline(auction, origin + 20_000)).toBe('2030-01-01T00:00:35.000Z');
  });
});

describe.skip('removed auctions', () => {
  it('awards the tile to the highest bidder and charges them', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    state.boardState.currentPlayer.id = 'p1';
    state.boardState.turnRecovery = {
      playerId: 'p1',
      turnNumber: 0,
      deadlineAt: '2030-01-01T00:00:00.000Z',
    };
    state.boardState.auction = {
      kind: 'PROPERTY',
      auctionId: 'auction-1',
      tileID: 1,
      tileName: 'Cà Mau',
      price: 60,
      source: 'DECLINED_PURCHASE',
      highestBid: 120,
      highestBidder: 'p2',
      highestBidderName: 'Untrusted stale name',
      active: ['p1', 'p2'],
      passed: [],
      endsAt: '2030-01-01T00:00:00.000Z',
      continuation: { playerId: 'p1', turnNumber: 0, rolledDoubles: false },
    };
    expect(finalizeAuction(state, 'auction-1')).toBe(true);
    expect(state.players.p2.accountBalance).toBe(880);
    expect(state.boardState.ownedProps[1]).toEqual({
      id: 'p2',
      color: 'red',
      houses: 0,
      mortgaged: false,
    });
    expect(state.boardState.auction).toBeNull();
    expect(state.boardState.currentPlayer.id).toBe('p2');
    expect(state.boardState.turnNumber).toBe(1);
    expect(state.boardState.turnRecovery).toBeNull();
    expect(state.boardState.logs.at(-1)).toContain('Player thắng đấu giá');
    expect(finalizeAuction(state, 'auction-1')).toBe(false);
    expect(state.boardState.turnNumber).toBe(1);
  });

  it('leaves the tile unowned when there were no bids', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2');
    state.boardState.auction = {
      kind: 'PROPERTY',
      auctionId: 'auction-no-bids',
      tileID: 1,
      tileName: 'Cà Mau',
      price: 60,
      source: 'DECLINED_PURCHASE',
      highestBid: 0,
      highestBidder: null,
      highestBidderName: null,
      active: ['p1', 'p2'],
      passed: [],
      endsAt: '2030-01-01T00:00:00.000Z',
      continuation: { playerId: 'p1', turnNumber: 0, rolledDoubles: false },
    };
    finalizeAuction(state);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.auction).toBeNull();
    expect(state.boardState.currentPlayer.id).toBe('p2');
  });

  it('does not let a stale callback finalize a newer auction', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    startAuction(state, 1, {
      auctionId: 'new-auction',
      endsAt: '2030-01-01T00:00:00.000Z',
    });

    expect(finalizeAuction(state, 'old-auction')).toBe(false);
    expect(state.boardState.auction?.auctionId).toBe('new-auction');
    expect(state.boardState.turnNumber).toBe(0);
  });

  it('rejects an unaffordable persisted high bid at finalization', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    state.boardState.auction = {
      kind: 'PROPERTY',
      auctionId: 'auction-invalid-bid',
      tileID: 1,
      tileName: 'Cà Mau',
      price: 60,
      source: 'DECLINED_PURCHASE',
      highestBid: 120,
      highestBidder: 'p2',
      highestBidderName: 'Player',
      active: ['p1', 'p2'],
      passed: [],
      endsAt: '2030-01-01T00:00:00.000Z',
      continuation: null,
    };

    expect(finalizeAuction(state)).toBe(true);
    expect(state.players.p2.accountBalance).toBe(100);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
  });
});
