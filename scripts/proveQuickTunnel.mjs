import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startAuthoritativeServer } from '../apps/server/src/authoritativeServer.ts';
import { CloudflareQuickTunnel } from '../apps/desktop/src/online/connectivity.ts';
import { runPhase72HostContract } from '../apps/server/src/phase72HostContract.ts';

const root = path.resolve(import.meta.dirname, '..');
const roomCode = `OTB-${randomUUID().slice(0, 6).toUpperCase()}`;
const environment = { ...process.env, SERVER_RUNTIME_PROFILE: 'desktop', NODE_ENV: 'production',
  PORT: '0', OTB_ONLINE_ROOM_CODE: roomCode };
const server = await startAuthoritativeServer({
  environment,
  host: '0.0.0.0',
  port: 0,
  clientDist: path.join(root, 'apps/client/dist'),
});
const binary = path.join(root, 'apps/desktop/generated/cloudflared', `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const tunnel = new CloudflareQuickTunnel(binary);
try {
  const endpoint = await tunnel.start(`http://127.0.0.1:${server.port}`, () => {
    console.error('Cloudflare tunnel connection was lost');
  });
  let routeReady = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const ready = await fetch(`${endpoint}/readyz`, { signal: AbortSignal.timeout(5_000) });
      const page = await fetch(`${endpoint}/`, { signal: AbortSignal.timeout(5_000) });
      if (ready.ok && page.ok && (await page.text()).includes('Own the Block')) {
        routeReady = true;
        break;
      }
    } catch { /* DNS may lag the tunnel's initial URL announcement. */ }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  if (!routeReady) throw new Error('Public route did not serve the live game within 40 attempts');
  const polling = await fetch(`${endpoint}/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: endpoint }, signal: AbortSignal.timeout(8_000),
  });
  if (!polling.ok || polling.headers.get('access-control-allow-origin') !== endpoint) {
    throw new Error('Public Socket.IO browser origin was rejected');
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${endpoint}/?room=${roomCode}`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Mã phòng').waitFor();
    if (await page.getByLabel('Mã phòng').inputValue() !== roomCode) {
      throw new Error('Invitation did not prefill the public browser client');
    }
  } finally { await browser.close(); }
  const contract = await runPhase72HostContract({
    serverUrl: endpoint,
    remoteServerUrl: endpoint,
    roomCode,
    timeoutMs: 15_000,
  });
  const room = await fetch(`${endpoint}/_otb/room?code=${roomCode}`);
  if (!room.ok) throw new Error('Public route could not find the created room');
  console.log(JSON.stringify({ pass: true, endpoint, roomCode, checks: contract.checks }, null, 2));
} finally {
  await tunnel.stop();
  await server.shutdown('Quick Tunnel proof finished');
}
