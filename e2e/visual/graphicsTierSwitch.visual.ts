import { expect, test, type Page } from '@playwright/test';

// V1.1 feedback item 12: switching the graphics quality while the board is on screen must keep the board. Before the fix the
// first switch moved the Canvas pixel ratio, R3F rewrote the fixed orthographic camera to +-size/2 pixels and the board
// shrank to a few dozen pixels (the player stations, drawn in the same scene, went with it) until something resized the window.
// Runs in SwiftShader like the captures; the `high` step is slow there. `pnpm visual:capture` runs it with the captures; run it
// alone with `pnpm exec playwright test --config playwright.visual.config.ts graphicsTierSwitch`.
const SELECT = 'select[aria-label="Chất lượng đồ họa (UAT)"]';
const SEQUENCE = ['low', 'balanced', 'low', 'high', 'balanced'] as const;
/** Canvas pixel ratio per tier on a device with ratio 1: the tier's range clamps it (renderQuality.ts). */
const EXPECTED_PIXEL_RATIO = { low: 1, balanced: 1.25, high: 1.25 } as const;
const READY_TIMEOUT_MS = 120_000;
const SWITCH_TIMEOUT_MS = 240_000;
const RENDERER_QUIET_MS = 700;
/** Under SwiftShader this scene keeps drawing a frame every second or two and never goes fully quiet, so quiet is best effort. */
const RENDERER_SETTLE_CAP_MS = 8_000;

interface Diagnostics {
  qualityTier: string;
  pixelRatio: number;
  frameSequence: number;
  mainDrawCalls: number;
  renderedTriangles: number;
  cameraFrustum: { left: number; right: number; top: number; bottom: number; zoom: number } | null;
  shadows: { enabled: boolean };
}

async function diagnostics(page: Page): Promise<Diagnostics | null> {
  return page.evaluate(() => {
    const value = (window as unknown as { __OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?: unknown })
      .__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__;
    return value ? JSON.parse(JSON.stringify(value)) as Diagnostics : null;
  });
}

/** Async completions render extra frames after a change; wait until the published frame sequence stops moving, for a bounded time. */
async function waitForRendererQuiet(page: Page): Promise<void> {
  const deadline = Date.now() + RENDERER_SETTLE_CAP_MS;
  let last: number | undefined;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const sequence = (await diagnostics(page))?.frameSequence;
    if (sequence !== last) {
      last = sequence;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= RENDERER_QUIET_MS) {
      return;
    }
    await page.waitForTimeout(100);
  }
}

/** How many different colors the canvas area shows: a board with its tiles, pieces and trays has thousands, the bare table far fewer. */
async function distinctColors(page: Page): Promise<number> {
  const png = await page.locator('canvas').first().screenshot();
  return page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const seen = new Set<number>();
    for (let index = 0; index < data.length; index += 4) {
      seen.add(((data[index] >> 3) << 10) | ((data[index + 1] >> 3) << 5) | (data[index + 2] >> 3));
    }
    return seen.size;
  }, png.toString('base64'));
}

test('graphics tier switch keeps the board on screen', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?phase4-uat=1&scenario=stations-4&quality=balanced');
    await page.waitForSelector('main.phase4-uat[data-uat-ready="true"]', { state: 'attached', timeout: READY_TIMEOUT_MS });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?: unknown }).__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__),
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
    await waitForRendererQuiet(page);
    const first = await diagnostics(page);
    expect(first?.cameraFrustum).not.toBeNull();
    const baselineColors = await distinctColors(page);
    let previousFrame = first?.frameSequence ?? 0;

    for (const tier of SEQUENCE) {
      await page.selectOption(SELECT, tier);
      // The renderer publishes again once the new tier has been drawn.
      await page.waitForFunction(
        expected => (window as unknown as { __OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?: { qualityTier?: string } })
          .__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?.qualityTier === expected,
        tier,
        { timeout: SWITCH_TIMEOUT_MS },
      );
      await waitForRendererQuiet(page);

      const current = await diagnostics(page);
      expect(current, `diagnostics after ${tier}`).not.toBeNull();
      expect(current?.qualityTier).toBe(tier);
      expect(current?.pixelRatio, `pixel ratio in ${tier}`).toBe(EXPECTED_PIXEL_RATIO[tier]);
      expect(current?.shadows.enabled, `shadows in ${tier}`).toBe(tier !== 'low');
      expect(current?.frameSequence ?? 0, `frames drawn after switching to ${tier}`).toBeGreaterThan(previousFrame);
      expect(current?.mainDrawCalls ?? 0).toBeGreaterThan(100);
      expect(current?.renderedTriangles ?? 0).toBeGreaterThan(10_000);
      // The root cause of the vanishing board: the frustum must be exactly what it was before the switch.
      expect(current?.cameraFrustum, `camera frustum in ${tier}`).toEqual(first?.cameraFrustum);
      // And the pixels agree: the board is still drawn, not just the table and the HUD.
      expect(await distinctColors(page), `colors on the canvas in ${tier}`).toBeGreaterThan(baselineColors * 0.5);
      previousFrame = current?.frameSequence ?? previousFrame;
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
