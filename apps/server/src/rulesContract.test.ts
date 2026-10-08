import type { AddressInfo } from 'node:net';
import {
  colorGroups,
  DEFAULT_EMERGENCY_RESCUE_SECONDS,
  DEFAULT_PAYMENT_SHORTFALL_SECONDS,
  DEFAULT_RECONNECT_GRACE_SECONDS,
  FORCED_SALE_PERCENT,
  FORCED_SALE_PROPOSAL_SECONDS,
  forcedSaleGrossValue,
  GO_REWARD,
  HOTEL_LEVEL,
  HOUSES_BEFORE_HOTEL,
  houseSaleRefund,
  JAIL_ROUND_LIMIT,
  MAX_PLAYERS_PER_GAME,
  MIN_PLAYERS_PER_GAME,
  OFFER_LIFETIME_SECONDS,
  RAILROAD_BASE_RENT,
  RAILROAD_RENT_BY_COUNT,
  RAILROAD_TILE_INDICES,
  railroadRentForCount,
  REVIVE_COST,
  REVIVE_STARTING_CASH,
  REVIVE_WINDOW_SURVIVOR_TURNS,
  SOCKET_PROTOCOL_VERSION,
  SOLO_COLOR_SET_RENT_PERCENT,
  STARTING_CASH,
  TEAM_2V2_PLAYER_COUNT,
  TEAM_COLOR_SET_RENT_PERCENT,
  TEAM_NAME_MAX_LENGTH,
  TEAM_SIZE,
  tileState,
  UTILITY_RENT_MULTIPLIER_BOTH,
  UTILITY_RENT_MULTIPLIER_SINGLE,
  UTILITY_TILE_INDICES,
  utilityRentMultiplier,
  type Ack,
  type AckCallback,
  type ClientToServerEvents,
  type GameState,
  type JoinRoomResult,
  type MakeOfferResult,
  type PlayerId,
  type ResumeSessionResult,
  type ServerToClientEvents,
} from '@monopoly/shared';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

import { loadServerConfig } from './config.js';
import { createServer } from './createServer.js';
import {
  DEFAULT_FORCED_SALE_PROPOSAL_TIMEOUT_MS,
  DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS,
  forcedSaleGrossPrice,
  moveBy,
  moveToJail,
  nextTurn,
  railroadRent,
  resolveTile,
  sellHouse,
  streetRent,
  utilityRent,
} from './game';
import { START_REWARD } from './game/dice';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import {
  createFreshPlayer,
  freshState,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type RoomSnapshot,
} from './rooms.js';
import { createAppRuntime } from './services/runtime.js';
import { registerSocketHandlers } from './socket/index.js';

/*
 * `packages/shared/src/rules.ts` is the one place the client reads the Standard Mode numbers that the server enforces from
 * its own code (the how-to-play guide and the deed text show them to players). This file keeps the two from drifting: it
 * checks the rules file itself, then drives the real server constants and functions and compares them with it. When a rule
 * changes on the server, this test fails until `rules.ts` (and the guide that reads it) change too.
 */

// A small deterministic game state to drive the real game functions with. Two players, so a turn can pass.
const makeState = (playerIds: readonly PlayerId[] = ['p1', 'p2']): GameState => {
  const state = freshState();
  state.boardState.gameStarted = true;
  for (const id of playerIds) {
    state.players[id] = createFreshPlayer(id, 'red', 'dog');
    state.boardState.players.push(id);
  }
  state.boardState.currentPlayer.id = playerIds[0];
  return state;
};

const own = (state: GameState, tileID: number, owner: PlayerId, houses = 0): void => {
  state.boardState.ownedProps[tileID] = { id: owner, color: 'red', houses };
};

const streetIndices = tileState.flatMap((tile, index) => (tile.tileType === 'normal' ? [index] : []));

describe('rules.ts', () => {
  it('computes the Ga rent: 25, 50, 100, 200 for one to four Ga, and nothing for none', () => {
    expect(RAILROAD_BASE_RENT).toBe(25);
    expect([0, 1, 2, 3, 4].map(railroadRentForCount)).toEqual([0, 25, 50, 100, 200]);
    expect(RAILROAD_RENT_BY_COUNT).toEqual([25, 50, 100, 200]);
    expect(RAILROAD_RENT_BY_COUNT).toHaveLength(RAILROAD_TILE_INDICES.length);
  });

  it('computes the Công Ty multiplier: 4 for one, 10 for every Công Ty', () => {
    expect(UTILITY_RENT_MULTIPLIER_SINGLE).toBe(4);
    expect(UTILITY_RENT_MULTIPLIER_BOTH).toBe(10);
    expect([0, 1, 2, 3].map(utilityRentMultiplier)).toEqual([0, 4, 10, 10]);
    expect(UTILITY_TILE_INDICES).toHaveLength(2);
  });

  it('computes the Bank price of a forced sale as 70% of land and buildings, rounded down', () => {
    expect(FORCED_SALE_PERCENT).toBe(70);
    expect(forcedSaleGrossValue(60, 0)).toBe(42);
    expect(forcedSaleGrossValue(60, 100)).toBe(112);
    expect(forcedSaleGrossValue(150, 0)).toBe(105);
    expect(forcedSaleGrossValue(55, 0)).toBe(38);
  });

  it('refunds half of a building level, rounded down', () => {
    expect(houseSaleRefund(50)).toBe(25);
    expect(houseSaleRefund(75)).toBe(37);
    expect(houseSaleRefund(200)).toBe(100);
  });

  it('keeps the plain constants of the Standard Mode', () => {
    expect([MIN_PLAYERS_PER_GAME, MAX_PLAYERS_PER_GAME]).toEqual([2, 4]);
    expect(STARTING_CASH).toBe(1500);
    expect(GO_REWARD).toBe(200);
    expect([HOUSES_BEFORE_HOTEL, HOTEL_LEVEL]).toEqual([4, 5]);
    expect(JAIL_ROUND_LIMIT).toBe(2);
    expect([OFFER_LIFETIME_SECONDS, FORCED_SALE_PROPOSAL_SECONDS]).toEqual([20, 20]);
    expect([DEFAULT_RECONNECT_GRACE_SECONDS, DEFAULT_PAYMENT_SHORTFALL_SECONDS]).toEqual([60, 120]);
  });

  it('fits the shared board data: every street has a build cost and a rent for each level, a district shares one cost', () => {
    expect(streetIndices).toHaveLength(22);
    for (const index of streetIndices) {
      const tile = tileState[index];
      expect(tile.houseCost, tile.streetName).toBeGreaterThan(0);
      expect(tile.rentTiers, tile.streetName).toHaveLength(HOTEL_LEVEL);
    }
    for (const [color, indices] of Object.entries(colorGroups)) {
      expect(new Set(indices.map((index) => tileState[index].houseCost)).size, color).toBe(1);
    }
  });

  it('keeps the tax tiles at the amounts the guide reads (200 and 100; they are charged, not free)', () => {
    const expense = tileState.flatMap((tile, index) => (
      tile.tileType === 'expense' ? [{ index, name: tile.streetName, amount: tile.expenseAmount }] : []
    ));
    expect(expense).toEqual([
      { index: 4, name: 'Thuế Thu Nhập', amount: 200 },
      { index: 38, name: 'Thuế Xa Xỉ', amount: 100 },
    ]);
  });
});

describe('rules.ts agrees with the server', () => {
  it('starts every player with the starting cash on Xuất Phát', () => {
    const player = createFreshPlayer('Ada', 'red', 'dog');
    expect(player.accountBalance).toBe(STARTING_CASH);
    expect(player.currentTile).toBe(0);
  });

  it('seats the same number of players', () => {
    expect(MIN_PLAYERS).toBe(MIN_PLAYERS_PER_GAME);
    expect(MAX_PLAYERS).toBe(MAX_PLAYERS_PER_GAME);
  });

  it('pays the Xuất Phát reward when passing or landing on it, and not when sent to jail or moving back', () => {
    expect(START_REWARD).toBe(GO_REWARD);

    const passing = makeState();
    passing.players.p1.currentTile = 39;
    moveBy(passing, 'p1', 3);
    expect(passing.players.p1.currentTile).toBe(2);
    expect(passing.players.p1.accountBalance).toBe(STARTING_CASH + GO_REWARD);

    const landing = makeState();
    landing.players.p1.currentTile = 36;
    moveBy(landing, 'p1', 4);
    expect(landing.players.p1.currentTile).toBe(0);
    expect(landing.players.p1.accountBalance).toBe(STARTING_CASH + GO_REWARD);

    const back = makeState();
    back.players.p1.currentTile = 2;
    moveBy(back, 'p1', -3);
    expect(back.players.p1.currentTile).toBe(39);
    expect(back.players.p1.accountBalance).toBe(STARTING_CASH);

    const jailed = makeState();
    jailed.players.p1.currentTile = 30;
    moveToJail(jailed, 'p1', 'BOARD_TILE');
    expect(jailed.players.p1.accountBalance).toBe(STARTING_CASH);
  });

  it('charges the Ga rent the rules file computes, for one to four Ga', () => {
    RAILROAD_TILE_INDICES.forEach((_, index) => {
      const owned = index + 1;
      const state = makeState();
      RAILROAD_TILE_INDICES.slice(0, owned).forEach((tileID) => own(state, tileID, 'p2'));
      expect(railroadRent(state, RAILROAD_TILE_INDICES[0]), `${owned} Ga`).toBe(railroadRentForCount(owned));
      expect(railroadRent(state, RAILROAD_TILE_INDICES[0]), `${owned} Ga`).toBe(RAILROAD_RENT_BY_COUNT[index]);
    });
  });

  it('charges the Công Ty rent as the dice total times the multiplier the rules file computes', () => {
    UTILITY_TILE_INDICES.forEach((_, index) => {
      const owned = index + 1;
      const state = makeState();
      UTILITY_TILE_INDICES.slice(0, owned).forEach((tileID) => own(state, tileID, 'p2'));
      for (const total of [2, 7, 12]) {
        expect(utilityRent(state, UTILITY_TILE_INDICES[0], total), `${owned} Công Ty, dice ${total}`)
          .toBe(total * utilityRentMultiplier(owned));
      }
    });
    const single = makeState();
    own(single, UTILITY_TILE_INDICES[0], 'p2');
    expect(utilityRent(single, UTILITY_TILE_INDICES[0], 5)).toBe(5 * UTILITY_RENT_MULTIPLIER_SINGLE);
    const both = makeState();
    UTILITY_TILE_INDICES.forEach((tileID) => own(both, tileID, 'p2'));
    expect(utilityRent(both, UTILITY_TILE_INDICES[0], 5)).toBe(5 * UTILITY_RENT_MULTIPLIER_BOTH);
  });

  it('pays the Bank price of a forced sale that the rules file computes, for every property and building level', () => {
    for (const [index, tile] of tileState.entries()) {
      if (typeof tile.price !== 'number') continue;
      if (tile.tileType === 'normal') {
        for (let houses = 0; houses <= HOTEL_LEVEL; houses += 1) {
          expect(forcedSaleGrossPrice(index, houses), `${tile.streetName} with ${houses}`)
            .toBe(forcedSaleGrossValue(tile.price, houses * (tile.houseCost ?? 0)));
        }
      } else {
        expect(forcedSaleGrossPrice(index, 0), tile.streetName).toBe(forcedSaleGrossValue(tile.price, 0));
      }
    }
    // Spot check of the written rule: 70% of price plus buildings.
    expect(forcedSaleGrossPrice(1, 2)).toBe(Math.floor((60 + 2 * 50) * FORCED_SALE_PERCENT / 100));
  });

  it('refunds half a building level when it is sold back, from a Nhà or from the Khách Sạn', () => {
    for (const houses of [1, HOUSES_BEFORE_HOTEL, HOTEL_LEVEL]) {
      const state = makeState();
      own(state, 1, 'p1', houses);
      const before = state.players.p1.accountBalance;
      expect(sellHouse(state, 'p1', 1)).toBe(true);
      expect(state.players.p1.accountBalance - before).toBe(houseSaleRefund(tileState[1].houseCost ?? 0));
      expect(state.boardState.ownedProps[1].houses).toBe(houses - 1);
    }
  });

  it('opens a development choice up to the Nhà limit, then the Khách Sạn upgrade, then nothing', () => {
    for (let level = 0; level <= HOTEL_LEVEL; level += 1) {
      const state = makeState();
      state.players.p1.currentTile = 1;
      own(state, 1, 'p1', level);
      resolveTile(state, 'p1', 0);
      const decision = state.turnInfo.pendingDevelopmentDecision;
      if (level < HOUSES_BEFORE_HOTEL) {
        expect(decision, `level ${level}`).toMatchObject({ kind: 'HOUSES', levelAtLanding: level });
      } else if (level === HOUSES_BEFORE_HOTEL) {
        expect(decision, `level ${level}`).toMatchObject({ kind: 'HOTEL', levelAtLanding: level });
      } else {
        expect(decision, `level ${level}`).toBeUndefined();
      }
    }
  });

  it('charges each tax tile the amount in the tile data, to the Bank', () => {
    for (const [index, tile] of tileState.entries()) {
      if (tile.tileType !== 'expense') continue;
      const state = makeState();
      state.players.p1.currentTile = index;
      resolveTile(state, 'p1', 0);
      expect(state.players.p1.accountBalance, tile.streetName).toBe(STARTING_CASH - (tile.expenseAmount ?? 0));
      expect(state.players.p2.accountBalance, 'nobody else is paid').toBe(STARTING_CASH);
    }
  });

  it('frees a jailed player when the wait counter reaches the round limit, before the turn begins', () => {
    const state = makeState();
    state.players.p1.isJail = true;
    state.players.p1.jailOpponentRoundsElapsed = 0;

    let turnsBackToJailedPlayer = 0;
    for (let step = 0; step < 20 && state.players.p1.isJail; step += 1) {
      nextTurn(state);
      if (state.boardState.currentPlayer.id === 'p1') turnsBackToJailedPlayer += 1;
      if (state.players.p1.isJail) {
        expect(state.players.p1.jailOpponentRoundsElapsed).toBe(turnsBackToJailedPlayer);
      }
    }
    expect(state.players.p1.isJail).toBe(false);
    expect(turnsBackToJailedPlayer).toBe(JAIL_ROUND_LIMIT);
  });

  it('uses the default waits the rules file names (an environment variable may change them)', () => {
    const { persistenceTiming } = loadServerConfig({});
    expect(persistenceTiming.reconnectGraceMs).toBe(DEFAULT_RECONNECT_GRACE_SECONDS * 1000);
    expect(persistenceTiming.paymentShortfallActionTimeoutMs).toBe(DEFAULT_PAYMENT_SHORTFALL_SECONDS * 1000);
    expect(DEFAULT_PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS).toBe(DEFAULT_PAYMENT_SHORTFALL_SECONDS * 1000);
    expect(DEFAULT_FORCED_SALE_PROPOSAL_TIMEOUT_MS).toBe(FORCED_SALE_PROPOSAL_SECONDS * 1000);
    expect(persistenceTiming.emergencyRescueTimeoutMs).toBe(DEFAULT_EMERGENCY_RESCUE_SECONDS * 1000);
  });

  it('keeps the 2v2 numbers the how-to-play guide prints, and the server charges the Solo set bonus they name', () => {
    expect([SOLO_COLOR_SET_RENT_PERCENT, TEAM_COLOR_SET_RENT_PERCENT]).toEqual([150, 200]);
    expect([REVIVE_COST, REVIVE_STARTING_CASH, REVIVE_WINDOW_SURVIVOR_TURNS]).toEqual([750, 300, 5]);
    expect([TEAM_SIZE, TEAM_2V2_PLAYER_COUNT, TEAM_NAME_MAX_LENGTH]).toEqual([2, 4, 20]);
    expect(DEFAULT_EMERGENCY_RESCUE_SECONDS).toBe(30);

    // The real rent function: a lone street pays its base rent, a completed set pays the Solo percentage of it, rounded down.
    const state = makeState();
    const [first, second] = colorGroups.brown;
    state.boardState.ownedProps[first] = { id: 'p1', color: 'red', houses: 0 };
    const lone = streetRent(state, first);
    expect(lone).toBe(tileState[first].rent);
    state.boardState.ownedProps[second] = { id: 'p1', color: 'red', houses: 0 };
    expect(streetRent(state, first)).toBe(Math.floor((lone * SOLO_COLOR_SET_RENT_PERCENT) / 100));
  });
});

// The offer lifetime is a private constant of the trading handler, so it is read from behavior: a real offer over a real
// socket carries the absolute expiry the server chose.
type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const openSockets: TestSocket[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const socket of openSockets.splice(0)) socket.disconnect();
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function startServer(): Promise<string> {
  const timing = loadServerConfig({}).persistenceTiming;
  const runtime = createAppRuntime(new InMemoryPersistenceStore<RoomSnapshot>(), timing);
  const { server, io } = createServer(runtime);
  registerSocketHandlers(io, runtime, 'development');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  closers.push(async () => {
    runtime.flags.shuttingDown = true;
    await io.close();
  });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

async function connect(url: string): Promise<TestSocket> {
  const socket: TestSocket = createClient(url, {
    auth: { protocolVersion: SOCKET_PROTOCOL_VERSION },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  openSockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 2_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}

function ack<TResult>(emit: (acknowledge: AckCallback<TResult>) => void): Promise<Ack<TResult>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket acknowledgement timed out')), 2_000);
    emit((acknowledgement) => {
      clearTimeout(timer);
      resolve(acknowledgement);
    });
  });
}

function data<TResult>(acknowledgement: Ack<TResult>): TResult {
  if (!acknowledgement.ok || acknowledgement.data === undefined) {
    throw new Error(`Expected a successful acknowledgement, received ${JSON.stringify(acknowledgement)}`);
  }
  return acknowledgement.data;
}

function succeeded(acknowledgement: Ack): void {
  if (!acknowledgement.ok) {
    throw new Error(`Expected a successful acknowledgement, received ${acknowledgement.error.code}`);
  }
}

async function joinAndReady(socket: TestSocket, name: string): Promise<PlayerId> {
  const admission = data(await ack<JoinRoomResult>((acknowledge) => {
    socket.emit('join room', { name, roomCode: 'rules-contract' }, acknowledge);
  }));
  if (admission.kind !== 'PENDING') throw new Error('Expected a pending player admission');
  const resumed = data(await ack<ResumeSessionResult>((acknowledge) => {
    socket.emit('resume session', { token: admission.token }, acknowledge);
  }));
  succeeded(await ack((acknowledge) => { socket.emit('set appearance', { characterId: 'dog' }, acknowledge); }));
  succeeded(await ack((acknowledge) => { socket.emit('set ready', { ready: true }, acknowledge); }));
  return resumed.playerId;
}

describe('rules.ts agrees with the trading handler', () => {
  it('gives every new offer the absolute expiry the rules file names', async () => {
    const url = await startServer();
    const host = await connect(url);
    const guest = await connect(url);
    const hostId = await joinAndReady(host, 'Host');
    await joinAndReady(guest, 'Guest');
    succeeded(await ack((acknowledge) => { host.emit('start game', acknowledge); }));

    const before = Date.now();
    const offer = data(await ack<MakeOfferResult>((acknowledge) => {
      guest.emit('make offer', {
        recipientPlayerId: hostId,
        offered: { cash: 1, propertyIds: [], jailFreeCardIds: [] },
        requested: { cash: 0, propertyIds: [], jailFreeCardIds: [] },
      }, acknowledge);
    }));
    const after = Date.now();

    const lifetimeMs = OFFER_LIFETIME_SECONDS * 1000;
    const expiresAt = Date.parse(offer.expiresAt);
    expect(expiresAt).toBeGreaterThanOrEqual(before + lifetimeMs);
    expect(expiresAt).toBeLessThanOrEqual(after + lifetimeMs);
  });
});
