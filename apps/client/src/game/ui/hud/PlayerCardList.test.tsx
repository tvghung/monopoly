import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRoom } from '../../presentation/testFixtures';
import type { BalanceDeltaSignal } from '../../presentation/store/types';
import PlayerCardList from './PlayerCardList';
import { selectPlayerCardViewModels } from './playerCardSelectors';
import { describePlayerCard } from './playerCardText';

afterEach(cleanup);

const noPresentation = { displayActivePlayerId: null, displayBalances: {}, displayDevelopmentLevels: {} };

function renderRoster(
  mutate: (room: ReturnType<typeof makeRoom>) => void = () => undefined,
  deltas: readonly BalanceDeltaSignal[] = [],
  localPlayerId: string | null = 'player-a',
) {
  const room = makeRoom();
  mutate(room);
  const cards = selectPlayerCardViewModels(room.gameState, noPresentation, room.players, localPlayerId, 'PLAYER');
  return render(
    <PlayerCardList cards={cards} deltas={deltas} reducedMotion={false} speed={1} resetEpoch={0} />,
  );
}

describe('PlayerCardList', () => {
  it('is the accessible roster: a named section with one list item per seated player', () => {
    renderRoster();
    const roster = screen.getByRole('region', { name: 'Người chơi' });
    const items = within(roster).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('data-player-id')).toBe('player-a');
    expect(items[0].getAttribute('data-current-turn')).toBe('true');
    expect(items[1].getAttribute('data-player-id')).toBe('player-b');
    expect(items[1].getAttribute('data-current-turn')).toBe('false');
  });

  it('reads each player once, from a summary, and hides the decorative card face', () => {
    const { container } = renderRoster(room => {
      room.gameState.boardState.ownedProps = {
        1: { id: 'player-a', color: 'red', houses: 3 },
        3: { id: 'player-a', color: 'red', houses: 5 },
      };
    });
    const first = container.querySelector('[data-player-id="player-a"]') as HTMLElement;
    expect(within(first).getByText(/^An \(bạn\), 1\.500\.000 ₫/)).not.toBeNull();
    expect(first.textContent).toContain('2 tài sản, 3 nhà, 1 khách sạn, đang đi');
    expect(first.querySelector('.player-card__face')!.getAttribute('aria-hidden')).toBe('true');
    expect(first.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });

  it('tags the local player and marks the active card with a text chip, not only a ring', () => {
    const { container } = renderRoster();
    const mine = container.querySelector('[data-player-id="player-a"]') as HTMLElement;
    expect(mine.querySelector('.player-card__tag')!.textContent).toBe('Bạn');
    expect(mine.textContent).toContain('Đang đi');
    const other = container.querySelector('[data-player-id="player-b"]') as HTMLElement;
    expect(other.textContent).not.toContain('Đang đi');
    expect(other.textContent).not.toContain('Bạn');
  });

  it('shows jail with its round count, offline with the recovery countdown, and never color alone', () => {
    const { container } = renderRoster(room => {
      room.gameState.players['player-b'].isJail = true;
      room.gameState.players['player-b'].jailOpponentRoundsElapsed = 1;
      room.players[1].connected = false;
      room.gameState.boardState.turnRecovery = {
        playerId: 'player-b',
        deadlineAt: new Date(Date.now() + 65_000).toISOString(),
      };
    });
    const other = container.querySelector('[data-player-id="player-b"]') as HTMLElement;
    expect(other.textContent).toContain('Ở tù 1/2');
    expect(other.textContent).toContain('Mất kết nối');
    expect(other.textContent).toMatch(/Tự bỏ lượt sau 1:0[45]/);
    expect(other.getAttribute('data-state')).toBe('offline');
  });

  it('replaces the money with a Phá sản chip and drops the footer for a bankrupt player', () => {
    const { container } = renderRoster(room => {
      room.gameState.boardState.finishedPlayers['player-b'] = {
        name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0,
      };
      delete room.gameState.players['player-b'];
    });
    const other = container.querySelector('[data-player-id="player-b"]') as HTMLElement;
    expect(other.getAttribute('data-state')).toBe('bankrupt');
    expect(other.querySelector('.player-card__money')).toBeNull();
    expect(other.querySelector('.player-card__footer')).toBeNull();
    expect(other.textContent).toContain('Phá sản');
    expect(other.textContent).toContain('Bình, đã phá sản');
  });

  it('shows a Đã rời chip for a player who left', () => {
    const { container } = renderRoster(room => {
      room.gameState.boardState.finishedPlayers['player-b'] = {
        name: 'Bình', color: 'blue', characterId: 'panda', reason: 'LEFT', accountBalance: 700,
      };
      delete room.gameState.players['player-b'];
    });
    const other = container.querySelector('[data-player-id="player-b"]') as HTMLElement;
    expect(other.getAttribute('data-state')).toBe('left');
    expect(other.textContent).toContain('Đã rời');
    expect(other.textContent).toContain('Bình, đã rời ván chơi');
  });

  it('does not show chips for deltas that were already in the store when the cards mounted', () => {
    const history: BalanceDeltaSignal[] = [
      { id: 'd1', sequence: 4, consequenceOrder: 0, playerId: 'player-a', from: 1500, to: 1400, delta: -100, durationMs: 480 },
    ];
    const { container } = renderRoster(undefined, history);
    expect(container.querySelector('.ds-delta-chip')).toBeNull();
  });

  it('keeps its summary text in sync with describePlayerCard', () => {
    const room = makeRoom();
    const [card] = selectPlayerCardViewModels(room.gameState, noPresentation, room.players, 'player-a', 'PLAYER');
    expect(describePlayerCard(card)).toBe('An (bạn), 1.500.000 ₫, 0 tài sản, đang đi');
  });
});
