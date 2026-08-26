import { createSocket } from '../../network/createSocket';
import { loadRuntimeConfig } from '../../runtime/runtimeConfig';
import { readGameSettings } from '../../settings/storage';
import {
  DEFERRED_ASSET_INVENTORY,
  GLOBAL_ASSET_INVENTORY,
  preloadAssetPlan,
  type AssetPreloadReport,
  type AssetProgress,
} from './assetReadiness';
import type { BootstrapProgress, BootstrapResult } from './types';

export type BootstrapProgressListener = (progress: BootstrapProgress) => void;

function emptyProgress(stage: BootstrapProgress['stage']): BootstrapProgress {
  return {
    stage,
    loaded: 0,
    total: 0,
    failed: 0,
    currentAssetId: null,
    currentAssetLabel: null,
  };
}

function reportAssetFailures(scope: string, report: AssetPreloadReport): void {
  report.failures.forEach(failure => {
    console.warn(`${scope} asset did not load; using its declared fallback.`, {
      assetId: failure.id,
      classification: failure.classification,
      cause: failure.cause,
    });
  });
}

export async function preloadCriticalAssets(
  onProgress?: (progress: AssetProgress) => void,
): Promise<AssetPreloadReport> {
  return preloadAssetPlan(GLOBAL_ASSET_INVENTORY, { onProgress });
}

function startDeferredAssetLoading(): void {
  void preloadAssetPlan(DEFERRED_ASSET_INVENTORY).then(report => {
    reportAssetFailures('Deferred', report);
    report.release();
  }, error => {
    console.warn('Deferred asset loading stopped unexpectedly.', error);
  });
}

export async function bootstrap(onProgress?: BootstrapProgressListener): Promise<BootstrapResult> {
  onProgress?.(emptyProgress('loading-settings'));
  const settings = readGameSettings();

  onProgress?.(emptyProgress('loading-runtime-config'));
  const runtimeConfig = await loadRuntimeConfig();

  onProgress?.(emptyProgress('loading-assets'));
  const criticalReport = await preloadCriticalAssets(progress => {
    onProgress?.({ ...progress, stage: 'loading-assets' });
  });
  reportAssetFailures('Critical global', criticalReport);
  criticalReport.release();

  onProgress?.(emptyProgress('initializing-client'));
  const socket = createSocket(runtimeConfig);
  onProgress?.(emptyProgress('ready'));
  startDeferredAssetLoading();

  return { runtimeConfig, socket, settings };
}

