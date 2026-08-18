export type RendererMode = 'webgl' | 'legacy';

export function resolveInitialRendererMode(webglSupported: boolean): RendererMode {
  return webglSupported ? 'webgl' : 'legacy';
}
