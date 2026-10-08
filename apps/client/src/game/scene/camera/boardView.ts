import { useSyncExternalStore } from 'react';
import { CAMERA_RIGHT, CAMERA_UP } from './cameraMath';

/**
 * The player's own view of the board: a zoom factor over the default overview and a pan, in world units along the camera's right and
 * up axes. It is presentation only (nothing here reaches the room state or a socket) and lives outside React state so a pinch or a
 * drag moves the camera without rendering a component: the gesture layer writes it, `FixedBoardCamera` reads it and asks R3F for a frame.
 *
 * Rules (all in this file, so they can be tested without a canvas):
 * - zoom 1 is the overview that frames the whole table; the range is 1 to `MAX_BOARD_ZOOM`;
 * - the pan is clamped so the visible window never leaves the framed table: at zoom 1 there is no pan, at zoom 2 the window can
 *   reach every edge of the table but not go past it, so the board cannot be lost;
 * - a manual change stamps `lastManualAt`; automatic focus waits `MANUAL_PRECEDENCE_MS` after it, so the player is never fought.
 */
export const MIN_BOARD_ZOOM = 1;
export const MAX_BOARD_ZOOM = 3.5;
/** How long a manual gesture, zoom button or reset keeps automatic focus away. */
export const MANUAL_PRECEDENCE_MS = 6000;

export interface BoardView {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_BOARD_VIEW: BoardView = { zoom: 1, panX: 0, panY: 0 };

/** The default window on the table, in world units, as the camera computed it for the current canvas. */
export interface ViewFrame {
  /** Half width / half height of the window at zoom 1. */
  halfWidth: number;
  halfHeight: number;
}

export function clampBoardView(view: BoardView, frame: ViewFrame): BoardView {
  const zoom = Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, Number.isFinite(view.zoom) ? view.zoom : 1));
  // The window at this zoom may travel until its edge meets the edge of the zoom-1 window.
  const maxX = frame.halfWidth * (1 - 1 / zoom);
  const maxY = frame.halfHeight * (1 - 1 / zoom);
  return {
    zoom,
    panX: Math.min(maxX, Math.max(-maxX, Number.isFinite(view.panX) ? view.panX : 0)),
    panY: Math.min(maxY, Math.max(-maxY, Number.isFinite(view.panY) ? view.panY : 0)),
  };
}

export function isDefaultView(view: BoardView): boolean {
  return view.zoom <= MIN_BOARD_ZOOM + 0.001 && Math.abs(view.panX) < 0.001 && Math.abs(view.panY) < 0.001;
}

/**
 * Zoom by `factor` keeping the point under `anchor` (pixels from the canvas center, y down) where it is, as a pinch or a wheel
 * does. `worldPerPixelAtZoom1` is how many world units one pixel spans at zoom 1.
 */
export function zoomAbout(
  view: BoardView,
  factor: number,
  anchor: { x: number; y: number },
  worldPerPixelAtZoom1: number,
  frame: ViewFrame,
): BoardView {
  const nextZoom = Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, view.zoom * factor));
  const before = worldPerPixelAtZoom1 / view.zoom;
  const after = worldPerPixelAtZoom1 / nextZoom;
  return clampBoardView({
    zoom: nextZoom,
    panX: view.panX + anchor.x * (before - after),
    panY: view.panY - anchor.y * (before - after),
  }, frame);
}

/** Pan by a finger/pointer movement in pixels (the scene follows the finger). */
export function panByPixels(
  view: BoardView,
  dx: number,
  dy: number,
  worldPerPixelAtZoom1: number,
  frame: ViewFrame,
): BoardView {
  const scale = worldPerPixelAtZoom1 / view.zoom;
  return clampBoardView({ ...view, panX: view.panX - dx * scale, panY: view.panY + dy * scale }, frame);
}

/** The pan that puts a world point (x, y, z) at the center of the window. */
export function panToWorldPoint(
  view: BoardView,
  point: readonly [number, number, number],
  frame: ViewFrame,
): BoardView {
  const right = point[0] * CAMERA_RIGHT[0] + point[1] * CAMERA_RIGHT[1] + point[2] * CAMERA_RIGHT[2];
  const up = point[0] * CAMERA_UP[0] + point[1] * CAMERA_UP[1] + point[2] * CAMERA_UP[2];
  return clampBoardView({ ...view, panX: right, panY: up }, frame);
}

type Listener = () => void;

/** The store: one per page, because there is one board. */
class BoardViewStore {
  private view: BoardView = DEFAULT_BOARD_VIEW;
  private frame: ViewFrame = { halfWidth: 10, halfHeight: 6 };
  private worldPerPixel = 0.02;
  private activeCount = 0;
  private reducedMotion = false;
  private animation = 0;
  private listeners = new Set<Listener>();
  lastManualAt = Number.NEGATIVE_INFINITY;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  getView = (): BoardView => this.view;
  getFrame = (): ViewFrame => this.frame;
  getWorldPerPixel = (): number => this.worldPerPixel;

  /** True while a 3D board is mounted: the controls have nothing to drive on the flat fallback board. */
  isActive = (): boolean => this.activeCount > 0;
  isDefault = (): boolean => isDefaultView(this.view);

  /** `FixedBoardCamera` mounts/unmounts and reports the frame of its current canvas. */
  attach(): () => void {
    this.activeCount += 1;
    this.emit();
    return () => {
      this.activeCount -= 1;
      if (this.activeCount === 0) this.view = DEFAULT_BOARD_VIEW;
      this.emit();
    };
  }

  setFrame(frame: ViewFrame, worldPerPixelAtZoom1: number, reducedMotion: boolean): void {
    this.frame = frame;
    this.worldPerPixel = worldPerPixelAtZoom1;
    this.reducedMotion = reducedMotion;
    this.view = clampBoardView(this.view, frame);
    this.emit();
  }

  /** A change made by the player: applied at once, and it holds automatic focus off for a while. */
  setManual(view: BoardView, now: number = Date.now()): void {
    this.cancelAnimation();
    this.lastManualAt = now;
    this.view = clampBoardView(view, this.frame);
    this.emit();
  }

  zoomBy(factor: number, now: number = Date.now()): void {
    this.setManual(zoomAbout(this.view, factor, { x: 0, y: 0 }, this.worldPerPixel, this.frame), now);
  }

  panPixels(dx: number, dy: number, now: number = Date.now()): void {
    this.setManual(panByPixels(this.view, dx, dy, this.worldPerPixel, this.frame), now);
  }

  zoomAt(factor: number, anchor: { x: number; y: number }, now: number = Date.now()): void {
    this.setManual(zoomAbout(this.view, factor, anchor, this.worldPerPixel, this.frame), now);
  }

  /** Back to the overview (animated unless reduced motion is on). The reset counts as the player's own choice. */
  reset(now: number = Date.now()): void {
    this.lastManualAt = now;
    this.animateTo(DEFAULT_BOARD_VIEW, 280);
  }

  /** Whether the camera may move on its own: not right after the player touched it, and only if it is zoomed in. */
  canAutoFocus(now: number = Date.now()): boolean {
    return this.view.zoom > 1.15 && now - this.lastManualAt >= MANUAL_PRECEDENCE_MS;
  }

  /** Eases the pan toward a world point; a no-op when `canAutoFocus` is false. Returns whether it moved. */
  autoFocus(point: readonly [number, number, number], now: number = Date.now()): boolean {
    if (!this.canAutoFocus(now)) return false;
    this.animateTo(panToWorldPoint(this.view, point, this.frame), 450);
    return true;
  }

  private cancelAnimation(): void {
    if (this.animation && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.animation);
    this.animation = 0;
  }

  private animateTo(target: BoardView, durationMs: number): void {
    this.cancelAnimation();
    const goal = clampBoardView(target, this.frame);
    if (this.reducedMotion || durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
      this.view = goal;
      this.emit();
      return;
    }
    const from = this.view;
    const startedAt = performance.now();
    const step = (time: number) => {
      const t = Math.min(1, (time - startedAt) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      this.view = {
        zoom: from.zoom + (goal.zoom - from.zoom) * eased,
        panX: from.panX + (goal.panX - from.panX) * eased,
        panY: from.panY + (goal.panY - from.panY) * eased,
      };
      this.emit();
      this.animation = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.animation = requestAnimationFrame(step);
  }

  resetForTests(): void {
    this.cancelAnimation();
    this.view = DEFAULT_BOARD_VIEW;
    this.lastManualAt = Number.NEGATIVE_INFINITY;
    this.activeCount = 0;
    this.reducedMotion = false;
    this.emit();
  }
}

export const boardViewStore = new BoardViewStore();

/** Re-renders only for what the controls draw: whether a 3D board is there and whether the view differs from the overview. */
export function useBoardViewControls(): { active: boolean; changed: boolean; atMaxZoom: boolean; atMinZoom: boolean } {
  const active = useSyncExternalStore(boardViewStore.subscribe, boardViewStore.isActive, () => false);
  const changed = useSyncExternalStore(boardViewStore.subscribe, () => !boardViewStore.isDefault(), () => false);
  const atMax = useSyncExternalStore(boardViewStore.subscribe, () => boardViewStore.getView().zoom >= MAX_BOARD_ZOOM - 0.001, () => false);
  const atMin = useSyncExternalStore(boardViewStore.subscribe, () => boardViewStore.getView().zoom <= MIN_BOARD_ZOOM + 0.001, () => true);
  return { active, changed, atMaxZoom: atMax, atMinZoom: atMin };
}
