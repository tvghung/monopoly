import type { PublicRoomState } from '@monopoly/shared';
import { derivePresentationEvents } from './events/derivePresentationEvents';
import { createBasicExecutors } from './executors/basicExecutors';
import { createDiceExecutor } from './executors/diceExecutor';
import { createMovementExecutor } from './executors/movementExecutor';
import { AnimationQueue } from './queue/AnimationQueue';
import { PresentationStore } from './store/presentationStore';
import type { PresentationState } from './store/types';

export type SnapshotSource = 'LIVE_UPDATE' | 'SESSION_SYNC' | 'SPECTATOR_SYNC';

export class PresentationController {
  public readonly store = new PresentationStore();
  public readonly queue: AnimationQueue;
  private acceptedRoom: PublicRoomState | null = null;
  private consumerCount = 0;
  private disposalGeneration = 0;
  private disposed = false;

  public constructor(reducedMotion = false, speedMultiplier = 1) {
    const executors = {
      ...createBasicExecutors(this.store),
      ROLL_DICE: createDiceExecutor(this.store),
      MOVE_CHARACTER: createMovementExecutor(this.store),
    };
    this.queue = new AnimationQueue({
      executors,
      reducedMotion,
      speedMultiplier,
      onReset: snapshot => {
        if (snapshot && typeof snapshot === 'object' && 'gameState' in snapshot) {
          this.store.resetFromSnapshot(snapshot as PublicRoomState);
        }
      },
      onError: (error, event) => {
        console.error('Presentation animation failed.', event.type, error);
      },
    });
    this.queue.subscribe(status => this.store.setStatus(status));
  }

  public acceptRoomSnapshot(room: PublicRoomState, source: SnapshotSource): boolean {
    if (this.acceptedRoom
      && this.acceptedRoom.roomId === room.roomId
      && room.version <= this.acceptedRoom.version) return false;

    const previous = this.acceptedRoom;
    this.acceptedRoom = room;
    if (!previous || source !== 'LIVE_UPDATE') {
      this.queue.reset(room);
      return true;
    }

    this.store.syncPlayers(room);
    void Promise.all(this.queue.enqueueMany(derivePresentationEvents(previous, room)));
    return true;
  }

  public setPreferences(reducedMotion: boolean, speedMultiplier: number): void {
    this.queue.setReducedMotion(reducedMotion);
    this.queue.setSpeedMultiplier(speedMultiplier);
    if (reducedMotion) this.skipAllAndSnap();
  }

  public retain(): void {
    if (this.disposed) return;
    this.consumerCount += 1;
    this.disposalGeneration += 1;
  }

  public release(): void {
    if (this.consumerCount === 0) return;
    this.consumerCount -= 1;
    if (this.consumerCount !== 0) return;

    const generation = ++this.disposalGeneration;
    queueMicrotask(() => {
      if (this.consumerCount === 0
        && this.disposalGeneration === generation) {
        this.dispose();
      }
    });
  }

  public skipAllAndSnap(): void {
    if (this.acceptedRoom) this.queue.reset(this.acceptedRoom);
    else this.queue.skipAll();
  }

  public getState(): PresentationState {
    return this.store.getSnapshot();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.consumerCount = 0;
    this.disposalGeneration += 1;
    this.queue.dispose();
  }
}
