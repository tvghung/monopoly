import * as THREE from 'three';
import {
  TILE_LAND_PRESS_DEPTH,
  TILE_PRESS_DEPRESS_MS,
  TILE_PRESS_REBOUND_MS,
  TILE_STEP_PRESS_DEPTH,
} from '../architecture/boardArtSpec';
import type {
  TileMotionKind,
  TileMotionScheduler,
  TileMotionState,
} from './tileMotionTypes';

const defaultScheduler: TileMotionScheduler = {
  now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
  requestFrame: callback => {
    if (typeof window !== 'undefined') return window.requestAnimationFrame(callback);
    return globalThis.setTimeout(() => callback(Date.now()), 16);
  },
  cancelFrame: handle => {
    if (typeof window !== 'undefined') window.cancelAnimationFrame(handle);
    else globalThis.clearTimeout(handle);
  },
};

export interface TileMotionControllerOptions {
  scheduler?: TileMotionScheduler;
  invalidate?: () => void;
  reducedMotion?: boolean;
}

export class TileMotionController {
  private readonly scheduler: TileMotionScheduler;
  private readonly roots = new Map<number, THREE.Group>();
  private readonly states = new Map<number, TileMotionState>();
  private readonly listeners = new Set<() => void>();
  private invalidate?: () => void;
  private reducedMotion: boolean;
  private frameHandle: number | null = null;

  public constructor(options: TileMotionControllerOptions = {}) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.invalidate = options.invalidate;
    this.reducedMotion = options.reducedMotion ?? false;
  }

  public setInvalidate(invalidate?: () => void): void {
    this.invalidate = invalidate;
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) this.reset();
  }

  public register(tileId: number, group: THREE.Group): () => void {
    const previous = this.roots.get(tileId);
    if (previous && previous !== group) previous.position.y = 0;
    this.roots.set(tileId, group);
    group.position.y = this.states.get(tileId)?.offsetY ?? 0;
    this.invalidate?.();
    return () => {
      if (this.roots.get(tileId) !== group) return;
      this.roots.delete(tileId);
      this.states.delete(tileId);
      group.position.y = 0;
      this.notify();
    };
  }

  public press(tileId: number, kind: TileMotionKind): void {
    if (this.reducedMotion) return;
    const currentOffsetY = this.states.get(tileId)?.offsetY
      ?? this.roots.get(tileId)?.position.y
      ?? 0;
    const targetOffsetY = -(kind === 'LAND' ? TILE_LAND_PRESS_DEPTH : TILE_STEP_PRESS_DEPTH);
    const now = this.scheduler.now();
    this.states.set(tileId, {
      offsetY: currentOffsetY,
      startOffsetY: currentOffsetY,
      targetOffsetY,
      startedAt: now,
      duration: TILE_PRESS_DEPRESS_MS,
      phase: 'DEPRESS',
    });
    this.writeOffset(tileId, currentOffsetY);
    this.ensureFrame();
  }

  public getTileOffsetY(tileId: number): number {
    return this.states.get(tileId)?.offsetY ?? this.roots.get(tileId)?.position.y ?? 0;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public reset(): void {
    if (this.frameHandle !== null) {
      this.scheduler.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.states.clear();
    this.roots.forEach(root => { root.position.y = 0; });
    this.invalidate?.();
    this.notify();
  }

  private ensureFrame(): void {
    if (this.frameHandle !== null) return;
    this.frameHandle = this.scheduler.requestFrame(time => {
      this.frameHandle = null;
      this.tick(time);
    });
  }

  private tick(now: number): void {
    let active = false;
    this.states.forEach((state, tileId) => {
      const progress = Math.min(1, Math.max(0, (now - state.startedAt) / state.duration));
      const eased = state.phase === 'DEPRESS'
        ? 1 - (1 - progress) ** 3
        : 1 - (1 - progress) ** 2;
      state.offsetY = state.startOffsetY + (state.targetOffsetY - state.startOffsetY) * eased;
      this.writeOffset(tileId, state.offsetY);
      if (progress < 1) {
        active = true;
        return;
      }
      if (state.phase === 'DEPRESS') {
        state.phase = 'REBOUND';
        state.startOffsetY = state.offsetY;
        state.targetOffsetY = 0;
        state.startedAt = now;
        state.duration = TILE_PRESS_REBOUND_MS;
        active = true;
      } else {
        this.states.delete(tileId);
        this.writeOffset(tileId, 0);
      }
    });
    this.invalidate?.();
    this.notify();
    if (active) this.ensureFrame();
  }

  private writeOffset(tileId: number, offsetY: number): void {
    const root = this.roots.get(tileId);
    if (root) root.position.y = offsetY;
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }
}
