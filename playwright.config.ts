import { defineConfig } from '@playwright/test';

/* End-to-end tests run against the production build (single HTML file),
 * served by `vite preview`, in the locally installed Google Chrome. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  },
  webServer: {
    command: 'pnpm run build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
