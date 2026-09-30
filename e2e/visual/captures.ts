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
  /** Capture the whole scrollable page instead of the viewport (Design Lab sections). */
  fullPage?: boolean;
  /** Measurement only: write the diagnostics JSON and skip the PNG (keeps the repository small). */
  noScreenshot?: boolean;
  /** Run the harness benchmark for this many seconds and store the summary in the sidecar JSON. */
  benchmarkSeconds?: number;
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

export const LAB_REFERENCE_SECTIONS = ['tokens', 'typography', 'components', 'game-ui', 'scene-palette'] as const;
export const LAB_CONCEPT_SCREENS = ['hud', 'purchase', 'lobby', 'landing'] as const;

function labCaptures(options: {
  plan: string;
  folder: string;
  sections: readonly string[];
  viewports: readonly CaptureViewport[];
  surface: string;
  theme?: 'v1' | 'v2';
}): CaptureEntry[] {
  const { plan, folder, sections, viewports, surface, theme = 'v2' } = options;
  return sections.flatMap(section => viewports.map(viewport => ({
    id: `${plan}-${folder}-${surface}-${section}-${theme}-${viewport.width}x${viewport.height}`,
    plan,
    folder,
    name: `${plan}-${surface}-${section}-${theme}`,
    url: designLabUrl(section, `&theme=${theme}`),
    viewport,
    kind: 'design-lab' as const,
    // The HUD concept keeps the real WebGL board; every other section is DOM only.
    webgl: section === 'hud',
    fullPage: section !== 'hud',
  })));
}

const LAB_VIEWPORTS = [VIEWPORTS.laptop, VIEWPORTS.phoneLandscape] as const;

function harnessCaptures(options: {
  plan: string;
  folder?: string;
  scenarios: readonly string[];
  viewports?: readonly CaptureViewport[];
  surface?: string;
  noScreenshot?: boolean;
  /** Extra query string appended to the harness URL, for example `&quality=low`. */
  extraQuery?: string;
  /** Suffix for the file name and id, for example a graphics tier. */
  variant?: string;
  benchmarkSeconds?: number;
}): CaptureEntry[] {
  const {
    plan, folder, scenarios, viewports = STANDARD_VIEWPORTS, surface = 'board', noScreenshot, extraQuery = '', variant, benchmarkSeconds,
  } = options;
  const suffix = variant ? `-${variant}` : '';
  return scenarios.flatMap(scenario => viewports.map(viewport => ({
    id: `${plan}${folder ? `-${folder}` : ''}-${surface}-${scenario}${suffix}-${viewport.width}x${viewport.height}`,
    plan,
    folder,
    name: `${plan}-${surface}-${scenario}${suffix}`,
    url: harnessUrl(scenario, `${benchmarkSeconds ? `&benchmark=${benchmarkSeconds}` : ''}${extraQuery}`),
    viewport,
    kind: 'harness' as const,
    noScreenshot,
    benchmarkSeconds,
  })));
}

/** Baseline of the running V1 look before any V2 token or theme change (plan 01 T01.2). */
export const BASELINE_SCENARIOS = [
  'stations-4', 'board-readability', 'purchase', 'rent', 'chance', 'jail', 'stress',
] as const;

export const CAPTURES: readonly CaptureEntry[] = [
  ...harnessCaptures({ plan: '01', folder: 'baseline', scenarios: BASELINE_SCENARIOS }),
  // Design Lab reference sections, v2 proposal and the v1 look for comparison (plan 01 T01.9).
  ...labCaptures({ plan: '01', folder: 'lab', sections: LAB_REFERENCE_SECTIONS, viewports: LAB_VIEWPORTS, surface: 'lab' }),
  ...labCaptures({
    plan: '01', folder: 'lab', sections: ['components', 'game-ui'], viewports: [VIEWPORTS.laptop], surface: 'lab', theme: 'v1',
  }),
  // Plan 02 T02.0: draw-call and triangle baseline with the corrected diagnostics (JSON only).
  ...harnessCaptures({
    plan: '02',
    folder: 'baseline-measure',
    scenarios: ['stations-4', 'board-readability', 'stress', 'dice-contact-shadows'],
    viewports: [VIEWPORTS.fullHd, VIEWPORTS.minimum],
    noScreenshot: true,
  }),
  // Plan 02 T02.2: frame-time benchmark of the current renderer (JSON only).
  ...harnessCaptures({
    plan: '02',
    folder: 'benchmark',
    scenarios: ['stress', 'board-readability'],
    viewports: [VIEWPORTS.fullHd],
    surface: 'bench',
    variant: 'baseline',
    noScreenshot: true,
    benchmarkSeconds: 10,
  }),
  // Concept screens at the standard viewports (plan 01 T01.10).
  ...labCaptures({ plan: '01', folder: 'concepts', sections: LAB_CONCEPT_SCREENS, viewports: STANDARD_VIEWPORTS, surface: 'concept' }),
];
