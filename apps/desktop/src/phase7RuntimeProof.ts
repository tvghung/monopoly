import { createRequire } from 'node:module';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  findAvailableLoopbackPort,
  ManagedPostgresController,
} from './managedPostgres';
import { ServerHelperController } from './serverHelper';

interface ContractResult {
  pass: true;
  roomId: string;
  marker: string;
  aggregateVersion: number;
  checks: Record<string, true>;
  database: {
    majorVersion: string;
    listenAddresses: string;
    port: number;
  };
}

interface ContractModule {
  runNativePostgresContract(options: {
    connectionString: string;
    migrationDirectory: string;
    expectedRoomId?: string;
  }): Promise<ContractResult>;
}

export interface Phase7RuntimeProofResult {
  pass: true;
  platform: NodeJS.Platform;
  architecture: string;
  postgresPort: number;
  serverPort: number;
  postgresPid: number | undefined;
  helperPid: number | undefined;
  retainedRoomId: string;
  checks: Record<string, true>;
}

function requireAbsolute(name: string, value: string): void {
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
}

function containsAsar(value: string): boolean {
  return value.split(path.sep).some(part => part.endsWith('.asar'));
}

async function checkEndpoint(port: number, endpoint: string, expected: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${endpoint}`, {
    signal: AbortSignal.timeout(2_000),
  });
  const body = await response.text();
  if (response.status !== 200 || body !== expected) {
    throw new Error(`${endpoint} returned ${String(response.status)} ${body}`);
  }
}

function loadContract(contractPath: string): ContractModule {
  const require = createRequire(__filename);
  return require(contractPath) as ContractModule;
}

export async function runPhase7RuntimeProof(
  resourcesRoot = process.resourcesPath,
): Promise<Phase7RuntimeProofResult> {
  requireAbsolute('Electron resources path', resourcesRoot);
  if (!process.argv.includes('--phase7-runtime-proof')) {
    throw new Error('Phase 7 runtime proof requires --phase7-runtime-proof');
  }

  const targetKey = `${process.platform}-${process.arch}`;
  const postgresRoot = path.join(resourcesRoot, 'postgres', targetKey);
  const helperPath = path.join(resourcesRoot, 'server-helper', 'server-helper.cjs');
  const contractPath = path.join(resourcesRoot, 'server-helper', 'phase7-contract.cjs');
  const migrationDirectory = path.join(resourcesRoot, 'server-helper', 'migrations');
  for (const target of [postgresRoot, helperPath, contractPath, migrationDirectory]) {
    requireAbsolute('Packaged Phase 7 resource', target);
    if (containsAsar(target)) throw new Error('Phase 7 proof resources must be external to asar');
  }
  if ((await readdir(migrationDirectory)).length < 9) {
    throw new Error('Packaged Phase 7 migration resource is incomplete');
  }
  const contract = loadContract(contractPath);
  const proofRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-phase7-proof-'));
  const postgres = new ManagedPostgresController({
    resourceRoot: postgresRoot,
    proofDataDirectory: proofRoot,
  });
  let helper: ServerHelperController | undefined;
  let restartedHelper: ServerHelperController | undefined;
  try {
    const postgresStarts = await Promise.all([postgres.start(), postgres.start()]);
    if (postgresStarts[0]?.port !== postgresStarts[1]?.port) {
      throw new Error('Duplicate PostgreSQL start calls did not share one process');
    }
    const postgresInfo = postgresStarts[0];
    const serverPort = await findAvailableLoopbackPort();
    helper = new ServerHelperController({
      modulePath: helperPath,
      migrationDirectory,
      databaseUrl: postgresInfo.databaseUrl,
      host: '127.0.0.1',
      port: serverPort,
    });
    const helperStarts = await Promise.all([helper.start(), helper.start()]);
    if (helperStarts[0]?.pid !== helperStarts[1]?.pid) {
      throw new Error('Duplicate server helper start calls did not share one process');
    }
    await checkEndpoint(serverPort, '/healthz', 'ok');
    await checkEndpoint(serverPort, '/readyz', 'ready');
    const first = await contract.runNativePostgresContract({
      connectionString: postgresInfo.databaseUrl,
      migrationDirectory,
    });

    await helper.stop();
    await postgres.stop();
    if (postgres.state !== 'STOPPED') throw new Error('PostgreSQL did not stop cleanly');

    const restartedPostgres = await postgres.start();
    if (restartedPostgres.dataDirectory !== postgresInfo.dataDirectory) {
      throw new Error('PostgreSQL restart did not reuse the proof data directory');
    }
    const restartedServerPort = await findAvailableLoopbackPort();
    restartedHelper = new ServerHelperController({
      modulePath: helperPath,
      migrationDirectory,
      databaseUrl: restartedPostgres.databaseUrl,
      host: '127.0.0.1',
      port: restartedServerPort,
    });
    await Promise.all([restartedHelper.start(), restartedHelper.start()]);
    await checkEndpoint(restartedServerPort, '/healthz', 'ok');
    await checkEndpoint(restartedServerPort, '/readyz', 'ready');
    const second = await contract.runNativePostgresContract({
      connectionString: restartedPostgres.databaseUrl,
      migrationDirectory,
      expectedRoomId: first.roomId,
    });
    if (second.roomId !== first.roomId || second.marker !== first.marker) {
      throw new Error('PostgreSQL restart did not retain the proof room JSONB marker');
    }
    if (first.database.listenAddresses !== '127.0.0.1'
      || second.database.listenAddresses !== '127.0.0.1') {
      throw new Error('Managed PostgreSQL was not loopback-only');
    }
    if (postgresInfo.pid === undefined || helperStarts[0]?.pid === undefined) {
      throw new Error('Packaged runtime did not expose both process ids');
    }
    if (helper.diagnostic.includes(postgresInfo.databaseUrl)
      || restartedHelper.diagnostic.includes(restartedPostgres.databaseUrl)
      || JSON.stringify(process.argv).includes(postgresInfo.databaseUrl)) {
      throw new Error('Phase 7 proof exposed the private database URL');
    }
    await restartedHelper.stop();
    await postgres.stop();
    return {
      pass: true,
      platform: process.platform,
      architecture: process.arch,
      postgresPort: postgresInfo.port,
      serverPort,
      postgresPid: postgresInfo.pid,
      helperPid: helperStarts[0]?.pid,
      retainedRoomId: second.roomId,
      checks: {
        ...first.checks,
        ...second.checks,
        'restart-retained-room': true,
        'packaged-healthz': true,
        'packaged-readyz': true,
        'loopback-only': true,
        'private-database-url': true,
      },
    };
  } finally {
    await restartedHelper?.stop().catch(() => undefined);
    await helper?.stop().catch(() => undefined);
    await postgres.stop().catch(() => undefined);
    await rm(proofRoot, { recursive: true, force: true });
  }
}
