import type { GameState, PlayerId } from '@monopoly/shared';
import { activityPlayerName, recordActivityEvent } from '../activity';
import { sendToLog, escapeHtml } from '../text';
import { OFFICIAL_POWER_UP_REGISTRY } from './catalog';

// Called on the existing command draft only at a successful ownership/use boundary.
// No card identity (including instance/offer/category/rarity) enters a receipt event.
export function recordPowerUpReceived(state: GameState, playerId: PlayerId): void {
  const playerName = activityPlayerName(state, playerId);
  recordActivityEvent(state, { type: 'POWER_UP_RECEIVED', playerId, playerName });
  sendToLog(state, escapeHtml(playerName) + ' đã nhận 1 thẻ Power-up');
}

export function recordPowerUpUsed(state: GameState, playerId: PlayerId, definitionId: string): void {
  const playerName = activityPlayerName(state, playerId);
  const definition = OFFICIAL_POWER_UP_REGISTRY.get(definitionId);
  const cardName = definition.name;
  recordActivityEvent(state, { type: 'POWER_UP_USED', playerId, playerName, definitionId: definition.definitionId, cardName });
  sendToLog(state, escapeHtml(playerName) + ' đã dùng thẻ ' + escapeHtml(cardName));
}
