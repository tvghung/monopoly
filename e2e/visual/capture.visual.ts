import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type Page } from '@playwright/test';
import { CAPTURES, type CaptureEntry } from './captures';

// VISUAL_EVIDENCE_DIR redirects the output, for example to compare against committed evidence.
const EVIDENCE_ROOT = process.env.VISUAL_EVIDENCE_DIR
  ? path.resolve(process.env.VISUAL_EVIDENCE_DIR)
  : fileURLToPath(new URL('../../project-document/visual-overhaul-v2/evidence/', import.meta.url));

const READY_TIMEOUT_MS = 60_000;
/** The renderer counts as settled once its published frame sequence has not changed for this long. */
const RENDERER_QUIET_MS = 700;
const RENDERER_POLL_MS = 100;

interface WindowWithDiagnostics {
  __OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?: unknown;
}

/** Async completions (SDF text, textures) render extra frames after readiness; wait until they stop. */
async function waitForRendererQuiet(page: Page): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastSequence: unknown;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const sequence = await page.evaluate(() => (
      (window as unknown as { __OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?: { frameSequence?: unknown } })
        .__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__?.frameSequence
    ));
    if (sequence !== lastSequence) {
      lastSequence = sequence;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= RENDERER_QUIET_MS) {
      return;
    }
    await page.waitForTimeout(RENDERER_POLL_MS);
  }
}

function outputBase(entry: CaptureEntry): string {
  const { width, height } = entry.viewport;
  return path.join(EVIDENCE_ROOT, entry.plan, entry.folder ?? '', `${entry.name}-${width}x${height}`);
}

async function waitForReadiness(page: Page, entry: CaptureEntry): Promise<void> {
  const readySelector = entry.kind === 'design-lab'
    ? '[data-design-lab-ready="true"]'
    : 'main.phase4-uat[data-uat-ready="true"]';
  await page.waitForSelector(readySelector, { state: 'attached', timeout: READY_TIMEOUT_MS });
  const expectsWebgl = entry.webgl ?? entry.kind === 'harness';
  if (expectsWebgl) {
    await page.waitForFunction(
      () => Boolean((window as unknown as WindowWithDiagnostics).__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__),
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
    // A running benchmark keeps the renderer busy on purpose: it never goes quiet.
    if (!entry.benchmarkSeconds) await waitForRendererQuiet(page);
  }
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  if (entry.extraWaitMs) await page.waitForTimeout(entry.extraWaitMs);
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

for (const entry of CAPTURES) {
  test(`capture ${entry.id}`, async ({ browser }) => {
    // The high tier renders the post chain in software on the capture machine: allow it three times longer.
    if (entry.url.includes('quality=high')) test.slow();
    const { width, height, touch } = entry.viewport;
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: Boolean(touch),
      hasTouch: Boolean(touch),
      reducedMotion: entry.osReducedMotion ? 'reduce' : 'no-preference',
    });
    try {
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
      });

      await page.goto(entry.url);
      await waitForReadiness(page, entry);

      const expectsWebgl = entry.webgl ?? entry.kind === 'harness';
      // Pages without a board (most Design Lab sections) have no renderer element: do not wait for one.
      const rendererMode = expectsWebgl
        ? await page.locator('[data-renderer-mode]').first().getAttribute('data-renderer-mode', { timeout: 30_000 }).catch(() => null)
        : null;
      if (expectsWebgl && rendererMode !== 'webgl') {
        throw new Error(
          `Expected the WebGL board but got renderer mode "${String(rendererMode)}". `
          + 'Run with VISUAL_HEADED=1 or check the SwiftShader launch flags.',
        );
      }
      const benchmark = entry.benchmarkSeconds
        ? await page.waitForFunction(
          () => (window as unknown as { __OWN_THE_BLOCK_RENDERER_BENCHMARK__?: unknown }).__OWN_THE_BLOCK_RENDERER_BENCHMARK__,
          undefined,
          { timeout: (entry.benchmarkSeconds + 60) * 1_000 },
        ).then(handle => handle.jsonValue() as Promise<unknown>)
        : null;
      const diagnostics = await page.evaluate(() => JSON.parse(JSON.stringify(
        (window as unknown as WindowWithDiagnostics).__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__ ?? null,
      )) as unknown);

      const base = outputBase(entry);
      await mkdir(path.dirname(base), { recursive: true });
      if (!entry.noScreenshot) {
        await page.screenshot({
          path: `${base}.png`, animations: 'disabled', caret: 'hide', fullPage: Boolean(entry.fullPage),
        });
      }
      await writeFile(`${base}.json`, `${JSON.stringify({
        id: entry.id,
        plan: entry.plan,
        folder: entry.folder ?? null,
        name: entry.name,
        url: entry.url,
        viewport: { width, height },
        kind: entry.kind,
        rendererMode,
        browser: `${browser.browserType().name()} ${browser.version()}`,
        captureTool: 'e2e/visual/capture.visual.ts',
        consoleErrors,
        benchmark,
        diagnostics,
      }, null, 2)}\n`);
    } finally {
      await context.close();
    }
  });
}
