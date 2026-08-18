import type { DiceValue, PublicRoomState } from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';
import type { PresentationListener, PresentationState, PresentationStoreLike } from './types';

const emptyState: PresentationState = {
  displayPositions: {},
  displayActivePlayerId: null,
  displayDice: { dice1: 0, dice2: 0 },
  status: 'idle',
  tileImpacts: [],
  tileImpactEpoch: 0,
};

export class PresentationStore implements PresentationStoreLike {
  private state: PresentationState = emptyState;
  private readonly listeners = new Set<PresentationListener>();
  private nextTileImpactSequence = 0;

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
    this.state = {
      displayPositions: positions,
      displayActivePlayerId: room.gameState.boardState.currentPlayer.id || null,
      displayDice: { ...room.gameState.boardState.diceValue },
      status: 'idle',
      tileImpacts: [],
      tileImpactEpoch: this.state.tileImpactEpoch + 1,
    };
    this.nextTileImpactSequence = 0;
    this.notify();
  }

  public syncPlayers(room: PublicRoomState): void {
    const nextPositions: Record<string, number> = {};
    let changed = false;
    Object.entries(room.gameState.players).forEach(([playerId, player]) => {
      if (this.state.displayPositions[playerId] === undefined) changed = true;
      nextPositions[playerId] = this.state.displayPositions[playerId] ?? player.currentTile;
    });
    if (Object.keys(nextPositions).length !== Object.keys(this.state.displayPositions).length) changed = true;
    if (!changed) return;
    this.state = { ...this.state, displayPositions: nextPositions };
    this.notify();
  }

  public setDisplayPosition(playerId: string, tileId: number): void {
    if (this.state.displayPositions[playerId] === tileId) return;
    this.state = {
      ...this.state,
      displayPositions: { ...this.state.displayPositions, [playerId]: tileId },
    };
    this.notify();
  }

  public setDisplayDice(dice: DiceValue): void {
    if (this.state.displayDice.dice1 === dice.dice1 && this.state.displayDice.dice2 === dice.dice2) return;
    this.state = { ...this.state, displayDice: { ...dice } };
    this.notify();
  }

  public setDisplayActivePlayerId(playerId: string): void {
    const next = playerId || null;
    if (this.state.displayActivePlayerId === next) return;
    this.state = { ...this.state, displayActivePlayerId: next };
    this.notify();
  }

  public emitTileImpact(playerId: string, tileId: number, kind: PresentationState['tileImpacts'][number]['kind']): void {
    this.nextTileImpactSequence += 1;
    const nextImpact = { sequence: this.nextTileImpactSequence, playerId, tileId, kind };
    const impacts = [...this.state.tileImpacts, nextImpact].slice(-64);
    this.state = { ...this.state, tileImpacts: impacts };
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
}

