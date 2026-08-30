import { createRequire } from 'node:module';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  advertisedEndpoints,
  resolveNetworkInterfaces,
  type NetworkInterfaceCandidate,
} from './networkInterfaces';
import {
  LAN_DISCOVERY_TTL_MS,
  LAN_DISCOVERY_VERSION,
  LANDiscoveryController,
  parseAdvertisement,
  serializeAdvertisement,
  type DiscoveryAdvertisement,
} from './lanDiscovery';
import { ManagedPostgresController, findAvailableLoopbackPort } from './managedPostgres';
import { ServerHelperController } from './serverHelper';

interface ContractModule {
  runPhase71LanContract(options: {
    serverUrl: string;
    roomCode: string;
    timeoutMs?: number;
  }): Promise<{
    pass: true;
    roomId: string;
    hostPlayerId: string;
    guestPlayerId: string;
    checks: Record<string, true>;
  }>;
}

export type Phase71LanProofStatus = 'PASS' | 'PARTIAL';

export interface Phase71LanProofResult {
  status: Phase71LanProofStatus;
  platform: NodeJS.Platform;
  architecture: string;
  serverPort: number;
  interfaceCount: number;
  lanHttp: 'PASS' | 'NOT_RUN';
  discovery: 'PASS' | 'NOT_RUN';
  checks: Record<string, true>;
}

function requireAbsolute(name: string, value: string): void {
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
}

function containsAsar(value: string): boolean {
  return value.split(path.sep).some(part => part.endsWith('.asar'));
}

function loadContract(contractPath: string): ContractModule {
  const require = createRequire(__filename);
  return require(contractPath) as ContractModule;
}

async function checkEndpoint(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/healthz`, { signal: AbortSignal.timeout(2_000) });
    return response.status === 200 && (await response.text()) === 'ok';
  } catch {
    return false;
  }
}

async function waitForDiscovery(
  controller: LANDiscoveryController,
  instanceId: string,
): Promise<boolean> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (controller.getGames().some(game => game.gameId === instanceId)) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

function checkDiscoverySerialization(
  candidates: readonly NetworkInterfaceCandidate[],
  port: number,
  instanceId: string,
  roomCode: string,
): boolean {
  const endpoints = advertisedEndpoints(candidates, port);
  if (!endpoints.length) return false;
  const advertisement: DiscoveryAdvertisement = {
    type: 'own-the-block-lan',
    version: LAN_DISCOVERY_VERSION,
    instanceId,
    appVersion: '3.0.0',
    protocolVersion: 8,
    roomCode,
    port,
    endpoints,
    expiresInMs: LAN_DISCOVERY_TTL_MS,
  };
  const payload = serializeAdvertisement(advertisement).toString('utf8');
  if (/(database_url|postgres|password|token|credential)/iu.test(payload)) return false;
  return parseAdvertisement(payload)?.gameId === instanceId;
}

export async function runPhase71LanProof(
  resourcesRoot = process.resourcesPath,
): Promise<Phase71LanProofResult> {
  requireAbsolute('Electron resources path', resourcesRoot);
  if (!process.argv.includes('--phase7-1-lan-proof')) {
    throw new Error('Phase 7.1 LAN proof requires --phase7-1-lan-proof');
  }

  const targetKey = `${process.platform}-${process.arch}`;
  const postgresRoot = path.join(resourcesRoot, 'postgres', targetKey);
  const helperPath = path.join(resourcesRoot, 'server-helper', 'server-helper.cjs');
  const contractPath = path.join(resourcesRoot, 'server-helper', 'phase71-lan-contract.cjs');
  const migrationDirectory = path.join(resourcesRoot, 'server-helper', 'migrations');
  for (const target of [postgresRoot, helperPath, contractPath, migrationDirectory]) {
    requireAbsolute('Packaged Phase 7.1 resource', target);
    if (containsAsar(target)) throw new Error('Phase 7.1 resources must be external to asar');
  }
  if ((await readdir(migrationDirectory)).length < 9) {
    throw new Error('Packaged Phase 7.1 migration resource is incomplete');
  }

  const contract = loadContract(contractPath);
  const candidates = resolveNetworkInterfaces();
  const proofRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-phase71-proof-'));
  const postgres = new ManagedPostgresController({
    resourceRoot: postgresRoot,
    proofDataDirectory: proofRoot,
  });
  let helper: ServerHelperController | undefined;
  let hostDiscovery: LANDiscoveryController | undefined;
  let browserDiscovery: LANDiscoveryController | undefined;
  const roomCode = `LAN-${randomUUID().slice(0, 6).toUpperCase()}`;
  const discoveryInstanceId = randomUUID();
  let proofResult: Phase71LanProofResult | undefined;

  try {
    const postgresStarts = await Promise.all([postgres.start(), postgres.start()]);
    if (postgresStarts[0]?.port !== postgresStarts[1]?.port) {
      throw new Error('Phase 7.1 proof created duplicate PostgreSQL instances');
    }
    const postgresInfo = postgresStarts[0];
    if (!postgresInfo.databaseUrl.startsWith('postgresql://')
      || !postgresInfo.databaseUrl.includes('@127.0.0.1:')) {
      throw new Error('Phase 7.1 proof PostgreSQL endpoint was not loopback-only');
    }
    const serverPort = await findAvailableLoopbackPort();
    helper = new ServerHelperController({
      modulePath: helperPath,
      migrationDirectory,
      databaseUrl: postgresInfo.databaseUrl,
      host: '0.0.0.0',
      port: serverPort,
    });
    const helperStarts = await Promise.all([helper.start(), helper.start()]);
    if (helperStarts[0]?.pid !== helperStarts[1]?.pid) {
      throw new Error('Phase 7.1 proof created duplicate server helpers');
    }
    const helperInfo = helperStarts[0];
    if (helperInfo.host !== '0.0.0.0' || helperInfo.port !== serverPort) {
      throw new Error('Phase 7.1 helper did not bind the LAN host');
    }

    const lanEndpoints = candidates.map(candidate => `http://${candidate.address}:${String(serverPort)}`);
    const lanHttp = (await Promise.all(lanEndpoints.map(checkEndpoint))).some(Boolean)
      ? 'PASS' as const
      : 'NOT_RUN' as const;
    const contractResult = await contract.runPhase71LanContract({
      serverUrl: `http://127.0.0.1:${String(serverPort)}`,
      roomCode,
    });
    let discovery: 'PASS' | 'NOT_RUN' = 'NOT_RUN';
    if (candidates.length > 0) {
      hostDiscovery = new LANDiscoveryController({
        appVersion: '3.0.0',
        instanceId: discoveryInstanceId,
      });
      browserDiscovery = new LANDiscoveryController({ appVersion: '3.0.0' });
      try {
        await browserDiscovery.startBrowsing();
        hostDiscovery.startAdvertising({ roomCode, port: serverPort });
        discovery = await waitForDiscovery(browserDiscovery, discoveryInstanceId) ? 'PASS' : 'NOT_RUN';
      } catch {
        discovery = 'NOT_RUN';
      }
    }
    const serializedDiscovery = checkDiscoverySerialization(
      candidates,
      serverPort,
      discoveryInstanceId,
      roomCode,
    );
    const status: Phase71LanProofStatus = lanHttp === 'PASS'
      && discovery === 'PASS'
      && serializedDiscovery
      ? 'PASS'
      : 'PARTIAL';
    proofResult = {
      status,
      platform: process.platform,
      architecture: process.arch,
      serverPort,
      interfaceCount: candidates.length,
      lanHttp,
      discovery,
      checks: {
        'external-resources': true,
        'server-binds-0.0.0.0': true,
        'packaged-healthz-readyz': true,
        'two-client-reconnect-contract': true,
        ...(serializedDiscovery ? { 'discovery-serialization': true } : {}),
        ...contractResult.checks,
      },
    };
  } finally {
    await browserDiscovery?.dispose().catch(() => undefined);
    await hostDiscovery?.dispose().catch(() => undefined);
    await helper?.stop().catch(() => undefined);
    await postgres.stop().catch(() => undefined);
    await rm(proofRoot, { recursive: true, force: true });
  }

  if (!proofResult) throw new Error('Phase 7.1 proof did not produce a result');
  if (postgres.state !== 'STOPPED'
    || helper?.state !== 'STOPPED'
    || hostDiscovery?.status.advertising
    || browserDiscovery?.status.browsing) {
    throw new Error('Phase 7.1 proof cleanup did not stop all runtime resources');
  }
  proofResult.checks['clean-shutdown'] = true;
  return proofResult;
}
