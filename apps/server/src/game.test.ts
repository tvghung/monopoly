import { describe, it, expect } from 'vitest';
import {
  createCanonicalDecks,
  formatMoney,
  type GameCard,
  type GameState,
  type Player,
  type PlayerId,
} from '@monopoly/shared';
import {
  sanitizeName,
  escapeHtml,
  movePlayer,
  streetRent,
  applyCard,
  railroadRent,
  resolveTile,
  progressPaymentQueue,
  utilityRent,
  nextTurn,
  checkBalance,
  checkWinner,
  removePlayerFromGame,
  transferProperty,
  chooseStartingPlayer,
  rotateSeatOrder,
  createShuffledDecks,
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
  jailOpponentRoundsElapsed: 0,
  heldJailFreeCardIds: [],
  ...over,
  characterId: over.characterId ?? 'dog',
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
    rollSequence: 0,
    ownedProps: {},
    winner: null,
    paymentQueue: null,
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
    id, color: 'red', houses: 0, ...over,
  };
};

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

describe('streetRent', () => {
  it('charges base rent for a single owned tile', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1');
    expect(streetRent(state, 1)).toBe(2);
  });

  it('keeps the base rent independent of group ownership', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2');
    own(state, 1, 'p2');
    expect(streetRent(state, 1)).toBe(2);
  });

  it('uses the house tier once built up', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1');
    state.boardState.ownedProps[1].houses = 2;
    // Rent tiers for Cà Mau are [10, 30, 90, 160, 250]; index houses-1.
    expect(streetRent(state, 1)).toBe(30);
  });

  it('keeps collecting rent for an owned property without extra state', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 1, 'p1');
    expect(streetRent(state, 1)).toBe(2);
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

describe('railroadRent / utilityRent tiers', () => {
  it('counts all owned railroads for the tier', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 5, 'p1', { color: 'red' });
    own(state, 15, 'p1', { color: 'red' });

    expect(railroadRent(state, 5)).toBe(50);
    expect(railroadRent(state, 15)).toBe(50);
  });

  it('uses the two-utility tier while the landed utility is active', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    own(state, 12, 'p1', { color: 'red' });
    own(state, 28, 'p1', { color: 'red' });

    expect(utilityRent(state, 12, 8)).toBe(80);
    expect(utilityRent(state, 28, 8)).toBe(80);
  });
});

describe('property transfer', () => {
  it('allows developed-property transfer without a hidden fee', () => {
    const state = makeState();
    addPlayer(state, 'p1');
    addPlayer(state, 'p2', { accountBalance: 9 });
    own(state, 1, 'p1');
    own(state, 3, 'p1', { houses: 1 });
    expect(transferProperty(state, 1, 'p1', 'p2', 'VOLUNTARY')).toMatchObject({ ok: true });
    expect(state.boardState.ownedProps[1].id).toBe('p2');

    own(state, 5, 'p1', { color: 'red' });
    expect(transferProperty(state, 5, 'p1', 'p2', 'VOLUNTARY')).toMatchObject({
      ok: true,
    });
    expect(state.players.p2.accountBalance).toBe(9);
    expect(state.boardState.ownedProps[5]).toMatchObject({ id: 'p2' });
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
    expect(state.players.p3).toBeUndefined();
    expect(state.boardState.paymentQueue).toBeNull();
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

  it('logs the base street rent with the dice total, tile, and owner', () => {
    const state = makeState();
    addPlayer(state, 'p1', { name: 'An', currentTile: 1, accountBalance: 1000 });
    addPlayer(state, 'p2', { name: 'Bình', accountBalance: 1000 });
    own(state, 1, 'p2');

    resolveTile(state, 'p1', 4);

    expect(state.boardState.logs.filter(log => log.includes('tiền thuê'))).toHaveLength(1);
    expect(state.boardState.logs.at(-1)).toContain(
      `An đổ được 4 và phải trả ${formatMoney(streetRent(state, 1))} tiền thuê Cà Mau cho Bình.`,
    );
  });

  it('logs the authoritative house tier and hotel label once', () => {
    const housesState = makeState();
    addPlayer(housesState, 'p1', { name: 'An', currentTile: 1, accountBalance: 1000 });
    addPlayer(housesState, 'p2', { name: 'Bình', accountBalance: 1000 });
    own(housesState, 1, 'p2', { houses: 3 });

    resolveTile(housesState, 'p1', 4);

    expect(housesState.boardState.logs.at(-1)).toContain(
      `An đổ được 4 và phải trả ${formatMoney(streetRent(housesState, 1))} tiền thuê 3 Nhà tại Cà Mau cho Bình.`,
    );

    const hotelState = makeState();
    addPlayer(hotelState, 'p1', { name: 'An', currentTile: 1, accountBalance: 1000 });
    addPlayer(hotelState, 'p2', { name: 'Bình', accountBalance: 1000 });
    own(hotelState, 1, 'p2', { houses: 5 });

    resolveTile(hotelState, 'p1', 4);

    expect(hotelState.boardState.logs.at(-1)).toContain(
      `An đổ được 4 và phải trả ${formatMoney(streetRent(hotelState, 1))} tiền thuê Khách sạn tại Cà Mau cho Bình.`,
    );
  });

  it('logs railroad and utility rent from their exact payment amounts', () => {
    const railroadState = makeState();
    addPlayer(railroadState, 'p1', { name: 'An', currentTile: 5, accountBalance: 1000 });
    addPlayer(railroadState, 'p2', { name: 'Bình', accountBalance: 1000 });
    own(railroadState, 5, 'p2', { color: 'blue' });
    own(railroadState, 15, 'p2', { color: 'blue' });

    resolveTile(railroadState, 'p1', 4);

    expect(railroadState.boardState.logs.at(-1)).toContain(
      `An đổ được 4 và phải trả ${formatMoney(50)} tiền thuê Ga Hà Nội cho Bình.`,
    );

    const utilityState = makeState();
    addPlayer(utilityState, 'p1', { name: 'An', currentTile: 12, accountBalance: 1000 });
    addPlayer(utilityState, 'p2', { name: 'Bình', accountBalance: 1000 });
    own(utilityState, 12, 'p2', { color: 'blue' });

    resolveTile(utilityState, 'p1', 8);

    expect(utilityState.boardState.logs.at(-1)).toContain(
      `An đổ được 8 và phải trả ${formatMoney(32)} tiền thuê Công Ty Điện cho Bình.`,
    );
  });

  it('logs the full rent once when payment starts in shortfall and later resumes', () => {
    const state = makeState();
    addPlayer(state, 'p1', { name: 'An', currentTile: 1, accountBalance: 10 });
    addPlayer(state, 'p2', { name: 'Bình', accountBalance: 1000 });
    own(state, 3, 'p1', { color: 'green' });
    own(state, 1, 'p2', { houses: 3 });

    resolveTile(state, 'p1', 4);

    const rentMessage = `An đổ được 4 và phải trả ${formatMoney(90)} tiền thuê 3 Nhà tại Cà Mau cho Bình.`;
    expect(state.boardState.logs.filter(log => log.includes(rentMessage))).toHaveLength(1);
    expect(state.boardState.paymentQueue?.orderedClaims[0]?.remainingAmount).toBe(80);

    state.players.p1.accountBalance = 80;
    progressPaymentQueue(state);

    expect(state.boardState.paymentQueue).toBeNull();
    expect(state.boardState.logs.filter(log => log.includes(rentMessage))).toHaveLength(1);
  });

  it('does not attribute card-destination rent to the original dice total', () => {
    const state = makeState();
    addPlayer(state, 'p1', { name: 'An', currentTile: 7, accountBalance: 1000 });
    addPlayer(state, 'p2', { name: 'Bình', accountBalance: 1000 });
    own(state, 5, 'p2', { color: 'blue' });
    putCardOnTop(state, 'chance', 'chance-trip-ga-ha-noi');

    resolveTile(state, 'p1', 4);

    const rentMessage = `An phải trả ${formatMoney(25)} tiền thuê Ga Hà Nội cho Bình.`;
    expect(state.boardState.logs).toContainEqual(expect.stringContaining(rentMessage));
    expect(state.boardState.logs.some(log => log.includes('An đổ được 4 và phải trả'))).toBe(false);
  });

  it('scales railroad rent with the number owned', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 5, accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    // p2 owns two railroads: rent is 25 * 2^(2-1) = 50.
    own(state, 5, 'p2', { color: 'blue' });
    own(state, 15, 'p2', { color: 'blue' });
    resolveTile(state, 'p1', 0);
    expect(state.players.p1.accountBalance).toBe(950);
    expect(state.players.p2.accountBalance).toBe(1050);
  });

  it('charges company rent based on the dice roll', () => {
    const state = makeState();
    addPlayer(state, 'p1', { currentTile: 12, accountBalance: 1000 });
    addPlayer(state, 'p2', { accountBalance: 1000 });
    // One utility owned: rent is diceResult * 4.
    own(state, 12, 'p2', { color: 'blue' });
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
    expect(() => checkBalance(state, true)).not.toThrow();
    expect(Object.keys(state.players)).toEqual(['p3', 'p4']);
    expect(state.boardState.players).toEqual(['p3', 'p4']);
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.boardState.turnNumber).toBe(1);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
    expect(state.boardState.ownedProps[3]).toBeUndefined();
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
      characterId: 'panda',
      reason: 'BANKRUPT',
    };
    const logsBefore = state.boardState.logs.length;

    checkWinner(state);
    checkWinner(state);

    expect(state.boardState.winner).toEqual({
      playerId: 'winner',
      name: 'Ada',
      color: 'purple',
      characterId: 'dog',
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
    expect(removePlayerFromGame(state, 'p2')).toBe(true);
    expect(state.boardState.finishedPlayers.p2.reason).toBe('LEFT');
    expect(state.boardState.currentPlayer.id).toBe('p3');
    expect(state.boardState.turnNumber).toBe(1);
    expect(state.boardState.ownedProps[1]).toBeUndefined();
  });
});
