import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRoom } from '../../presentation/testFixtures';
import { buildDeedCardModel } from './deedCardModel';
import PropertyDeedCard, { type DeedVariant } from './PropertyDeedCard';

afterEach(cleanup);

type Owned = Record<number, { id: string; color: 'red'; houses: number }>;

function renderDeed(tileId: number, ownedProps: Owned = {}, variant: DeedVariant = 'full', showOwner = true, showNext = false) {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = ownedProps;
  const model = buildDeedCardModel({ tileId, state: room.gameState, roomPlayers: room.players, theme: 'v2' })!;
  return render(<PropertyDeedCard model={model} variant={variant} showOwner={showOwner} showNext={showNext} />);
}

describe('PropertyDeedCard', () => {
  it('is an article named by the tile, with the district band colors set from the model', () => {
    const { container } = renderDeed(1);
    const card = screen.getByRole('article', { name: 'Cà Mau' });
    expect(card.className).toContain('deed--full');
    expect(card.style.getPropertyValue('--deed-color')).toBe('#8D5B3E');
    expect(card.style.getPropertyValue('--deed-text')).toBe('#ffffff');
    expect(container.querySelector('.deed__group')?.textContent).toBe('Nhóm Nâu');
    expect(container.querySelector('.deed__art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('prints the price and the rent ladder as a table with a caption and one current row', () => {
    const { container } = renderDeed(1, { 1: { id: 'player-a', color: 'red', houses: 2 } }, 'full', true, true);
    expect(screen.getByText('Giá mua').nextElementSibling?.textContent).toBe('60.000 ₫');
    const table = screen.getByRole('table', { name: 'Bảng giá thuê' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(6);
    const current = rows.filter(row => row.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Có 2 Nhà');
    expect(current[0].textContent).toContain('30.000 ₫');
    expect(current[0].textContent).toContain('Hiện tại');
    expect(container.querySelector('.property-inspection__detail--current')).toBe(current[0]);
    expect(screen.getByText('Sau khi xây').closest('tr')?.textContent).toContain('Có 3 Nhà');
    expect(screen.getByText('Giá mỗi Nhà / Khách Sạn').nextElementSibling?.textContent).toBe('50.000 ₫');
    expect(screen.getByText(/Sở hữu cả nhóm/u)).toBeTruthy();
    expect(screen.getByText('Phát triển').nextElementSibling?.textContent).toBe('2 Nhà');
  });

  it('marks the next development row only when asked to (the development sheet), never in a plain view', () => {
    const owned: Owned = { 1: { id: 'player-a', color: 'red', houses: 2 } };
    const { unmount } = renderDeed(1, owned);
    expect(screen.queryByText('Sau khi xây')).toBeNull();
    expect(document.querySelector('.deed__row--next')).toBeNull();
    unmount();
    renderDeed(1, owned, 'full', true, true);
    expect(screen.getByText('Sau khi xây')).toBeTruthy();
  });

  it('shows the owner and the group progress, labelled for assistive technology', () => {
    const { container } = renderDeed(1, {
      1: { id: 'player-a', color: 'red', houses: 0 },
      3: { id: 'player-b', color: 'red', houses: 0 },
    });
    expect(container.querySelector('.deed__owner')?.textContent).toContain('An');
    const progress = screen.getByRole('img', { name: 'An sở hữu 1/2' });
    expect(progress.querySelectorAll('.deed__pip')).toHaveLength(2);
    expect(progress.querySelectorAll('.deed__pip--owned')).toHaveLength(2);
  });

  it('says so when a tile has no owner, and can leave the owner row out', () => {
    const { container, rerender } = renderDeed(1);
    expect(container.querySelector('.deed__owner-name--none')?.textContent).toBe('Chưa có chủ');
    const room = makeRoom();
    const model = buildDeedCardModel({ tileId: 1, state: room.gameState })!;
    rerender(<PropertyDeedCard model={model} showOwner={false} />);
    expect(container.querySelector('.deed__owner')).toBeNull();
  });

  it('renders a compact card without the table, with only the rent in force', () => {
    const { container } = renderDeed(1, { 1: { id: 'player-a', color: 'red', houses: 1 } }, 'compact');
    expect(screen.queryByRole('table')).toBeNull();
    expect(container.querySelector('.deed__current')?.textContent).toContain('Có 1 Nhà');
    expect(container.querySelector('.deed__current')?.textContent).toContain('10.000 ₫');
    expect(container.querySelector('.deed__development')).toBeNull();
  });

  it('renders a one-line chip with the swatch, the name and the price', () => {
    const { container } = renderDeed(6, {}, 'chip');
    const chip = container.querySelector('.deed--chip') as HTMLElement;
    expect(chip.querySelector('.deed-chip__name')?.textContent).toBe('Buôn Ma Thuột');
    expect(chip.querySelector('.deed-chip__price')?.textContent).toBe('100.000 ₫');
    expect(chip.querySelector('.deed-chip__swatch')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('shows the utility multiplier rows and the railroad count rows', () => {
    renderDeed(12, { 12: { id: 'player-a', color: 'red', houses: 0 } });
    const table = screen.getByRole('table', { name: 'Bảng giá thuê' });
    expect(within(table).getByText('Sở hữu cả 2 Công Ty')).toBeTruthy();
    expect(within(table).getAllByRole('row').filter(row => row.getAttribute('aria-current') === 'true')[0].textContent)
      .toContain('Sở hữu 1 Công Ty');
  });

  it('renders a special tile as a rule card without price, ladder or owner', () => {
    const { container } = renderDeed(4);
    expect(screen.getByRole('article', { name: 'Thuế Thu Nhập' })).toBeTruthy();
    expect(container.querySelector('.deed__rule')?.textContent).toBe('Nộp 200.000 ₫ cho Ngân hàng khi dừng tại đây.');
    expect(screen.queryByRole('table')).toBeNull();
    expect(container.querySelector('.deed__owner')).toBeNull();
    expect(container.querySelector('.deed__price')).toBeNull();
    // The neutral paper header comes from the .deed--special rule, so no district color is set inline.
    const card = screen.getByRole('article', { name: 'Thuế Thu Nhập' });
    expect(card.style.getPropertyValue('--deed-color')).toBe('');
    expect(card.style.getPropertyValue('--deed-text')).toBe('');
  });
});
