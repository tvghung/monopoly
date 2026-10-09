import {
  HOST_CONTINUITY_CHALLENGE_PATTERN,
  HOST_CONTINUITY_VERSION,
  isPublicEndpointOrigin,
  type HostContinuityProof,
} from '@monopoly/shared';
import express from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { resolveRuntimeProfile } from './config.js';
import type { AppRuntime } from './services/runtime';
import { clientKey, tunnelHeaderTrusted } from './socket/clientIdentity';
import type { AppServer } from './socket/types';

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

// The public origins of an Online Host come from the shared endpoint policy, never from a hostname written here.
const isTunnelOrigin = (origin: string): boolean => isPublicEndpointOrigin(origin);

export function isDesktopRequestOriginAllowed(
  origin: string | undefined,
  requestHost: string | undefined,
  remoteAddress?: string,
): boolean {
  if (origin === undefined || origin === PACKAGED_RENDERER_ORIGIN) return true;
  if (!requestHost || !(isDesktopBrowserOrigin(origin) || isTunnelOrigin(origin))) return false;
  if (new URL(origin).host === requestHost) return true;
  // cloudflared normally sends the local service URL as Host. Accept that
  // rewrite only when the connection itself came from the loopback peer.
  return isTunnelOrigin(origin)
    && /^127\.0\.0\.1:\d{1,5}$/.test(requestHost)
    && (remoteAddress === '127.0.0.1' || remoteAddress === '::1'
      || remoteAddress === '::ffff:127.0.0.1');
}

export function resolveCorsOrigin(
  environment: NodeJS.ProcessEnv = process.env,
): CorsOrigin {
  if (environment.CORS_ORIGIN) return environment.CORS_ORIGIN;
  const runtimeProfile = resolveRuntimeProfile(environment);
  if (runtimeProfile === 'development') return DEVELOPMENT_RENDERER_ORIGIN;
  return (origin, callback) => {
    callback(null, origin === undefined
      || origin === PACKAGED_RENDERER_ORIGIN
      || isDesktopBrowserOrigin(origin)
      || isTunnelOrigin(origin));
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
  const configured = options.clientDist || environment.CLIENT_DIST;
  if (!configured) throw new Error('Desktop runtime requires an explicit clientDist');
  if (runtimeProfile === 'desktop' && !path.isAbsolute(configured)) {
    throw new Error('Desktop clientDist must be absolute');
  }
  return path.resolve(configured);
}

// Build the Express app, HTTP server, and typed Socket.IO server.
export function createServer(
  runtime: AppRuntime,
  options: CreateServerOptions = {},
): { app: express.Express; server: HttpServer; io: AppServer } {
  const environment = options.environment ?? process.env;
  const runtimeProfile = resolveRuntimeProfile(environment);
  const app = express();
  const server = createHttpServer(app);

  const corsOrigin = resolveCorsOrigin(environment);

  // Behind the Online Host's tunnel every visitor arrives from the local connector, so the default per-address
  // identity would put them all in one bucket. See clientIdentity.ts for what is and is not trusted.
  const trustTunnelHeader = tunnelHeaderTrusted(runtimeProfile, environment);
  const perClientRateLimit = {
    keyGenerator: (request: express.Request): string => clientKey(
      request.socket.remoteAddress,
      request.headers,
      trustTunnelHeader,
    ),
    // The key never reads `request.ip`, so Express's trust-proxy advice does not apply.
    validate: { xForwardedForHeader: false },
  } as const;

  const io: AppServer = new Server(server, {
    cors: { origin: corsOrigin },
    ...(runtimeProfile === 'desktop'
      ? {
          allowRequest: (request, callback) => callback(
            null,
            isDesktopRequestOriginAllowed(request.headers.origin, request.headers.host, request.socket.remoteAddress),
          ),
        }
      : {}),
  });

  app.get('/healthz', (_req, res) => res.status(runtime.flags.shuttingDown ? 503 : 200).send(
    runtime.flags.shuttingDown ? 'shutting down' : 'ok',
  ));
  // The desktop host checks this through the public tunnel before presenting
  // an invitation. A known code reveals only whether the room exists.
  if (runtimeProfile === 'desktop') {
    const roomProbeLimiter = rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...perClientRateLimit,
    });
    app.get('/_otb/room', roomProbeLimiter, async (req, res) => {
      const code = req.query.code;
      if (typeof code !== 'string' || !/^[A-Z0-9-]{1,20}$/.test(code)) {
        res.status(400).end();
        return;
      }
      if (runtime.flags.shuttingDown) { res.status(503).end(); return; }
      const room = await runtime.persistence.rooms.findByCode(code);
      res.set('cache-control', 'no-store');
      // The process id is public and only tells the desktop Join whether a LAN and an Online answer are one Host. It is
      // never proof of anything: continuity after a link change is the signed check below.
      if (room) res.status(200).json({ instanceId: runtime.instanceId });
      else res.status(404).end();
    });

    // Host continuity (see packages/shared/src/hostContinuity.ts): sign a client's fresh challenge for one of this process's
    // own addresses only. Readable cross-origin by the game's own pages, which ask it from their old address.
    app.get('/_otb/continuity', roomProbeLimiter, async (req, res) => {
      res.set('cache-control', 'no-store');
      const origin = req.get('origin');
      if (origin && (origin === PACKAGED_RENDERER_ORIGIN || isDesktopBrowserOrigin(origin) || isTunnelOrigin(origin))) {
        res.set('access-control-allow-origin', origin);
        res.set('vary', 'Origin');
      }
      const { code, challenge, endpoint } = req.query;
      const address = server.address();
      if (
        typeof code !== 'string' || !/^[A-Z0-9-]{1,20}$/.test(code)
        || typeof challenge !== 'string' || !HOST_CONTINUITY_CHALLENGE_PATTERN.test(challenge)
        || typeof endpoint !== 'string' || endpoint.length > 200
        || !address || typeof address === 'string'
      ) {
        res.status(400).end();
        return;
      }
      if (runtime.flags.shuttingDown) { res.status(503).end(); return; }
      // An address that is not this process's own is refused: a relaying Host cannot borrow this signature.
      if (!runtime.continuity.ownsEndpoint(endpoint, address.port)) { res.status(403).end(); return; }
      if (!await runtime.persistence.rooms.findByCode(code)) { res.status(404).end(); return; }
      const proof: HostContinuityProof = {
        version: HOST_CONTINUITY_VERSION,
        roomCode: code,
        endpoint,
        challenge,
        signature: runtime.continuity.sign(code, endpoint, challenge),
      };
      res.status(200).json(proof);
    });
  }
  if (runtimeProfile === 'desktop' && environment.OTB_REGISTRY_ROOM_CODE
    && environment.OTB_REGISTRY_PROOF) {
    app.get('/_otb/registry-proof', async (_req, res) => {
      res.set('cache-control', 'no-store');
      try {
        const room = await runtime.persistence.rooms.findByCode(environment.OTB_REGISTRY_ROOM_CODE as string);
        if (!room || !room.hostPlayerId) { res.status(404).end(); return; }
        res.json({ roomCode: room.code, proof: environment.OTB_REGISTRY_PROOF });
      } catch {
        res.status(503).end();
      }
    });
  }
  app.get('/readyz', async (_req, res) => {
    if (runtime.flags.shuttingDown) {
      res.status(503).send('shutting down');
      return;
    }
    try {
      await runtime.persistence.healthcheck();
      res.status(200).send('ready');
    } catch {
      res.status(503).send('server unavailable');
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
      ...perClientRateLimit,
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
