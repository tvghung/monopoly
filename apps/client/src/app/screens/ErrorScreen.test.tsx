import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_IDS } from '@monopoly/shared';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import BootstrapErrorScreen from './BootstrapErrorScreen';
import ErrorScreen from './ErrorScreen';

afterEach(cleanup);

describe('ErrorScreen', () => {
  it('announces the failure with its title as the heading and its message under it', () => {
    render(<ErrorScreen title="Không thể khôi phục ván chơi" message="Không thể kết nối đến máy chủ trò chơi." />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Không thể khôi phục ván chơi' })).toBeTruthy();
    expect(screen.getByText('Không thể kết nối đến máy chủ trò chơi.')).toBeTruthy();
  });

  it('draws a puzzled mascot as decoration only, without naming it', () => {
    const { container } = render(<ErrorScreen title="Lỗi" message="Có lỗi." />);
    const figure = container.querySelector('.app-screen__figure');
    expect(figure?.getAttribute('aria-hidden')).toBe('true');
    const image = figure?.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('');
    expect(image?.hasAttribute('title')).toBe(false);
    for (const id of CHARACTER_IDS) {
      expect(screen.queryByText(CHARACTER_REGISTRY[id].accessibleLabel)).toBeNull();
    }
  });

  it('is a dead end without a button when there is nothing the player can do', () => {
    render(<ErrorScreen title="Phiên chơi đã được mở ở nơi khác" message="Phiên chơi này đã được mở trên một kết nối mới hơn." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers its one action as a labelled button that runs it once', () => {
    const onClick = vi.fn();
    render(<ErrorScreen title="Lỗi" message="Có lỗi." action={{ label: 'Thử lại', icon: <span aria-hidden="true">i</span>, onClick }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is a section inside the app shell, which has its own main landmark', () => {
    const { container } = render(<ErrorScreen as="section" title="Lỗi" message="Có lỗi." />);
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('section.app-screen--error')).not.toBeNull();
  });
});

describe('BootstrapErrorScreen', () => {
  it('keeps the start-up failure copy and retries', () => {
    const onRetry = vi.fn();
    render(<BootstrapErrorScreen onRetry={onRetry} />);
    expect(screen.getByRole('heading', { name: 'Không thể khởi động trò chơi' })).toBeTruthy();
    expect(screen.getByText('Không thể khởi động trò chơi. Hãy thử lại.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says what failed when the connection settings could not be prepared', () => {
    render(<BootstrapErrorScreen kind="runtime-config" onRetry={vi.fn()} />);
    expect(screen.getByText('Không thể chuẩn bị kết nối trò chơi. Hãy thử lại.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('asks for a reload, not a retry, after a render failure', () => {
    render(<BootstrapErrorScreen kind="render" title="Không thể hiển thị trò chơi" onRetry={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Không thể hiển thị trò chơi' })).toBeTruthy();
    expect(screen.getByText('Không thể hiển thị trò chơi. Hãy tải lại để thử lại.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải lại trò chơi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('lets the caller word the button', () => {
    render(<BootstrapErrorScreen actionLabel="Tải lại trò chuyện" onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Tải lại trò chuyện' })).toBeTruthy();
  });
});
