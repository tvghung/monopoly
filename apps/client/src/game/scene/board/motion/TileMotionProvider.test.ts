import { describe, expect, it } from 'vitest';
import type { TileImpactSignal } from './tileMotionTypes';
import { getUnprocessedTileImpacts } from './TileMotionProvider';

const impact = (sequence: number, tileId: number, playerId = 'player-a'): TileImpactSignal => ({
  sequence,
  tileId,
  playerId,
  kind: 'STEP',
  delayMs: 0,
  depressDurationMs: 52,
  reboundDurationMs: 126,
});

describe('tile impact cursor', () => {
  it('processes each impact once and never replays an earlier sequence', () => {
    const impacts = [impact(1, 1), impact(2, 2)];

    expect(getUnprocessedTileImpacts(impacts, 0).map(item => item.sequence)).toEqual([1, 2]);
    expect(getUnprocessedTileImpacts(impacts, 1).map(item => item.sequence)).toEqual([2]);
    expect(getUnprocessedTileImpacts(impacts, 2)).toEqual([]);
  });

  it('keeps another player impact independent from a stationary player cursor', () => {
    const impacts = [impact(1, 4, 'player-b')];

    expect(getUnprocessedTileImpacts(impacts, 0)).toEqual(impacts);
    expect(getUnprocessedTileImpacts(impacts, 1)).toEqual([]);
  });
});
