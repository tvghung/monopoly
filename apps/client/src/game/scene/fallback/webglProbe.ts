// Its own module on purpose: tests replace `webglSupport` wholesale, and the quality probe must keep working beside such a replacement.
export interface SharedWebGLProbe {
  /** A WebGL 2 context could be created. */
  supported: boolean;
  /** `MAX_TEXTURE_SIZE` of that context (of a WebGL 1 context when there is no WebGL 2), 0 when none could be created. */
  maxTextureSize: number;
}

let sharedProbe: SharedWebGLProbe | null = null;

/**
 * WebGL support must be tested with a real temporary context; explicit Auto also uses its cached texture limit.
 * Release the context after reading these facts. Fixed tiers need no additional quality probe.
 */
export function getSharedWebGLProbe(): SharedWebGLProbe {
  if (sharedProbe) return sharedProbe;
  const result: SharedWebGLProbe = { supported: false, maxTextureSize: 0 };
  if (typeof document !== 'undefined'
    && (typeof WebGL2RenderingContext !== 'undefined' || typeof WebGLRenderingContext !== 'undefined')) {
    let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      const canvas = document.createElement('canvas');
      const webgl2 = canvas.getContext('webgl2');
      context = webgl2 ?? canvas.getContext('webgl');
      result.supported = Boolean(webgl2);
      if (context) {
        const value: unknown = context.getParameter(context.MAX_TEXTURE_SIZE);
        result.maxTextureSize = typeof value === 'number' ? value : 0;
      }
    } catch {
      result.supported = false;
      result.maxTextureSize = 0;
    } finally {
      // The cached number needs no live GPU context.
      try {
        context?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // An unavailable extension or a failed renderer must not block the fallback.
      }
    }
  }
  sharedProbe = result;
  return result;
}

/** For tests: forget the cached probe. */
export function resetSharedWebGLProbe(): void {
  sharedProbe = null;
}
