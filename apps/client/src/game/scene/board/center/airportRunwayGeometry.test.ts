import { describe, expect, it } from 'vitest';
import { INNER_SIDE_BOUNDARY } from '../boardLayout';
import { boardVisualTokens } from '../boardVisualTokens';
import {
  AIRPORT_FIELD_SIZE,
  AIRPORT_RUNWAY_DASH_LENGTH,
  AIRPORT_RUNWAY_DASH_WIDTH,
  AIRPORT_RUNWAY_INNER_HALF_SIZE,
  AIRPORT_RUNWAY_OLD_WIDTH,
  AIRPORT_RUNWAY_OUTER_HALF_SIZE,
  AIRPORT_RUNWAY_WIDTH,
  createAirportRunwayLoopGeometry,
  createAirportRunwayLoopShape,
  getAirportRunwayDashSpecs,
} from './airportRunwayGeometry';

describe('continuous airport runway geometry', () => {
  it('uses one rectangular ring with correct outer bounds and an open inner field', () => {
    const shape = createAirportRunwayLoopShape();
    const geometry = createAirportRunwayLoopGeometry();
    expect(AIRPORT_RUNWAY_WIDTH).toBeGreaterThan(AIRPORT_RUNWAY_OLD_WIDTH);
    expect(AIRPORT_RUNWAY_OUTER_HALF_SIZE).toBeLessThan(AIRPORT_FIELD_SIZE / 2);
    expect(AIRPORT_RUNWAY_OUTER_HALF_SIZE).toBeLessThan(INNER_SIDE_BOUNDARY);
    expect(AIRPORT_RUNWAY_INNER_HALF_SIZE).toBeGreaterThan(0);
    expect(shape.curves).toHaveLength(4);
    expect(shape.holes).toHaveLength(1);
    expect(shape.holes[0].curves).toHaveLength(4);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
    geometry.dispose();
  });

  it('connects all four asphalt sides through one loop and leaves corners to the ring', () => {
    const specs = getAirportRunwayDashSpecs();
    expect(new Set(specs.map(spec => spec.side))).toEqual(new Set(['BOTTOM', 'LEFT', 'TOP', 'RIGHT']));
    expect(specs.filter(spec => spec.side === 'BOTTOM')).toHaveLength(specs.filter(spec => spec.side === 'TOP').length);
    expect(specs.filter(spec => spec.side === 'LEFT')).toHaveLength(specs.filter(spec => spec.side === 'RIGHT').length);
    specs.forEach(spec => {
      expect(spec.size[0] === AIRPORT_RUNWAY_DASH_LENGTH || spec.size[0] === AIRPORT_RUNWAY_DASH_WIDTH).toBe(true);
      expect(spec.size[1] === AIRPORT_RUNWAY_DASH_LENGTH || spec.size[1] === AIRPORT_RUNWAY_DASH_WIDTH).toBe(true);
    });
    expect(boardVisualTokens.airportRunway).toBe('#59616b');
    expect(boardVisualTokens.airportMarking).toBe('#ffffff');
  });
});
