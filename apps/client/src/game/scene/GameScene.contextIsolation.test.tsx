import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * What the real `GameScene` does with the room-state context. react-three-fiber re-provides every ancestor context inside the
 * `Canvas`, so a context that changes at every socket update would commit the scene at every update; `GameScene` shadows
 * `stateContext` just above the canvas for that reason (Phase B2, PERF-03). These tests mount the real `GameScene` and the real
 * `Canvas` (only the renderer, the measurement and the drawn layers are replaced, because jsdom has no WebGL and no layout) and
 * read the contexts from a probe inside the canvas, which is what a component under the scene would see.
 */
const probe = vi.hoisted(() => ({
  state: [] as unknown[],
  renders: 0,
  other: [] as unknown[],
}));

// jsdom has no layout and no WebGL: the canvas gets a measured size and a renderer that accepts and ignores everything the root
// configures. The real `Canvas`, its context bridge and `GameScene` are what is under test.
vi.mock('@react-three/fiber', async importOriginal => {
  const actual = await importOriginal<typeof import('@react-three/fiber')>();
  const { createElement } = await import('react');
  const quiet = (): unknown => new Proxy(function noop() {}, {
    get: (_target, key) => (key === 'then' ? undefined : quiet()),
    apply: () => quiet(),
    set: () => true,
  });
  const fakeRenderer = () => new Proxy({ domElement: document.createElement('canvas') }, {
    get: (target, key, receiver): unknown => (key === 'then' || key in target ? Reflect.get(target, key, receiver) as unknown : quiet()),
    set: () => true,
  });
  return {
    ...actual,
    Canvas: (props: Record<string, unknown>) => createElement(actual.Canvas, { ...props, gl: fakeRenderer } as never),
  };
});

vi.mock('./board/Board3D', async () => {
  const { default: probeContext } = await import('../../internal');
  const { OtherProbeContext } = await import('./GameScene.contextIsolation.contexts');
  return {
    default: function BoardProbe() {
      probe.renders += 1;
      probe.state.push(useContext(probeContext));
      probe.other.push(useContext(OtherProbeContext));
      return null;
    },
  };
});
vi.mock('./board/motion/TileMotionProvider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./camera/CameraAutoFocus', () => ({ default: () => null }));
vi.mock('./render/lighting/SceneLightRig', () => ({ default: () => null }));
vi.mock('./render/environment/StudioEnvironment', () => ({ default: () => null }));
vi.mock('./props/TableProps', () => ({ default: () => null }));
vi.mock('./render/table/BoardGroundShadow', () => ({ default: () => null }));
vi.mock('./render/table/Tabletop', () => ({ default: () => null }));
vi.mock('./camera/FixedBoardCamera', () => ({ default: () => null, BOARD_CANVAS_CAMERA: { position: [0, 0, 10] } }));
vi.mock('./camera/useBoardGestures', () => ({ useBoardGestures: () => {} }));

import stateContext from '../../internal';
import type { StateContextValue } from '../../types';
import { SettingsProvider } from '../../settings/SettingsProvider';
import { OtherProbeContext } from './GameScene.contextIsolation.contexts';
import GameScene from './GameScene';

beforeAll(() => {
  class ImmediateResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(target: Element) { queueMicrotask(() => this.callback([{ target } as ResizeObserverEntry], this)); }

    unobserve() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ImmediateResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800, x: 0, y: 0, toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  probe.state = [];
  probe.other = [];
  probe.renders = 0;
});

const realState = (marker: string) => ({ state: { marker }, connected: true } as unknown as StateContextValue);

/** The canvas mounts its children after its size is measured and its root is configured, which takes a few ticks. */
async function settle() {
  await waitFor(() => expect(probe.renders).toBeGreaterThan(0));
  await act(async () => { await new Promise(resolve => { setTimeout(resolve, 20); }); });
}

function Mount({ value, other }: { value: StateContextValue; other: string }) {
  return (
    <SettingsProvider>
      <OtherProbeContext.Provider value={other}>
        <stateContext.Provider value={value}>
          <GameScene />
        </stateContext.Provider>
      </OtherProbeContext.Provider>
    </SettingsProvider>
  );
}

describe('GameScene shadows the room-state context above its canvas', () => {
  it('shows a component under the canvas none of the room state', async () => {
    render(<Mount value={realState('real-room')} other="x" />);
    await settle();
    expect(probe.state.length).toBeGreaterThan(0);
    // The probe sees the empty shadow, never the room state of the app: a read of `state` would be undefined and fail loudly.
    probe.state.forEach(seen => {
      expect(seen).not.toBe(realState('real-room'));
      expect((seen as { state?: unknown }).state).toBeUndefined();
    });
  });

  it('does not commit the scene when the room state changes', async () => {
    const view = render(<Mount value={realState('one')} other="x" />);
    await settle();
    const before = probe.renders;
    expect(before).toBeGreaterThan(0);
    view.rerender(<Mount value={realState('two')} other="x" />);
    view.rerender(<Mount value={realState('three')} other="x" />);
    await settle();
    expect(probe.renders).toBe(before);
  });

  it('still bridges every other context into the canvas, so only the room state is hidden', async () => {
    const view = render(<Mount value={realState('one')} other="first" />);
    await settle();
    expect(probe.other.at(-1)).toBe('first');
    view.rerender(<Mount value={realState('one')} other="second" />);
    await settle();
    expect(probe.other.at(-1)).toBe('second');
  });
});

