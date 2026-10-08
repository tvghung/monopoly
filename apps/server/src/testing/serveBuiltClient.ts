import path from 'node:path';
import express from 'express';

/**
 * Browser E2E helper: serve a built client from the same origin as the Socket.IO server.
 * The product never does this in the development profile (the Vite dev server does), and the
 * desktop profile has its own rate-limited static root; this is only for Playwright's harness.
 */
export function serveBuiltClient(app: express.Express, clientDist: string): void {
  const root = path.resolve(clientDist);
  app.use(express.static(root, { dotfiles: 'deny' }));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(root, 'index.html'));
  });
}
