import { startAuthoritativeServer } from './authoritativeServer.js';

const DIAGNOSTIC_LIMIT = 512;

interface HelperMessage {
  type: 'shutdown';
}

interface ParentPortLike {
  on(event: 'message', listener: (message: unknown) => void): void;
  postMessage(message: unknown): void;
}

function isParentPortLike(value: unknown): value is ParentPortLike {
  return typeof value === 'object'
    && value !== null
    && 'on' in value
    && typeof value.on === 'function'
    && 'postMessage' in value
    && typeof value.postMessage === 'function';
}

const parentPortValue: unknown = Reflect.get(process, 'parentPort');
const parentPort = isParentPortLike(parentPortValue) ? parentPortValue : undefined;

function sanitizeDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?(?:\+[^:]+)?:\/\/[^\s"'`]+/giu, 'postgresql://[redacted]')
    .slice(0, DIAGNOSTIC_LIMIT);
}

function post(message: Record<string, unknown>): void {
  parentPort?.postMessage(message);
}

function parentMessageData(message: unknown): unknown {
  if (typeof message === 'object' && message !== null && 'data' in message) {
    return message.data;
  }
  return message;
}

async function main(): Promise<void> {
  if (!parentPort) throw new Error('Server helper requires Electron utilityProcess');

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const migrationDirectory = process.env.OWN_THE_BLOCK_MIGRATIONS_DIR?.trim();
  const clientDist = process.env.OWN_THE_BLOCK_CLIENT_DIST?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!migrationDirectory) {
    throw new Error('OWN_THE_BLOCK_MIGRATIONS_DIR is required');
  }
  if (!clientDist) throw new Error('OWN_THE_BLOCK_CLIENT_DIST is required');

  const authoritativeServer = await startAuthoritativeServer({
    environment: process.env,
    migrationDirectory,
    clientDist,
    host: process.env.SERVER_HOST,
    port: Number(process.env.PORT),
  });
  post({
    type: 'ready',
    host: authoritativeServer.host,
    port: authoritativeServer.port,
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = async (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = authoritativeServer.shutdown('parent shutdown');
    await shutdownPromise;
    post({ type: 'stopped' });
  };

  parentPort.on('message', (message: unknown) => {
    const value = parentMessageData(message);
    if (
      typeof value === 'object'
      && value !== null
      && (value as Partial<HelperMessage>).type === 'shutdown'
    ) {
      void shutdown()
        .then(() => { process.exit(0); })
        .catch((error: unknown) => {
          post({ type: 'failed', message: sanitizeDiagnostic(error) });
          process.exit(1);
        });
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown()
        .then(() => { process.exit(0); })
        .catch((error: unknown) => {
          post({ type: 'failed', message: sanitizeDiagnostic(error) });
          process.exit(1);
        });
    });
  }
}

void main().catch((error: unknown) => {
  const message = sanitizeDiagnostic(error);
  post({ type: 'failed', message });
  console.error(`Server helper failed: ${message}`);
  process.exitCode = 1;
});
