/**
 * Where a decision goes: the platform settings that route judgment-shaped
 * questions (see server/decision-provider.ts) and the per-organization
 * residency flag that can override them.
 *
 * Runtime flags on this platform are platform_settings rows, not environment
 * variables (routes/astra.ts's ASTRA_WORKSPACE_ENABLED is the model): an admin
 * changes them with PUT /api/platform-settings/:key and they take effect
 * within the cache window, no deploy. The environment's DECISION_PROVIDER is
 * only the bootstrap default for a deployment whose settings row does not
 * exist yet, which is how the Phase 0 shadow measurement keeps running across
 * this change.
 *
 *   DECISION_PROVIDER        llm | shadow | jev          (default: env, else llm)
 *   DECISION_THRESHOLDS      {"review":0.6,"act":0.85}   confidence below which the LLM answers instead
 *   DECISION_SITE_OVERRIDES  {"evaluateCondition":"jev", "handoff":{"mode":"jev","threshold":0.9}}
 *   DECISION_STEP_KIND       on | off                    whether make_decision steps compile to the decision kind
 *
 * An organization whose workspaceConfig.decisionResidency is "no_us" never has
 * its state sent to Jev (US-only processing): its decisions are routed llm
 * whatever the platform says. Organizations with nothing set are treated as
 * allowed -- the default the evaluation doc proposed and the user accepted.
 */
import { storage } from "./storage";

export type DecisionMode = "llm" | "shadow" | "jev";

export interface DecisionThresholds {
  /** Below this the answer is only good enough to flag for a person. */
  review: number;
  /** Below this the LLM answers instead of the decision model. */
  act: number;
}

export interface DecisionSettings {
  mode: DecisionMode;
  thresholds: DecisionThresholds;
  siteOverrides: Record<string, { mode?: DecisionMode; threshold?: number }>;
  stepKind: boolean;
}

export interface DecisionRoute {
  mode: DecisionMode;
  /** The act threshold that applies to this site. */
  threshold: number;
  /** Why the mode is what it is, for the audit row. */
  reason: "platform" | "site_override" | "residency";
}

export const DECISION_SETTING_KEYS = {
  provider: "DECISION_PROVIDER",
  thresholds: "DECISION_THRESHOLDS",
  siteOverrides: "DECISION_SITE_OVERRIDES",
  stepKind: "DECISION_STEP_KIND",
} as const;

export const DEFAULT_THRESHOLDS: DecisionThresholds = { review: 0.6, act: 0.85 };

const CACHE_MS = 30_000;
const MODES: DecisionMode[] = ["llm", "shadow", "jev"];

let settingsCache: { value: DecisionSettings; at: number } | null = null;
const orgCache = new Map<string, { noUs: boolean; at: number }>();

/** For tests and for the settings route after a write. */
export function invalidateDecisionSettingsCache(): void {
  settingsCache = null;
  orgCache.clear();
}

function asMode(value: unknown): DecisionMode | null {
  const v = String(value ?? "").trim().toLowerCase();
  return (MODES as string[]).includes(v) ? (v as DecisionMode) : null;
}

function asFraction(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function parseJson(value: string | undefined | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

async function readSetting(key: string): Promise<string | undefined> {
  const row = await storage.getPlatformSetting(key).catch(() => undefined);
  return row?.value ?? undefined;
}

export async function getDecisionSettings(): Promise<DecisionSettings> {
  if (settingsCache && Date.now() - settingsCache.at < CACHE_MS) return settingsCache.value;
  const [provider, thresholds, overrides, stepKind] = await Promise.all([
    readSetting(DECISION_SETTING_KEYS.provider),
    readSetting(DECISION_SETTING_KEYS.thresholds),
    readSetting(DECISION_SETTING_KEYS.siteOverrides),
    readSetting(DECISION_SETTING_KEYS.stepKind),
  ]);

  const mode = asMode(provider) ?? asMode(process.env.DECISION_PROVIDER) ?? "llm";

  const t = (parseJson(thresholds) ?? {}) as Record<string, unknown>;
  const review = asFraction(t.review) ?? DEFAULT_THRESHOLDS.review;
  const act = asFraction(t.act) ?? DEFAULT_THRESHOLDS.act;

  const siteOverrides: DecisionSettings["siteOverrides"] = {};
  const raw = parseJson(overrides);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [site, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") { const m = asMode(v); if (m) siteOverrides[site] = { mode: m }; continue; }
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const entry: { mode?: DecisionMode; threshold?: number } = {};
        const m = asMode(o.mode); if (m) entry.mode = m;
        const th = asFraction(o.threshold); if (th !== null) entry.threshold = th;
        if (entry.mode || entry.threshold !== undefined) siteOverrides[site] = entry;
      }
    }
  }

  const value: DecisionSettings = {
    mode,
    thresholds: { review, act: Math.max(act, review) },
    siteOverrides,
    stepKind: String(stepKind ?? "").trim().toLowerCase() === "on",
  };
  settingsCache = { value, at: Date.now() };
  return value;
}

async function orgForbidsUs(orgId: string): Promise<boolean> {
  const hit = orgCache.get(orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.noUs;
  const org = await storage.getOrganization(orgId).catch(() => undefined);
  const cfg = (org?.workspaceConfig ?? {}) as Record<string, unknown>;
  const noUs = String(cfg.decisionResidency ?? "").toLowerCase() === "no_us";
  orgCache.set(orgId, { noUs, at: Date.now() });
  return noUs;
}

/**
 * The route for one question. Deterministic: platform mode, then the site's
 * override, then the organization's residency, which wins over both.
 */
export async function resolveDecisionRoute(site: string, orgId?: string | null): Promise<DecisionRoute> {
  const s = await getDecisionSettings();
  let mode = s.mode;
  let threshold = s.thresholds.act;
  let reason: DecisionRoute["reason"] = "platform";
  const override = s.siteOverrides[site];
  if (override) {
    if (override.mode) { mode = override.mode; reason = "site_override"; }
    if (override.threshold !== undefined) threshold = override.threshold;
  }
  if (mode !== "llm" && orgId && (await orgForbidsUs(orgId))) {
    mode = "llm";
    reason = "residency";
  }
  return { mode, threshold, reason };
}
