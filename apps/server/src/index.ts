import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startAuthoritativeServer } from './authoritativeServer.js';

export async function main(): Promise<void> {
  const authoritativeServer = await startAuthoritativeServer();
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = authoritativeServer.shutdown(signal);
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

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined
  && resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  await main().catch((error: unknown) => {
    console.error('Server startup failed', error);
    process.exitCode = 1;
  });
}
