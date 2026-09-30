import {
  act, cleanup, render, renderHook, screen,
} from '@testing-library/react';
import type { ActivityEvent } from '@monopoly/shared';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { presentationStoreContext } from '../../presentation/PresentationProvider';
import type { AnimationQueue } from '../../presentation/queue/AnimationQueue';
import { PresentationStore } from '../../presentation/store/presentationStore';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import ActivityTicker, { ACTIVITY_TICKER_LIFETIME_MS } from './ActivityTicker';
import { HUD_DRAWER_STORAGE_KEY, HudDrawerProvider } from './hudDrawer';
import PlayerCardList from './PlayerCardList';
import { selectPlayerCardViewModels } from './playerCardSelectors';
import {
  CHAT_BUBBLE_LIFETIME_MS, CHAT_BUBBLE_MAX_CHARS, truncateBubbleText, useChatBubbles,
} from './useChatBubbles';

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

let sequence = 0;
const base = () => {
  sequence += 1;
  return {
    eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    sequence,
    occurredAt: '2026-09-30T10:00:00.000Z',
  };
};
const landed = (name: string, tileID: number): ActivityEvent => ({
  ...base(), type: 'TILE_LANDED', playerId: 'player-a', playerName: name, tileID,
});
const chat = (senderPlayerId: string | undefined, message: string, senderRole: 'PLAYER' | 'SPECTATOR' = 'PLAYER'): ActivityEvent => ({
  ...base(), type: 'CHAT', senderRole, senderPlayerId, senderName: 'Ai đó', message,
});
const dice = (): ActivityEvent => ({
  ...base(), type: 'DICE_ROLL', playerId: 'player-a', playerName: 'An', dice1: 2, dice2: 3, total: 5, context: 'TURN',
});

function mountTicker(store: PresentationStore, wrapper?: (children: ReactNode) => ReactNode) {
  const ui = (
    <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
      <HudDrawerProvider>
        {wrapper ? wrapper(<ActivityTicker />) : <ActivityTicker />}
      </HudDrawerProvider>
    </presentationStoreContext.Provider>
  );
  return render(ui);
}

describe('ActivityTicker', () => {
  it('never replays the history that was on screen when it mounted', () => {
    const store = new PresentationStore();
    store.setDisplayActivity([landed('An', 1)]);
    const { container } = mountTicker(store);
    expect(container.querySelector('.activity-ticker')).toBeNull();
  });

  it('shows the newest gameplay line, skipping chat and dice, and hides it from assistive technology', () => {
    const store = new PresentationStore();
    const { container } = mountTicker(store);
    act(() => { store.setDisplayActivity([landed('An', 1), chat('player-b', 'Chào'), dice()]); });
    const ticker = container.querySelector('.activity-ticker');
    expect(ticker?.textContent).toBe('An đã tới Cà Mau.');
    expect(ticker?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows nothing for a chat-only or dice-only update', () => {
    const store = new PresentationStore();
    const { container } = mountTicker(store);
    act(() => { store.setDisplayActivity([chat('player-b', 'Chào'), dice()]); });
    expect(container.querySelector('.activity-ticker')).toBeNull();
  });

  it('leaves after four seconds divided by the animation speed', () => {
    const store = new PresentationStore();
    act(() => { store.setAnimationSpeedMultiplier(2); });
    const { container } = mountTicker(store);
    act(() => { store.setDisplayActivity([landed('An', 1)]); });
    act(() => { vi.advanceTimersByTime(ACTIVITY_TICKER_LIFETIME_MS / 2 - 20); });
    expect(container.querySelector('.activity-ticker')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(40); });
    expect(container.querySelector('.activity-ticker')).toBeNull();
  });

  it('opens the drawer on click and stays hidden while the drawer is open', () => {
    const store = new PresentationStore();
    const { container } = mountTicker(store);
    act(() => { store.setDisplayActivity([landed('An', 1)]); });
    act(() => { (container.querySelector('.activity-ticker') as HTMLElement).click(); });
    expect(window.localStorage.getItem(HUD_DRAWER_STORAGE_KEY)).toBe('open');
    expect(container.querySelector('.activity-ticker')).toBeNull();
  });

  it('does not show a backlog handed over by a reset', () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const { container } = mountTicker(store);
    act(() => {
      store.resetFromSnapshot(cloneRoom(makeRoom()));
      store.setDisplayActivity([landed('An', 1), landed('An', 2)]);
    });
    expect(container.querySelector('.activity-ticker')).toBeNull();
  });
});

describe('truncateBubbleText', () => {
  it('flattens whitespace and cuts long messages with an ellipsis', () => {
    expect(truncateBubbleText('  xin \n  chào  ')).toBe('xin chào');
    const long = 'a'.repeat(200);
    const cut = truncateBubbleText(long);
    expect([...cut]).toHaveLength(CHAT_BUBBLE_MAX_CHARS);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('counts characters, not UTF-16 units, so Vietnamese and emoji are not split', () => {
    const cut = truncateBubbleText('Đà Nẵng '.repeat(30));
    expect([...cut].length).toBeLessThanOrEqual(CHAT_BUBBLE_MAX_CHARS);
  });
});

describe('useChatBubbles', () => {
  const options = { resetEpoch: 0, speed: 1, suppressed: false };
  const run = (initial: readonly ActivityEvent[], localPlayerId: string | null = 'player-a', opts = options) => renderHook(
    (props: { activity: readonly ActivityEvent[]; opts: typeof options }) => useChatBubbles(props.activity, localPlayerId, props.opts),
    { initialProps: { activity: initial, opts } },
  );

  it('shows a bubble only for new chat from other players, never for history or your own messages', () => {
    const history = [chat('player-b', 'Cũ')];
    const { result, rerender } = run(history);
    expect(result.current).toEqual({});
    rerender({ activity: [...history, chat('player-b', 'Mới'), chat('player-a', 'Của tôi')], opts: options });
    expect(result.current).toEqual({ 'player-b': 'Mới' });
  });

  it('keeps the newest message per sender and drops it after four seconds', () => {
    const { result, rerender } = run([]);
    const first = chat('player-b', 'Một');
    const second = chat('player-b', 'Hai');
    rerender({ activity: [first, second], opts: options });
    expect(result.current).toEqual({ 'player-b': 'Hai' });
    act(() => { vi.advanceTimersByTime(CHAT_BUBBLE_LIFETIME_MS + 10); });
    expect(result.current).toEqual({});
  });

  it('ignores spectator chat and shows nothing while the drawer is open', () => {
    const { result, rerender } = run([]);
    rerender({ activity: [chat(undefined, 'Khán giả', 'SPECTATOR')], opts: options });
    expect(result.current).toEqual({});
    const whileOpen = chat('player-b', 'Đang mở drawer');
    rerender({ activity: [whileOpen], opts: { ...options, suppressed: true } });
    expect(result.current).toEqual({});
    // The message that arrived while the drawer was open is history now, not a bubble.
    rerender({ activity: [whileOpen], opts: options });
    expect(result.current).toEqual({});
  });

  it('clears the bubbles that are up as soon as the drawer opens', () => {
    const { result, rerender } = run([]);
    rerender({ activity: [chat('player-b', 'Xin chào')], opts: options });
    expect(result.current).toEqual({ 'player-b': 'Xin chào' });
    rerender({ activity: [chat('player-b', 'Xin chào')], opts: { ...options, suppressed: true } });
    expect(result.current).toEqual({});
  });

  it('never replays after a reset epoch or a sequence restart', () => {
    const { result, rerender } = run([]);
    rerender({ activity: [chat('player-b', 'Trước')], opts: options });
    expect(result.current).toEqual({ 'player-b': 'Trước' });
    rerender({ activity: [chat('player-b', 'Trước'), chat('player-c', 'Backlog')], opts: { ...options, resetEpoch: 1 } });
    expect(result.current).toEqual({});
  });

  it('keeps markup as plain text inside the card', () => {
    const room = makeRoom();
    const cards = selectPlayerCardViewModels(
      room.gameState,
      { displayActivePlayerId: null, displayBalances: {}, displayDevelopmentLevels: {} },
      room.players,
      'player-a',
      'PLAYER',
    );
    const { container } = render(
      <PlayerCardList
        cards={cards}
        deltas={[]}
        reducedMotion={false}
        speed={1}
        resetEpoch={0}
        bubbles={{ 'player-b': '<img src=x onerror=alert(1)> <b>đậm</b>' }}
      />,
    );
    const bubble = container.querySelector('[data-player-id="player-b"] .player-card__bubble');
    expect(bubble?.textContent).toBe('<img src=x onerror=alert(1)> <b>đậm</b>');
    expect(bubble?.querySelector('img, b')).toBeNull();
    expect(bubble?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img', { name: /alert/u })).toBeNull();
  });
});
