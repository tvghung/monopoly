import { describe, expect, it } from 'vitest';
import { presentationTiming } from '../../presentation/timings';
import { getSequentialHouseBuildSteps } from './BuildingLayer';

describe('BuildingLayer sequential construction', () => {
  it.each([1, 2, 3, 4])('adds %i house(s) in fixed indexes with a 190ms stagger', count => {
    expect(getSequentialHouseBuildSteps(0, count)).toEqual(
      Array.from({ length: count }, (_, index) => ({
        houseIndex: index,
        delayMs: index * presentationTiming.houseStagger,
        durationMs: presentationTiming.housePop,
      })),
    );
  });

  it('keeps existing house indexes stable and animates only additions', () => {
    expect(getSequentialHouseBuildSteps(2, 4)).toEqual([
      { houseIndex: 2, delayMs: 0, durationMs: presentationTiming.housePop },
      { houseIndex: 3, delayMs: presentationTiming.houseStagger, durationMs: presentationTiming.housePop },
    ]);
    expect(getSequentialHouseBuildSteps(4, 2)).toEqual([]);
  });
});
