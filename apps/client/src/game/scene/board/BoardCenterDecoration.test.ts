import { describe, expect, it } from 'vitest';
import { CENTER_DECORATION_MESH_COUNT, CENTER_DECORATION_THEME } from './BoardCenterDecoration';

describe('board center decoration budget', () => {
  it('stays within the lightweight Phase 2 mesh budget', () => {
    expect(CENTER_DECORATION_MESH_COUNT).toBeLessThanOrEqual(6);
    expect(CENTER_DECORATION_THEME).toBe('airport');
  });
});
