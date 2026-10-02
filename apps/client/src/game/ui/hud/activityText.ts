import type { ActivityEvent, MoneyTransferReason } from '@monopoly/shared';
import { formatMoney, gameCardsById, tileState } from '@monopoly/shared';

const moneyReasonLabel: Record<MoneyTransferReason, string> = {
  PROPERTY_PURCHASE: 'mua tài sản',
  PROPERTY_SALE: 'bán tài sản',
  RENT: 'tiền thuê',
  TAX: 'thuế',
  PASS_GO: 'đi qua GO',
  CARD: 'hiệu ứng thẻ',
  DEVELOPMENT: 'phát triển tài sản',
  BAIL: 'tiền bảo lãnh',
  TRADE: 'giao dịch',
  FORCED_SALE: 'bán bắt buộc',
  FORFEIT: 'bỏ cuộc',
  OTHER: 'giao dịch tiền',
};

const jailActionLabel: Record<Extract<ActivityEvent, { type: 'JAIL' }>['action'], string> = {
  ENTRY: 'vào tù',
  RELEASE: 'ra tù',
  FAILED_ROLL: 'chưa đổ được đôi trong tù',
};

const endpointName = (endpoint: Extract<ActivityEvent, { type: 'MONEY_TRANSFER' }>['source']): string => (
  endpoint.kind === 'BANK' ? 'Ngân hàng' : endpoint.name
);

/** The Vietnamese sentence for one activity event, shared by the log drawer and the activity ticker. */
export function activityText(event: ActivityEvent): string {
  switch (event.type) {
    case 'PLAYER_JOINED':
      return `${event.playerName} đã tham gia phòng.`;
    case 'GAME_STARTED':
      return `Ván chơi bắt đầu. ${event.startingPlayerName} đi trước.`;
    case 'CHAT':
      return `${event.senderName}: ${event.message}`;
    case 'DICE_ROLL':
      return `${event.playerName} đổ ${event.dice1} + ${event.dice2} = ${event.total}${event.context === 'JAIL' ? ' trong tù' : ''}.`;
    case 'TILE_LANDED': {
      const tile = tileState[event.tileID];
      if (tile?.tileType === 'jail') return `${event.playerName} đang Thăm Tù.`;
      if (tile?.tileType === 'gojail') return `${event.playerName} đã tới ô Vào Tù.`;
      return `${event.playerName} đã tới ${tile?.streetName ?? `ô ${event.tileID}`}.`;
    }
    case 'PROPERTY_PURCHASE':
      return `${event.playerName} đã mua ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`} với giá ${formatMoney(event.price)}.`;
    case 'PROPERTY_TRANSFER':
      return `${endpointName(event.from)} chuyển ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`} cho ${endpointName(event.to)}.`;
    case 'MONEY_TRANSFER':
      return `${endpointName(event.source)} trả ${formatMoney(event.amount)} cho ${endpointName(event.destination)} (${moneyReasonLabel[event.reason]}).`;
    case 'PROPERTY_DEVELOPMENT':
      return event.action === 'SELL'
        ? `${event.playerName} bán một cấp công trình tại ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`} và nhận ${formatMoney(event.cost ?? 0)}.`
        : event.action === 'UPGRADE_HOTEL'
          ? `${event.playerName} nâng cấp Khách sạn tại ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`}.`
          : `${event.playerName} xây ${event.toHouses - event.fromHouses} Nhà tại ${tileState[event.tileID]?.streetName ?? `ô ${event.tileID}`}.`;
    case 'CARD_REVEALED':
      return `${event.playerName} rút thẻ ${event.deck === 'chance' ? 'Cơ hội' : 'Khí vận'}: ${gameCardsById[event.cardId]?.message ?? event.cardId}`;
    case 'JAIL':
      return `${event.playerName} ${jailActionLabel[event.action]}.`;
    case 'PLAYER_FINISHED':
      return event.reason === 'BANKRUPT'
        ? `${event.playerName} đã phá sản và rời khỏi ván chơi.`
        : `${event.playerName} đã rời ván chơi.`;
    case 'GAME_FINISHED':
      return `${event.winnerName} chiến thắng với ${formatMoney(event.finalCash)}.`;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
