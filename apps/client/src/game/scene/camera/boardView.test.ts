import { afterEach, describe, expect, it } from 'vitest';
import {
  boardViewStore, clampBoardView, DEFAULT_BOARD_VIEW, isDefaultView, MANUAL_PRECEDENCE_MS, MAX_BOARD_ZOOM,
  panByPixels, zoomAbout,
} from './boardView';

const frame = { halfWidth: 12, halfHeight: 6 };
const WPP = 0.02;

afterEach(() => boardViewStore.resetForTests());

describe('board view math', () => {
  it('keeps the zoom inside its range and gives the overview no pan', () => {
    expect(clampBoardView({ zoom: 0.2, panX: 5, panY: 5 }, frame)).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(clampBoardView({ zoom: 99, panX: 0, panY: 0 }, frame).zoom).toBe(MAX_BOARD_ZOOM);
    expect(clampBoardView({ zoom: Number.NaN, panX: Number.NaN, panY: 0 }, frame)).toEqual(DEFAULT_BOARD_VIEW);
  });

  it('never lets the window leave the framed table: the pan is bounded by what the zoom reveals', () => {
    const view = clampBoardView({ zoom: 2, panX: 1000, panY: -1000 }, frame);
    expect(view.panX).toBeCloseTo(6);
    expect(view.panY).toBeCloseTo(-3);
    const far = panByPixels({ zoom: 2, panX: 0, panY: 0 }, -1e6, 1e6, WPP, frame);
    expect(Math.abs(far.panX)).toBeLessThanOrEqual(6.0001);
    expect(Math.abs(far.panY)).toBeLessThanOrEqual(3.0001);
  });

  it('pans with the finger: dragging right moves the camera left, dragging down moves it up', () => {
    const view = panByPixels({ zoom: 2, panX: 0, panY: 0 }, 100, 50, WPP, frame);
    expect(view.panX).toBeCloseTo(-1);
    expect(view.panY).toBeCloseTo(0.5);
  });

  it('zooms about the anchor so the point under the fingers stays put', () => {
    const anchor = { x: 120, y: -60 };
    const next = zoomAbout({ zoom: 1, panX: 0, panY: 0 }, 2, anchor, WPP, { halfWidth: 100, halfHeight: 100 });
    // World point under the anchor before and after: pan + pixels * world-per-pixel(zoom), the y axis pointing up.
    const before = { x: anchor.x * WPP, y: -anchor.y * WPP };
    const after = { x: next.panX + anchor.x * WPP / next.zoom, y: next.panY - anchor.y * WPP / next.zoom };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('knows the overview', () => {
    expect(isDefaultView(DEFAULT_BOARD_VIEW)).toBe(true);
    expect(isDefaultView({ zoom: 1.2, panX: 0, panY: 0 })).toBe(false);
  });
});

describe('board view store', () => {
  it('lets the player zoom, pan and reset, and clears the controls state at the overview', () => {
    boardViewStore.setFrame(frame, WPP, true);
    boardViewStore.zoomBy(2, 1000);
    expect(boardViewStore.getView().zoom).toBe(2);
    expect(boardViewStore.isDefault()).toBe(false);
    boardViewStore.reset(2000);
    expect(boardViewStore.getView()).toEqual(DEFAULT_BOARD_VIEW);
    expect(boardViewStore.isDefault()).toBe(true);
  });

  it('does not move the camera on its own at the overview, or right after a manual change, or without being asked', () => {
    boardViewStore.setFrame(frame, WPP, true);
    const tile: readonly [number, number, number] = [4, 0, 4];
    expect(boardViewStore.autoFocus(tile, 0)).toBe(false);
    expect(boardViewStore.getView()).toEqual(DEFAULT_BOARD_VIEW);

    boardViewStore.zoomBy(2, 10_000);
    const view = boardViewStore.getView();
    expect(boardViewStore.autoFocus(tile, 10_000 + MANUAL_PRECEDENCE_MS - 1)).toBe(false);
    expect(boardViewStore.getView()).toEqual(view);
  });

  it('follows a token once the player has left the camera alone, and respects the pan limits', () => {
    boardViewStore.setFrame(frame, WPP, true);
    boardViewStore.zoomBy(2, 10_000);
    expect(boardViewStore.autoFocus([4, 0, 4], 10_000 + MANUAL_PRECEDENCE_MS)).toBe(true);
    const view = boardViewStore.getView();
    expect(view.zoom).toBe(2);
    expect(Math.abs(view.panX)).toBeLessThanOrEqual(6.0001);
    expect(Math.abs(view.panY)).toBeLessThanOrEqual(3.0001);
    expect(view.panX !== 0 || view.panY !== 0).toBe(true);
  });

  it('counts the reset as the player\'s own choice and keeps the view when the 3D board goes away', () => {
    boardViewStore.setFrame(frame, WPP, true);
    const detach = boardViewStore.attach();
    expect(boardViewStore.isActive()).toBe(true);
    boardViewStore.zoomBy(3, 0);
    detach();
    expect(boardViewStore.isActive()).toBe(false);
    expect(boardViewStore.getView()).toEqual(DEFAULT_BOARD_VIEW);
  });
});
