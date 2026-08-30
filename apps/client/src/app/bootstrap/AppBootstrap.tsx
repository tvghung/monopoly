import { useEffect, useState } from 'react';
import App from '../../App';
import { AudioProvider } from '../../audio/AudioProvider';
import DesktopMultiplayerLauncher from '../../components/DesktopMultiplayerLauncher';
import { ToastProvider } from '../../components/Toast';
import { getDesktopBridge } from '../../runtime/desktopBridge';
import { isRuntimeConfigLoadError, loadRuntimeConfig } from '../../runtime/runtimeConfig';
import type { DesktopLaunchSelection, RuntimeConfig } from '../../runtime/types';
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
  const [launch, setLaunch] = useState<DesktopLaunchSelection | null>(null);
  const [configuredRuntimeConfig, setConfiguredRuntimeConfig] = useState<RuntimeConfig | undefined>();
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [state, setState] = useState<BootstrapState>(initialState);
  const desktopBridge = getDesktopBridge();

  useEffect(() => {
    if (!desktopBridge) return undefined;
    let active = true;
    void loadRuntimeConfig().then(config => {
      if (active) setConfiguredRuntimeConfig(config);
    }).catch(error => {
      if (!active || isRuntimeConfigLoadError(error)
        && error.code === 'PACKAGED_SOCKET_URL_MISSING') return;
      if (active) setConfigurationError('Endpoint máy chủ đã cấu hình không khả dụng.');
    });
    return () => {
      active = false;
    };
  }, [desktopBridge]);

  useEffect(() => {
    if (desktopBridge && !launch) {
      setState(initialState);
      return undefined;
    }
    let active = true;
    setState(initialState);
    void bootstrap(stage => {
      if (active) setState(current => ({ ...current, stage }));
    }, launch ? { runtimeConfig: launch.runtimeConfig, launch } : undefined).then(result => {
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
  }, [desktopBridge, launch, retryNumber]);

  if (desktopBridge && !launch) {
    return (
      <DesktopMultiplayerLauncher
        configuredRuntimeConfig={configuredRuntimeConfig}
        configurationError={configurationError}
        onReady={setLaunch}
      />
    );
  }

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
            <App
              socket={state.result.socket}
              runtimeConfig={state.result.runtimeConfig}
              launch={state.result.launch}
              onExitToLauncher={() => setLaunch(null)}
            />
          </ToastProvider>
        </AudioProvider>
      </SettingsProvider>
    );
  }

  return <LoadingScreen stage={state.stage} />;
}
