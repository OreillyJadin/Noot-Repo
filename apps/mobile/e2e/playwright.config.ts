// Web E2E smoke: the static web export + the local Supabase stack (and its Edge Functions).
// Run from apps/mobile: `pnpm build:web && pnpm e2e:web`. CI does the same (ci.yml → web-e2e).
import { defineConfig, devices } from '@playwright/test';

const PORT = 8081;

export default defineConfig({
  testDir: '.',
  globalSetup: './setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'report' }]] : 'list',
  outputDir: 'results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node e2e/serve.mjs dist ${PORT}`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
