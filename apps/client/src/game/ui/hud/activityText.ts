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

const endpointName = (endpoint: Extract<ActivityEvent, { type: 'MONEY_TRANSFER' }>['source'], language: Language): string => (
  endpoint.kind === 'BANK' ? translate('activity.bank', language) : endpoint.name
);

/** Render committed activity semantics in the selected UI language; chat remains exactly as typed. */
export function activityText(event: ActivityEvent, language: Language = 'vi'): string {
  const t = (key: Parameters<typeof translate>[0], values?: Readonly<Record<string, string | number>>) => translate(key, language, values);
  switch (event.type) {
    case 'PLAYER_JOINED':
      return t('activity.playerJoined', { playerName: event.playerName });
    case 'GAME_STARTED':
      return t('activity.gameStarted', { playerName: event.startingPlayerName });
    case 'CHAT':
      return t('activity.chat', { senderName: event.senderName, message: event.message });
    case 'DICE_ROLL':
      return t('activity.diceRoll', {
        playerName: event.playerName,
        dice1: event.dice1,
        dice2: event.dice2,
        total: event.total,
        context: event.context === 'JAIL' ? t('activity.diceJail') : '',
      });
    case 'TILE_LANDED': {
      const tile = tileState[event.tileID];
      if (tile?.tileType === 'jail') return t('activity.visitingJail', { playerName: event.playerName });
      if (tile?.tileType === 'gojail') return t('activity.sentToJail', { playerName: event.playerName });
      return t('activity.landed', { playerName: event.playerName, tileName: getTileName(event.tileID, language) });
    }
    case 'PROPERTY_PURCHASE':
      return t('activity.purchased', { playerName: event.playerName, tileName: getTileName(event.tileID, language), price: formatMoney(event.price) });
    case 'PROPERTY_TRANSFER':
      return t('activity.propertyTransfer', { from: endpointName(event.from, language), tileName: getTileName(event.tileID, language), to: endpointName(event.to, language) });
    case 'MONEY_TRANSFER':
      return t('activity.moneyTransfer', {
        source: endpointName(event.source, language),
        amount: formatMoney(event.amount),
        destination: endpointName(event.destination, language),
        reason: t(moneyReasonKey[event.reason]),
      });
    case 'PROPERTY_DEVELOPMENT': {
      const street = getTileName(event.tileID, language);
      const cost = event.cost !== undefined ? ` (${formatMoney(event.cost)})` : '';
      if (event.action === 'SELL') {
        return t('activity.developmentSell', { playerName: event.playerName, tileName: street, amount: formatMoney(event.cost ?? 0) });
      }
      if (event.action === 'UPGRADE_HOTEL') {
        return event.ownerName
          ? t('activity.developmentHotelTeammate', { playerName: event.playerName, tileName: street, ownerName: event.ownerName, cost })
          : t('activity.developmentHotel', { playerName: event.playerName, tileName: street });
      }
      return event.ownerName
        ? t('activity.developmentBuildTeammate', { playerName: event.playerName, tileName: street, ownerName: event.ownerName, count: event.toHouses - event.fromHouses, cost })
        : t('activity.developmentBuild', { playerName: event.playerName, tileName: street, count: event.toHouses - event.fromHouses });
    }
    case 'CARD_REVEALED': {
      const card = getCardPresentation(event.cardId, language);
      const deck = t(event.deck === 'chance' ? 'board.chance' : 'board.communityChest');
      return t('activity.cardRevealed', { playerName: event.playerName, deck, message: card.message });
    }
    case 'JAIL':
      return t(jailActionKey[event.action], { playerName: event.playerName });
    case 'PLAYER_FINISHED':
      return event.reason === 'BANKRUPT'
        ? t('activity.playerBankrupt', { playerName: event.playerName })
        : t('activity.playerLeft', { playerName: event.playerName });
    case 'GAME_FINISHED':
      return event.winningTeamName
        ? t('activity.teamWinner', { teamName: event.winningTeamName, cash: formatMoney(event.finalCash) })
        : t('activity.playerWinner', { playerName: event.winnerName, cash: formatMoney(event.finalCash) });
    case 'TEAM_REVIVE':
      if (event.action === 'WINDOW_OPENED') {
        return t('activity.reviveWindow', { survivorName: event.survivorName, turns: event.turnsRemaining, playerName: event.playerName });
      }
      return event.action === 'REVIVED'
        ? t('activity.revived', { survivorName: event.survivorName, playerName: event.playerName })
        : t('activity.permanentlyEliminated', { playerName: event.playerName });
    case 'EMERGENCY_RESCUE':
      if (event.action === 'OFFERED') {
        return t('activity.rescueOffered', { rescuerName: event.rescuerName, amount: formatMoney(event.amount), debtorName: event.debtorName });
      }
      if (event.action === 'ACCEPTED') {
        return t('activity.rescueAccepted', { rescuerName: event.rescuerName, amount: formatMoney(event.amount), debtorName: event.debtorName });
      }
      return event.action === 'DECLINED'
        ? t('activity.rescueDeclined', { rescuerName: event.rescuerName, debtorName: event.debtorName })
        : t('activity.rescueExpired', { rescuerName: event.rescuerName, debtorName: event.debtorName });
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
