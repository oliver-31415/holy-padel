import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const PORT = 8092;
const { CI } = process.env;

/**
 * E2E suite against the Expo web build. Every test runs in a fresh browser
 * context, which means a fresh OPFS — so each test starts from the exact
 * seeded demo database.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI !== undefined,
  retries: CI === undefined ? 0 : 2,
  // Small runners (CI and a laptop running Metro alongside): cap parallelism so
  // the sqlite worker and the dev server keep up. `--workers` still overrides.
  workers: 2,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: CI === undefined ? "list" : "github",
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    viewport: { width: 402, height: 874 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Keep the phone viewport — the device preset would override it.
      use: { ...devices["Desktop Chrome"], viewport: { width: 402, height: 874 } },
    },
  ],
  webServer: {
    command: `npx expo start --offline --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: CI === undefined,
    // The e2e fixture ledger — real installs never seed demo data. The mock
    // watch count exercises the "Synced — N watches connected" UI on web.
    // The heap cap keeps Metro from ballooning on long local runs.
    env: {
      EXPO_PUBLIC_SEED_DEMO: "1",
      EXPO_PUBLIC_MOCK_WATCH_COUNT: "2",
      NODE_OPTIONS: "--max-old-space-size=6144",
    },
    // Metro's first cold bundle on a CI runner can take several minutes.
    timeout: 420_000,
  },
});
