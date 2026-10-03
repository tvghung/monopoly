import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ENTRY_SURFACES } from './entrySurfaces';

afterEach(cleanup);

function renderSurface(id: string) {
  const fixture = ENTRY_SURFACES.find(surface => surface.id === id);
  if (!fixture) throw new Error(`No entry surface ${id}`);
  return render(<>{fixture.render()}</>);
}

describe('entry surfaces', () => {
  it('shows the landing in each state the capture set needs', () => {
    const { unmount } = renderSurface('landing-public');
    expect(screen.getByRole('radio', { name: 'Phòng chung' }).getAttribute('aria-checked')).toBe('true');
    unmount();

    renderSurface('landing-busy');
    expect(screen.getByRole('button', { name: 'Đang vào phòng…' })).toBeTruthy();
  });

  it('installs the desktop bridge stub only while a launcher surface is mounted', () => {
    expect(window.ownTheBlockDesktop).toBeUndefined();

    const view = renderSurface('launcher');
    expect(window.ownTheBlockDesktop?.host).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tạo phòng' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Máy chủ riêng' })).toBeTruthy();
    // The lab supplies what the real screen has above it, so every button of the menu is in the capture.
    expect(screen.getByRole('button', { name: 'Cài đặt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thoát' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hướng dẫn chơi' })).toBeTruthy();

    view.unmount();
    expect(window.ownTheBlockDesktop).toBeUndefined();
  });

  it('shows a running host with its way back in and its way to close it', async () => {
    renderSurface('launcher-running');

    expect(await screen.findByRole('button', { name: 'Vào lại phòng đang mở' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đóng phòng' })).toBeTruthy();
  });

  it('shows the landing the desktop app falls back to, with what was typed and a way back', () => {
    renderSurface('landing-desktop-failed');

    expect(screen.getByRole('alert').textContent).toBe('Không tìm thấy phòng hoặc dữ liệu được yêu cầu.');
    expect(screen.getByLabelText<HTMLInputElement>('Tên của bạn').value).toBe('Minh');
    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('OTB-ABC234');
    expect(screen.getByRole('button', { name: 'Quay lại' })).toBeTruthy();
  });

  it('opens the launcher forms directly', () => {
    const { unmount } = renderSurface('launcher-host');
    expect(screen.getByRole('heading', { level: 2, name: 'Tạo phòng' })).toBeTruthy();
    // The host form is a name and one button: no network choice, no hints.
    expect(screen.queryByLabelText('Mạng dùng để chia sẻ')).toBeNull();
    unmount();

    const { unmount: unmountJoin } = renderSurface('launcher-join');
    expect(screen.getByRole('heading', { level: 2, name: 'Tham gia phòng' })).toBeTruthy();
    expect(screen.queryByLabelText('Địa chỉ Host')).toBeNull();
    expect(screen.queryByLabelText('Dán liên kết mời')).toBeNull();
    unmountJoin();
  });

  it('shows the failed search with the invitation-link field, filled in as a player would have left it', () => {
    renderSurface('launcher-join-failed');

    expect(screen.getByRole('alert').textContent).toBe(
      'Không tìm thấy phòng OTB-ABC234. Kiểm tra lại mã và chắc chắn máy tạo phòng đang mở game, cùng Wi-Fi với bạn.',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Tên của bạn').value).toBe('Minh');
    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('OTB-ABC234');
    expect(screen.getByLabelText('Dán liên kết mời')).toBeTruthy();
  });
});
