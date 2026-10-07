import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/react-router-example.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:42276',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm start:example:react-router',
    env: {
      HOST: '127.0.0.1',
      PORT: '42276',
    },
    url: 'http://127.0.0.1:42276',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
