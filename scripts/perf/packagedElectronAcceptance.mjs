/** Focused B7 proof against the actual packaged Windows Electron executable. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from '@playwright/test';
import { findPackagedApplication } from '../../apps/desktop/scripts/packagedRenderer.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceRoot = path.join(repositoryRoot, 'project-document/ui-ux-overhaul/08K_evidence');
const { packageRoot, resourcesRoot } = await findPackagedApplication();
const executable = ['OwnTheBlock.exe', 'Own the Block.exe']
  .map(name => path.join(packageRoot, name)).find(existsSync);
assert.ok(executable, `Packaged executable missing in ${packageRoot}`);

const result = {
  status: 'FAIL',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(),
  packageRoot: path.relative(repositoryRoot, packageRoot).replaceAll('\\', '/'),
  resourcesRoot: path.relative(repositoryRoot, resourcesRoot).replaceAll('\\', '/'),
  environment: {
    platform: os.platform(), architecture: os.arch(), osRelease: os.release(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    electron: null,
  },
  checks: [],
  assets: [],
  pageErrors: [],
  failedPackagedRequests: [],
};
const applications = [];
const profiles = [];
let completed = false;

function pass(name, details = undefined) {
  result.checks.push({ name, status: 'PASS', ...(details === undefined ? {} : { details }) });
  process.stdout.write(`[PASS] ${name}${details ? `: ${details}` : ''}\n`);
}

async function openPackagedApp(label) {
  const profile = await mkdtemp(path.join(os.tmpdir(), `otb-b7-${label}-`));
  profiles.push(profile);
  const application = await _electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`],
    timeout: 30_000,
  });
  applications.push(application);
  const page = await application.firstWindow();
  page.on('pageerror', error => result.pageErrors.push(`${label}: ${error}`));
  page.on('requestfailed', request => {
    if (request.url().startsWith('app://')) {
      result.failedPackagedRequests.push(`${label}: ${request.url()}: ${request.failure()?.errorText}`);
    }
  });
  page.on('response', response => {
    if (!response.url().startsWith('app://')) return;
    result.assets.push({ app: label, status: response.status(), url: response.url() });
    if (response.status() >= 400) {
      result.failedPackagedRequests.push(`${label}: ${response.url()}: HTTP ${response.status()}`);
    }
  });
  await page.locator('#desktop-launcher-title').waitFor({ timeout: 30_000 });
  return { application, page };
}

async function createLanRoom(page, name) {
  await page.locator('[data-launcher-choice="host"]').click();
  await page.getByRole('radio', { name: 'LAN' }).click();
  await page.locator('#desktop-player-name').fill(name);
  await page.getByRole('button', { name: 'Tạo và vào phòng' }).click();
  await page.locator('.lobby').waitFor({ timeout: 30_000 });
  const code = (await page.locator('#lobby-title').innerText()).trim();
  assert.match(code, /^OTB-[A-Z0-9]{6}$/);
  return code;
}

try {
  await mkdir(evidenceRoot, { recursive: true });
  const host = await openPackagedApp('host');
  const page = host.page;
  result.environment.electron = await host.application.evaluate(() => process.versions.electron);
  assert.equal(page.url(), 'app://own-the-block/index.html');
  assert.match(await page.locator('body').innerText(), /Tạo phòng[\s\S]*Tham gia phòng/);
  pass('normal packaged executable starts and paints the launcher', page.url());
  await page.screenshot({ path: path.join(evidenceRoot, 'packaged-launcher.png'), animations: 'disabled' });

  await page.waitForTimeout(900);
  assert.equal(result.assets.filter(asset => /\/assets\/App-[^/]+\.js$/.test(asset.url)).length, 0);
  pass('gameplay App chunk remains deferred on the idle launcher');

  await page.getByRole('button', { name: 'Cài đặt' }).click();
  assert.equal(await page.locator('html').getAttribute('data-graphics-quality'), 'balanced');
  assert.equal(await page.getByRole('radio', { name: 'Cân bằng' }).getAttribute('aria-checked'), 'true');
  pass('fresh-profile graphics setting is Balanced');
  await page.getByRole('button', { name: 'Xong' }).click();

  const firstCode = await createLanRoom(page, 'B7 Host');
  assert.equal(await page.locator('.mascot-picker__hero-image').getAttribute('alt'), 'Chó');
  assert.equal(await page.locator('html').getAttribute('data-graphics-quality'), 'balanced');
  assert.ok(result.assets.some(asset => asset.status === 200 && /\/assets\/App-[^/]+\.js$/.test(asset.url)));
  assert.ok(result.assets.some(asset => asset.status === 200 && /\/assets\/App-[^/]+\.css$/.test(asset.url)));
  pass('first LAN room reaches packaged lobby with Dog default and loaded App JS/CSS', firstCode);

  await page.getByRole('button', { name: 'Thêm Bot' }).first().click();
  await page.getByRole('button', { name: 'Sẵn sàng', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.locator('.room-exit-button').waitFor({ timeout: 30_000 });
  await page.locator('canvas').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(5_000);
  assert.ok(await page.locator('canvas').first().isVisible());
  // Either the Host or Bot can win the server-side starting-player tie-break.
  assert.match(await page.locator('body').innerText(), /Tài sản của tôi/);
  for (const pattern of [/\/assets\/GameScene-[^/]+\.js$/, /\/assets\/studio-environment[^/]+\.z$/]) {
    assert.ok(result.assets.some(asset => asset.status === 200 && pattern.test(asset.url)), `Missing packaged asset: ${pattern}`);
  }
  pass('packaged gameplay board and deferred scene/environment assets load');
  await page.screenshot({ path: path.join(evidenceRoot, 'packaged-game.png'), animations: 'disabled' });

  await page.locator('.room-exit-button').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Bỏ cuộc' }).click();
  await page.locator('#desktop-launcher-title').waitFor({ timeout: 30_000 });
  pass('forfeit returns from gameplay to the launcher');

  // Leaving a game keeps the Host helper alive by design; close that room explicitly before hosting another.
  await page.locator('.desktop-launcher__stop').click();
  await page.locator('[data-launcher-choice="host"]').waitFor({ state: 'visible' });
  await page.locator('[data-launcher-choice="host"]').waitFor({ state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('[data-launcher-choice="host"]')?.hasAttribute('disabled'));
  pass('existing Host runtime closes explicitly before creating the next room');

  const secondCode = await createLanRoom(page, 'B7 Host Again');
  assert.notEqual(secondCode, firstCode);
  pass('same packaged app enters a different room after returning home', secondCode);

  const guest = await openPackagedApp('guest');
  await guest.page.locator('[data-launcher-choice="join"]').click();
  await guest.page.locator('#desktop-player-name').fill('B7 Guest');
  await guest.page.locator('#desktop-lan-room').fill(secondCode);
  await guest.page.getByRole('button', { name: 'Kết nối và vào phòng' }).click();
  await guest.page.locator('.lobby').waitFor({ timeout: 30_000 });
  assert.equal((await guest.page.locator('#lobby-title').innerText()).trim(), secondCode);
  pass('second packaged executable joins the new LAN room', secondCode);

  await guest.page.locator('.lobby__leave').click();
  await guest.page.locator('#desktop-launcher-title').waitFor({ timeout: 30_000 });
  await page.locator('.lobby__leave').click();
  await page.locator('#desktop-launcher-title').waitFor({ timeout: 30_000 });
  assert.deepEqual(result.pageErrors, []);
  assert.deepEqual(result.failedPackagedRequests, []);
  pass('both packaged renderers finish without page errors or failed app resources');
  result.status = 'PASS';
  completed = true;
} catch (error) {
  result.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${result.failure}\n`);
} finally {
  await writeFile(path.join(evidenceRoot, 'packaged-electron-acceptance.json'), `${JSON.stringify(result, null, 2)}\n`);
  for (const application of applications.reverse()) {
    if (completed) {
      await application.close().catch(() => application.process().kill());
    } else {
      application.process().kill();
    }
  }
  for (const profile of profiles) {
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(path.resolve(profile).startsWith(tempRoot), `Refusing to remove non-temp profile: ${profile}`);
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
  }
}

if (!completed) process.exit(1);
