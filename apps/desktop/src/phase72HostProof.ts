import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { ManagedPostgresController } from './managedPostgres';
import { resolveNetworkInterfaces } from './networkInterfaces';
import { ServerHelperController } from './serverHelper';

interface RetainedSession {
  token: string;
  playerId: string;
  roomId: string;
  roomCode: string;
}

interface Phase72ContractModule {
  runPhase72HostContract(options: {
    serverUrl: string;
    remoteServerUrl: string;
    roomCode: string;
  }): Promise<{
    pass: true;
    roomId: string;
    hostPlayerId: string;
    retainedSession: RetainedSession;
    checks: Record<string, true>;
  }>;
  resumePhase72RetainedSession(options: {
    serverUrl: string;
    session: RetainedSession;
  }): Promise<Record<string, true>>;
}

interface Phase7ContractModule {
  prepareDeadlineRecoveryProof(options: {
    connectionString: string;
    migrationDirectory: string;
  }): Promise<{
    roomId: string;
    originalAggregateVersion: number;
    duePlayerId: string;
    expectedNextPlayerId: string;
    expectedNextTurnNumber: number;
  }>;
  verifyDeadlineRecoveryProof(options: {
    connectionString: string;
    migrationDirectory: string;
    roomId: string;
    originalAggregateVersion: number;
    duePlayerId: string;
    expectedNextPlayerId: string;
    expectedNextTurnNumber: number;
  }): Promise<unknown>;
}

export interface Phase72HostProofResult {
  pass: true;
  platform: NodeJS.Platform;
  architecture: string;
  serverPort: number;
  interfaceCount: number;
  roomId: string;
  physicalDeviceAcceptance: 'MANUAL_REQUIRED';
  checks: Record<string, true>;
}

function requireAbsolute(name: string, value: string): void {
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
}

function containsAsar(value: string): boolean {
  return value.split(path.sep).some(part => part.endsWith('.asar'));
}

function loadModule<T>(modulePath: string): T {
  return createRequire(__filename)(modulePath) as T;
}

async function checkEndpoint(endpoint: string, route: string, expected: string): Promise<void> {
  const response = await fetch(`${endpoint}${route}`, { signal: AbortSignal.timeout(2_000) });
  const body = await response.text();
  if (response.status !== 200 || body !== expected) {
    throw new Error(`${route} returned ${String(response.status)} ${body}`);
  }
}

async function checkBundledClient(endpoint: string): Promise<void> {
  const index = await fetch(`${endpoint}/`, { signal: AbortSignal.timeout(2_000) });
  const html = await index.text();
  if (index.status !== 200 || !html.includes('Own the Block')) {
    throw new Error('Packaged Host did not serve the bundled browser client');
  }
  const asset = html.match(/(?:src|href)="([^"]*\/assets\/[^"]+)"/u)?.[1];
  if (!asset) throw new Error('Packaged Host client did not reference a bundled asset');
  const assetResponse = await fetch(new URL(asset, endpoint), {
    signal: AbortSignal.timeout(2_000),
  });
  if (assetResponse.status !== 200 || !(await assetResponse.arrayBuffer()).byteLength) {
    throw new Error('Packaged Host client asset was unavailable');
  }
}

async function checkCors(endpoint: string): Promise<void> {
  const handshake = `${endpoint}/socket.io/?EIO=4&transport=polling`;
  const sameOrigin = await fetch(handshake, { headers: { Origin: endpoint } });
  if (sameOrigin.status !== 200
    || sameOrigin.headers.get('access-control-allow-origin') !== endpoint) {
    throw new Error('Packaged Host rejected its browser same-origin handshake');
  }
  const appOrigin = 'app://own-the-block';
  const packaged = await fetch(handshake, { headers: { Origin: appOrigin } });
  if (packaged.status !== 200
    || packaged.headers.get('access-control-allow-origin') !== appOrigin) {
    throw new Error('Packaged Host rejected the explicit Electron app origin');
  }
  const unrelated = await fetch(handshake, {
    headers: { Origin: 'http://192.0.2.10:53120' },
  });
  if (unrelated.status !== 403) {
    throw new Error('Packaged Host accepted a cross-origin browser handshake');
  }
}

function createHelper(options: {
  helperPath: string;
  migrationDirectory: string;
  clientDist: string;
  databaseUrl: string;
  port: number;
}): ServerHelperController {
  return new ServerHelperController({
    modulePath: options.helperPath,
    migrationDirectory: options.migrationDirectory,
    clientDist: options.clientDist,
    databaseUrl: options.databaseUrl,
    host: '0.0.0.0',
    port: options.port,
  });
}

export async function runPhase72HostProof(
  resourcesRoot = process.resourcesPath,
): Promise<Phase72HostProofResult> {
  requireAbsolute('Electron resources path', resourcesRoot);
  if (!process.argv.includes('--phase7-2-host-proof')) {
    throw new Error('Phase 7.2 Host proof requires --phase7-2-host-proof');
  }

  const targetKey = `${process.platform}-${process.arch}`;
  const postgresRoot = path.join(resourcesRoot, 'postgres', targetKey);
  const helperPath = path.join(resourcesRoot, 'server-helper', 'server-helper.cjs');
  const phase72ContractPath = path.join(
    resourcesRoot,
    'server-helper',
    'phase72-host-contract.cjs',
  );
  const phase7ContractPath = path.join(resourcesRoot, 'server-helper', 'phase7-contract.cjs');
  const migrationDirectory = path.join(resourcesRoot, 'server-helper', 'migrations');
  const clientDist = path.join(resourcesRoot, 'dist');
  for (const target of [
    postgresRoot,
    helperPath,
    phase72ContractPath,
    phase7ContractPath,
    migrationDirectory,
    clientDist,
  ]) {
    requireAbsolute('Packaged Phase 7.2 resource', target);
    if (containsAsar(target)) throw new Error('Phase 7.2 resources must be external to asar');
  }
  if ((await readdir(migrationDirectory)).length < 9) {
    throw new Error('Packaged Phase 7.2 migration resource is incomplete');
  }

  const contract = loadModule<Phase72ContractModule>(phase72ContractPath);
  const phase7Contract = loadModule<Phase7ContractModule>(phase7ContractPath);
  const interfaces = resolveNetworkInterfaces();
  if (!interfaces.length) throw new Error('Phase 7.2 proof found no usable LAN IPv4 interface');

  const proofRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-phase72-proof-'));
  const postgres = new ManagedPostgresController({
    resourceRoot: postgresRoot,
    proofDataDirectory: proofRoot,
  });
  let helper: ServerHelperController | undefined;
  let helperRestart: ServerHelperController | undefined;
  let fullRestartHelper: ServerHelperController | undefined;
  let proofResult: Phase72HostProofResult | undefined;
  let cleanupError: unknown;

  try {
    const postgresStarts = await Promise.all([postgres.start(), postgres.start()]);
    if (postgresStarts[0]?.pid !== postgresStarts[1]?.pid) {
      throw new Error('Phase 7.2 proof created duplicate PostgreSQL processes');
    }
    const postgresInfo = postgresStarts[0];
    if (new URL(postgresInfo.databaseUrl).hostname !== '127.0.0.1') {
      throw new Error('Phase 7.2 managed PostgreSQL was not loopback-only');
    }

    helper = createHelper({
      helperPath,
      migrationDirectory,
      clientDist,
      databaseUrl: postgresInfo.databaseUrl,
      port: 0,
    });
    const helperStarts = await Promise.all([helper.start(), helper.start()]);
    if (helperStarts[0]?.pid !== helperStarts[1]?.pid) {
      throw new Error('Phase 7.2 proof created duplicate server helpers');
    }
    const helperInfo = helperStarts[0];
    if (helperInfo.host !== '0.0.0.0' || helperInfo.port < 1) {
      throw new Error('Phase 7.2 helper did not publish its real LAN port');
    }
    const serverUrl = `http://127.0.0.1:${String(helperInfo.port)}`;
    await checkEndpoint(serverUrl, '/healthz', 'ok');
    await checkEndpoint(serverUrl, '/readyz', 'ready');
    await checkBundledClient(serverUrl);
    await checkCors(serverUrl);

    const reachableLanUrls: string[] = [];
    for (const candidate of interfaces) {
      const endpoint = `http://${candidate.address}:${String(helperInfo.port)}`;
      try {
        await checkEndpoint(endpoint, '/healthz', 'ok');
        reachableLanUrls.push(endpoint);
      } catch {
        // Another real interface may be the routable LAN adapter.
      }
    }
    if (!reachableLanUrls.length) {
      throw new Error('Phase 7.2 helper was not reachable through a real LAN IPv4 interface');
    }

    const roomCode = `OTB-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
    const contractResult = await contract.runPhase72HostContract({
      serverUrl,
      remoteServerUrl: reachableLanUrls[0],
      roomCode,
    });
    const publicInvite = `${reachableLanUrls[0]}/?room=${roomCode}`;
    if (/(token|postgres|password|credential)/iu.test(publicInvite)) {
      throw new Error('Phase 7.2 invite exposed a private credential');
    }

    await helper.stop();
    helperRestart = createHelper({
      helperPath,
      migrationDirectory,
      clientDist,
      databaseUrl: postgresInfo.databaseUrl,
      port: helperInfo.port,
    });
    await helperRestart.start();
    const helperRestartUrl = `http://127.0.0.1:${String(helperInfo.port)}`;
    const helperRestartChecks = await contract.resumePhase72RetainedSession({
      serverUrl: helperRestartUrl,
      session: contractResult.retainedSession,
    });

    await helperRestart.stop();
    const deadline = await phase7Contract.prepareDeadlineRecoveryProof({
      connectionString: postgresInfo.databaseUrl,
      migrationDirectory,
    });
    await postgres.stop();
    const restartedPostgres = await postgres.start();
    if (restartedPostgres.dataDirectory !== postgresInfo.dataDirectory) {
      throw new Error('Phase 7.2 PostgreSQL restart did not reuse the retained data directory');
    }
    fullRestartHelper = createHelper({
      helperPath,
      migrationDirectory,
      clientDist,
      databaseUrl: restartedPostgres.databaseUrl,
      port: helperInfo.port,
    });
    await fullRestartHelper.start();
    await checkEndpoint(helperRestartUrl, '/readyz', 'ready');
    const fullRestartChecks = await contract.resumePhase72RetainedSession({
      serverUrl: helperRestartUrl,
      session: contractResult.retainedSession,
    });
    await phase7Contract.verifyDeadlineRecoveryProof({
      connectionString: restartedPostgres.databaseUrl,
      migrationDirectory,
      ...deadline,
    });

    const diagnostics = [helper, helperRestart, fullRestartHelper]
      .map(controller => controller.diagnostic)
      .join('\n');
    if (diagnostics.includes(postgresInfo.databaseUrl)
      || diagnostics.includes(restartedPostgres.databaseUrl)
      || JSON.stringify(process.argv).includes(postgresInfo.databaseUrl)) {
      throw new Error('Phase 7.2 proof exposed the private database URL');
    }

    await fullRestartHelper.stop();
    await postgres.stop();
    proofResult = {
      pass: true,
      platform: process.platform,
      architecture: process.arch,
      serverPort: helperInfo.port,
      interfaceCount: interfaces.length,
      roomId: contractResult.roomId,
      physicalDeviceAcceptance: 'MANUAL_REQUIRED',
      checks: {
        'external-resources': true,
        'loopback-only-postgres': true,
        'server-binds-0.0.0.0': true,
        'automatic-real-port': true,
        'packaged-healthz-readyz': true,
        'bundled-browser-client': true,
        'explicit-origin-policy': true,
        'real-interface-http': true,
        'credential-free-invite': true,
        ...contractResult.checks,
        ...helperRestartChecks,
        ...fullRestartChecks,
        'helper-restart-same-database': true,
        'postgres-restart-retained-data': true,
        'restart-deadline-recovery': true,
        'private-database-url': true,
      },
    };
  } finally {
    for (const controller of [fullRestartHelper, helperRestart, helper]) {
      try {
        await controller?.stop();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      await postgres.stop();
    } catch (error) {
      cleanupError ??= error;
    }
    try {
      await rm(proofRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupError ??= error;
    }
  }

  if (cleanupError) {
    throw cleanupError instanceof Error
      ? cleanupError
      : new Error('Phase 7.2 proof cleanup failed');
  }
  if (!proofResult) throw new Error('Phase 7.2 Host proof did not produce a result');
  if (postgres.state !== 'STOPPED'
    || helper?.state !== 'STOPPED'
    || helperRestart?.state !== 'STOPPED'
    || fullRestartHelper?.state !== 'STOPPED') {
    throw new Error('Phase 7.2 proof cleanup did not stop every runtime process');
  }
  proofResult.checks['clean-shutdown'] = true;
  return proofResult;
}
