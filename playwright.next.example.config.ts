import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = 42177;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/next-example.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://${host}:${port}`,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm start:example:next',
    url: `http://${host}:${port}`,
    env: {
      HOST: host,
      PORT: String(port),
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
