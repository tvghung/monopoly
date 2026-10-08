import path from 'node:path';
import { access } from 'node:fs/promises';

import { startAuthoritativeServer } from './apps/server/src/authoritativeServer';

export default async function globalSetup() {
  const clientDist = path.join(import.meta.dirname, 'apps', 'client', 'dist');
  await access(clientDist);

  const server = await startAuthoritativeServer({
    environment: {
      NODE_ENV: 'production',
      SERVER_RUNTIME_PROFILE: 'desktop',
      SERVER_HOST: '127.0.0.1',
      PORT: '4173',
    },
    clientDist,
    host: '127.0.0.1',
    port: 4173,
  });

  return async () => {
    await server.shutdown('Playwright teardown');
  };
}
