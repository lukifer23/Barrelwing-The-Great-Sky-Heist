import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  expect: { timeout: 5000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
