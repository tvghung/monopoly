// Typed manifest of reproducible evidence captures (visual-overhaul-v2 README §8, plan 01 §9.7).
// Add entries here; `capture.visual.ts` turns each into one PNG plus a diagnostics sidecar JSON.

export interface CaptureViewport {
  width: number;
  height: number;
  /** Emulate a touch phone (mobile UA, touch events). */
  touch?: boolean;
}

export type CaptureKind = 'harness' | 'design-lab';

export interface CaptureEntry {
  /** Unique id, also used in the test title so `--grep` can select captures. */
  id: string;
  /** Plan number folder under `evidence/`, for example `01`. */
  plan: string;
  /** Optional sub folder under `evidence/<plan>/`, for example `baseline` or `g1`. */
  folder?: string;
  /** File name stem: `<NN>-<surface>-<state>` (the viewport suffix is appended). */
  name: string;
  /** Path and query relative to the dev server origin. */
  url: string;
  viewport: CaptureViewport;
  kind: CaptureKind;
  /** Expect the WebGL board (default true for harness captures); false skips the diagnostics wait. */
  webgl?: boolean;
  /** Extra settle time after every readiness signal, for effects that outlive the marker. */
  extraWaitMs?: number;
  /** Emulate `prefers-reduced-motion: reduce`. */
  osReducedMotion?: boolean;
}

export const VIEWPORTS = {
  fullHd: { width: 1920, height: 1080 },
  laptop: { width: 1440, height: 900 },
  minimum: { width: 1280, height: 720 },
  phoneLandscape: { width: 812, height: 375, touch: true },
  smallPhoneLandscape: { width: 667, height: 375, touch: true },
  tabletLandscape: { width: 1024, height: 768, touch: true },
} as const satisfies Record<string, CaptureViewport>;

export const STANDARD_VIEWPORTS: readonly CaptureViewport[] = [
  VIEWPORTS.fullHd,
  VIEWPORTS.laptop,
  VIEWPORTS.minimum,
  VIEWPORTS.phoneLandscape,
];

export function harnessUrl(scenario: string, extra = ''): string {
  return `/?phase4-uat=1&scenario=${scenario}&uat-controls=hidden${extra}`;
}

export function designLabUrl(section: string, extra = ''): string {
  return `/?phase4-uat=1&design-lab=1&section=${section}${extra}`;
}

function harnessCaptures(options: {
  plan: string;
  folder?: string;
  scenarios: readonly string[];
  viewports?: readonly CaptureViewport[];
  surface?: string;
}): CaptureEntry[] {
  const { plan, folder, scenarios, viewports = STANDARD_VIEWPORTS, surface = 'board' } = options;
  return scenarios.flatMap(scenario => viewports.map(viewport => ({
    id: `${plan}${folder ? `-${folder}` : ''}-${surface}-${scenario}-${viewport.width}x${viewport.height}`,
    plan,
    folder,
    name: `${plan}-${surface}-${scenario}`,
    url: harnessUrl(scenario),
    viewport,
    kind: 'harness' as const,
  })));
}

/** Baseline of the running V1 look before any V2 token or theme change (plan 01 T01.2). */
export const BASELINE_SCENARIOS = [
  'stations-4', 'board-readability', 'purchase', 'rent', 'chance', 'jail', 'stress',
] as const;

export const CAPTURES: readonly CaptureEntry[] = [
  ...harnessCaptures({ plan: '01', folder: 'baseline', scenarios: BASELINE_SCENARIOS }),
];
