import * as crypto from "crypto";
import { applyReducer } from "./dag-execution-engine";
import type { StateFieldDef } from "./dag-execution-engine";
import { storage } from "./storage";

function ephemeralTypeDefault(fieldDef: StateFieldDef | undefined): any {
  if (!fieldDef) return null;
  switch (fieldDef.type) {
    case "array": return [];
    case "object": return {};
    case "string": return "";
    default: return null;
  }
}

/**
 * Merge a patch of updates into the current workflow state.
 * Enforces writable_by field-level access control (skip + warn if source unauthorized).
 * Resets ephemeral fields to type-appropriate defaults after merging.
 *
 * @param source  The identifier of the writer (stage label, node ID, "operator",
 *                "interrupt:<id>", etc.). Defaults to "*" (unrestricted).
 */
export function mergeIntoWorkflowState(
  current: Record<string, any>,
  updates: Record<string, any>,
  schemaFields: Record<string, StateFieldDef>,
  source: string = "*",
): { merged: Record<string, any>; ephemeralKeys: string[] } {
  const merged = { ...current };
  const ephemeralKeys: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const fieldDef = schemaFields[key];

    if (fieldDef?.writable_by && fieldDef.writable_by.length > 0) {
      const allowed = fieldDef.writable_by;
      if (!allowed.includes("*") && !allowed.includes(source)) {
        console.warn(
          `[UWS] "${source}" cannot write field "${key}" (writable_by: [${allowed.join(", ")}]). Skipping.`,
        );
        continue;
      }
    }

    const reducer = fieldDef?.reducer ?? "last_wins";
    merged[key] = applyReducer(merged[key], value, reducer);
    if (fieldDef?.ephemeral) ephemeralKeys.push(key);
  }

  for (const key of ephemeralKeys) {
    merged[key] = ephemeralTypeDefault(schemaFields[key]);
  }

  return { merged, ephemeralKeys };
}

export function sanitizeForCheckpoint(
  state: Record<string, any>,
  schemaFields: Record<string, StateFieldDef>,
): Record<string, any> {
  const sanitized = { ...state };
  for (const [key, fieldDef] of Object.entries(schemaFields)) {
    if (fieldDef.sanitize) delete sanitized[key];
  }
  return sanitized;
}

export async function writeStageCompleteCheckpoint(
  pipelineRunId: string,
  stageId: string,
  _stageLabel: string,
  _stageType: string,
  currentState: Record<string, any>,
  schemaFields: Record<string, StateFieldDef>,
): Promise<void> {
  const sanitized = sanitizeForCheckpoint(currentState, schemaFields);
  const stateHash = crypto.createHash("sha256").update(JSON.stringify(sanitized)).digest("hex");
  await storage.createWorkflowCheckpoint({
    pipelineRunId,
    trigger: "stage_complete",
    triggerStageId: stageId || undefined,
    stateJson: sanitized,
    stateHash,
    interruptResponded: false,
  });
}
