// Shared game data + state types, used by both the server and the client so the
// two sides always agree on the shape of the game state and its data tables.

export const SOCKET_PROTOCOL_VERSION = 12 as const;

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

/**
 * Lobby game mode. `SOLO` is the free-for-all game; `TEAM_2V2` seats exactly two teams of two. The mode is authoritative room
 * state chosen by the host in the lobby: nothing about teams is ever derived on the client.
 */
export const GAME_MODES = ['SOLO', 'TEAM_2V2'] as const;
export type GameMode = typeof GAME_MODES[number];

/** The two stable team identities of a 2v2 game. They are never renamed; only `TeamSettings` change. */
export const TEAM_IDS = ['TEAM_1', 'TEAM_2'] as const;
export type TeamId = typeof TEAM_IDS[number];

/** A seat inside a team: a 2v2 lobby shows two seats per team, and the seat order inside a team is the turn-order tie-break. */
export const TEAM_SLOTS = [0, 1] as const;
export type TeamSlot = typeof TEAM_SLOTS[number];

/** The longest visible team name, the same limit as a player name. */
export const TEAM_NAME_MAX_LENGTH = 20 as const;

export interface TeamSettings {
  name: string;
  color: PlayerColorId;
}

export type TeamSettingsById = Record<TeamId, TeamSettings>;

export function getAppearanceCombinationKey(
  characterId: CharacterId | null,
  color: PlayerColorId,
): string | null {
  return characterId === null ? null : `${characterId}:${color}`;
}

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';
export type RoomRole = 'PLAYER' | 'SPECTATOR';
export type RoomMembershipStatus = 'ACTIVE' | 'FINISHED' | 'LEFT';
// Who plays a seat. A BOT seat is played by the host process through the same commands as a human; it has no session,
// token or connection. Added in protocol 12.
export const PLAYER_KINDS = ['HUMAN', 'BOT'] as const;

// The five bot strengths, weakest first. MEDIUM is the original Balanced policy and the default.
export const BOT_DIFFICULTIES = ['VERY_EASY', 'EASY', 'MEDIUM', 'HARD', 'VERY_HARD'] as const;
export type BotDifficulty = typeof BOT_DIFFICULTIES[number];
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'MEDIUM';
export type PlayerKind = typeof PLAYER_KINDS[number];
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
  // Base rent of a street with no houses. Owning the whole colour group never changes it.
  rent?: number;
  // Rent with [1, 2, 3, 4 houses, hotel]. Only on buildable street tiles.
  rentTiers?: number[];
  // Cost of one house/hotel on this tile's colour group.
  houseCost?: number;
  // Fixed compulsory payment to the bank when landing on an expense tile.
  expenseAmount?: number;
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

export type CardInteractionStage = 'AWAITING_DRAW' | 'REVEALED';

export interface PendingCardInteraction {
  operationId: string;
  playerId: PlayerId;
  turnNumber: number;
  deck: CardDeck;
  sourceTile: number;
  stage: CardInteractionStage;
  revealedCardId?: GameCardId;
  continuation: PendingTurnContinuation;
  deadlineAt: string;
}

export type MoneyEndpoint =
  | { kind: 'BANK' }
  | { kind: 'PLAYER'; playerId: PlayerId };

export const MONEY_TRANSFER_REASONS = [
  'PROPERTY_PURCHASE',
  'PROPERTY_SALE',
  'RENT',
  'TAX',
  'PASS_GO',
  'CARD',
  'DEVELOPMENT',
  'BAIL',
  'TRADE',
  'FORCED_SALE',
  'FORFEIT',
  // 2v2: the survivor pays the Bank to revive a teammate, and the revived player receives the starting cash from the Bank.
  'REVIVE',
  // 2v2: a teammate pays a debtor's unavoidable shortfall straight to the creditor (never to the debtor).
  'RESCUE',
  'OTHER',
] as const;

export type MoneyTransferReason = typeof MONEY_TRANSFER_REASONS[number];

export type PropertyTransferCause =
  | 'BANK_PURCHASE'
  | 'BANK_SALE'
  | 'VOLUNTARY_TRADE'
  | 'FORCED_SALE'
  | 'BANKRUPTCY'
  | 'PLAYER_LEFT'
  | 'OTHER';

export type PassGoMovementContext =
  | { kind: 'DICE_WALK'; rollSequence: number }
  | { kind: 'CARD'; cardId: GameCardId };

export type SentToJailCause = 'BOARD_TILE' | 'CARD';

interface GameplaySemanticEventBase {
  eventId: string;
  sequence: number;
  operationId?: string;
}

export interface MoneyTransferSemanticEvent extends GameplaySemanticEventBase {
  type: 'MONEY_TRANSFER';
  source: MoneyEndpoint;
  destination: MoneyEndpoint;
  amount: number;
  reason: MoneyTransferReason;
}

export interface PropertyTransferSemanticEvent extends GameplaySemanticEventBase {
  type: 'PROPERTY_TRANSFER';
  tileID: number;
  from: MoneyEndpoint;
  to: MoneyEndpoint;
  cause: PropertyTransferCause;
}

export interface PassGoSemanticEvent extends GameplaySemanticEventBase {
  type: 'PASS_GO';
  playerId: PlayerId;
  reward: number;
  fromTile: number;
  destinationTile: number;
  movement: PassGoMovementContext;
}

export interface SentToJailSemanticEvent extends GameplaySemanticEventBase {
  type: 'SENT_TO_JAIL';
  playerId: PlayerId;
  fromTile: number;
  destinationTile: number;
  cause: SentToJailCause;
}

export interface JailRollFailedSemanticEvent extends GameplaySemanticEventBase {
  type: 'JAIL_ROLL_FAILED';
  playerId: PlayerId;
}

export interface JailReleasedSemanticEvent extends GameplaySemanticEventBase {
  type: 'JAIL_RELEASED';
  playerId: PlayerId;
  cause: 'BAIL' | 'JAIL_FREE_CARD' | 'DOUBLES' | 'TIME_SERVED';
}

export type GameplaySemanticEvent =
  | MoneyTransferSemanticEvent
  | PropertyTransferSemanticEvent
  | PassGoSemanticEvent
  | SentToJailSemanticEvent
  | JailRollFailedSemanticEvent
  | JailReleasedSemanticEvent;

export interface GameplayEventStream {
  sequence: number;
  events: GameplaySemanticEvent[];
}

export interface ActivityEventBase {
  eventId: string;
  sequence: number;
  occurredAt: string;
}

export type ActivityMoneyEndpoint =
  | { kind: 'BANK' }
  | { kind: 'PLAYER'; playerId: PlayerId; name: string };

export type ActivityEvent = ActivityEventBase & (
  | {
    type: 'PLAYER_JOINED';
    playerId: PlayerId;
    playerName: string;
    color: PlayerColorId;
    characterId: CharacterId | null;
  }
  | {
    type: 'GAME_STARTED';
    playerIds: PlayerId[];
    startingPlayerId: PlayerId;
    startingPlayerName: string;
  }
  | {
    type: 'CHAT';
    senderRole: RoomRole;
    senderPlayerId?: PlayerId;
    senderName: string;
    message: string;
  }
  | {
    type: 'DICE_ROLL';
    playerId: PlayerId;
    playerName: string;
    dice1: number;
    dice2: number;
    total: number;
    context: 'TURN' | 'JAIL';
  }
  | {
    type: 'TILE_LANDED';
    playerId: PlayerId;
    playerName: string;
    tileID: number;
  }
  | {
    type: 'PROPERTY_PURCHASE';
    playerId: PlayerId;
    playerName: string;
    tileID: number;
    price: number;
  }
  | {
    type: 'PROPERTY_TRANSFER';
    tileID: number;
    from: ActivityMoneyEndpoint;
    to: ActivityMoneyEndpoint;
    cause: PropertyTransferCause;
  }
  | {
    type: 'MONEY_TRANSFER';
    source: ActivityMoneyEndpoint;
    destination: ActivityMoneyEndpoint;
    amount: number;
    reason: MoneyTransferReason;
  }
  | {
    type: 'PROPERTY_DEVELOPMENT';
    // The player whose cash paid for (or received the refund of) the development.
    playerId: PlayerId;
    playerName: string;
    tileID: number;
    fromHouses: number;
    toHouses: number;
    action: 'BUILD' | 'UPGRADE_HOTEL' | 'SELL';
    cost?: number;
    // Present only when the property owner is not `playerId`: a 2v2 Team Investment, where the lander funds a teammate's
    // property. The owner never changes and never pays.
    ownerPlayerId?: PlayerId;
    ownerName?: string;
  }
  | {
    type: 'CARD_REVEALED';
    playerId: PlayerId;
    playerName: string;
    deck: CardDeck;
    cardId: GameCardId;
  }
  | {
    type: 'JAIL';
    action: 'ENTRY' | 'RELEASE' | 'FAILED_ROLL';
    playerId: PlayerId;
    playerName: string;
    cause?: SentToJailCause | 'BAIL' | 'JAIL_FREE_CARD' | 'DOUBLES' | 'TIME_SERVED';
  }
  | {
    type: 'PLAYER_FINISHED';
    playerId: PlayerId;
    playerName: string;
    reason: FinishedPlayerReason;
    finalCash: number;
  }
  | {
    type: 'GAME_FINISHED';
    winnerPlayerId: PlayerId;
    winnerName: string;
    winnerColor: PlayerColorId;
    winnerCharacterId: CharacterId | null;
    finalCash: number;
    // Present only for a 2v2 game, where the winner is the whole team and `winnerPlayerId` names one representative member.
    winningTeamId?: TeamId;
    winningTeamName?: string;
  }
  | {
    type: 'TEAM_REVIVE';
    // WINDOW_OPENED: a bankrupt player became revivable. REVIVED: the survivor paid and the player is back. EXPIRED: the window
    // ran out and the elimination is permanent.
    action: 'WINDOW_OPENED' | 'REVIVED' | 'EXPIRED';
    playerId: PlayerId;
    playerName: string;
    survivorPlayerId: PlayerId;
    survivorName: string;
    // Survivor turns still available for the revive (3 when the window opens, 0 when it expires).
    turnsRemaining: number;
  }
  | {
    type: 'EMERGENCY_RESCUE';
    action: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
    debtorPlayerId: PlayerId;
    debtorName: string;
    rescuerPlayerId: PlayerId;
    rescuerName: string;
    amount: number;
  }
);

export type ActivityEventInput = ActivityEvent extends infer Event
  ? Event extends ActivityEvent
    ? Omit<Event, 'eventId' | 'sequence' | 'occurredAt'>
    : never
  : never;

export const ACTIVITY_FEED_MAX_EVENTS = 128 as const;

export interface ActivityFeed {
  sequence: number;
  events: ActivityEvent[];
}

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
  privateGameplayEventsByPlayer: Record<PlayerId, GameplayEventStream>;
  completedCardOperations: Array<{ operationId: string; playerId: PlayerId }>;
}

export interface Player {
  name: string;
  currentTile: number;
  // In a 2v2 game this is always the player's team colour (the mascot is drawn in it and it is the ownership accent).
  color: PlayerColorId;
  characterId: CharacterId | null;
  // Assigned when the player joins the room (balanced between the two teams) and kept for the whole room. It only has
  // meaning while `boardState.gameMode` is `TEAM_2V2`; Solo logic never reads it.
  teamId: TeamId;
  // The player's seat inside their team. Chosen by the server when they join and changed only by the lobby seat commands;
  // two active members of one team never share a seat in a lobby. It only has meaning in the lobby (2v2 start orders the
  // match by it) and is meaningless once a game has started.
  teamSlot: TeamSlot;
  accountBalance: number;
  isJail: boolean;
  jailOpponentRoundsElapsed: number;
  // Exact ids preserve the source deck while a jail-free card is held.
  heldJailFreeCardIds: GameCardId[];
}

export interface PublicPlayer extends Omit<Player, 'heldJailFreeCardIds' | 'teamSlot'> {
  getOutOfJailCardCount: number;
}

export interface PrivatePlayerState {
  playerId: PlayerId;
  heldJailFreeCardIds: GameCardId[];
  forcedSaleProposal?: ForcedSaleProposal | null;
  gameplayEvents: GameplayEventStream;
}

export interface FinishedPlayer {
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  teamId: TeamId;
  reason?: FinishedPlayerReason;
  accountBalance?: number;
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
  pendingCardInteraction?: PendingCardInteraction;
}

export type DebtCreditor = 'PLAYER' | 'BANK';

export type DebtSource =
  | { kind: 'RENT'; tileID: number }
  | { kind: 'TAX'; tileID: number }
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

/**
 * A 2v2 Emergency Rescue offer to the debtor's active teammate. It exists only while the debtor owns nothing left to sell and
 * still owes money, and it covers the debtor's whole remaining shortfall or nothing. `amount` is exactly what leaves the
 * rescuer's own balance (claims owed to the rescuer cost nothing); it is paid straight to each creditor, never to the debtor.
 * While an offer is open `PaymentQueue.actionDeadlineAt` equals `expiresAt`, so the one durable deadline drives recovery.
 */
export interface EmergencyRescueOffer {
  rescueId: string;
  debtorPlayerId: PlayerId;
  rescuerPlayerId: PlayerId;
  amount: number;
  expiresAt: string;
}

export interface PaymentQueue {
  operationId: string;
  orderedClaims: DebtClaim[];
  activeClaimIndex: number;
  continuation: PendingTurnContinuation;
  actionDeadlineAt: string;
  rescue: EmergencyRescueOffer | null;
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

/**
 * A bankrupt 2v2 player who can still be revived. The window is counted in turns of the surviving teammate (not global
 * turns): it opens with `REVIVE_WINDOW_SURVIVOR_TURNS` and loses one each time a survivor turn that began after
 * `openedAtTurnNumber` ends, however it ends (completed, jail wait, or skipped for a disconnect). At zero it is removed and
 * the elimination is permanent.
 */
export interface ReviveWindow {
  playerId: PlayerId;
  teamId: TeamId;
  turnsRemaining: number;
  openedAtTurnNumber: number;
}

/**
 * An open lobby request to exchange seats: `requesterPlayerId` asked `targetPlayerId` to swap places and the target has
 * not answered. Lobby state only (a 2v2 lobby); a requester has at most one open request.
 */
export interface SeatSwapRequest {
  requesterPlayerId: PlayerId;
  targetPlayerId: PlayerId;
}

/** Match-level 2v2 state. All three fields are empty in a Solo game and in a lobby. */
export interface TeamPlayState {
  // The stable alternating turn slots chosen at the start (A1, B1, A2, B2). Eliminated players keep their slot here so a
  // revived player returns to it; `BoardState.players` is this order restricted to the players still in the game.
  slotOrder: PlayerId[];
  // Players who have already been revived once. A later elimination of such a player is permanent.
  revivedPlayerIds: PlayerId[];
  reviveWindows: ReviveWindow[];
}

export interface BoardState {
  gameStarted: boolean;
  // Set by the authoritative start command; optional for older persisted snapshots.
  gameStartedAt?: string | null;
  // A fresh UUID per started match (set by `start game`, cleared by `play again`), so work scheduled for one match can never
  // apply to the rematch. Absent in snapshots older than schema 11.
  matchId?: string | null;
  // How well every bot of the room plays (protocol 12). Host-chosen in the lobby; absent in older snapshots means MEDIUM.
  botDifficulty?: BotDifficulty;
  // Lobby configuration that survives "play again" (together with each player's `teamId`).
  gameMode: GameMode;
  teams: TeamSettingsById;
  teamPlay: TeamPlayState;
  // Set together with `winner` when a 2v2 team wins; `winner` then names one representative member of that team.
  winningTeamId: TeamId | null;
  // Open 2v2 seat-swap requests of the lobby (public: the target sees the question, everyone sees who is waiting). Always
  // empty outside a 2v2 lobby.
  seatSwapRequests: SeatSwapRequest[];
  players: PlayerId[];
  finishedPlayers: Record<PlayerId, FinishedPlayer>;
  currentPlayer: CurrentPlayer;
  turnNumber: number;
  turnRecovery: TurnRecovery | null;
  logs: string[];
  diceValue: DiceValue;
  // Monotonic public identity for accepted gameplay rolls. Starting-player
  // tie-break rolls do not advance this sequence.
  rollSequence: number;
  ownedProps: Record<number, OwnedProp>;
  // Set once a single player remains; drives the win screen.
  winner: Winner | null;
  paymentQueue: PaymentQueue | null;
  gameplayEvents: GameplayEventStream;
  activityFeed: ActivityFeed;
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
  // The open 2v2 Emergency Rescue offer for this debtor, or null. Team membership and cash are public, so the offer is too.
  rescue: EmergencyRescueOffer | null;
  sellableProperties?: Array<{
    tileID: number;
    grossPrice: number;
    houses: number;
  }>;
}

export type PublicPaymentShortfall = PublicDebtState;

export interface PublicTeam {
  teamId: TeamId;
  name: string;
  color: PlayerColorId;
  // Every room member of the team in join order, including players who are eliminated or have left.
  memberPlayerIds: PlayerId[];
}

export interface PublicReviveWindow {
  playerId: PlayerId;
  teamId: TeamId;
  // The active teammate who may revive `playerId` during their own turn.
  survivorPlayerId: PlayerId;
  // Survivor turns still available, including the current one when it is the survivor's turn: 5 down to 1 ("last chance").
  turnsRemaining: number;
  // The turn counter when the bankruptcy happened. Only survivor turns that begin after it count and may revive: a client
  // compares it with `boardState.turnNumber` to know whether the current turn is one of them.
  openedAtTurnNumber: number;
}

export interface PublicTeamPlayState {
  revivedPlayerIds: PlayerId[];
  reviveWindows: PublicReviveWindow[];
}

export type PublicBoardState = Omit<
  BoardState,
  | 'turnRecovery'
  | 'paymentQueue'
  | 'teams'
  | 'teamPlay'
> & {
  turnRecovery: { playerId: PlayerId; deadlineAt: string } | null;
  paymentShortfall?: PublicPaymentShortfall | null;
  // Always both teams in team order; only meaningful while `gameMode` is `TEAM_2V2`.
  teams: PublicTeam[];
  teamPlay: PublicTeamPlayState;
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
  pendingCardInteraction?: PendingCardInteraction;
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
  teamId: TeamId;
  // The seat inside the team (see `Player.teamSlot`). Only meaningful in the lobby; 0 for a player who is no longer in the game.
  teamSlot: TeamSlot;
  joinOrder: number;
  membershipStatus: RoomMembershipStatus;
  ready: boolean;
  // Always true for an active bot, which the host process plays and which never disconnects.
  connected: boolean;
  kind: PlayerKind;
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
  /** Desktop Host only; never put this process capability in an invitation. */
  hostCapability?: string;
}

export interface ResumeSessionRequest {
  token: string;
}

export interface SetReadyRequest {
  ready: boolean;
}

export interface SetAppearanceRequest {
  characterId?: CharacterId;
  // Rejected in a 2v2 lobby: the colour belongs to the team there.
  color?: PlayerColorId;
}

export interface SetGameModeRequest {
  mode: GameMode;
}

// The team is always the actor's own team, resolved on the server; a member can never rename another team.
export interface SetTeamNameRequest {
  name: string;
}

// The team is always the actor's own team, resolved on the server; a member can never name another team.
export interface SetTeamColorRequest {
  color: PlayerColorId;
}

// Host only, lobby only. Removes another player from the room; the removed player's session is revoked.
export interface KickPlayerRequest {
  playerId: PlayerId;
}

// Host only, lobby only: adds one bot to a free seat. `requestId` makes a retried click idempotent.
export interface AddBotRequest {
  requestId: string;
  // 2v2 lobby: the empty seat the host clicked. Ignored in Solo; an occupied seat falls back to the seat a joiner would get.
  seat?: { teamId: TeamId; teamSlot: TeamSlot };
}

export interface AddBotResult {
  playerId: PlayerId;
}

// Host only, lobby only (protocol 12): one difficulty for every bot of the room.
export interface SetBotDifficultyRequest {
  difficulty: BotDifficulty;
}

// Host only, lobby only: removes a bot seat.
export interface RemoveBotRequest {
  playerId: PlayerId;
}

// 2v2 lobby: the actor moves to a seat nobody holds. The server refuses an occupied seat.
export interface MoveToSeatRequest {
  teamId: TeamId;
  teamSlot: TeamSlot;
}

// 2v2 lobby: the actor asks the player who holds a seat to exchange places. The target must accept before anything moves.
export interface RequestSeatSwapRequest {
  targetPlayerId: PlayerId;
}

// 2v2 lobby: the target of an open seat-swap request answers it. Only the target can; the seats are read from the server.
export interface RespondSeatSwapRequest {
  requesterPlayerId: PlayerId;
  accept: boolean;
}

// The only client-controlled field of a rescue answer; the amount, debtor and creditors are read from the server's queue.
export interface RescueDecisionRequest {
  rescueId: string;
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
  /**
   * The public continuity key of the Host's server process (base64url SPKI, P-256). After a link change the client hands its
   * token only to an address that signs a fresh challenge with this key (see `hostContinuity.ts`). Public, never a credential.
   */
  hostContinuityKey?: string;
}

export interface LeaveRoomResult {
  roomDeleted: boolean;
}

export interface SessionReplacedInfo {
  code: 'SESSION_REPLACED';
  message: string;
}

// Sent to the connection of a player the host removed from the lobby; their session is already revoked.
export interface RemovedFromRoomInfo {
  code: 'REMOVED_BY_HOST';
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
