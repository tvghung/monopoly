import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: 'b4-real-session.spec.ts',
  projects: [{ name: 'mobile-chromium', use: { channel: 'chrome', headless: false, viewport: { width: 1440, height: 900 } } }],
});
