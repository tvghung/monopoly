import express from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import type { AppServer } from './socket/types';

const { env } = process;
const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Build the Express app, HTTP server, and typed Socket.IO server. In production
// the client is served same-origin (with a SPA fallback), so cross-origin
// requests are disallowed by default; set CORS_ORIGIN to allow another origin.
export function createServer(): { server: HttpServer; io: AppServer } {
  const app = express();
  const server = createHttpServer(app);

  const corsOrigin = env.CORS_ORIGIN
    || (env.NODE_ENV === 'production' ? false : 'http://localhost:5173');

  const io: AppServer = new Server(server, {
    cors: { origin: corsOrigin },
  });

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  if (env.NODE_ENV === 'production') {
    const clientDist = env.CLIENT_DIST
      || path.join(currentDir, '..', '..', 'client', 'dist');
    app.use(express.static(clientDist));
    // SPA fallback: serve index.html for any other GET. Express 5 (path-to-regexp
    // v8) no longer accepts the bare '*' string route, so match with a RegExp.
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return { server, io };
}
