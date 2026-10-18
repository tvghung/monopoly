// Its own module on purpose: tests replace `webglSupport` wholesale, and the quality probe must keep working beside such a replacement.
export interface SharedWebGLProbe {
  /** A WebGL 2 context could be created. */
  supported: boolean;
  /** `MAX_TEXTURE_SIZE` of that context (of a WebGL 1 context when there is no WebGL 2), 0 when none could be created. */
  maxTextureSize: number;
}

let sharedProbe: SharedWebGLProbe | null = null;

/**
 * The one throwaway WebGL context of the page. Two callers need facts about the device before the board's own renderer exists
 * (is WebGL available, what is the texture limit `auto` graphics quality looks at), and each used to create a context of its own: on a
 * cold launch a context costs 130–330 ms of blocked main thread each. They share this one, created at most once.
 */
export function getSharedWebGLProbe(): SharedWebGLProbe {
  if (sharedProbe) return sharedProbe;
  const result: SharedWebGLProbe = { supported: false, maxTextureSize: 0 };
  if (typeof document !== 'undefined'
    && (typeof WebGL2RenderingContext !== 'undefined' || typeof WebGLRenderingContext !== 'undefined')) {
    try {
      const canvas = document.createElement('canvas');
      const webgl2 = canvas.getContext('webgl2');
      const context = webgl2 ?? canvas.getContext('webgl');
      result.supported = Boolean(webgl2);
      if (context) {
        const value: unknown = context.getParameter(context.MAX_TEXTURE_SIZE);
        result.maxTextureSize = typeof value === 'number' ? value : 0;
      }
    } catch {
      result.supported = false;
      result.maxTextureSize = 0;
    }
  }
  sharedProbe = result;
  return result;
}

/** For tests: forget the cached probe. */
export function resetSharedWebGLProbe(): void {
  sharedProbe = null;
}
