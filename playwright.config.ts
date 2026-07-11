import { defineConfig } from '@playwright/test';

// Puerto y secretos de prueba (NO los de producción). La DB es un fichero aislado.
const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
const TEST_AUTH_SECRET = 'e2e-secret-no-prod';
const TEST_ADMIN_EMAIL = 'e2e-admin@test.com';
const TEST_CRON_SECRET = 'e2e-cron-secret';
const TEST_SUPER_ADMIN_EMAIL = 'e2e-super@test.com';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // comparten una DB de fichero; en serie evita carreras
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    // Borra la DB y arranca el dev server con env de prueba. La DB la crean las migraciones del globalSetup.
    command: `rm -f e2e/test.db && TURSO_DATABASE_URL=file:./e2e/test.db TURSO_AUTH_TOKEN= AUTH_SECRET=${TEST_AUTH_SECRET} ADMIN_EMAIL=${TEST_ADMIN_EMAIL} CRON_SECRET=${TEST_CRON_SECRET} SUPER_ADMIN_EMAILS=${TEST_SUPER_ADMIN_EMAIL} npm run dev:e2e`,
    // Readiness contra un endpoint sin DB (el manifest es estático): evita el huevo-y-gallina con las migraciones.
    url: `${BASE_URL}/manifest.webmanifest`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

export const TEST_ENV = { AUTH_SECRET: TEST_AUTH_SECRET, ADMIN_EMAIL: TEST_ADMIN_EMAIL, SUPER_ADMIN_EMAIL: TEST_SUPER_ADMIN_EMAIL, DB_URL: 'file:./e2e/test.db', CRON_SECRET: TEST_CRON_SECRET };
