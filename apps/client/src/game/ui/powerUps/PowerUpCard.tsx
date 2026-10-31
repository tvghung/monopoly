import type { PowerUpCategory, PowerUpDefinition } from '@monopoly/shared';
import { Swords, Shield, Sparkles, Check } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18n';
import { en, vi, type MessageKey } from '../../../i18n/catalog';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import PowerUpArtwork from './PowerUpArtwork';
import { POWER_UP_RARITY_TREATMENTS } from './powerUpArtManifest';

const icons = { ATTACK: Swords, DEFENSE: Shield, UTILITY: Sparkles };
export default function PowerUpCard({ category, definition, selected, discarded, onChoose, disabled = false, animateReveal = false }: {
  category: PowerUpCategory; definition?: PowerUpDefinition; selected?: boolean; discarded?: boolean;
  onChoose?: () => void; disabled?: boolean; animateReveal?: boolean;
}) {
  const { t } = useTranslation();
  const reducedMotion = useEffectiveReducedMotion();
  const Icon = icons[category];
  const descriptionKey = definition ? 'powerup.effect.' + definition.definitionId : '';
  const description = definition && descriptionKey in vi && descriptionKey in en
    ? t(descriptionKey as MessageKey) : definition?.description;
  const content = <>
    <span className="power-up-card__header">
      <span className="power-up-card__category"><Icon aria-hidden="true" size={16} />{t(('powerup.' + category) as MessageKey)}</span>
      {definition ? <span className="power-up-card__rarity">{t(('powerup.' + definition.rarity) as MessageKey)}</span> : null}
    </span>
    <PowerUpArtwork category={category} definitionId={definition?.definitionId} />
    {definition ? <>
      <strong>{definition.name}</strong><p>{description}</p>
      <span className="power-up-card__activation">{t(('powerup.' + definition.activation) as MessageKey)}</span>
      <span className="power-up-card__ornament" aria-hidden="true" />
    </> : <strong>{t('powerup.choose')}</strong>}
    {selected ? <span className="power-up-card__selection"><Check size={16} aria-hidden="true" />{t('powerup.selected')}</span> : null}
    {discarded ? <span className="power-up-card__discarded">{t('powerup.other')}</span> : null}
  </>;
  const className = 'power-up-card power-up-card--' + category.toLowerCase() + (definition ? ' power-up-card--revealed' : ' power-up-card--back') + (definition && animateReveal ? ' power-up-card--reveal-motion' : '') + (selected ? ' power-up-card--selected' : '') + (discarded ? ' power-up-card--discarded' : '');
  const presentation = {
    className, 'data-reduced-motion': reducedMotion, 'data-rarity': definition?.rarity,
    'data-frame': definition ? POWER_UP_RARITY_TREATMENTS[definition.rarity] : undefined,
  };
  return onChoose ? <button type="button" {...presentation} disabled={disabled} onClick={onChoose}
    aria-label={definition ? definition.name : t(('powerup.' + category) as MessageKey)} aria-pressed={selected}>{content}</button>
    : <article {...presentation}>{content}</article>;
}
