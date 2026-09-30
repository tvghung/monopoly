import MoneyText from '../MoneyText/MoneyText';
import './DeltaChip.css';

export interface DeltaChipProps {
  /** Signed change in game units: positive is a gain, negative a loss. */
  delta: number;
  /** Effective reduced motion (setting OR OS); the chip only pops in when this is false. */
  reducedMotion: boolean;
  className?: string;
}

/**
 * Presentational money-change chip (`+100.000 ₫` / `−6.000 ₫`). It owns no timing: callers (the HUD)
 * mount and unmount it from presentation state.
 */
export default function DeltaChip({ delta, reducedMotion, className = '' }: DeltaChipProps) {
  const tone = delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'default';
  return (
    <span
      className={`ds-delta-chip ds-delta-chip--${tone}${reducedMotion ? '' : ' ds-delta-chip--pop'}${className ? ` ${className}` : ''}`}
    >
      <MoneyText amount={delta} tone={tone} size="md" />
    </span>
  );
}
