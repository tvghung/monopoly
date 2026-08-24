/// <reference types="vite/client" />

declare const __PHASE4_UAT__: boolean;

interface Window {
  __OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?: Record<string, unknown>;
  __OWN_THE_BLOCK_CARD_FOCUS_DIAGNOSTICS__?: Record<string, unknown>;
  __OWN_THE_BLOCK_DESTINATION_PREVIEW_DIAGNOSTICS__?: Record<string, unknown>;
}

declare module 'virtual:phase4-uat' {
  import type { ComponentType } from 'react';
  const Phase4UatHarness: ComponentType;
  export default Phase4UatHarness;
}
