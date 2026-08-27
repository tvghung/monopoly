import { useEffect, useState } from 'react';
import App from '../../App';
import { AudioProvider } from '../../audio/AudioProvider';
import { ToastProvider } from '../../components/Toast';
import { isRuntimeConfigLoadError } from '../../runtime/runtimeConfig';
import { SettingsProvider } from '../../settings/SettingsProvider';
import BootstrapErrorScreen, {
  type BootstrapErrorKind,
} from '../screens/BootstrapErrorScreen';
import LoadingScreen from '../screens/LoadingScreen';
import { bootstrap } from './bootstrap';
import type { BootStage, BootstrapResult } from './types';

interface BootstrapState {
  stage: BootStage;
  result: BootstrapResult | null;
  errorKind: BootstrapErrorKind | null;
}

const initialState: BootstrapState = {
  stage: 'loading-settings',
  result: null,
  errorKind: null,
};

function getBootstrapErrorKind(error: unknown): BootstrapErrorKind {
  return isRuntimeConfigLoadError(error)
    ? 'runtime-config'
    : 'bootstrap';
}

export default function AppBootstrap() {
  const [retryNumber, setRetryNumber] = useState(0);
  const [state, setState] = useState<BootstrapState>(initialState);

  useEffect(() => {
    let active = true;
    setState(initialState);
    void bootstrap(stage => {
      if (active) setState(current => ({ ...current, stage }));
    }).then(result => {
      if (active) setState({ stage: 'ready', result, errorKind: null });
      else result.socket.disconnect();
    }).catch(error => {
      if (!active) return;
      console.error('Own the Block bootstrap failed.', error);
      setState({
        stage: 'error',
        result: null,
        errorKind: getBootstrapErrorKind(error),
      });
    });
    return () => {
      active = false;
    };
  }, [retryNumber]);

  if (state.stage === 'error') {
    return (
      <BootstrapErrorScreen
        kind={state.errorKind ?? 'bootstrap'}
        onRetry={() => setRetryNumber(value => value + 1)}
      />
    );
  }
  if (state.stage === 'ready') {
    if (!state.result) {
      return (
        <BootstrapErrorScreen
          kind="bootstrap"
          onRetry={() => setRetryNumber(value => value + 1)}
        />
      );
    }
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

  return <LoadingScreen stage={state.stage} />;
}
