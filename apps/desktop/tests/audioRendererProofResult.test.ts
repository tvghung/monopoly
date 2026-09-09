import { describe, expect, it } from 'vitest';
import { audioRendererProofExitCode } from '../src/audioRendererProofResult';

describe('packaged audio proof exit semantics', () => {
  it('returns success only for an explicit passing result', () => {
    expect(audioRendererProofExitCode({ pass: true, status: 'PASS C ASSETS PRESENT' })).toBe(0);
    expect(audioRendererProofExitCode({ pass: false, status: 'PENDING PRODUCTION ASSETS — PASS C' })).toBe(1);
  });
});
