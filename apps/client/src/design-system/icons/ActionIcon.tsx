import type { LucideProps } from 'lucide-react';
import { ACTION_ICONS, type ActionIconName } from './actionIcons';

export interface ActionIconProps extends Omit<LucideProps, 'ref'> {
  name: ActionIconName;
}

/** Decorative action glyph from the central registry; the button label carries the meaning. */
export function ActionIcon({ name, className, ...props }: ActionIconProps) {
  const Icon = ACTION_ICONS[name];
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      className={className ? `action-icon ${className}` : 'action-icon'}
      {...props}
    />
  );
}
