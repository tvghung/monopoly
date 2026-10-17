import { describe, expect, it } from 'vitest';
import { shareStructurally } from './shareStructurally';

describe('shareStructurally', () => {
  it('returns the previous value when the contents are equal', () => {
    const previous = { a: 1, list: [{ id: 1 }, { id: 2 }], nested: { x: 'y' } };
    const next = { a: 1, list: [{ id: 1 }, { id: 2 }], nested: { x: 'y' } };
    expect(shareStructurally(previous, next)).toBe(previous);
  });

  it('keeps the unchanged parts of a changed value and replaces only the changed ones', () => {
    const previous = { tiles: [{ id: 1, houses: 0 }, { id: 2, houses: 0 }], dice: { a: 1, b: 2 } };
    const next = { tiles: [{ id: 1, houses: 0 }, { id: 2, houses: 1 }], dice: { a: 1, b: 2 } };
    const shared = shareStructurally(previous, next);
    expect(shared).not.toBe(previous);
    expect(shared).toEqual(next);
    expect(shared.tiles).not.toBe(previous.tiles);
    expect(shared.tiles[0]).toBe(previous.tiles[0]);
    expect(shared.tiles[1]).toEqual(next.tiles[1]);
    expect(shared.tiles[1]).not.toBe(previous.tiles[1]);
    expect(shared.dice).toBe(previous.dice);
  });

  it('treats a different length, a new key and a removed key as a change', () => {
    expect(shareStructurally([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(shareStructurally([1, 2, 3], [1, 2])).toEqual([1, 2]);
    expect(shareStructurally({ a: 1 } as Record<string, number>, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(shareStructurally({ a: 1, b: 2 } as Record<string, number>, { a: 1 })).toEqual({ a: 1 });
  });

  it('never returns something that differs in content from the next value', () => {
    const previous = { a: [1, 2, { b: null as number | null }], c: 'x' };
    const next = { a: [1, 2, { b: 4 as number | null }], c: 'y' };
    expect(shareStructurally(previous, next)).toEqual(next);
    expect(shareStructurally(next, previous)).toEqual(previous);
  });

  it('compares non-plain values by identity and never takes them apart', () => {
    const left = new Map([[1, 'a']]);
    const right = new Map([[1, 'a']]);
    expect(shareStructurally({ map: left }, { map: right }).map).toBe(right);
    const same = { map: left };
    expect(shareStructurally(same, { map: left })).toBe(same);
  });

  it('distinguishes undefined from a missing key and null from undefined', () => {
    expect(shareStructurally({ a: undefined } as Record<string, unknown>, {})).toEqual({});
    expect(shareStructurally({ a: null } as Record<string, unknown>, { a: undefined })).toEqual({ a: undefined });
  });
});
