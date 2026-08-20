import type { DiceValue, PublicRoomState } from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';
import type {
  CharacterMovementSignal,
  CharacterReactionKind,
  PresentationListener,
  PresentationState,
  PresentationStoreLike,
} from './types';
import type { TileImpactSignal, TileImpactTiming } from '../../scene/board/motion/tileMotionTypes';

const emptyState: PresentationState = {
  displayPositions: {},
  settledPositions: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  displayRollSequence: 0,
  status: 'idle',
  tileImpacts: [],
  characterMovements: [],
  characterLandings: [],
  characterReactions: [],
  animationSpeedMultiplier: 1,
  presentationResetEpoch: 0,
};

const CHARACTER_SIGNAL_LIMIT = 128;

export class PresentationStore implements PresentationStoreLike {
  private state: PresentationState = emptyState;
  private readonly listeners = new Set<PresentationListener>();
  private nextTileImpactSequence = 0;
  private nextCharacterMovementSequence = 0;
  private nextCharacterLandingSequence = 0;
  private nextCharacterReactionSequence = 0;
  private readonly playerJoinOrder = new Map<string, number>();
  private readonly activeCharacterMovements = new Map<string, CharacterMovementSignal>();

  public getSnapshot(): PresentationState {
    return this.state;
  }

  public subscribe(listener: PresentationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public resetFromSnapshot(room: PublicRoomState): void {
    const positions: Record<string, number> = {};
    Object.entries(room.gameState.players).forEach(([playerId, player]) => {
      positions[playerId] = player.currentTile;
    });
    this.playerJoinOrder.clear();
    room.players.forEach(player => this.playerJoinOrder.set(player.playerId, player.joinOrder));
    this.activeCharacterMovements.clear();
    this.state = {
      displayPositions: positions,
      settledPositions: positions,
      displayActivePlayerId: room.gameState.boardState.currentPlayer.id || null,
      displayDice: { ...room.gameState.boardState.diceValue },
      displayRollSequence: room.gameState.boardState.rollSequence,
      status: 'idle',
      tileImpacts: [],
      characterMovements: [],
      characterLandings: [],
      characterReactions: [],
      animationSpeedMultiplier: this.state.animationSpeedMultiplier,
      presentationResetEpoch: this.state.presentationResetEpoch + 1,
    };
    this.nextTileImpactSequence = 0;
    this.nextCharacterMovementSequence = 0;
    this.nextCharacterLandingSequence = 0;
    this.nextCharacterReactionSequence = 0;
    this.notify();
  }

  public syncPlayers(room: PublicRoomState): void {
    room.players.forEach(player => this.playerJoinOrder.set(player.playerId, player.joinOrder));
    const nextPositions: Record<string, number> = {};
    const nextSettledPositions: Record<string, number> = {};
    let changed = false;
    Object.entries(room.gameState.players).forEach(([playerId, player]) => {
      if (this.state.displayPositions[playerId] === undefined) changed = true;
      nextPositions[playerId] = this.state.displayPositions[playerId] ?? player.currentTile;
      if (this.state.settledPositions[playerId] === undefined) changed = true;
      nextSettledPositions[playerId] = this.state.settledPositions[playerId] ?? player.currentTile;
    });
    if (Object.keys(nextPositions).length !== Object.keys(this.state.displayPositions).length) changed = true;
    if (Object.keys(nextSettledPositions).length !== Object.keys(this.state.settledPositions).length) changed = true;
    if (!changed) return;
    this.state = {
      ...this.state,
      displayPositions: nextPositions,
      settledPositions: nextSettledPositions,
    };
    this.notify();
  }

  public startCharacterHop(
    playerId: string,
    fromTileId: number,
    toTileId: number,
    durationMs: number,
  ): void {
    const currentPositions = this.state.displayPositions;
    const nextPositions = { ...currentPositions, [playerId]: toTileId };
    const fromSlot = this.getSlotInfo(currentPositions, playerId, fromTileId);
    const toSlot = this.getSlotInfo(nextPositions, playerId, toTileId);
    this.nextCharacterMovementSequence += 1;
    const signal: CharacterMovementSignal = {
      sequence: this.nextCharacterMovementSequence,
      playerId,
      transition: 'TILE_HOP',
      phase: 'START',
      fromTileId,
      toTileId,
      fromSlotIndex: fromSlot.slotIndex,
      fromOccupantCount: fromSlot.occupantCount,
      toSlotIndex: toSlot.slotIndex,
      toOccupantCount: toSlot.occupantCount,
      durationMs: Math.max(0, durationMs),
    };
    this.activeCharacterMovements.set(playerId, signal);
    this.state = {
      ...this.state,
      displayPositions: nextPositions,
      characterMovements: this.appendCharacterMovement(signal),
    };
    this.notify();
  }

  public completeCharacterHop(playerId: string, tileId: number): void {
    const active = this.activeCharacterMovements.get(playerId);
    this.activeCharacterMovements.delete(playerId);
    const signal = active
      ? active
      : this.createSnapSignal(playerId, tileId);
    this.nextCharacterMovementSequence += 1;
    const completed: CharacterMovementSignal = {
      ...signal,
      sequence: this.nextCharacterMovementSequence,
      phase: 'COMPLETE',
      toTileId: tileId,
    };
    this.state = {
      ...this.state,
      displayPositions: { ...this.state.displayPositions, [playerId]: tileId },
      settledPositions: { ...this.state.settledPositions, [playerId]: tileId },
      characterMovements: this.appendCharacterMovement(completed),
    };
    this.notify();
  }

  public snapDisplayPosition(playerId: string, tileId: number): void {
    const currentTileId = this.state.displayPositions[playerId]
      ?? this.state.settledPositions[playerId]
      ?? tileId;
    this.activeCharacterMovements.delete(playerId);
    this.nextCharacterMovementSequence += 1;
    const signal: CharacterMovementSignal = {
      ...this.createSnapSignal(playerId, tileId, currentTileId),
      sequence: this.nextCharacterMovementSequence,
    };
    this.state = {
      ...this.state,
      displayPositions: { ...this.state.displayPositions, [playerId]: tileId },
      settledPositions: { ...this.state.settledPositions, [playerId]: tileId },
      characterMovements: this.appendCharacterMovement(signal),
    };
    this.notify();
  }

  public emitCharacterLanding(playerId: string, tileId: number, durationMs: number): void {
    this.nextCharacterLandingSequence += 1;
    const nextLanding = {
      sequence: this.nextCharacterLandingSequence,
      playerId,
      tileId,
      durationMs: Math.max(0, durationMs),
    };
    const characterLandings = [...this.state.characterLandings, nextLanding].slice(-CHARACTER_SIGNAL_LIMIT);
    this.state = { ...this.state, characterLandings };
    this.notify();
  }

  public setDisplayDice(dice: DiceValue, rollSequence: number): void {
    if (rollSequence <= this.state.displayRollSequence) return;
    this.state = {
      ...this.state,
      displayDice: { ...dice },
      displayRollSequence: rollSequence,
    };
    this.notify();
  }

  public syncDisplayDice(dice: DiceValue, rollSequence: number): void {
    if (rollSequence < this.state.displayRollSequence
      || (rollSequence === this.state.displayRollSequence
        && this.state.displayDice.dice1 === dice.dice1
        && this.state.displayDice.dice2 === dice.dice2)) return;
    this.state = {
      ...this.state,
      displayDice: { ...dice },
      displayRollSequence: rollSequence,
    };
    this.notify();
  }

  public setDisplayActivePlayerId(playerId: string): void {
    const next = playerId || null;
    if (this.state.displayActivePlayerId === next) return;
    this.state = { ...this.state, displayActivePlayerId: next };
    this.notify();
  }

  public emitTileImpact(
    playerId: string,
    tileId: number,
    kind: PresentationState['tileImpacts'][number]['kind'],
    timing: TileImpactTiming,
  ): void {
    this.nextTileImpactSequence += 1;
    const nextImpact: TileImpactSignal = {
      sequence: this.nextTileImpactSequence,
      playerId,
      tileId,
      kind,
      delayMs: Math.max(0, timing.delayMs),
      depressDurationMs: Math.max(0, timing.depressDurationMs),
      reboundDurationMs: Math.max(0, timing.reboundDurationMs),
    };
    const impacts = [...this.state.tileImpacts, nextImpact].slice(-64);
    this.state = { ...this.state, tileImpacts: impacts };
    this.notify();
  }

  public emitCharacterReaction(playerId: string, kind: CharacterReactionKind, durationMs: number): void {
    this.nextCharacterReactionSequence += 1;
    const nextReaction = {
      sequence: this.nextCharacterReactionSequence,
      playerId,
      kind,
      durationMs: Math.max(0, durationMs),
    };
    const characterReactions = [...this.state.characterReactions, nextReaction].slice(-64);
    this.state = { ...this.state, characterReactions };
    this.notify();
  }

  public setAnimationSpeedMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier)) return;
    const next = Math.min(2, Math.max(0.75, multiplier));
    if (this.state.animationSpeedMultiplier === next) return;
    this.state = { ...this.state, animationSpeedMultiplier: next };
    this.notify();
  }

  public setStatus(status: AnimationQueueStatus): void {
    if (this.state.status === status) return;
    this.state = { ...this.state, status };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }

  private appendCharacterMovement(signal: CharacterMovementSignal): readonly CharacterMovementSignal[] {
    return [...this.state.characterMovements, signal].slice(-CHARACTER_SIGNAL_LIMIT);
  }

  private createSnapSignal(
    playerId: string,
    toTileId: number,
    fromTileId = this.state.displayPositions[playerId] ?? toTileId,
  ): CharacterMovementSignal {
    const fromSlot = this.getSlotInfo(this.state.displayPositions, playerId, fromTileId);
    const nextPositions = { ...this.state.displayPositions, [playerId]: toTileId };
    const toSlot = this.getSlotInfo(nextPositions, playerId, toTileId);
    return {
      sequence: 0,
      playerId,
      transition: 'SNAP',
      phase: 'COMPLETE',
      fromTileId,
      toTileId,
      fromSlotIndex: fromSlot.slotIndex,
      fromOccupantCount: fromSlot.occupantCount,
      toSlotIndex: toSlot.slotIndex,
      toOccupantCount: toSlot.occupantCount,
      durationMs: 0,
    };
  }

  private getSlotInfo(
    positions: Record<string, number>,
    playerId: string,
    tileId: number,
  ): { slotIndex: number; occupantCount: number } {
    const occupants = Object.entries(positions)
      .filter(([, position]) => position === tileId)
      .map(([id]) => id);
    if (!occupants.includes(playerId)) occupants.push(playerId);
    occupants.sort((left, right) => (
      (this.playerJoinOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (this.playerJoinOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    ) || left.localeCompare(right));
    return {
      slotIndex: Math.max(0, occupants.indexOf(playerId)),
      occupantCount: occupants.length,
    };
  }
}

