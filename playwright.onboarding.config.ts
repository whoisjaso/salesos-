import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Temporary override: same projects, own port, no rebuild (the build already ran). Not committed. */
const PORT = 3911;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: BASE_URL },
  webServer: { command: `npm run start -- -p ${PORT}`, url: BASE_URL, reuseExistingServer: true, timeout: 120_000 },
});
