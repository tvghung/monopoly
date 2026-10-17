import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import { createSettingsStore } from './settingsStore';

describe('createSettingsStore', () => {
  it('holds the settings it was given', () => {
    const store = createSettingsStore(DEFAULT_GAME_SETTINGS);
    expect(store.getSnapshot()).toBe(DEFAULT_GAME_SETTINGS);
  });

  it('notifies subscribers once per real change and hands out the new object', () => {
    const store = createSettingsStore(DEFAULT_GAME_SETTINGS);
    const listener = vi.fn();
    store.subscribe(listener);
    const next = { ...DEFAULT_GAME_SETTINGS, masterVolume: 0.25 };
    store.set(next);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(next);
  });

  it('does nothing when every field is equal, even for a new object', () => {
    const store = createSettingsStore(DEFAULT_GAME_SETTINGS);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ ...DEFAULT_GAME_SETTINGS });
    store.set(DEFAULT_GAME_SETTINGS);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(DEFAULT_GAME_SETTINGS);
  });

  it('stops notifying a subscriber that unsubscribed', () => {
    const store = createSettingsStore(DEFAULT_GAME_SETTINGS);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ ...DEFAULT_GAME_SETTINGS, muted: true });
    expect(listener).not.toHaveBeenCalled();
  });
});
