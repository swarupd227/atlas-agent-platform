import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration — hybrid API + browser E2E tests.
 *
 * Chromium requires several shared libraries that are not on the default
 * library path in Replit's NixOS container.  We supply them via
 * launchOptions.env.LD_LIBRARY_PATH so Playwright can launch the headless
 * Chrome shell without installing system-wide deps.
 *
 * Library paths are obtained via `nix-build '<nixpkgs>' -A <pkg> --no-out-link`
 * and may change after a container restart / nix-channel update.
 * Re-run that command for any path that stops working.
 *
 * Target: https://atlas-agent-platform.replit.app  (demo mode — no auth)
 */

const N = "/nix/store";

// All nix store paths that Playwright's chromium-headless-shell requires.
// Determined by `ldd chrome-headless-shell | grep "not found"` in Replit NixOS.
// Single source-of-truth: update here when container is rebuilt.
const CHROMIUM_LIB_PATH = [
  `${N}/c2v6ycn0sjcpx9ww8x7j4ima6xnpssry-glib-2.80.2/lib`,               // libglib-2.0, libgio, libgobject
  `${N}/lr06m26d9qh6ssa3x5zx2ll33wm44xid-nss-3.90.2/lib`,                // libnss3, libnssutil3
  `${N}/8a651pfg6s4z27j274baqqb57pp34jkf-nspr-4.35/lib`,                 // libnspr4
  `${N}/jd41k79l3nxq4b7b7yvc0kmcjd3lq7sa-dbus-1.14.10-lib/lib`,         // libdbus-1 (dbus.lib output)
  `${N}/6rigmq2ycbpgywmq9jjyhdr6vs8k8h8x-at-spi2-core-2.52.0/lib`,      // libatk-1.0, libatk-bridge-2.0, libatspi
  `${N}/x9fw7rbdb34gq0f8q750kw344lbv9nk1-libX11-1.8.9/lib`,              // libX11
  `${N}/y16mr4fhn8a8snp5177a6aznq42ci22c-libXcomposite-0.4.6/lib`,       // libXcomposite
  `${N}/2y8irckx5v4fav7r7p9ghaz7rbwdmfb2-libXdamage-1.1.6/lib`,         // libXdamage
  `${N}/gbjygp4wz7b5rgayckmqfc00hy34dqfn-libXext-1.3.6/lib`,             // libXext
  `${N}/1jjjvxa4v0qqjhlc9ig3j6ljdlskm2kr-libXfixes-6.0.1/lib`,          // libXfixes
  `${N}/2rq584mkybbbvm1ciyams5s2lh8cdq32-libXrandr-1.5.4/lib`,           // libXrandr
  `${N}/18kar5zwp16xyppfmigq92xzm1pkcqf1-libxcb-1.17.0/lib`,             // libxcb
  `${N}/0g7r7krqiz6g3nb3651sfa5myd9gqkzf-alsa-lib-1.2.11/lib`,           // libasound
  `${N}/1mv469gq5n0l32cb2lam7mkfl9s22dlg-libxkbcommon-1.7.0/lib`,        // libxkbcommon
  `${N}/f3bmrmcdxxgxzsh8pgwg49z2zhfs9qfq-mesa-24.0.7/lib`,               // libgbm
].join(":");

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  timeout: 10 * 60 * 1000,   // 10 min: LLM eval + polling + UI interactions
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "https://atlas-agent-platform.replit.app",
    extraHTTPHeaders: { "Content-Type": "application/json" },
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          env: { LD_LIBRARY_PATH: CHROMIUM_LIB_PATH },
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
});
