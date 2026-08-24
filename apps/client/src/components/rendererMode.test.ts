import { describe, expect, it } from 'vitest';
import { resolveInitialRendererMode } from './rendererMode';

describe('resolveInitialRendererMode', () => {
  it('selects WebGL when support is available', () => {
    expect(resolveInitialRendererMode(true)).toBe('webgl');
  });

  it('selects the legacy board when WebGL is unavailable', () => {
    expect(resolveInitialRendererMode(false)).toBe('legacy');
  });
});
