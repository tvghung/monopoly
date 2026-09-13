import type { CardDeck, GameCardId } from '@monopoly/shared';

export interface CardVisualDefinition {
  title: string;
  artworkUrl: string;
  deck: CardDeck;
}

export function publicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${relativePath.replace(/^\//, '')}`;
}

const visual = (
  deck: CardDeck,
  id: GameCardId,
  title: string,
): CardVisualDefinition => ({
  title,
  deck,
  artworkUrl: publicAssetUrl(`art/cards/${deck}/${id}.svg`),
});

export const cardVisuals = {
  'chance-advance-start': visual('chance', 'chance-advance-start', 'Tiến đến Xuất Phát'),
  'chance-advance-landmark-81': visual('chance', 'chance-advance-landmark-81', 'Landmark 81'),
  'chance-advance-da-nang': visual('chance', 'chance-advance-da-nang', 'Đà Nẵng'),
  'chance-trip-ga-ha-noi': visual('chance', 'chance-trip-ga-ha-noi', 'Ga Hà Nội'),
  'chance-back-three': visual('chance', 'chance-back-three', 'Lùi 3 ô'),
  'chance-go-to-jail': visual('chance', 'chance-go-to-jail', 'Vào Tù'),
  'chance-property-repairs': visual('chance', 'chance-property-repairs', 'Sửa chữa tài sản'),
  'chance-traffic-fine': visual('chance', 'chance-traffic-fine', 'Phạt giao thông'),
  'chance-community-event': visual('chance', 'chance-community-event', 'Sự kiện cộng đồng'),
  'chance-loan-matures': visual('chance', 'chance-loan-matures', 'Khoản tiết kiệm đến hạn'),
  'chance-dividend': visual('chance', 'chance-dividend', 'Cổ tức'),
  'chance-administrative-fee': visual('chance', 'chance-administrative-fee', 'Phí hành chính'),
  'chance-jail-free': visual('chance', 'chance-jail-free', 'Thoát Tù Miễn Phí'),
  'chest-advance-start': visual('chest', 'chest-advance-start', 'Tiến đến Xuất Phát'),
  'chest-bank-adjustment': visual('chest', 'chest-bank-adjustment', 'Điều chỉnh ngân hàng'),
  'chest-medical-fee': visual('chest', 'chest-medical-fee', 'Phí khám bệnh'),
  'chest-investment-return': visual('chest', 'chest-investment-return', 'Lợi nhuận đầu tư'),
  'chest-go-to-jail': visual('chest', 'chest-go-to-jail', 'Vào Tù'),
  'chest-tet-bonus': visual('chest', 'chest-tet-bonus', 'Thưởng Tết'),
  'chest-tax-refund': visual('chest', 'chest-tax-refund', 'Hoàn thuế'),
  'chest-birthday': visual('chest', 'chest-birthday', 'Sinh nhật'),
  'chest-insurance': visual('chest', 'chest-insurance', 'Bảo hiểm đến hạn'),
  'chest-hospital-fee': visual('chest', 'chest-hospital-fee', 'Viện phí'),
  'chest-tuition-fee': visual('chest', 'chest-tuition-fee', 'Học phí'),
  'chest-consulting-fee': visual('chest', 'chest-consulting-fee', 'Phí tư vấn'),
  'chest-lucky-prize': visual('chest', 'chest-lucky-prize', 'Giải khuyến khích'),
  'chest-inheritance': visual('chest', 'chest-inheritance', 'Thừa kế'),
  'chest-jail-free': visual('chest', 'chest-jail-free', 'Thoát Tù Miễn Phí'),
} satisfies Readonly<Record<GameCardId, CardVisualDefinition>>;

export function cardVisualFor(cardId: GameCardId): CardVisualDefinition | undefined {
  return cardVisuals[cardId as keyof typeof cardVisuals];
}
