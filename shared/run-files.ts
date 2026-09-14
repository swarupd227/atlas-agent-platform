/**
 * Files a team run produced, as the DAG engine records them in state under
 * `<stateKey>_files` (see server/dag-execution-engine.ts GENERATED_FILES_STATE_SUFFIX).
 * Shared so the run monitor and tests read them the same way.
 */
/** A file a step produced, as the engine records it under `<stateKey>_files`. */
export interface RunFile { id: string; filename: string | null; mimeType: string | null }

export const FILES_KEY_SUFFIX = "_files";

/**
 * Every file recorded in a step's output or a run's state: `<stateKey>_files`
 * arrays at the top level, and one level down for a nested team step, whose
 * whole state lands under its own key. De-duplicated by id, in order found.
 */
export function collectRunFiles(state: unknown): RunFile[] {
  const found = new Map<string, RunFile>();
  const take = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const f of value) {
      if (f && typeof f === "object" && typeof (f as RunFile).id === "string" && !found.has((f as RunFile).id)) {
        found.set((f as RunFile).id, { id: (f as RunFile).id, filename: (f as RunFile).filename ?? null, mimeType: (f as RunFile).mimeType ?? null });
      }
    }
  };
  if (!state || typeof state !== "object") return [];
  for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
    if (key.endsWith(FILES_KEY_SUFFIX)) take(value);
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerKey.endsWith(FILES_KEY_SUFFIX)) take(innerValue);
      }
    }
  }
  return Array.from(found.values());
}
