import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ActionIcon } from '../../icons/ActionIcon';
import { isActionIconName, type ActionIconName } from '../../icons/actionIcons';
import './IconButton.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name and tooltip; icon-only buttons always need one. */
  label: string;
  /** A semantic name from the action icon registry, or any decorative node. */
  // ReactNode already includes string; the literal union is kept for editor completion of registry names.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  icon?: ActionIconName | ReactNode;
  /** Legacy alias for `icon` when passing a node. */
  children?: ReactNode;
  size?: 'md' | 'lg';
  /** Toggle state; renders `aria-pressed`. */
  pressed?: boolean;
  /** Unread/attention count shown on the corner and folded into the accessible name. */
  badge?: string | number;
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
function renderIcon(icon: ActionIconName | ReactNode): ReactNode {
  return typeof icon === 'string' && isActionIconName(icon) ? <ActionIcon name={icon} /> : icon;
}

export default function IconButton({
  label,
  icon,
  children,
  size = 'md',
  pressed,
  badge,
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  const hasBadge = badge !== undefined && badge !== '' && badge !== 0;
  const accessibleName = hasBadge ? `${label} (${String(badge)})` : label;
  return (
    <button
      {...props}
      type={type}
      className={`ds-icon-button ds-icon-button--${size}${className ? ` ${className}` : ''}`}
      aria-label={accessibleName}
      aria-pressed={pressed}
      title={label}
    >
      <span className="ds-icon-button__glyph" aria-hidden="true">{renderIcon(icon ?? children)}</span>
      {hasBadge ? <span className="ds-icon-button__badge" aria-hidden="true">{badge}</span> : null}
    </button>
  );
}
