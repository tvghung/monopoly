import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECISION_SURFACES } from './decisionSurfaces';

// jsdom has no layout, so it has no scrollIntoView either: stand one in for the length of each test.
const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

function renderSurface(id: string) {
  const fixture = DECISION_SURFACES.find(surface => surface.id === id);
  if (!fixture) throw new Error(`No decision surface ${id}`);
  return render(<>{fixture.render()}</>);
}

describe('decision surfaces', () => {
  it('lists the buy and development sheets, jail, debt, forced sale, trade and incoming offers', () => {
    expect(DECISION_SURFACES.map(surface => surface.id)).toEqual([
      'buy', 'buy-short', 'development-houses', 'development-hotel', 'jail',
      'debt-debtor', 'debt-debtor-sale-open', 'debt-observer',
      'forced-sale-buyer', 'forced-sale-seller', 'trade', 'incoming-offers',
    ]);
    expect(DECISION_SURFACES.every(surface => surface.group === 'Decisions')).toBe(true);
  });

  it('debt-debtor is the alert dialog with four sales and the way out of the game', () => {
    renderSurface('debt-debtor');

    const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });
    expect(within(dialog).getAllByRole('button', { name: /^Bán .+ cho Ngân hàng$/u })).toHaveLength(4);
    expect(within(dialog).getByRole('button', { name: 'Bỏ cuộc' })).toBeTruthy();
    expect(within(dialog).queryByRole('group', { name: 'Chọn người mua' })).toBeNull();
  });

  it('debt-debtor-sale-open starts with the buyer list of the first sale open and scrolled into view', async () => {
    renderSurface('debt-debtor-sale-open');

    expect(await screen.findByRole('group', { name: 'Chọn người mua' })).toBeTruthy();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' }));
    expect(screen.getByRole('radio', { name: /Bình/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gửi đề nghị bán' })).toBeTruthy();
  });

  it('debt-observer is the inline status another player sees', () => {
    renderSurface('debt-observer');

    expect(screen.getByRole('status').textContent).toContain('An đang thiếu 210.000 ₫');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('forced-sale-buyer answers the proposal and forced-sale-seller can only wait or cancel', () => {
    const buyer = renderSurface('forced-sale-buyer');
    expect(screen.getByRole('button', { name: 'Chấp nhận' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    buyer.unmount();

    renderSurface('forced-sale-seller');
    expect(screen.getByText('Đang chờ Bình phản hồi.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hủy đề nghị' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chấp nhận' })).toBeNull();
  });

  it('trade has deeds to pick on both sides and a held Get Out Of Jail Free card', () => {
    renderSurface('trade');

    const give = screen.getByRole('group', { name: 'Bạn giao' });
    const receive = screen.getByRole('group', { name: 'Bạn nhận' });
    expect(within(give).getAllByRole('checkbox').length).toBeGreaterThan(2);
    expect(within(give).getByRole('checkbox', { name: /Thẻ Thoát Tù Miễn Phí/u })).toBeTruthy();
    expect(within(receive).getAllByRole('checkbox').length).toBeGreaterThan(2);
    expect(within(receive).getByRole<HTMLInputElement>('checkbox', { name: 'Hải Phòng' }).checked).toBe(true);
  });

  it('incoming-offers shows deeds and cash on both sides of one pending offer', () => {
    renderSurface('incoming-offers');

    const dialog = screen.getByRole('dialog', { name: 'Đề nghị giao dịch' });
    expect(within(dialog).getByRole('heading', { name: 'Đề nghị từ Bình' })).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Bình giao' }).textContent).toContain('100.000 ₫');
    expect(within(dialog).getByRole('group', { name: 'Bạn giao' }).textContent).toContain('25.000 ₫');
    expect(within(dialog).getByRole('button', { name: 'Chấp nhận' })).toBeTruthy();
  });
});
