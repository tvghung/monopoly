import {
  SOCKET_PROTOCOL_VERSION,
  type Ack,
  type AckCallback,
  type AckErrorCode,
} from '@monopoly/shared';
import { RoomNotFoundError, RoomVersionConflictError } from '../persistence/types';
import { UnsupportedRoomSnapshotVersionError } from '../rooms';

export class CommandError extends Error {
  constructor(
    readonly code: AckErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export function successAck(revision?: number): Ack;
export function successAck<T>(data: T, revision?: number): Ack<T>;
export function successAck<T>(dataOrRevision?: T | number, revision?: number): Ack<T> | Ack {
  if (typeof dataOrRevision === 'number' && revision === undefined) {
    return { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision: dataOrRevision };
  }
  if (dataOrRevision === undefined) {
    return { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION };
  }
  return {
    ok: true,
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    data: dataOrRevision as T,
    ...(revision === undefined ? {} : { revision }),
  } as Ack<T>;
}

export function failureAck<T = void>(error: unknown): Ack<T> {
  const mapped = mapCommandError(error);
  return {
    ok: false,
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    error: {
      code: mapped.code,
      message: mapped.message,
      retryable: mapped.retryable,
    },
  };
}

export function acknowledgeFailure<T>(
  acknowledge: AckCallback<T> | undefined,
  error: unknown,
): void {
  if (typeof acknowledge === 'function') acknowledge(failureAck<T>(error));
}

function isDatabaseError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string',
  );
}

export function mapCommandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error;
  if (error instanceof RoomNotFoundError) {
    return new CommandError('ROOM_GONE', 'The room no longer exists.');
  }
  if (error instanceof RoomVersionConflictError) {
    return new CommandError('CONFLICT', 'Room state changed; resync and try again.', true);
  }
  if (error instanceof UnsupportedRoomSnapshotVersionError) {
    console.error('Rejected incompatible persisted room snapshot', error);
    return new CommandError(
      'INTERNAL_ERROR',
      'This room was stored by an incompatible server version.',
      false,
    );
  }
  if (isDatabaseError(error)) {
    return new CommandError(
      'DATABASE_UNAVAILABLE',
      'Durable storage is temporarily unavailable.',
      true,
    );
  }
  return new CommandError('INTERNAL_ERROR', 'The server could not complete the command.', true);
}
