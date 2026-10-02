import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Chip from './Chip';

afterEach(cleanup);

describe('Chip', () => {
  it('defaults to the neutral tone', () => {
    render(<Chip>Đang chờ</Chip>);

    expect(screen.getByText('Đang chờ').className).toContain('ds-chip--neutral');
  });

  it.each(['neutral', 'gain', 'loss', 'info', 'gold'] as const)('renders the %s tone', tone => {
    render(<Chip tone={tone}>{tone}</Chip>);

    expect(screen.getByText(tone).className).toContain(`ds-chip--${tone}`);
  });

  it('hides a decorative icon from assistive technology', () => {
    render(<Chip icon={<svg data-testid="glyph" />}>Lượt của bạn</Chip>);

    expect(screen.getByTestId('glyph').closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByText('Lượt của bạn')).toBeTruthy();
  });
});
