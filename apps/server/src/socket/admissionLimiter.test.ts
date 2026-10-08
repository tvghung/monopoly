import { describe, expect, it } from 'vitest';
import { ADMISSION_LIMITS, AdmissionLimiter, type AdmissionLimiterOptions } from './admissionLimiter.js';

function limiter(overrides: Partial<AdmissionLimiterOptions> = {}) {
  let now = 1_000_000;
  const instance = new AdmissionLimiter({
    windowMs: 60_000,
    perClientLimit: 3,
    globalLimit: 10,
    maxClients: 4,
    ...overrides,
    now: () => now,
  });
  return { instance, advance: (ms: number) => { now += ms; } };
}

describe('admission limiter', () => {
  it('admits a client up to its allowance, then limits only that client', () => {
    const { instance } = limiter();
    expect(['a', 'a', 'a', 'a'].map((client) => instance.attempt(client)))
      .toEqual(['ADMIT', 'ADMIT', 'ADMIT', 'CLIENT_LIMIT']);
    expect(instance.attempt('b')).toBe('ADMIT');
  });

  it('gives capacity back as the window slides, and a throttled client cannot extend its own block', () => {
    const { instance, advance } = limiter();
    for (let index = 0; index < 3; index += 1) expect(instance.attempt('a')).toBe('ADMIT');
    // Hammering while throttled records nothing, so the block ends one window after the admitted attempts.
    for (let elapsed = 0; elapsed < 59_000; elapsed += 1_000) {
      advance(1_000);
      expect(instance.attempt('a')).toBe('CLIENT_LIMIT');
    }
    advance(2_000);
    expect(instance.attempt('a')).toBe('ADMIT');
  });

  it('stops a flood spread over many clients at the process-wide backstop', () => {
    const { instance } = limiter({ perClientLimit: 3, globalLimit: 7, maxClients: 100 });
    const verdicts = Array.from({ length: 12 }, (_unused, index) => instance.attempt(`client-${String(index)}`));
    expect(verdicts.filter((verdict) => verdict === 'ADMIT')).toHaveLength(7);
    expect(verdicts.slice(7)).toEqual(Array(5).fill('GLOBAL_LIMIT'));
  });

  it('keeps one abusive client far below the process-wide backstop', () => {
    const { instance } = limiter({ perClientLimit: 3, globalLimit: 10, maxClients: 100 });
    for (let index = 0; index < 50; index += 1) instance.attempt('abuser');
    // Seven admissions of the global budget are still there for everyone else.
    const others = Array.from({ length: 7 }, (_unused, index) => instance.attempt(`other-${String(index)}`));
    expect(others).toEqual(Array(7).fill('ADMIT'));
  });

  it('keeps its state bounded however many distinct clients arrive', () => {
    const { instance } = limiter({ perClientLimit: 3, globalLimit: 1_000_000, maxClients: 8 });
    for (let index = 0; index < 10_000; index += 1) instance.attempt(`client-${String(index)}`);
    expect(instance.trackedClients).toBeLessThanOrEqual(9);
  });

  it('shares one overflow allowance once the table is full, so a key flood cannot grow memory or starve tracked clients', () => {
    const { instance } = limiter({ perClientLimit: 3, globalLimit: 1_000, maxClients: 2 });
    expect(instance.attempt('first')).toBe('ADMIT');
    expect(instance.attempt('second')).toBe('ADMIT');
    const overflow = Array.from({ length: 5 }, (_unused, index) => instance.attempt(`new-${String(index)}`));
    expect(overflow).toEqual(['ADMIT', 'ADMIT', 'ADMIT', 'CLIENT_LIMIT', 'CLIENT_LIMIT']);
    // Tracked clients keep their own allowance.
    expect(instance.attempt('first')).toBe('ADMIT');
  });

  it('forgets expired clients lazily', () => {
    const { instance, advance } = limiter({ maxClients: 100, globalLimit: 1_000 });
    for (let index = 0; index < 50; index += 1) instance.attempt(`client-${String(index)}`);
    expect(instance.trackedClients).toBe(50);
    advance(61_000);
    instance.attempt('late');
    expect(instance.trackedClients).toBe(1);
  });

  it('ships limits that fit a four-player lobby many times over', () => {
    expect(ADMISSION_LIMITS.perClientLimit).toBeGreaterThanOrEqual(4 * 4);
    expect(ADMISSION_LIMITS.globalLimit).toBeGreaterThan(ADMISSION_LIMITS.perClientLimit);
    expect(ADMISSION_LIMITS.maxClients * ADMISSION_LIMITS.perClientLimit).toBeLessThan(100_000);
  });
});
