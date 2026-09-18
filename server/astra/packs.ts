/**
 * Studio packs: groups of Astra tools loaded only when a conversation needs
 * them, so the model isn't handed every tool on every turn. Core tools (no
 * `pack`) are always offered; a pack's tools join once the model calls
 * load_tools for it, and stay for the rest of the thread (Checkpoint.loadedPacks).
 */

export const LOAD_TOOLS = "load_tools";

export const PACKS = [
  { id: "governance", label: "Governance", description: "Which policies apply to an agent, installing and binding policies, governance readiness, verifying the audit chain, regulatory exam packages." },
  { id: "evaluation", label: "Evaluation", description: "Eval datasets and runs: run an agent's evaluation, follow it, compare with the previous run, explain failures." },
  { id: "deploy", label: "Deploy & Operate", description: "Deploy an agent, promote it through staging, pilot and production, shift canary or shadow traffic, roll back, check health and incidents." },
  { id: "knowledge", label: "Skills & Knowledge", description: "Find and attach skills; create knowledge bases, add sources, search them, attach them to agents." },
] as const;

export type PackId = (typeof PACKS)[number]["id"];

export const PACK_IDS: readonly string[] = PACKS.map((p) => p.id);

export function isPackId(value: unknown): value is PackId {
  return typeof value === "string" && PACK_IDS.includes(value);
}

/** Tools offered this turn: core tools plus those of loaded packs. */
export function inLoadedPacks(tool: { pack?: string }, loaded: readonly string[] | undefined): boolean {
  return !tool.pack || (loaded ?? []).includes(tool.pack);
}
