import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Existing mobile gameplay/audio assertions, using the Chrome installed on this Windows validation host.
export default defineConfig({
  ...base,
  outputDir: './test-results/powerup-08b/mobile',
  testMatch: 'mobile-host.spec.ts',
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'], launchOptions: { executablePath: process.env.POWERUP_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, headless: true } }],
});
