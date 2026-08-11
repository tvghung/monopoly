import { loadServerConfig } from './config';
import { createServer } from './createServer';
import {
  createMigrationPool,
  migrateDatabase,
} from './persistence/migrate';
import { createPostgresPersistence } from './persistence';
import type { RoomSnapshot } from './rooms';
import { DeadlineScheduler } from './services/deadlineScheduler';
import { createAppRuntime } from './services/runtime';
import { registerSocketHandlers } from './socket';

async function main(): Promise<void> {
  const config = loadServerConfig(process.env, { requireDatabase: true });
  if (!config.database) throw new Error('DATABASE_URL is required');

  const migrationPool = createMigrationPool(config.database);
  try {
    await migrateDatabase(migrationPool);
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
  const { server, io } = createServer(runtime);
  registerSocketHandlers(io, runtime);
  const scheduler = new DeadlineScheduler(io, runtime);
  try {
    await scheduler.runOnce();
    scheduler.start();

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => reject(error);
      server.once('error', handleError);
      server.listen(config.port, () => {
        server.off('error', handleError);
        console.log(`Server is running on ${config.port}`);
        resolve();
      });
    });
  } catch (error) {
    runtime.flags.shuttingDown = true;
    scheduler.stop();
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
    await persistence.close();
    throw error;
  }

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      console.log(`Received ${signal}; shutting down gracefully.`);
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

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal)
        .then(() => { process.exitCode = 0; })
        .catch((error: unknown) => {
          console.error('Graceful shutdown failed', error);
          process.exitCode = 1;
        });
    });
  }
}

await main().catch((error: unknown) => {
  console.error('Server startup failed', error);
  process.exitCode = 1;
});
