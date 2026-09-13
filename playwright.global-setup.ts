import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ManagedPostgresController } from './apps/desktop/src/managedPostgres';
import { startAuthoritativeServer } from './apps/server/src/authoritativeServer';

export default async function globalSetup() {
  const repositoryRoot = import.meta.dirname;
  const targetKey = `${process.platform}-${process.arch}`;
  const resourceRoot = path.join(
    repositoryRoot,
    'apps',
    'desktop',
    'generated',
    'postgres',
    targetKey,
  );
  const migrationDirectory = path.join(repositoryRoot, 'apps', 'server', 'migrations');
  const clientDist = path.join(repositoryRoot, 'apps', 'client', 'dist');
  await Promise.all([access(resourceRoot), access(migrationDirectory), access(clientDist)]);

  const proofRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-e2e-'));
  const postgres = new ManagedPostgresController({
    resourceRoot,
    proofDataDirectory: proofRoot,
  });
  let server: Awaited<ReturnType<typeof startAuthoritativeServer>> | undefined;
  try {
    const database = await postgres.start();
    server = await startAuthoritativeServer({
      environment: {
        NODE_ENV: 'production',
        SERVER_RUNTIME_PROFILE: 'desktop',
        SERVER_HOST: '127.0.0.1',
        PORT: '4173',
        DATABASE_URL: database.databaseUrl,
        DATABASE_SSL: 'false',
      },
      migrationDirectory,
      clientDist,
      host: '127.0.0.1',
      port: 4173,
    });
  } catch (error) {
    await postgres.stop().catch(() => undefined);
    await rm(proofRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  return async () => {
    let cleanupError: unknown;
    try {
      await server?.shutdown('Playwright teardown');
    } catch (error) {
      cleanupError = error;
    }
    try {
      await postgres.stop();
    } catch (error) {
      cleanupError ??= error;
    }
    await rm(proofRoot, { recursive: true, force: true });
    if (cleanupError) {
      throw cleanupError instanceof Error ? cleanupError : new Error('E2E cleanup failed');
    }
  };
}
