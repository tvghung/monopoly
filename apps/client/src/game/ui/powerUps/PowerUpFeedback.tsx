import { ShieldCheck, Shield, Swords, Undo2, Sparkles, Hourglass, Layers, Check } from 'lucide-react';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import { useTranslation } from '../../../i18n/I18n';
import type { MessageKey } from '../../../i18n/catalog';
import PowerUpArtwork from './PowerUpArtwork';
import './PowerUps.css';
const icons = { ATTACK: Swords, SHIELD: Shield, BLOCK: ShieldCheck, REFLECT: Undo2, LEGENDARY: Sparkles, STATUS: Layers, EXPIRED: Hourglass, CONSUMED: Check, ACQUIRED: Layers };
export default function PowerUpFeedback() {
  const { t } = useTranslation();
  const feedback = usePresentationSelector(state => state.powerUpFeedback);
  if (!feedback) return null;
  const Icon = icons[feedback.kind];
  return <div key={feedback.id} role="status" aria-live="polite" className={'power-up-feedback power-up-feedback--' + feedback.kind.toLowerCase()} data-powerup-feedback={feedback.kind}>
    <Icon aria-hidden="true" /><PowerUpArtwork category={feedback.definitionId.startsWith('A') ? 'ATTACK' : feedback.definitionId.startsWith('D') ? 'DEFENSE' : 'UTILITY'} definitionId={feedback.definitionId} thumbnail /><div><strong>{t(('powerup.feedback.' + feedback.kind) as MessageKey)}</strong><span>{feedback.name}</span></div>
  </div>;
}
