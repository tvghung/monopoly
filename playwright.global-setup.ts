import path from 'node:path';
import { access } from 'node:fs/promises';

import { startAuthoritativeServer } from './apps/server/src/authoritativeServer';
import { serveBuiltClient } from './apps/server/src/testing/serveBuiltClient';

export default async function globalSetup() {
  const clientDist = path.join(import.meta.dirname, 'apps', 'client', 'dist');
  await access(clientDist);

  // The browser flows create their own room (the first player becomes Host), which only the development
  // profile allows: in the desktop profile just the Electron Host holds the room-creation capability. Desktop
  // authorization is proven by the server integration tests and the packaged Host proof, not by this UI run.
  const server = await startAuthoritativeServer({
    environment: {
      NODE_ENV: 'production',
      SERVER_RUNTIME_PROFILE: 'development',
      SERVER_HOST: '127.0.0.1',
      PORT: '4173',
    },
    host: '127.0.0.1',
    port: 4173,
    configureApp: (app) => serveBuiltClient(app, clientDist),
  });

  return async () => {
    await server.shutdown('Playwright teardown');
  };
}
