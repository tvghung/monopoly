import { useEffect, useState } from 'react';
import App from '../../App';
import { AudioProvider } from '../../audio/AudioProvider';
import DesktopMultiplayerLauncher from '../../components/DesktopMultiplayerLauncher';
import { ToastProvider } from '../../components/Toast';
import UpdateSessionNotice from '../../components/update/UpdateSessionNotice';
import { AppUpdateProvider } from '../../runtime/appUpdate';
import { getDesktopBridge } from '../../runtime/desktopBridge';
import { isRuntimeConfigLoadError, loadRuntimeConfig } from '../../runtime/runtimeConfig';
import type { DesktopLaunchSelection, RuntimeConfig } from '../../runtime/types';
import BootstrapErrorScreen, {
  type BootstrapErrorKind,
} from '../screens/BootstrapErrorScreen';
import LoadingScreen from '../screens/LoadingScreen';
import { bootstrap } from './bootstrap';
import type { BootStage, BootstrapResult } from './types';
import { useTranslation } from '../../i18n/I18n';

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

/**
 * The updater's state lives above everything the player moves between (the start screen, the lobby, the game): a "Để sau"
 * pressed on the start screen is still remembered when the player comes back to it, and the game knows it is in a session.
 */
export default function AppBootstrap() {
  const [launch, setLaunch] = useState<DesktopLaunchSelection | null>(null);
  return (
    <AppUpdateProvider inSession={launch !== null}>
      <AppBootstrapScreens launch={launch} onLaunchChange={setLaunch} />
    </AppUpdateProvider>
  );
}

interface AppBootstrapScreensProps {
  launch: DesktopLaunchSelection | null;
  onLaunchChange: (launch: DesktopLaunchSelection | null) => void;
}

function AppBootstrapScreens({ launch, onLaunchChange }: AppBootstrapScreensProps) {
  const [retryNumber, setRetryNumber] = useState(0);
  const [configuredRuntimeConfig, setConfiguredRuntimeConfig] = useState<RuntimeConfig | undefined>();
  const [configurationError, setConfigurationError] = useState(false);
  const [state, setState] = useState<BootstrapState>(initialState);
  const desktopBridge = getDesktopBridge();
  const { t } = useTranslation();

  useEffect(() => {
    if (!desktopBridge) return undefined;
    let active = true;
    void loadRuntimeConfig().then(config => {
      if (active && config.socketUrl) setConfiguredRuntimeConfig(config);
    }).catch(() => {
      if (!active) return;
      setConfigurationError(true);
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
    // Settings and language state are owned at renderer root. No audio provider is mounted here: nothing plays on the start screen.
    return (
      <DesktopMultiplayerLauncher
        configuredRuntimeConfig={configuredRuntimeConfig}
        configurationError={configurationError ? t('launcher.configurationError') : null}
        onReady={onLaunchChange}
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
      <AudioProvider>
        <ToastProvider>
          <App
            socket={state.result.socket}
            runtimeConfig={state.result.runtimeConfig}
            launch={state.result.launch}
            onExitToLauncher={() => onLaunchChange(null)}
          />
          <UpdateSessionNotice />
        </ToastProvider>
      </AudioProvider>
    );
  }

  return <LoadingScreen stage={state.stage} />;
}
