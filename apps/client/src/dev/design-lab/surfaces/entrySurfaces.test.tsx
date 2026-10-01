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
    expect(screen.getByRole('button', { name: /Tạo phòng trên máy này/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Máy chủ đã cấu hình/u })).toBeTruthy();

    view.unmount();
    expect(window.ownTheBlockDesktop).toBeUndefined();
  });

  it('opens the launcher forms directly', () => {
    const { unmount } = renderSurface('launcher-host');
    expect(screen.getByRole('heading', { level: 2, name: 'Tạo phòng trên máy này' })).toBeTruthy();
    unmount();

    renderSurface('launcher-join');
    expect(screen.getByRole('heading', { level: 2, name: 'Tham gia phòng LAN' })).toBeTruthy();
  });
});
