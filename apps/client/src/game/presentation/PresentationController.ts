import type { PrivatePlayerState, PublicRoomState } from '@monopoly/shared';
import type { MoneyTransferPresentationEvent } from './events/types';
import { derivePresentationEvents, semanticEventsSince } from './events/derivePresentationEvents';
import { createBasicExecutors } from './executors/basicExecutors';
import { createDiceExecutor } from './executors/diceExecutor';
import { createMovementExecutor } from './executors/movementExecutor';
import { createSemanticExecutors } from './executors/semanticExecutors';
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
  private readonly privateSemanticSequences = new Map<string, number>();
  private authoritativeLogs: readonly string[] = [];
  private logGate: { playerId: string; turnNumber: number } | null = null;

  public constructor(reducedMotion = false, speedMultiplier = 1) {
    this.store.setAnimationSpeedMultiplier(speedMultiplier);
    const executors = {
      ...createBasicExecutors(this.store),
      ...createSemanticExecutors(this.store),
      ROLL_DICE: createDiceExecutor(this.store),
      MOVE_CHARACTER: createMovementExecutor(this.store),
    };
    this.queue = new AnimationQueue({
      executors,
      reducedMotion,
      speedMultiplier,
      onReset: snapshot => {
        if (snapshot && typeof snapshot === 'object' && 'gameState' in snapshot) {
          const room = snapshot as PublicRoomState;
          this.authoritativeLogs = [...room.gameState.boardState.logs];
          this.logGate = null;
          this.store.resetFromSnapshot(room);
        }
      },
      onError: (error, event) => {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return;
        console.error('Presentation animation failed.', event.type, error);
      },
    });
    this.queue.subscribe(status => {
      this.store.setStatus(status);
      if (status === 'idle') this.flushLogsIfSafe();
    });
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

    const playerRemovedDuringPresentation = this.queue.getStatus() !== 'idle'
      && Object.keys(previous.gameState.players).some(playerId => !room.gameState.players[playerId]);
    if (playerRemovedDuringPresentation) {
      this.queue.reset(room);
      return true;
    }

    this.store.syncPlayers(room);
    const rollSequenceDelta = room.gameState.boardState.rollSequence
      - previous.gameState.boardState.rollSequence;
    if (rollSequenceDelta > 1 || semanticEventsSince(previous, room) === null) {
      this.queue.reset(room);
      return true;
    }
    const events = derivePresentationEvents(previous, room);
    this.store.syncDisplayDevelopmentLevels(
      room.gameState.boardState.ownedProps,
      events.flatMap(event => event.type === 'PROPERTY_DEVELOPMENT_CHANGED'
        && event.toHouses > event.fromHouses
        ? [{
            tileId: event.tileId,
            fromHouses: event.fromHouses,
            toHouses: event.toHouses,
          }]
        : []),
    );
    this.updateLogGate(previous, room, events);
    if (!events.some(event => event.type === 'ROLL_DICE')) {
      this.store.syncDisplayDice(
        room.gameState.boardState.diceValue,
        room.gameState.boardState.rollSequence,
      );
    }
    void Promise.all(this.queue.enqueueMany(events));
    this.flushLogsIfSafe();
    return true;
  }

  public acceptPrivatePlayerState(
    privateState: PrivatePlayerState,
    room: PublicRoomState,
    source: 'LIVE_UPDATE' | 'SESSION_SYNC',
  ): void {
    const previousSequence = this.privateSemanticSequences.get(privateState.playerId);
    const stream = privateState.gameplayEvents;
    this.privateSemanticSequences.set(privateState.playerId, stream.sequence);
    if (source !== 'LIVE_UPDATE' || previousSequence === undefined) return;
    const events = stream.events
      .filter(event => event.sequence > previousSequence)
      .sort((left, right) => left.sequence - right.sequence);
    if (
      stream.sequence < previousSequence
      || events.length !== stream.sequence - previousSequence
      || (events.length > 0 && events[0]?.sequence !== previousSequence + 1)
    ) {
      this.queue.reset(room);
      return;
    }
    const presentationEvents = events.flatMap((event): MoneyTransferPresentationEvent[] => (
      event.type === 'MONEY_TRANSFER'
        ? [{
            id: event.eventId,
            roomId: room.roomId,
            roomVersion: room.version,
            type: 'MONEY_TRANSFER',
            entityId: event.operationId ?? event.eventId,
            source: event.source,
            destination: event.destination,
            amount: event.amount,
            reason: event.reason,
            ...(event.operationId ? { operationId: event.operationId } : {}),
          }]
        : []
    ));
    void Promise.all(this.queue.enqueueMany(presentationEvents));
  }

  public setPreferences(reducedMotion: boolean, speedMultiplier: number): void {
    this.queue.setReducedMotion(reducedMotion);
    this.queue.setSpeedMultiplier(speedMultiplier);
    this.store.setReducedMotion(reducedMotion);
    this.store.setAnimationSpeedMultiplier(speedMultiplier);
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

  private updateLogGate(
    previous: PublicRoomState,
    next: PublicRoomState,
    events: ReturnType<typeof derivePresentationEvents>,
  ): void {
    this.authoritativeLogs = [...next.gameState.boardState.logs];
    if (this.logGate) return;
    if (events.length === 0) {
      this.store.setDisplayLogs(this.authoritativeLogs);
      return;
    }
    this.logGate = {
      playerId: previous.gameState.boardState.currentPlayer.id,
      turnNumber: previous.gameState.boardState.turnNumber,
    };
  }

  private flushLogsIfSafe(): void {
    if (!this.logGate || !this.acceptedRoom || this.queue.getStatus() !== 'idle') return;
    const game = this.acceptedRoom.gameState;
    const currentPlayer = game.boardState.currentPlayer;
    const turnReady = currentPlayer.id !== this.logGate.playerId
      || game.boardState.turnNumber > this.logGate.turnNumber
      || !currentPlayer.hasMoved;
    const interactionPending = Boolean(
      game.turnInfo.pendingCardInteraction
      || game.turnInfo.pendingLandingDecision
      || game.boardState.paymentShortfall,
    );
    const gameFinished = this.acceptedRoom.status === 'FINISHED' || Boolean(game.boardState.winner);
    if (!turnReady && !gameFinished) return;
    if (interactionPending) return;
    this.store.setDisplayLogs(this.authoritativeLogs);
    this.logGate = null;
  }
}
