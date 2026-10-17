import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTileHoverStore, useTileHover } from './tileHoverStore';

afterEach(cleanup);

describe('createTileHoverStore', () => {
  it('starts with no hovered tile and reports each change once', () => {
    const store = createTileHoverStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get()).toBeNull();
    store.set(5);
    store.set(5);
    store.set(null);
    store.set(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const store = createTileHoverStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(3);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('useTileHover', () => {
  it('re-renders its reader when the hovered tile changes', () => {
    const store = createTileHoverStore();
    function Reader() {
      return <output data-testid="hover">{String(useTileHover(store))}</output>;
    }
    render(<Reader />);
    expect(screen.getByTestId('hover').textContent).toBe('null');
    act(() => store.set(7));
    expect(screen.getByTestId('hover').textContent).toBe('7');
    act(() => store.set(null));
    expect(screen.getByTestId('hover').textContent).toBe('null');
  });
});
