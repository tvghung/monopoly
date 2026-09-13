import { cleanup, render, screen } from '@testing-library/react';
import { Settings } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
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
