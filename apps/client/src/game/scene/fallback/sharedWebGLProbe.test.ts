import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeRenderCapabilities } from '../render/renderQuality';
import { getSharedWebGLProbe, resetSharedWebGLProbe } from './webglProbe';
import { supportsWebGL } from './webglSupport';

beforeEach(() => {
  resetSharedWebGLProbe();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetSharedWebGLProbe();
});

function stubContext(webgl2: boolean, maxTextureSize = 16_384) {
  vi.stubGlobal('WebGL2RenderingContext', class {});
  const loseContext = vi.fn();
  const context = {
    MAX_TEXTURE_SIZE: 0x0d33,
    getParameter: vi.fn(() => maxTextureSize),
    getExtension: vi.fn(() => ({ loseContext })),
  };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(((kind: string) => (kind === 'webgl2' ? (webgl2 ? context : null) : context)) as never);
  return { getContext, loseContext };
}

describe('the shared WebGL probe', () => {
  it('shares and releases one support and Auto texture-limit context', () => {
    const { getContext, loseContext } = stubContext(true, 8_192);

    expect(supportsWebGL()).toBe(true);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(probeRenderCapabilities().maxTextureSize).toBe(8_192);
    expect(probeRenderCapabilities().maxTextureSize).toBe(8_192);
    expect(supportsWebGL()).toBe(true);

    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith('webgl2');
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('falls back when WebGL2 has a constructor but context creation is blocked', () => {
    const { loseContext } = stubContext(false);
    expect(supportsWebGL()).toBe(false);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
  it('reports no WebGL 2 but still reads the texture limit from a WebGL 1 context', () => {
    stubContext(false, 4_096);
    expect(getSharedWebGLProbe()).toEqual({ supported: false, maxTextureSize: 4_096 });
  });

  it('is empty where there is no WebGL at all (jsdom) and survives a throwing context', () => {
    vi.stubGlobal('WebGL2RenderingContext', undefined);
    vi.stubGlobal('WebGLRenderingContext', undefined);
    expect(getSharedWebGLProbe()).toEqual({ supported: false, maxTextureSize: 0 });

    resetSharedWebGLProbe();
    vi.stubGlobal('WebGL2RenderingContext', class {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('blocked'); });
    expect(getSharedWebGLProbe()).toEqual({ supported: false, maxTextureSize: 0 });
  });

  it('still probes a document that is not the page (a test double) on its own', () => {
    const getContext = vi.fn(() => ({}));
    const foreign = { createElement: () => ({ getContext }) };
    expect(supportsWebGL(foreign)).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });
});
