import { describe, expect, it } from 'vitest';
import { PLAYER_COLOR_IDS } from '@monopoly/shared';
import { contrastRatio } from '../../../design-system/tokens/contrast';
import { OTB_PALETTE } from '../../../design-system/tokens/palette';
import { getActivityPlayerColor } from './activityPlayerColor';

describe('Journal player contrast', () => {
  it.each(PLAYER_COLOR_IDS)('%s is readable on both supported Journal surfaces', id => {
    const color = getActivityPlayerColor(id)!;
    for (const background of ['#ffffff', OTB_PALETTE['paper-50']]) expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(4.5);
    expect(getActivityPlayerColor(id.toUpperCase())).toBe(color);
  });
  it('keeps unknown colors ordinary and preserves distinct player hues', () => {
    expect(getActivityPlayerColor(undefined)).toBeUndefined();
    expect(getActivityPlayerColor('invalid')).toBeUndefined();
    expect(new Set(PLAYER_COLOR_IDS.map(getActivityPlayerColor)).size).toBe(PLAYER_COLOR_IDS.length);
  });
});
