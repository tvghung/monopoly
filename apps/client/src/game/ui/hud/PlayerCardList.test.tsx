import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('PlayerCard status tags, pulse and summary', () => {
  it('keeps at most two status tags beside the name; the rest stay in the summary', () => {
    const { container } = renderRoster(room => {
      room.gameState.players['player-a'].isJail = true;
      room.gameState.players['player-a'].jailOpponentRoundsElapsed = 1;
    });
    const mine = container.querySelector('[data-player-id="player-a"]') as HTMLElement;
    const tags = [...mine.querySelectorAll('.player-card__tag')].map(tag => tag.textContent);
    expect(tags).toEqual(['Đang đi', 'Ở tù 1/2']);
    expect(mine.textContent).toContain('đang ở tù, vòng chờ 1/2');
    expect(mine.textContent).toContain('(bạn)');
  });

  it('pulses only when the turn becomes active during live presentation', () => {
    const room = makeRoom();
    const build = (displayActivePlayerId: string | null) => selectPlayerCardViewModels(
      room.gameState,
      { displayActivePlayerId, displayBalances: {}, displayDevelopmentLevels: {} },
      room.players,
      'player-a',
      'PLAYER',
    );
    const list = (cards: ReturnType<typeof build>, resetEpoch: number) => (
      <PlayerCardList cards={cards} deltas={[]} reducedMotion={false} speed={1} resetEpoch={resetEpoch} />
    );
    const { container, rerender } = render(list(build('player-a'), 0));
    const card = (id: string) => container.querySelector(`[data-player-id="${id}"]`) as HTMLElement;
    // Already active on mount: a ring, no pulse.
    expect(card('player-a').className).toContain('player-card--active');
    expect(card('player-a').className).not.toContain('player-card--pulse');

    rerender(list(build('player-b'), 0));
    expect(card('player-b').className).toContain('player-card--pulse');
    expect(card('player-a').className).not.toContain('player-card--pulse');

    // A snapshot sync hands over a different active player: no pulse.
    rerender(list(build('player-a'), 1));
    expect(card('player-a').className).toContain('player-card--active');
    expect(card('player-a').className).not.toContain('player-card--pulse');
    expect(card('player-b').className).not.toContain('player-card--pulse');
  });

  it('puts the recovery countdown on one row that replaces the footer, and in the offline tag for small cards', () => {
    const { container } = renderRoster(room => {
      room.players[1].connected = false;
      room.gameState.boardState.turnRecovery = {
        playerId: 'player-b',
        deadlineAt: new Date(Date.now() + 29_000).toISOString(),
      };
    });
    const other = container.querySelector('[data-player-id="player-b"]') as HTMLElement;
    expect(other.className).toContain('player-card--recovering');
    expect(other.querySelector('.player-card__recovery')?.textContent).toMatch(/Tự bỏ lượt sau 0:(29|30)/);
    expect(other.querySelector('.player-card__tag-countdown')?.textContent).toMatch(/0:(29|30)/);
    expect(other.textContent).toContain('sẽ bị bỏ lượt nếu không quay lại kịp');
  });

  it('names railroads and utilities in the summary', () => {
    const { container } = renderRoster(room => {
      room.gameState.boardState.ownedProps = {
        1: { id: 'player-a', color: 'red', houses: 0 },
        5: { id: 'player-a', color: 'red', houses: 0 },
        15: { id: 'player-a', color: 'red', houses: 0 },
        12: { id: 'player-a', color: 'red', houses: 0 },
      };
    });
    const mine = container.querySelector('[data-player-id="player-a"] .sr-only') as HTMLElement;
    expect(mine.textContent).toContain('4 tài sản');
    expect(mine.textContent).toContain('2 ga tàu');
    expect(mine.textContent).toContain('1 công ty điện nước');
  });

  it('keeps list semantics for the roster', () => {
    const { container } = renderRoster();
    expect(container.querySelector('ol')?.getAttribute('role')).toBe('list');
  });
});

describe('PlayerCard portfolio button (plan 03 OD-03-4)', () => {
  function renderSelectable(
    onSelectPlayer: ((playerId: string) => void) | undefined,
    mutateCards: (cards: ReturnType<typeof selectPlayerCardViewModels>) => ReturnType<typeof selectPlayerCardViewModels> = cards => cards,
  ) {
    const room = makeRoom();
    const cards = mutateCards(selectPlayerCardViewModels(room.gameState, noPresentation, room.players, 'player-a', 'PLAYER'));
    return render(
      <PlayerCardList
        cards={cards}
        deltas={[]}
        reducedMotion={false}
        speed={1}
        resetEpoch={0}
        onSelectPlayer={onSelectPlayer}
      />,
    );
  }

  it('puts a real button named after the player inside each card and reports the player id on click', () => {
    const onSelectPlayer = vi.fn();
    const { container } = renderSelectable(onSelectPlayer);

    const buttons = screen.getAllByRole('button');
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['Xem tài sản của An', 'Xem tài sản của Bình']);
    const mine = container.querySelector('[data-player-id="player-a"]') as HTMLElement;
    expect(within(mine).getByRole('button', { name: 'Xem tài sản của An' })).toBe(buttons[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Xem tài sản của Bình' }));
    expect(onSelectPlayer).toHaveBeenCalledTimes(1);
    expect(onSelectPlayer).toHaveBeenCalledWith('player-b');
  });

  it('is a native, focusable button outside the decorative face, so it is reachable by keyboard', () => {
    const { container } = renderSelectable(vi.fn());

    const button = screen.getByRole('button', { name: 'Xem tài sản của An' });
    // A native type="button" activates on Enter and Space in every browser; it must not sit in the aria-hidden subtree.
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.tabIndex).toBe(0);
    expect(button.closest('[aria-hidden="true"]')).toBeNull();
    button.focus();
    expect(document.activeElement).toBe(button);
    // It is laid over the face, and the face stays decorative.
    expect(button.nextElementSibling?.classList.contains('player-card__face')).toBe(true);
    expect(container.querySelector('[data-player-id="player-a"] .player-card__face')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the roster semantics and the screen-reader summary next to the button', () => {
    const { container } = renderSelectable(vi.fn());

    const roster = screen.getByRole('region', { name: 'Người chơi' });
    expect(within(roster).getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('ol')?.getAttribute('role')).toBe('list');
    const mine = container.querySelector('[data-player-id="player-a"]') as HTMLElement;
    expect(mine.querySelector('.sr-only')?.textContent).toBe('An (bạn), 1.500.000 ₫, 0 tài sản, đang đi');
    expect(mine.getAttribute('data-hud-region')).toBe('player-card-bottom');
  });

  it('renders no button when nothing handles the click, so the cards stay plain displays', () => {
    renderSelectable(undefined);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders no button for a player without a seat corner (no face is shown for them)', () => {
    const { container } = renderSelectable(vi.fn(), cards => cards.map(card => (
      card.playerId === 'player-b' ? { ...card, slot: null } : card
    )));

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelector('[data-player-id="player-b"] button')).toBeNull();
  });

  it('gives a player who left or went bankrupt a button too, so their (empty) portfolio can still be read', () => {
    const room = makeRoom();
    room.gameState.boardState.finishedPlayers['player-b'] = {
      name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0,
    };
    delete room.gameState.players['player-b'];
    const cards = selectPlayerCardViewModels(room.gameState, noPresentation, room.players, 'player-a', 'PLAYER');
    const onSelectPlayer = vi.fn();
    render(
      <PlayerCardList cards={cards} deltas={[]} reducedMotion={false} speed={1} resetEpoch={0} onSelectPlayer={onSelectPlayer} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xem tài sản của Bình' }));
    expect(onSelectPlayer).toHaveBeenCalledWith('player-b');
  });
});
