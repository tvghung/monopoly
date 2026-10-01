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
  /** Make WebGL unavailable so the board falls back to the legacy DOM view. */
  noWebglContext?: boolean;
  /** Report every HUD region (`data-hud-region`) that covers more than 4% of a tile (plan 03 T03.14). */
  overlapCheck?: boolean;
}

export const VIEWPORTS = {
  fullHd: { width: 1920, height: 1080 },
  laptop: { width: 1440, height: 900 },
  minimum: { width: 1280, height: 720 },
  phoneLandscape: { width: 812, height: 375, touch: true },
  smallPhoneLandscape: { width: 667, height: 375, touch: true },
  ultrawide: { width: 2560, height: 1080 },
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

/**
 * Real-component surfaces of the Design Lab (plan 04 §9, `dev/design-lab/surfaces/surfaceRegistry.tsx`): one capture per
 * surface, alone on the page (`chrome=hidden`), viewport only because dialogs are fixed overlays. Keep the ids in step
 * with the registry.
 */
function surfaceCaptures(options: {
  plan: string;
  folder: string;
  surfaces: readonly string[];
  viewports: readonly CaptureViewport[];
  theme?: 'v1' | 'v2';
}): CaptureEntry[] {
  const { plan, folder, surfaces, viewports, theme = 'v2' } = options;
  return surfaces.flatMap(surface => viewports.map(viewport => ({
    id: `${plan}-${folder}-surface-${surface}-${viewport.width}x${viewport.height}`,
    plan,
    folder,
    name: `${plan}-surface-${surface}`,
    url: designLabUrl('surfaces', `&surface=${surface}&theme=${theme}&chrome=hidden`),
    viewport,
    kind: 'design-lab' as const,
    webgl: false,
  })));
}

/** The surfaces that existed before plan 04 restyled them: the `04/baseline` group (a historical record, do not extend). */
export const PLAN04_BASELINE_SURFACES = [
  'landing', 'landing-prefilled', 'lobby-host', 'lobby-guest', 'lobby-alone', 'settings', 'loading', 'bootstrap-error', 'connection',
  'spectator', 'buy', 'buy-short', 'development-houses', 'development-hotel', 'jail', 'winner-host', 'winner-guest',
] as const;

/**
 * Every Design Lab surface of plan 04 (`apps/client/src/dev/design-lab/surfaces/*Surfaces.tsx`) for the `04/g4` review package.
 * `surfaceCaptures.test.ts` in the client keeps this list equal to the registry, so a new fixture fails a test until it is here.
 */
export const PLAN04_SURFACES = [
  // Landing and launcher
  'landing', 'landing-prefilled', 'landing-public', 'landing-busy',
  'launcher', 'launcher-running', 'launcher-host', 'launcher-join',
  // Lobby
  'lobby-host', 'lobby-guest', 'lobby-alone', 'lobby-full', 'lobby-start-blocked', 'lobby-lan',
  // Settings
  'settings', 'settings-desktop', 'settings-reduced-motion',
  // Decisions
  'buy', 'buy-short', 'development-houses', 'development-hotel', 'jail',
  'debt-debtor', 'debt-debtor-sale-open', 'debt-observer', 'forced-sale-buyer', 'forced-sale-seller', 'trade', 'incoming-offers',
  // Inspection and portfolios
  'deeds', 'inspection-street', 'inspection-own-street', 'inspection-railroad', 'inspection-unowned', 'inspection-special',
  'assets', 'assets-empty', 'player-portfolio',
  // Card reveal
  'card-chance', 'card-chest', 'card-waiting',
  // Victory
  'winner-host', 'winner-guest', 'winner-spectator', 'winner-many-players',
  // Screens
  'confirm-forfeit', 'toasts', 'loading', 'loading-restoring', 'bootstrap-error', 'failure-replaced', 'failure-error',
  'connection', 'spectator',
] as const;

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
  noWebglContext?: boolean;
  overlapCheck?: boolean;
}): CaptureEntry[] {
  const {
    plan, folder, scenarios, viewports = STANDARD_VIEWPORTS, surface = 'board', noScreenshot, extraQuery = '', variant, benchmarkSeconds,
    noWebglContext,
    overlapCheck,
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
    noWebglContext,
    overlapCheck,
    webgl: noWebglContext ? false : undefined,
  })));
}

export const GRAPHICS_TIERS = ['low', 'balanced', 'high'] as const;

/** Plan 03 §T03.0: the fixtures the HUD is reviewed with. */
export const PLAN03_SCENARIOS = [
  'stations-2', 'stations-4', 'rent', 'balance-gate', 'jail', 'opponent-turn', 'bankrupt', 'reconnect-revealed', 'spectator-revealed',
] as const;

/** Plan 02 §T02.17: the fixtures every graphics tier is reviewed with. */
const G2_FIXTURES = ['stations-4', 'board-readability', 'stress', 'hotel', 'rent', 'dice-contact-shadows', 'reduced-motion'] as const;

/** Baseline of the running V1 look before any V2 token or theme change (plan 01 T01.2). */
export const BASELINE_SCENARIOS = [
  'stations-4', 'board-readability', 'purchase', 'rent', 'chance', 'jail', 'stress',
] as const;

export const CAPTURES: readonly CaptureEntry[] = [
  // `baseline` is the V1 record taken before the global theme switch; re-running it now renders v2.
  // Compare against it, do not overwrite it.
  ...harnessCaptures({ plan: '01', folder: 'baseline', scenarios: BASELINE_SCENARIOS }),
  // Plan 01 T01.12: the same surfaces with the v2 theme on globally, for the token-level regression review.
  ...harnessCaptures({ plan: '01', folder: 'theme-v2', scenarios: BASELINE_SCENARIOS }),
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
  // Plan 02 budget-recovery checks: before/after pixel comparisons of the changed visuals.
  ...harnessCaptures({
    plan: '02',
    folder: 'recovery',
    scenarios: ['dice-contact-shadows', 'roll-chance'],
    viewports: [VIEWPORTS.laptop],
  }),
  // Plan 02 T02.15: what each graphics preset looks like (screenshots + diagnostics).
  ...GRAPHICS_TIERS.flatMap(tier => harnessCaptures({
    plan: '02',
    folder: 'tier-shots',
    scenarios: ['board-readability'],
    viewports: [VIEWPORTS.laptop],
    surface: 'tier',
    variant: tier,
    extraQuery: `&quality=${tier}`,
  })),
  // Plan 02 T02.11: the table must cover every standard viewport, including 21:9.
  ...harnessCaptures({
    plan: '02',
    folder: 'tabletop',
    scenarios: ['board-readability'],
    viewports: [VIEWPORTS.fullHd, VIEWPORTS.minimum, VIEWPORTS.phoneLandscape, VIEWPORTS.ultrawide],
    surface: 'table',
  }),
  // Plan 02 T02.8: tone mapping comparison (ACES Filmic, AgX, Neutral) for the G2 package.
  ...(['aces', 'agx', 'neutral'] as const).flatMap(mapper => harnessCaptures({
    plan: '02',
    folder: 'tonemap',
    scenarios: ['board-readability', 'rent', 'hotel'],
    viewports: [VIEWPORTS.laptop],
    surface: 'tonemap',
    variant: mapper,
    extraQuery: `&tonemap=${mapper}`,
  })),
  // Plan 02 T02.7: draw-call and tier diagnostics per graphics preset (JSON only).
  ...GRAPHICS_TIERS.flatMap(tier => harnessCaptures({
    plan: '02',
    folder: 'tiers',
    scenarios: ['board-readability', 'stress'],
    viewports: [VIEWPORTS.fullHd],
    surface: 'tier',
    variant: tier,
    extraQuery: `&quality=${tier}`,
    noScreenshot: true,
  })),
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
  // Plan 02 T02.15/T02.17: the same benchmark per graphics preset. Meaningful only with VISUAL_GPU=hardware.
  ...GRAPHICS_TIERS.flatMap(tier => harnessCaptures({
    plan: '02',
    folder: 'benchmark',
    scenarios: ['stress', 'board-readability'],
    viewports: [VIEWPORTS.fullHd],
    surface: 'bench',
    variant: tier,
    extraQuery: `&quality=${tier}`,
    noScreenshot: true,
    benchmarkSeconds: 10,
  })),
  // Plan 02 T02.17 (gate G2 package). Take these after T02.16 so the review sees the final palette.
  ...GRAPHICS_TIERS.flatMap(tier => harnessCaptures({
    plan: '02',
    folder: 'g2/fixtures',
    scenarios: G2_FIXTURES,
    viewports: [VIEWPORTS.laptop],
    surface: 'g2',
    variant: tier,
    extraQuery: `&quality=${tier}`,
  })),
  ...GRAPHICS_TIERS.flatMap(tier => harnessCaptures({
    plan: '02',
    folder: 'g2/viewports',
    scenarios: ['board-readability'],
    viewports: [VIEWPORTS.fullHd, VIEWPORTS.minimum, VIEWPORTS.phoneLandscape, VIEWPORTS.ultrawide],
    surface: 'g2',
    variant: tier,
    extraQuery: `&quality=${tier}`,
  })),
  ...harnessCaptures({
    plan: '02',
    folder: 'g2/fallback',
    scenarios: ['board-readability'],
    viewports: [VIEWPORTS.laptop, VIEWPORTS.phoneLandscape],
    surface: 'g2',
    variant: 'legacy',
    noWebglContext: true,
  }),
  // Plan 03 T03.0: the HUD as it is before the restructure (v2 tokens, old layout), for before/after review.
  ...harnessCaptures({
    plan: '03',
    folder: 'baseline',
    scenarios: PLAN03_SCENARIOS,
    viewports: [VIEWPORTS.laptop, VIEWPORTS.phoneLandscape],
    surface: 'hud',
  }),
  // Plan 03 T03.15: the HUD after the restructure = the gate G3 package.
  ...harnessCaptures({
    plan: '03',
    folder: 'g3',
    scenarios: [...PLAN03_SCENARIOS, 'stations-3', 'offline', 'turn-recovery', 'purchase', 'reduced-motion'],
    viewports: [VIEWPORTS.laptop, VIEWPORTS.minimum, VIEWPORTS.phoneLandscape],
    surface: 'hud',
    overlapCheck: true,
  }),
  // Plan 03 T03.13: crowding at the smallest phone landscape, and legacy-board parity (no WebGL context).
  ...harnessCaptures({
    plan: '03',
    folder: 'g3/responsive',
    scenarios: ['stations-4', 'jail'],
    viewports: [VIEWPORTS.smallPhoneLandscape, VIEWPORTS.tabletLandscape],
    surface: 'hud',
    overlapCheck: true,
  }),
  ...harnessCaptures({
    plan: '03',
    folder: 'g3/legacy',
    scenarios: ['stations-4', 'jail'],
    viewports: [VIEWPORTS.laptop, VIEWPORTS.smallPhoneLandscape],
    surface: 'hud',
    variant: 'legacy',
    noWebglContext: true,
  }),
  // Plan 04 T04.0: every surface as it looks before the restyle (real components on fixture state).
  ...surfaceCaptures({
    plan: '04',
    folder: 'baseline',
    surfaces: PLAN04_BASELINE_SURFACES,
    viewports: [VIEWPORTS.laptop, VIEWPORTS.phoneLandscape],
  }),
  // Plan 04 T04.16: the gate G4 package, every surface at the standard sizes plus the smallest phone landscape.
  ...surfaceCaptures({
    plan: '04',
    folder: 'g4',
    surfaces: PLAN04_SURFACES,
    viewports: [VIEWPORTS.laptop, VIEWPORTS.minimum, VIEWPORTS.phoneLandscape, VIEWPORTS.smallPhoneLandscape],
  }),
  // Plan 04 T04.16: the V1 card contract review on the real board (the card over the WebGL scene, for each role).
  ...harnessCaptures({
    plan: '04',
    folder: 'g4/cards',
    scenarios: ['chance', 'chest', 'reconnect-revealed', 'spectator-revealed'],
    viewports: [VIEWPORTS.laptop, VIEWPORTS.phoneLandscape],
    surface: 'cards',
  }),
  // Plan 05 T05.0/T05.1: today's houses, hotels and sprites in the worst-case fixtures, every tier (numbers only, no PNG) ...
  ...GRAPHICS_TIERS.flatMap(tier => harnessCaptures({
    plan: '05',
    folder: 'baseline/numbers',
    scenarios: ['board-readability', 'house-4', 'hotel', 'landmarks-all', 'houses-max', 'standees'],
    viewports: [VIEWPORTS.fullHd],
    surface: 'assets',
    variant: tier,
    extraQuery: `&quality=${tier}`,
    noScreenshot: true,
  })),
  // ... and a few pictures of them at the minimum window (balanced tier) for the before/after comparison.
  ...harnessCaptures({
    plan: '05',
    folder: 'baseline',
    scenarios: ['house-4', 'hotel', 'landmarks-all', 'houses-max', 'standees'],
    viewports: [VIEWPORTS.minimum],
    surface: 'assets',
    variant: 'balanced',
    extraQuery: '&quality=balanced',
  }),
  // Plan 05: the new kit on the live board, balanced tier, at the minimum window (iteration and the G5a package).
  ...harnessCaptures({
    plan: '05',
    folder: 'g5a',
    scenarios: ['house-4', 'hotel', 'landmarks-all', 'houses-max', 'standees'],
    viewports: [VIEWPORTS.minimum],
    surface: 'assets',
    variant: 'balanced',
    extraQuery: '&quality=balanced',
  }),
  // Plan 05 T05.5: the pilot landmarks at a size the board never shows them (the style sheet of gate G5a).
  ...([
    ['landmarks', ''],
    ['chua-cau', '&landmark=13'],
    ['cau-vang', '&landmark=24'],
    ['landmark-81', '&landmark=39'],
  ] as const).map(([slug, query]): CaptureEntry => ({
    id: `05-g5a-sheet-${slug}-1440x900`,
    plan: '05',
    folder: 'g5a',
    name: `05-sheet-${slug}`,
    url: designLabUrl('landmarks', `&theme=v2${query}`),
    viewport: VIEWPORTS.laptop,
    kind: 'design-lab',
    webgl: false,
    extraWaitMs: 4000,
  })),
  // Concept screens at the standard viewports (plan 01 T01.10).
  ...labCaptures({ plan: '01', folder: 'concepts', sections: LAB_CONCEPT_SCREENS, viewports: STANDARD_VIEWPORTS, surface: 'concept' }),
];
