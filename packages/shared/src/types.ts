// Shared game data + state types, used by both the server and the client so the
// two sides always agree on the shape of the game state and its data tables.

export const SOCKET_PROTOCOL_VERSION = 5 as const;

export type SocketProtocolVersion = typeof SOCKET_PROTOCOL_VERSION;
export type PlayerId = string;
export type RoomId = string;
export type RoomCode = string;
export type SessionId = string;
export type OfferId = string;
export type GameCardId = string;
export type DebtClaimId = string;
export type PaymentClaimId = DebtClaimId;
export type ForcedSaleProposalId = string;

export const CHARACTER_IDS = [
  'dog',
  'capybara',
  'panda',
  'cat',
  'penguin',
  'elephant',
  'rabbit',
  'duck',
] as const;

export type CharacterId = typeof CHARACTER_IDS[number];

/**
 * Character ids written by the original V5 appearance rollout. They remain
 * readable at the durable snapshot boundary, but are never emitted by the
 * current roster or appearance command schema.
 */
export const LEGACY_CHARACTER_ID_MAP: Record<string, CharacterId> = {
  shiba: 'dog',
  fox: 'elephant',
};

export const PLAYER_COLOR_IDS = [
  'red',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'pink',
  'cyan',
  'lime',
  'charcoal',
] as const;

export type PlayerColorId = typeof PLAYER_COLOR_IDS[number];

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

// A Cơ Hội / Khí Vận card. Identity, source deck and message are required; the
// server applies whichever optional effects are present.
export interface GameCard {
  // Stable identity is required because jail-free cards leave and later rejoin
  // their source deck.
  id: GameCardId;
  sourceDeck: CardDeck;
  // Text shown in the game log when the card is drawn.
  message: string;
  // Collect this amount from the bank.
  reward?: number;
  // Pay this amount to the bank.
  penalty?: number;
  // Move to an absolute tile index. The movement helper owns forward pass-GO
  // rewards; cards never duplicate that reward as a separate effect.
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

export type CardDeck = 'chance' | 'chest';

export interface DeckState {
  // The first id is the next card to draw. Normal cards rotate to the end;
  // held jail-free cards remain absent until returned to this pile.
  drawPile: GameCardId[];
}

export type GameDecks = Record<CardDeck, DeckState>;
export type DeckCounts = Record<CardDeck, number>;

export interface GamePrivateState {
  decks: GameDecks;
  forcedSaleProposal?: ForcedSaleProposal | null;
}

export interface Player {
  name: string;
  currentTile: number;
  color: PlayerColorId;
  characterId: CharacterId | null;
  accountBalance: number;
  isJail: boolean;
  jailOpponentRoundsElapsed: number;
  // Exact ids preserve the source deck while a jail-free card is held.
  heldJailFreeCardIds: GameCardId[];
}

export interface PublicPlayer extends Omit<Player, 'heldJailFreeCardIds'> {
  getOutOfJailCardCount: number;
}

export interface PrivatePlayerState {
  playerId: PlayerId;
  heldJailFreeCardIds: GameCardId[];
  forcedSaleProposal?: ForcedSaleProposal | null;
}

export interface FinishedPlayer {
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  reason?: FinishedPlayerReason;
}

export interface Winner extends FinishedPlayer {
  playerId: PlayerId;
}

export interface OwnedProp {
  id: PlayerId;
  color: PlayerColorId;
  // Houses built on this street (0-4 houses, 5 = a hotel).
  houses: number;
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
  /** Operation currently waiting on this turn, if any; used for stale recovery. */
  pendingOperationId?: string | null;
}

// Durable instruction for completing a waiting payment/landing operation.
// `turnNumber` makes stale recovery a no-op. `NO_TURN_CHANGE` is used only when
// a payment continuation survives elimination of the original current player.
export interface PendingTurnContinuation {
  playerId: PlayerId;
  turnNumber: number;
  resume?: { kind: 'NO_TURN_CHANGE' };
}

export interface PendingPropertyDecision {
  operationId: string;
  playerId: PlayerId;
  tileID: number;
  continuation: PendingTurnContinuation;
}

export interface PendingDevelopmentDecision {
  operationId: string;
  playerId: PlayerId;
  turnNumber: number;
  tileID: number;
  levelAtLanding: 0 | 1 | 2 | 3 | 4;
  kind: 'HOUSES' | 'HOTEL';
  continuation: PendingTurnContinuation;
}

export type PendingLandingDecision = PendingPropertyDecision | PendingDevelopmentDecision;

export interface TurnInfo {
  pendingPropertyDecision?: PendingPropertyDecision;
  pendingDevelopmentDecision?: PendingDevelopmentDecision;
}

export type DebtCreditor = 'PLAYER' | 'BANK';

export type DebtSource =
  | { kind: 'RENT'; tileID: number }
  | { kind: 'CARD'; cardId: GameCardId }
  | { kind: 'OTHER'; description: string };

export type DebtClaimStatus = 'PENDING' | 'SETTLED' | 'BANKRUPT';

export interface DebtClaim {
  claimId: DebtClaimId;
  debtorPlayerId: PlayerId;
  creditor: DebtCreditor;
  creditorPlayerId?: PlayerId;
  amount: number;
  remainingAmount: number;
  source: DebtSource;
  status?: DebtClaimStatus;
}

export interface PaymentQueue {
  operationId: string;
  orderedClaims: DebtClaim[];
  activeClaimIndex: number;
  continuation: PendingTurnContinuation;
  actionDeadlineAt: string;
}

export interface ForcedSaleProposal {
  proposalId: ForcedSaleProposalId;
  paymentOperationId: string;
  claimId: PaymentClaimId;
  sellerPlayerId: PlayerId;
  buyerPlayerId: PlayerId;
  tileID: number;
  grossPrice: number;
  expectedHouses: number;
  expiresAt: string;
}

export interface BoardState {
  gameStarted: boolean;
  // Set by the authoritative start command; optional for older persisted snapshots.
  gameStartedAt?: string | null;
  players: PlayerId[];
  finishedPlayers: Record<PlayerId, FinishedPlayer>;
  currentPlayer: CurrentPlayer;
  turnNumber: number;
  turnRecovery: TurnRecovery | null;
  logs: string[];
  diceValue: DiceValue;
  ownedProps: Record<number, OwnedProp>;
  // Set once a single player remains; drives the win screen.
  winner: Winner | null;
  paymentQueue: PaymentQueue | null;
}

export interface GameState {
  boardState: BoardState;
  players: Record<PlayerId, Player>;
  turnInfo: TurnInfo;
  // Server/persistence only. Public projection must never expose draw order.
  privateState: GamePrivateState;
  // Retained as a client-facing compatibility flag. Persistent snapshots must
  // omit transport/loading state.
  loaded: boolean;
}

export type PersistedGameState = Omit<GameState, 'loaded'>;

export interface PublicDebtState {
  debtorPlayerId: PlayerId;
  creditor: DebtCreditor;
  creditorPlayerId?: PlayerId;
  amount: number;
  remainingAmount: number;
  source: DebtSource;
  actionDeadlineAt: string;
  remainingClaimCount: number;
  paymentOperationId?: string;
  claimId?: PaymentClaimId;
  sellableProperties?: Array<{
    tileID: number;
    grossPrice: number;
    houses: number;
  }>;
}

export type PublicPaymentShortfall = PublicDebtState;

export type PublicBoardState = Omit<
  BoardState,
  | 'turnRecovery'
  | 'paymentQueue'
> & {
  turnRecovery: { playerId: PlayerId; deadlineAt: string } | null;
  paymentShortfall?: PublicPaymentShortfall | null;
};

export interface PublicTurnInfo {
  pendingLandingDecision?: {
    kind: 'PURCHASE' | 'DEVELOP_HOUSES' | 'UPGRADE_HOTEL';
    operationId: string;
    playerId: PlayerId;
    tileID: number;
    levelAtLanding?: number;
    maxQuantity?: number;
    unitCost?: number;
    price?: number;
  };
}

export interface PublicGameState {
  boardState: PublicBoardState;
  players: Record<PlayerId, PublicPlayer>;
  turnInfo: PublicTurnInfo;
  deckCounts: DeckCounts;
  loaded: boolean;
}

// ---- Room / session DTOs ----

export interface RoomPlayerMeta {
  playerId: PlayerId;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
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
  gameState: PublicGameState;
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

export interface SetAppearanceRequest {
  characterId?: CharacterId;
  color?: PlayerColorId;
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
  privatePlayerState: PrivatePlayerState;
  pendingOffers: PrivateOffer[];
  forcedSaleProposal?: ForcedSaleProposal | null;
}

export interface LeaveRoomResult {
  roomDeleted: boolean;
}

export interface SessionReplacedInfo {
  code: 'SESSION_REPLACED';
  message: string;
}

// ---- Bilateral trade payloads ----

export interface TradeBundle {
  cash: number;
  propertyIds: number[];
  jailFreeCardIds: GameCardId[];
}

// A bilateral offer: the proposer gives `offered` and asks the recipient for
// `requested`. Actor identity still comes from the authenticated socket.
export interface TradeOfferRequest {
  recipientPlayerId: PlayerId;
  offered: TradeBundle;
  requested: TradeBundle;
}

export type OfferInfo = TradeOfferRequest;

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
  proposerPlayerId: PlayerId;
  recipientPlayerId: PlayerId;
  proposerName: string;
  recipientName: string;
  offered: TradeBundle;
  requested: TradeBundle;
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
  proposerPlayerId: PlayerId;
  recipientPlayerId: PlayerId;
  proposerName: string;
  recipientName: string;
  offered: TradeBundle;
  requested: TradeBundle;
  resolvedAt: string;
}

// Compatibility name for UI code while the action payload is narrowed to the
// only client-controlled field the server accepts.
export type Offer = OfferAction;
