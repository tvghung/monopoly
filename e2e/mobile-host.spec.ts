import {
  expect, test, type BrowserContext, type Locator, type Page,
} from '@playwright/test';

const MUSIC_PATH = '/audio/music/own-the-block-main-theme-loop.ogg';
/** Hosted CI runners have no GPU and fewer cores (software WebGL): the same flows get twice the time there. */
const TIME_FACTOR = process.env.CI ? 2 : 1;
/** What Chromium logs for a request that fails while the browser context is offline. */
const OFFLINE_REQUEST_FAILURE = /^Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/u;

interface MusicObservation {
  available: boolean;
  decodeCount: number;
  starts: {
    at: number;
    context: number;
    state: AudioContextState;
    frames: number;
    sampleRate: number;
    channels: number;
    duration: number;
    decoded: boolean;
    loop: boolean;
  }[];
}

async function observeMusic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const contextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const observation: MusicObservation = {
      available: Boolean(contextConstructor),
      decodeCount: 0,
      starts: [],
    };
    (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation = observation;
    if (!contextConstructor) return;
    const decoded = new WeakSet<AudioBuffer>();
    const contexts: BaseAudioContext[] = [];
    const decodeAudioData = contextConstructor.prototype.decodeAudioData;
    contextConstructor.prototype.decodeAudioData = function (...args) {
      observation.decodeCount += 1;
      return Reflect.apply(decodeAudioData, this, args).then((buffer: AudioBuffer) => {
        decoded.add(buffer);
        return buffer;
      });
    };
    const createBufferSource = contextConstructor.prototype.createBufferSource;
    contextConstructor.prototype.createBufferSource = function () {
      const source = createBufferSource.call(this);
      const start = source.start;
      source.start = function (...args) {
        if (this.buffer && this.buffer.duration > 1) {
          if (!contexts.includes(this.context)) contexts.push(this.context);
          observation.starts.push({
            at: args[0] ?? 0,
            context: contexts.indexOf(this.context),
            state: this.context.state,
            frames: this.buffer.length,
            sampleRate: this.buffer.sampleRate,
            channels: this.buffer.numberOfChannels,
            duration: this.buffer.duration,
            decoded: decoded.has(this.buffer),
            loop: this.loop,
          });
        }
        return Reflect.apply(start, this, args);
      };
      return source;
    };
  });
}

async function expectMusicRuntime(page: Page): Promise<void> {
  const snapshot = () => page.evaluate(() => (
    (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation
  ));
  const initial = await snapshot();
  if (!initial.available) {
    expect(initial.decodeCount).toBe(0);
    expect(initial.starts).toEqual([]);
    return;
  }
  await expect.poll(async () => (await snapshot()).starts.length, { timeout: 30_000 * TIME_FACTOR }).toBeGreaterThanOrEqual(1);
  const observation = await snapshot();
  expect(observation.decodeCount).toBeGreaterThanOrEqual(1);
  expect(new Set(observation.starts.map(start => start.context)).size).toBe(1);
  expect(observation.starts).toHaveLength(1);
  expect(observation.starts[0]).toMatchObject({
    channels: 2,
    decoded: true,
    context: 0,
    state: 'running',
    loop: true,
  });
  expect(observation.starts[0]?.duration ?? 0).toBeGreaterThan(1);
}

const ACCEPTANCE_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
] as const;

async function expectTouchTarget(
  locator: Locator,
  viewport: { width: number; height: number },
  minimum = 44,
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  // A 44px control can measure 43.999999 after layout rounding; that is still a 44px target.
  const tolerance = 0.05;
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(minimum - tolerance);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimum - tolerance);
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(box ? box.x + box.width : viewport.width + 1).toBeLessThanOrEqual(viewport.width + 1);
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(box ? box.y + box.height : viewport.height + 1).toBeLessThanOrEqual(viewport.height + 1);
}

async function joinRoom(
  page: Page,
  name: string,
  roomCode: string,
  interaction: 'click' | 'tap' = 'click',
): Promise<void> {
  await page.goto(`/?room=${roomCode.toLowerCase()}`);
  await expect(page.getByLabel('Mã phòng')).toHaveValue(roomCode);
  await expect(page.locator('#join-title')).toBeVisible();
  await page.getByLabel('Tên của bạn').fill(name);
  const join = page.getByRole('button', { name: 'Vào phòng' });
  await expect(join).toBeEnabled();
  const box = await join.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  if (interaction === 'tap') {
    await page.evaluate(() => {
      const events: string[] = [];
      const record = (event: PointerEvent) => events.push(`${event.type}:${event.pointerType}`);
      document.addEventListener('pointerdown', record, true);
      document.addEventListener('pointerup', record, true);
      (window as typeof window & { __audioPointerEvents?: string[] }).__audioPointerEvents = events;
    });
    await join.tap();
  } else {
    await join.click();
  }
  await expect(page.getByRole('heading', { name: roomCode })).toBeVisible();
}

async function chooseAndReady(page: Page, mascot: string): Promise<void> {
  await page.getByRole('button', { name: mascot, exact: true }).click();
  const ready = page.getByRole('button', { name: 'Sẵn sàng' });
  await expect(ready).toBeEnabled();
  await ready.click();
}

test('mobile invitation, multiplayer, fallback, resume, and settings flow', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(180_000 * TIME_FACTOR);
  const browserErrors: string[] = [];
  const watchErrors = (target: Page) => {
    target.on('console', message => {
      // The flow cuts the network on purpose (setOffline): whatever the page then tries to load (a socket reconnect, a font
      // subset, an image) fails with this message. That is the simulated outage, not a defect; every other error still counts.
      if (message.type() === 'error' && !OFFLINE_REQUEST_FAILURE.test(message.text())) browserErrors.push(message.text());
    });
    target.on('pageerror', error => browserErrors.push(error.message));
  };
  watchErrors(page);
  const roomCode = `OTB-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  // The HUD drawer remembers its state per viewer; start every run from the default (closed).
  await page.addInitScript(() => window.localStorage.removeItem('own-the-block.hud.drawer.v1'));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      type: string,
      ...args: unknown[]
    ) {
      return type === 'webgl' || type === 'webgl2'
        ? null
        : Reflect.apply(original, this, [type, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  await page.goto(`/?room=${roomCode.toLowerCase()}`);
  await expect(page.getByLabel('Mã phòng')).toHaveValue(roomCode);
  await expect(page.getByRole('button', { name: 'Vào phòng' })).toBeDisabled();

  const projectViewport = testInfo.project.use.viewport;
  const guestContext: BrowserContext = await browser.newContext({
    viewport: projectViewport && 'width' in projectViewport
      ? projectViewport
      : { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  await guest.addInitScript(() => window.localStorage.removeItem('own-the-block.hud.drawer.v1'));
  watchErrors(guest);
  try {
    await joinRoom(page, 'Host Mobile LongName', roomCode, 'tap');
    expect(await page.evaluate(() => (
      (window as typeof window & { __audioPointerEvents?: string[] }).__audioPointerEvents ?? []
    ))).toEqual(expect.arrayContaining(['pointerdown:touch', 'pointerup:touch']));
    await joinRoom(guest, 'Guest Mobile LongNam', roomCode);
    await page.setViewportSize({ width: 360, height: 800 });
    await guest.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByText('Chó', { exact: true })).toHaveCount(0);
    await chooseAndReady(page, 'Chó');
    await chooseAndReady(guest, 'Capybara');

    await page.setViewportSize({ width: 667, height: 375 });
    await guest.setViewportSize({ width: 667, height: 375 });
    const start = page.getByRole('button', { name: 'Bắt đầu' });
    await expect(start).toBeEnabled();
    // The lobby (header, four seats, mascot picker) is taller than 375px and keeps the scroll offset of the ready step; the
    // host scrolls to the primary action, which then has to fit and be at least 44px.
    await start.scrollIntoViewIfNeeded();
    await expectTouchTarget(start, { width: 667, height: 375 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await start.click();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(guest.getByTestId('game-board')).toBeVisible();
    await expect(page.locator('.legacy-board')).toBeVisible();
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeHidden();
    expect(
      await page.getByRole('button', { name: 'Đổ xúc xắc', exact: true }).count()
      + await guest.getByRole('button', { name: 'Đổ xúc xắc', exact: true }).count(),
    ).toBe(1);
    const guestViewport = { width: 667, height: 375 };
    await expectTouchTarget(guest.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }), guestViewport);
    await expectTouchTarget(guest.getByRole('button', { name: /^Tài sản của tôi/u }), guestViewport);
    const guestRoll = guest.getByRole('button', { name: 'Đổ xúc xắc', exact: true });
    if (await guestRoll.count() > 0) await expectTouchTarget(guestRoll, guestViewport);

    for (const viewport of ACCEPTANCE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expect(page.getByTestId('game-board')).toBeVisible();
      if (viewport.width < viewport.height && viewport.width <= 768) {
        await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeVisible();
      } else {
        await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeHidden();
      }
      expect(await page.evaluate(() => (
        document.documentElement.scrollWidth <= window.innerWidth
        && document.body.scrollWidth <= window.innerWidth
      ))).toBe(true);

      const settings = page.getByRole('button', { name: 'Cài đặt' });
      const surrender = page.getByRole('button', { name: 'Bỏ cuộc' });
      await expectTouchTarget(settings, viewport);
      await expectTouchTarget(surrender, viewport);
      if (!(viewport.width < viewport.height && viewport.width <= 768)) {
        // The HUD controls of plan 03: the activity drawer tab, the assets dock button and the roll call to action.
        await expectTouchTarget(page.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }), viewport);
        await expectTouchTarget(page.getByRole('button', { name: /^Tài sản của tôi/u }), viewport);
        const hostRoll = page.getByRole('button', { name: 'Đổ xúc xắc', exact: true });
        if (await hostRoll.count() > 0) await expectTouchTarget(hostRoll, viewport);
      }
      await settings.click();
      await expect(settings).toHaveAttribute('aria-expanded', 'true');
      if (viewport.width === 360) {
        await expect.poll(() => settings.locator('svg').evaluate(element => getComputedStyle(element).transform))
          .not.toBe('none');
      }
      const dialog = page.getByRole('dialog', { name: 'Cài đặt' });
      await expect(dialog).toBeVisible();
      await expect(page.getByText('Âm lượng tổng')).toBeVisible();
      const close = dialog.getByRole('button', { name: 'Đóng' });
      await expectTouchTarget(close, viewport, 40);
      const modalMetrics = await dialog.evaluate(element => {
        const body = element.querySelector<HTMLElement>('.ds-modal__body');
        const rect = element.getBoundingClientRect();
        // Scroll whenever the body overflows: the graphics section (plan 02) made the dialog taller than 430 px.
        if (body && (window.innerHeight <= 430 || body.scrollHeight > body.clientHeight)) body.scrollTop = body.scrollHeight;
        return {
          top: rect.top,
          bottom: rect.bottom,
          scrollable: body ? body.scrollHeight > body.clientHeight : false,
          scrolled: body?.scrollTop ?? 0,
        };
      });
      expect(modalMetrics.top).toBeGreaterThanOrEqual(0);
      expect(modalMetrics.bottom).toBeLessThanOrEqual(viewport.height + 1);
      if (modalMetrics.scrollable) expect(modalMetrics.scrolled).toBeGreaterThan(0);
      await close.click();
      await expect(settings).toHaveAttribute('aria-expanded', 'false');
      if (viewport.width === 360) {
        await expect.poll(() => settings.locator('svg').evaluate(element => getComputedStyle(element).transform))
          .toBe('none');
      }
    }

    await page.setViewportSize({ width: 667, height: 280 });
    await page.getByRole('button', { name: 'Cài đặt' }).click();
    const constrainedDialog = page.getByRole('dialog', { name: 'Cài đặt' });
    const constrainedScroll = await constrainedDialog.evaluate(element => {
      const body = element.querySelector<HTMLElement>('.ds-modal__body');
      if (!body) return { scrollable: false, scrolled: 0 };
      body.scrollTop = body.scrollHeight;
      return { scrollable: body.scrollHeight > body.clientHeight, scrolled: body.scrollTop };
    });
    expect(constrainedScroll.scrollable).toBe(true);
    expect(constrainedScroll.scrolled).toBeGreaterThan(0);
    await constrainedDialog.getByRole('button', { name: 'Đóng' }).click();

    await page.setViewportSize({ width: 844, height: 390 });
    await guest.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Cài đặt' }).click();
    await expect.poll(() => page.locator('.room-settings-button__icon').evaluate(
      element => getComputedStyle(element).transitionDuration,
    )).toBe('0s');
    await page.getByRole('dialog', { name: 'Cài đặt' }).getByRole('button', { name: 'Đóng' }).click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeHidden();
    await page.getByRole('button', { name: 'Bỏ cuộc' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Bỏ cuộc khỏi ván chơi?' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy' }).click();

    const longMessage = 'Tin nhắn kiểm tra dài vẫn hiển thị rõ trên màn hình ngang.';
    // The activity drawer starts closed (plan 03): open it before typing or reading.
    await page.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }).click();
    await page.getByLabel('Tin nhắn').fill(longMessage);
    await page.getByRole('button', { name: 'Gửi' }).click();
    await guest.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }).click();
    await expect(guest.getByRole('log', { name: 'Nhật ký ván chơi' }).getByText(new RegExp(longMessage, 'u'))).toBeVisible();
    await guest.getByRole('button', { name: 'Ẩn nhật ký và trò chuyện' }).click();
    await page.waitForTimeout(800);
    await page.getByLabel('Tin nhắn').fill('Tin chưa đọc một.');
    await page.getByRole('button', { name: 'Gửi' }).click();
    await expect(guest.getByLabel('1 tin nhắn chưa đọc')).toBeVisible();
    await page.waitForTimeout(800);
    await page.getByLabel('Tin nhắn').fill('Tin chưa đọc hai.');
    await page.getByRole('button', { name: 'Gửi' }).click();
    await expect(guest.getByLabel('2 tin nhắn chưa đọc')).toBeVisible();
    await guest.getByRole('button', { name: 'Hiện nhật ký và trò chuyện' }).click();
    await expect(guest.getByLabel('2 tin nhắn chưa đọc')).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.locator('.legacy-board')).toBeVisible();

    await page.context().setOffline(true);
    await expect(page.getByText('Đã mất kết nối. Đang kết nối lại vào ván chơi…'))
      .toBeVisible({ timeout: 15_000 * TIME_FACTOR });
    await page.context().setOffline(false);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByText('Đã mất kết nối. Đang kết nối lại vào ván chơi…'))
      .toBeHidden({ timeout: 15_000 * TIME_FACTOR });
    expect(browserErrors).toEqual([]);
  } finally {
    await guestContext.close();
  }
});

test('single rendered Ogg Vorbis music asset and supported Web Audio lifecycle', async ({ browser, page }) => {
  test.setTimeout(120_000 * TIME_FACTOR);
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await observeMusic(page);
  const roomCode = `OTB-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  await joinRoom(page, 'Audio Review', roomCode, 'tap');
  const musicResponse = await page.evaluate(async path => {
    const response = await fetch(path);
    return {
      status: response.status,
      contentType: response.headers.get('content-type')?.split(';')[0],
      bytes: (await response.arrayBuffer()).byteLength,
    };
  }, MUSIC_PATH);
  expect(musicResponse.status).toBe(200);
  expect(musicResponse.contentType).toBe('audio/ogg');
  expect(musicResponse.bytes).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();
  expect((await page.evaluate(() => (
    (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation
  ))).starts).toEqual([]);

  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  try {
    await joinRoom(guest, 'Audio Guest', roomCode);
    expect((await page.evaluate(() => (
      (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation
    ))).starts).toEqual([]);
    await chooseAndReady(page, 'Chó');
    await chooseAndReady(guest, 'Capybara');
    await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeEnabled();
    await page.getByRole('button', { name: 'Bắt đầu' }).click();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(guest.getByTestId('game-board')).toBeVisible();

    if (!await page.evaluate(() => (
      (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation.available
    ))) {
      test.info().annotations.push({
        type: 'audio-evidence',
        description: 'Web Audio unavailable: fallback only; decoded playback remains unverified.',
      });
    }
    await expectMusicRuntime(page);

    await page.reload();
    await expect(page.getByTestId('game-board')).toBeVisible();
    const restoredObservation = await page.evaluate(() => (
      (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation
    ));
    if (restoredObservation.available) expect(restoredObservation.starts).toEqual([]);
    // A restored room still needs a real gesture to unlock the new AudioContext.
    await page.getByRole('button', { name: 'Cài đặt' }).tap();
    await page.getByRole('dialog', { name: 'Cài đặt' }).getByRole('button', { name: 'Đóng' }).tap();
    await expectMusicRuntime(page);

    await page.context().setOffline(true);
    await expect(page.getByText('Đã mất kết nối. Đang kết nối lại vào ván chơi…'))
      .toBeVisible({ timeout: 15_000 * TIME_FACTOR });
    await page.context().setOffline(false);
    await expect(page.getByText('Đã mất kết nối. Đang kết nối lại vào ván chơi…'))
      .toBeHidden({ timeout: 15_000 * TIME_FACTOR });
    await expectMusicRuntime(page);
    expect(browserErrors).toEqual([]);
  } finally {
    await guestContext.close();
  }
});
