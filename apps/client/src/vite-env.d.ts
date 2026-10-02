/// <reference types="vite/client" />

declare const __PHASE4_UAT__: boolean;

interface Window {
  __OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?: Record<string, unknown>;
  __OWN_THE_BLOCK_DESTINATION_PREVIEW_DIAGNOSTICS__?: Record<string, unknown>;
  /** Set by RendererDiagnostics (local/UAT only): asks the demand-rendered scene for one more frame. */
  __OWN_THE_BLOCK_RENDERER_INVALIDATE__?: () => void;
  /** Set by TileScreenRectsPublisher (dev/UAT only): the 40 tiles projected to page coordinates. */
  __OWN_THE_BLOCK_TILE_SCREEN_RECTS__?: {
    canvas: { left: number; top: number; width: number; height: number };
    tiles: { tileId: number; corners: readonly { x: number; y: number }[] }[];
  };
  /** Set by PropScreenRectsPublisher (dev/UAT only): the four table props projected to page coordinates. */
  __OWN_THE_BLOCK_PROP_SCREEN_RECTS__?: {
    canvas: { left: number; top: number; width: number; height: number };
    props: { id: string; visible: boolean; rect: { left: number; top: number; right: number; bottom: number } }[];
  };
  /** Set by the UAT harness in benchmark mode once the run has finished. */
  __OWN_THE_BLOCK_RENDERER_BENCHMARK__?: object;
}

declare module 'virtual:phase4-uat' {
  import type { ComponentType } from 'react';
  const Phase4UatHarness: ComponentType;
  export default Phase4UatHarness;
}
