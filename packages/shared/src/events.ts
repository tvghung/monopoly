// End-to-end typed Socket.IO contracts. Every state-changing request has a
// request-scoped acknowledgement so clients only act on committed state.

import type {
  JoinRoomRequest,
  JoinRoomResult,
  LeaveRoomResult,
  MakeOfferResult,
  OfferAction,
  OfferInfo,
  OfferResult,
  PlayerId,
  PrivatePlayerState,
  PrivateOffer,
  PublicRoomState,
  ResumeSessionRequest,
  ResumeSessionResult,
  RoomId,
  RoomRole,
  SaleInfo,
  SessionId,
  SessionReplacedInfo,
  SetReadyRequest,
  SocketProtocolVersion,
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

export interface TileRequest {
  tileID: number;
}

export interface ServerToClientEvents {
  update: (state: PublicRoomState) => void;
  'offer on prop': (offer: PrivateOffer) => void;
  'offer declined': (result: OfferResult) => void;
  'offer accepted': (result: OfferResult) => void;
  'offer expired': (result: OfferResult) => void;
  'offer cancelled': (result: OfferResult) => void;
  'private player state': (state: PrivatePlayerState) => void;
  'session replaced': (info: SessionReplacedInfo) => void;
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
  'leave room': (acknowledge: AckCallback<LeaveRoomResult>) => void;
  'start game': (acknowledge: AckCallback) => void;
  'send chat': (message: string, acknowledge: AckCallback) => void;
  // The server rolls the dice, moves the player, and resolves the landed tile.
  'roll dice': (acknowledge: AckCallback) => void;
  'buy property': (acknowledge: AckCallback) => void;
  'put on open market': (saleInfo: SaleInfo, acknowledge: AckCallback) => void;
  'make offer': (
    offerInfo: OfferInfo,
    acknowledge: AckCallback<MakeOfferResult>,
  ) => void;
  'accept offer': (offer: OfferAction, acknowledge: AckCallback) => void;
  'decline offer': (offer: OfferAction, acknowledge: AckCallback) => void;
  'make sale': (request: TileRequest, acknowledge: AckCallback) => void;
  'remove sale': (request: TileRequest, acknowledge: AckCallback) => void;
  'build house': (tileID: number, acknowledge: AckCallback) => void;
  'sell house': (tileID: number, acknowledge: AckCallback) => void;
  'mortgage property': (tileID: number, acknowledge: AckCallback) => void;
  'unmortgage property': (tileID: number, acknowledge: AckCallback) => void;
  'pay bail': (acknowledge: AckCallback) => void;
  'use jail card': (acknowledge: AckCallback) => void;
  'settle debt': (acknowledge: AckCallback) => void;
  'declare bankruptcy': (acknowledge: AckCallback) => void;
  'decline property': (acknowledge: AckCallback) => void;
  'place bid': (amount: number, acknowledge: AckCallback) => void;
  'pass bid': (acknowledge: AckCallback) => void;
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
