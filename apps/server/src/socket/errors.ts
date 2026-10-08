import {
  SOCKET_PROTOCOL_VERSION,
  type Ack,
  type AckCallback,
  type AckErrorCode,
} from '@monopoly/shared';
import {
  RoomNotFoundError,
  RoomVersionConflictError,
  RuntimeUnavailableError,
} from '../persistence/types';
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

export function mapCommandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error;
  if (error instanceof RoomNotFoundError) {
    return new CommandError('ROOM_GONE', 'The room no longer exists.');
  }
  if (error instanceof RoomVersionConflictError) {
    return new CommandError('CONFLICT', 'Room state changed; resync and try again.', true);
  }
  if (error instanceof UnsupportedRoomSnapshotVersionError) {
    console.error('Rejected incompatible room snapshot', error);
    return new CommandError(
      'INTERNAL_ERROR',
      'This room was created by an incompatible server version.',
      false,
    );
  }
  if (error instanceof RuntimeUnavailableError) {
    // The authoritative process is going away; the match ends with it, so retrying cannot help.
    return new CommandError('INTERNAL_ERROR', 'The game service is shutting down.', false);
  }
  console.error('Unexpected command failure', error);
  // Any other exception rolled its draft transaction back, so the command did not happen and may be retried.
  // Only the generic text leaves the server: no message, code or stack of the original error.
  return new CommandError('INTERNAL_ERROR', 'The server could not complete the command.', true);
}
