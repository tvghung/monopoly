import { describe, expect, it } from 'vitest';
import type {
  DevelopmentChangeSignal, GoCrossingSignal, OwnershipChangeSignal,
} from '../../../presentation/store/types';
import { presentationTiming } from '../../../presentation/timings';
import { getTileActionFeedback, TILE_ACTION_FEEDBACK_DWELL_MS } from './TileActionFeedback';

function ownership(overrides: Partial<OwnershipChangeSignal> = {}): OwnershipChangeSignal {
  return {
    id: 'ownership',
    sequence: 1,
    consequenceOrder: 1,
    tileId: 1,
    fromPlayerId: null,
    toPlayerId: 'player-a',
    durationMs: presentationTiming.propertyPurchase,
    ...overrides,
  };
}

function development(overrides: Partial<DevelopmentChangeSignal> = {}): DevelopmentChangeSignal {
  return {
    id: 'development',
    sequence: 1,
    consequenceOrder: 2,
    tileId: 1,
    playerId: 'player-a',
    fromHouses: 0,
    toHouses: 1,
    delta: 1,
    direction: 'UP',
    durationMs: presentationTiming.buildPop,
    ...overrides,
  };
}

function go(overrides: Partial<GoCrossingSignal> = {}): GoCrossingSignal {
  return {
    id: 'go',
    sequence: 1,
    consequenceOrder: 3,
    playerId: 'player-a',
    fromTileId: 39,
    toTileId: 0,
    durationMs: presentationTiming.landing,
    ...overrides,
  };
}

describe('TileActionFeedback', () => {
  it('uses concise ownership copy for acquire, transfer, and release', () => {
    expect(getTileActionFeedback(ownership(), undefined, undefined, 'red')?.value).toBe('Nhận chủ');
    expect(getTileActionFeedback(
      ownership({ fromPlayerId: 'player-b' }),
      undefined,
      undefined,
      'red',
    )?.value).toBe('Đổi chủ');
    expect(getTileActionFeedback(
      ownership({ toPlayerId: null }),
      undefined,
      undefined,
      undefined,
    )?.value).toBe('Trả chủ');
  });

  it('uses concise development copy for increases, decreases, and hotel changes', () => {
    expect(getTileActionFeedback(undefined, development(), undefined, undefined)?.value).toBe('+1 Nhà');
    expect(getTileActionFeedback(undefined, development({ fromHouses: 2, toHouses: 1, delta: -1, direction: 'DOWN' }), undefined, undefined)?.value)
      .toBe('-1 Nhà');
    expect(getTileActionFeedback(undefined, development({ fromHouses: 4, toHouses: 5, delta: 1 }), undefined, undefined)?.value)
      .toBe('Khách sạn');
    expect(getTileActionFeedback(undefined, development({ fromHouses: 5, toHouses: 4, delta: -1, direction: 'DOWN' }), undefined, undefined)?.value)
      .toBe('Hạ khách sạn');
  });

  it('chooses the newest cross-family consequence instead of unrelated family sequence', () => {
    expect(getTileActionFeedback(
      ownership({ sequence: 99, consequenceOrder: 1 }),
      development({ sequence: 1, consequenceOrder: 2 }),
      undefined,
      'red',
    )?.value).toBe('+1 Nhà');
    expect(getTileActionFeedback(
      ownership({ sequence: 1, consequenceOrder: 2 }),
      development({ sequence: 99, consequenceOrder: 1 }),
      undefined,
      'red',
    )?.value).toBe('Nhận chủ');
    expect(getTileActionFeedback(
      ownership({ consequenceOrder: 1 }),
      undefined,
      go({ consequenceOrder: 2 }),
      'red',
    )?.value).toBe('Qua Xuất Phát');
    expect(getTileActionFeedback(
      ownership({ consequenceOrder: 3 }),
      undefined,
      go({ consequenceOrder: 2 }),
      'red',
    )?.value).toBe('Nhận chủ');
  });

  it('keeps semantic feedback readable independently of reduced-motion duration', () => {
    expect(TILE_ACTION_FEEDBACK_DWELL_MS).toBe(presentationTiming.feedbackDwell);
    expect(TILE_ACTION_FEEDBACK_DWELL_MS).toBeGreaterThanOrEqual(700);
    expect(TILE_ACTION_FEEDBACK_DWELL_MS).toBeLessThanOrEqual(1000);
  });
});
