import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FpsBadge from './FpsBadge';
import { SCENE_FRAME_EVENT } from '../scene/render/diagnostics/sceneFrameEvent';

describe('FpsBadge', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const tick = (elapsedMs: number) => {
    now += elapsedMs;
    vi.advanceTimersByTime(elapsedMs);
  };

  it('counts actual scene submissions and shows the configured cap separately', () => {
    const { unmount } = render(<FpsBadge />);
    expect(screen.getByText('3D -- / 60 FPS')).toBeTruthy();
    act(() => {
      for (let frame = 0; frame < 30; frame += 1) window.dispatchEvent(new Event(SCENE_FRAME_EVENT));
      tick(750);
    });
    expect(screen.getByText('3D 40 / 60 FPS')).toBeTruthy();
    act(() => tick(750));
    expect(screen.getByText('3D 0 / 60 FPS')).toBeTruthy();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets the sample while hidden and starts fresh on visibility recovery', () => {
    render(<FpsBadge />);
    act(() => {
      window.dispatchEvent(new Event(SCENE_FRAME_EVENT));
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      tick(1500);
    });
    expect(screen.getByText('3D -- / 60 FPS')).toBeTruthy();
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event(SCENE_FRAME_EVENT));
      tick(750);
    });
    expect(screen.getByText('3D 1 / 60 FPS')).toBeTruthy();
  });
});
