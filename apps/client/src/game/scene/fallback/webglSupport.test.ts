import { describe, expect, it } from 'vitest';
import { supportsWebGL } from './webglSupport';

describe('supportsWebGL', () => {
  it('returns false when the document is unavailable', () => {
    expect(supportsWebGL(undefined)).toBe(false);
  });

  it('accepts either WebGL2 or WebGL', () => {
    expect(supportsWebGL({
      createElement: () => ({
        getContext: (contextId: string) => contextId === 'webgl2' ? null : {},
      }),
    })).toBe(true);
  });

  it('returns false when both contexts are unavailable or probing throws', () => {
    expect(supportsWebGL({
      createElement: () => ({ getContext: () => null }),
    })).toBe(false);
    expect(supportsWebGL({
      createElement: () => ({ getContext: () => { throw new Error('unsupported'); } }),
    })).toBe(false);
  });

  it('skips probing when the browser exposes no WebGL context constructors', () => {
    let probeCount = 0;
    expect(supportsWebGL({
      defaultView: {},
      createElement: () => ({
        getContext: () => {
          probeCount += 1;
          return {};
        },
      }),
    })).toBe(false);
    expect(probeCount).toBe(0);
  });
});
