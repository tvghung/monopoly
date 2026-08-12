import type { GameCard } from './types';

// Vietnamese Khí Vận deck. The values retain the existing game-unit balance.
const chestCards: GameCard[] = [
  {
    id: 'chest-advance-start',
    sourceDeck: 'chest',
    message: 'Tiến đến ô Xuất Phát.',
    moveToTile: 0,
  },
  {
    id: 'chest-bank-adjustment',
    sourceDeck: 'chest',
    message: 'Ngân hàng điều chỉnh có lợi cho bạn, nhận 200.000 ₫.',
    reward: 200,
  },
  {
    id: 'chest-medical-fee',
    sourceDeck: 'chest',
    message: 'Thanh toán phí khám bệnh 50.000 ₫.',
    penalty: 50,
  },
  {
    id: 'chest-investment-return',
    sourceDeck: 'chest',
    message: 'Nhận lợi nhuận đầu tư 50.000 ₫.',
    reward: 50,
  },
  {
    id: 'chest-go-to-jail',
    sourceDeck: 'chest',
    message: 'Vào Tù ngay. Không đi qua Xuất Phát.',
    goToJail: true,
  },
  {
    id: 'chest-tet-bonus',
    sourceDeck: 'chest',
    message: 'Nhận thưởng Tết 100.000 ₫.',
    reward: 100,
  },
  {
    id: 'chest-tax-refund',
    sourceDeck: 'chest',
    message: 'Nhận hoàn thuế 20.000 ₫.',
    reward: 20,
  },
  {
    id: 'chest-birthday',
    sourceDeck: 'chest',
    message: 'Mừng sinh nhật, nhận 10.000 ₫ từ mỗi người chơi.',
    collectFromEachPlayer: 10,
  },
  {
    id: 'chest-insurance',
    sourceDeck: 'chest',
    message: 'Khoản bảo hiểm đến hạn, nhận 100.000 ₫.',
    reward: 100,
  },
  {
    id: 'chest-hospital-fee',
    sourceDeck: 'chest',
    message: 'Thanh toán viện phí 100.000 ₫.',
    penalty: 100,
  },
  {
    id: 'chest-tuition-fee',
    sourceDeck: 'chest',
    message: 'Thanh toán học phí 50.000 ₫.',
    penalty: 50,
  },
  {
    id: 'chest-consulting-fee',
    sourceDeck: 'chest',
    message: 'Nhận phí tư vấn 25.000 ₫.',
    reward: 25,
  },
  {
    id: 'chest-lucky-prize',
    sourceDeck: 'chest',
    message: 'Trúng giải khuyến khích, nhận 10.000 ₫.',
    reward: 10,
  },
  {
    id: 'chest-inheritance',
    sourceDeck: 'chest',
    message: 'Nhận tài sản thừa kế 100.000 ₫.',
    reward: 100,
  },
  {
    id: 'chest-jail-free',
    sourceDeck: 'chest',
    message: 'Thẻ Thoát Tù Miễn Phí. Giữ thẻ đến khi sử dụng.',
    getOutOfJailFree: true,
  },
];

export default chestCards;
