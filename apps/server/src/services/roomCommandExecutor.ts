import {
  RoomNotFoundError,
  type PersistenceStore,
  type PersistenceUnitOfWork,
  type RoomRecord,
  type RoomStatus,
} from '../persistence/types.js';

export interface MutableRoom<TSnapshot extends object> {
  status: RoomStatus;
  hostPlayerId: string | null;
  snapshotSchemaVersion: number;
  gameSnapshot: TSnapshot;
  nextActionAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date | null;
}

export interface RoomCommandContext<TSnapshot extends object> {
  readonly original: RoomRecord<TSnapshot>;
  readonly room: MutableRoom<TSnapshot>;
  readonly transaction: PersistenceUnitOfWork<TSnapshot>;
  /** Marks an explicit lifecycle deletion; the executor will not save afterward. */
  deleteRoom(): void;
  touchActivity(at?: Date): void;
}

export interface RoomCommandCommit<TSnapshot extends object, TResult> {
  room: RoomRecord<TSnapshot> | null;
  result: TResult;
}

export interface RoomCommandExecutionOptions<TSnapshot extends object, TResult> {
  /** Validation-only commands can hold the room FIFO/DB lock without revising it. */
  persistRoom?: boolean;
  /** Runs after DB commit but before the per-room FIFO admits its next command. */
  afterCommit?: (
    committed: RoomCommandCommit<TSnapshot, TResult>,
  ) => void | Promise<void>;
}

export class RoomCommandExecutor<TSnapshot extends object> {
  private readonly roomTails = new Map<string, Promise<void>>();

  constructor(private readonly persistence: PersistenceStore<TSnapshot>) {}

  execute<TResult>(
    roomId: string,
    command: (
      context: RoomCommandContext<TSnapshot>,
    ) => TResult | Promise<TResult>,
    options: RoomCommandExecutionOptions<TSnapshot, TResult> = {},
  ): Promise<RoomCommandCommit<TSnapshot, TResult>> {
    return this.enqueue(roomId, async () => {
      const committed = await this.persistence.transaction(async (transaction) => {
        const original = await transaction.rooms.findById(roomId, {
          forUpdate: true,
        });
        if (!original) throw new RoomNotFoundError(roomId);

        const room: MutableRoom<TSnapshot> = {
          status: original.status,
          hostPlayerId: original.hostPlayerId,
          snapshotSchemaVersion: original.snapshotSchemaVersion,
          gameSnapshot: structuredClone(original.gameSnapshot),
          nextActionAt: original.nextActionAt,
          lastActivityAt: original.lastActivityAt,
          expiresAt: original.expiresAt,
        };
        let deleteRequested = false;

        const result = await command({
          original,
          room,
          transaction,
          deleteRoom: () => {
            deleteRequested = true;
          },
          touchActivity: (at = new Date()) => {
            room.lastActivityAt = at;
          },
        });

        if (deleteRequested) {
          await transaction.rooms.delete(roomId);
          return { room: null, result };
        }

        if (options.persistRoom === false) {
          return { room: original, result };
        }

        const committedRoom = await transaction.rooms.save({
          id: original.id,
          expectedVersion: original.aggregateVersion,
          status: room.status,
          hostPlayerId: room.hostPlayerId,
          snapshotSchemaVersion: room.snapshotSchemaVersion,
          gameSnapshot: room.gameSnapshot,
          nextActionAt: room.nextActionAt,
          lastActivityAt: room.lastActivityAt,
          expiresAt: room.expiresAt,
        });
        return { room: committedRoom, result };
      });
      await options.afterCommit?.(committed);
      return committed;
    });
  }

  private async enqueue<TResult>(
    roomId: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const previous = this.roomTails.get(roomId) ?? Promise.resolve();
    const execution = previous.catch(() => undefined).then(operation);
    const tail = execution.then(
      () => undefined,
      () => undefined,
    );
    this.roomTails.set(roomId, tail);

    try {
      return await execution;
    } finally {
      if (this.roomTails.get(roomId) === tail) this.roomTails.delete(roomId);
    }
  }
}
