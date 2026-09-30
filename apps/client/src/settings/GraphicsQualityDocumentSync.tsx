import { useEffect } from 'react';
import { probeRenderCapabilities, resolveRenderTier } from '../game/scene/render/renderQuality';
import { useSettings } from './selectors';

/**
 * Mirrors the resolved graphics tier onto `<html data-graphics-quality>` so CSS can react to it (the
 * paper grain of plan 01 is switched off in the `low` tier).
 */
export function GraphicsQualityDocumentSync() {
  const { settings } = useSettings();
  const setting = settings.graphicsQuality;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.graphicsQuality = resolveRenderTier(setting, probeRenderCapabilities());
    return () => {
      delete root.dataset.graphicsQuality;
    };
  }, [setting]);

  return null;
}
