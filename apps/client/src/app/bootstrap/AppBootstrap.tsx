import { useEffect, useState } from 'react';
import App from '../../App';
import { AudioProvider } from '../../audio/AudioProvider';
import { ToastProvider } from '../../components/Toast';
import { SettingsProvider } from '../../settings/SettingsProvider';
import BootstrapErrorScreen from '../screens/BootstrapErrorScreen';
import LoadingScreen from '../screens/LoadingScreen';
import { bootstrap } from './bootstrap';
import { getSafeAssetReadinessMessage } from './assetReadiness';
import type { BootStage, BootstrapProgress, BootstrapResult } from './types';

interface BootstrapState {
  stage: BootStage;
  result: BootstrapResult | null;
  error: string | null;
  progress: BootstrapProgress;
}

const initialState: BootstrapState = {
  stage: 'loading-settings',
  result: null,
  error: null,
  progress: {
    stage: 'loading-settings',
    loaded: 0,
    total: 0,
    failed: 0,
    currentAssetId: null,
    currentAssetLabel: null,
  },
};

export default function AppBootstrap() {
  const [retryNumber, setRetryNumber] = useState(0);
  const [state, setState] = useState<BootstrapState>(initialState);

  useEffect(() => {
    let active = true;
    setState(initialState);
    void bootstrap(progress => {
      if (active) setState(current => ({
        ...current,
        stage: progress.stage,
        progress,
      }));
    }).then(result => {
      if (active) setState({
        stage: 'ready',
        result,
        error: null,
        progress: { ...initialState.progress, stage: 'ready' },
      });
      else result.socket.disconnect();
    }).catch(error => {
      if (!active) return;
      console.error('Own the Block bootstrap failed.', error);
      setState({
        stage: 'error',
        result: null,
        error: getSafeAssetReadinessMessage(error),
        progress: { ...initialState.progress, stage: 'error' },
      });
    });
    return () => {
      active = false;
    };
  }, [retryNumber]);

  if (state.stage === 'error') {
    return <BootstrapErrorScreen error={state.error ?? 'Không rõ lỗi khởi động.'} onRetry={() => setRetryNumber(value => value + 1)} />;
  }
  if (state.stage === 'ready') {
    if (!state.result) return <BootstrapErrorScreen error="Không có dữ liệu khởi động." onRetry={() => setRetryNumber(value => value + 1)} />;
    return (
      <SettingsProvider initialSettings={state.result.settings}>
        <AudioProvider>
          <ToastProvider>
            <App socket={state.result.socket} runtimeConfig={state.result.runtimeConfig} />
          </ToastProvider>
        </AudioProvider>
      </SettingsProvider>
    );
  }

  return <LoadingScreen stage={state.stage} progress={state.progress} />;
}
