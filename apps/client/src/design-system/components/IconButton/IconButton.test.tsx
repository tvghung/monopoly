import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { Settings } from 'lucide-react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import IconButton from './IconButton';

afterEach(cleanup);

describe('IconButton', () => {
  it('names the button and its tooltip from the label and defaults to type="button"', () => {
    render(<IconButton label="Cài đặt" icon="settings" />);

    const button = screen.getByRole('button', { name: 'Cài đặt' });
    expect(button.getAttribute('title')).toBe('Cài đặt');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('accepts a registry name, a node icon or legacy children', () => {
    render(
      <>
        <IconButton label="Từ registry" icon="chat" />
        <IconButton label="Từ node" icon={<Settings data-testid="node-icon" />} />
        <IconButton label="Từ children"><Settings data-testid="child-icon" /></IconButton>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Từ registry' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('node-icon')).toBeTruthy();
    expect(screen.getByTestId('child-icon')).toBeTruthy();
  });

  it('exposes the toggle state and folds the badge into the accessible name', () => {
    render(<IconButton label="Trò chuyện" icon="chat" pressed badge={3} />);

    const button = screen.getByRole('button', { name: 'Trò chuyện (3)' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('title')).toBe('Trò chuyện');
    expect(button.textContent).toBe('3');
  });

  it('omits the badge for zero or empty counts and supports the large size', () => {
    render(<IconButton label="Trò chuyện" icon="chat" badge={0} size="lg" />);

    const button = screen.getByRole('button', { name: 'Trò chuyện' });
    expect(button.className).toContain('ds-icon-button--lg');
    expect(button.textContent).toBe('');
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    render(<IconButton label="Đóng" icon="close" disabled onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
