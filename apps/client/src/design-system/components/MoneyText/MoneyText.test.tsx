import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DeltaChip from '../DeltaChip/DeltaChip';
import MoneyText from './MoneyText';

afterEach(cleanup);

const textOf = (element: Element | null) => element?.textContent ?? '';

describe('MoneyText', () => {
  it('formats through formatMoney (1 unit = 1.000 ₫)', () => {
    const { container } = render(<MoneyText amount={1_500} />);

    expect(textOf(container.firstElementChild)).toBe('1.500.000 ₫');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('marks gains with a plus sign and an icon', () => {
    const { container } = render(<MoneyText amount={100} tone="gain" />);

    expect(textOf(container.firstElementChild)).toBe('+100.000 ₫');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks losses with a minus sign and an icon, whatever the sign of the input', () => {
    const fromPositive = render(<MoneyText amount={6} tone="loss" />);
    expect(textOf(fromPositive.container.firstElementChild)).toBe('−6.000 ₫');
    expect(fromPositive.container.querySelector('svg')).not.toBeNull();

    const fromNegative = render(<MoneyText amount={-6} tone="loss" />);
    expect(textOf(fromNegative.container.firstElementChild)).toBe('−6.000 ₫');
  });

  it('shows signs for the default tone only when asked or negative', () => {
    expect(textOf(render(<MoneyText amount={5} signed />).container.firstElementChild)).toBe('+5.000 ₫');
    expect(textOf(render(<MoneyText amount={-5} />).container.firstElementChild)).toBe('−5.000 ₫');
    expect(textOf(render(<MoneyText amount={0} signed />).container.firstElementChild)).toBe('0 ₫');
  });

  it('reads size and tone from class names', () => {
    const { container } = render(<MoneyText amount={1} size="lg" tone="gain" />);

    expect(container.firstElementChild?.className).toContain('ds-money--lg');
    expect(container.firstElementChild?.className).toContain('ds-money--gain');
  });
});

describe('DeltaChip', () => {
  it('shows a signed gain or loss', () => {
    const gain = render(<DeltaChip delta={200} reducedMotion={false} />);
    expect(gain.container.textContent).toBe('+200.000 ₫');
    expect(gain.container.firstElementChild?.className).toContain('ds-delta-chip--gain');

    const loss = render(<DeltaChip delta={-80} reducedMotion={false} />);
    expect(loss.container.textContent).toBe('−80.000 ₫');
    expect(loss.container.firstElementChild?.className).toContain('ds-delta-chip--loss');
  });

  it('pops in only when motion is allowed', () => {
    const animated = render(<DeltaChip delta={10} reducedMotion={false} />);
    expect(animated.container.firstElementChild?.className).toContain('ds-delta-chip--pop');

    const still = render(<DeltaChip delta={10} reducedMotion />);
    expect(still.container.firstElementChild?.className).not.toContain('ds-delta-chip--pop');
  });

  it('renders a zero delta neutrally', () => {
    const { container } = render(<DeltaChip delta={0} reducedMotion />);

    expect(container.textContent).toBe('0 ₫');
    expect(container.firstElementChild?.className).toContain('ds-delta-chip--default');
  });
});
