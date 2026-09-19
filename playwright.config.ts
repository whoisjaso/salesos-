import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Role-based journey tests. Runs against the production build so the pages
 * behave exactly as they ship (static export, client-side session).
 */
const PORT = 3877;
const BASE_URL = `http://localhost:${PORT}`;

// The CI image keeps browsers outside the project; honour it when present.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/opt/pw-browsers")) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["iPhone 14"],
        // Only Chromium is installed; keep the iPhone metrics but not its WebKit default.
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        // Short timers in the call state machines (reducedMotion collapses the simulated provider delays).
        // Not a top-level test option, so it goes through contextOptions.
        contextOptions: { reducedMotion: "reduce" },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
