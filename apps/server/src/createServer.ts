import express from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { resolveRuntimeProfile } from './config.js';
import type { AppRuntime } from './services/runtime';
import type { AppServer } from './socket/types';

const currentDir = typeof import.meta.url === 'string'
  ? path.dirname(fileURLToPath(import.meta.url))
  : process.cwd();
export const DEVELOPMENT_RENDERER_ORIGIN = 'http://127.0.0.1:5173';
export const PACKAGED_RENDERER_ORIGIN = 'app://own-the-block';

type CorsOrigin = string | false | ((origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void);

function isIPv4Hostname(value: string): boolean {
  const parts = value.split('.').map(Number);
  return parts.length === 4
    && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255);
}

export function isDesktopBrowserOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:'
      && parsed.origin === origin
      && isIPv4Hostname(parsed.hostname)
      && parsed.port !== '';
  } catch {
    return false;
  }
}

export function isDesktopRequestOriginAllowed(
  origin: string | undefined,
  requestHost: string | undefined,
): boolean {
  if (origin === undefined || origin === PACKAGED_RENDERER_ORIGIN) return true;
  return requestHost !== undefined
    && isDesktopBrowserOrigin(origin)
    && new URL(origin).host === requestHost;
}

export function resolveCorsOrigin(
  environment: NodeJS.ProcessEnv = process.env,
): CorsOrigin {
  if (environment.CORS_ORIGIN) return environment.CORS_ORIGIN;
  const runtimeProfile = resolveRuntimeProfile(environment);
  if (runtimeProfile === 'development') return DEVELOPMENT_RENDERER_ORIGIN;
  if (runtimeProfile === 'cloud') return PACKAGED_RENDERER_ORIGIN;
  return (origin, callback) => {
    callback(null, origin === undefined
      || origin === PACKAGED_RENDERER_ORIGIN
      || isDesktopBrowserOrigin(origin));
  };
}

export interface CreateServerOptions {
  environment?: NodeJS.ProcessEnv;
  clientDist?: string;
}

function staticClientRoot(
  runtimeProfile: ReturnType<typeof resolveRuntimeProfile>,
  options: CreateServerOptions,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  if (runtimeProfile === 'development') return undefined;
  const configured = options.clientDist
    || environment.CLIENT_DIST
    || (runtimeProfile === 'cloud'
      ? path.join(currentDir, '..', '..', 'client', 'dist')
      : undefined);
  if (!configured) throw new Error('Desktop runtime requires an explicit clientDist');
  if (runtimeProfile === 'desktop' && !path.isAbsolute(configured)) {
    throw new Error('Desktop clientDist must be absolute');
  }
  return path.resolve(configured);
}

// Build the Express app, HTTP server, and typed Socket.IO server. Cloud and
// desktop both serve the client same-origin, but retain separate runtime policy.
export function createServer(
  runtime: AppRuntime,
  options: CreateServerOptions = {},
): { app: express.Express; server: HttpServer; io: AppServer } {
  const environment = options.environment ?? process.env;
  const runtimeProfile = resolveRuntimeProfile(environment);
  const app = express();
  const server = createHttpServer(app);

  // In production the app runs behind a single reverse proxy (e.g. Render),
  // which sets the 'X-Forwarded-For' header. Trust exactly one hop so
  // express-rate-limit can identify clients by their real IP. Trusting a
  // specific number of hops (rather than `true`) prevents clients from
  // spoofing the header to bypass the limiter.
  if (runtimeProfile === 'cloud') {
    app.set('trust proxy', 1);
  }

  const corsOrigin = resolveCorsOrigin(environment);

  const io: AppServer = new Server(server, {
    cors: { origin: corsOrigin },
    ...(runtimeProfile === 'desktop'
      ? {
          allowRequest: (request, callback) => callback(
            null,
            isDesktopRequestOriginAllowed(request.headers.origin, request.headers.host),
          ),
        }
      : {}),
  });

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));
  app.get('/readyz', async (_req, res) => {
    if (runtime.flags.shuttingDown) {
      res.status(503).send('shutting down');
      return;
    }
    try {
      await runtime.persistence.healthcheck();
      res.status(200).send('ready');
    } catch {
      res.status(503).send('database unavailable');
    }
  });

  const clientDist = staticClientRoot(runtimeProfile, options, environment);
  if (clientDist) {
    // Cap requests to the static file server so a single client can't hammer the
    // filesystem. Scoped to the asset/SPA routes only, so it never throttles the
    // Socket.IO transport (which has its own connection handling).
    const staticLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    });
    app.use(staticLimiter, express.static(clientDist, { dotfiles: 'deny' }));
    // SPA fallback: serve index.html for any other GET. Express 5 (path-to-regexp
    // v8) no longer accepts the bare '*' string route, so match with a RegExp.
    app.get(/.*/, staticLimiter, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return { app, server, io };
}
