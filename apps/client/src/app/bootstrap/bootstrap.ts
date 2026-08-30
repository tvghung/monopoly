import { createSocket } from '../../network/createSocket';
import { loadRuntimeConfig } from '../../runtime/runtimeConfig';
import { readGameSettings } from '../../settings/storage';
import type { BootStage, BootstrapResult } from './types';
import type { DesktopLaunchSelection, RuntimeConfig } from '../../runtime/types';

type StageListener = (stage: BootStage) => void;

export interface BootstrapOptions {
  runtimeConfig?: RuntimeConfig;
  launch?: DesktopLaunchSelection;
}

async function preloadCriticalAssets(): Promise<void> {
  if (typeof document === 'undefined') return;
  const assetUrls = ['/favicon.svg'];
  await Promise.all(assetUrls.map(async url => {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) return;
      await response.blob();
    } catch {
      // Branding is helpful but must not make a playable session unavailable.
    }
  }));
}

export async function bootstrap(
  onStage?: StageListener,
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  onStage?.('loading-settings');
  const settings = readGameSettings();

  onStage?.('loading-runtime-config');
  const runtimeConfig = options.runtimeConfig ?? await loadRuntimeConfig();

  onStage?.('loading-assets');
  await preloadCriticalAssets();

  onStage?.('initializing-client');
  const socket = createSocket(runtimeConfig);
  onStage?.('ready');

  return { runtimeConfig, socket, settings, launch: options.launch };
}

