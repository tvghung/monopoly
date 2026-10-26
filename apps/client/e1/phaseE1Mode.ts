import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    e1Mode: 'characterization' | 'regression';
  }
}

/** E1 must be selected explicitly; a missing mode must never hide correctness failures. */
export function isCorrectnessRegression(): boolean {
  const mode = inject('e1Mode');
  if (mode !== 'characterization' && mode !== 'regression') {
    throw new Error('Run E1 with node scripts/tests/runPhaseE1.mjs --mode characterization|regression');
  }
  return mode === 'regression';
}
