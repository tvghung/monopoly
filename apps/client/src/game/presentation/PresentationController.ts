import type { PrivatePlayerState, PublicRoomState } from '@monopoly/shared';
import { NOOP_AUDIO_PORT, type AudioPort } from '../../audio/types';
import { derivePowerUpFeedback } from './events/powerUpFeedback';
import type { PowerUpOwnerState } from '@monopoly/shared';
import type { PowerUpFeedbackPresentationEvent, MoneyTransferPresentationEvent } from './events/types';
import { derivePresentationEvents, semanticEventsSince } from './events/derivePresentationEvents';
import { createBasicExecutors } from './executors/basicExecutors';
import { createDiceExecutor } from './executors/diceExecutor';
import { createMovementExecutor } from './executors/movementExecutor';
import { createSemanticExecutors } from './executors/semanticExecutors';
import { AnimationQueue } from './queue/AnimationQueue';
import { PresentationStore } from './store/presentationStore';
import type { PresentationState } from './store/types';

export type SnapshotSource = 'LIVE_UPDATE' | 'SESSION_SYNC' | 'SPECTATOR_SYNC' | 'REPLAY_SYNC';

function getAuthoritativeBalances(room: PublicRoomState): Record<string, number> {
  const balances: Record<string, number> = {};
  Object.entries(room.gameState.players).forEach(([playerId, player]) => {
    balances[playerId] = player.accountBalance;
  });
  Object.entries(room.gameState.boardState.finishedPlayers).forEach(([playerId, player]) => {
    if (balances[playerId] === undefined) balances[playerId] = player.accountBalance ?? 0;
  });
  return balances;
}

export class PresentationController {
  public readonly store = new PresentationStore();
  public readonly queue: AnimationQueue;
  private acceptedRoom: PublicRoomState | null = null;
  private consumerCount = 0;
  private disposalGeneration = 0;
  private disposed = false;
  private hidden = false;
  private privatePowerUps: { playerId: string; state: PowerUpOwnerState | undefined; turnNumber: number } | null = null;
  private readonly powerUpFeedbackPending: PowerUpFeedbackPresentationEvent[] = [];
  private readonly powerUpAcknowledgedInstances = new Set<string>();
  private readonly powerUpRemovalInstances = new Set<string>();
  private readonly powerUpFeedbackSeen = new Set<string>();
  private powerUpFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly privateSemanticSequences = new Map<string, number>();
  private readonly audio: AudioPort;
  private authoritativeLogs: readonly string[] = [];
  private authoritativeActivity: PublicRoomState['gameState']['boardState']['activityFeed']['events'] = [];
  private legacyLogPrefix: readonly string[] = [];
  private logGate: { playerId: string; turnNumber: number } | null = null;

  public constructor(
    reducedMotion = false,
    speedMultiplier = 1,
    audio: AudioPort = NOOP_AUDIO_PORT,
  ) {
    this.audio = audio;
    this.store.setAnimationSpeedMultiplier(speedMultiplier);
    const executors = {
      ...createBasicExecutors(this.store, audio),
      ...createSemanticExecutors(this.store, audio),
      POWER_UP_FEEDBACK: {
        // Text has its own reading lifetime inside the existing presentation channel.
        // Completing this handoff immediately keeps movement and gameplay gates free.
        run: (event: PowerUpFeedbackPresentationEvent, context: import('./queue/types').AnimationExecutionContext) => {
          if (!context.signal.aborted && context.isCurrent?.() !== false) this.enqueuePowerUpFeedback(event);
          return Promise.resolve();
        },
        finish: () => {},
      },
      ROLL_DICE: createDiceExecutor(this.store, audio),
      MOVE_CHARACTER: createMovementExecutor(this.store, audio),
    };
    this.queue = new AnimationQueue({
      executors,
      reducedMotion,
      speedMultiplier,
      onStall: () => this.skipAllAndSnap(),
      onReset: snapshot => {
        this.clearPowerUpFeedback();
        audio.stopPresentationVoices?.();
        if (snapshot && typeof snapshot === 'object' && 'gameState' in snapshot) {
          const room = snapshot as PublicRoomState;
          this.legacyLogPrefix = room.gameState.boardState.activityFeed.events.length === 0
            ? [...room.gameState.boardState.logs]
            : [];
          this.authoritativeLogs = [...this.legacyLogPrefix];
          this.authoritativeActivity = [...room.gameState.boardState.activityFeed.events];
          this.logGate = null;
          this.store.resetFromSnapshot(room);
          this.store.setDisplayLogs(this.authoritativeLogs);
          this.store.setDisplayActivity(this.authoritativeActivity);
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
      && (room.version < this.acceptedRoom.version
        || (room.version === this.acceptedRoom.version && source === 'LIVE_UPDATE'))) return false;

    const previous = this.acceptedRoom;
    if (previous && previous.roomId !== room.roomId) {
      this.privatePowerUps = null;
      this.privateSemanticSequences.clear();
    }
    this.acceptedRoom = room;
    if (!previous || source !== 'LIVE_UPDATE' || this.hidden) {
      this.queue.reset(room);
      return true;
    }

    const playerRemovedDuringPresentation = this.queue.getStatus() !== 'idle'
      && Object.keys(previous.gameState.players).some(playerId => !room.gameState.players[playerId]);
    if (playerRemovedDuringPresentation) {
      this.queue.reset(room);
      return true;
    }

    // 2v2 revive: an eliminated player is seated again at Xuất Phát. There is no earlier display state for them to animate
    // from, so the roster snaps to the authoritative one instead of fabricating movement or cash deltas for a returning seat.
    const playerAppeared = Object.keys(room.gameState.players).some(playerId => !previous.gameState.players[playerId]);
    if (playerAppeared) {
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
    this.store.syncDisplayBalances(
      getAuthoritativeBalances(room),
      events.flatMap(event => event.type === 'BALANCE_CHANGED'
        ? [{ id: event.id, playerId: event.playerId, from: event.from, to: event.to }]
        : []),
    );
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
    // A flag rises only once the queue reaches its purchase or transfer: never before the dice and the walk that led there.
    this.store.holdOwnership(events.flatMap(event => {
      if (event.type === 'PROPERTY_TRANSFER') {
        return event.transfers.map(transfer => ({ id: transfer.eventId, tileId: transfer.tileId, fromPlayerId: transfer.fromPlayerId }));
      }
      return event.type === 'PROPERTY_OWNERSHIP_CHANGED'
        ? [{ id: event.id, tileId: event.tileId, fromPlayerId: event.fromPlayerId }]
        : [];
    }));
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

  /** A successful command ACK proves the local action; sync/reset epochs suppress late feedback after reconnect. */
  public showPowerUpFeedback(kind: PowerUpFeedbackPresentationEvent['kind'], definitionId: string, name: string, instanceId: string, expectedEpoch: number): void {
    const room = this.acceptedRoom;
    if (!room || this.hidden || this.disposed || this.store.getSnapshot().presentationResetEpoch !== expectedEpoch) return;
    const identity = room.roomId + ':' + instanceId;
    if (this.powerUpAcknowledgedInstances.has(identity)) return;
    this.powerUpAcknowledgedInstances.add(identity);
    const event: PowerUpFeedbackPresentationEvent = { type: 'POWER_UP_FEEDBACK', id: room.roomId + ':ack:' + instanceId,
      entityId: instanceId, roomId: room.roomId, roomVersion: room.version, kind, definitionId, name };
    const current = this.store.getSnapshot().powerUpFeedback;
    if (current?.kind === 'CONSUMED' && current.entityId === instanceId) {
      this.store.setPowerUpFeedback({ ...event, id: current.id });
      this.startPowerUpFeedbackTimer();
      return;
    }
    const pending = this.powerUpFeedbackPending.findIndex(item => item.kind === 'CONSUMED' && item.entityId === instanceId);
    if (pending >= 0) { this.powerUpFeedbackPending[pending] = event; return; }
    if (this.powerUpRemovalInstances.has(identity)) return;
    void this.queue.enqueue(event);
  }

  private enqueuePowerUpFeedback(event: PowerUpFeedbackPresentationEvent): void {
    if (this.hidden || this.disposed || this.powerUpFeedbackSeen.has(event.id)) return;
    this.powerUpFeedbackSeen.add(event.id);
    if (event.kind === 'CONSUMED') {
      const identity = event.roomId + ':' + event.entityId;
      this.powerUpRemovalInstances.add(identity);
      if (this.powerUpAcknowledgedInstances.has(identity)) return;
    }
    this.powerUpFeedbackPending.push(event);
    if (!this.store.getSnapshot().powerUpFeedback) this.advancePowerUpFeedback();
  }

  private advancePowerUpFeedback(): void {
    const event = this.powerUpFeedbackPending.shift() ?? null;
    this.store.setPowerUpFeedback(event);
    if (event) this.startPowerUpFeedbackTimer();
  }

  private startPowerUpFeedbackTimer(): void {
    if (this.powerUpFeedbackTimer !== null) clearTimeout(this.powerUpFeedbackTimer);
    // Wall-clock reading time is independent of animation speed and reduced motion.
    this.powerUpFeedbackTimer = setTimeout(() => {
      this.powerUpFeedbackTimer = null;
      this.advancePowerUpFeedback();
    }, 5_000);
  }

  private clearPowerUpFeedback(): void {
    if (this.powerUpFeedbackTimer !== null) clearTimeout(this.powerUpFeedbackTimer);
    this.powerUpFeedbackTimer = null;
    this.powerUpFeedbackPending.length = 0;
    this.powerUpAcknowledgedInstances.clear();
    this.powerUpFeedbackSeen.clear();
    this.powerUpRemovalInstances.clear();
    this.store.setPowerUpFeedback(null);
  }

  public acceptPrivatePlayerState(
    privateState: PrivatePlayerState,
    room: PublicRoomState,
    source: 'LIVE_UPDATE' | 'SESSION_SYNC',
  ): void {
    if (source !== 'LIVE_UPDATE' || this.privatePowerUps && this.privatePowerUps.playerId !== privateState.playerId) this.clearPowerUpFeedback();
    const previousPowerUps = this.privatePowerUps?.playerId === privateState.playerId ? this.privatePowerUps.state : undefined;
    const previousTurnNumber = this.privatePowerUps?.turnNumber;
    this.privatePowerUps = { playerId: privateState.playerId, state: privateState.powerUps, turnNumber: room.gameState.boardState.turnNumber };
    if (source === 'LIVE_UPDATE' && !this.hidden) void Promise.all(this.queue.enqueueMany(derivePowerUpFeedback(previousPowerUps, privateState.powerUps, room, previousTurnNumber)));
    const previousSequence = this.privateSemanticSequences.get(privateState.playerId);
    const stream = privateState.gameplayEvents;
    this.privateSemanticSequences.set(privateState.playerId, stream.sequence);
    if (source !== 'LIVE_UPDATE' || previousSequence === undefined || this.hidden) return;
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

  /** Hidden clients hydrate snapshots without replaying obsolete effects on restore. */
  public setVisibility(hidden: boolean): void {
    if (this.disposed || this.hidden === hidden) return;
    this.hidden = hidden;
    this.skipAllAndSnap();
  }

  public recoverFromInterruption(): void {
    if (!this.disposed) this.skipAllAndSnap();
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
    if (this.acceptedRoom) {
      this.queue.reset(this.acceptedRoom);
      return;
    }
    this.audioStopPresentationVoices();
    this.queue.skipAll();
  }

  public getState(): PresentationState {
    return this.store.getSnapshot();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.consumerCount = 0;
    this.disposalGeneration += 1;
    this.clearPowerUpFeedback();
    this.audioStopPresentationVoices();
    this.queue.dispose();
  }

  private audioStopPresentationVoices(): void {
    // AudioPort keeps this boundary typed; AnimationQueue remains audio-agnostic.
    this.audio?.stopPresentationVoices?.();
  }

  private updateLogGate(
    previous: PublicRoomState,
    next: PublicRoomState,
    events: ReturnType<typeof derivePresentationEvents>,
  ): void {
    const precedingLogs = this.authoritativeLogs;
    const precedingActivity = this.authoritativeActivity;
    if (
      this.authoritativeActivity.length === 0
      && next.gameState.boardState.activityFeed.events.length === 0
    ) {
      this.legacyLogPrefix = [...next.gameState.boardState.logs];
    }
    this.authoritativeLogs = [...this.legacyLogPrefix];
    this.authoritativeActivity = [...next.gameState.boardState.activityFeed.events];
    const before = previous.gameState.boardState;
    const after = next.gameState.boardState;
    const handedOff = before.currentPlayer.id !== after.currentPlayer.id
      || after.turnNumber > before.turnNumber;
    const finished = next.status === 'FINISHED' || Boolean(after.winner);
    const nextTurnActive = after.currentPlayer.hasMoved || Boolean(
      next.gameState.turnInfo.pendingCardInteraction
      || next.gameState.turnInfo.pendingLandingDecision
      || after.paymentShortfall,
    );
    if (handedOff && nextTurnActive && !finished) {
      // If an incoming state already contains the next turn's interaction, only
      // the preceding snapshot is a proven completed prefix. Gate the new tail
      // under the new actor rather than retaining the old turn's gate.
      this.store.setDisplayLogs(precedingLogs);
      this.store.setDisplayActivity(precedingActivity);
      this.logGate = { playerId: after.currentPlayer.id, turnNumber: after.turnNumber };
      return;
    }
    if (handedOff || finished) {
      // App accepts each committed snapshot synchronously. This tail ends at the
      // observed handoff, before any later action by the next player. Publish it
      // even while earlier animations run; a later snapshot gets its own gate.
      this.store.setDisplayLogs(this.authoritativeLogs);
      this.store.setDisplayActivity(this.authoritativeActivity);
      this.logGate = null;
      return;
    }
    if (this.logGate) return;
    if (events.length === 0 && !nextTurnActive) {
      this.store.setDisplayLogs(this.authoritativeLogs);
      this.store.setDisplayActivity(this.authoritativeActivity);
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
    this.store.setDisplayActivity(this.authoritativeActivity);
    this.logGate = null;
  }
}
