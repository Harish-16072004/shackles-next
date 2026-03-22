import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/shackles_symposium",
      SESSION_SECRET: process.env.SESSION_SECRET || "phase4-e2e-session-secret-which-is-at-least-32-chars",
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || "local",
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || `http://127.0.0.1:${port}`,
      SMTP_HOST: process.env.SMTP_HOST || "localhost",
      SMTP_PORT: process.env.SMTP_PORT || "1025",
      SMTP_SECURE: process.env.SMTP_SECURE || "false",
      SMTP_USER: process.env.SMTP_USER || "test-user",
      SMTP_PASS: process.env.SMTP_PASS || "test-pass",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
