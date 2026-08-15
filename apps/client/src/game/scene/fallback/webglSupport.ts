export interface CanvasCapabilityDocument {
  defaultView?: { navigator?: { userAgent?: string } } | null;
  createElement: (tagName: string) => {
    getContext: (contextId: string) => unknown;
  };
}

export function supportsWebGL(
  ownerDocument: CanvasCapabilityDocument | undefined = typeof document === 'undefined' ? undefined : document,
): boolean {
  if (!ownerDocument) return false;
  const userAgent = ownerDocument.defaultView?.navigator?.userAgent;
  if (userAgent?.toLowerCase().includes('jsdom')) return false;
  try {
    const canvas = ownerDocument.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
