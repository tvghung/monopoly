import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('offers no link field until the reconnection has stalled', () => {
    render(<ConnectionOverlay roomCode="OTB-ABC234" onUseNewLink={vi.fn(() => Promise.resolve('OK' as const))} />);
    expect(screen.queryByLabelText('Link mời mới của phòng')).toBeNull();
  });

  it('after a stall, takes the new invitation of the same room from the Host and nothing else', () => {
    const onUseNewLink = vi.fn(() => Promise.resolve('OK' as const));
    render(<ConnectionOverlay stalled roomCode="OTB-ABC234" onUseNewLink={onUseNewLink} />);
    const field = screen.getByLabelText('Link mời mới của phòng');
    const submit = screen.getByRole('button', { name: 'Kết nối bằng link này' });

    fireEvent.change(field, { target: { value: 'https://evil.test/?room=OTB-ABC234' } });
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Link mời không hợp lệ.');

    fireEvent.change(field, { target: { value: 'https://new-host.trycloudflare.com/?room=OTB-OTHER2' } });
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Link này là của phòng khác.');
    expect(onUseNewLink).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: 'https://new-host.trycloudflare.com/?room=otb-abc234' } });
    fireEvent.click(submit);
    expect(onUseNewLink).toHaveBeenCalledWith('https://new-host.trycloudflare.com', 'OTB-ABC234');
    // The token is never part of what the overlay sends on: only the public origin and the room code.
    expect(JSON.stringify(onUseNewLink.mock.calls)).not.toMatch(/token/i);
  });
});
