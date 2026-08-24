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
  SessionId,
  SessionReplacedInfo,
  SetAppearanceRequest,
  SetReadyRequest,
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
  'leave room': (acknowledge: AckCallback<LeaveRoomResult>) => void;
  'start game': (acknowledge: AckCallback) => void;
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
    request: { paymentOperationId: string; claimId: string; tileID: number; buyerPlayerId: PlayerId },
    acknowledge: AckCallback<{ proposalId: string; expiresAt: string }>,
  ) => void;
  'accept forced sale': (request: { proposalId: string }, acknowledge: AckCallback) => void;
  'reject forced sale': (request: { proposalId: string }, acknowledge: AckCallback) => void;
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
