import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration — hybrid API + browser E2E tests.
 *
 * Chromium requires several shared libraries that are not on the default
 * library path in Replit's NixOS container.  We supply them via
 * launchOptions.env.LD_LIBRARY_PATH so Playwright can launch the headless
 * Chrome shell without installing system-wide deps.
 *
 * Target: https://atlas-agent-platform.replit.app  (demo mode — no auth)
 */

const NIX = "/nix/store";

// All nix store paths that Playwright's chromium-headless-shell requires.
// Determined by ldd + iterative resolution in the Replit NixOS stable-24_05 env.
const CHROMIUM_LIB_PATH = [
  `${NIX}/c2v6ycn0sjcpx9ww8x7j4ima6xnpssry-glib-2.80.2/lib`,          // libglib-2.0.so.0
  `${NIX}/lr06m26d9qh6ssa3x5zx2ll33wm44xid-nss-3.90.2/lib`,            // libnss3.so, libnssutil3.so
  `${NIX}/8a651pfg6s4z27j274baqqb57pp34jkf-nspr-4.35/lib`,             // libnspr4.so
  `${NIX}/jd41k79l3nxq4b7b7yvc0kmcjd3lq7sa-dbus-1.14.10-lib/lib`,     // libdbus-1.so.3
  `${NIX}/jj3qn3wbzjqvwnz5cmhkc949r5iv783s-libxkbcommon-1.3.0/lib`,   // libxkbcommon.so.0
  `${NIX}/1bmhxjz5bjpdsn68hwkbr8rscmi68j3w-atk-2.36.0/lib`,           // libatk-1.0.so.0
  `${NIX}/4knwrajbbpnfzqgqw54s8zlv5sncm5dp-at-spi2-atk-2.38.0/lib`,   // libatk-bridge-2.0.so.0
  `${NIX}/6rigmq2ycbpgywmq9jjyhdr6vs8k8h8x-at-spi2-core-2.52.0/lib`,  // libatspi.so.0
  `${NIX}/k4n7c5m82dvh51ym88n6f2aws8m90g0m-libX11-1.7.2/lib`,         // libX11.so.6
  `${NIX}/8arzrsr4smih7l52hmvmxsjwrvkcrsgp-libXcomposite-0.4.5/lib`,  // libXcomposite.so.1
  `${NIX}/hg241r4rpf8djryryxj6ylfngl6zaxsh-libXdamage-1.1.5/lib`,    // libXdamage.so.1
  `${NIX}/pqbf78jqja4i0804d8f810nkic9y9ahx-libXext-1.3.4/lib`,        // libXext.so.6
  `${NIX}/drg97qy1sqw4zk2zbvn2f398vzrm5f8x-libXfixes-6.0.0/lib`,     // libXfixes.so.3
  `${NIX}/6hfav2jxqfj9m0i9gz17yndpd5ws10bn-libXrandr-1.5.2/lib`,     // libXrandr.so.2
  `${NIX}/vh35dr1f33gxn05y50vqzc5zqgjfpn07-libxcb-1.14/lib`,          // libxcb.so.1
  `${NIX}/39bjnqk8l13bn1xnq1bc1baf3z957rkh-alsa-lib-1.2.5.1/lib`,    // libasound.so.2
  `${process.env.HOME}/.nix-profile/lib`,                               // libgbm.so.1 (mesa)
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
