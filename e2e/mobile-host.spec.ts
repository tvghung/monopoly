import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function joinRoom(page: Page, name: string, roomCode: string): Promise<void> {
  await page.goto(`/?room=${roomCode.toLowerCase()}`);
  await expect(page.getByLabel('Mã phòng')).toHaveValue(roomCode);
  await expect(page.getByRole('heading', { name: 'Cờ Tỷ Phú Việt Nam' })).toBeVisible();
  await page.getByLabel('Tên của bạn').fill(name);
  const join = page.getByRole('button', { name: 'Vào phòng' });
  await expect(join).toBeEnabled();
  const box = await join.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await join.click();
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
  try {
    await joinRoom(page, 'Host Mobile', roomCode);
    await joinRoom(guest, 'Guest Mobile', roomCode);
    await chooseAndReady(page, 'Dog');
    await chooseAndReady(guest, 'Capybara');

    const start = page.getByRole('button', { name: 'Bắt đầu' });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(guest.getByTestId('game-board')).toBeVisible();
    await expect(page.locator('.legacy-board')).toBeVisible();
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeVisible();

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeHidden();
    await page.getByRole('button', { name: 'Cài đặt' }).click();
    await expect(page.getByRole('dialog', { name: 'Cài đặt' })).toBeVisible();
    await expect(page.getByText('Âm lượng tổng')).toBeVisible();
    await page.getByRole('button', { name: 'Xong' }).click();

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeHidden();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByText('Hãy xoay ngang thiết bị')).toBeHidden();
    await expect(page.getByTestId('game-board')).toBeVisible();

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
  } finally {
    await guestContext.close();
  }
});
