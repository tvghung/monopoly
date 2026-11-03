import type { ActivityEvent, MoneyTransferReason } from '@monopoly/shared';
import { formatMoney, tileState } from '@monopoly/shared';
import type { Language } from '../../../i18n/I18n';
import { translate } from '../../../i18n/I18n';
import { getCardPresentation } from '../../../i18n/cardCopy';
import { getTileName } from '../formatters';

const moneyReasonKey: Record<MoneyTransferReason, Parameters<typeof translate>[0]> = {
  PROPERTY_PURCHASE: 'activity.reason.PROP',
  PROPERTY_SALE: 'activity.reason.SALE',
  RENT: 'activity.reason.RENT',
  TAX: 'activity.reason.TAX',
  PASS_GO: 'activity.reason.GO',
  CARD: 'activity.reason.CARD',
  DEVELOPMENT: 'activity.reason.DEVELOPMENT',
  BAIL: 'activity.reason.BAIL',
  TRADE: 'activity.reason.TRADE',
  FORCED_SALE: 'activity.reason.FORCED_SALE',
  FORFEIT: 'activity.reason.FORFEIT',
  REVIVE: 'activity.reason.REVIVE',
  RESCUE: 'activity.reason.RESCUE',
  OTHER: 'activity.reason.OTHER',
};

const jailActionKey: Record<Extract<ActivityEvent, { type: 'JAIL' }>['action'], Parameters<typeof translate>[0]> = {
  ENTRY: 'activity.jail.ENTRY',
  RELEASE: 'activity.jail.RELEASE',
  FAILED_ROLL: 'activity.jail.FAILED_ROLL',
};

export interface ActivitySegment {
  text: string;
  playerId?: string;
}

type ActivityValue = string | number | ActivitySegment;
const player = (text: string, playerId: string | undefined): ActivitySegment => ({ text, playerId });

/** Split only catalog placeholders, never player names or user-controlled text. */
function messageSegments(key: Parameters<typeof translate>[0], language: Language, values: Readonly<Record<string, ActivityValue>> = {}): ActivitySegment[] {
  const template = translate(key, language);
  const segments: ActivitySegment[] = [];
  let cursor = 0;
  for (const match of template.matchAll(/\{([^}]+)\}/gu)) {
    if (match.index > cursor) segments.push({ text: template.slice(cursor, match.index) });
    const value = values[match[1]] ?? match[0];
    segments.push(typeof value === 'object' ? value : { text: String(value) });
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) segments.push({ text: template.slice(cursor) });
  return segments;
}

const endpointName = (endpoint: Extract<ActivityEvent, { type: 'MONEY_TRANSFER' }>['source'], language: Language): ActivityValue => (
  endpoint.kind === 'BANK' ? translate('activity.bank', language) : player(endpoint.name, endpoint.playerId)
);

/** Render committed activity semantics in the selected UI language; chat remains exactly as typed. */
export function activitySegments(event: ActivityEvent, language: Language = 'vi'): ActivitySegment[] {
  const plain = (key: Parameters<typeof translate>[0]) => translate(key, language);
  const t = (key: Parameters<typeof translate>[0], values?: Readonly<Record<string, ActivityValue>>) => messageSegments(key, language, values);
  switch (event.type) {
    case 'POWER_UP_RECEIVED':
      return t('activity.powerUpReceived', { playerName: player(event.playerName, event.playerId) });
    case 'POWER_UP_USED':
      return t('activity.powerUpUsed', { playerName: player(event.playerName, event.playerId), cardName: event.cardName });
    case 'PLAYER_JOINED':
      return t('activity.playerJoined', { playerName: player(event.playerName, event.playerId) });
    case 'GAME_STARTED':
      return t('activity.gameStarted', { playerName: player(event.startingPlayerName, event.startingPlayerId) });
    case 'CHAT':
      return t('activity.chat', { senderName: event.senderName, message: event.message });
    case 'DICE_ROLL':
      return t('activity.diceRoll', {
        playerName: player(event.playerName, event.playerId),
        dice1: event.dice1,
        dice2: event.dice2,
        total: event.total,
        context: event.context === 'JAIL' ? plain('activity.diceJail') : '',
      });
    case 'TILE_LANDED': {
      const tile = tileState[event.tileID];
      if (tile?.tileType === 'jail') return t('activity.visitingJail', { playerName: player(event.playerName, event.playerId) });
      if (tile?.tileType === 'gojail') return t('activity.sentToJail', { playerName: player(event.playerName, event.playerId) });
      return t('activity.landed', { playerName: player(event.playerName, event.playerId), tileName: getTileName(event.tileID, language) });
    }
    case 'PROPERTY_PURCHASE':
      return t('activity.purchased', { playerName: player(event.playerName, event.playerId), tileName: getTileName(event.tileID, language), price: formatMoney(event.price) });
    case 'PROPERTY_TRANSFER':
      return t('activity.propertyTransfer', { from: endpointName(event.from, language), tileName: getTileName(event.tileID, language), to: endpointName(event.to, language) });
    case 'MONEY_TRANSFER':
      return t('activity.moneyTransfer', {
        source: endpointName(event.source, language),
        amount: formatMoney(event.amount),
        destination: endpointName(event.destination, language),
        reason: plain(moneyReasonKey[event.reason]),
      });
    case 'PROPERTY_DEVELOPMENT': {
      const street = getTileName(event.tileID, language);
      const cost = event.cost !== undefined ? ` (${formatMoney(event.cost)})` : '';
      if (event.action === 'SELL') {
        return t('activity.developmentSell', { playerName: player(event.playerName, event.playerId), tileName: street, amount: formatMoney(event.cost ?? 0) });
      }
      if (event.action === 'UPGRADE_HOTEL') {
        return event.ownerName
          ? t('activity.developmentHotelTeammate', { playerName: player(event.playerName, event.playerId), tileName: street, ownerName: player(event.ownerName, event.ownerPlayerId), cost })
          : t('activity.developmentHotel', { playerName: player(event.playerName, event.playerId), tileName: street });
      }
      return event.ownerName
        ? t('activity.developmentBuildTeammate', { playerName: player(event.playerName, event.playerId), tileName: street, ownerName: player(event.ownerName, event.ownerPlayerId), count: event.toHouses - event.fromHouses, cost })
        : t('activity.developmentBuild', { playerName: player(event.playerName, event.playerId), tileName: street, count: event.toHouses - event.fromHouses });
    }
    case 'CARD_REVEALED': {
      const card = getCardPresentation(event.cardId, language);
      const deck = plain(event.deck === 'chance' ? 'board.chance' : 'board.communityChest');
      return t('activity.cardRevealed', { playerName: player(event.playerName, event.playerId), deck, message: card.message });
    }
    case 'JAIL':
      return t(jailActionKey[event.action], { playerName: player(event.playerName, event.playerId) });
    case 'PLAYER_FINISHED':
      return event.reason === 'BANKRUPT'
        ? t('activity.playerBankrupt', { playerName: player(event.playerName, event.playerId) })
        : t('activity.playerLeft', { playerName: player(event.playerName, event.playerId) });
    case 'GAME_FINISHED':
      return event.winningTeamName
        ? t('activity.teamWinner', { teamName: event.winningTeamName, cash: formatMoney(event.finalCash) })
        : t('activity.playerWinner', { playerName: player(event.winnerName, event.winnerPlayerId), cash: formatMoney(event.finalCash) });
    case 'TEAM_REVIVE':
      if (event.action === 'WINDOW_OPENED') {
        return t('activity.reviveWindow', { survivorName: player(event.survivorName, event.survivorPlayerId), turns: event.turnsRemaining, playerName: player(event.playerName, event.playerId) });
      }
      return event.action === 'REVIVED'
        ? t('activity.revived', { survivorName: player(event.survivorName, event.survivorPlayerId), playerName: player(event.playerName, event.playerId) })
        : t('activity.permanentlyEliminated', { playerName: player(event.playerName, event.playerId) });
    case 'EMERGENCY_RESCUE':
      if (event.action === 'OFFERED') {
        return t('activity.rescueOffered', { rescuerName: player(event.rescuerName, event.rescuerPlayerId), amount: formatMoney(event.amount), debtorName: player(event.debtorName, event.debtorPlayerId) });
      }
      if (event.action === 'ACCEPTED') {
        return t('activity.rescueAccepted', { rescuerName: player(event.rescuerName, event.rescuerPlayerId), amount: formatMoney(event.amount), debtorName: player(event.debtorName, event.debtorPlayerId) });
      }
      return event.action === 'DECLINED'
        ? t('activity.rescueDeclined', { rescuerName: player(event.rescuerName, event.rescuerPlayerId), debtorName: player(event.debtorName, event.debtorPlayerId) })
        : t('activity.rescueExpired', { rescuerName: player(event.rescuerName, event.rescuerPlayerId), debtorName: player(event.debtorName, event.debtorPlayerId) });
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Plain-text consumers (ticker/chat bubbles) keep the exact same wording. */
export function activityText(event: ActivityEvent, language: Language = 'vi'): string {
  return activitySegments(event, language).map(segment => segment.text).join('');
}
