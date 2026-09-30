import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ToastView from './ToastView';

afterEach(cleanup);

describe('ToastView', () => {
  it.each([
    ['info', 'Thông tin'], ['success', 'Thành công'], ['warning', 'Cảnh báo'], ['error', 'Lỗi'],
  ] as const)('renders the %s variant as a status with an icon and plain text', (variant, message) => {
    const { container } = render(<ToastView variant={variant} message={message} />);
    const toast = screen.getByRole('status');
    expect(toast.className).toContain(`ds-toast--${variant}`);
    expect(toast.querySelector('.ds-toast__icon svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(toast.querySelector('.ds-toast__message')?.textContent).toBe(message);
    expect(container.querySelector('button')).toBeNull();
  });

  it('never turns markup in a message into elements', () => {
    render(<ToastView variant="info" message={'<img src=x onerror=alert(1)> <b>đậm</b>'} />);
    const message = document.querySelector('.ds-toast__message') as HTMLElement;
    expect(message.textContent).toBe('<img src=x onerror=alert(1)> <b>đậm</b>');
    expect(message.querySelector('img, b')).toBeNull();
  });
});
