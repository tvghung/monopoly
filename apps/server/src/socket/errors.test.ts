import { describe, expect, it, vi } from 'vitest';
import {
  RoomNotFoundError,
  RoomVersionConflictError,
  RuntimeUnavailableError,
} from '../persistence/types.js';
import { UnsupportedRoomSnapshotVersionError } from '../rooms.js';
import { CommandError, failureAck, mapCommandError } from './errors.js';

describe('RAM runtime ACK errors', () => {
  it('keeps a room version conflict retryable so the client resyncs and tries again', () => {
    expect(mapCommandError(new RoomVersionConflictError('room', 2)))
      .toMatchObject({ code: 'CONFLICT', retryable: true });
  });

  it('keeps missing-room semantics', () => {
    expect(mapCommandError(new RoomNotFoundError('room')))
      .toMatchObject({ code: 'ROOM_GONE', retryable: false });
  });

  it('passes a typed command error through unchanged', () => {
    const error = new CommandError('ROOM_FULL', 'The lobby already has 4 active players.');
    expect(mapCommandError(error)).toBe(error);
  });

  it('reports a rolled-back command as a retryable internal error without leaking the cause', () => {
    // A thrown error with a `code` (what a database driver would carry) is no longer
    // mistaken for a storage outage: the draft was dropped, nothing was committed.
    const rolledBack = Object.assign(new Error('secret path C:\\Users\\host\\state'), { code: 'ECONNRESET' });
    const mapped = mapCommandError(rolledBack);
    expect(mapped).toMatchObject({
      code: 'INTERNAL_ERROR',
      retryable: true,
      message: 'The server could not complete the command.',
    });
    expect(JSON.stringify(failureAck(rolledBack))).not.toMatch(/secret|ECONNRESET|C:\\\\/u);
  });

  it('maps an unexpected non-Error throw to the same generic internal error', () => {
    expect(mapCommandError('plain string'))
      .toMatchObject({ code: 'INTERNAL_ERROR', retryable: true });
    expect(mapCommandError(undefined))
      .toMatchObject({ code: 'INTERNAL_ERROR', retryable: true });
  });

  it('separates a closed runtime from a transaction conflict', () => {
    const unavailable = mapCommandError(new RuntimeUnavailableError());
    expect(unavailable).toMatchObject({
      code: 'INTERNAL_ERROR',
      retryable: false,
      message: 'The game service is shutting down.',
    });
    expect(unavailable.code).not.toBe(mapCommandError(new RoomVersionConflictError('room', 1)).code);
  });

  it('never classifies an error as a database outage', () => {
    for (const error of [
      new RoomVersionConflictError('room', 2),
      new RoomNotFoundError('room'),
      new RuntimeUnavailableError(),
      Object.assign(new Error('driver'), { code: '57P01' }),
      Object.assign(new Error('driver'), { code: 'ECONNREFUSED' }),
    ]) {
      expect(mapCommandError(error).code).not.toBe('DATABASE_UNAVAILABLE');
    }
  });

  it('rejects an incompatible snapshot as a non-retryable internal error and logs only server-side', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const mapped = mapCommandError(new UnsupportedRoomSnapshotVersionError(1));
      expect(mapped).toMatchObject({ code: 'INTERNAL_ERROR', retryable: false });
      expect(mapped.message).toBe('This room was created by an incompatible server version.');
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('builds the wire acknowledgement from the mapped error only', () => {
    expect(failureAck(new RuntimeUnavailableError())).toEqual({
      ok: false,
      protocolVersion: 11,
      error: { code: 'INTERNAL_ERROR', message: 'The game service is shutting down.', retryable: false },
    });
  });
});
