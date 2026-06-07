import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.E2E_WEB_PORT ?? "3200";
const apiPort = process.env.E2E_API_PORT ?? "3201";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;
const apiBaseURL = process.env.E2E_API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;
const shouldStartWebServer = process.env.E2E_SKIP_WEBSERVER !== "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" },
    },
  ],
  webServer: shouldStartWebServer
    ? {
        command: "node scripts/dev.mjs",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          WEB_PORT: webPort,
          API_PORT: apiPort,
          NEXT_PUBLIC_API_BASE_URL: apiBaseURL,
          AI_PROVIDER_MODE: "mock",
          AI_MODEL: "mock-model",
        },
      }
    : undefined,
});
