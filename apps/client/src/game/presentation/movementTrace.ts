export type CharacterMovementTraceStage =
  | 'STORE_START'
  | 'STORE_COMPLETE'
  | 'STORE_SNAP'
  | 'BILLBOARD_START'
  | 'BILLBOARD_COMPLETE'
  | 'BILLBOARD_SNAP'
  | 'SCENE_MOUNT'
  | 'SCENE_UNMOUNT'
  | 'PRESENTATION_RESET'
  | 'QUEUE_RESET'
  | 'FRAME';

export interface CharacterMovementTraceEntry {
  atMs: number;
  stage: CharacterMovementTraceStage;
  playerId: string;
  sequence?: number;
  transition?: string;
  fromTileId?: number;
  toTileId?: number;
  playerTileId?: number;
  activeSequence?: number | null;
  pendingSignal?: boolean;
  elapsedMs?: number;
  frameDeltaMs?: number;
  durationMs?: number;
  position?: readonly [number, number, number];
  targetAnchor?: readonly [number, number, number];
  displayTileId?: number;
  settledTileId?: number;
  rollSequence?: number;
  resetEpoch?: number;
  queueGeneration?: number;
  frameSequence?: number;
  schedulerTimestampMs?: number;
}

declare global {
  interface Window {
    __OWN_THE_BLOCK_MOVEMENT_TRACE__?: CharacterMovementTraceEntry[];
  }
}

export function recordCharacterMovementTrace(
  entry: Omit<CharacterMovementTraceEntry, 'atMs'>,
): void {
  if (
    !import.meta.env.DEV
    || typeof window === 'undefined'
    || new URLSearchParams(window.location.search).get('motion-trace') !== '1'
  ) return;

  const trace = window.__OWN_THE_BLOCK_MOVEMENT_TRACE__ ??= [];
  trace.push({ ...entry, atMs: performance.now() });
  if (trace.length > 512) trace.splice(0, trace.length - 512);
}
