import { getSharedWebGLProbe } from './webglProbe';

export interface CanvasCapabilityDocument {
  defaultView?: {
    WebGL2RenderingContext?: unknown;
  } | null;
  createElement: (tagName: string) => {
    getContext: (contextId: string) => unknown;
  };
}

export function supportsWebGL(
  ownerDocument: CanvasCapabilityDocument | undefined = typeof document === 'undefined' ? undefined : document,
): boolean {
  if (!ownerDocument) return false;
  if (ownerDocument.defaultView
    && !ownerDocument.defaultView.WebGL2RenderingContext) return false;
  // A constructor can exist even where context creation is blocked. Probe once and release the
  // temporary context; the cached result is shared with explicit Auto quality resolution.
  if (typeof document !== 'undefined' && ownerDocument === document) return getSharedWebGLProbe().supported;
  try {
    const canvas = ownerDocument.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}
