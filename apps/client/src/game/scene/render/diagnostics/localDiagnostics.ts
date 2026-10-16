/**
 * Gate for the dev/UAT-only renderer instrumentation (frame counter, diagnostics publisher, tile/prop rect publishers,
 * destination-preview diagnostics). A production page never mounts any of it: both build flags are `false` there.
 *
 * `renderDiagnostics=off` is a deliberate opt-out for performance measurements: the page then renders the same scene tree
 * a player gets, so a probe can quantify what the instrumentation itself costs and verify idle behavior without it.
 */
export const RENDER_DIAGNOSTICS_PARAM = 'renderDiagnostics';

/** True for localhost/127.0.0.1 and for any page that explicitly asked for the Phase 4 UAT harness. */
export function isDiagnosticsLocation(hostname: string, search: string): boolean {
  return hostname === '127.0.0.1'
    || hostname === 'localhost'
    || new URLSearchParams(search).get('phase4-uat') === '1';
}

/** `?renderDiagnostics=off` (also `0`/`false`) disables the instrumentation even in development and UAT builds. */
export function isRenderDiagnosticsOptedOut(search: string): boolean {
  const value = new URLSearchParams(search).get(RENDER_DIAGNOSTICS_PARAM);
  return value === 'off' || value === '0' || value === 'false';
}

/** The dev tooling (rect publishers) is mounted by build flags alone; only the opt-out removes it. */
export function isDevToolingEnabled(): boolean {
  return (import.meta.env.DEV || __PHASE4_UAT__)
    && typeof window !== 'undefined'
    && !isRenderDiagnosticsOptedOut(window.location.search);
}

/** Diagnostics only run on localhost or in the UAT harness; production pages pay nothing. */
export function isLocalDiagnosticsEnabled(): boolean {
  return isDevToolingEnabled()
    && isDiagnosticsLocation(window.location.hostname, window.location.search);
}
