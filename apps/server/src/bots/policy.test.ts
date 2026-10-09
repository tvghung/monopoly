import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type {
  PrivateOffer,
  PublicBoardState,
  PublicGameState,
  PublicPlayer,
  PublicRoomState,
} from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import {
  botTaskOf,
  cashReserve,
  decideBotAction,
  findBotTask,
  type BotDecision,
  type BotTask,
} from './policy';
import { seededRandom } from './rng';
import type { BotView } from './view';

const BOT = '00000000-0000-4000-8000-0000000000b1';
const HUMAN = '00000000-0000-4000-8000-0000000000a1';
const OPERATION = '00000000-0000-4000-8000-00000000c0de';

const player = (overrides: Partial<PublicPlayer> = {}): PublicPlayer => ({
  name: 'Bot 1',
  currentTile: 0,
  color: 'blue',
  characterId: 'dog',
  teamId: 'TEAM_1',
  accountBalance: 1500,
  isJail: false,
  jailOpponentRoundsElapsed: 0,
  getOutOfJailCardCount: 0,
  ...overrides,
});

interface Fixture {
  board?: Partial<PublicBoardState>;
  bot?: Partial<PublicPlayer>;
  human?: Partial<PublicPlayer>;
  turnInfo?: PublicGameState['turnInfo'];
  heldJailFreeCardIds?: string[];
  forcedSaleProposal?: BotView['self']['forcedSaleProposal'];
  offers?: PrivateOffer[];
  status?: PublicRoomState['status'];
}

/** A public room exactly as a client would receive it, reduced to what the policy reads. */
function viewOf(fixture: Fixture = {}): BotView {
  const boardState = {
    gameStarted: true,
    gameStartedAt: null,
    matchId: '00000000-0000-4000-8000-00000000aaaa',
    gameMode: 'SOLO',
    winningTeamId: null,
    seatSwapRequests: [],
    teams: [],
    teamPlay: { revivedPlayerIds: [], reviveWindows: [] },
    players: [BOT, HUMAN],
    finishedPlayers: {},
    currentPlayer: { id: BOT, hasMoved: false },
    turnNumber: 4,
    logs: [],
    diceValue: { dice1: 2, dice2: 3 },
    rollSequence: 3,
    ownedProps: {},
    winner: null,
    gameplayEvents: { sequence: 0, events: [] },
    activityFeed: { sequence: 0, events: [] },
    turnRecovery: null,
    paymentShortfall: null,
    ...fixture.board,
  } as unknown as PublicBoardState;
  const gameState: PublicGameState = {
    boardState,
    players: {
      [BOT]: player(fixture.bot),
      [HUMAN]: player({ name: 'Human', color: 'red', characterId: 'cat', teamId: 'TEAM_2', ...fixture.human }),
    },
    turnInfo: fixture.turnInfo ?? {},
    deckCounts: { chance: 14, chest: 14 },
    loaded: true,
  };
  return {
    botId: BOT,
    room: {
      protocolVersion: 12,
      version: 7,
      roomId: '00000000-0000-4000-8000-00000000r00m'.replace('r00m', 'beef'),
      roomCode: 'OTB-TEST23',
      status: fixture.status ?? 'IN_PROGRESS',
      hostPlayerId: HUMAN,
      minPlayers: 2,
      maxPlayers: 4,
      players: [],
      gameState,
    },
    self: {
      playerId: BOT,
      heldJailFreeCardIds: fixture.heldJailFreeCardIds ?? [],
      forcedSaleProposal: fixture.forcedSaleProposal ?? null,
      gameplayEvents: { sequence: 0, events: [] },
    },
    offers: fixture.offers ?? [],
  };
}

const decide = (view: BotView, seed = 'seed'): BotDecision => {
  const task = botTaskOf(view);
  if (!task) throw new Error('no task');
  const decision = decideBotAction(view, task, seededRandom(seed));
  if (!decision) throw new Error('no decision');
  return decision;
};

const purchaseOf = (tileID: number, price: number): PublicGameState['turnInfo'] => ({
  pendingLandingDecision: { kind: 'PURCHASE', operationId: OPERATION, playerId: BOT, tileID, price },
});

const owned = (id: string, houses = 0) => ({ id, color: id === BOT ? 'blue' as const : 'red' as const, houses });

describe('one offline policy', () => {
  it('has no network, AI-service or randomness source other than its seed', () => {
    const source = readFileSync(fileURLToPath(new URL('./policy.ts', import.meta.url)), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(['./rng', './view', '@monopoly/shared']);
    expect(source).not.toMatch(/\bfetch\(|Math\.random|https?:\/\//);
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/difficulty|EASY|HARD/i);
    expect([...code.matchAll(/export function (decide\w*)/g)].map((match) => match[1])).toEqual(['decideBotAction']);
  });
});

describe('what a bot must answer', () => {
  it('finds its own turn, landing decision and card, and nothing on another player\'s turn or outside a game', () => {
    expect(botTaskOf(viewOf())?.kind).toBe('TURN');
    expect(botTaskOf(viewOf({ turnInfo: purchaseOf(3, 60) }))?.kind).toBe('PURCHASE');
    expect(botTaskOf(viewOf({
      turnInfo: { pendingLandingDecision: { kind: 'DEVELOP_HOUSES', operationId: OPERATION, playerId: BOT, tileID: 3, maxQuantity: 4, unitCost: 50 } },
    }))?.kind).toBe('DEVELOP');
    expect(botTaskOf(viewOf({
      turnInfo: { pendingCardInteraction: { operationId: OPERATION, playerId: BOT, turnNumber: 4, deck: 'chance', sourceTile: 7, stage: 'REVEALED', revealedCardId: 'chance-1', continuation: { playerId: BOT, turnNumber: 4 }, deadlineAt: new Date().toISOString() } },
    }))?.kind).toBe('CARD');
    expect(botTaskOf(viewOf({ board: { currentPlayer: { id: HUMAN, hasMoved: false } } }))).toBeNull();
    expect(botTaskOf(viewOf({ board: { currentPlayer: { id: BOT, hasMoved: true } } }))).toBeNull();
    expect(botTaskOf(viewOf({ status: 'LOBBY' }))).toBeNull();
  });

  it('answers a debt even outside its own turn, and waits while another player owes', () => {
    const shortfall = {
      debtorPlayerId: BOT, creditor: 'BANK' as const, amount: 100, remainingAmount: 80, source: { kind: 'TAX' as const, tileID: 4 },
      actionDeadlineAt: new Date().toISOString(), remainingClaimCount: 1, paymentOperationId: OPERATION, claimId: OPERATION,
      rescue: null, sellableProperties: [{ tileID: 1, grossPrice: 42, houses: 0 }],
    };
    expect(botTaskOf(viewOf({ board: { currentPlayer: { id: HUMAN, hasMoved: true }, paymentShortfall: shortfall } }))?.kind).toBe('DEBT');
    expect(botTaskOf(viewOf({ board: { paymentShortfall: { ...shortfall, debtorPlayerId: HUMAN } } }))).toBeNull();
  });

  it('keys a task by the public identity of the wait, so a different wait never reuses an armed timer', () => {
    const first = botTaskOf(viewOf()) as BotTask;
    const later = botTaskOf(viewOf({ board: { rollSequence: 4, turnNumber: 6 } })) as BotTask;
    const rematch = botTaskOf(viewOf({ board: { matchId: '00000000-0000-4000-8000-00000000bbbb' } })) as BotTask;
    expect(new Set([first.key, later.key, rematch.key]).size).toBe(3);
    expect(findBotTask([viewOf({ board: { currentPlayer: { id: HUMAN, hasMoved: false } } }), viewOf()])?.key).toBe(first.key);
  });
});

describe('Balanced purchases', () => {
  it('buys a cheap street with plenty of cash and declines one that would break its reserve', () => {
    expect(decide(viewOf({ turnInfo: purchaseOf(3, 60) })).action.command).toBe('buy property');
    expect(decide(viewOf({ bot: { accountBalance: 200 }, turnInfo: purchaseOf(16, 180) })).action.command).toBe('do not buy');
    expect(decide(viewOf({ bot: { accountBalance: 50 }, turnInfo: purchaseOf(3, 60) })).action.command).toBe('do not buy');
  });

  it('stretches its reserve to complete a colour set but not for an ordinary street', () => {
    const completing = viewOf({ bot: { accountBalance: 300 }, board: { ownedProps: { 37: owned(BOT) } }, turnInfo: purchaseOf(39, 200) });
    const ordinary = viewOf({ bot: { accountBalance: 300 }, turnInfo: purchaseOf(39, 200) });
    expect(decide(completing).action.command).toBe('buy property');
    expect(decide(ordinary).action.command).toBe('do not buy');
  });

  it('keeps a bigger cushion when an opponent owns a dangerous property', () => {
    expect(cashReserve(viewOf().room.gameState, BOT)).toBe(120);
    const danger = viewOf({ board: { ownedProps: { 39: owned(HUMAN, 5) } } });
    expect(cashReserve(danger.room.gameState, BOT)).toBe(650);
    expect(decide(viewOf({ bot: { accountBalance: 600 }, board: { ownedProps: { 39: owned(HUMAN, 5) } }, turnInfo: purchaseOf(24, 240) })).action.command)
      .toBe('do not buy');
  });

  it('is reproducible for one seed, varies only near its threshold, and never breaks liquidity for any seed', () => {
    const near = viewOf({ bot: { accountBalance: 325 }, turnInfo: purchaseOf(16, 200) }); // margin 5 of a 120 reserve
    expect(decide(near, 'a').action).toEqual(decide(near, 'a').action);
    const choices = new Set(Array.from({ length: 40 }, (_, index) => decide(near, `seed-${String(index)}`).action.command));
    expect(choices).toEqual(new Set(['buy property', 'do not buy']));

    const poor = viewOf({ bot: { accountBalance: 130 }, turnInfo: purchaseOf(3, 60) });
    for (let index = 0; index < 40; index += 1) {
      expect(decide(poor, `seed-${String(index)}`).action.command).toBe('do not buy');
    }
  });
});

describe('Balanced development', () => {
  const develop = (cash: number, maxQuantity = 4, kind: 'DEVELOP_HOUSES' | 'UPGRADE_HOTEL' = 'DEVELOP_HOUSES') => viewOf({
    bot: { accountBalance: cash },
    board: { ownedProps: { 3: owned(BOT, kind === 'UPGRADE_HOTEL' ? 4 : 0) } },
    turnInfo: { pendingLandingDecision: { kind, operationId: OPERATION, playerId: BOT, tileID: 3, maxQuantity, unitCost: 50 } },
  });

  it('builds the most houses it can afford above its reserve, skips when short, and upgrades a hotel only with room to spare', () => {
    expect(decide(develop(1500)).action.payload).toMatchObject({ action: 'BUILD_HOUSES', quantity: 4 });
    expect(decide(develop(280)).action.payload).toMatchObject({ action: 'BUILD_HOUSES', quantity: 2 });
    expect(decide(develop(150)).action.payload).toMatchObject({ action: 'SKIP' });
    expect(decide(develop(1500, 1, 'UPGRADE_HOTEL')).action.payload).toMatchObject({ action: 'UPGRADE_HOTEL' });
    expect(decide(develop(150, 1, 'UPGRADE_HOTEL')).action.payload).toMatchObject({ action: 'SKIP' });
    expect(decide(develop(1500)).fallback.payload).toMatchObject({ action: 'SKIP' });
  });
});

describe('Balanced jail choices', () => {
  const jailed = (fixture: Fixture = {}) => viewOf({ ...fixture, bot: { currentTile: 10, isJail: true, ...fixture.bot } });

  it('uses a held card, pays bail when rich, rolls when cash is tight, and waits on a dangerous board', () => {
    expect(decide(jailed({ heldJailFreeCardIds: ['chance-get-out-of-jail'] })).action.command).toBe('use jail card');
    expect(decide(jailed()).action.command).toBe('pay bail');
    expect(decide(jailed({ bot: { accountBalance: 100 } })).action.command).toBe('roll dice');
    const dangerous = { ownedProps: { 1: owned(HUMAN, 1), 3: owned(HUMAN, 1), 6: owned(HUMAN, 2) } };
    expect(decide(jailed({ board: dangerous })).action.command).toBe('wait in jail');
    expect(decide(jailed({ board: dangerous })).fallback.command).toBe('roll dice');
  });
});

describe('Balanced debt, rescue, forced sale and trade answers', () => {
  const shortfall = (remainingAmount: number, sellable: Array<{ tileID: number; grossPrice: number; houses: number }>) => ({
    debtorPlayerId: BOT, creditor: 'BANK', amount: remainingAmount, remainingAmount, source: { kind: 'TAX', tileID: 4 },
    actionDeadlineAt: new Date().toISOString(), remainingClaimCount: 1, paymentOperationId: OPERATION, claimId: OPERATION,
    rescue: null, sellableProperties: sellable,
  });

  it('sells the least valuable property that covers the debt, or the cheapest value per unit raised', () => {
    const covering = viewOf({
      bot: { accountBalance: 0 },
      board: { currentPlayer: { id: BOT, hasMoved: true }, ownedProps: { 1: owned(BOT), 39: owned(BOT) }, paymentShortfall: shortfall(30, [{ tileID: 1, grossPrice: 42, houses: 0 }, { tileID: 39, grossPrice: 280, houses: 0 }]) as never },
    });
    expect(decide(covering).action.payload).toMatchObject({ tileID: 1 });
    const large = viewOf({
      bot: { accountBalance: 0 },
      // Cà Mau and Bạc Liêu make a full set (worth more per unit raised) than the lone Landmark 81.
      board: { currentPlayer: { id: BOT, hasMoved: true }, ownedProps: { 1: owned(BOT), 3: owned(BOT), 39: owned(BOT) }, paymentShortfall: shortfall(900, [{ tileID: 1, grossPrice: 42, houses: 0 }, { tileID: 3, grossPrice: 42, houses: 0 }, { tileID: 39, grossPrice: 280, houses: 0 }]) as never },
    });
    expect(decide(large).action.payload).toMatchObject({ tileID: 39 });
  });

  it('rescues a teammate only when it keeps a cushion', () => {
    const rescue = (amount: number, cash: number) => viewOf({
      bot: { accountBalance: cash },
      board: {
        gameMode: 'TEAM_2V2',
        currentPlayer: { id: HUMAN, hasMoved: true },
        paymentShortfall: { ...shortfall(amount, []), debtorPlayerId: HUMAN, rescue: { rescueId: OPERATION, debtorPlayerId: HUMAN, rescuerPlayerId: BOT, amount, expiresAt: new Date().toISOString() } } as never,
      },
      human: { teamId: 'TEAM_1' },
    });
    expect(decide(rescue(200, 1000)).action.command).toBe('accept rescue');
    expect(decide(rescue(950, 1000)).action.command).toBe('decline rescue');
  });

  it('buys a forced-sale property only below its worth and above its reserve', () => {
    const proposal = (grossPrice: number) => viewOf({
      board: { currentPlayer: { id: HUMAN, hasMoved: true } },
      forcedSaleProposal: { proposalId: OPERATION, paymentOperationId: OPERATION, claimId: OPERATION, sellerPlayerId: HUMAN, buyerPlayerId: BOT, tileID: 39, grossPrice, expectedHouses: 0, expiresAt: new Date().toISOString() },
    });
    expect(decide(proposal(250)).action.command).toBe('accept forced sale');
    expect(decide(proposal(500)).action.command).toBe('reject forced sale');
  });

  const offer = (offered: PrivateOffer['offered'], requested: PrivateOffer['requested']): PrivateOffer => ({
    offerId: OPERATION, roomId: OPERATION, proposerPlayerId: HUMAN, recipientPlayerId: BOT, proposerName: 'Human', recipientName: 'Bot 1',
    offered, requested, status: 'PENDING', createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), resolvedAt: null,
  });
  const none = { cash: 0, propertyIds: [], jailFreeCardIds: [] };

  it('accepts a clear gain, declines a loss and refuses to hand an opponent a full colour set', () => {
    const base = { board: { currentPlayer: { id: HUMAN, hasMoved: false }, ownedProps: { 1: owned(BOT), 3: owned(BOT), 37: owned(HUMAN), 39: owned(BOT) } } };
    expect(decide(viewOf({ ...base, offers: [offer({ ...none, cash: 200 }, { ...none, propertyIds: [1] })] })).action.command).toBe('accept offer');
    expect(decide(viewOf({ ...base, offers: [offer({ ...none, cash: 20 }, { ...none, propertyIds: [1] })] })).action.command).toBe('decline offer');
    // 39 would complete the opponent's blue set: 1.3x value is not enough.
    expect(decide(viewOf({ ...base, offers: [offer({ ...none, cash: 400 }, { ...none, propertyIds: [39] })] })).action.command).toBe('decline offer');
  });

  it('as a debtor takes cash for properties when it beats the Bank\'s 70 %', () => {
    const debtor = (cash: number) => viewOf({
      bot: { accountBalance: 0 },
      board: { currentPlayer: { id: HUMAN, hasMoved: true }, ownedProps: { 39: owned(BOT) }, paymentShortfall: shortfall(300, [{ tileID: 39, grossPrice: 280, houses: 0 }]) as never },
      offers: [offer({ ...none, cash }, { ...none, propertyIds: [39] })],
    });
    expect(decide(debtor(300)).action.command).toBe('accept offer');
    expect(decide(debtor(200)).action.command).toBe('decline offer');
  });

  describe('as a debtor weighs the whole bundle (TRADE)', () => {
    // The bot owes 300 with 50 cash; Landmark 81 (39) would raise 280 from the Bank, Cà Mau (1) 42, Diamond Plaza (37) 245.
    const owing = (tradeOffer: PrivateOffer, overrides: { cash?: number; owed?: number; ownedProps?: Record<number, ReturnType<typeof owned>> } = {}) => {
      const ownedProps = overrides.ownedProps ?? { 1: owned(BOT), 39: owned(BOT) };
      const sellable = Object.keys(ownedProps).map(Number).filter(id => ownedProps[id]?.id === BOT)
        .map(tileID => ({ tileID, grossPrice: tileID === 39 ? 280 : 42, houses: 0 }));
      return decide(viewOf({
        bot: { accountBalance: overrides.cash ?? 50 },
        board: { currentPlayer: { id: HUMAN, hasMoved: true }, ownedProps, paymentShortfall: shortfall(overrides.owed ?? 300, sellable) as never },
        offers: [tradeOffer],
      }));
    };
    const withDiamond = { 1: owned(BOT), 39: owned(BOT), 37: owned(HUMAN) };

    it('counts the cash it would pay back: 300 in and 40 out is 260, below the Bank\'s 280 (the original bug)', () => {
      const asksCashBack = owing(offer({ ...none, cash: 300 }, { ...none, cash: 40, propertyIds: [39] }));
      expect(asksCashBack.action.command).toBe('decline offer');
      expect(asksCashBack.reason).toContain('net=260');
      expect(owing(offer({ ...none, cash: 300 }, { ...none, propertyIds: [39] })).action.command).toBe('accept offer');
    });

    it('refuses to pay cash it does not have', () => {
      expect(owing(offer({ ...none, cash: 500 }, { ...none, cash: 60, propertyIds: [39] })).action.command).toBe('decline offer');
    });

    it('counts incoming properties at what they would raise from the Bank, and a swap is not a set handed over', () => {
      // No cash, but Diamond Plaza (37) and Bạc Liêu (3) raise 287, more than Landmark 81 would: accepted. The Human gives
      // up 37 in the same trade, so receiving 39 completes nothing for them.
      const swap = offer({ ...none, propertyIds: [37, 3] }, { ...none, propertyIds: [39] });
      expect(owing(swap, { ownedProps: { ...withDiamond, 3: owned(HUMAN) } }).action.command).toBe('accept offer');
      const poor = offer({ ...none, propertyIds: [3] }, { ...none, propertyIds: [39] });
      expect(owing(poor, { ownedProps: { 1: owned(BOT), 39: owned(BOT), 3: owned(HUMAN) } }).action.command).toBe('decline offer');
    });

    it('never trades into bankruptcy anyway: the debt must be payable afterwards', () => {
      expect(owing(offer({ ...none, cash: 300 }, { ...none, propertyIds: [39] }), { owed: 900 }).action.command).toBe('decline offer');
    });

    it('counts Get-Out-of-Jail cards and worth when the debt can be paid without the trade', () => {
      // 280 cash plus Landmark 81 already pay the 300: Cà Mau (worth 60) plus a jail card (50) for 60 is a loss.
      const cardToo = (cash: number) => offer({ ...none, cash }, { ...none, propertyIds: [1], jailFreeCardIds: ['card-1'] });
      expect(owing(cardToo(60), { cash: 280 }).action.command).toBe('decline offer');
      expect(owing(cardToo(150), { cash: 280 }).action.command).toBe('accept offer');
    });

    it('does not hand an opponent a full colour set at Bank price', () => {
      // The Human holds Diamond Plaza (37): Landmark 81 (39, worth 600 to the bot as a blocker) completes their set.
      expect(owing(offer({ ...none, cash: 300 }, { ...none, propertyIds: [39] }), { ownedProps: withDiamond }).action.command).toBe('decline offer');
      expect(owing(offer({ ...none, cash: 1200 }, { ...none, propertyIds: [39] }), { ownedProps: withDiamond }).action.command).toBe('accept offer');
    });

    it('declines a bundle that raises nothing', () => {
      expect(owing(offer(none, { ...none, jailFreeCardIds: ['card-1'] })).action.command).toBe('decline offer');
      expect(owing(offer(none, none)).action.command).toBe('decline offer');
    });
  });
});

describe('2v2 revive', () => {
  it('revives a teammate on its own turn when rich enough, otherwise just rolls', () => {
    const window = (cash: number, openedAtTurnNumber = 2) => viewOf({
      bot: { accountBalance: cash },
      board: {
        gameMode: 'TEAM_2V2',
        teamPlay: { revivedPlayerIds: [], reviveWindows: [{ playerId: HUMAN, teamId: 'TEAM_1', survivorPlayerId: BOT, turnsRemaining: 3, openedAtTurnNumber }] },
      },
    });
    expect(decide(window(1500)).action.command).toBe('revive teammate');
    expect(decide(window(900)).action.command).toBe('roll dice');
    expect(decide(window(1500, 4)).action.command).toBe('roll dice'); // opened during this very turn
  });
});
