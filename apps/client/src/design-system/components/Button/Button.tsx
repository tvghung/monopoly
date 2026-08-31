import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  busy = false,
  className = '',
  disabled,
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`ds-button ds-button--${variant}${className ? ` ${className}` : ''}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="ds-button__spinner" aria-hidden="true" /> : null}
      {icon ? <span className="ds-button__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

