import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { writeFileSync } from 'node:fs';

const roomCode = `OTB-${Date.now().toString(36).slice(-6).toUpperCase()}`;
const probePath = path.resolve('scripts/perf/probe-init.js');

async function join(page: Page, name: string) {
  await page.goto(`/?room=${roomCode.toLowerCase()}`);
  await page.getByLabel('Tên của bạn').fill(name);
  await page.getByRole('button', { name: 'Vào phòng' }).click();
  await expect(page.getByRole('heading', { name: roomCode })).toBeVisible();
}

async function setFps(page: Page, fps: number) {
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cài đặt' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Giới hạn FPS:/ }).click();
  await page.getByRole('option', { name: `${fps} FPS` }).click();
  await expect(dialog.getByRole('button', { name: `Giới hạn FPS: ${fps} FPS` })).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await expect(dialog).toBeHidden();
}

async function setLowQuality(page: Page) {
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cài đặt' });
  await dialog.getByRole('radio', { name: 'Thấp' }).click();
  await expect(dialog.getByRole('radio', { name: 'Thấp' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Đóng' }).click();
}

test('B4 real two-browser session: FPS, roll, camera, visibility, reconnect and Play Again', async ({ browser }) => {
  test.skip(
    process.env.B4_REAL_SESSION !== '1' || test.info().project.name !== 'mobile-chromium',
    'Run this physical-GPU acceptance probe explicitly in headed Chrome.',
  );
  test.setTimeout(240_000);
  const desktopContext = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25, isMobile: false, hasTouch: false };
  const hostContext = await browser.newContext(desktopContext);
  const page = await hostContext.newPage();
  const guestContext = await browser.newContext(desktopContext);
  const guest = await guestContext.newPage();
  const guestFallback = process.env.B4_GUEST_FALLBACK === '1';
  const errors: string[] = [];
  for (const target of [page, guest]) {
    await target.addInitScript({ path: probePath });
    target.on('pageerror', error => errors.push(error.message));
  }
  if (guestFallback) await guest.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type: string, ...args: unknown[]) {
      return type === 'webgl' || type === 'webgl2' ? null : Reflect.apply(original, this, [type, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const evidence: Record<string, unknown> = {
    roomCode,
    quality: process.env.B4_QUALITY === 'low' ? 'low' : 'auto',
    guestFallback,
    steps: [] as string[],
  };
  const step = (name: string) => {
    (evidence.steps as string[]).push(name);
    console.log(`B4 step: ${name}`);
    if (process.env.B4_EVIDENCE_OUT) writeFileSync(process.env.B4_EVIDENCE_OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  };
  try {
    await join(page, 'B4 Host');
    await join(guest, 'B4 Guest');
    await page.getByRole('button', { name: 'Chó', exact: true }).click();
    await guest.getByRole('button', { name: 'Capybara', exact: true }).click();
    await page.getByRole('button', { name: 'Sẵn sàng' }).click();
    await guest.getByRole('button', { name: 'Sẵn sàng' }).click();
    await page.getByRole('button', { name: 'Bắt đầu' }).click();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(guest.getByTestId('game-board')).toBeVisible();
    await expect(page.locator('.game-scene canvas')).toBeAttached();
    if (guestFallback) await expect(guest.locator('.legacy-board')).toBeVisible();
    else await expect(guest.locator('.game-scene canvas')).toBeAttached();
    step('two-browser authoritative lobby and WebGL board');

    await setFps(page, 30);
    await setFps(page, 120);
    step('FPS preference changed 60 → 30 → 120 during game');
    if (process.env.B4_QUALITY === 'low') {
      await setLowQuality(page);
      await setLowQuality(guest);
      step('both clients changed graphics quality to Low');
    }

    const roller = await page.getByRole('button', { name: 'Đổ xúc xắc', exact: true }).count() ? page : guest;
    const observed = guestFallback ? page : roller;
    await observed.evaluate(() => {
      const probe = (window as unknown as { __PROBE__: { attachMain(): void; drain(): unknown } }).__PROBE__;
      probe.attachMain();
      probe.drain();
      performance.mark('otb:b4:roll');
    });
    await roller.getByRole('button', { name: 'Đổ xúc xắc', exact: true }).click();
    await observed.waitForTimeout(5000);
    const rollBatch = await observed.evaluate(async () => {
      const probe = (window as unknown as { __PROBE__: {
        pollGpu(): void;
        drain(): {
          frames: { rendered: boolean; continued: boolean; start: number; ts: number; cpu: number; gpu: number | null }[];
          links: { t: number }[];
          longtasks: { start: number; dur: number }[];
        };
      } }).__PROBE__;
      for (let index = 0; index < 8; index += 1) {
        probe.pollGpu();
        await new Promise(resolve => { setTimeout(resolve, 40); });
      }
      return probe.drain();
    });
    const rendered = rollBatch.frames.filter(frame => frame.rendered);
    const intervals = rendered.slice(0, -1)
      .flatMap((frame, index) => frame.continued ? [rendered[index + 1].ts - frame.ts] : [])
      .sort((left, right) => left - right);
    const percentile = (q: number) => intervals[Math.min(intervals.length - 1, Math.ceil(q * intervals.length) - 1)] ?? null;
    const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const gpuSamples = rendered.map(frame => frame.gpu).filter((value): value is number => value !== null).sort((left, right) => left - right);
    evidence.roll = {
      renderedFrames: rendered.length,
      contiguousIntervals: intervals.length,
      achievedSceneFps: Number.isFinite(mean) ? 1000 / mean : null,
      intervalP50Ms: percentile(0.5),
      intervalP95Ms: percentile(0.95),
      longestCpuMs: Math.max(0, ...rendered.map(frame => frame.cpu)),
      medianGpuMs: gpuSamples[Math.floor(gpuSamples.length / 2)] ?? null,
      gpuSamples: gpuSamples.length,
      programLinks: rollBatch.links.length,
      longestMainThreadTaskMs: Math.max(0, ...rollBatch.longtasks.map(task => task.dur)),
    };
    evidence.renderer = await observed.evaluate(() => ({
      devicePixelRatio: window.devicePixelRatio,
      glRenderer: (window as unknown as { __PROBE__: { glRenderer?: string } }).__PROBE__.glRenderer ?? null,
    }));
    expect(rendered.length).toBeGreaterThan(5);
    const moverName = roller === page ? 'B4 Host' : 'B4 Guest';
    const occupiedTileLabel = await observed.evaluate(name => (
      [...document.querySelectorAll<HTMLButtonElement>('.game-board__accessibility-layer button')]
        .map(button => button.getAttribute('aria-label') ?? '')
        .find(label => label.includes(`Người chơi đang đứng: ${name}`)) ?? null
    ), moverName);
    expect(occupiedTileLabel).toMatch(/^Ô (?!0:)/u);
    (evidence.roll as Record<string, unknown>).landedTileLabel = occupiedTileLabel;
    step('dice roll produced actual WebGL scene frames');
    step('character landed on a non-start tile in the authoritative board view');

    const canvas = observed.locator('.game-scene canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await observed.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await observed.mouse.wheel(0, -350);
      await observed.mouse.down();
      await observed.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 45, { steps: 6 });
      await observed.mouse.up();
    }
    step('wheel zoom and pointer drag while in game');

    await (observed === page ? guest : page).bringToFront();
    await observed.bringToFront();
    await expect(observed.getByTestId('game-board')).toBeVisible();
    step('real browser-tab focus switch and recovery');

    await observed.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await observed.waitForTimeout(300);
    await observed.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(observed.getByTestId('game-board')).toBeVisible();
    step('synthetic visibility interruption and recovery');

    await page.reload();
    await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 30_000 });
    step('host page reload and session resume');

    // A random roll can reveal a card. Its actor must close it before the
    // observer can use the room controls; exercise that normal game flow.
    for (const actorPage of [page, guest]) {
      const card = actorPage.getByTestId('card-interaction-overlay');
      if (await card.isVisible()) {
        const close = card.getByRole('button', { name: 'Đóng', exact: true });
        if (!await card.getByText('Đang chờ người chơi đóng thẻ').isVisible()) {
          await expect(close).toBeEnabled({ timeout: 10_000 });
          await close.click();
          await expect(card).toBeHidden();
          step('revealed card dismissed by its player through the actual UI');
        }
      }
    }
    await guest.bringToFront();
    const declinePurchase = guest.getByRole('button', { name: 'Không mua' });
    if (await declinePurchase.isVisible()) {
      await declinePurchase.click();
      await expect(declinePurchase).toBeHidden();
      step('landing property decision resolved through the actual UI');
    }
    await guest.getByRole('button', { name: 'Bỏ cuộc' }).click({ timeout: 15_000 });
    await expect(guest.getByRole('alertdialog', { name: 'Bỏ cuộc khỏi ván chơi?' })).toBeVisible();
    await guest.getByRole('alertdialog').getByRole('button', { name: 'Bỏ cuộc' }).click();
    await expect(page.getByRole('button', { name: 'Chơi lại' })).toBeVisible({ timeout: 30_000 });
    step('guest forfeited and host reached winner state');
    await page.getByRole('button', { name: 'Chơi lại' }).click();
    await expect(page.getByRole('heading', { name: roomCode })).toBeVisible({ timeout: 30_000 });
    step('Play Again returned same room to lobby');

    expect(errors).toEqual([]);
    evidence.pageErrors = errors;
    if (process.env.B4_EVIDENCE_OUT) writeFileSync(process.env.B4_EVIDENCE_OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
