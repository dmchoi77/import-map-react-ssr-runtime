import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/tanstack-start-example.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:42376',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm start:example:tanstack-start',
    env: {
      HOST: '127.0.0.1',
      PORT: '42376',
    },
    url: 'http://127.0.0.1:42376',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
