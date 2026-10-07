import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRoom, makeTeamRoom } from '../../presentation/testFixtures';
import { getTileName } from '../formatters';
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
    expect(container.querySelector('.deed__group')?.textContent).toBe('Nâu');
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
    expect(screen.getByText(/Sở hữu cả khu/u).textContent).toContain('Xây Nhà không cần đủ khu');
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

  it('shows the completed-set bonus line with the rent it makes now, only while the owner holds the whole group', () => {
    const { container, unmount } = renderDeed(1, {
      1: { id: 'player-a', color: 'red', houses: 2 },
      3: { id: 'player-a', color: 'red', houses: 0 },
    });
    const bonus = container.querySelector('.deed__bonus') as HTMLElement;
    expect(bonus.getAttribute('data-rent-bonus')).toBe('150');
    expect(bonus.textContent).toContain('Đủ khu: tiền thuê ×1,5');
    expect(bonus.textContent).toContain('Hiện thu 45.000 ₫');
    unmount();
    const partial = renderDeed(1, {
      1: { id: 'player-a', color: 'red', houses: 2 },
      3: { id: 'player-b', color: 'red', houses: 0 },
    });
    expect(partial.container.querySelector('.deed__bonus')).toBeNull();
  });

  it('2v2: names the owner\'s team, how they relate to the viewer and counts the whole team toward the set', () => {
    const room = makeTeamRoom();
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 1 },
      3: { id: 'player-c', color: 'red', houses: 0 },
    };
    const model = buildDeedCardModel({
      tileId: 1, state: room.gameState, roomPlayers: room.players, theme: 'v2', viewerPlayerId: 'player-c',
    })!;
    const { container } = render(<PropertyDeedCard model={model} />);
    expect(container.querySelector('.deed__owner-team')?.textContent).toBe('Đội Team 1 · đồng đội của bạn');
    expect(container.querySelector('.deed__bonus')?.textContent).toContain('Cả đội đủ khu: tiền thuê ×2');
    expect(screen.getByRole('img', { name: 'Đội Team 1 sở hữu 2/2' })).toBeTruthy();
    // Both teammates share the ownership colour, so the pips carry the holder's name for a pointer user.
    const titles = [...container.querySelectorAll('.deed__pip')].map(pip => pip.getAttribute('title'));
    expect(titles).toEqual([getTileName(1) + ' · An', getTileName(3) + ' · Chi']);
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

  it('shows the landmark of a street: its picture in the art slot, its name under the tile name, the card described by it', () => {
    const { container } = renderDeed(13);
    const card = screen.getByRole('article', { name: 'Hội An' });
    const line = screen.getByText('Khách sạn · Chùa Cầu');
    expect(line.className).toBe('deed__landmark');
    expect(card.getAttribute('aria-describedby')).toBe(line.id);
    const art = container.querySelector('.deed__art');
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(art?.getAttribute('data-deed-art')).toBe('landmark');
    const image = art?.querySelector('img');
    expect(image?.getAttribute('src')).toContain('/art/landmarks/13.svg');
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('shows the landmark in the compact card too, and not in the one-line chip', () => {
    const { container, unmount } = renderDeed(24, {}, 'compact');
    expect(screen.getByText('Khách sạn · Cầu Vàng')).toBeTruthy();
    expect(container.querySelector('.deed__art img')?.getAttribute('src')).toContain('/art/landmarks/24.svg');
    unmount();
    const chip = renderDeed(24, {}, 'chip');
    expect(chip.container.querySelector('.deed__landmark')).toBeNull();
    expect(chip.container.querySelector('img')).toBeNull();
  });

  it('falls back to the district motif when the landmark picture cannot be loaded', () => {
    const { container } = renderDeed(13);
    fireEvent.error(container.querySelector('.deed__art img') as HTMLImageElement);
    expect(container.querySelector('.deed__art img')).toBeNull();
    expect(container.querySelector('.deed__art')?.getAttribute('data-deed-art')).not.toBe('landmark');
    expect(container.querySelector('.deed__art svg')).not.toBeNull();
    // The landmark name stays printed, so the information is not lost with the picture.
    expect(screen.getByText('Khách sạn · Chùa Cầu')).toBeTruthy();
  });

  it('gives stations, utilities and special tiles no landmark', () => {
    for (const tileId of [4, 5, 12]) {
      const { container, unmount } = renderDeed(tileId);
      expect(container.querySelector('.deed__landmark'), `tile ${tileId}`).toBeNull();
      expect(container.querySelector('.deed__art img'), `tile ${tileId}`).toBeNull();
      expect(container.querySelector('article')?.hasAttribute('aria-describedby'), `tile ${tileId}`).toBe(false);
      unmount();
    }
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
