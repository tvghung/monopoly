import { formatMoney } from '@monopoly/shared';
import { relationLabel, reviveTurnsLabel } from '../../team/teamView';
import type { Language } from '../../../i18n/I18n';
import type { MessageKey } from '../../../i18n/catalog';
import { translate } from '../../../i18n/I18n';
import type { PlayerCardViewModel } from './playerCardSelectors';

/** Opponent rounds a jailed player waits before the release roll (the same limit the jail panel shows). */
export const JAIL_ROUND_LIMIT = 2;

/**
 * A plain-language summary of one card for screen readers. It uses the same locale as the visible player card and
 * reads the committed display balance, never the intermediate value of the counting animation.
 */
export function describePlayerCard(card: PlayerCardViewModel, language: Language = 'vi'): string {
  const t = (key: MessageKey, values?: Readonly<Record<string, string | number>>) => translate(key, language, values);
  const parts = [card.isLocal ? t('playerCard.localPlayer', { name: card.name }) : card.name];
  if (card.teamName) {
    const relation = relationLabel(card.relation, language);
    const team = t('team.name', { name: card.teamName });
    parts.push(relation && card.relation !== 'SELF' ? relation + ', ' + team : team);
  }
  if (card.isBankrupt) {
    parts.push(t('playerCard.bankrupt'));
    if (card.revive?.kind === 'REVIVABLE') {
      parts.push(t('team.revivable') + ', ' + reviveTurnsLabel(card.revive.window.turnsRemaining, language));
    }
    if (card.revive?.kind === 'PERMANENT') parts.push(t('team.permanent'));
  } else if (card.hasLeft) parts.push(t('playerCard.left'));
  else parts.push(formatMoney(card.displayMoney));
  if (!card.hasLeft) {
    parts.push(t('playerCard.assetCount', { count: card.propertyCount }));
    if (card.houses > 0) parts.push(t('playerCard.houseCount', { count: card.houses }));
    if (card.hotels > 0) parts.push(t('playerCard.hotelCount', { count: card.hotels }));
    if (card.railroadCount > 0) parts.push(t('playerCard.stationCount', { count: card.railroadCount }));
    if (card.utilityCount > 0) parts.push(t('playerCard.utilityCount', { count: card.utilityCount }));
  }
  if (card.isInJail && !card.hasLeft && !card.isBankrupt) {
    parts.push(t('playerCard.jailRounds', { elapsed: card.jailRoundsElapsed, limit: JAIL_ROUND_LIMIT }));
  }
  if (!card.isConnected && !card.hasLeft && !card.isBankrupt) {
    parts.push(t('playerCard.disconnected'));
    if (card.recoveryDeadlineAt) parts.push(t('playerCard.skipCountdown'));
  }
  if (card.isActive && !card.hasLeft && !card.isBankrupt) parts.push(t('playerCard.turn'));
  return parts.join(', ');
}
