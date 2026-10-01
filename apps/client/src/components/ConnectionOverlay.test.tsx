import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ConnectionOverlay from './ConnectionOverlay';

afterEach(cleanup);

describe('ConnectionOverlay', () => {
  it('tells the player the connection dropped and that it is being restored', () => {
    render(<ConnectionOverlay />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Đã mất kết nối. Đang kết nối lại vào ván chơi…');
  });

  it('shows a decorative spinner next to the words', () => {
    const { container } = render(<ConnectionOverlay />);
    const spinner = container.querySelector('.connection-overlay__spinner');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    expect(spinner?.textContent).toBe('');
  });

  it('can carry another message and renders it as text', () => {
    render(<ConnectionOverlay message="<b>Đang thử lại</b>" />);
    expect(screen.getByText('<b>Đang thử lại</b>')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
  });

  it('sits on a paper card inside a full-screen layer', () => {
    const { container } = render(<ConnectionOverlay />);
    const layer = container.querySelector('.connection-overlay');
    expect(layer?.querySelector('.connection-overlay__card.ds-panel')).not.toBeNull();
  });
});
