import { describe, expect, it } from 'vitest';
import { OUTER_BOARD_SIZE } from '../board/boardLayout';
import {
  BANK_TRANSFER_Y,
  PLAYER_STATION_BOARD_GAP,
  PLAYER_STATION_CENTER_OFFSET,
  PLAYER_STATION_DEPTH,
  PLAYER_STATION_TRANSFER_Y,
  PLAYER_STATION_WORLD_ANCHORS,
  resolveMoneyEndpointAnchor,
  resolveStationTransferAmount,
} from './stationWorld';

describe('world-space player stations', () => {
  it('places all four stations at the physical edge centers with a positive board gap', () => {
    expect(PLAYER_STATION_WORLD_ANCHORS).toEqual({
      BOTTOM: [0, 0, PLAYER_STATION_CENTER_OFFSET],
      TOP: [0, 0, -PLAYER_STATION_CENTER_OFFSET],
      LEFT: [-PLAYER_STATION_CENTER_OFFSET, 0, 0],
      RIGHT: [PLAYER_STATION_CENTER_OFFSET, 0, 0],
    });
    expect(PLAYER_STATION_BOARD_GAP).toBeCloseTo(
      PLAYER_STATION_CENTER_OFFSET - OUTER_BOARD_SIZE / 2 - PLAYER_STATION_DEPTH / 2,
    );
    expect(PLAYER_STATION_BOARD_GAP).toBeGreaterThan(0.4);
  });

  it('resolves BANK and player transfer endpoints at their visible coin heights', () => {
    const anchors = new Map([['player-a', PLAYER_STATION_WORLD_ANCHORS.BOTTOM]]);
    expect(resolveMoneyEndpointAnchor({ kind: 'BANK' }, anchors)?.[1]).toBe(BANK_TRANSFER_Y);
    expect(resolveMoneyEndpointAnchor({ kind: 'PLAYER', playerId: 'player-a' }, anchors))
      .toEqual([0, PLAYER_STATION_TRANSFER_Y, PLAYER_STATION_CENTER_OFFSET]);
    expect(resolveMoneyEndpointAnchor({ kind: 'PLAYER', playerId: 'missing' }, anchors)).toBeNull();
  });

  it('derives exact signed station amounts from typed endpoints only', () => {
    const transfer = {
      id: 'transfer',
      sequence: 1,
      source: { kind: 'PLAYER' as const, playerId: 'player-a' },
      destination: { kind: 'PLAYER' as const, playerId: 'player-b' },
      amount: 240,
      reason: 'RENT' as const,
      coinCount: 4,
      durationMs: 1_300,
    };
    expect(resolveStationTransferAmount('player-a', transfer)).toBe(-240);
    expect(resolveStationTransferAmount('player-b', transfer)).toBe(240);
    expect(resolveStationTransferAmount('player-c', transfer)).toBeNull();
  });
});
