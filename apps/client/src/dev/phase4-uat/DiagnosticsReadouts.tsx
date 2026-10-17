import { memo, useEffect, useState } from 'react';

export const RENDERER_METRICS_EVENT = 'own-the-block-renderer';
export const DESTINATION_PREVIEW_EVENT = 'own-the-block-destination-preview';

type EventDetail = Record<string, unknown>;

export function formatRendererMetrics(detail: EventDetail): string {
  return `draw ${String(detail.drawCalls)} · tri ${String(detail.triangles)} · combined ${String(detail.combinedDrawCalls ?? detail.drawCalls)} / ${String(detail.combinedTriangles ?? detail.triangles)} · active ${String(detail.activeAnimatedObjects)}`;
}

/** Two decimals is all the flicker readout shows, so a pulse sample that rounds to the same text changes nothing. */
export function formatDestinationAlpha(detail: EventDetail): string {
  return typeof detail.surfaceOpacity === 'number' ? detail.surfaceOpacity.toFixed(2) : '—';
}

/**
 * Keeps only the formatted text of the latest window event. The diagnostics events are measurements of the scene, not
 * inputs to it: they must re-render nothing but their own readout (Phase A finding PERF-17, where the harness stored the
 * raw event detail in the state of the component that renders `<Board />`). A value that reads the same as before does
 * not update state at all. `format` must be a stable (module-level) function.
 */
function useEventText(type: string, format: (detail: EventDetail) => string): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const onEvent = (event: Event) => {
      const next = format((event as CustomEvent<EventDetail | null>).detail ?? {});
      setText(previous => (previous === next ? previous : next));
    };
    window.addEventListener(type, onEvent);
    return () => window.removeEventListener(type, onEvent);
  }, [type, format]);
  return text;
}

export const RendererMetricsReadout = memo(function RendererMetricsReadout() {
  const text = useEventText(RENDERER_METRICS_EVENT, formatRendererMetrics);
  return text === null ? null : <output data-testid="renderer-metrics">{text}</output>;
});

export const DestinationPreviewAlphaReadout = memo(function DestinationPreviewAlphaReadout() {
  const text = useEventText(DESTINATION_PREVIEW_EVENT, formatDestinationAlpha);
  return <>{` · alpha ${text ?? '—'}`}</>;
});
