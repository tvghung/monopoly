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
  try {
    const canvas = ownerDocument.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}
