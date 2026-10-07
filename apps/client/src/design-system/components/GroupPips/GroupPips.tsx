import type { CSSProperties } from 'react';
import { getPropertyGroupVisualStyle } from '../../../game/ui/propertyVisualColors';
import { useTranslation } from '../../../i18n/I18n';
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

function summarize(groups: readonly GroupPipsGroup[], t: ReturnType<typeof useTranslation>['t']): string {
  const owned = groups.filter(group => group.owned > 0);
  if (owned.length === 0) return t('groupPips.none');
  const groupKeys: Record<string, Parameters<typeof t>[0]> = {
    brown: 'property.colorGroup.brown', lightblue: 'property.colorGroup.lightblue', pink: 'property.colorGroup.pink',
    orange: 'property.colorGroup.orange', red: 'property.colorGroup.red', yellow: 'property.colorGroup.yellow',
    green: 'property.colorGroup.green', blue: 'property.colorGroup.blue', railroad: 'property.group.railroad', utility: 'property.group.utility',
  };
  const parts = owned.map(group => `${t(groupKeys[group.group] ?? 'ui.player')} ${group.owned}/${group.total}`);
  return t('groupPips.summary', { groups: parts.join(', ') });
}

/**
 * One small square per district: hollow when nothing is owned, filled from the bottom by the owned
 * share, fully filled with an outline when the set is complete.
 */
export default function GroupPips({ groups, className = '' }: GroupPipsProps) {
  const { t } = useTranslation();
  return (
    <span className={`ds-group-pips${className ? ` ${className}` : ''}`} role="img" aria-label={summarize(groups, t)}>
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
