import type { GameCard } from './types';

// Vietnamese Cơ Hội deck. Absolute destinations use the canonical board
// indices; the movement helper is the only owner of pass-GO rewards.
const chanceCards: GameCard[] = [
  {
    id: 'chance-advance-start',
    sourceDeck: 'chance',
    message: 'Tiến đến ô Xuất Phát.',
    moveToTile: 0,
  },
  {
    id: 'chance-advance-landmark-81',
    sourceDeck: 'chance',
    message: 'Tiến đến Landmark 81.',
    moveToTile: 39,
  },
  {
    id: 'chance-advance-da-nang',
    sourceDeck: 'chance',
    message: 'Tiến đến Đà Nẵng.',
    moveToTile: 24,
  },
  {
    id: 'chance-trip-ga-ha-noi',
    sourceDeck: 'chance',
    message: 'Đi đến Ga Hà Nội.',
    moveToTile: 5,
  },
  {
    id: 'chance-back-three',
    sourceDeck: 'chance',
    message: 'Lùi lại 3 ô.',
    moveBy: -3,
  },
  {
    id: 'chance-go-to-jail',
    sourceDeck: 'chance',
    message: 'Vào Tù ngay. Không đi qua Xuất Phát.',
    goToJail: true,
  },
  {
    id: 'chance-property-repairs',
    sourceDeck: 'chance',
    message: 'Thanh toán phí sửa chữa tài sản 75.000 ₫.',
    penalty: 75,
  },
  {
    id: 'chance-traffic-fine',
    sourceDeck: 'chance',
    message: 'Đóng phạt giao thông 15.000 ₫.',
    penalty: 15,
  },
  {
    id: 'chance-community-event',
    sourceDeck: 'chance',
    message: 'Tổ chức sự kiện cộng đồng, tặng mỗi người chơi 50.000 ₫.',
    payEachPlayer: 50,
  },
  {
    id: 'chance-loan-matures',
    sourceDeck: 'chance',
    message: 'Khoản tiết kiệm đến hạn, nhận 150.000 ₫.',
    reward: 150,
  },
  {
    id: 'chance-dividend',
    sourceDeck: 'chance',
    message: 'Nhận cổ tức 50.000 ₫.',
    reward: 50,
  },
  {
    id: 'chance-administrative-fee',
    sourceDeck: 'chance',
    message: 'Thanh toán phí hành chính 15.000 ₫.',
    penalty: 15,
  },
  {
    id: 'chance-jail-free',
    sourceDeck: 'chance',
    message: 'Thẻ Thoát Tù Miễn Phí. Giữ thẻ đến khi sử dụng.',
    getOutOfJailFree: true,
  },
];

export default chanceCards;
