import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppErrorBoundary from './AppErrorBoundary';

afterEach(cleanup);

function BrokenChild(): never {
  throw new Error('secret technical exception');
}

describe('AppErrorBoundary', () => {
  it('contains a top-level render failure with safe copy and a reload action', () => {
    const reload = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AppErrorBoundary reload={reload}>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Không thể hiển thị trò chơi' })).toBeTruthy();
    expect(screen.getByText('Không thể hiển thị trò chơi. Hãy tải lại để thử lại.')).toBeTruthy();
    expect(screen.queryByText('secret technical exception')).toBeNull();
    expect(screen.queryByText(/stack|exception/i)).toBeNull();
    expect(consoleError).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tải lại trò chơi' }));
    expect(reload).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
