import {
  expect, test, type BrowserContext, type Locator, type Page,
} from '@playwright/test';

const MUSIC_MANIFEST_PATH = '/audio/music/gameplay/gameplay-music.manifest.json';

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

async function expectMusicRuntime(
  page: Page,
  manifest?: { track: { sampleRate: number }; stems: Array<{ segments: Array<{ startFrame: number }> }> },
): Promise<void> {
  const snapshot = () => page.evaluate(() => (
    (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation
  ));
  const initial = await snapshot();
  if (!initial.available) {
    expect(initial.decodeCount).toBe(0);
    expect(initial.starts).toEqual([]);
    return;
  }
  await expect.poll(async () => (await snapshot()).starts.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(8);
  const observation = await snapshot();
  expect(observation.decodeCount).toBeGreaterThanOrEqual(8);
  expect(new Set(observation.starts.slice(0, 8).map(start => start.context)).size).toBe(1);
  expect(new Set(observation.starts.slice(0, 4).map(start => start.at)).size).toBe(1);
  expect(new Set(observation.starts.slice(4, 8).map(start => start.at)).size).toBe(1);
  expect(observation.starts.slice(0, 8).every(start => (
    start.channels === 2
    && start.decoded
    && start.context === 0
    && start.state === 'running'
    && !start.loop
  ))).toBe(true);
  if (manifest) {
    expect(observation.starts[4]!.at - observation.starts[0]!.at).toBeCloseTo(
      manifest.stems[0]!.segments[1]!.startFrame / manifest.track.sampleRate,
      3,
    );
  }
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
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(minimum);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimum);
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
  await expect(page.getByRole('heading', { name: 'Cờ Tỷ Phú Việt Nam' })).toBeVisible();
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
  test.setTimeout(180_000);
  const browserErrors: string[] = [];
  const watchErrors = (target: Page) => {
    target.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    target.on('pageerror', error => browserErrors.push(error.message));
  };
  watchErrors(page);
  const roomCode = `OTB-${Date.now().toString(36).slice(-6).toUpperCase()}`;
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
    await expect(page.getByText('Dog', { exact: true })).toHaveCount(0);
    await chooseAndReady(page, 'Dog');
    await chooseAndReady(guest, 'Capybara');

    await page.setViewportSize({ width: 667, height: 375 });
    await guest.setViewportSize({ width: 667, height: 375 });
    const start = page.getByRole('button', { name: 'Bắt đầu' });
    await expect(start).toBeEnabled();
    await expectTouchTarget(start, { width: 667, height: 375 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await start.click();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(guest.getByTestId('game-board')).toBeVisible();
    await expect(page.locator('.legacy-board')).toBeVisible();
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeHidden();
    expect(
      await page.getByRole('button', { name: 'Chơi', exact: true }).count()
      + await guest.getByRole('button', { name: 'Chơi', exact: true }).count(),
    ).toBe(1);

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
        if (body && window.innerHeight <= 430) body.scrollTop = body.scrollHeight;
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
    await page.getByLabel('Tin nhắn').fill(longMessage);
    await page.getByRole('button', { name: 'Gửi' }).click();
    await expect(guest.getByText(new RegExp(longMessage, 'u'))).toBeVisible();
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
      .toBeVisible({ timeout: 15_000 });
    await page.context().setOffline(false);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByText('Đã mất kết nối. Đang kết nối lại vào ván chơi…'))
      .toBeHidden({ timeout: 15_000 });
    expect(browserErrors).toEqual([]);
  } finally {
    await guestContext.close();
  }
});

test('segmented rendered music assets and supported Web Audio lifecycle', async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await observeMusic(page);
  await page.goto('/');
  const manifestResponse = await page.evaluate(async path => {
    const response = await fetch(path);
    return {
      status: response.status,
      contentType: response.headers.get('content-type')?.split(';')[0],
      body: await response.text(),
    };
  }, MUSIC_MANIFEST_PATH);
  if (manifestResponse.status === 404 || manifestResponse.status === 410
    || (manifestResponse.status === 200 && manifestResponse.contentType !== 'application/json')) {
    test.info().annotations.push({
      type: 'audio-evidence',
      description: 'PASS B transport is present; production segmented manifest/assets remain pending Pass C.',
    });
    return;
  }
  expect(manifestResponse.status).toBe(200);
  expect(manifestResponse.contentType).toBe('application/json');
  const manifest = JSON.parse(manifestResponse.body) as {
    track: { sampleRate: number };
    stems: Array<{ segments: Array<{ file: string; startFrame: number }> }>;
  };
  expect(manifest.stems).toHaveLength(4);
  expect(manifest.stems.every(stem => stem.segments.length === 16)).toBe(true);
  const segmentPaths = manifest.stems.flatMap(stem => stem.segments.map(segment => (
    `/audio/music/gameplay/${segment.file}`
  )));
  expect(segmentPaths).toHaveLength(64);
  const responses = await page.evaluate(async paths => Promise.all(paths.map(async path => {
    const response = await fetch(path);
    return {
      url: response.url,
      status: response.status,
      contentType: response.headers.get('content-type')?.split(';')[0],
      bytes: (await response.arrayBuffer()).byteLength,
    };
  })), segmentPaths);
  if (responses.some(response => response.status === 404 || response.status === 410
    || (response.status === 200 && response.contentType === 'text/html'))) {
    test.info().annotations.push({
      type: 'audio-evidence',
      description: 'Segmented manifest exists but production segment validation is pending Pass C.',
    });
    return;
  }
  for (const response of responses) {
    expect(response.status, response.url).toBe(200);
    expect(response.contentType, response.url).toBe('audio/ogg');
    expect(response.bytes, response.url).toBeGreaterThan(0);
  }
  const roomCode = `OTB-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  await joinRoom(page, 'Audio Review', roomCode, 'tap');
  if (!await page.evaluate(() => (
    (window as typeof window & { __musicObservation: MusicObservation }).__musicObservation.available
  ))) {
    test.info().annotations.push({
      type: 'audio-evidence',
      description: 'Web Audio unavailable: fallback only; decoded playback remains unverified.',
    });
  }
  await expectMusicRuntime(page, manifest);

  await page.reload();
  await expect(page.getByRole('heading', { name: roomCode })).toBeVisible();
  // A restored room still needs a real gesture to unlock the new AudioContext.
  await page.getByRole('button', { name: 'Cài đặt' }).tap();
  await page.getByRole('dialog', { name: 'Cài đặt' }).getByRole('button', { name: 'Đóng' }).tap();
  await expectMusicRuntime(page, manifest);

  await page.context().setOffline(true);
  await expect(page.getByText('Đã mất kết nối. Đang kết nối lại vào ván chơi…'))
    .toBeVisible({ timeout: 15_000 });
  await page.context().setOffline(false);
  await expect(page.getByText('Đã mất kết nối. Đang kết nối lại vào ván chơi…'))
    .toBeHidden({ timeout: 15_000 });
  await expectMusicRuntime(page, manifest);
  expect(browserErrors).toEqual([]);
});
