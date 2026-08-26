import type { AppSocket } from '../../types';
import type { RuntimeConfig } from '../../runtime/types';
import type { GameSettings } from '../../settings/types';

export type BootStage =
  | 'loading-settings'
  | 'loading-runtime-config'
  | 'loading-assets'
  | 'initializing-client'
  | 'ready'
  | 'error';

export interface BootstrapProgress {
  stage: BootStage;
  loaded: number;
  total: number;
  failed: number;
  currentAssetId: string | null;
  currentAssetLabel: string | null;
}

export interface BootstrapResult {
  runtimeConfig: RuntimeConfig;
  socket: AppSocket;
  settings: GameSettings;
}

