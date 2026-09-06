import { PNG } from "pngjs";
import * as pixelmatchModule from "pixelmatch";
import { promises as fs } from "fs";
import path from "path";

// pixelmatch ships as a single CommonJS `module.exports = function`, not a
// named/default export -- verified live, `import pixelmatch from "pixelmatch"`
// bundled (esbuild's CJS interop) to a reference whose actual callable landed
// somewhere other than a plain call, throwing "(0, Tie.default) is not a
// function" the first time this ran against a real screenshot. Resolving
// defensively against both possible shapes avoids depending on exactly how
// the bundler wraps a given CJS module in this build.
const pixelmatch = ((pixelmatchModule as any).default ?? pixelmatchModule) as (
  img1: Uint8Array, img2: Uint8Array, output: Uint8Array | null, width: number, height: number, options?: Record<string, unknown>
) => number;

// Same convention as tool-dispatcher.ts's MCP_EVIDENCE_MOUNT_PATH -- a
// subdirectory of Playwright MCP's own working directory, shared with the
// App Service via provision-playwright-mcp.sh's Azure Files mount.
const MCP_EVIDENCE_MOUNT_PATH = process.env.MCP_EVIDENCE_MOUNT_PATH || "/home/node/mcp-evidence";
const BASELINE_SUBDIR = "baselines";

// Anything below this is treated as noise (a live timestamp, a promotional
// banner, anti-aliasing jitter) rather than a real visual regression --
// matches the Journey Catalog skill's own guidance that a pixel difference
// alone isn't a failure. Chosen as a starting default, not derived from any
// real Kinective UI yet (none exists in this environment) -- revisit once
// real journeys are running against real screens.
export const DEFAULT_DIFF_THRESHOLD_PERCENT = 2;

export interface BaselineCompareResult {
  /** false the first time this journey+step is ever captured -- there was nothing to compare against, and this capture became the baseline. */
  baselineExisted: boolean;
  /** null only when baselineExisted is false. */
  diffPercent: number | null;
  diffPixels: number;
  totalPixels: number;
  /** true when the two images aren't even the same dimensions -- pixelmatch can't run, reported as maximally different rather than skipped or crashed. */
  dimensionMismatch: boolean;
}

/**
 * Filenames the Journey Catalog skill requires: "mcp-evidence/<journey-slug>__<step-name>.png".
 * Parses that back into its parts so the baseline lookup key doesn't need a
 * separate argument threaded through the tool call.
 */
export function parseJourneyStepFromFilename(filename: string): { journeySlug: string; stepName: string } | null {
  const base = filename.replace(/^mcp-evidence\//, "").replace(/\.[a-zA-Z0-9]+$/, "");
  const sepIdx = base.indexOf("__");
  if (sepIdx === -1) return null;
  return { journeySlug: base.slice(0, sepIdx), stepName: base.slice(sepIdx + 2) };
}

export function baselineFilename(journeySlug: string, stepName: string): string {
  return `mcp-evidence/${BASELINE_SUBDIR}/${journeySlug}__${stepName}.png`;
}

function baselineMountPath(journeySlug: string, stepName: string): string {
  return path.join(MCP_EVIDENCE_MOUNT_PATH, BASELINE_SUBDIR, `${journeySlug}__${stepName}.png`);
}

/**
 * Reads the current baseline file (if any) for this journey+step directly
 * off the shared Azure Files mount and pixel-diffs it against the new
 * capture. Real comparison -- pixelmatch/pngjs, not a placeholder number --
 * since a fabricated diffPercent would be exactly the kind of thing this
 * whole engagement has been built to avoid.
 *
 * Does NOT persist anything itself (no baseline promotion here) -- the first
 * capture for a journey+step is written as the baseline by the caller
 * (tool-dispatcher.ts), and a later promotion happens explicitly when a
 * human approves a ui_baseline_diff approval (routes/governance.ts).
 */
export async function compareAgainstBaseline(journeySlug: string, stepName: string, newContent: Buffer): Promise<BaselineCompareResult> {
  const bPath = baselineMountPath(journeySlug, stepName);
  let baselineBuf: Buffer | null = null;
  try {
    baselineBuf = await fs.readFile(bPath);
  } catch {
    baselineBuf = null;
  }

  if (!baselineBuf) {
    await fs.mkdir(path.dirname(bPath), { recursive: true });
    await fs.writeFile(bPath, newContent);
    return { baselineExisted: false, diffPercent: null, diffPixels: 0, totalPixels: 0, dimensionMismatch: false };
  }

  let baselinePng: PNG;
  let newPng: PNG;
  try {
    baselinePng = PNG.sync.read(baselineBuf);
    newPng = PNG.sync.read(newContent);
  } catch (err: any) {
    throw new Error(`Failed to decode PNG for baseline comparison: ${err.message}`);
  }

  if (baselinePng.width !== newPng.width || baselinePng.height !== newPng.height) {
    return { baselineExisted: true, diffPercent: 100, diffPixels: -1, totalPixels: -1, dimensionMismatch: true };
  }

  const { width, height } = baselinePng;
  const totalPixels = width * height;
  const diffPng = new PNG({ width, height });
  const diffPixels = pixelmatch(baselinePng.data, newPng.data, diffPng.data, width, height, { threshold: 0.1 });
  const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;

  return { baselineExisted: true, diffPercent, diffPixels, totalPixels, dimensionMismatch: false };
}

export function exceedsThreshold(diffPercent: number | null, thresholdPercent = DEFAULT_DIFF_THRESHOLD_PERCENT): boolean {
  return diffPercent !== null && diffPercent > thresholdPercent;
}

/** Overwrites the stored baseline with a newly-approved capture's bytes. */
export async function promoteToBaseline(journeySlug: string, stepName: string, newContent: Buffer): Promise<void> {
  const bPath = baselineMountPath(journeySlug, stepName);
  await fs.mkdir(path.dirname(bPath), { recursive: true });
  await fs.writeFile(bPath, newContent);
}
