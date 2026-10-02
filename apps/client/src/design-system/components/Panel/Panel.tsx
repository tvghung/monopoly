import type { ReactNode } from 'react';
import './Panel.css';

export interface PanelProps {
  title?: ReactNode;
  /** `paper` is the default surface, `soft` a list-row fill, `sunken` an input well. */
  tone?: 'paper' | 'soft' | 'sunken';
  padding?: 'sm' | 'md' | 'lg';
  as?: 'section' | 'div' | 'aside';
  className?: string;
  children: ReactNode;
}

export default function Panel({
  title,
  tone = 'paper',
  padding = 'md',
  as: Element = 'section',
  className = '',
  children,
}: PanelProps) {
  return (
    <Element className={`ds-panel ds-panel--${tone} ds-panel--pad-${padding}${className ? ` ${className}` : ''}`}>
      {title ? <h2 className="ds-panel__title">{title}</h2> : null}
      {children}
    </Element>
  );
}
