import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

interface Probe {
  press: (tileId: number) => void;
  seek: (ms: number) => void;
  sample: (tileId: number) => { offset: number; root: number; layers: Record<string, number>; previewY: number | null; frames: { time: number; offset: number; root: number; layers: Record<string, number> }[]; images: Record<number, string> };
}
declare global { interface Window { __OWN_THE_BLOCK_TILE_IMPACT_PROBE__?: Probe } }

const evidence = process.env.VISUAL_EVIDENCE_DIR!;
test('refinement tile impact lifecycle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?phase4-uat=1&scenario=houses-max&uat-controls=hidden&quality=low&tile-impact-probe=1');
  await page.waitForSelector('[data-uat-ready="true"]', { timeout: 60000 });
  await page.waitForFunction(() => '__OWN_THE_BLOCK_TILE_IMPACT_PROBE__' in window);
  await page.waitForTimeout(1000);
  await mkdir(evidence, { recursive: true });
  const samples: unknown[] = [];
  for (const tileId of [1, 7, 5, 12, 0, 10, 20, 30, 11, 21, 31]) {
    await page.evaluate(id => window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__!.press(id), tileId);
    for (const [stage, ms] of [['rest', 0], ['start', 15], ['peak', 100], ['rebound', 180], ['complete', 300]] as const) {
      await page.evaluate(time => window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__!.seek(time), ms);
      await page.waitForTimeout(100);
      const sample = await page.evaluate(id => window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__!.sample(id), tileId);
      samples.push({ tileId, stage, ...sample, images: undefined });
      if ((tileId === 1 || tileId === 7) && sample.images[ms]) {
        await writeFile(path.join(evidence, 'board-' + tileId + '-' + stage + '.png'), Buffer.from(sample.images[ms].split(',')[1], 'base64'));
      }
      if (tileId === 1 || tileId === 7) await page.screenshot({ path: path.join(evidence, 'tile-' + tileId + '-' + stage + '.png') });
      if (process.env.REFINEMENT_ASSERT !== '0') {
        for (const frame of sample.frames) {
          expect(frame.layers.TileBodies - 0.655).toBeCloseTo(frame.root, 6);
          expect(frame.layers.TileImpactHighlightBatch - 0.811).toBeCloseTo(frame.root, 6);
          for (const [name, y] of Object.entries(frame.layers)) {
            if (name.startsWith('TileFooterLayer') || name.startsWith('TileSurfaceUpperLayer')) expect(y - 0.811).toBeCloseTo(frame.root, 6);
          }
        }
        expect(sample.root).toBeCloseTo(sample.offset, 6);
        expect(sample.layers.TileBodies - 0.655).toBeCloseTo(sample.offset, 6);
        for (const [name, y] of Object.entries(sample.layers)) {
          if (name.startsWith('TileFooterLayer') || name.startsWith('TileSurfaceUpperLayer')) expect(y - 0.811).toBeCloseTo(sample.offset, 6);
        }
      }
    }
  }
  await writeFile(path.join(evidence, 'tile-transforms.json'), JSON.stringify({ errors, samples }, null, 2));
  expect(errors).toEqual([]);
});

declare global {
  interface Window {
    __REFINEMENT_FRAME_GATE__?: { paused: boolean; arm: (selector: string, fade: boolean) => void; resume: () => void };
  }
}

async function installFrameGate(page: Page) {
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const queued: FrameRequestCallback[] = [];
    const gate = {
      paused: false,
      arm(selector: string, fade: boolean) {
        const started = performance.now();
        const inspect = () => {
          const node = document.querySelector(selector);
          const opacity = node ? Number(getComputedStyle(node).opacity) : 1;
          if (node && (fade ? opacity > 0.02 && opacity < 0.98 : performance.now() - started > 70)) {
            gate.paused = true;
            document.getAnimations().forEach(animation => {
              animation.pause();
              if (!fade && Number(animation.effect?.getComputedTiming().duration) === 1200) animation.currentTime = 420;
            });
          } else raf(inspect);
        };
        raf(inspect);
      },
      resume() {
        gate.paused = false;
        document.getAnimations().forEach(animation => animation.play());
        queued.splice(0).forEach(callback => raf(callback));
      },
    };
    window.requestAnimationFrame = callback => raf(time => {
      if (gate.paused) queued.push(callback);
      else callback(time);
    });
    window.__REFINEMENT_FRAME_GATE__ = gate;
  });
}

async function armMotion(page: Page, selector: string, fade = true) {
  await page.evaluate(({ target, opacity }) => window.__REFINEMENT_FRAME_GATE__!.arm(target, opacity), { target: selector, opacity: fade });
}

async function pauseMotion(page: Page, css = false) {
  await page.waitForFunction(() => window.__REFINEMENT_FRAME_GATE__!.paused, null, { timeout: 10000 });
  await page.waitForTimeout(50);
  if (css) await page.evaluate(async () => {
    const animations = document.getAnimations().filter(animation => Number(animation.effect?.getComputedTiming().duration) === 1200);
    await Promise.all(animations.map(animation => animation.ready));
    animations.forEach(animation => { animation.currentTime = 420; });
  });
  if (css) await page.waitForTimeout(50);
}

async function captureUi(page: Page, name: string) {
  const state = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('.ds-modal__overlay');
    const card = overlay?.querySelector<HTMLElement>('.ds-modal__card');
    const panel = document.querySelector<HTMLElement>('.center__room-panel');
    const toggle = document.querySelector<HTMLElement>('.center__room-toggle');
    const box = (node: HTMLElement | null | undefined) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), transform: style.transform, visibility: style.visibility, pointerEvents: style.pointerEvents,
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
        transitionDuration: style.transitionDuration, transitionTimingFunction: style.transitionTimingFunction,
        inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') };
    };
    const renderer = document.querySelector<HTMLElement>('.game-board__renderer')?.getBoundingClientRect();
    return { overlay: box(overlay), card: box(card), panel: box(panel), toggle: box(toggle),
      restores: document.querySelectorAll('[data-modal-restore]').length,
      active: document.activeElement?.getAttribute('aria-label'),
      scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      rendererLeft: renderer?.left ?? 0, rendererRight: renderer?.right ?? innerWidth };
  });
  await page.screenshot({ path: path.join(evidence, name + '.png') });
  await writeFile(path.join(evidence, name + '.json'), JSON.stringify(state, null, 2));
  return state;
}

async function resumeMotion(page: Page) {
  await page.evaluate(() => window.__REFINEMENT_FRAME_GATE__!.resume());
  await page.waitForTimeout(1400);
}

async function pauseJournalTransition(page: Page, currentTime = 600) {
  await page.waitForFunction(() => {
    const panel = document.querySelector<HTMLElement>('.center__room-panel');
    return panel?.getAnimations().some(animation => Number(animation.effect?.getComputedTiming().duration) === 1200) ?? false;
  });
  return page.evaluate(time => {
    const panel = document.querySelector<HTMLElement>('.center__room-panel')!;
    const toggle = document.querySelector<HTMLElement>('.center__room-toggle')!;
    const animations = [...panel.getAnimations(), ...toggle.getAnimations()]
      .filter(animation => Number(animation.effect?.getComputedTiming().duration) === 1200);
    animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
    const tx = (node: HTMLElement) => {
      const values = getComputedStyle(node).transform.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      return values.length === 6 ? values[4] : values.length === 16 ? values[12] : 0;
    };
    return {
      panelX: tx(panel), toggleX: tx(toggle),
      travel: panel.getBoundingClientRect().width + Number.parseFloat(getComputedStyle(panel).right),
      duration: getComputedStyle(panel).transitionDuration,
    };
  }, currentTime);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 740, height: 360 }]) {
  test('refinement modal peek Journal transitions ' + viewport.width, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await mkdir(evidence, { recursive: true });
    await page.setViewportSize(viewport);
    await page.goto('/?phase4-uat=1&scenario=stations-4&uat-controls=hidden&quality=low&fpsLimit=60');
    await page.waitForSelector('[data-uat-ready="true"]', { timeout: 60000 });
    await page.waitForTimeout(3000);
    await installFrameGate(page);
    const prefix = 'ui-' + viewport.width + '-';
    await armMotion(page, '.ds-modal__overlay');
    await page.locator('[data-tile-index="1"]').evaluate((element: HTMLElement) => element.click());
    await pauseMotion(page);
    const opening = await captureUi(page, prefix + 'modal-opening');
    expect(opening.overlay!.opacity).toBeGreaterThan(0);
    expect(opening.overlay!.opacity).toBeLessThan(1);
    await resumeMotion(page);
    const card = page.locator('.ds-modal__card');
    await expect(card).toBeVisible();
    const modalOpen = await captureUi(page, prefix + 'modal-open');

    await armMotion(page, '.ds-modal__overlay');
    await page.locator('[data-modal-peek]').evaluate((element: HTMLElement) => element.click());
    await pauseMotion(page);
    const hiding = await captureUi(page, prefix + 'peek-hiding');
    expect(hiding.overlay!.inert).toBe(true);
    expect(hiding.overlay!.pointerEvents).toBe('none');
    expect(hiding.overlay!.opacity).toBeGreaterThan(0);
    expect(hiding.overlay!.opacity).toBeLessThan(1);
    expect(hiding.restores).toBe(1);
    expect(hiding.card!.transform).toBe(modalOpen.card!.transform);
    expect(hiding.card!.left).toBeCloseTo(modalOpen.card!.left, 2);
    expect(hiding.card!.top).toBeCloseTo(modalOpen.card!.top, 2);
    expect(hiding.card!.width).toBeCloseTo(modalOpen.card!.width, 2);
    expect(hiding.card!.height).toBeCloseTo(modalOpen.card!.height, 2);
    await resumeMotion(page);
    await armMotion(page, '.ds-modal__overlay');
    await page.locator('[data-modal-restore]').evaluate((element: HTMLElement) => element.click());
    await pauseMotion(page);
    const restoring = await captureUi(page, prefix + 'peek-restoring');
    expect(restoring.restores).toBe(0);
    expect(restoring.overlay!.inert).toBe(false);
    expect(restoring.overlay!.opacity).toBeGreaterThan(0);
    expect(restoring.overlay!.opacity).toBeLessThan(1);
    expect(restoring.card!.transform).toBe(modalOpen.card!.transform);
    expect(restoring.card!.left).toBeCloseTo(modalOpen.card!.left, 2);
    expect(restoring.card!.top).toBeCloseTo(modalOpen.card!.top, 2);
    expect(restoring.card!.width).toBeCloseTo(modalOpen.card!.width, 2);
    expect(restoring.card!.height).toBeCloseTo(modalOpen.card!.height, 2);
    await resumeMotion(page);
    for (let index = 0; index < 3; index += 1) {
      await page.locator('[data-modal-peek]').evaluate((element: HTMLElement) => element.click());
      await page.locator('[data-modal-restore]').evaluate((element: HTMLElement) => element.click());
    }
    await resumeMotion(page);
    await armMotion(page, '.ds-modal__overlay');
    await page.locator('.ds-modal__close').evaluate((element: HTMLElement) => element.click());
    await pauseMotion(page);
    const closing = await captureUi(page, prefix + 'modal-closing');
    expect(closing.overlay!.inert).toBe(true);
    expect(closing.overlay!.opacity).toBeGreaterThan(0);
    expect(closing.overlay!.opacity).toBeLessThan(1);
    await resumeMotion(page);
    await expect(page.locator('.ds-modal__overlay')).toHaveCount(0);
    await captureUi(page, prefix + 'modal-closed');

    if (viewport.height < 500) {
      await page.addStyleTag({ content: '.center__room { --log-panel-inset: 20px; }' });
      await page.waitForTimeout(300);
    }
    const journalDuration = await page.locator('.center__room-panel').evaluate(
      (element: HTMLElement) => getComputedStyle(element).transitionDuration,
    );
    expect(journalDuration === '0.24s' || journalDuration === '240ms').toBe(true);
    await page.addStyleTag({ content: '.center__room-panel, .center__room-toggle { transition-duration: 1200ms !important; }' });
    await page.waitForTimeout(50);
    await page.locator('.center__room-toggle').evaluate((element: HTMLElement) => element.click());
    const openingMotion = await pauseJournalTransition(page);
    const drawerOpening = await captureUi(page, prefix + 'Journal-opening');
    const travel = openingMotion.travel;
    expect(openingMotion.panelX).toBeGreaterThan(0);
    expect(openingMotion.panelX).toBeLessThan(travel);
    expect(drawerOpening.panel!.inert).toBe(false);
    expect(Math.abs(drawerOpening.toggle!.right - drawerOpening.panel!.left)).toBeLessThan(2);
    await resumeMotion(page);
    await page.getByRole('textbox').fill('draft');
    await page.getByRole('textbox').press('Escape');
    const closingMotion = await pauseJournalTransition(page);
    const drawerClosing = await captureUi(page, prefix + 'Journal-closing');
    expect(closingMotion.panelX).toBeGreaterThan(0);
    expect(closingMotion.panelX).toBeLessThan(travel);
    expect(Math.abs(openingMotion.panelX + closingMotion.panelX - travel)).toBeLessThan(2);
    expect(drawerClosing.panel!.inert).toBe(true);
    expect(drawerClosing.panel!.pointerEvents).toBe('none');
    expect(Math.abs(drawerClosing.toggle!.right - drawerClosing.panel!.left)).toBeLessThan(2);
    expect(drawerClosing.scrollWidth).toBe(drawerClosing.viewportWidth);
    await resumeMotion(page);
    const closed = await captureUi(page, prefix + 'Journal-closed');
    expect(closed.panel!.inert).toBe(true);
    expect(closed.panel!.pointerEvents).toBe('none');
    expect(Math.abs(closed.panel!.left - closed.rendererRight)).toBeLessThanOrEqual(1);
    await expect(page.locator('.center__room-panel')).toHaveCount(1);
    for (let index = 0; index < 6; index += 1) await page.locator('.center__room-toggle').click();
    await expect(page.locator('.center__room-panel')).toHaveAttribute('inert', '');
    expect(errors).toEqual([]);

    // Observe actual scene submissions after all UI motion and asset work has settled.
    // UAT metrics update React and invalidate again; suppress that diagnostic feedback, then measure the resting scene.
    await page.evaluate(() => {
      const dispatch = window.dispatchEvent.bind(window);
      window.dispatchEvent = event => event.type === 'own-the-block-renderer' ? true : dispatch(event);
    });
    await page.waitForTimeout(1800);
    const idle = await page.evaluate(() => {
      const samples: number[] = [];
      window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__ = sample => samples.push(sample.timestampMs);
      return new Promise<number[]>(resolve => setTimeout(() => {
        delete window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__;
        resolve(samples);
      }, 800));
    });
    await writeFile(path.join(evidence, prefix + 'idle.json'), JSON.stringify({ sceneSubmissions: idle.length, errors }));
    expect(idle.length).toBeLessThanOrEqual(1);
  });
}

test('refinement card readable timer survives animated peek', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const eye = document.querySelector<HTMLElement>('.card-modal [data-modal-peek]');
      if (eye) { eye.click(); observer.disconnect(); }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto('/?phase4-uat=1&scenario=reconnect-revealed&uat-controls=hidden&quality=low');
  await page.waitForSelector('[data-uat-ready="true"]', { timeout: 60000 });
  await expect(page.locator('[data-modal-restore]')).toBeVisible();
  const close = page.locator('.card-modal__actions button');
  await expect(close).toBeDisabled();
  await page.waitForTimeout(3500);
  await page.locator('[data-modal-restore]').evaluate((element: HTMLElement) => element.click());
  await expect(close).toBeDisabled();
  await page.waitForTimeout(1800);
  await expect(close).toBeDisabled();
  await expect(close).toBeEnabled({ timeout: 4000 });
  await captureUi(page, 'card-readable-restored');
});

test('refinement Reduced Motion peek and Journal', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?phase4-uat=1&scenario=stations-4&uat-controls=hidden&quality=low');
  await page.waitForSelector('[data-uat-ready="true"]', { timeout: 60000 });
  await page.locator('[data-tile-index="1"]').evaluate((element: HTMLElement) => element.click());
  await page.waitForTimeout(200);
  const opened = await captureUi(page, 'reduced-modal-open');
  expect(opened.card!.transform).toBe('none');
  await page.locator('[data-modal-peek]').evaluate((element: HTMLElement) => element.click());
  await page.waitForTimeout(200);
  const hidden = await captureUi(page, 'reduced-peek-hidden');
  expect(hidden.overlay!.opacity).toBe(0);
  await page.locator('[data-modal-restore]').evaluate((element: HTMLElement) => element.click());
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.locator('.center__room-toggle').click();
  const drawer = await captureUi(page, 'reduced-Journal-open');
  expect(drawer.panel!.transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
  await page.locator('.center__room-toggle').click();
  const closedDrawer = await captureUi(page, 'reduced-Journal-closed');
  expect(closedDrawer.panel!.inert).toBe(true);
  expect(closedDrawer.panel!.pointerEvents).toBe('none');
  expect(Math.abs(closedDrawer.panel!.left - closedDrawer.rendererRight)).toBeLessThanOrEqual(1);
});

test('refinement destination preview moves with its impacted tile', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.goto('/?phase4-uat=1&scenario=destination-geometry&quality=low&tile-impact-probe=1');
  await page.waitForSelector('[data-uat-ready="true"]', { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Chạy lại' }).click();
  await page.waitForFunction(() => window.__OWN_THE_BLOCK_DESTINATION_PREVIEW_DIAGNOSTICS__?.tileId === 6
    && window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__?.sample(6).previewY !== null);
  await page.evaluate(() => window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__!.press(6));
  const samples = await page.evaluate(() => [0, 15, 100, 180, 300].map(ms => {
    const probe = window.__OWN_THE_BLOCK_TILE_IMPACT_PROBE__!;
    probe.seek(ms);
    const { offset, root, layers, previewY } = probe.sample(6);
    return { ms, offset, root, layers, previewY };
  }));
  for (const sample of samples) {
    expect(sample.previewY).not.toBeNull();
    expect(sample.previewY!).toBeCloseTo(sample.root!, 6);
  }
  await writeFile(path.join(evidence, 'destination-impact.json'), JSON.stringify(samples, null, 2));
  await page.screenshot({ path: path.join(evidence, 'destination-impact.png') });
});
