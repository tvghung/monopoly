import type { Express } from 'express';
import { createServer } from './createServer.js';
import {
  loadServerConfig,
  type ServerConfig,
} from './config.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import type { RoomSnapshot } from './rooms.js';
import { BotDriver } from './bots/driver.js';
import { DeadlineScheduler } from './services/deadlineScheduler.js';
import { createAppRuntime } from './services/runtime.js';
import { tunnelHeaderTrusted } from './socket/clientIdentity.js';
import { registerSocketHandlers } from './socket/index.js';

export interface StartAuthoritativeServerOptions {
  environment?: NodeJS.ProcessEnv;
  config?: ServerConfig;
  host?: string;
  port?: number;
  clientDist?: string;
  /** Lets a test harness add routes (for example a built client) before the server listens; never set by the product. */
  configureApp?: (app: Express) => void;
}

export interface AuthoritativeServer {
  readonly runtime: ReturnType<typeof createAppRuntime>;
  readonly host: string;
  readonly port: number;
  shutdown(reason?: string): Promise<void>;
}

/** The opt-in desktop acceptance process cannot request a wildcard or LAN listener. */
export function resolveListenerHost(
  requestedHost: string | undefined,
  configuredHost: string,
  environment: NodeJS.ProcessEnv,
): string {
  const host = requestedHost ?? configuredHost;
  if (environment.OTB_LOOPBACK_ACCEPTANCE_MODE === '1' && host !== '127.0.0.1') {
    throw new Error('Loopback acceptance mode requires the server to bind to 127.0.0.1');
  }
  return host;
}

export async function startAuthoritativeServer(
  options: StartAuthoritativeServerOptions = {},
): Promise<AuthoritativeServer> {
  const environment = options.environment ?? process.env;
  const config = options.config ?? loadServerConfig(environment);
  const loopbackOnly = environment.OTB_LOOPBACK_ACCEPTANCE_MODE === '1';
  const host = resolveListenerHost(options.host, config.listenHost, environment);
  // A new authoritative process always starts a new, empty match universe.
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();

  const runtime = createAppRuntime(persistence, config.persistenceTiming);
  const { app, server, io } = createServer(runtime, {
    environment,
    clientDist: options.clientDist,
  });
  options.configureApp?.(app);
  registerSocketHandlers(io, runtime, config.runtimeProfile, {
    ...(environment.OTB_HOST_ROOM_CODE && environment.OTB_HOST_CREATE_SECRET
      ? {
          hostAuthorization: {
            roomCode: environment.OTB_HOST_ROOM_CODE,
            secret: environment.OTB_HOST_CREATE_SECRET,
          },
        }
      : {}),
    trustTunnelHeader: tunnelHeaderTrusted(config.runtimeProfile, environment),
  });
  const scheduler = new DeadlineScheduler(io, runtime);
  const bots = new BotDriver(io, runtime, {
    delayScale: config.botActionDelayScale,
    ...(environment.OTB_BOT_LOG === '1' ? { log: (line: string) => console.log(line) } : {}),
  });
  runtime.bots = bots;
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (reason = 'shutdown'): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      if (reason !== 'startup failure') {
        console.log(`Shutting down authoritative server (${reason}).`);
      }
      runtime.flags.shuttingDown = true;
      scheduler.stop();
      bots.stop();
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
    bots.start();
    const requestedPort = options.port ?? config.port;
    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => reject(error);
      server.once('error', handleError);
      server.listen(requestedPort, host, () => {
        server.off('error', handleError);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Authoritative server did not publish a TCP address');
    }
    if (loopbackOnly && address.address !== '127.0.0.1') {
      throw new Error('Loopback acceptance server published a non-loopback TCP address');
    }
    const port = address.port;
    const actualHost = loopbackOnly ? address.address : host;
    console.log(`Server is running on ${actualHost}:${String(port)}`);
    return { runtime, host: actualHost, port, shutdown };
  } catch (error) {
    await shutdown('startup failure').catch(() => undefined);
    throw error;
  }
}
