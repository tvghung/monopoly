import type { GameState } from '@monopoly/shared';
import type { RoomCommandContext, RoomCommandCommit } from '../services/roomCommandExecutor';
import type { AppRuntime } from '../services/runtime';
import type { AuthenticatedActor } from './authority';
import { CommandError } from './errors';
import {
  assertSupportedRoomSnapshot,
  calculateNextActionAt,
  hydrateGameState,
  storeGameState,
  syncMembershipWithGameState,
  type RoomSnapshot,
} from '../rooms';

export interface DomainCommandContext extends RoomCommandContext<RoomSnapshot> {
  state: GameState;
  now: Date;
}

const addMilliseconds = (date: Date, milliseconds: number): Date => (
  new Date(date.getTime() + milliseconds)
);

const minDate = (...dates: Array<Date | null>): Date | null => {
  const present = dates.filter((date): date is Date => date !== null);
  return present.length === 0
    ? null
    : new Date(Math.min(...present.map((date) => date.getTime())));
};

export function roomExpiry(runtime: AppRuntime, status: DomainCommandContext['room']['status'], now: Date): Date {
  const retention = status === 'LOBBY'
    ? runtime.timing.lobbyRetentionMs
    : status === 'IN_PROGRESS'
      ? runtime.timing.inProgressRetentionMs
      : runtime.timing.finishedRetentionMs;
  return addMilliseconds(now, retention);
}

export async function commitRoomCommand<TResult>(
  runtime: AppRuntime,
  roomId: string,
  command: (context: DomainCommandContext) => TResult | Promise<TResult>,
  now = new Date(),
  authority?: AuthenticatedActor,
): Promise<RoomCommandCommit<RoomSnapshot, TResult>> {
  return runtime.commands.execute(roomId, async (context) => {
    if (
      authority
      && !runtime.connections.isCurrent(
        authority.playerId,
        authority.socketId,
        authority.connectionGeneration,
      )
    ) {
      throw new CommandError('SESSION_REPLACED', 'This connection is no longer active.');
    }
    assertSupportedRoomSnapshot(context.room);
    const state = hydrateGameState(context.room.gameSnapshot, context.room.status);
    const result = await command({ ...context, state, now });

    if (state.boardState.winner) {
      context.room.status = 'FINISHED';
      state.boardState.auction = null;
      state.boardState.turnRecovery = null;
      state.turnInfo = {};
    }
    if (
      context.room.status === 'IN_PROGRESS'
      && !runtime.flags.shuttingDown
      && !state.boardState.winner
      && !state.boardState.auction
      && state.boardState.currentPlayer.id
      && !state.boardState.turnRecovery
      && !runtime.connections.isConnected(state.boardState.currentPlayer.id)
    ) {
      state.boardState.turnRecovery = {
        playerId: state.boardState.currentPlayer.id,
        turnNumber: state.boardState.turnNumber,
        deadlineAt: addMilliseconds(now, runtime.timing.reconnectGraceMs).toISOString(),
      };
    }
    storeGameState(context.room.gameSnapshot, state, context.room.status);
    syncMembershipWithGameState(context.room.gameSnapshot);
    assertSupportedRoomSnapshot(context.room);
    context.touchActivity(now);
    context.room.expiresAt = roomExpiry(runtime, context.room.status, now);
    context.room.nextActionAt = minDate(
      calculateNextActionAt(context.room.gameSnapshot),
      context.room.expiresAt,
    );
    return result;
  });
}
