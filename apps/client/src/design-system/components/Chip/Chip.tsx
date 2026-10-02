import type { ReactNode } from 'react';
import './Chip.css';

export type ChipTone = 'neutral' | 'gain' | 'loss' | 'info' | 'gold';

export interface ChipProps {
  tone?: ChipTone;
  /** Decorative glyph; the text must carry the meaning. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Small status pill. Every tone pairs a soft fill with its strong text color (contrast-tested pairs). */
export default function Chip({ tone = 'neutral', icon, className = '', children }: ChipProps) {
  return (
    <span className={`ds-chip ds-chip--${tone}${className ? ` ${className}` : ''}`}>
      {icon ? <span className="ds-chip__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}
