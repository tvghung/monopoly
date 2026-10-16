import type { ComponentType } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESTINATION_PREVIEW_EVENT, RENDERER_METRICS_EVENT } from './DiagnosticsReadouts';

const boardRenders = { count: 0 };
let Phase4UatHarness: ComponentType;

// The real board needs WebGL; what matters here is how often the harness asks React to render it. The mock is
// registered against a fresh module registry so it applies no matter which test file ran before in the same worker.
beforeEach(async () => {
  boardRenders.count = 0;
  vi.resetModules();
  vi.doMock('../../components/Board', () => ({
    default: function CountingBoard() {
      boardRenders.count += 1;
      return null;
    },
  }));
  ({ default: Phase4UatHarness } = await import('./Phase4UatHarness'));
});

afterEach(() => {
  cleanup();
  vi.doUnmock('../../components/Board');
  window.history.replaceState(null, '', '/');
});

async function renderReady(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  const view = render(<Phase4UatHarness />);
  await waitFor(() => expect(
    view.container.querySelector('main.phase4-uat')?.getAttribute('data-uat-ready'),
  ).toBe('true'));
  return view;
}

describe('Phase4UatHarness renderer diagnostics', () => {
  it('shows the metrics without ever re-rendering the board (PERF-17 feedback loop)', async () => {
    await renderReady('?phase4-uat=1&scenario=board-readability');
    const rendersAtRest = boardRenders.count;
    expect(rendersAtRest).toBeGreaterThan(0);

    for (let sequence = 0; sequence < 40; sequence += 1) {
      act(() => {
        window.dispatchEvent(new CustomEvent(RENDERER_METRICS_EVENT, {
          detail: {
            drawCalls: 140, triangles: 80_000, activeAnimatedObjects: sequence, frameSequence: sequence,
          },
        }));
        window.dispatchEvent(new CustomEvent(DESTINATION_PREVIEW_EVENT, {
          detail: { surfaceOpacity: sequence / 40 },
        }));
      });
    }

    expect(screen.getByTestId('renderer-metrics').textContent).toBe('draw 140 · tri 80000 · combined 140 / 80000 · active 39');
    expect(boardRenders.count).toBe(rendersAtRest);
  });

  it('keeps no diagnostics listener when the controls are hidden', async () => {
    await renderReady('?phase4-uat=1&scenario=board-readability&uat-controls=hidden');
    const rendersAtRest = boardRenders.count;
    expect(rendersAtRest).toBeGreaterThan(0);
    act(() => {
      window.dispatchEvent(new CustomEvent(RENDERER_METRICS_EVENT, {
        detail: { drawCalls: 1, triangles: 2, activeAnimatedObjects: 3 },
      }));
    });
    expect(screen.queryByTestId('renderer-metrics')).toBeNull();
    expect(boardRenders.count).toBe(rendersAtRest);
  });
});
