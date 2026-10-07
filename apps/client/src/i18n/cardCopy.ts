import type { GameCardId } from '@monopoly/shared';
import type { Language } from './I18n';

export interface CardPresentation {
  title: string;
  message: string;
}

const vi = {
  'chance-advance-start': { title: 'Tiến đến Xuất Phát', message: 'Tiến đến ô Xuất Phát.' },
  'chance-advance-landmark-81': { title: 'Landmark 81', message: 'Tiến đến Landmark 81.' },
  'chance-advance-da-nang': { title: 'Đà Nẵng', message: 'Tiến đến Đà Nẵng.' },
  'chance-trip-ga-ha-noi': { title: 'Ga Hà Nội', message: 'Đi đến Ga Hà Nội.' },
  'chance-back-three': { title: 'Lùi 3 ô', message: 'Lùi lại 3 ô.' },
  'chance-go-to-jail': { title: 'Vào Tù', message: 'Vào Tù ngay. Không đi qua Xuất Phát.' },
  'chance-property-repairs': { title: 'Sửa chữa tài sản', message: 'Thanh toán phí sửa chữa tài sản 75.000 ₫.' },
  'chance-traffic-fine': { title: 'Phạt giao thông', message: 'Đóng phạt giao thông 15.000 ₫.' },
  'chance-community-event': { title: 'Sự kiện cộng đồng', message: 'Tổ chức sự kiện cộng đồng, tặng mỗi người chơi 50.000 ₫.' },
  'chance-loan-matures': { title: 'Khoản tiết kiệm đến hạn', message: 'Khoản tiết kiệm đến hạn, nhận 150.000 ₫.' },
  'chance-dividend': { title: 'Cổ tức', message: 'Nhận cổ tức 50.000 ₫.' },
  'chance-administrative-fee': { title: 'Phí hành chính', message: 'Thanh toán phí hành chính 15.000 ₫.' },
  'chance-jail-free': { title: 'Thoát Tù Miễn Phí', message: 'Thẻ Thoát Tù Miễn Phí. Giữ thẻ đến khi sử dụng.' },
  'chest-advance-start': { title: 'Tiến đến Xuất Phát', message: 'Tiến đến ô Xuất Phát.' },
  'chest-bank-adjustment': { title: 'Điều chỉnh ngân hàng', message: 'Ngân hàng điều chỉnh có lợi cho bạn, nhận 200.000 ₫.' },
  'chest-medical-fee': { title: 'Phí khám bệnh', message: 'Thanh toán phí khám bệnh 50.000 ₫.' },
  'chest-investment-return': { title: 'Lợi nhuận đầu tư', message: 'Nhận lợi nhuận đầu tư 50.000 ₫.' },
  'chest-go-to-jail': { title: 'Vào Tù', message: 'Vào Tù ngay. Không đi qua Xuất Phát.' },
  'chest-tet-bonus': { title: 'Thưởng Tết', message: 'Nhận thưởng Tết 100.000 ₫.' },
  'chest-tax-refund': { title: 'Hoàn thuế', message: 'Nhận hoàn thuế 20.000 ₫.' },
  'chest-birthday': { title: 'Sinh nhật', message: 'Mừng sinh nhật, nhận 10.000 ₫ từ mỗi người chơi.' },
  'chest-insurance': { title: 'Bảo hiểm đến hạn', message: 'Khoản bảo hiểm đến hạn, nhận 100.000 ₫.' },
  'chest-hospital-fee': { title: 'Viện phí', message: 'Thanh toán viện phí 100.000 ₫.' },
  'chest-tuition-fee': { title: 'Học phí', message: 'Thanh toán học phí 50.000 ₫.' },
  'chest-consulting-fee': { title: 'Phí tư vấn', message: 'Nhận phí tư vấn 25.000 ₫.' },
  'chest-lucky-prize': { title: 'Giải khuyến khích', message: 'Trúng giải khuyến khích, nhận 10.000 ₫.' },
  'chest-inheritance': { title: 'Thừa kế', message: 'Nhận tài sản thừa kế 100.000 ₫.' },
  'chest-jail-free': { title: 'Thoát Tù Miễn Phí', message: 'Thẻ Thoát Tù Miễn Phí. Giữ thẻ đến khi sử dụng.' },
} satisfies Record<GameCardId, CardPresentation>;

const en = {
  'chance-advance-start': { title: 'Advance to GO', message: 'Advance to GO.' },
  'chance-advance-landmark-81': { title: 'Landmark 81', message: 'Advance to Landmark 81.' },
  'chance-advance-da-nang': { title: 'Đà Nẵng', message: 'Advance to Đà Nẵng.' },
  'chance-trip-ga-ha-noi': { title: 'Hà Nội Station', message: 'Take a trip to Hà Nội Station.' },
  'chance-back-three': { title: 'Move Back 3 Spaces', message: 'Move back 3 spaces.' },
  'chance-go-to-jail': { title: 'Go to Jail', message: 'Go directly to Jail. Do not pass GO.' },
  'chance-property-repairs': { title: 'Property Repairs', message: 'Pay ₫75,000 for property repairs.' },
  'chance-traffic-fine': { title: 'Traffic Fine', message: 'Pay a ₫15,000 traffic fine.' },
  'chance-community-event': { title: 'Community Event', message: 'Host a community event. Pay each player ₫50,000.' },
  'chance-loan-matures': { title: 'Savings Mature', message: 'Your savings have matured. Collect ₫150,000.' },
  'chance-dividend': { title: 'Dividend', message: 'Collect a ₫50,000 dividend.' },
  'chance-administrative-fee': { title: 'Administrative Fee', message: 'Pay a ₫15,000 administrative fee.' },
  'chance-jail-free': { title: 'Get Out of Jail Free', message: 'Get Out of Jail Free. Keep this card until you need it.' },
  'chest-advance-start': { title: 'Advance to GO', message: 'Advance to GO.' },
  'chest-bank-adjustment': { title: 'Bank Adjustment', message: 'A bank adjustment is in your favor. Collect ₫200,000.' },
  'chest-medical-fee': { title: 'Medical Fee', message: 'Pay a ₫50,000 medical fee.' },
  'chest-investment-return': { title: 'Investment Return', message: 'Collect a ₫50,000 investment return.' },
  'chest-go-to-jail': { title: 'Go to Jail', message: 'Go directly to Jail. Do not pass GO.' },
  'chest-tet-bonus': { title: 'Tết Bonus', message: 'Collect a ₫100,000 Tết bonus.' },
  'chest-tax-refund': { title: 'Tax Refund', message: 'Collect a ₫20,000 tax refund.' },
  'chest-birthday': { title: 'Birthday', message: 'It is your birthday. Collect ₫10,000 from each player.' },
  'chest-insurance': { title: 'Insurance Payout', message: 'Your insurance is due. Collect ₫100,000.' },
  'chest-hospital-fee': { title: 'Hospital Fee', message: 'Pay a ₫100,000 hospital fee.' },
  'chest-tuition-fee': { title: 'Tuition Fee', message: 'Pay a ₫50,000 tuition fee.' },
  'chest-consulting-fee': { title: 'Consulting Fee', message: 'Collect a ₫25,000 consulting fee.' },
  'chest-lucky-prize': { title: 'Consolation Prize', message: 'You won a consolation prize. Collect ₫10,000.' },
  'chest-inheritance': { title: 'Inheritance', message: 'Collect a ₫100,000 inheritance.' },
  'chest-jail-free': { title: 'Get Out of Jail Free', message: 'Get Out of Jail Free. Keep this card until you need it.' },
} satisfies Record<keyof typeof vi, CardPresentation>;

export function getCardPresentation(cardId: GameCardId, language: Language): CardPresentation {
  const id = cardId as keyof typeof vi;
  return (language === 'en' ? en : vi)[id];
}
