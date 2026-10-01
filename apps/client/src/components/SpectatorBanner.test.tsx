import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { roomExitContext, type RoomExitContextValue } from '../roomExitContext';
import SpectatorBanner from './SpectatorBanner';

afterEach(cleanup);

function exit(overrides: Partial<RoomExitContextValue> = {}): RoomExitContextValue {
  return { requestLeave: vi.fn(), leaving: false, label: 'Rời phòng', ...overrides };
}

describe('SpectatorBanner', () => {
  it('names the mode with a pill and explains what a spectator can do, as a status', () => {
    render(<SpectatorBanner />);
    expect(screen.getByText('Chế độ Khán Giả')).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Chế độ Khán Giả');
    expect(status.textContent).toContain('Bạn có thể theo dõi ván chơi nhưng không thể thực hiện thao tác.');
  });

  it('is a labelled landmark', () => {
    render(<SpectatorBanner />);
    expect(screen.getByRole('complementary', { name: 'Khán giả' })).toBeTruthy();
  });

  it('has no leave button outside the app shell, where there is no leave flow to run', () => {
    render(<SpectatorBanner />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('leaves through the app\'s own leave flow', () => {
    const value = exit();
    render(
      <roomExitContext.Provider value={value}>
        <SpectatorBanner />
      </roomExitContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rời phòng' }));
    expect(value.requestLeave).toHaveBeenCalledOnce();
  });

  it('shows the request in flight and does not leave twice', () => {
    const value = exit({ leaving: true });
    render(
      <roomExitContext.Provider value={value}>
        <SpectatorBanner />
      </roomExitContext.Provider>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Rời phòng' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(value.requestLeave).not.toHaveBeenCalled();
  });
});
