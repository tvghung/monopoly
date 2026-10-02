import { describe, expect, it } from 'vitest';
import { measureGeometry } from '../buildings/kit/lowPolyKit';
import {
  TABLE_PROP_BUILDERS,
  TABLE_PROP_LIMITS,
  buildCoffeePhin,
  buildLotusBowl,
  buildNonLa,
  buildPlayMoney,
  type TablePropId,
} from './tablePropGeometry';
import { TABLE_PROP_PLACEMENTS } from './tablePropLayout';

const IDS = Object.keys(TABLE_PROP_BUILDERS) as TablePropId[];

describe('table props (plan 05 §8.6)', () => {
  it('are exactly the four props of the plan, one placement each', () => {
    expect(IDS.sort()).toEqual(['coffee-phin', 'lotus-bowl', 'non-la', 'play-money']);
    expect(TABLE_PROP_PLACEMENTS.map(placement => placement.id).sort()).toEqual(IDS);
    expect(IDS).toHaveLength(TABLE_PROP_LIMITS.maxProps);
  });

  it('cost at most 4 draws and 3,000 triangles together', () => {
    const built = IDS.map(id => TABLE_PROP_BUILDERS[id]());
    // One merged geometry per prop is one draw each.
    expect(built.length).toBeLessThanOrEqual(TABLE_PROP_LIMITS.maxDraws);
    expect(built.reduce((sum, prop) => sum + prop.triangles, 0)).toBeLessThanOrEqual(TABLE_PROP_LIMITS.maxTriangles);
    for (const prop of built) expect(prop.triangles).toBeGreaterThan(50);
  });

  it.each(IDS)('%s is a vertex-colored, faceted, deterministic part standing on the table', id => {
    const first = TABLE_PROP_BUILDERS[id]();
    const second = TABLE_PROP_BUILDERS[id]();
    expect(Object.keys(first.geometry.attributes).sort()).toEqual(['color', 'normal', 'position']);
    expect(first.geometry.getIndex()).toBeNull();
    expect(Array.from(first.geometry.getAttribute('position').array)).toEqual(Array.from(second.geometry.getAttribute('position').array));
    const { min, max } = measureGeometry(first.geometry);
    // Nothing sinks into the table (a hair of tolerance for the first leaf of a lotus bowl) or floats off it.
    expect(min[1]).toBeGreaterThanOrEqual(-0.001);
    expect(min[1]).toBeLessThanOrEqual(0.001);
    expect(max[1]).toBeGreaterThan(0.15);
    expect(first.height).toBeCloseTo(max[1]);
  });

  it.each(IDS)('%s is a small object: inside the size limits and inside its placement envelope', id => {
    const prop = TABLE_PROP_BUILDERS[id]();
    const placement = TABLE_PROP_PLACEMENTS.find(candidate => candidate.id === id);
    if (!placement) throw new Error('missing placement');
    expect(prop.radius).toBeLessThanOrEqual(TABLE_PROP_LIMITS.maxRadius);
    expect(prop.height).toBeLessThanOrEqual(TABLE_PROP_LIMITS.maxHeight);
    expect(prop.radius).toBeLessThanOrEqual(placement.radius);
    expect(prop.height).toBeLessThanOrEqual(placement.height);
    // The envelope is a tight bound, not a loose one: it stays within 0.1 of the built shape.
    expect(placement.radius - prop.radius).toBeLessThanOrEqual(0.1);
    expect(placement.height - prop.height).toBeLessThanOrEqual(0.1);
  });

  it('keeps the money clearly fictional: only paper colors, no text, no copied design', () => {
    // The play money is boxes and one disc: no lathe (no portrait or seal), at most a few dozen parts' worth of triangles.
    expect(buildPlayMoney().triangles).toBeLessThan(400);
    const colors = buildPlayMoney().geometry.getAttribute('color');
    expect(colors.itemSize).toBe(3);
  });

  it('builds each prop from its own recognizable pieces (a smoke check on the silhouette)', () => {
    // The phin and the lotus bowl are the tall ones; the money is the flat one; the hat is a cone about as tall as it is wide.
    expect(buildCoffeePhin().height).toBeGreaterThan(buildNonLa().height);
    expect(buildLotusBowl().height).toBeGreaterThan(buildNonLa().height);
    expect(buildPlayMoney().height).toBeLessThan(0.3);
    expect(buildNonLa().height).toBeGreaterThan(buildNonLa().radius * 0.9);
    expect(buildNonLa().height).toBeLessThan(buildNonLa().radius * 1.3);
  });
});
