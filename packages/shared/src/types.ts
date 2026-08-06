// Shared game data + state types, used by both the server and the client so the
// two sides always agree on the shape of the game state and its data tables.

export type TileType =
  | 'start'
  | 'normal'
  | 'chest'
  | 'chance'
  | 'expense'
  | 'railroad'
  | 'jail'
  | 'gojail'
  | 'company'
  | 'parking';

export interface Tile {
  streetName: string;
  tileType: TileType;
  color?: string;
  price?: number;
  // Base rent (no houses, not a monopoly).
  rent?: number;
  // Rent with [1, 2, 3, 4 houses, hotel]. Only on buildable street tiles.
  rentTiers?: number[];
  // Cost of one house/hotel on this tile's colour group.
  houseCost?: number;
}

// A Chance / Community Chest card. Every field except `message` is an optional
// effect; the server applies whichever ones are present (see `applyCard`).
export interface GameCard {
  // Text shown in the game log when the card is drawn.
  message: string;
  // Collect this amount from the bank.
  reward?: number;
  // Pay this amount to the bank.
  penalty?: number;
  // Move to an absolute tile index (money is handled explicitly via reward).
  moveToTile?: number;
  // Move relative to the current tile (negative = backwards); wraps the board.
  moveBy?: number;
  // Send the player straight to jail (no "pass GO" bonus).
  goToJail?: boolean;
  // Collect this amount from every other player.
  collectFromEachPlayer?: number;
  // Pay this amount to every other player.
  payEachPlayer?: number;
  // Grant a "Get out of jail free" card the player can keep and use later.
  getOutOfJailFree?: boolean;
}

export interface Player {
  name: string;
  currentTile: number;
  color: string;
  accountBalance: number;
  isJail: boolean;
  jailRounds: number;
  // Number of "Get out of jail free" cards the player is holding.
  getOutOfJailCards: number;
}

export interface FinishedPlayer {
  name: string;
  color: string;
}

export interface OwnedProp {
  id: string;
  color: string;
  // Houses built on this street (0-4 houses, 5 = a hotel).
  houses: number;
  // Whether the property is mortgaged (collects no rent while mortgaged).
  mortgaged: boolean;
}

export interface OpenMarketEntry {
  seller: string;
  price: number;
  sellerName: string;
  tileName: string;
}

// A single die's pip value, 1-6 (0 before the first roll). The client renders
// the pips from this number; the old Unicode glyph column is no longer used.
export type Die = number;

export interface DiceValue {
  dice1: Die;
  dice2: Die;
}

export interface CurrentPlayer {
  id: string;
  hasMoved: boolean;
}

export interface TurnInfo {
  canBuyProp?: boolean;
}

// A live auction for a property the current player declined to buy. Any active
// player can bid; the highest bidder when it ends buys the tile.
export interface Auction {
  tileID: number;
  tileName: string;
  price: number;
  highestBid: number;
  highestBidder: string | null;
  highestBidderName: string | null;
  // Player ids taking part in the auction (only removed if they disconnect).
  active: string[];
  // Player ids who have declined to bid since the last bid. Cleared whenever a
  // new bid is placed, so a fresh bid re-opens the floor to everyone.
  passed: string[];
  // Seconds remaining before the auction resolves.
  timer: number;
}

export interface BoardState {
  gameStarted: boolean;
  players: string[];
  finishedPlayers: Record<string, FinishedPlayer>;
  currentPlayer: CurrentPlayer;
  logs: string[];
  diceValue: DiceValue;
  ownedProps: Record<number, OwnedProp>;
  openMarket: Record<number, OpenMarketEntry>;
  // Set once a single player remains; drives the win screen.
  winner: FinishedPlayer | null;
  // The live property auction, or null when none is running.
  auction: Auction | null;
}

export interface GameState {
  boardState: BoardState;
  players: Record<string, Player>;
  turnInfo: TurnInfo;
  loaded: boolean;
}

// ---- Trade / open-market payloads ----

// Sent by the client when listing a property on the open market.
export interface SaleInfo {
  tileID: number;
  playerId: string;
  price: number;
}

// Sent by the client when making a private offer for a property.
export interface OfferInfo {
  tileID: number;
  playerId: string;
  price: number;
}

// Sent by the server to a property owner when someone offers to buy it.
export interface OfferOnProp extends OfferInfo {
  buyerName: string;
  tileName: string;
}

// Sent back to the offering player when the owner accepts/declines.
export interface OfferResult {
  tileName: string;
  price: number;
  ownerName: string;
}

// The offer object the owner acts on (accept/decline).
export interface Offer {
  tileID: number;
  playerId: string;
  price: number;
  tileName: string;
}
