import { useEffect, useState, type ReactNode } from 'react';
import DesktopMultiplayerLauncher from '../../../components/DesktopMultiplayerLauncher';
import JoinForm from '../../../components/JoinForm';
import { HowToPlayProvider } from '../../../howToPlay/HowToPlayProvider';
import type {
  HostRuntimeStatus,
  OwnTheBlockDesktopBridge,
  RuntimeConfig,
} from '../../../runtime/types';
import {
  noop, SurfaceProviders, SurfaceSettingsProvider, type SurfaceFixture,
} from './surfaceKit';

/** The landing page and the desktop launcher (plan 04 T04.11 and T04.12). */

const LAB_HOST_STATUS: HostRuntimeStatus = {
  state: 'IDLE',
  platform: 'win32',
  appVersion: '3.0.0',
  gamePort: null,
  localEndpoint: null,
  lanAvailable: true,
  interfaces: [
    {
      name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15', netmask: '255.255.255.0', preference: 'preferred', rank: 0,
    },
    {
      name: 'Ethernet', displayName: 'Ethernet', address: '10.0.0.8', netmask: '255.255.255.0', preference: 'fallback', rank: 1,
    },
  ],
  advertisedEndpoints: [],
  selectedLanUrl: null,
};

const LAB_HOSTING_STATUS: HostRuntimeStatus = {
  ...LAB_HOST_STATUS,
  state: 'HOSTING',
  gamePort: 53120,
  localEndpoint: 'http://127.0.0.1:53120',
  advertisedEndpoints: ['http://192.168.1.15:53120'],
  selectedLanUrl: 'http://192.168.1.15:53120',
};

const LAB_CONFIGURED_CONFIG: RuntimeConfig = {
  target: 'desktop',
  socketUrl: 'http://192.168.1.15:8080',
  platform: 'win32',
  appVersion: '3.0.0',
};

/** The Electron bridge as the launcher sees it, answering every call from a fixed status and doing nothing else. */
function makeLabBridge(status: HostRuntimeStatus): OwnTheBlockDesktopBridge {
  const result = { ok: true as const, status };
  return {
    getRuntimeConfig: () => Promise.resolve({
      ok: true as const,
      config: { target: 'desktop' as const, platform: status.platform, appVersion: status.appVersion },
    }),
    window: {
      getState: () => Promise.resolve({ fullscreen: false, maximized: false, resizable: true }),
      setFullscreen: () => Promise.resolve(),
      toggleFullscreen: () => Promise.resolve(),
      onFullscreenChanged: () => noop,
    },
    // "Thoát" is drawn but the lab never closes anything: the call resolves and the page stays.
    quit: { onQuitRequested: () => noop, respond: noop, exitApp: () => Promise.resolve() },
    openExternal: () => Promise.resolve(),
    host: {
      getStatus: () => Promise.resolve(status),
      start: () => Promise.resolve(result),
      stop: () => Promise.resolve(result),
      refreshNetwork: () => Promise.resolve(status),
      onStatusChanged: () => noop,
    },
    // The lab never searches a real network: a search ends at once with "not found".
    lan: { findRoom: () => Promise.resolve({ ok: false as const, code: 'NOT_FOUND' as const }) },
  };
}

/**
 * The launcher reads `window.ownTheBlockDesktop` while it renders, so the stub is installed before the first render of
 * the children and removed when the surface unmounts. The effect installs it again for a StrictMode remount.
 */
function DesktopBridgeStub({ status, children }: { status: HostRuntimeStatus; children: ReactNode }) {
  const [bridge] = useState(() => {
    const created = makeLabBridge(status);
    window.ownTheBlockDesktop = created;
    return created;
  });
  useEffect(() => {
    window.ownTheBlockDesktop = bridge;
    return () => { delete window.ownTheBlockDesktop; };
  }, [bridge]);
  return children;
}

/**
 * The launcher sits outside the audio and toast providers in production, so no `SurfaceProviders` here. It has two providers
 * above it: how-to-play (it wraps the whole app at the root) and settings (`AppBootstrap` lifts it to the start screen so
 * "Cài đặt" works). Both are supplied, so the capture shows every button the real screen has.
 */
function launcher(
  props: Partial<Parameters<typeof DesktopMultiplayerLauncher>[0]> = {},
  status: HostRuntimeStatus = LAB_HOST_STATUS,
) {
  return (
    <HowToPlayProvider>
      <DesktopBridgeStub status={status}>
        <SurfaceSettingsProvider>
          <DesktopMultiplayerLauncher
            configuredRuntimeConfig={LAB_CONFIGURED_CONFIG}
            onReady={noop}
            {...props}
          />
        </SurfaceSettingsProvider>
      </DesktopBridgeStub>
    </HowToPlayProvider>
  );
}

export const ENTRY_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'landing',
    label: 'Landing',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy={false} connected error={null} />
      </SurfaceProviders>
    ),
  },
  {
    id: 'landing-prefilled',
    label: 'Landing, room code from a link, connecting',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy={false} connected={false} error="Không thể vào phòng. Hãy thử lại." initialRoomCode="GAME-1234" />
      </SurfaceProviders>
    ),
  },
  {
    id: 'landing-desktop-failed',
    label: 'Landing in the desktop app, room not found (name and code kept, "Quay lại" to the start screen)',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm
          onJoin={noop}
          onBack={noop}
          busy={false}
          connected
          error="Không tìm thấy phòng hoặc dữ liệu được yêu cầu."
          initialName="Minh"
          initialRoomCode="OTB-ABC234"
        />
      </SurfaceProviders>
    ),
  },
  {
    id: 'landing-public',
    label: 'Landing, public room selected',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy={false} connected error={null} initialMode="public" />
      </SurfaceProviders>
    ),
  },
  {
    id: 'landing-busy',
    label: 'Landing, joining',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy connected error={null} initialRoomCode="GAME-1234" />
      </SurfaceProviders>
    ),
  },
  {
    id: 'launcher',
    label: 'Desktop launcher, choices',
    group: 'Pre-game',
    render: () => launcher(),
  },
  {
    id: 'launcher-running',
    label: 'Desktop launcher, host already running',
    group: 'Pre-game',
    render: () => launcher({}, LAB_HOSTING_STATUS),
  },
  {
    id: 'launcher-host',
    label: 'Desktop launcher, host form',
    group: 'Pre-game',
    render: () => launcher({ initialMode: 'host' }),
  },
  {
    id: 'launcher-join',
    label: 'Desktop launcher, join form (name and room code)',
    group: 'Pre-game',
    render: () => launcher({ initialMode: 'join' }),
  },
  {
    id: 'launcher-join-failed',
    label: 'Desktop launcher, room not found (invitation link offered)',
    group: 'Pre-game',
    render: () => launcher({
      initialMode: 'join',
      initialJoin: { name: 'Minh', roomCode: 'OTB-ABC234', failure: 'NOT_FOUND' },
    }),
  },
];
