import { expect, test, type Page } from '@playwright/test';

type FocusSnapshot = {
  preventScroll: boolean;
  rendererScrollLeft: number;
  canvasLeft: number;
  rootLeft: number;
  samePanel: boolean;
  panelContainsFocus: boolean;
  open: boolean;
  transitionDuration: string;
  transform: string;
};

type JournalProbe = {
  before: {
    panelLeft: number;
    rendererRight: number;
    rendererScrollLeft: number;
    canvasLeft: number;
    rootLeft: number;
    inert: boolean;
    transitionDuration: string;
    transform: string;
  };
  focus: FocusSnapshot | null;
};

declare global {
  interface Window {
    __JOURNAL_FOCUS_PROBE__?: JournalProbe;
  }
}

async function openJournal(page: Page, viewport: { width: number; height: number }, reducedMotion = false) {
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => window.localStorage.setItem('own-the-block.hud.drawer.v1', 'closed'));
  await page.setViewportSize(viewport);
  await page.goto('/?phase4-uat=1&scenario=stations-4&uat-controls=hidden&quality=low&fpsLimit=60');
  await page.waitForSelector('[data-uat-ready="true"]', { timeout: 60000 });
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.center__room')!;
    const panel = document.querySelector<HTMLElement>('.center__room-panel')!;
    const renderer = document.querySelector<HTMLElement>('.game-board__renderer')!;
    const canvas = renderer.querySelector('canvas')!;
    const sample = () => ({
      rendererScrollLeft: renderer.scrollLeft,
      canvasLeft: canvas.getBoundingClientRect().left,
      rootLeft: root.getBoundingClientRect().left,
    });
    const probe: JournalProbe = {
      before: {
        panelLeft: panel.getBoundingClientRect().left,
        rendererRight: renderer.getBoundingClientRect().right,
        ...sample(),
        inert: panel.inert,
        transitionDuration: getComputedStyle(panel).transitionDuration,
        transform: getComputedStyle(panel).transform,
      },
      focus: null,
    };
    window.__JOURNAL_FOCUS_PROBE__ = probe;
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (options) {
      focus.call(this, options);
      if (this.id !== 'board-log-panel') return;
      probe.focus = {
        preventScroll: options?.preventScroll === true,
        ...sample(),
        samePanel: this.isConnected && document.querySelector('.center__room-panel') === this,
        panelContainsFocus: this.contains(document.activeElement),
        open: root.classList.contains('center__room--open'),
        transitionDuration: getComputedStyle(this).transitionDuration,
        transform: getComputedStyle(this).transform,
      };
    };
  });
  await page.locator('.center__room-toggle').click();
  await page.waitForFunction(() => Boolean(window.__JOURNAL_FOCUS_PROBE__?.focus), undefined, { timeout: 30000 });
  return page.evaluate(() => window.__JOURNAL_FOCUS_PROBE__!);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 740, height: 360 }]) {
  test('Journal opening does not scroll the board at ' + viewport.width, async ({ page }, testInfo) => {
    const probe = await openJournal(page, viewport);
    await testInfo.attach('journal-focus-' + viewport.width + '.json', {
      body: JSON.stringify(probe, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('journal-open-' + viewport.width + '.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    expect(probe.before.inert).toBe(true);
    expect(probe.before.panelLeft).toBeGreaterThanOrEqual(probe.before.rendererRight - 1);
    expect(probe.before.transitionDuration).toBe('0.24s');
    expect(probe.focus?.preventScroll).toBe(true);
    expect(probe.focus?.rendererScrollLeft).toBe(0);
    expect(Math.abs(probe.focus!.canvasLeft - probe.before.canvasLeft)).toBeLessThan(1);
    expect(Math.abs(probe.focus!.rootLeft - probe.before.rootLeft)).toBeLessThan(1);
    expect(probe.focus?.samePanel).toBe(true);
    expect(probe.focus?.panelContainsFocus).toBe(true);
    expect(probe.focus?.open).toBe(true);
    expect(probe.focus?.transitionDuration).toBe('0.24s');
  });
}

test('Journal opening respects reduced motion without scrolling the board', async ({ page }) => {
  const probe = await openJournal(page, { width: 1440, height: 900 }, true);
  expect(probe.before.inert).toBe(true);
  expect(probe.focus?.preventScroll).toBe(true);
  expect(probe.focus?.rendererScrollLeft).toBe(0);
  expect(Math.abs(probe.focus!.canvasLeft - probe.before.canvasLeft)).toBeLessThan(1);
  expect(Math.abs(probe.focus!.rootLeft - probe.before.rootLeft)).toBeLessThan(1);
  expect(probe.focus?.transitionDuration).toBe('0s');
  expect(probe.focus?.transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
});
