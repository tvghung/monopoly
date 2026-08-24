import { describe, expect, it } from 'vitest';
import { TILE_SURFACE_CLEARANCE_Y, TILE_SURFACE_LOCAL_POSITION } from '../boardLayout';
import {
  DESTINATION_PREVIEW_EPSILON,
  DESTINATION_PREVIEW_FRAME_Y,
  DESTINATION_PREVIEW_PULSE_PERIOD_MS,
  DESTINATION_PREVIEW_SURFACE_Y,
  DESTINATION_PREVIEW_STATIC_EDGE_OPACITY,
  DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY,
  getDestinationPreviewOpacity,
} from './TileDestinationPreview';

describe('destination preview physical layering', () => {
  it('keeps the wash and frame above the canonical tile surface', () => {
    expect(DESTINATION_PREVIEW_EPSILON).toBeGreaterThan(0);
    expect(DESTINATION_PREVIEW_SURFACE_Y).toBeGreaterThan(TILE_SURFACE_LOCAL_POSITION[1]);
    expect(DESTINATION_PREVIEW_SURFACE_Y).toBeGreaterThan(TILE_SURFACE_CLEARANCE_Y);
    expect(DESTINATION_PREVIEW_FRAME_Y).toBeGreaterThan(DESTINATION_PREVIEW_SURFACE_Y);
  });

  it('uses a readable deterministic pulse instead of a strong/weak phase split', () => {
    const start = getDestinationPreviewOpacity(0);
    const quarter = getDestinationPreviewOpacity(DESTINATION_PREVIEW_PULSE_PERIOD_MS / 4);
    const half = getDestinationPreviewOpacity(DESTINATION_PREVIEW_PULSE_PERIOD_MS / 2);
    const repeat = getDestinationPreviewOpacity(DESTINATION_PREVIEW_PULSE_PERIOD_MS * 2 + 37);

    expect(start.surfaceOpacity).toBeGreaterThanOrEqual(0.12);
    expect(start.edgeOpacity).toBeGreaterThanOrEqual(0.42);
    expect(quarter.surfaceOpacity).toBeGreaterThan(start.surfaceOpacity);
    expect(quarter.edgeOpacity).toBeGreaterThan(start.edgeOpacity);
    expect(half.surfaceOpacity).toBeGreaterThanOrEqual(0.12);
    expect(half.surfaceOpacity).toBeCloseTo(0.37);
    expect(half.edgeOpacity).toBeCloseTo(0.88);
    expect(repeat).toEqual(getDestinationPreviewOpacity(37));
  });

  it('repeats a bright-dim-bright cycle across the normal walk window', () => {
    const dimStart = getDestinationPreviewOpacity(0);
    const bright = getDestinationPreviewOpacity(DESTINATION_PREVIEW_PULSE_PERIOD_MS / 2);
    const dimRepeat = getDestinationPreviewOpacity(DESTINATION_PREVIEW_PULSE_PERIOD_MS);

    expect(bright.surfaceOpacity).toBeGreaterThan(dimStart.surfaceOpacity * 2);
    expect(bright.edgeOpacity).toBeGreaterThan(dimStart.edgeOpacity * 1.8);
    expect(dimRepeat).toEqual(dimStart);
  });

  it('holds a restrained static wash under Reduced Motion', () => {
    expect(getDestinationPreviewOpacity(0, true)).toEqual({
      surfaceOpacity: DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY,
      edgeOpacity: DESTINATION_PREVIEW_STATIC_EDGE_OPACITY,
    });
    expect(getDestinationPreviewOpacity(300, true)).toEqual(
      getDestinationPreviewOpacity(0, true),
    );
  });
});
