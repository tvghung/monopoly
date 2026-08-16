import { describe, expect, it } from 'vitest';
import { CENTER_DECORATION_MESH_COUNT, CENTER_DECORATION_THEME } from './BoardCenterDecoration';
import { boardVisualTokens } from './boardVisualTokens';

describe('board center decoration budget', () => {
  it('stays within the lightweight Phase 2 mesh budget', () => {
    expect(CENTER_DECORATION_MESH_COUNT).toBeLessThanOrEqual(6);
    expect(CENTER_DECORATION_THEME).toBe('airport');
    expect(boardVisualTokens.airportCenterMark).toBe('#c96a63');
  });
});
