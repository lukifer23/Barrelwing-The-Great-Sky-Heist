import { defineConfig } from '@playwright/test';

const production = process.env.BARRELWING_PRODUCTION === '1';
const port = production ? 4173 : 5173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  expect: { timeout: 5000 },
  workers: 1,
  use: { baseURL, headless: true, viewport: { width: 1280, height: 720 } },
  webServer: {
    command: production ? 'npm run preview -- --host 127.0.0.1 --strictPort' : 'npm run dev -- --host 127.0.0.1',
    url: baseURL, reuseExistingServer: !production,
  },
});
