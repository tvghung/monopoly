import express from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import type { AppRuntime } from './services/runtime';
import type { AppServer } from './socket/types';

const { env } = process;
const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Build the Express app, HTTP server, and typed Socket.IO server. In production
// the client is served same-origin (with a SPA fallback), so cross-origin
// requests are disallowed by default; set CORS_ORIGIN to allow another origin.
export function createServer(runtime: AppRuntime): { server: HttpServer; io: AppServer } {
  const app = express();
  const server = createHttpServer(app);

  // In production the app runs behind a single reverse proxy (e.g. Render),
  // which sets the 'X-Forwarded-For' header. Trust exactly one hop so
  // express-rate-limit can identify clients by their real IP. Trusting a
  // specific number of hops (rather than `true`) prevents clients from
  // spoofing the header to bypass the limiter.
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const corsOrigin = env.CORS_ORIGIN
    || (env.NODE_ENV === 'production' ? false : 'http://localhost:5173');

  const io: AppServer = new Server(server, {
    cors: { origin: corsOrigin },
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

  if (env.NODE_ENV === 'production') {
    const clientDist = env.CLIENT_DIST
      || path.join(currentDir, '..', '..', 'client', 'dist');
    // Cap requests to the static file server so a single client can't hammer the
    // filesystem. Scoped to the asset/SPA routes only, so it never throttles the
    // Socket.IO transport (which has its own connection handling).
    const staticLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    });
    app.use(staticLimiter, express.static(clientDist));
    // SPA fallback: serve index.html for any other GET. Express 5 (path-to-regexp
    // v8) no longer accepts the bare '*' string route, so match with a RegExp.
    app.get(/.*/, staticLimiter, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return { server, io };
}
