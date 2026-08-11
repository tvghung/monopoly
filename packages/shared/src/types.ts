// Shared game data + state types, used by both the server and the client so the
// two sides always agree on the shape of the game state and its data tables.

export const SOCKET_PROTOCOL_VERSION = 1 as const;

export type SocketProtocolVersion = typeof SOCKET_PROTOCOL_VERSION;
export type PlayerId = string;
export type RoomId = string;
export type RoomCode = string;
export type SessionId = string;
export type OfferId = string;
export type AuctionId = string;

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';
export type RoomRole = 'PLAYER' | 'SPECTATOR';
export type RoomMembershipStatus = 'ACTIVE' | 'FINISHED' | 'LEFT';
export type PlayerSessionStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type FinishedPlayerReason = 'BANKRUPT' | 'LEFT';
export type PrivateOfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

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
  reason?: FinishedPlayerReason;
}

export interface Winner extends FinishedPlayer {
  playerId: PlayerId;
}

export interface OwnedProp {
  id: PlayerId;
  color: string;
  // Houses built on this street (0-4 houses, 5 = a hotel).
  houses: number;
  // Whether the property is mortgaged (collects no rent while mortgaged).
  mortgaged: boolean;
}

export interface OpenMarketEntry {
  seller: PlayerId;
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
  id: PlayerId;
  hasMoved: boolean;
}

export interface TurnRecovery {
  turnNumber: number;
  playerId: PlayerId;
  deadlineAt: string;
}

export interface TurnInfo {
  canBuyProp?: boolean;
}

// A live auction for a property the current player declined to buy. Any active
// player can bid; the highest bidder when it ends buys the tile.
export interface Auction {
  auctionId: AuctionId;
  tileID: number;
  tileName: string;
  price: number;
  highestBid: number;
  highestBidder: PlayerId | null;
  highestBidderName: string | null;
  // Player ids taking part in the auction. A transient disconnect preserves
  // participation; only explicit leave/bankruptcy removes a player.
  active: PlayerId[];
  // Player ids who have declined to bid since the last bid. Cleared whenever a
  // new bid is placed, so a fresh bid re-opens the floor to everyone.
  passed: PlayerId[];
  // Authoritative absolute deadline. Runtime timer handles and countdown ticks
  // are deliberately not part of the durable/public contract.
  endsAt: string;
  // Transitional client projection only. New clients derive this from endsAt.
  timer?: number;
}

export interface BoardState {
  gameStarted: boolean;
  players: PlayerId[];
  finishedPlayers: Record<PlayerId, FinishedPlayer>;
  currentPlayer: CurrentPlayer;
  turnNumber: number;
  turnRecovery: TurnRecovery | null;
  logs: string[];
  diceValue: DiceValue;
  ownedProps: Record<number, OwnedProp>;
  openMarket: Record<number, OpenMarketEntry>;
  // Set once a single player remains; drives the win screen.
  winner: Winner | null;
  // The live property auction, or null when none is running.
  auction: Auction | null;
}

export interface GameState {
  boardState: BoardState;
  players: Record<PlayerId, Player>;
  turnInfo: TurnInfo;
  // Retained as a client-facing compatibility flag. Persistent snapshots must
  // omit transport/loading state.
  loaded: boolean;
}

export type PersistedGameState = Omit<GameState, 'loaded'>;

// ---- Room / session DTOs ----

export interface RoomPlayerMeta {
  playerId: PlayerId;
  name: string;
  color: string;
  joinOrder: number;
  membershipStatus: RoomMembershipStatus;
  ready: boolean;
  connected: boolean;
}

export interface PublicRoomState {
  protocolVersion: SocketProtocolVersion;
  version: number;
  roomId: RoomId;
  roomCode: RoomCode;
  status: RoomStatus;
  hostPlayerId: PlayerId | null;
  minPlayers: number;
  maxPlayers: number;
  players: RoomPlayerMeta[];
  gameState: GameState;
}

export interface PlayerSessionSummary {
  sessionId: SessionId;
  status: PlayerSessionStatus;
  roomId: RoomId | null;
  playerId: PlayerId | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface JoinRoomRequest {
  name: string;
  roomCode: RoomCode;
}

export interface ResumeSessionRequest {
  token: string;
}

export interface SetReadyRequest {
  ready: boolean;
}

export interface PendingPlayerAdmission {
  kind: 'PENDING';
  role: 'PLAYER';
  token: string;
  expiresAt: string;
}

export interface SpectatorAdmission {
  kind: 'SPECTATOR';
  role: 'SPECTATOR';
  playerId: null;
  room: PublicRoomState;
}

export type JoinRoomResult = PendingPlayerAdmission | SpectatorAdmission;

export interface ResumeSessionResult {
  role: 'PLAYER';
  playerId: PlayerId;
  room: PublicRoomState;
  pendingOffers: PrivateOffer[];
}

export interface LeaveRoomResult {
  roomDeleted: boolean;
}

export interface SessionReplacedInfo {
  code: 'SESSION_REPLACED';
  message: string;
}

// ---- Trade / open-market payloads ----

// Sent by the client when listing a property on the open market.
export interface SaleInfo {
  tileID: number;
  price: number;
}

// Sent by the client when making a private offer for a property.
export interface OfferInfo {
  tileID: number;
  price: number;
}

export interface OfferAction {
  offerId: OfferId;
}

export interface MakeOfferResult {
  offerId: OfferId;
  expiresAt: string;
}

// Authoritative private offer sent only to the buyer and property owner.
export interface PrivateOffer {
  offerId: OfferId;
  roomId: RoomId;
  buyerPlayerId: PlayerId;
  ownerPlayerId: PlayerId;
  tileID: number;
  price: number;
  buyerName: string;
  ownerName: string;
  tileName: string;
  status: PrivateOfferStatus;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
}

export type OfferOnProp = PrivateOffer;

// Sent privately when an offer leaves the pending state.
export interface OfferResult {
  offerId: OfferId;
  status: Exclude<PrivateOfferStatus, 'PENDING'>;
  tileID: number;
  tileName: string;
  price: number;
  ownerName: string;
  resolvedAt: string;
}

// Compatibility name for UI code while the action payload is narrowed to the
// only client-controlled field the server accepts.
export type Offer = OfferAction;
