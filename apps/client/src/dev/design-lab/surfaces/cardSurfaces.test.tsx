import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CARD_SURFACES } from './cardSurfaces';

afterEach(cleanup);

function renderSurface(id: string) {
  const surface = CARD_SURFACES.find(candidate => candidate.id === id);
  if (!surface) throw new Error(`Missing card surface ${id}`);
  return render(<>{surface.render()}</>);
}

describe('card surfaces', () => {
  it('offers the actor views of both decks and a waiting view', () => {
    expect(CARD_SURFACES.map(surface => surface.id)).toEqual(['card-chance', 'card-chest', 'card-waiting']);
    expect(CARD_SURFACES.every(surface => surface.group === 'Card')).toBe(true);
  });

  it.each([
    ['card-chance', 'CƠ HỘI'],
    ['card-chest', 'KHÍ VẬN'],
  ])('%s shows the deck badge and lets the acting player press Đóng', (id, badge) => {
    renderSurface(id);
    expect(screen.getByText(badge)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đóng' }).disabled).toBe(false);
    expect(screen.queryByText('Đang chờ người chơi đóng thẻ')).toBeNull();
  });

  it('card-waiting shows the card to another player, who can only wait', () => {
    renderSurface('card-waiting');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đóng' }).disabled).toBe(true);
    expect(screen.getByText('Đang chờ người chơi đóng thẻ')).toBeTruthy();
  });
});
