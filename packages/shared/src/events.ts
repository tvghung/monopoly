// End-to-end typed Socket.IO contracts. Every state-changing request has a
// request-scoped acknowledgement so clients only act on committed state.

import type {
  AddBotRequest,
  AddBotResult,
  JoinRoomRequest,
  JoinRoomResult,
  KickPlayerRequest,
  LeaveRoomResult,
  MakeOfferResult,
  MoveToSeatRequest,
  OfferAction,
  OfferInfo,
  OfferResult,
  PlayerId,
  PrivatePlayerState,
  PrivateOffer,
  PublicRoomState,
  RemoveBotRequest,
  SetBotDifficultyRequest,
  RemovedFromRoomInfo,
  RequestSeatSwapRequest,
  RescueDecisionRequest,
  RespondSeatSwapRequest,
  ResumeSessionRequest,
  ResumeSessionResult,
  RoomId,
  RoomRole,
  SessionId,
  SessionReplacedInfo,
  SetAppearanceRequest,
  SetGameModeRequest,
  SetReadyRequest,
  SetTeamColorRequest,
  SetTeamNameRequest,
  SocketProtocolVersion,
  ForcedSaleProposal,
} from './types';

export type AckErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ROOM_FULL'
  | 'ROOM_GONE'
  | 'GAME_ALREADY_STARTED'
  | 'SESSION_INVALID'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REPLACED'
  | 'UPGRADE_REQUIRED'
  /** @deprecated No server emits this since the RAM-only runtime; kept so a v11 client still understands an older Host. */
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface AckError {
  code: AckErrorCode;
  message: string;
  retryable: boolean;
}

export type AckSuccess<T = void> = {
  ok: true;
  protocolVersion: SocketProtocolVersion;
  revision?: number;
} & ([T] extends [void] ? { data?: never } : { data: T });

export interface AckFailure {
  ok: false;
  protocolVersion: SocketProtocolVersion;
  error: AckError;
}

export type Ack<T = void> = AckSuccess<T> | AckFailure;
export type AckCallback<T = void> = (response: Ack<T>) => void;

export interface ServerToClientEvents {
  update: (state: PublicRoomState) => void;
  'offer on prop': (offer: PrivateOffer) => void;
  'offer declined': (result: OfferResult) => void;
  'offer accepted': (result: OfferResult) => void;
  'offer expired': (result: OfferResult) => void;
  'offer cancelled': (result: OfferResult) => void;
  'private player state': (state: PrivatePlayerState) => void;
  'forced sale proposal': (proposal: ForcedSaleProposal | null) => void;
  'session replaced': (info: SessionReplacedInfo) => void;
  // The host removed this player from the lobby (their session is revoked and their connection leaves the room).
  'removed from room': (info: RemovedFromRoomInfo) => void;
}

export interface ClientToServerEvents {
  'join room': (
    request: JoinRoomRequest,
    acknowledge: AckCallback<JoinRoomResult>,
  ) => void;
  'resume session': (
    request: ResumeSessionRequest,
    acknowledge: AckCallback<ResumeSessionResult>,
  ) => void;
  'set ready': (request: SetReadyRequest, acknowledge: AckCallback) => void;
  'set appearance': (request: SetAppearanceRequest, acknowledge: AckCallback) => void;
  // Lobby only. The host picks Solo or 2v2 (every Ready is reset) and can remove a player; anyone on a team may rename and
  // recolour their own team (never the other one) and, in 2v2, move to an empty seat or ask another player to swap seats (the
  // target must accept). The host cannot move other players. The server owns every one of these rules.
  'set game mode': (request: SetGameModeRequest, acknowledge: AckCallback) => void;
  'kick player': (request: KickPlayerRequest, acknowledge: AckCallback) => void;
  // Host only, lobby only (protocol 12): one bot per accepted request, into a free seat; and removing a bot seat.
  'add bot': (request: AddBotRequest, acknowledge: AckCallback<AddBotResult>) => void;
  'remove bot': (request: RemoveBotRequest, acknowledge: AckCallback) => void;
  // Host only, lobby only (protocol 12): sets the difficulty of every bot of the room.
  'set bot difficulty': (request: SetBotDifficultyRequest, acknowledge: AckCallback) => void;
  'set team name': (request: SetTeamNameRequest, acknowledge: AckCallback) => void;
  'set team color': (request: SetTeamColorRequest, acknowledge: AckCallback) => void;
  'move to seat': (request: MoveToSeatRequest, acknowledge: AckCallback) => void;
  'request seat swap': (request: RequestSeatSwapRequest, acknowledge: AckCallback) => void;
  'cancel seat swap': (acknowledge: AckCallback) => void;
  'respond seat swap': (request: RespondSeatSwapRequest, acknowledge: AckCallback) => void;
  'leave room': (acknowledge: AckCallback<LeaveRoomResult>) => void;
  'start game': (acknowledge: AckCallback) => void;
  'play again': (acknowledge: AckCallback) => void;
  'send chat': (message: string, acknowledge: AckCallback) => void;
  // The server rolls the dice, moves the player, and resolves the landed tile.
  'roll dice': (acknowledge: AckCallback) => void;
  'buy property': (request: { operationId: string }, acknowledge: AckCallback) => void;
  'do not buy': (request: { operationId: string }, acknowledge: AckCallback) => void;
  'resolve development': (
    request:
      | { operationId: string; action: 'SKIP' }
      | { operationId: string; action: 'BUILD_HOUSES'; quantity: number }
      | { operationId: string; action: 'UPGRADE_HOTEL' },
    acknowledge: AckCallback,
  ) => void;
  'draw card': (request: { operationId: string }, acknowledge: AckCallback) => void;
  'dismiss card': (request: { operationId: string }, acknowledge: AckCallback) => void;
  'make offer': (
    offerInfo: OfferInfo,
    acknowledge: AckCallback<MakeOfferResult>,
  ) => void;
  'accept offer': (offer: OfferAction, acknowledge: AckCallback) => void;
  'decline offer': (offer: OfferAction, acknowledge: AckCallback) => void;
  'sell house': (tileID: number, acknowledge: AckCallback) => void;
  'pay bail': (acknowledge: AckCallback) => void;
  'use jail card': (acknowledge: AckCallback) => void;
  'wait in jail': (acknowledge: AckCallback) => void;
  'sell property to bank': (
    request: { paymentOperationId: string; claimId: string; tileID: number },
    acknowledge: AckCallback,
  ) => void;
  'propose forced sale': (
    request: { paymentOperationId: string; claimId: string; tileID: number; buyerPlayerId: PlayerId; price?: number },
    acknowledge: AckCallback<{ proposalId: string; expiresAt: string }>,
  ) => void;
  'accept forced sale': (request: { proposalId: string }, acknowledge: AckCallback) => void;
  'reject forced sale': (request: { proposalId: string }, acknowledge: AckCallback) => void;
  // 2v2 only. The surviving teammate revives the one revivable teammate during their own turn; nothing but the actor is sent.
  'revive teammate': (acknowledge: AckCallback) => void;
  // 2v2 only. The active teammate answers an open Emergency Rescue offer; the amount is read from the server's payment queue.
  'accept rescue': (request: RescueDecisionRequest, acknowledge: AckCallback) => void;
  'decline rescue': (request: RescueDecisionRequest, acknowledge: AckCallback) => void;
}

export type InterServerEvents = Record<string, never>;

// Runtime transport context only. Raw reconnect tokens must never be attached
// to socket.data because it is routinely logged and inspected.
export interface SocketData {
  roomId?: RoomId;
  playerId?: PlayerId;
  role?: RoomRole;
  sessionId?: SessionId;
  connectionGeneration?: number;
  pendingAdmission?: boolean;
}
