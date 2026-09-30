import { defineConfig } from '@playwright/test';

// Visual evidence capture (not an assertion suite): `pnpm visual:capture`.
// It drives the dev-only Phase 4 UAT harness / Design Lab, so it needs no database and no
// global setup. Set VISUAL_BROWSER_CHANNEL=chrome|msedge to reuse an installed browser
// instead of the Playwright-managed Chromium; set VISUAL_HEADED=1 when headless WebGL fails.
const channel = process.env.VISUAL_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: './e2e/visual',
  testMatch: '**/*.visual.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: process.env.VISUAL_HEADED !== '1',
    ...(channel ? { channel } : {}),
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [{ name: 'visual-chromium' }],
  webServer: {
    command: 'pnpm --filter @monopoly/client exec vite --mode phase4-uat',
    url: 'http://127.0.0.1:5173/?phase4-uat=1',
    env: { VITE_PHASE4_UAT: '1' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
