import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DesktopMultiplayerLauncher from './DesktopMultiplayerLauncher';
import { HowToPlayProvider } from '../howToPlay/HowToPlayProvider';
import { SETTINGS_STORAGE_KEY } from '../settings/defaults';
import { SettingsProvider } from '../settings/SettingsProvider';
import type {
  DesktopLaunchSelection,
  HostRuntimeErrorCode,
  HostRuntimeStatus,
  LanFindRoomResult,
  OwnTheBlockDesktopBridge,
} from '../runtime/types';

const status: HostRuntimeStatus = {
  state: 'IDLE',
  platform: 'win32',
  appVersion: '3.0.0',
  gamePort: null,
  localEndpoint: null,
  lanAvailable: false,
  interfaces: [{
    name: 'Wi-Fi',
    displayName: 'Wi-Fi',
    address: '192.168.1.15',
    netmask: '255.255.255.0',
    preference: 'preferred',
    rank: 0,
  }],
  advertisedEndpoints: [],
  selectedLanUrl: null,
};

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('DesktopMultiplayerLauncher', () => {
  it('keeps the configured endpoint visible and scopes the launch to its room', () => {
    const onReady = vi.fn();
    window.ownTheBlockDesktop = {} as OwnTheBlockDesktopBridge;

    render(
      <DesktopMultiplayerLauncher
        configuredRuntimeConfig={{
          target: 'desktop',
          socketUrl: 'http://192.168.1.15:8080',
          platform: 'darwin',
          appVersion: '3.0.0',
        }}
        onReady={onReady}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Máy chủ riêng' }));
    expect(screen.getByText('http://192.168.1.15:8080')).toBeTruthy();
    expect(screen.getByLabelText('Mã phòng')).toBeTruthy();
    expect(screen.queryByLabelText('Địa chỉ máy chủ LAN')).toBeNull();
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'lan-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));

    expect(onReady).toHaveBeenCalledWith({
      runtimeConfig: {
        target: 'desktop',
        socketUrl: 'http://192.168.1.15:8080',
        platform: 'darwin',
        appVersion: '3.0.0',
      },
      initialJoin: { name: 'Ada', roomCode: 'LAN-1234' },
      targetRoomCode: 'LAN-1234',
      hosting: false,
    });
  });

  it('uses one room code for hosted admission and reconnect lookup', async () => {
    const onReady = vi.fn();
    const hostStatus: HostRuntimeStatus = {
      ...status,
      state: 'HOSTING',
      gamePort: 8080,
      localEndpoint: 'http://127.0.0.1:8080',
      lanAvailable: true,
      advertisedEndpoints: ['http://192.168.1.15:8080'],
      selectedLanUrl: 'http://192.168.1.15:8080',
    };
    const start = vi.fn(() => Promise.resolve({ ok: true as const, status: hostStatus,
      hostCapability: 'a'.repeat(64) }));
    window.ownTheBlockDesktop = {
      host: {
        getStatus: vi.fn(() => Promise.resolve(status)),
        start,
        stop: vi.fn(() => Promise.resolve({ ok: true as const, status })),
        refreshNetwork: vi.fn(() => Promise.resolve(status)),
        onStatusChanged: vi.fn(() => () => undefined),
      },
    } as unknown as OwnTheBlockDesktopBridge;

    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    const submit = screen.getByRole('button', { name: 'Tạo và vào phòng' });
    await waitFor(() => expect(submit.getAttribute('disabled')).toBeNull());
    fireEvent.click(submit);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    const selection = onReady.mock.calls[0]?.[0] as DesktopLaunchSelection;
    expect(selection.initialJoin?.roomCode).toBe(selection.targetRoomCode);
    expect(selection.initialJoin?.hostCapability).toBe('a'.repeat(64));
    expect(selection.hosting).toBe(true);
    // The main process gets a mode and room code, never an address or port.
    expect(start).toHaveBeenCalledWith({ mode: 'ONLINE', roomCode: selection.targetRoomCode });
  });
});

const hostingStatus: HostRuntimeStatus = {
  ...status,
  state: 'HOSTING',
  gamePort: 8080,
  localEndpoint: 'http://127.0.0.1:8080',
  lanAvailable: true,
  advertisedEndpoints: ['http://192.168.1.15:8080'],
  selectedLanUrl: 'http://192.168.1.15:8080',
};

type FindRoom = (roomCode: string) => Promise<LanFindRoomResult>;

function installHostBridge(current: HostRuntimeStatus, findRoom?: FindRoom, exitApp?: () => Promise<void>) {
  const host = {
    getStatus: vi.fn(() => Promise.resolve(current)),
    start: vi.fn(),
    stop: vi.fn(() => Promise.resolve({ ok: true as const, status })),
    refreshNetwork: vi.fn(() => Promise.resolve(current)),
    onStatusChanged: vi.fn(() => () => undefined),
  };
  const lan = findRoom ? { findRoom: vi.fn(findRoom) } : undefined;
  // The settings provider reads the window group; the quit group is what "Thoát" calls.
  const windowGroup = {
    getState: vi.fn(),
    setFullscreen: vi.fn(() => Promise.resolve()),
    toggleFullscreen: vi.fn(() => Promise.resolve()),
    onFullscreenChanged: vi.fn(() => () => undefined),
  };
  const quit = {
    onQuitRequested: vi.fn(() => () => undefined),
    respond: vi.fn(),
    ...(exitApp ? { exitApp: vi.fn(exitApp) } : {}),
  };
  window.ownTheBlockDesktop = {
    host, window: windowGroup, quit, ...(lan ? { lan } : {}),
  } as unknown as OwnTheBlockDesktopBridge;
  return {
    host, lan, quit, windowGroup,
  };
}

// A variable path keeps Vite from rewriting the URL into an asset reference.
const entrySharedCssPath = './style/EntryShared.css';
const entrySharedCss = readFileSync(fileURLToPath(new URL(entrySharedCssPath, import.meta.url)), 'utf8');

const configuredRuntimeConfig = {
  target: 'desktop' as const,
  socketUrl: 'http://192.168.1.15:8080',
  platform: 'win32' as const,
  appVersion: '3.0.0',
};

/** Text that players do not read or understand: addresses, ports, protocols, databases and networks by their trade names. */
const TECHNICAL_TEXT = /IPv4|IPv6|địa chỉ|cổng|Ethernet|cơ sở dữ liệu|máy chủ LAN|liên kết mời chỉ chứa|phiên kết nối/iu;

describe('DesktopMultiplayerLauncher choices', () => {
  const menuLabels = (container: HTMLElement) => [...container.querySelectorAll('.desktop-launcher__menu button')]
    .map(button => button.textContent ?? '');

  it('is a menu of buttons: "Tạo phòng" and "Tham gia phòng", and not a sentence under either', () => {
    installHostBridge(status);

    const { container } = render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'OWN THE BLOCK' })).toBeTruthy();
    // The game's name is the one heading: no second title, no "Chơi nhiều người" / LAN line and no separate brand line.
    expect(screen.queryByText(/Chơi nhiều người|Chơi qua mạng LAN|Play over LAN/u)).toBeNull();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('.desktop-launcher__brand')).toBeNull();
    expect(menuLabels(container)).toEqual(['Tạo phòng', 'Tham gia phòng']);
    expect(screen.queryByText(/trên máy này|Tham gia phòng LAN|Host Game|Join Game/u)).toBeNull();
    // Nothing explains a button: the menu holds buttons only, and the screen has no subtitle or footer line.
    expect(container.querySelectorAll('.desktop-launcher__menu :not(button, button *)')).toHaveLength(0);
    expect(container.querySelector('.desktop-launcher__subtitle, .desktop-launcher__security, .desktop-launcher__choice-text')).toBeNull();
    expect(container.querySelectorAll('p:not([aria-hidden])')).toHaveLength(0);
    // The glyphs are decoration: the label names the button.
    for (const icon of container.querySelectorAll('.desktop-launcher__menu .ds-button__icon')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('keeps every button a real, focusable button of at least 44 px and relies on the shared focus ring', () => {
    installHostBridge(status, undefined, () => Promise.resolve());

    const { container } = render(
      <SettingsProvider>
        <DesktopMultiplayerLauncher configuredRuntimeConfig={configuredRuntimeConfig} onReady={vi.fn()} />
      </SettingsProvider>,
    );

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.desktop-launcher__menu button')];
    expect(buttons.map(button => button.textContent)).toEqual(['Tạo phòng', 'Tham gia phòng', 'Máy chủ riêng', 'Cài đặt', 'Tiếng Việt', 'Thoát']);
    for (const button of buttons) {
      expect(button.tabIndex).toBe(0);
      expect(button.disabled).toBe(false);
      expect(button.className).toMatch(/ds-button--(md|lg|xl)\b/u);
    }
    // 44 px is the floor of every size but `sm`, which the menu never uses; the ring is drawn by the shared button style.
    const buttonCssPath = '../design-system/components/Button/Button.css';
    const buttonCss = readFileSync(fileURLToPath(new URL(buttonCssPath, import.meta.url)), 'utf8');
    expect(buttonCss).toContain('.ds-button:focus-visible');
    expect(buttonCss).toMatch(/\.ds-button \{[^}]*min-height: 2\.75rem/u);
  });

  it('puts the how-to-play key beside the menu (in the column, not in the title) and opens the guide from it', () => {
    installHostBridge(status);

    const { container } = render(<HowToPlayProvider><DesktopMultiplayerLauncher onReady={vi.fn()} /></HowToPlayProvider>);

    const key = screen.getByRole('button', { name: 'Hướng dẫn chơi' });
    expect(key.closest('.desktop-launcher__content')).toBeTruthy();
    expect(key.closest('.desktop-launcher__header')).toBeNull();
    // It comes after the menu in the tab order, so the first stop is a way to play.
    const order = [...container.querySelectorAll('button')];
    expect(order.indexOf(key as HTMLButtonElement)).toBe(order.length - 1);
    fireEvent.click(key);
    expect(screen.getByRole('dialog', { name: 'Hướng dẫn chơi' })).toBeTruthy();
  });

  it('has no how-to-play key where no guide can open (an isolated render)', () => {
    installHostBridge(status);

    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Hướng dẫn chơi' })).toBeNull();
  });

  it('draws the picture as decoration only: hidden, empty alt text, no title, no words', () => {
    installHostBridge(status);

    const { container } = render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    const scene = container.querySelector('.launcher-scene');
    expect(scene?.getAttribute('aria-hidden')).toBe('true');
    const images = [...(scene?.querySelectorAll('img') ?? [])];
    // Eight mascots on their board and five landmark postcards.
    expect(images).toHaveLength(13);
    for (const image of images) {
      expect(image.getAttribute('alt')).toBe('');
      expect(image.hasAttribute('title')).toBe(false);
    }
    expect(scene?.textContent).toBe('');
    expect(scene?.querySelectorAll('[title], a, button, input')).toHaveLength(0);
    expect(images.filter(image => /\/art\/landmarks\/\d+\.svg$/u.test(image.getAttribute('src') ?? ''))).toHaveLength(5);
  });

  it('puts the picture on the right and the menu on the left, and stops its entrance under reduced motion', () => {
    const cssPath = './style/DesktopMultiplayerLauncher.css';
    const css = readFileSync(fileURLToPath(new URL(cssPath, import.meta.url)), 'utf8');
    const scenePath = './style/LauncherScene.css';
    const sceneCss = readFileSync(fileURLToPath(new URL(scenePath, import.meta.url)), 'utf8');

    // The column keeps to the start side (a gutter from the start edge, a fixed width) and the art is end-aligned.
    expect(css).toMatch(/\.desktop-launcher__content \{[^}]*margin-inline-start: var\(--launcher-gutter\)/u);
    expect(sceneCss).toMatch(/\.launcher-scene \{[^}]*justify-content: flex-end/u);
    // Every animation sits behind the reduced-motion guard, for the operating system and for the game setting.
    for (const source of [css, sceneCss]) {
      const guardStart = source.indexOf('@media (prefers-reduced-motion: no-preference)');
      expect(guardStart).toBeGreaterThan(0);
      expect(source.slice(guardStart)).toContain(":root:not([data-reduced-motion='true'])");
      expect(source.slice(0, guardStart)).not.toMatch(/animation:/u);
      expect(source).not.toMatch(/\binfinite\b/u);
    }
  });

  it('keeps the screen free of technical text', async () => {
    installHostBridge(hostingStatus, undefined, () => Promise.resolve());

    const { container } = render(
      <SettingsProvider>
        <DesktopMultiplayerLauncher configuredRuntimeConfig={configuredRuntimeConfig} onReady={vi.fn()} />
      </SettingsProvider>,
    );
    await screen.findByRole('button', { name: 'Vào lại phòng đang mở' });

    expect(screen.queryByText(/Một máy Host giữ phòng/u)).toBeNull();
    expect(screen.queryByText(/Liên kết mời chỉ chứa/u)).toBeNull();
    expect(screen.queryByText(/phiên kết nối|cơ sở dữ liệu/u)).toBeNull();
    expect(menuLabels(container)).toEqual([
      'Vào lại phòng đang mở', 'Đóng phòng', 'Tạo phòng', 'Tham gia phòng', 'Máy chủ riêng', 'Cài đặt', 'Tiếng Việt', 'Thoát',
    ]);
    for (const label of menuLabels(container)) expect(label).not.toMatch(TECHNICAL_TEXT);
    expect(container.querySelector('.desktop-launcher__subtitle, .desktop-launcher__security')).toBeNull();
  });

  it('offers the configured server as another choice only when one is configured', () => {
    installHostBridge(status);
    const { unmount } = render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Máy chủ riêng' })).toBeNull();
    unmount();

    render(<DesktopMultiplayerLauncher configuredRuntimeConfig={configuredRuntimeConfig} onReady={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Máy chủ riêng' })).toBeTruthy();
  });

  it('goes back into a room that is still open, or closes it', async () => {
    const onReady = vi.fn();
    const { host } = installHostBridge(hostingStatus);
    render(<DesktopMultiplayerLauncher onReady={onReady} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Vào lại phòng đang mở' }));
    expect(onReady).toHaveBeenCalledWith({
      runtimeConfig: {
        target: 'desktop', socketUrl: 'http://127.0.0.1:8080', platform: 'win32', appVersion: '3.0.0',
      },
      hosting: true,
      connectionMode: 'LAN',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Đóng phòng' }));
    await waitFor(() => expect(host.stop).toHaveBeenCalledOnce());
  });

  it('shows a configuration error from the bootstrap as an alert', () => {
    installHostBridge(status);

    render(<DesktopMultiplayerLauncher configurationError="Không thể đọc cấu hình máy chủ." onReady={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toBe('Không thể đọc cấu hình máy chủ.');
  });
});

describe('DesktopMultiplayerLauncher "Cài đặt"', () => {
  const stored = () => JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Record<string, unknown>;

  it('is absent where no settings can be kept (an isolated render with no provider)', () => {
    installHostBridge(status);

    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Cài đặt' })).toBeNull();
  });

  it('opens the settings dialog from the menu and keeps a change exactly as the game does', async () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, masterVolume: 0.4, graphicsQuality: 'low' }));
    installHostBridge(status);
    render(
      <SettingsProvider>
        <DesktopMultiplayerLauncher onReady={vi.fn()} />
      </SettingsProvider>,
    );

    const open = screen.getByRole('button', { name: 'Cài đặt' });
    expect(screen.queryByRole('dialog', { name: 'Cài đặt' })).toBeNull();
    // A click does not move focus in jsdom; a player's does, and the dialog hands focus back to the button it came from.
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Cài đặt' });

    // The dialog opens on what was saved, not on the defaults.
    expect(within(dialog).getByLabelText('Âm lượng tổng')).toHaveProperty('value', '0.4');
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Giảm chuyển động' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Cân bằng' }));

    // Written to the storage that `bootstrap()` reads when the player goes on, so the game starts with it.
    await waitFor(() => expect(stored()).toMatchObject({ reducedMotion: true, graphicsQuality: 'balanced', masterVolume: 0.4 }));
    expect(document.documentElement.dataset.reducedMotion).toBe('true');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Xong' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cài đặt' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(open));
  });

  it('starts no audio: no audio provider is needed and no sound is requested', () => {
    const audio = vi.fn();
    vi.stubGlobal('Audio', audio);
    installHostBridge(status);

    render(
      <SettingsProvider>
        <DesktopMultiplayerLauncher onReady={vi.fn()} />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));

    expect(audio).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('DesktopMultiplayerLauncher "Thoát"', () => {
  it('is absent when the bridge cannot quit (a plain browser, a stub, an older bridge)', () => {
    installHostBridge(status);

    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Thoát' })).toBeNull();
  });

  it('quits at once when no room is open on this machine', async () => {
    const { quit } = installHostBridge(status, undefined, () => Promise.resolve());
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    await settleStatus();

    fireEvent.click(screen.getByRole('button', { name: 'Thoát' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(quit.exitApp).toHaveBeenCalledExactlyOnceWith();
    const busy = await screen.findByRole<HTMLButtonElement>('button', { name: 'Đang thoát…' });
    expect(busy.disabled).toBe(true);
  });

  it.each(['HOSTING', 'READY', 'STARTING_SERVER'] as const)(
    'asks first when a room is open (%s), and quits only after the player agrees',
    async state => {
      const { quit } = installHostBridge({ ...hostingStatus, state }, undefined, () => Promise.resolve());
      render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
      await settleStatus();

      fireEvent.click(screen.getByRole('button', { name: 'Thoát' }));

      const dialog = screen.getByRole('alertdialog', { name: 'Đóng phòng và thoát game?' });
      expect(within(dialog).getByText(/Phòng của bạn sẽ đóng lại/u)).toBeTruthy();
      expect(dialog.textContent ?? '').not.toMatch(TECHNICAL_TEXT);
      expect(quit.exitApp).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng phòng và thoát' }));

      await waitFor(() => expect(quit.exitApp).toHaveBeenCalledExactlyOnceWith());
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    },
  );

  it('stays when the player answers "Ở lại"', async () => {
    const { quit } = installHostBridge(hostingStatus, undefined, () => Promise.resolve());
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    await settleStatus();
    const open = screen.getByRole('button', { name: 'Thoát' });
    open.focus();
    fireEvent.click(open);

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ở lại' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(quit.exitApp).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(open));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Thoát' }).disabled).toBe(false);
  });

  it('does not ask when the machine only knows an idle or failed room runtime', async () => {
    for (const state of ['IDLE', 'FAILED'] as const) {
      const { quit } = installHostBridge({ ...status, state }, undefined, () => Promise.resolve());
      const { unmount } = render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
      await settleStatus();

      fireEvent.click(screen.getByRole('button', { name: 'Thoát' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(quit.exitApp).toHaveBeenCalledOnce();
      unmount();
    }
  });

  it('says so in plain words and lets the player try again when quitting fails', async () => {
    installHostBridge(status, undefined, () => Promise.reject(new Error('ipc closed')));
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    await settleStatus();

    fireEvent.click(screen.getByRole('button', { name: 'Thoát' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Chưa thoát được game. Hãy thử lại.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Thoát' }).disabled).toBe(false);
  });

  it('gives the button back if the window is somehow still open a while after quitting was accepted', async () => {
    vi.useFakeTimers();
    installHostBridge(status, undefined, () => Promise.resolve());
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole('button', { name: 'Thoát' }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đang thoát…' }).disabled).toBe(true);

    act(() => { vi.advanceTimersByTime(10_000); });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Thoát' }).disabled).toBe(false);
  });
});

describe('DesktopMultiplayerLauncher host form', () => {
  it('asks for a name only: no network choice and no technical hint', async () => {
    const twoNetworks: HostRuntimeStatus = {
      ...status,
      interfaces: [
        ...status.interfaces,
        {
          name: 'Ethernet', displayName: 'Ethernet', address: '10.0.0.8', netmask: '255.255.255.0', preference: 'preferred', rank: 1,
        },
      ],
    };
    const { host } = installHostBridge(twoNetworks);
    const { container } = render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));
    await waitFor(() => expect(host.refreshNetwork).toHaveBeenCalled());

    expect(screen.getByRole('heading', { level: 2, name: 'Tạo phòng' })).toBeTruthy();
    expect(screen.getByLabelText('Tên của bạn').id).toBe('desktop-player-name');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('select')).toBeNull();
    expect(screen.queryByLabelText('Mạng dùng để chia sẻ')).toBeNull();
    expect(screen.queryByText(/Cổng được hệ điều hành chọn/u)).toBeNull();
    expect(screen.queryByText(/Chưa tìm thấy IPv4 LAN/u)).toBeNull();
    expect(screen.queryByText(/Một máy Host giữ phòng|Liên kết mời chỉ chứa/u)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains the disabled button in writing and enables it with a name', async () => {
    const { host } = installHostBridge(status);
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));
    await waitFor(() => expect(host.refreshNetwork).toHaveBeenCalled());

    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Tạo và vào phòng' });
    expect(submit.disabled).toBe(true);
    const reason = screen.getByText('Nhập tên của bạn để tiếp tục.');
    expect(submit.getAttribute('aria-describedby')).toBe(reason.id);
    expect(entrySharedCss).toContain('.entry-control:focus-visible');

    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    expect(submit.disabled).toBe(false);
    expect(screen.queryByText('Nhập tên của bạn để tiếp tục.')).toBeNull();
  });

  it('says in plain words that there is no network when none is found, without a technical hint', async () => {
    const offline: HostRuntimeStatus = { ...status, interfaces: [], lanAvailable: false };
    installHostBridge(offline);
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));

    expect((await screen.findByRole('alert')).textContent)
      .toBe('Máy này chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.');
    expect(screen.queryByText(/IPv4|LAN dùng được/u)).toBeNull();
  });

  it('shows the same reason when starting fails for lack of a network, and clears it on the next try', async () => {
    const offline: HostRuntimeStatus = {
      ...status, interfaces: [], lanAvailable: false, state: 'FAILED', errorCode: 'NO_LAN_INTERFACE',
    };
    const { host } = installHostBridge(offline);
    host.start.mockResolvedValueOnce({ ok: false as const, status: offline });
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo và vào phòng' }));

    await waitFor(() => expect(host.start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'ONLINE' })));
    expect((await screen.findByRole('alert')).textContent)
      .toBe('Máy này chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.');
    expect(onReady).not.toHaveBeenCalled();
  });

  it.each<HostRuntimeErrorCode>([
    'CLOUDFLARED_MISSING', 'CLOUDFLARED_CORRUPT', 'ONLINE_FAILED', 'HELPER_FAILED', 'READINESS_TIMEOUT',
    'PORT_OCCUPIED', 'BIND_DENIED', 'NO_LAN_INTERFACE', 'RUNTIME_FAILED',
  ])('says the %s failure without ports, servers or databases, and tells what to do', async code => {
    const failed: HostRuntimeStatus = { ...status, state: 'FAILED', errorCode: code };
    const { host } = installHostBridge(status);
    host.start.mockResolvedValueOnce({ ok: false as const, status: failed });
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo và vào phòng' }));

    const text = (await screen.findByRole('alert')).textContent ?? '';
    expect(text).not.toMatch(TECHNICAL_TEXT);
    expect(text).not.toMatch(/máy chủ|Host|tài nguyên|Postgre/iu);
    expect(text).toMatch(/Hãy /u);
  });

  it('keeps the failure for a port that is taken short and plain', async () => {
    const failed: HostRuntimeStatus = { ...status, state: 'FAILED', errorCode: 'PORT_OCCUPIED' };
    const { host } = installHostBridge(status);
    host.start.mockResolvedValueOnce({ ok: false as const, status: failed });
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo và vào phòng' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Chưa mở được phòng. Hãy thử lại.');
  });

  it.each([
    ['STARTING_SERVER', 'Đang mở phòng…'],
    ['STOPPING', 'Đang đóng phòng…'],
  ] as const)('says the %s step as "%s", not as a database or a server', async (state, expected) => {
    installHostBridge({ ...status, state });
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    const line = await screen.findByRole('status');

    expect(line.textContent).toBe(expected);
    expect(line.textContent).not.toMatch(TECHNICAL_TEXT);
  });

  it('goes back to the choices and returns the focus to the card that opened the form', () => {
    installHostBridge(status);
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tham gia phòng' }));

    fireEvent.click(screen.getByRole('button', { name: 'Tạo phòng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tạo phòng' }));
  });
});

const FOUND: LanFindRoomResult = { ok: true, endpoint: 'http://192.168.1.20:53120' };

function fillJoinForm(roomCode = 'otb-abc234', name = 'Ada'): void {
  fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: name } });
  fireEvent.change(screen.queryByLabelText('Mã phòng hoặc liên kết mời') ?? screen.getByLabelText('Mã phòng'), { target: { value: roomCode } });
}

/** Lets the status that the launcher asks the main process for on mount arrive, as it has long before a player types. */
function settleStatus(): Promise<void> {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('DesktopMultiplayerLauncher join form', () => {
  it('uses one field for a code or invitation and keeps the text intact', () => {
    installHostBridge(status);
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    const field = screen.getByLabelText<HTMLInputElement>('Mã phòng hoặc liên kết mời');
    expect(screen.queryByLabelText('Dán liên kết mời')).toBeNull();
    fireEvent.change(field, { target: { value: 'https://sample.trycloudflare.com/?room=otb-abc234' } });
    expect(field.value).toBe('https://sample.trycloudflare.com/?room=otb-abc234');
  });

  it('joins directly through a public invitation without discovery', async () => {
    const { lan } = installHostBridge(status, () => Promise.resolve(FOUND));
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fillJoinForm('https://sample.trycloudflare.com/?room=otb-abc234');
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      runtimeConfig: expect.objectContaining({ socketUrl: 'https://sample.trycloudflare.com' }) as unknown,
      targetRoomCode: 'OTB-ABC234',
    })));
    expect(lan?.findRoom).not.toHaveBeenCalled();
  });

  it('resolves a standalone code through the online registry', async () => {
    const { lan } = installHostBridge(status, () => Promise.resolve({ ok: false, code: 'NOT_FOUND' }));
    const online = { findRoom: vi.fn(() => Promise.resolve({ ok: true as const, endpoint: 'https://room.trycloudflare.com' })) };
    window.ownTheBlockDesktop!.online = online;
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fillJoinForm('otb-abc234');
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      runtimeConfig: expect.objectContaining({ socketUrl: 'https://room.trycloudflare.com' }) as unknown,
      targetRoomCode: 'OTB-ABC234',
    })));
    expect(lan?.findRoom).toHaveBeenCalledWith('OTB-ABC234');
    expect(online.findRoom).toHaveBeenCalledWith('OTB-ABC234');
  });

  it('keeps LAN code discovery when the registry is absent', async () => {
    const { lan } = installHostBridge(status, () => Promise.resolve(FOUND));
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fillJoinForm();
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      runtimeConfig: expect.objectContaining({ socketUrl: FOUND.endpoint }) as unknown,
      targetRoomCode: 'OTB-ABC234',
    })));
    expect(lan?.findRoom).toHaveBeenCalledWith('OTB-ABC234');
  });

  it('asks for a direct link when LAN and Online claim the same code', async () => {
    installHostBridge(status, () => Promise.resolve(FOUND));
    window.ownTheBlockDesktop!.online = {
      findRoom: vi.fn(() => Promise.resolve({ ok: true as const, endpoint: 'https://other.trycloudflare.com' })),
    };
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fillJoinForm();
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Có nhiều phòng cùng mã');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('rejects malformed invitations before any lookup', () => {
    const { lan } = installHostBridge(status, () => Promise.resolve(FOUND));
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fillJoinForm('https://evil.test/?room=OTB-ABC234');
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    expect(screen.getByRole('alert').textContent).toContain('Liên kết mời chưa đúng');
    expect(lan?.findRoom).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('drops a late room lookup after returning to the menu', async () => {
    let resolveFind!: (result: LanFindRoomResult) => void;
    installHostBridge(status, () => new Promise(resolve => { resolveFind = resolve; }));
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fillJoinForm();
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await act(async () => { resolveFind(FOUND); await Promise.resolve(); });
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tham gia phòng' })).toBeTruthy();
  });

  it('keeps the configured server on its fixed address', () => {
    const { lan } = installHostBridge(status, () => Promise.resolve(FOUND));
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher configuredRuntimeConfig={configuredRuntimeConfig} onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: 'Máy chủ riêng' }));
    fillJoinForm('lan-42');
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      runtimeConfig: expect.objectContaining({ socketUrl: 'http://192.168.1.15:8080' }) as unknown,
      targetRoomCode: 'LAN-42',
    }));
    expect(lan?.findRoom).not.toHaveBeenCalled();
  });

  it('can open the join form directly for the design lab', () => {
    installHostBridge(status);
    render(<DesktopMultiplayerLauncher initialMode="join" onReady={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Tham gia phòng' })).toBeTruthy();
  });
});
