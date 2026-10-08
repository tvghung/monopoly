import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { LanFinder } from './lanFinder';
import { resolveNetworkInterfaces } from './networkInterfaces';
import { ServerHelperController } from './serverHelper';

interface RetainedSession { token: string; playerId: string; roomId: string; roomCode: string }
interface HostContract {
  runPhase72HostContract(options: { serverUrl: string; remoteServerUrl: string; roomCode: string }): Promise<{
    roomId: string;
    retainedSession: RetainedSession;
    checks: Record<string, true>;
  }>;
  rejectRetainedSessionAfterRestart(options: { serverUrl: string; session: RetainedSession }): Promise<void>;
}

export interface Phase72HostProofResult {
  pass: true;
  platform: NodeJS.Platform;
  architecture: string;
  serverPort: number;
  roomId: string;
  physicalDeviceAcceptance: 'MANUAL_REQUIRED';
  checks: Record<string, true>;
}

async function expectRoute(origin: string, route: string, expected: string): Promise<void> {
  const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(3_000) });
  if (response.status !== 200 || await response.text() !== expected) {
    throw new Error(`Packaged server did not serve ${route}`);
  }
}

export async function runPhase72HostProof(
  resourcesRoot = process.resourcesPath,
): Promise<Phase72HostProofResult> {
  const helperPath = path.join(resourcesRoot, 'server-helper', 'server-helper.cjs');
  const contractPath = path.join(resourcesRoot, 'server-helper', 'phase72-host-contract.cjs');
  const clientDist = path.join(resourcesRoot, 'dist');
  const tunnelBinary = path.join(resourcesRoot, 'cloudflared', `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  await Promise.all([helperPath, contractPath, clientDist, tunnelBinary].map(target => access(target)));
  const contract = createRequire(__filename)(contractPath) as HostContract;
  const interfaces = resolveNetworkInterfaces();
  if (!interfaces.length) throw new Error('No usable LAN IPv4 interface for packaged proof');

  const helper = new ServerHelperController({ modulePath: helperPath, clientDist, host: '0.0.0.0', port: 0 });
  let replacement: ServerHelperController | undefined;
  try {
    const first = await helper.start();
    const origin = `http://127.0.0.1:${first.port}`;
    await expectRoute(origin, '/healthz', 'ok');
    await expectRoute(origin, '/readyz', 'ready');
    const index = await fetch(origin, { signal: AbortSignal.timeout(3_000) });
    if (!index.ok || !(await index.text()).includes('Own the Block')) {
      throw new Error('Packaged client did not load');
    }
    const lanOrigin = `http://${interfaces[0].address}:${first.port}`;
    await expectRoute(lanOrigin, '/healthz', 'ok');
    const roomCode = `OTB-${randomUUID().slice(0, 6).toUpperCase()}`;
    const match = await contract.runPhase72HostContract({ serverUrl: origin, remoteServerUrl: lanOrigin, roomCode });
    const finder = new LanFinder();
    const discovery = await finder.findRoom(roomCode);
    if (!discovery.ok) throw new Error('LAN room discovery failed');
    await helper.stop();
    replacement = new ServerHelperController({ modulePath: helperPath, clientDist, host: '0.0.0.0', port: first.port });
    await replacement.start();
    await contract.rejectRetainedSessionAfterRestart({ serverUrl: origin, session: match.retainedSession });
    const oldRoom = await fetch(`${origin}/_otb/room?code=${roomCode}`);
    if (oldRoom.status !== 404) throw new Error('Old room survived authoritative process restart');
    return {
      pass: true,
      platform: process.platform,
      architecture: process.arch,
      serverPort: first.port,
      roomId: match.roomId,
      physicalDeviceAcceptance: 'MANUAL_REQUIRED',
      checks: {
        'packaged-server-ready': true,
        'packaged-client-served': true,
        'real-interface-http': true,
        'lan-room-discovery': true,
        'restart-clears-room-and-token': true,
        ...match.checks,
      },
    };
  } finally {
    await replacement?.stop();
    await helper.stop();
  }
}
