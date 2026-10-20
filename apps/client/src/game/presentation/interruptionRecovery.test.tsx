import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentationController } from './PresentationController';
import { PresentationProvider } from './PresentationProvider';
import { makeRoom } from './testFixtures';
function moved(version = 2, tile = 12) {
  const room = makeRoom(version);
  room.gameState.players['player-a'].currentTile = tile;
  room.gameState.boardState.diceValue = { dice1: 6, dice2: 6 };
  room.gameState.boardState.rollSequence = version - 1;
  return room;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('interruption recovery', () => {
  it('discards active dice and pending turns, hydrates hidden updates, then animates only fresh events', async () => {
    vi.useFakeTimers();
    const c = new PresentationController();
    c.acceptRoomSnapshot(makeRoom(), 'SESSION_SYNC');
    c.acceptRoomSnapshot(moved(), 'LIVE_UPDATE');
    c.setVisibility(true);
    c.acceptRoomSnapshot(moved(3, 18), 'LIVE_UPDATE');
    c.acceptRoomSnapshot(moved(4, 24), 'LIVE_UPDATE');
    c.setVisibility(false);
    await vi.runAllTimersAsync();
    await c.queue.whenIdle();
    expect(c.getState().settledPositions['player-a']).toBe(24);
    expect(c.getState().displayRollSequence).toBe(3);
    expect(c.getState().diceRoll).toBeNull();
    expect(c.getState().characterMovements).toEqual([]);
    expect(c.getState().moneyTransfers).toEqual([]);
    const fresh = moved(5, 26);
    fresh.gameState.boardState.diceValue = { dice1: 1, dice2: 1 };
    c.acceptRoomSnapshot(fresh, 'LIVE_UPDATE');
    await vi.runAllTimersAsync();
    expect(c.getState().settledPositions['player-a']).toBe(26);
    expect(c.getState().characterMovements.filter(s => s.phase === 'START').map(s => s.toTileId)).toEqual([25, 26]);
    c.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['SESSION_SYNC', 'SPECTATOR_SYNC'] as const)('resets an in-flight presentation on equal-version %s', async (source) => {
    vi.useFakeTimers();
    const c = new PresentationController();
    c.acceptRoomSnapshot(makeRoom(), 'SESSION_SYNC');
    const room = moved();
    c.acceptRoomSnapshot(room, 'LIVE_UPDATE');
    expect(c.acceptRoomSnapshot(room, source)).toBe(true);
    await vi.runAllTimersAsync();
    expect(c.getState().settledPositions['player-a']).toBe(12);
    expect(c.getState().characterMovements).toEqual([]);
    expect(c.acceptRoomSnapshot(makeRoom(), 'SESSION_SYNC')).toBe(false);
    c.dispose();
  });
  it('recovers after timer delivery resumes following a long event-loop stall', async () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const c = new PresentationController();
    c.acceptRoomSnapshot(makeRoom(), 'SESSION_SYNC');
    c.acceptRoomSnapshot(moved(), 'LIVE_UPDATE');
    now = 60000;
    await vi.advanceTimersByTimeAsync(700);
    await c.queue.whenIdle();
    expect(c.getState().settledPositions['player-a']).toBe(12);
    expect(c.getState().displayRollSequence).toBe(1);
    expect(c.getState().characterMovements).toEqual([]);
    expect(c.getState().diceRoll).toBeNull();
    c.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['visibility', 'freeze', 'pagehide', 'focus'] as const)('recovers via the %s provider boundary without duplicate listeners', async (boundary) => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const c = new PresentationController();
    const view = render(<PresentationProvider controller={c}><div /></PresentationProvider>);
    act(() => { c.acceptRoomSnapshot(makeRoom(), 'SESSION_SYNC'); c.acceptRoomSnapshot(moved(), 'LIVE_UPDATE'); });
    act(() => {
      if (boundary === 'visibility') {
        visibility.mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      }
      if (boundary === 'freeze')
        document.dispatchEvent(new Event('freeze'));
      if (boundary === 'pagehide')
        window.dispatchEvent(new Event('pagehide'));
      if (boundary === 'focus')
        window.dispatchEvent(new Event('blur'));
      now = 60000;
      visibility.mockReturnValue('visible');
      if (boundary === 'visibility')
        document.dispatchEvent(new Event('visibilitychange'));
      if (boundary === 'freeze')
        document.dispatchEvent(new Event('resume'));
      if (boundary === 'pagehide')
        window.dispatchEvent(new Event('pageshow'));
      if (boundary === 'focus')
        window.dispatchEvent(new Event('focus'));
    });
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(c.getState().settledPositions['player-a']).toBe(12);
    expect(c.getState().characterMovements).toEqual([]);
    const recover = vi.spyOn(c, 'recoverFromInterruption');
    view.unmount();
    window.dispatchEvent(new Event('pageshow'));
    expect(recover).not.toHaveBeenCalled();
    c.dispose();
  });
  it('preserves reduced motion and Play Again reset after hidden spectator hydration', async () => {
    vi.useFakeTimers();
    const c = new PresentationController();
    c.setPreferences(true, 2);
    c.acceptRoomSnapshot(makeRoom(), 'SPECTATOR_SYNC');
    c.setVisibility(true);
    c.acceptRoomSnapshot(moved(), 'LIVE_UPDATE');
    c.setVisibility(false);
    const replay = makeRoom(3);
    replay.status = 'LOBBY';
    c.acceptRoomSnapshot(replay, 'REPLAY_SYNC');
    await vi.runAllTimersAsync();
    expect(c.getState().settledPositions['player-a']).toBe(0);
    expect(c.getState().reducedMotion).toBe(true);
    expect(c.getState().animationSpeedMultiplier).toBe(2);
    expect(c.getState().status).toBe('idle');
    c.dispose();
  });
});
