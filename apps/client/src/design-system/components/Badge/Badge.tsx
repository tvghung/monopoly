import type { ReactNode } from 'react';
import './Badge.css';

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export default function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return <span className={`ds-badge ds-badge--${variant}${className ? ` ${className}` : ''}`}>{children}</span>;
}

