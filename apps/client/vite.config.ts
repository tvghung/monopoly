import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies socket.io traffic to the backend so the browser talks to a
// single origin (no CORS in dev). In production the built app is served by the
// same Express server, so it is same-origin there too.
//
// The socket URL is injected as the global __SOCKET_URL__ (empty string => the
// client connects to the same origin as the page). Set VITE_SOCKET_URL in a
// .env file or the environment only when the client and server are hosted apart.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), 'VITE_');
  const { env: processEnv } = process;
  const socketUrl = fileEnv.VITE_SOCKET_URL || processEnv.VITE_SOCKET_URL || '';
  const phase4Uat = (fileEnv.VITE_PHASE4_UAT || processEnv.VITE_PHASE4_UAT) === '1';
  const phase4UatModule = '\0virtual:phase4-uat';

  return {
    plugins: [
      react(),
      {
        name: 'phase4-uat-gate',
        resolveId(id) {
          return id === 'virtual:phase4-uat' ? phase4UatModule : null;
        },
        load(id) {
          if (id !== phase4UatModule) return null;
          return phase4Uat
            ? 'export { default } from "/src/dev/phase4-uat/Phase4UatHarness.tsx";'
            : 'export default function Phase4UatUnavailable() { return null; }';
        },
      },
    ],
    define: {
      __SOCKET_URL__: JSON.stringify(socketUrl),
      __PHASE4_UAT__: JSON.stringify(phase4Uat),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/socket.io': {
          target: 'http://127.0.0.1:8080',
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
