import { RAILROAD_TILE_INDICES, UTILITY_TILE_INDICES } from './tileState';

/**
 * Standard Mode rules that are plain numbers rather than board data, in one place that the client can read.
 *
 * The server enforces every rule below from its own code, and the client shows them to players (the how-to-play guide, the
 * deed text), so a number typed in two places could drift. Board data (prices, rents, build costs, tax amounts, card
 * effects) already lives in `tileState.ts`, `chanceCards.ts` and `chestCards.ts` and is never repeated here.
 *
 * `apps/server/src/rulesContract.test.ts` imports this file and the real server constants and functions and fails when they
 * stop agreeing; change a rule in both places and that test stays green.
 *
 * Money values are game units (1 unit = 1.000 VNĐ, see `money.ts`); durations are whole seconds.
 */

// Players and money.
/** A game starts with at least this many players (all connected and ready). */
export const MIN_PLAYERS_PER_GAME = 2;
/** A room seats at most this many players. */
export const MAX_PLAYERS_PER_GAME = 4;
/** Cash every player starts with. */
export const STARTING_CASH = 1500;
/** Paid by the Bank when a player passes or lands on Xuất Phát by moving forward (never when sent to jail or moving back). */
export const GO_REWARD = 200;

// Buildings.
/** A street holds up to this many Nhà; one more level is the Khách Sạn. */
export const HOUSES_BEFORE_HOTEL = 4;
/** The level of a street with a Khách Sạn. */
export const HOTEL_LEVEL = HOUSES_BEFORE_HOTEL + 1;
/** What the Bank pays the owner for selling back one building level that cost `houseCost` to build: half, rounded down. */
export const houseSaleRefund = (houseCost: number): number => Math.floor(houseCost / 2);

// Rent that is not on the tile itself.
/** Rent of a Ga when its owner holds only that one. */
export const RAILROAD_BASE_RENT = 25;
/** Rent of a Ga for an owner who holds `ownedCount` Ga: 25, 50, 100, 200. */
export const railroadRentForCount = (ownedCount: number): number => (
  ownedCount > 0 ? RAILROAD_BASE_RENT * 2 ** (ownedCount - 1) : 0
);
/** `railroadRentForCount` for one Ga up to every Ga on the board. */
export const RAILROAD_RENT_BY_COUNT: readonly number[] = RAILROAD_TILE_INDICES.map(
  (_, index) => railroadRentForCount(index + 1),
);
/** Công Ty rent is the dice total times this when its owner holds one Công Ty. */
export const UTILITY_RENT_MULTIPLIER_SINGLE = 4;
/** Công Ty rent is the dice total times this when its owner holds every Công Ty. */
export const UTILITY_RENT_MULTIPLIER_BOTH = 10;
/** The Công Ty rent multiplier for an owner who holds `ownedCount` Công Ty. */
export const utilityRentMultiplier = (ownedCount: number): number => {
  if (ownedCount <= 0) return 0;
  return ownedCount >= UTILITY_TILE_INDICES.length
    ? UTILITY_RENT_MULTIPLIER_BOTH
    : UTILITY_RENT_MULTIPLIER_SINGLE;
};

// Colour sets.
/** Solo: while one player owns every street of a colour group, rent on each street of that group is scaled to this percent. */
export const SOLO_COLOR_SET_RENT_PERCENT = 150;
/** 2v2: while one team (both members together) owns every street of a colour group, rent on each of them is scaled to this percent. */
export const TEAM_COLOR_SET_RENT_PERCENT = 200;
/**
 * Scales a rent that is a whole number of game units by a percent. The result is always a whole number of units, rounded down
 * (the same convention as the building refund and the forced-sale price), so the payer never owes a fraction of a unit.
 */
export const scaleRentPercent = (rent: number, percent: number): number => Math.floor(rent * percent / 100);

// Teams (2v2).
/** Players per team in a 2v2 game. */
export const TEAM_SIZE = 2;
/** A 2v2 game seats exactly this many players. */
export const TEAM_2V2_PLAYER_COUNT = TEAM_SIZE * 2;
/** What the survivor pays the Bank to revive a bankrupt teammate (750K). */
export const REVIVE_COST = 750;
/** What a revived player returns with (300K); they own nothing and stand on Xuất Phát. */
export const REVIVE_STARTING_CASH = 300;
/**
 * How many of the surviving teammate's own turns a bankruptcy leaves open for a revive: they may revive before each of their
 * next 5 rolls, and the elimination becomes permanent when their 6th roll comes (the 5th turn ends with the window closed).
 */
export const REVIVE_WINDOW_SURVIVOR_TURNS = 5;
/** Default time the active teammate has to answer an Emergency Rescue offer (the server reads `EMERGENCY_RESCUE_TIMEOUT_MS`). */
export const DEFAULT_EMERGENCY_RESCUE_SECONDS = 30;

// Debt.
/** Share of a property's worth (land price plus what was built on it) that the Bank pays a debtor who sells to it. */
export const FORCED_SALE_PERCENT = 70;
/**
 * What the Bank pays for a property sold to settle a debt: `FORCED_SALE_PERCENT` of the land price plus the cost of every
 * building level on it, rounded down.
 */
export const forcedSaleGrossValue = (price: number, investedBuildCost: number): number => (
  Math.floor((price + investedBuildCost) * FORCED_SALE_PERCENT / 100)
);

// Jail.
/** A jailed player is released automatically when the wait counter (one per turn that comes back to them) reaches this. */
export const JAIL_ROUND_LIMIT = 2;

// Time.
/** How long a trade offer stays open. */
export const OFFER_LIFETIME_SECONDS = 20;
/** How long a debtor's forced-sale proposal to another player stays open. */
export const FORCED_SALE_PROPOSAL_SECONDS = 20;
/** Default wait for a disconnected current player before the turn is skipped (the server reads `RECONNECT_GRACE_MS`). */
export const DEFAULT_RECONNECT_GRACE_SECONDS = 60;
/** Default time a debtor has to raise money (the server reads `PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS`). */
export const DEFAULT_PAYMENT_SHORTFALL_SECONDS = 120;
