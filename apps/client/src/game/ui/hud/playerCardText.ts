import { formatMoney } from '@monopoly/shared';
import { PERMANENT_ELIMINATION_LABEL, REVIVABLE_LABEL, relationLabel } from '../../team/teamView';
import type { PlayerCardViewModel } from './playerCardSelectors';

/** Opponent rounds a jailed player waits before the release roll (the same limit the jail panel shows). */
export const JAIL_ROUND_LIMIT = 2;

/**
 * The plain-language summary of one card, read by screen readers instead of the decorative card face, for example
 * "Lan, 1.494.000 ₫, 4 tài sản, 3 nhà, 1 khách sạn, 2 ga tàu, đang đi". It always uses the committed display balance, never
 * the intermediate value of the counting animation, so it does not chatter.
 */
export function describePlayerCard(card: PlayerCardViewModel): string {
  const parts = [card.isLocal ? `${card.name} (bạn)` : card.name];
  if (card.teamName) {
    const relation = relationLabel(card.relation);
    parts.push(relation && card.relation !== 'SELF' ? `${relation}, đội ${card.teamName}` : `đội ${card.teamName}`);
  }
  if (card.isBankrupt) {
    parts.push('đã phá sản');
    if (card.revive?.kind === 'REVIVABLE') parts.push(`${REVIVABLE_LABEL.toLowerCase()}, ${card.revive.turnsLabel.toLowerCase()}`);
    if (card.revive?.kind === 'PERMANENT') parts.push(PERMANENT_ELIMINATION_LABEL.toLowerCase());
  } else if (card.hasLeft) parts.push('đã rời ván chơi');
  else parts.push(formatMoney(card.displayMoney));
  if (!card.hasLeft) {
    parts.push(`${card.propertyCount} tài sản`);
    if (card.houses > 0) parts.push(`${card.houses} nhà`);
    if (card.hotels > 0) parts.push(`${card.hotels} khách sạn`);
    if (card.railroadCount > 0) parts.push(`${card.railroadCount} ga tàu`);
    if (card.utilityCount > 0) parts.push(`${card.utilityCount} công ty điện nước`);
  }
  if (card.isInJail && !card.hasLeft && !card.isBankrupt) {
    parts.push(`đang ở tù, vòng chờ ${card.jailRoundsElapsed}/${JAIL_ROUND_LIMIT}`);
  }
  if (!card.isConnected && !card.hasLeft && !card.isBankrupt) {
    parts.push('mất kết nối');
    // The visual countdown ticks every second; the summary only says that one is running.
    if (card.recoveryDeadlineAt) parts.push('sẽ bị bỏ lượt nếu không quay lại kịp');
  }
  if (card.isActive && !card.hasLeft && !card.isBankrupt) parts.push('đang đi');
  return parts.join(', ');
}
