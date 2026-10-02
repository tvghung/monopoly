import type { CSSProperties } from 'react';
import { getPropertyGroupVisualStyle } from '../../../game/ui/propertyVisualColors';
import './GroupPips.css';

export interface GroupPipsGroup {
  /** District key, for example `brown` or `lightblue`. */
  group: string;
  owned: number;
  total: number;
}

export interface GroupPipsProps {
  groups: readonly GroupPipsGroup[];
  className?: string;
}

function summarize(groups: readonly GroupPipsGroup[]): string {
  const owned = groups.filter(group => group.owned > 0);
  if (owned.length === 0) return 'Chưa sở hữu nhóm tài sản nào';
  const parts = owned.map(group => `${getPropertyGroupVisualStyle(group.group).label} ${group.owned}/${group.total}`);
  return `Nhóm tài sản: ${parts.join(', ')}`;
}

/**
 * One small square per district: hollow when nothing is owned, filled from the bottom by the owned
 * share, fully filled with an outline when the set is complete.
 */
export default function GroupPips({ groups, className = '' }: GroupPipsProps) {
  return (
    <span className={`ds-group-pips${className ? ` ${className}` : ''}`} role="img" aria-label={summarize(groups)}>
      {groups.map(({ group, owned, total }) => {
        const share = total > 0 ? Math.min(1, Math.max(0, owned / total)) : 0;
        const complete = total > 0 && owned >= total;
        const state = complete ? 'complete' : owned > 0 ? 'partial' : 'empty';
        return (
          <span
            key={group}
            className={`ds-group-pips__pip ds-group-pips__pip--${state}`}
            style={{
              '--ds-pip-color': getPropertyGroupVisualStyle(group).color,
              '--ds-pip-fill': `${Math.round(share * 100)}%`,
            } as CSSProperties}
          />
        );
      })}
    </span>
  );
}
