import { createServer } from './createServer.js';
import {
  loadServerConfig,
  type ServerConfig,
} from './config.js';
import {
  createMigrationPool,
  migrateDatabase,
} from './persistence/migrate.js';
import { createPostgresPersistence } from './persistence/index.js';
import type { RoomSnapshot } from './rooms.js';
import { DeadlineScheduler } from './services/deadlineScheduler.js';
import { createAppRuntime } from './services/runtime.js';
import { registerSocketHandlers } from './socket/index.js';

export interface StartAuthoritativeServerOptions {
  environment?: NodeJS.ProcessEnv;
  config?: ServerConfig;
  migrationDirectory?: string | URL;
  host?: string;
  port?: number;
  clientDist?: string;
}

export interface AuthoritativeServer {
  readonly runtime: ReturnType<typeof createAppRuntime>;
  readonly host: string;
  readonly port: number;
  shutdown(reason?: string): Promise<void>;
}

export async function startAuthoritativeServer(
  options: StartAuthoritativeServerOptions = {},
): Promise<AuthoritativeServer> {
  const environment = options.environment ?? process.env;
  const config = options.config
    ?? loadServerConfig(environment, { requireDatabase: true });
  if (!config.database) throw new Error('DATABASE_URL is required');

  const migrationDirectory = options.migrationDirectory
    ?? environment.OWN_THE_BLOCK_MIGRATIONS_DIR;
  const migrationPool = createMigrationPool(config.database);
  try {
    await migrateDatabase(migrationPool, migrationDirectory);
  } finally {
    await migrationPool.end();
  }

  const persistence = createPostgresPersistence<RoomSnapshot>(config.database);
  try {
    await persistence.healthcheck();
  } catch (error) {
    await persistence.close();
    throw error;
  }

  const runtime = createAppRuntime(persistence, config.persistenceTiming);
  const { server, io } = createServer(runtime, {
    environment,
    clientDist: options.clientDist,
  });
  registerSocketHandlers(io, runtime);
  const scheduler = new DeadlineScheduler(io, runtime);
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (reason = 'shutdown'): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      if (reason !== 'startup failure') {
        console.log(`Shutting down authoritative server (${reason}).`);
      }
      runtime.flags.shuttingDown = true;
      scheduler.stop();
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
      runtime.connections.clear();
      await persistence.close();
    })();
    return shutdownPromise;
  };

  try {
    await scheduler.runOnce();
    scheduler.start();
    const host = options.host ?? config.listenHost;
    const port = options.port ?? config.port;
    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => reject(error);
      server.once('error', handleError);
      server.listen(port, host, () => {
        server.off('error', handleError);
        console.log(`Server is running on ${host}:${String(port)}`);
        resolve();
      });
    });
    return { runtime, host, port, shutdown };
  } catch (error) {
    await shutdown('startup failure').catch(() => undefined);
    throw error;
  }
}
