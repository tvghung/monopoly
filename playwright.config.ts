import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // Hosted CI runners have no GPU and fewer cores (software WebGL): twice the time there, and the failures are
  // written as GitHub annotations so a red run says why without opening the log.
  timeout: process.env.CI ? 120_000 : 60_000,
  expect: { timeout: process.env.CI ? 20_000 : 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  globalSetup: './playwright.global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 15'] },
    },
  ],
});
