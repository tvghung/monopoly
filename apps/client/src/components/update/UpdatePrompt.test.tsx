import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateProvider } from '../../runtime/appUpdate';
import type { AppUpdateState } from '../../runtime/types';
import { SettingsProvider } from '../../settings/SettingsProvider';
import UpdatePrompt from './UpdatePrompt';
import {
  available, downloading, installUpdateBridge, ready, requiredAvailable, updateState,
} from './updateTestFixtures';

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  window.localStorage.clear();
});

function renderPrompt(
  initial: AppUpdateState,
  props: { menuVisible?: boolean; onQuit?: () => void; inSession?: boolean } = {},
) {
  const bridge = installUpdateBridge(initial);
  const tree = (menuVisible: boolean, inSession: boolean) => (
    <SettingsProvider>
      <AppUpdateProvider inSession={inSession}>
        <UpdatePrompt menuVisible={menuVisible} {...(props.onQuit ? { onQuit: props.onQuit } : {})} />
      </AppUpdateProvider>
    </SettingsProvider>
  );
  const view = render(tree(props.menuVisible ?? true, props.inSession ?? false));
  return {
    ...bridge,
    rerender: (menuVisible: boolean, inSession = false) => view.rerender(tree(menuVisible, inSession)),
  };
}

const dialog = (name: string) => screen.findByRole('dialog', { name });
/** Waits for the exit animation to end: a dialog that is still leaving is hidden from queries but not yet removed. */
const gone = () => waitFor(() => expect(document.querySelector('.ds-modal__card')).toBeNull());

describe('the optional update offer', () => {
  it('opens as the dialog "Có bản cập nhật mới" with both versions and the two choices', async () => {
    renderPrompt(available());

    const offer = await dialog('Có bản cập nhật mới');
    expect(within(offer).getByText('Own the Block v1.2.0 đã sẵn sàng. Bạn đang sử dụng v1.1.1.')).toBeTruthy();
    expect(within(offer).getByRole('button', { name: 'Cập nhật' })).toBeTruthy();
    expect(within(offer).getByRole('button', { name: 'Để sau' })).toBeTruthy();
    // The choice that keeps the player where they are has the focus, so a stray Enter downloads nothing.
    expect(document.activeElement).toBe(within(offer).getByRole('button', { name: 'Để sau' }));
  });

  it('starts the download when the player chooses "Cập nhật"', async () => {
    const { update } = renderPrompt(available());
    update.download.mockResolvedValueOnce(downloading(0));
    const offer = await dialog('Có bản cập nhật mới');

    fireEvent.click(within(offer).getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => expect(update.download).toHaveBeenCalledOnce());
    await gone();
  });

  it('closes on "Để sau", on Escape and on the close button, and stays closed for that version', async () => {
    const { push } = renderPrompt(available());
    const offer = await dialog('Có bản cập nhật mới');

    fireEvent.click(within(offer).getByRole('button', { name: 'Để sau' }));
    await gone();

    await push(available({ checkedAt: 5 }));
    expect(document.querySelector('.ds-modal__card')).toBeNull();

    // A newer release is a new offer.
    await push(available({ update: { version: '1.3.0', mandatory: false, sizeBytes: 1 } }));
    await dialog('Có bản cập nhật mới');
    fireEvent.keyDown(document, { key: 'Escape' });
    await gone();

    await push(available({ update: { version: '1.4.0', mandatory: false, sizeBytes: 1 } }));
    const third = await dialog('Có bản cập nhật mới');
    fireEvent.click(within(third).getByRole('button', { name: 'Đóng' }));
    await gone();
  });

  it('does not open over a form, in a game, or when there is nothing to offer', async () => {
    const hidden = renderPrompt(available(), { menuVisible: false });
    await waitFor(() => expect(hidden.update.getState).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();

    // The player goes back to the menu: now it opens.
    hidden.rerender(true);
    await dialog('Có bản cập nhật mới');
    cleanup();

    const inGame = renderPrompt(available(), { inSession: true });
    await waitFor(() => expect(inGame.update.getState).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();

    for (const phase of ['idle', 'checking', 'up-to-date'] as const) {
      const quiet = renderPrompt(updateState({ phase }));
      await waitFor(() => expect(quiet.update.getState).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).toBeNull();
      cleanup();
    }
  });
});

describe('the mandatory update', () => {
  it('says what the owner wrote and leaves "Cập nhật" as the only way on (plus quitting the game)', async () => {
    const onQuit = vi.fn();
    const { update } = renderPrompt(requiredAvailable(), { onQuit });

    const notice = await dialog('Cần cập nhật Own the Block');
    expect(within(notice).getByText(
      'Phiên bản hiện tại của bạn không còn tương thích với phiên bản mới nhất. Vui lòng cập nhật để tiếp tục chơi.',
    )).toBeTruthy();
    expect(within(notice).queryByRole('button', { name: 'Để sau' })).toBeNull();
    expect(within(notice).queryByRole('button', { name: 'Đóng' })).toBeNull();
    expect(within(notice).getAllByRole('button').map(button => button.textContent)).toEqual(['Thoát game', 'Cập nhật']);
    expect(document.activeElement).toBe(within(notice).getByRole('button', { name: 'Cập nhật' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Cần cập nhật Own the Block' })).toBeTruthy();

    fireEvent.click(within(notice).getByRole('button', { name: 'Thoát game' }));
    expect(onQuit).toHaveBeenCalledOnce();
    fireEvent.click(within(notice).getByRole('button', { name: 'Cập nhật' }));
    expect(update.download).toHaveBeenCalledOnce();
  });

  it('offers no quit button when the screen cannot quit', async () => {
    renderPrompt(requiredAvailable());

    const notice = await dialog('Cần cập nhật Own the Block');
    expect(within(notice).getAllByRole('button').map(button => button.textContent)).toEqual(['Cập nhật']);
  });

  it('stays open while it downloads, with the progress and a way to cancel', async () => {
    const { update } = renderPrompt(downloading(168_398_848 * 0.42, { update: requiredAvailable().update }));

    const notice = await dialog('Cần cập nhật Own the Block');
    expect(within(notice).getByText('Đang tải bản cập nhật — 42%')).toBeTruthy();
    expect(within(notice).getByRole('progressbar', { name: 'Tiến trình tải bản cập nhật' }).getAttribute('aria-valuenow')).toBe('42');

    fireEvent.click(within(notice).getByRole('button', { name: 'Hủy' }));
    expect(update.cancelDownload).toHaveBeenCalledOnce();
  });

  it('shows what went wrong and repeats the failed step: the download, or the install', async () => {
    const failedDownload = updateState({
      phase: 'error', update: requiredAvailable().update, error: { stage: 'download', code: 'OFFLINE' },
    });
    const first = renderPrompt(failedDownload);
    let notice = await dialog('Cần cập nhật Own the Block');
    expect(within(notice).getByRole('alert').textContent).toBe('Không thể tải bản cập nhật. Hãy kiểm tra kết nối Internet rồi thử lại.');
    fireEvent.click(within(notice).getByRole('button', { name: 'Thử lại' }));
    expect(first.update.download).toHaveBeenCalledOnce();
    cleanup();

    const failedInstall = updateState({
      phase: 'error', update: requiredAvailable().update, error: { stage: 'install', code: 'INSTALL_FAILED' },
    });
    const second = renderPrompt(failedInstall);
    notice = await dialog('Cần cập nhật Own the Block');
    fireEvent.click(within(notice).getByRole('button', { name: 'Thử lại' }));
    expect(second.update.install).toHaveBeenCalledOnce();
    expect(second.update.download).not.toHaveBeenCalled();
  });

  it('asks to restart once downloaded, without "Để sau"', async () => {
    const { update } = renderPrompt(ready({ update: requiredAvailable().update }), { onQuit: vi.fn() });

    const notice = await dialog('Bản cập nhật đã sẵn sàng');
    expect(within(notice).queryByRole('button', { name: 'Để sau' })).toBeNull();
    fireEvent.click(within(notice).getByRole('button', { name: 'Khởi động lại và cập nhật' }));
    expect(update.install).toHaveBeenCalledOnce();
  });
});

describe('a downloaded update', () => {
  it('asks "Khởi động lại và cập nhật" or "Để sau", with the focus on "Để sau" because a restart is not to be hit by accident', async () => {
    const { update } = renderPrompt(ready());

    const question = await dialog('Bản cập nhật đã sẵn sàng');
    expect(within(question).getByText(/Game sẽ đóng và mở lại để hoàn tất cập nhật/u)).toBeTruthy();
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Để sau' }));

    fireEvent.click(within(question).getByRole('button', { name: 'Khởi động lại và cập nhật' }));
    expect(update.install).toHaveBeenCalledOnce();
  });

  it('can be put off, and then does not come back for that version', async () => {
    renderPrompt(ready());
    const question = await dialog('Bản cập nhật đã sẵn sàng');

    fireEvent.click(within(question).getByRole('button', { name: 'Để sau' }));

    await gone();
  });

  it('opens the installer instead of restarting where the app cannot replace itself', async () => {
    const { update } = renderPrompt(ready({ installMode: 'open-installer' }));
    update.install.mockResolvedValueOnce(ready({ installMode: 'open-installer', followUp: 'installer-opened' }));

    const question = await dialog('Bản cập nhật đã sẵn sàng');
    expect(within(question).getByText(/thư mục Ứng dụng/u)).toBeTruthy();
    fireEvent.click(within(question).getByRole('button', { name: 'Mở bộ cài đặt' }));
    expect(update.install).toHaveBeenCalledOnce();

    await waitFor(() => expect(within(question).getByText(/Đã mở bộ cài đặt v1\.2\.0/u)).toBeTruthy());
    expect(within(question).getByRole('button', { name: 'Mở lại bộ cài đặt' })).toBeTruthy();
  });

  it('stays out of the way while a room of this machine is open: the quiet line explains, "Đóng phòng" stays reachable', async () => {
    const { update, push } = renderPrompt(ready({ installBlocked: 'HOST_OPEN' }));
    await waitFor(() => expect(update.getState).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();

    await push(ready());
    await dialog('Bản cập nhật đã sẵn sàng');
  });
});

describe('the install wait', () => {
  it('blocks the screen with one sentence and no button while the installer runs', async () => {
    renderPrompt(updateState({ phase: 'installing', update: available().update }));

    const waiting = await dialog('Đang cài đặt bản cập nhật');
    expect(within(waiting).getByText('Game sẽ tự mở lại khi cài xong. Vui lòng chưa tắt máy.')).toBeTruthy();
    expect(within(waiting).queryAllByRole('button')).toEqual([]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Đang cài đặt bản cập nhật' })).toBeTruthy();
  });

  it('closes when the install failed and the quiet line takes over', async () => {
    const { push } = renderPrompt(updateState({ phase: 'installing', update: available().update }));
    await dialog('Đang cài đặt bản cập nhật');

    await push(updateState({ phase: 'error', update: available().update, error: { stage: 'install', code: 'INSTALL_FAILED' } }));

    await gone();
  });
});
