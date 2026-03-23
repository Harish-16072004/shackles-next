import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const port = 3100;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000,
    reuseExistingServer: !isCI,
    env: {
      DATABASE_URL:
        process.env.PLAYWRIGHT_DATABASE_URL ||
        process.env.DATABASE_URL ||
        "postgresql://localhost:5432/shackles_symposium?schema=public",
      SESSION_SECRET:
        process.env.PLAYWRIGHT_SESSION_SECRET ||
        process.env.SESSION_SECRET ||
        "local-e2e-session-secret-change-me-32chars",
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || "local",
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || `http://127.0.0.1:${port}`,
      SMTP_HOST: process.env.SMTP_HOST || "localhost",
      SMTP_PORT: process.env.SMTP_PORT || "1025",
      SMTP_SECURE: process.env.SMTP_SECURE || "false",
      SMTP_USER: process.env.PLAYWRIGHT_SMTP_USER || process.env.SMTP_USER || "local-e2e-user",
      SMTP_PASS: process.env.PLAYWRIGHT_SMTP_PASS || process.env.SMTP_PASS || "local-e2e-pass",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
