import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FpsBadge from './FpsBadge';

describe('FpsBadge', () => {
  let now = 0;
  let nextFrameId = 1;
  let callbacks: Map<number, FrameRequestCallback>;
  let requestAnimationFrame: ReturnType<typeof vi.fn>;
  let cancelAnimationFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    callbacks = new Map();
    requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      callbacks.set(id, callback);
      return id;
    });
    cancelAnimationFrame = vi.fn((id: number) => {
      callbacks.delete(id);
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: requestAnimationFrame,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrame,
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('updates at a sampled interval and cancels its RAF on unmount', () => {
    const { unmount } = render(<FpsBadge />);

    act(() => {
      for (let frame = 1; frame <= 48; frame += 1) {
        now = frame * 16;
        const pending = [...callbacks.values()];
        callbacks.clear();
        pending.forEach(callback => callback(now));
      }
    });

    expect(screen.getByText(/FPS \d+/).textContent).toMatch(/^FPS [5-9]\d$/);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
  });
});
