import { defineConfig } from "vitest/config";
import path from "path";

/**
 * The config CI runs the unit suite under (despite the "integration" name --
 * renaming it would break .github/workflows/ci.yml and is not worth the churn).
 *
 * The timeouts and the fork cap below exist for one specific reason, and it is
 * not "these tests are slow".
 *
 * Several server modules import their heavy dependencies lazily, inside the
 * function that needs them -- server/file-extract.ts pulls in jszip, cheerio,
 * pdf-parse and mammoth this way; server/tool-dispatcher.ts pulls in
 * ./builtin-document-tools. That is the right call for production (a request
 * that never touches a PDF never pays for pdf-parse), but it means the cost of
 * resolving and transforming those modules is charged to whichever TEST first
 * crosses the import -- inside that test's timeout.
 *
 * Vitest gives each test file its own worker, and workers do not share Vite's
 * transform cache, so every worker re-transforms the same heavy modules. On a
 * 22-core machine that is ~11 workers doing the same expensive work at once:
 * measured on this repo, aggregate import time went from 27s serial to 344s
 * parallel and transform from 1.8s to 88s, while a single gated tool dispatch
 * reported executionMs: 33139 -- 33 seconds inside one `it`.
 *
 * The failures that produced were always the FIRST test in a file to cross a
 * lazy import (the second test in the same file passed on the warm cache), they
 * varied run to run, and they were all "Test timed out", never an assertion.
 * A suite that fails differently each run cannot tell you when something real
 * breaks, so:
 *
 * - maxForks caps the duplicated transform work rather than letting it scale
 *   with core count. Fewer workers means each one reuses its cache across more
 *   files. This addresses the cause; the timeout below is the safety margin.
 * - testTimeout absorbs a cold import on a loaded machine. 60s looks absurd for
 *   a unit test and is: the worst case measured here was a single gated
 *   dispatch reporting executionMs 52579, because tool-dispatcher's lazy
 *   `await import("./builtin-document-tools")` drags in ./storage and with it
 *   the whole data layer. The same test runs in under 2s in a warm worker. The
 *   ceiling is sized for the cold tail, and still fails a genuinely hung test.
 *
 * Pre-warming those imports in a setupFile would be the tidier fix, but setup
 * runs before test files register their vi.mock calls, so warming ./storage or
 * ./db would import the real modules into the worker ahead of the mocks. Not
 * worth trading flaky timeouts for flaky mocks.
 *
 * The real fix is upstream: if server/tool-dispatcher.ts stops reaching through
 * builtin-document-tools into ./storage, the cold tail goes with it. Until
 * then, lower these numbers whenever the imports get cheaper.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    poolOptions: {
      forks: { maxForks: 4 },
    },
  },
});
