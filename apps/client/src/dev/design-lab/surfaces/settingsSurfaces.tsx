import { useEffect, type ReactNode } from 'react';
import type { OwnTheBlockDesktopBridge } from '../../../runtime/types';
import { DEFAULT_GAME_SETTINGS } from '../../../settings/defaults';
import SettingsPanel from '../../../settings/SettingsPanel';
import { noop, SurfaceProviders, type SurfaceFixture } from './surfaceKit';

/** A bridge that only knows the window calls the settings dialog makes; every other call resolves to nothing. */
function makeDesktopBridge(): OwnTheBlockDesktopBridge {
  const windowState = { fullscreen: false, maximized: false, resizable: true };
  return {
    getRuntimeConfig: () => Promise.reject(new Error('Not available in the Design Lab.')),
    window: {
      getState: () => Promise.resolve(windowState),
      setFullscreen: () => Promise.resolve(),
      toggleFullscreen: () => Promise.resolve(),
      onFullscreenChanged: () => noop,
    },
    quit: { onQuitRequested: () => noop, respond: noop },
    openExternal: () => Promise.resolve(),
  };
}

/** Keeps the pretend Electron bridge installed while the surface is mounted and removes it afterwards. */
function DesktopBridgeLifetime({ bridge, children }: { bridge: OwnTheBlockDesktopBridge; children: ReactNode }) {
  useEffect(() => {
    window.ownTheBlockDesktop = bridge;
    return () => {
      if (window.ownTheBlockDesktop === bridge) delete window.ownTheBlockDesktop;
    };
  }, [bridge]);
  return children;
}

/** The settings dialog (plan 04 T04.10). */
export const SETTINGS_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'settings',
    label: 'Settings',
    group: 'Settings',
    render: () => (
      <SurfaceProviders>
        <SettingsPanel open onClose={noop} />
      </SurfaceProviders>
    ),
  },
  {
    id: 'settings-desktop',
    label: 'Settings (desktop: window section)',
    group: 'Settings',
    render: () => {
      // The settings provider and the dialog read `window.ownTheBlockDesktop` while rendering, so it has to exist before
      // the first render; the wrapper removes it again when the surface unmounts.
      const bridge = makeDesktopBridge();
      window.ownTheBlockDesktop = bridge;
      return (
        <DesktopBridgeLifetime bridge={bridge}>
          <SurfaceProviders>
            <SettingsPanel open onClose={noop} />
          </SurfaceProviders>
        </DesktopBridgeLifetime>
      );
    },
  },
  {
    id: 'settings-reduced-motion',
    label: 'Settings (reduced motion on)',
    group: 'Settings',
    render: () => (
      <SurfaceProviders settings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion: true, animationSpeed: 1.5 }}>
        <SettingsPanel open onClose={noop} />
      </SurfaceProviders>
    ),
  },
];
