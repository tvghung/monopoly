import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** `sm` is desktop-only secondary chrome; `xl` is for the single hero CTA of a screen. */
  size?: ButtonSize;
  busy?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className = '',
  disabled,
  icon,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`ds-button ds-button--${variant} ds-button--${size}${className ? ` ${className}` : ''}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="ds-button__spinner" aria-hidden="true" /> : null}
      {icon ? <span className="ds-button__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}
