import { createContext, useContext } from 'react';
import { RENDER_QUALITY_CONFIGS, type RenderQualityConfig } from './renderQuality';

/**
 * The resolved graphics tier for everything inside the Canvas. The provider is mounted inside the
 * Canvas (React context does not cross the R3F reconciler), so scene layers read the tier with
 * `useRenderQuality()` instead of touching the settings layer.
 */
export const RenderQualityContext = createContext<RenderQualityConfig>(RENDER_QUALITY_CONFIGS.balanced);

export function useRenderQuality(): RenderQualityConfig {
  return useContext(RenderQualityContext);
}
