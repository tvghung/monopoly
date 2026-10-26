import type { Server } from 'node:net';
import networkListenGuard from './networkListenGuard.cjs';

const assertLoopbackTestHost: (host: unknown) => asserts host is '127.0.0.1' | '::1' = (
  host,
) => networkListenGuard.assertLoopbackTestHost(host);

export function listenLoopbackTestServer(server: Server, port: number, host: string): Promise<void> {
  assertLoopbackTestHost(host);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    return Promise.reject(new RangeError('Test listener port must be an integer from 0 through 65535.'));
  }

  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    try {
      server.listen(port, host, onListening);
    } catch (error) {
      server.off('error', onError);
      server.off('listening', onListening);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
