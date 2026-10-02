import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatMoney } from '@monopoly/shared';
import './MoneyText.css';

export type MoneyTextTone = 'default' | 'gain' | 'loss';

export interface MoneyTextProps {
  /** Integer game units (`1 unit = 1.000 ₫`); always rendered through `formatMoney`. */
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  tone?: MoneyTextTone;
  /** Show an explicit sign for the default tone (`+` for positive, `−` for negative). */
  signed?: boolean;
  className?: string;
}

const MINUS = '−';

function signFor(amount: number, tone: MoneyTextTone, signed: boolean): string {
  if (tone === 'gain') return '+';
  if (tone === 'loss') return MINUS;
  if (amount < 0) return MINUS;
  return signed && amount > 0 ? '+' : '';
}

/**
 * Money amount with tabular numerals. Gain and loss never rely on color alone: they carry a sign
 * and a direction icon as well.
 */
export default function MoneyText({
  amount,
  size = 'md',
  tone = 'default',
  signed = false,
  className = '',
}: MoneyTextProps) {
  const sign = signFor(amount, tone, signed);
  const Icon = tone === 'gain' ? ArrowUpRight : tone === 'loss' ? ArrowDownRight : null;
  return (
    <span className={`ds-money ds-money--${size} ds-money--${tone}${className ? ` ${className}` : ''}`}>
      {Icon ? <Icon className="ds-money__icon" aria-hidden="true" focusable="false" /> : null}
      {`${sign}${formatMoney(sign ? Math.abs(amount) : amount)}`}
    </span>
  );
}
