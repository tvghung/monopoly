import { describe, it, expect } from 'vitest';
import type { GameState, Player, PlayerId } from '@monopoly/shared';
import {
  sanitizeName,
  escapeHtml,
  movePlayer,
  ownsFullGroup,
  streetRent,
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
  handleJailRoll,
  applyCard,
  resolveTile,
  nextTurn,
  checkBalance,
  checkWinner,
  removePlayerFromGame,
  startAuction,
  extendAuctionDeadline,
  finalizeAuction,
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
  getOutOfJailCards: 0,
  ...over,
});

const makeState = (): GameState => ({
  boardState: {
    gameStarted: true,
    players: [],
    finishedPlayers: {},
    currentPlayer: { id: '', hasMoved: false },
    turnNumber: 0,
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    ownedProps: {},
    openMarket: {},
    winner: null,
    auction: null,
  },
  players: {},
  turnInfo: {},
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

// Brown group is tiles 1 and 3 (Parker St. / Tyne St.), houseCost 50.
const BROWN = [1, 3];

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

  it('wraps the board and pays $200 for passing GO', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 39, accountBalance: 1500 });
    movePlayer(state, 'p1', 3);
    expect(state.players.p1.currentTile).toBe(2);
    expect(state.players.p1.accountBalance).toBe(1700);
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
    expect(streetRent(state, 1)).toBe(4);
  });

  it('uses the house tier once built up', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    BROWN.forEach((t) => own(state, t, 'p1'));
    state.boardState.ownedProps[1].houses = 2;
    // rentTiers for Parker St. are [10, 30, 90, 160, 250]; index houses-1.
    expect(streetRent(state, 1)).toBe(30);
  });

  it('collects no rent while mortgaged', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1', { mortgaged: true });
    expect(streetRent(state, 1)).toBe(0);
  });
});

describe('buildHouse', () => {
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
    buildHouse(state, 'p1', 1);
    expect(state.boardState.ownedProps[1].houses).toBe(0);
    expect(state.players.p1.accountBalance).toBe(40);
    expect(state.boardState.logs.at(-1)).toContain("can't afford to build");
  });

  it('refuses to build on a non-buildable property', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 1000 });
    own(state, 5, 'p1', { color: 'railroad' });
    buildHouse(state, 'p1', 5);
    expect(state.boardState.ownedProps[5].houses).toBe(0);
    expect(state.players.p1.accountBalance).toBe(1000);
  });
});

describe('sellHouse', () => {
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
});

describe('handleJailRoll', () => {
  it('escapes on a double and moves by the roll', () => {
    const state = makeState();
    addPlayer(state, 'p2');
    addPlayer(state, 'p1', { isJail: true, jailRounds: 1, currentTile: 10 });
    state.boardState.currentPlayer.id = 'p1';
    handleJailRoll(state, 'p1', { dice1: 3, dice2: 3 });
    expect(state.players.p1.isJail).toBe(false);
    expect(state.players.p1.currentTile).toBe(16);
  });

  it('is released automatically after two rounds', () => {
    const state = makeState();
    addPlayer(state, 'p2');
    addPlayer(state, 'p1', { isJail: true, jailRounds: 2, currentTile: 10 });
    state.boardState.currentPlayer.id = 'p1';
    handleJailRoll(state, 'p1', { dice1: 1, dice2: 2 });
    expect(state.players.p1.isJail).toBe(false);
    expect(state.players.p1.currentTile).toBe(13);
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
    applyCard(state, 'p1', { message: 'bank pays you', reward: 50 });
    expect(state.players.p1.accountBalance).toBe(150);
    applyCard(state, 'p1', { message: 'pay the bank', penalty: 30 });
    expect(state.players.p1.accountBalance).toBe(120);
  });

  it('collects from every other player', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 100 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    addPlayer(state, 'p3', { accountBalance: 100 });
    applyCard(state, 'p1', { message: 'birthday', collectFromEachPlayer: 10 });
    expect(state.players.p1.accountBalance).toBe(120);
    expect(state.players.p2.accountBalance).toBe(90);
    expect(state.players.p3.accountBalance).toBe(90);
  });

  it('pays every other player', () => {
    const state = makeState();
    addPlayer(state, 'p1', { accountBalance: 100 });
    addPlayer(state, 'p2', { accountBalance: 100 });
    applyCard(state, 'p1', { message: 'chairman', payEachPlayer: 40 });
    expect(state.players.p1.accountBalance).toBe(60);
    expect(state.players.p2.accountBalance).toBe(140);
  });

  it('grants a get-out-of-jail card and sends a player to jail', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 5 });
    applyCard(state, 'p1', { message: 'free pass', getOutOfJailFree: true });
    expect(state.players.p1.getOutOfJailCards).toBe(1);
    applyCard(state, 'p1', { message: 'go to jail', goToJail: true });
    expect(state.players.p1.isJail).toBe(true);
    expect(state.players.p1.currentTile).toBe(10);
  });

  it('moves relative to the current tile and wraps the board', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 2 });
    applyCard(state, 'p1', { message: 'go back 3', moveBy: -3 });
    expect(state.players.p1.currentTile).toBe(39);
  });
});

describe('resolveTile', () => {
  it('flags an unowned property as buyable', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 1 });
    resolveTile(state, 'p1', 0);
    expect(state.turnInfo.canBuyProp).toBe(true);
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
    expect(state.players.p1.accountBalance).toBe(800);
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
    state.turnInfo.canBuyProp = true;
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
    addPlayer(state, 'p1', { accountBalance: 0 });
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
    addPlayer(state, 'p1', { accountBalance: 0 });
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
      tileName: 'Tyne St.',
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
    addPlayer(state, 'p2', { accountBalance: 0 });
    addPlayer(state, 'p3', { accountBalance: 0 });
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
      tileName: 'Parker St.',
    };
    state.boardState.auction = {
      auctionId: 'auction-forfeit',
      tileID: 3,
      tileName: 'Tyne St.',
      price: 60,
      highestBid: 50,
      highestBidder: 'p2',
      highestBidderName: 'Player',
      active: ['p1', 'p2', 'p3'],
      passed: ['p1'],
      endsAt: '2030-01-01T00:00:00.000Z',
    };

    expect(removePlayerFromGame(state, 'p2')).toBe(true);
    expect(state.boardState.finishedPlayers.p2.reason).toBe('LEFT');
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.boardState.turnNumber).toBe(1);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.openMarket[1]).toBeUndefined();
    expect(state.boardState.auction?.active).toEqual(['p1', 'p3']);
    expect(state.boardState.auction?.highestBidder).toBeNull();
    expect(state.boardState.auction?.highestBid).toBe(0);
  });
});

describe('auction deadlines', () => {
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

describe('finalizeAuction', () => {
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
      auctionId: 'auction-1',
      tileID: 1,
      tileName: 'Parker St.',
      price: 60,
      highestBid: 120,
      highestBidder: 'p2',
      highestBidderName: 'Untrusted stale name',
      active: ['p1', 'p2'],
      passed: [],
      endsAt: '2030-01-01T00:00:00.000Z',
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
    expect(state.boardState.logs.at(-1)).toContain('Player won the auction');
    expect(finalizeAuction(state, 'auction-1')).toBe(false);
    expect(state.boardState.turnNumber).toBe(1);
  });

  it('leaves the tile unowned when there were no bids', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2');
    state.boardState.auction = {
      auctionId: 'auction-no-bids',
      tileID: 1,
      tileName: 'Parker St.',
      price: 60,
      highestBid: 0,
      highestBidder: null,
      highestBidderName: null,
      active: ['p1', 'p2'],
      passed: [],
      endsAt: '2030-01-01T00:00:00.000Z',
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
      auctionId: 'auction-invalid-bid',
      tileID: 1,
      tileName: 'Parker St.',
      price: 60,
      highestBid: 120,
      highestBidder: 'p2',
      highestBidderName: 'Player',
      active: ['p1', 'p2'],
      passed: [],
      endsAt: '2030-01-01T00:00:00.000Z',
    };

    expect(finalizeAuction(state)).toBe(true);
    expect(state.players.p2.accountBalance).toBe(100);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
  });
});
