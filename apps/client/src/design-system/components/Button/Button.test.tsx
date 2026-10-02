import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import type { FormEvent } from 'react';
import { Settings } from 'lucide-react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import Button from './Button';

describe('Button icon contract', () => {
  afterEach(cleanup);

  it('keeps text as the accessible name while hiding the decorative icon', () => {
    render(<Button icon={<Settings data-testid="settings-icon" />}>Cài đặt</Button>);

    expect(screen.getByRole('button', { name: 'Cài đặt' })).toBeTruthy();
    expect(screen.getByTestId('settings-icon').closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('keeps icon, label, and busy state without enabling the action', () => {
    render(<Button icon={<Settings />} busy>Cài đặt</Button>);

    const button = screen.getByRole('button', { name: 'Cài đặt' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Button defaults and sizes', () => {
  afterEach(cleanup);

  it('defaults to type="button" so it never submits a form by accident', () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Đóng</Button>
        <Button type="submit">Gửi</Button>
      </form>,
    );

    expect(screen.getByRole('button', { name: 'Đóng' }).getAttribute('type')).toBe('button');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders the requested variant and size classes and keeps custom classes', () => {
    render(<Button variant="secondary" size="xl" className="extra">Đổ xúc xắc</Button>);

    const button = screen.getByRole('button', { name: 'Đổ xúc xắc' });
    expect(button.className).toContain('ds-button--secondary');
    expect(button.className).toContain('ds-button--xl');
    expect(button.className).toContain('extra');
  });

  it('defaults to the md size and stays disabled while busy', () => {
    render(<Button busy>Đang gửi</Button>);

    const button = screen.getByRole('button', { name: 'Đang gửi' });
    expect(button.className).toContain('ds-button--md');
    expect(button).toHaveProperty('disabled', true);
  });
});
