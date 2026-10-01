import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SURFACES } from './surfaceRegistry';

// A variable path keeps Vite from rewriting the URL into an asset reference.
const manifestPath = '../../../../../../e2e/visual/captures.ts';
const manifest = readFileSync(fileURLToPath(new URL(manifestPath, import.meta.url)), 'utf8');

function listed(name: string): string[] {
  const start = manifest.indexOf(`export const ${name} = [`);
  if (start === -1) throw new Error(`${name} is missing from the capture manifest`);
  const end = manifest.indexOf('] as const;', start);
  return [...manifest.slice(start, end).matchAll(/'([a-z0-9-]+)'/gu)].map(match => match[1]);
}

describe('capture manifest', () => {
  it('lists every Design Lab surface exactly once in PLAN04_SURFACES (and nothing else)', () => {
    const ids = listed('PLAN04_SURFACES');
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(SURFACES.map(surface => surface.id).sort());
  });

  it('keeps the baseline list a subset of the surfaces that still exist', () => {
    const known = new Set(SURFACES.map(surface => surface.id));
    for (const id of listed('PLAN04_BASELINE_SURFACES')) expect(known.has(id), id).toBe(true);
  });
});
