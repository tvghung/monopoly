import { Profiler, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESTINATION_PREVIEW_EVENT,
  DestinationPreviewAlphaReadout,
  RENDERER_METRICS_EVENT,
  RendererMetricsReadout,
  formatDestinationAlpha,
  formatRendererMetrics,
} from './DiagnosticsReadouts';

afterEach(cleanup);

function emit(type: string, detail: Record<string, unknown>) {
  act(() => { window.dispatchEvent(new CustomEvent(type, { detail })); });
}

describe('diagnostics formatters', () => {
  it('formats the renderer metrics line the harness always showed', () => {
    expect(formatRendererMetrics({
      drawCalls: 140, triangles: 80_000, combinedDrawCalls: 160, combinedTriangles: 90_000, activeAnimatedObjects: 3,
    })).toBe('draw 140 · tri 80000 · combined 160 / 90000 · active 3');
    expect(formatRendererMetrics({ drawCalls: 7, triangles: 9, activeAnimatedObjects: 0 }))
      .toBe('draw 7 · tri 9 · combined 7 / 9 · active 0');
  });

  it('formats the destination alpha to two decimals and falls back to a dash', () => {
    expect(formatDestinationAlpha({ surfaceOpacity: 0.3456 })).toBe('0.35');
    expect(formatDestinationAlpha({})).toBe('—');
  });
});

describe('RendererMetricsReadout', () => {
  it('renders nothing until the first event and then shows the latest metrics', () => {
    render(<RendererMetricsReadout />);
    expect(screen.queryByTestId('renderer-metrics')).toBeNull();
    emit(RENDERER_METRICS_EVENT, { drawCalls: 1, triangles: 2, activeAnimatedObjects: 3 });
    expect(screen.getByTestId('renderer-metrics').textContent).toBe('draw 1 · tri 2 · combined 1 / 2 · active 3');
    emit(RENDERER_METRICS_EVENT, { drawCalls: 4, triangles: 5, activeAnimatedObjects: 6 });
    expect(screen.getByTestId('renderer-metrics').textContent).toBe('draw 4 · tri 5 · combined 4 / 5 · active 6');
  });

  it('does not commit again when a new event reads the same', () => {
    const commits = vi.fn();
    render(<Profiler id="readout" onRender={commits}><RendererMetricsReadout /></Profiler>);
    emit(RENDERER_METRICS_EVENT, { drawCalls: 1, triangles: 2, activeAnimatedObjects: 3, frameSequence: 1 });
    const afterFirst = commits.mock.calls.length;
    for (let sequence = 2; sequence < 20; sequence += 1) {
      emit(RENDERER_METRICS_EVENT, { drawCalls: 1, triangles: 2, activeAnimatedObjects: 3, frameSequence: sequence });
    }
    // React may call the component once more before it bails out of an update that sets an equal state; what must not
    // happen is one commit per event (18 here), which is what storing each event's detail object in state costs.
    expect(commits.mock.calls.length).toBeLessThanOrEqual(afterFirst + 1);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = render(<RendererMetricsReadout />);
    unmount();
    expect(() => emit(RENDERER_METRICS_EVENT, { drawCalls: 1, triangles: 2, activeAnimatedObjects: 3 })).not.toThrow();
  });
});

describe('DestinationPreviewAlphaReadout', () => {
  it('shows a dash first and then the rounded alpha, committing only when the rounded value changes', () => {
    const commits = vi.fn();
    const { container } = render(<Profiler id="alpha" onRender={commits}><DestinationPreviewAlphaReadout /></Profiler>);
    expect(container.textContent).toBe(' · alpha —');
    emit(DESTINATION_PREVIEW_EVENT, { surfaceOpacity: 0.2001 });
    expect(container.textContent).toBe(' · alpha 0.20');
    const afterFirst = commits.mock.calls.length;
    emit(DESTINATION_PREVIEW_EVENT, { surfaceOpacity: 0.2002 });
    emit(DESTINATION_PREVIEW_EVENT, { surfaceOpacity: 0.1999 });
    // Same bail-out allowance as above: at most one extra call, never one per event.
    expect(commits.mock.calls.length).toBeLessThanOrEqual(afterFirst + 1);
    emit(DESTINATION_PREVIEW_EVENT, { surfaceOpacity: 0.31 });
    expect(container.textContent).toBe(' · alpha 0.31');
  });
});

describe('isolation from the parent', () => {
  it('re-renders only the readout, never the component that mounts it', () => {
    let parentRenders = 0;
    function Parent() {
      parentRenders += 1;
      const [label] = useState('parent');
      return <div>{label}<RendererMetricsReadout /><DestinationPreviewAlphaReadout /></div>;
    }
    render(<Parent />);
    expect(parentRenders).toBe(1);
    for (let sequence = 0; sequence < 25; sequence += 1) {
      emit(RENDERER_METRICS_EVENT, { drawCalls: sequence, triangles: sequence, activeAnimatedObjects: 0 });
      emit(DESTINATION_PREVIEW_EVENT, { surfaceOpacity: sequence / 25 });
    }
    expect(parentRenders).toBe(1);
  });
});
