import type { DiceValue, PublicRoomState } from '@monopoly/shared';
import type { AnimationQueueStatus } from '../queue/types';
import type { TileImpactSignal } from '../../scene/board/motion/tileMotionTypes';

export interface PresentationState {
  displayPositions: Record<string, number>;
  displayActivePlayerId: string | null;
  displayDice: DiceValue;
  status: AnimationQueueStatus;
  tileImpacts: readonly TileImpactSignal[];
  tileImpactEpoch: number;
}

export type PresentationListener = () => void;

export interface PresentationStoreLike {
  getSnapshot: () => PresentationState;
  subscribe: (listener: PresentationListener) => () => void;
  resetFromSnapshot: (room: PublicRoomState) => void;
  syncPlayers: (room: PublicRoomState) => void;
  setDisplayPosition: (playerId: string, tileId: number) => void;
  setDisplayDice: (dice: DiceValue) => void;
  setDisplayActivePlayerId: (playerId: string) => void;
  emitTileImpact: (playerId: string, tileId: number, kind: TileImpactSignal['kind']) => void;
  setStatus: (status: AnimationQueueStatus) => void;
}

