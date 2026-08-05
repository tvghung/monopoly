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
  rent?: number;
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
}

// Community Chest and Chance decks share the same card shape.
export type ChestCard = GameCard;

export interface Player {
  name: string;
  currentTile: number;
  color: string;
  accountBalance: number;
  isJail: boolean;
  jailRounds: number;
}

export interface FinishedPlayer {
  name: string;
  color: string;
}

export interface OwnedProp {
  id: string;
  color: string;
}

export interface OpenMarketEntry {
  seller: string;
  price: number;
  sellerName: string;
  tileName: string;
}

// A single die: [glyph, pip value]. e.g. ['⚄', 5].
export type Die = [string, number];

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

export interface BoardState {
  gameStarted: boolean;
  players: string[];
  finishedPlayers: Record<string, FinishedPlayer>;
  currentPlayer: CurrentPlayer;
  logs: string[];
  diceValue: DiceValue;
  ownedProps: Record<number, OwnedProp>;
  openMarket: Record<number, OpenMarketEntry>;
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
  buyerName?: string;
  timer?: number;
}
