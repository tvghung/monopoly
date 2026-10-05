import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DesktopMultiplayerLauncher from './DesktopMultiplayerLauncher';
import {
  available, downloading, installUpdateBridge, ready, requiredAvailable, updateState,
} from './update/updateTestFixtures';
import { AppUpdateProvider } from '../runtime/appUpdate';
import type { AppUpdateState, HostRuntimeState, HostRuntimeStatus } from '../runtime/types';
import { SettingsProvider } from '../settings/SettingsProvider';

const idle: HostRuntimeStatus = {
  state: 'IDLE',
  platform: 'win32',
  appVersion: '1.1.1',
  gamePort: null,
  localEndpoint: null,
  lanAvailable: false,
  interfaces: [],
  advertisedEndpoints: [],
  selectedLanUrl: null,
};

const hosting: HostRuntimeStatus = {
  ...idle,
  state: 'HOSTING',
  gamePort: 8080,
  localEndpoint: 'http://127.0.0.1:8080',
  lanAvailable: true,
};

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  window.localStorage.clear();
});

function renderLauncher(initial: AppUpdateState, host: HostRuntimeStatus = idle) {
  const bridge = installUpdateBridge(initial, {
    host: {
      getStatus: vi.fn(() => Promise.resolve(host)),
      start: vi.fn(),
      stop: vi.fn(() => Promise.resolve({ ok: true as const, status: idle })),
      refreshNetwork: vi.fn(() => Promise.resolve(host)),
      onStatusChanged: vi.fn(() => () => undefined),
    },
  });
  const onReady = vi.fn();
  render(
    <SettingsProvider>
      <AppUpdateProvider inSession={false}>
        <DesktopMultiplayerLauncher onReady={onReady} configuredRuntimeConfig={{
          target: 'desktop', socketUrl: 'http://192.168.1.15:8080', platform: 'win32', appVersion: '1.1.1',
        }}
        />
      </AppUpdateProvider>
    </SettingsProvider>,
  );
  return { ...bridge, onReady };
}

const menuButton = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const gone = () => waitFor(() => expect(document.querySelector('.ds-modal__card')).toBeNull());
const runningHost = (state: HostRuntimeState = 'HOSTING') => ({ ...hosting, state });

describe('start screen with an optional update', () => {
  it('offers the update over the menu and keeps every way to play enabled', async () => {
    renderLauncher(available());

    const offer = await screen.findByRole('dialog', { name: 'Có bản cập nhật mới' });
    expect(within(offer).getByText('Own the Block v1.2.0 đã sẵn sàng. Bạn đang sử dụng v1.1.1.')).toBeTruthy();
    for (const name of ['Tạo phòng', 'Tham gia phòng', 'Máy chủ riêng']) expect(menuButton(name).disabled).toBe(false);

    fireEvent.click(within(offer).getByRole('button', { name: 'Để sau' }));
    await gone();
    fireEvent.click(menuButton('Tạo phòng'));
    expect(screen.getByLabelText('Tên của bạn')).toBeTruthy();
  });

  it('starts the download and then shows it as one quiet line with a progress bar, over the menu', async () => {
    const { update, push } = renderLauncher(available());
    update.download.mockResolvedValueOnce(downloading(0));
    const offer = await screen.findByRole('dialog', { name: 'Có bản cập nhật mới' });

    fireEvent.click(within(offer).getByRole('button', { name: 'Cập nhật' }));
    await gone();
    await push(downloading(168_398_848 * 0.42));

    expect(update.download).toHaveBeenCalledOnce();
    expect(screen.getByText('Đang tải bản cập nhật — 42%')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Tiến trình tải bản cập nhật' }).getAttribute('aria-valuenow')).toBe('42');
    expect(menuButton('Tạo phòng').disabled).toBe(false);

    update.cancelDownload.mockResolvedValueOnce(available());
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(update.cancelDownload).toHaveBeenCalledOnce();
  });

  it('asks to restart when the download ends, and applies it when the player agrees', async () => {
    const { update, push } = renderLauncher(downloading(100));

    await push(ready());
    const question = await screen.findByRole('dialog', { name: 'Bản cập nhật đã sẵn sàng' });
    fireEvent.click(within(question).getByRole('button', { name: 'Khởi động lại và cập nhật' }));

    expect(update.install).toHaveBeenCalledOnce();
  });

  it('says a failed download in one line that keeps the game playable, and retries on request', async () => {
    const { update } = renderLauncher(updateState({
      phase: 'error', update: available().update, error: { stage: 'download', code: 'OFFLINE' },
    }));

    const line = await screen.findByRole('alert');
    expect(line.textContent).toBe('Không thể tải bản cập nhật. Hãy kiểm tra kết nối Internet rồi thử lại. Bạn vẫn có thể tiếp tục chơi.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(menuButton('Tạo phòng').disabled).toBe(false);

    update.download.mockResolvedValueOnce(downloading(0));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(update.download).toHaveBeenCalledOnce();
  });

  it('does not open a dialog over a form the player is filling in, and opens it on the way back', async () => {
    const { push } = renderLauncher(updateState({ phase: 'up-to-date' }));
    await waitFor(() => expect(menuButton('Tạo phòng')).toBeTruthy());
    fireEvent.click(menuButton('Tạo phòng'));
    expect(screen.getByLabelText('Tên của bạn')).toBeTruthy();

    await push(available());
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await screen.findByRole('dialog', { name: 'Có bản cập nhật mới' });
  });

  it('adds no sentence to the menu itself: the words are the buttons', async () => {
    renderLauncher(available());
    await screen.findByRole('dialog', { name: 'Có bản cập nhật mới' });

    expect(document.querySelectorAll('.desktop-launcher__menu p')).toHaveLength(0);
  });
});

describe('start screen with a mandatory update', () => {
  it('says why, blocks starting and joining, and offers "Cập nhật" or quitting', async () => {
    const { update } = renderLauncher(requiredAvailable());

    const notice = await screen.findByRole('dialog', { name: 'Cần cập nhật Own the Block' });
    expect(within(notice).getByText(/không còn tương thích với phiên bản mới nhất/u)).toBeTruthy();
    for (const name of ['Tạo phòng', 'Tham gia phòng', 'Máy chủ riêng']) expect(menuButton(name).disabled).toBe(true);
    // The way to quit stays, and the settings dialog is reachable once the notice is answered.
    expect(within(notice).getByRole('button', { name: 'Thoát game' })).toBeTruthy();

    update.download.mockResolvedValueOnce(downloading(0, { update: requiredAvailable().update }));
    fireEvent.click(within(notice).getByRole('button', { name: 'Cập nhật' }));
    expect(update.download).toHaveBeenCalledOnce();
  });

  it('does not open a room form through a disabled button', async () => {
    renderLauncher(requiredAvailable());
    await screen.findByRole('dialog', { name: 'Cần cập nhật Own the Block' });

    fireEvent.click(menuButton('Tạo phòng'));
    fireEvent.click(menuButton('Tham gia phòng'));

    expect(screen.queryByLabelText('Tên của bạn')).toBeNull();
  });

  it('quits the game from the notice through the same exit as the menu', async () => {
    const { exitApp } = renderLauncher(requiredAvailable());
    const notice = await screen.findByRole('dialog', { name: 'Cần cập nhật Own the Block' });

    fireEvent.click(within(notice).getByRole('button', { name: 'Thoát game' }));

    await waitFor(() => expect(exitApp).toHaveBeenCalledOnce());
  });

  it('asks before quitting when a room of this machine is open, as the menu does', async () => {
    renderLauncher(requiredAvailable(), runningHost());
    const notice = await screen.findByRole('dialog', { name: 'Cần cập nhật Own the Block' });

    fireEvent.click(within(notice).getByRole('button', { name: 'Thoát game' }));

    expect(await screen.findByRole('alertdialog', { name: 'Đóng phòng và thoát game?' })).toBeTruthy();
  });

  it('unlocks every way to play once the update is installed', async () => {
    const { push } = renderLauncher(requiredAvailable());
    await screen.findByRole('dialog', { name: 'Cần cập nhật Own the Block' });

    await push(updateState({ phase: 'up-to-date', currentVersion: '1.2.0' }));

    await gone();
    for (const name of ['Tạo phòng', 'Tham gia phòng', 'Máy chủ riêng']) expect(menuButton(name).disabled).toBe(false);
  });

  it('with a room of this machine open, explains in one line and keeps "Vào lại phòng đang mở" and "Đóng phòng" reachable', async () => {
    renderLauncher(ready({ update: requiredAvailable().update, installBlocked: 'HOST_OPEN' }), runningHost());

    expect(await screen.findByText('Cần cập nhật Own the Block. Hãy đóng phòng đang mở trên máy này rồi cập nhật.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Re-entering the room that is already running is not starting or joining a new one.
    expect(menuButton('Vào lại phòng đang mở').disabled).toBe(false);
    expect(menuButton('Đóng phòng').disabled).toBe(false);
    expect(menuButton('Tạo phòng').disabled).toBe(true);
  });
});
