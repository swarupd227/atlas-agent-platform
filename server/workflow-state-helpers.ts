import * as crypto from "crypto";
import { applyReducer } from "./dag-execution-engine";
import type { StateFieldDef } from "./dag-execution-engine";
import { storage } from "./storage";

export function mergeIntoWorkflowState(
  current: Record<string, any>,
  updates: Record<string, any>,
  schemaFields: Record<string, StateFieldDef>,
): { merged: Record<string, any>; ephemeralKeys: string[] } {
  const merged = { ...current };
  const ephemeralKeys: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const fieldDef = schemaFields[key];
    const reducer = fieldDef?.reducer ?? "last_wins";
    merged[key] = applyReducer(merged[key], value, reducer);
    if (fieldDef?.ephemeral) ephemeralKeys.push(key);
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
