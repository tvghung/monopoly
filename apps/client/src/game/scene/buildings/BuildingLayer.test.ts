import { describe, expect, it } from 'vitest';
import { presentationTiming } from '../../presentation/timings';
import {
  getHotelTransitionScales,
  getHousePopScale,
  getScaledConstructionBurstDuration,
  getSequentialHouseBuildSteps,
} from './BuildingLayer';

describe('BuildingLayer sequential construction', () => {
  it.each([1, 2, 3, 4])('adds %i house(s) in fixed indexes with a 125ms stagger', count => {
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

  it.each([0.75, 1, 1.5, 2])('derives each house step from the effective total duration at %sx', speed => {
    const baseTotal = presentationTiming.housePop + presentationTiming.houseStagger * 2;
    const effectiveTotal = baseTotal / speed;
    const steps = getSequentialHouseBuildSteps(0, 3, effectiveTotal);

    expect(steps).toHaveLength(3);
    steps.forEach((step, index) => {
      expect(step.houseIndex).toBe(index);
      expect(step.delayMs).toBeCloseTo(index * presentationTiming.houseStagger / speed);
      expect(step.durationMs).toBeCloseTo(presentationTiming.housePop / speed);
    });
    expect(getScaledConstructionBurstDuration(effectiveTotal, baseTotal))
      .toBeCloseTo(presentationTiming.buildPop / speed);
  });

  it('uses a single fast overshoot and settles without a second bounce', () => {
    expect(getHousePopScale(0)).toBe(0);
    expect(getHousePopScale(0.58)).toBeCloseTo(1.3);
    expect(getHousePopScale(1)).toBe(1);
    expect(getHousePopScale(0.8)).toBeGreaterThan(1);
    expect(getHousePopScale(0.95)).toBeLessThan(getHousePopScale(0.8));
  });

  it('keeps hotel transition in the requested quick compress/burst/settle range', () => {
    expect(getHotelTransitionScales(0).oldScale).toBe(1);
    expect(getHotelTransitionScales(0.15).hotelScale).toBe(0);
    expect(getHotelTransitionScales(0.15 + 0.85 * 0.62).hotelScale).toBeCloseTo(1.25);
    expect(getHotelTransitionScales(1).hotelScale).toBe(1);
    expect(getScaledConstructionBurstDuration(presentationTiming.hotelTransition, presentationTiming.hotelTransition))
      .toBe(presentationTiming.buildPop);
  });
});
