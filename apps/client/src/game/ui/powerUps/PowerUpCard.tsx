import type { PowerUpCategory, PowerUpDefinition } from '@monopoly/shared';
import { Swords, Shield, Sparkles, Check } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18n';
import { en, vi, type MessageKey } from '../../../i18n/catalog';
import { useEffectiveReducedMotion } from '../../../settings/selectors';

const icons = { ATTACK: Swords, DEFENSE: Shield, UTILITY: Sparkles };
export default function PowerUpCard({ category, definition, selected, discarded, onChoose, disabled = false }: {
  category: PowerUpCategory; definition?: PowerUpDefinition; selected?: boolean; discarded?: boolean;
  onChoose?: () => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const reducedMotion = useEffectiveReducedMotion();
  const Icon = icons[category];
  const descriptionKey = definition ? `powerup.effect.${definition.definitionId}` : '';
  const description = definition && descriptionKey in vi && descriptionKey in en
    ? t(descriptionKey as MessageKey) : definition?.description;
  const content = <>
    <span className="power-up-card__category"><Icon aria-hidden="true" size={20} />{t(('powerup.' + category) as MessageKey)}</span>
    {definition ? <>
      <span className="power-up-card__rarity">{t(('powerup.' + definition.rarity) as MessageKey)}</span>
      <strong>{definition.name}</strong><p>{description}</p>
      <span className="power-up-card__activation">{t(('powerup.' + definition.activation) as MessageKey)}</span>
    </> : <><span className="power-up-card__seal" aria-hidden="true"><Icon size={42} /></span><strong>{t('powerup.choose')}</strong></>}
    {selected ? <span className="power-up-card__selection"><Check size={16} aria-hidden="true" />{t('powerup.selected')}</span> : null}
    {discarded ? <span className="power-up-card__discarded">{t('powerup.other')}</span> : null}
  </>;
  const className = 'power-up-card power-up-card--' + category.toLowerCase() + (definition ? ' power-up-card--revealed' : ' power-up-card--back') + (selected ? ' power-up-card--selected' : '') + (discarded ? ' power-up-card--discarded' : '');
  return onChoose ? <button type="button" className={className} data-reduced-motion={reducedMotion} disabled={disabled} onClick={onChoose} aria-label={t(('powerup.' + category) as MessageKey)} aria-pressed={selected}>{content}</button>
    : <article className={className} data-reduced-motion={reducedMotion} data-rarity={definition?.rarity}>{content}</article>;
}
