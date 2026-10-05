import {
  cleanup, configure, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  available, downloading, installUpdateBridge, ready, requiredAvailable, updateState,
} from '../components/update/updateTestFixtures';
import { AppUpdateProvider } from '../runtime/appUpdate';
import type { AppUpdateState } from '../runtime/types';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import SettingsPanel from './SettingsPanel';
import { SettingsProvider } from './SettingsProvider';

// A slow runner must not turn a UI that is merely late into a failure; a wait that holds at once costs nothing.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  window.localStorage.clear();
});

function renderSettings(initial: AppUpdateState, { inSession = false } = {}) {
  const bridge = installUpdateBridge(initial);
  render(
    <SettingsProvider initialSettings={DEFAULT_GAME_SETTINGS}>
      <AppUpdateProvider inSession={inSession}>
        <SettingsPanel open onClose={() => undefined} />
      </AppUpdateProvider>
    </SettingsProvider>,
  );
  const section = () => screen.findByRole('region', { name: 'Cập nhật' });
  return { ...bridge, section };
}

describe('settings "Cập nhật" section', () => {
  it('shows the running version and the way to check, as the owner described', async () => {
    const { section, update } = renderSettings(updateState({ phase: 'up-to-date' }));

    const updates = await section();
    expect(within(updates).getByText((_text, element) => element?.textContent === 'Phiên bản hiện tại: 1.1.1'
      && element.tagName === 'P')).toBeTruthy();
    expect(within(updates).getByText('Bạn đang sử dụng phiên bản mới nhất.')).toBeTruthy();
    update.check.mockResolvedValueOnce(updateState({ phase: 'up-to-date' }));
    fireEvent.click(within(updates).getByRole('button', { name: 'Kiểm tra cập nhật' }));
    expect(update.check).toHaveBeenCalledOnce();
  });

  it('is a section among the others, with its own heading', async () => {
    renderSettings(updateState({ phase: 'up-to-date' }));
    await screen.findByRole('region', { name: 'Cập nhật' });

    const headings = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent);
    expect(headings).toEqual(['Âm thanh', 'Hiển thị', 'Đồ họa', 'Cửa sổ', 'Cập nhật']);
  });

  it('is not there without an updater: a bridge that predates it, or an unsupported run', async () => {
    installUpdateBridge(updateState({ phase: 'up-to-date' }));
    delete (window.ownTheBlockDesktop as { update?: unknown }).update;
    const view = render(
      <SettingsProvider initialSettings={DEFAULT_GAME_SETTINGS}>
        <AppUpdateProvider inSession={false}><SettingsPanel open onClose={() => undefined} /></AppUpdateProvider>
      </SettingsProvider>,
    );
    expect(screen.queryByRole('region', { name: 'Cập nhật' })).toBeNull();
    view.unmount();

    const { update } = renderSettings(updateState({ phase: 'unsupported' }));
    await waitFor(() => expect(update.getState).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Cập nhật' })).toBeNull();
  });

  it('is not there in a web browser', () => {
    render(
      <SettingsProvider initialSettings={DEFAULT_GAME_SETTINGS}>
        <AppUpdateProvider inSession={false}><SettingsPanel open onClose={() => undefined} /></AppUpdateProvider>
      </SettingsProvider>,
    );

    expect(screen.queryByRole('region', { name: 'Cập nhật' })).toBeNull();
  });

  it('shows a check in progress as a busy button, and the result when it ends', async () => {
    const { section, push } = renderSettings(updateState({ phase: 'checking' }));

    const updates = await section();
    const busy = within(updates).getByRole<HTMLButtonElement>('button', { name: 'Đang kiểm tra…' });
    expect(busy.disabled).toBe(true);
    expect(within(updates).getByText('Đang kiểm tra bản cập nhật…')).toBeTruthy();

    await push(updateState({ phase: 'up-to-date' }));
    expect(within(updates).getByText('Bạn đang sử dụng phiên bản mới nhất.')).toBeTruthy();
  });

  it('announces the status politely and says a failed check as the owner wrote it, with the check still available', async () => {
    const { section } = renderSettings(updateState({ phase: 'error', error: { stage: 'check', code: 'OFFLINE' } }));

    const updates = await section();
    const status = within(updates).getByText('Không thể kiểm tra bản cập nhật lúc này. Bạn vẫn có thể tiếp tục chơi.');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(within(updates).getByRole<HTMLButtonElement>('button', { name: 'Kiểm tra cập nhật' }).disabled).toBe(false);
  });

  it('says a newer version exists and downloads it on request', async () => {
    const { section, update } = renderSettings(available());
    update.download.mockResolvedValueOnce(downloading(0));

    const updates = await section();
    expect(within(updates).getByText('Có phiên bản 1.2.0.')).toBeTruthy();
    fireEvent.click(within(updates).getByRole('button', { name: 'Cập nhật' }));

    expect(update.download).toHaveBeenCalledOnce();
  });

  it('says a mandatory update is needed to keep playing over the network', async () => {
    const { section } = renderSettings(requiredAvailable());

    expect(within(await section()).getByText('Có phiên bản 1.2.0. Cần cập nhật để tiếp tục chơi.')).toBeTruthy();
  });

  it('shows the download with its percentage and a way to cancel', async () => {
    const { section, update } = renderSettings(downloading(168_398_848 / 4));
    update.cancelDownload.mockResolvedValueOnce(available());

    const updates = await section();
    expect(within(updates).getByText('Đang tải bản cập nhật — 25%')).toBeTruthy();
    expect(within(updates).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');
    fireEvent.click(within(updates).getByRole('button', { name: 'Hủy' }));
    expect(update.cancelDownload).toHaveBeenCalledOnce();
  });

  it('restarts into the new version from the start screen', async () => {
    const { section, update } = renderSettings(ready());
    update.install.mockResolvedValueOnce(updateState({ phase: 'installing', update: ready().update }));

    const updates = await section();
    expect(within(updates).getByText('Bản cập nhật v1.2.0 đã sẵn sàng.')).toBeTruthy();
    const restart = within(updates).getByRole<HTMLButtonElement>('button', { name: 'Khởi động lại và cập nhật' });
    expect(restart.disabled).toBe(false);
    fireEvent.click(restart);

    expect(update.install).toHaveBeenCalledOnce();
  });

  it('keeps the restart for after the game: in a lobby or a game it only says when', async () => {
    const { section, update } = renderSettings(ready(), { inSession: true });

    const updates = await section();
    expect(within(updates).getByText('Bản cập nhật đã sẵn sàng. Bạn có thể cập nhật sau khi kết thúc ván chơi.')).toBeTruthy();
    const restart = within(updates).getByRole<HTMLButtonElement>('button', { name: 'Khởi động lại và cập nhật' });
    expect(restart.disabled).toBe(true);
    fireEvent.click(restart);
    expect(update.install).not.toHaveBeenCalled();
  });

  it('keeps the restart for later while a room of this machine is open', async () => {
    const { section } = renderSettings(ready({ installBlocked: 'HOST_OPEN' }));

    const updates = await section();
    expect(within(updates).getByText(/Hãy đóng phòng đang mở trên máy này rồi cập nhật/u)).toBeTruthy();
    expect(within(updates).getByRole<HTMLButtonElement>('button', { name: 'Khởi động lại và cập nhật' }).disabled).toBe(true);
  });

  it('opens the installer where the app cannot restart itself', async () => {
    const { section, update } = renderSettings(ready({ installMode: 'open-installer' }));

    const updates = await section();
    fireEvent.click(within(updates).getByRole('button', { name: 'Mở bộ cài đặt' }));

    expect(update.install).toHaveBeenCalledOnce();
  });

  it('retries the step that failed: the download, or the install', async () => {
    const download = renderSettings(updateState({
      phase: 'error', update: available().update, error: { stage: 'download', code: 'INTEGRITY' },
    }));
    let updates = await download.section();
    expect(within(updates).getByText('Bản cập nhật tải về bị lỗi. Hãy thử tải lại. Bạn vẫn có thể tiếp tục chơi.')).toBeTruthy();
    fireEvent.click(within(updates).getByRole('button', { name: 'Thử lại' }));
    expect(download.update.download).toHaveBeenCalledOnce();
    cleanup();

    const install = renderSettings(updateState({
      phase: 'error', update: available().update, error: { stage: 'install', code: 'INSTALL_FAILED' },
    }));
    updates = await install.section();
    fireEvent.click(within(updates).getByRole('button', { name: 'Thử lại' }));
    expect(install.update.install).toHaveBeenCalledOnce();
    expect(install.update.download).not.toHaveBeenCalled();
  });

  it('shows no button while the installer runs', async () => {
    const { section } = renderSettings(updateState({ phase: 'installing', update: available().update }));

    const updates = await section();
    expect(within(updates).getByText('Đang cài đặt bản cập nhật…')).toBeTruthy();
    expect(within(updates).queryAllByRole('button')).toEqual([]);
  });
});
