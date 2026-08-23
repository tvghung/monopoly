import { describe, expect, it } from 'vitest';
import { TILE_SURFACE_CLEARANCE_Y, TILE_SURFACE_LOCAL_POSITION } from '../boardLayout';
import {
  DESTINATION_PREVIEW_EPSILON,
  DESTINATION_PREVIEW_FRAME_Y,
  DESTINATION_PREVIEW_SURFACE_Y,
} from './TileDestinationPreview';

describe('destination preview physical layering', () => {
  it('keeps the wash and frame above the canonical tile surface', () => {
    expect(DESTINATION_PREVIEW_EPSILON).toBeGreaterThan(0);
    expect(DESTINATION_PREVIEW_SURFACE_Y).toBeGreaterThan(TILE_SURFACE_LOCAL_POSITION[1]);
    expect(DESTINATION_PREVIEW_SURFACE_Y).toBeGreaterThan(TILE_SURFACE_CLEARANCE_Y);
    expect(DESTINATION_PREVIEW_FRAME_Y).toBeGreaterThan(DESTINATION_PREVIEW_SURFACE_Y);
  });
});
