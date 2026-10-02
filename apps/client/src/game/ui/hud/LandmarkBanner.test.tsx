import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { presentationStoreContext } from '../../presentation/PresentationProvider';
import type { AnimationQueue } from '../../presentation/queue/AnimationQueue';
import { PresentationStore } from '../../presentation/store/presentationStore';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import LandmarkBanner, { LANDMARK_BANNER_LIFETIME_MS, isLandmarkOpening } from './LandmarkBanner';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(store: PresentationStore) {
  const room = makeRoom();
  store.resetFromSnapshot(room);
  const view = render(
    <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
      <LandmarkBanner />
    </presentationStoreContext.Provider>,
  );
  return { ...view, room };
}

const banner = (container: HTMLElement) => container.querySelector('.landmark-banner');

describe('LandmarkBanner', () => {
  it('opens a street’s landmark with its name and picture when the hotel is built in front of the player', () => {
    const store = new PresentationStore();
    const { container } = mount(store);
    expect(banner(container)).toBeNull();

    act(() => { store.emitDevelopmentChange('build-1', 13, 'player-a', 4, 5, 900); });
    const shown = banner(container);
    expect(shown).not.toBeNull();
    expect(shown!.textContent).toBe('Khánh thành Chùa Cầu!');
    expect(shown!.className).toContain('turn-banner');
    expect(shown!.getAttribute('aria-hidden')).toBe('true');
    expect(shown!.getAttribute('data-hud-transient')).toBe('true');
    expect(shown!.querySelector('img')?.getAttribute('src')).toContain('/art/landmarks/13.svg');
  });

  it('stays silent for houses, a hotel coming down, and a hotel seen when the HUD mounts', () => {
    const store = new PresentationStore();
    store.emitDevelopmentChange('before-mount', 24, 'player-a', 4, 5, 900);
    const { container } = mount(store);
    expect(banner(container)).toBeNull();

    act(() => { store.emitDevelopmentChange('house', 13, 'player-a', 1, 2, 500); });
    act(() => { store.emitDevelopmentChange('four', 13, 'player-a', 3, 4, 500); });
    act(() => { store.emitDevelopmentChange('sell', 13, 'player-a', 5, 4, 500); });
    expect(banner(container)).toBeNull();
  });

  it('leaves after its lifetime, scaled by the animation speed, and a newer hotel replaces it', () => {
    const store = new PresentationStore();
    act(() => { store.setAnimationSpeedMultiplier(2); });
    const { container } = mount(store);
    act(() => { store.emitDevelopmentChange('build-1', 13, 'player-a', 4, 5, 900); });
    act(() => { vi.advanceTimersByTime(LANDMARK_BANNER_LIFETIME_MS / 2 - 20); });
    expect(banner(container)).not.toBeNull();
    act(() => { store.emitDevelopmentChange('build-2', 39, 'player-b', 4, 5, 900); });
    expect(container.querySelectorAll('.landmark-banner')).toHaveLength(1);
    expect(banner(container)!.textContent).toBe('Khánh thành Landmark 81!');
    act(() => { vi.advanceTimersByTime(LANDMARK_BANNER_LIFETIME_MS / 2 + 40); });
    expect(banner(container)).toBeNull();
  });

  it('never opens after a snap or reconnect, and a visible banner goes with the reset', () => {
    const store = new PresentationStore();
    const { container, room } = mount(store);
    act(() => { store.emitDevelopmentChange('build-1', 13, 'player-a', 4, 5, 900); });
    expect(banner(container)).not.toBeNull();

    const later = cloneRoom(room);
    later.gameState.boardState.ownedProps = { 24: { id: 'player-a', color: 'red', houses: 5 } };
    act(() => { store.resetFromSnapshot(later); });
    expect(banner(container)).toBeNull();
    expect(store.getSnapshot().displayDevelopmentLevels[24]).toBe(5);
  });

  it('shows the text alone, with no picture, when reduced motion is asked for', () => {
    // The operating system asks for reduced motion (the same preference the app setting is combined with).
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    try {
      const store = new PresentationStore();
      const { container } = mount(store);
      act(() => { store.emitDevelopmentChange('build-1', 13, 'player-a', 4, 5, 0); });
      expect(banner(container)!.textContent).toBe('Khánh thành Chùa Cầu!');
      expect(banner(container)!.querySelector('img')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('recognizes only a street going up to the hotel as an opening', () => {
    const base = { id: 'x', sequence: 1, consequenceOrder: 1, tileId: 13, playerId: 'player-a', durationMs: 0 };
    expect(isLandmarkOpening({ ...base, fromHouses: 4, toHouses: 5, delta: 1, direction: 'UP' })).toBe(true);
    expect(isLandmarkOpening({ ...base, fromHouses: 0, toHouses: 5, delta: 5, direction: 'UP' })).toBe(true);
    expect(isLandmarkOpening({ ...base, fromHouses: 5, toHouses: 4, delta: -1, direction: 'DOWN' })).toBe(false);
    expect(isLandmarkOpening({ ...base, fromHouses: 3, toHouses: 4, delta: 1, direction: 'UP' })).toBe(false);
    expect(isLandmarkOpening({ ...base, fromHouses: 5, toHouses: 5, delta: 0, direction: 'UP' })).toBe(false);
  });
});
