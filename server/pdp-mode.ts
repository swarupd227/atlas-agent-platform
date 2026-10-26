/**
 * The switch for the policy decision point rollout (S0.2): whether the new PDP
 * (server/policy-decision.ts) only runs beside today's code as a comparison.
 *
 *   PDP_MODE           legacy (default) | shadow. "unified" -- the PDP deciding
 *                      for real -- is refused until it is wired in (C4), so the
 *                      setting can never name a mode that does nothing.
 *   PDP_SHADOW_SAMPLE  fraction of calls compared in shadow mode, 0..1 (default 1).
 *
 * Platform settings first (PUT /api/platform-settings/:key, platform admins only,
 * audited), then an environment variable of the same name. Read through a
 * 30-second cache, as decision-settings.ts does. A stored value this module does
 * not recognise reads as legacy: a typo must never switch anything on.
 */
import { storage } from "./storage";

export type PdpMode = "legacy" | "shadow";
export interface PdpSettings { mode: PdpMode; sample: number }

export const PDP_SETTING_KEYS = { mode: "PDP_MODE", sample: "PDP_SHADOW_SAMPLE" } as const;

const MODES: PdpMode[] = ["legacy", "shadow"];
const CACHE_MS = 30_000;
let cache: { value: PdpSettings; at: number } | null = null;

/** Why a value for a PDP setting is refused, or null when it is fine (or not a PDP setting). */
export function validatePdpSetting(key: string, value: string | null | undefined): string | null {
  if (key === PDP_SETTING_KEYS.mode) {
    const v = String(value ?? "").trim().toLowerCase();
    if (v === "unified") return `${key}=unified is not available yet: the policy decision point is not wired in. Use legacy or shadow.`;
    if (!(MODES as string[]).includes(v)) return `${key} must be one of ${MODES.join(", ")} (got "${value ?? ""}")`;
  }
  if (key === PDP_SETTING_KEYS.sample) {
    const n = Number(value);
    if (String(value ?? "").trim() === "" || !Number.isFinite(n) || n < 0 || n > 1) return `${key} must be a number from 0 to 1 (got "${value ?? ""}")`;
  }
  return null;
}

/** For tests, and after a settings write. */
export function invalidatePdpSettingsCache(): void { cache = null; }

async function readSetting(key: string): Promise<string | undefined> {
  // A storage without platform settings (a test's mock, a boot before the table
  // exists) reads as unset, never as an error.
  try {
    const row = await (storage as { getPlatformSetting?: (k: string) => Promise<{ value?: string | null } | undefined> }).getPlatformSetting?.(key);
    return row?.value ?? undefined;
  } catch {
    return undefined;
  }
}

const asMode = (v: unknown): PdpMode | null => {
  const s = String(v ?? "").trim().toLowerCase();
  return (MODES as string[]).includes(s) ? (s as PdpMode) : null;
};
const asSample = (v: unknown): number | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};

export async function getPdpSettings(): Promise<PdpSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const [mode, sample] = await Promise.all([readSetting(PDP_SETTING_KEYS.mode), readSetting(PDP_SETTING_KEYS.sample)]);
  const value: PdpSettings = {
    mode: asMode(mode) ?? (mode === undefined ? asMode(process.env.PDP_MODE) : null) ?? "legacy",
    sample: asSample(sample) ?? asSample(process.env.PDP_SHADOW_SAMPLE) ?? 1,
  };
  cache = { value, at: Date.now() };
  return value;
}
