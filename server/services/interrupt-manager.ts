import crypto from "crypto";
import { storage } from "../storage";
import type {
  InterruptDefinition,
  InterruptAction,
  InterruptResponseField,
  InterruptStateInjectionEntry,
  InterruptActionRouting,
} from "@shared/schema";

export interface FireInterruptResult {
  instanceId: string;
  checkpointId: string;
  interruptId: string;
  allowedActions: InterruptAction[];
}

export interface ResumeInterruptResult {
  routingOutcome: "next_stage" | "loop_back" | "goto_stage" | "complete" | "loop_capped";
  targetStageId: string | null;
  loopIteration: number;
  stateUpdates: Record<string, unknown>;
  validationErrors: string[];
  respondedAction: string;
}

function applyTransform(
  value: unknown,
  transform: InterruptStateInjectionEntry["transform"],
): unknown {
  switch (transform) {
    case "stringify":    return String(value);
    case "parse_number": return Number(value);
    case "parse_bool":   return value === "true" || value === true || value === 1;
    default:             return value;
  }
}

function validateResponseFields(
  fields: InterruptResponseField[],
  data: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const val = data[field.key];
    if (field.required && (val === undefined || val === null || val === "")) {
      errors.push(`Field "${field.label || field.key}" is required.`);
      continue;
    }
    if (val === undefined || val === null) continue;
    if (field.type === "number" && isNaN(Number(val))) {
      errors.push(`Field "${field.label || field.key}" must be a number.`);
    }
    if (field.type === "select" && field.options && !field.options.includes(String(val))) {
      errors.push(`Field "${field.label || field.key}" must be one of: ${field.options.join(", ")}.`);
    }
    if (field.type === "multi_select" && field.options) {
      const vals: unknown[] = Array.isArray(val) ? val : [val];
      const invalid = vals.map(String).filter((v) => !field.options!.includes(v));
      if (invalid.length > 0) {
        errors.push(`Field "${field.label || field.key}" contains invalid options: ${invalid.join(", ")}.`);
      }
    }
  }
  return errors;
}

function resolveRoutingOutcome(
  routing: InterruptActionRouting | null,
  loopIteration: number,
  maxLoops: number,
  loopBackEnabled: boolean,
): {
  outcome: ResumeInterruptResult["routingOutcome"];
  targetStageId: string | null;
} {
  if (!routing) return { outcome: "next_stage", targetStageId: null };

  switch (routing.type) {
    case "complete":
      return { outcome: "complete", targetStageId: null };
    case "goto_stage":
      return { outcome: "goto_stage", targetStageId: routing.targetStageId ?? null };
    case "loop_back": {
      if (!loopBackEnabled) {
        return { outcome: "next_stage", targetStageId: null };
      }
      if (loopIteration >= maxLoops) {
        return { outcome: "loop_capped", targetStageId: null };
      }
      return { outcome: "loop_back", targetStageId: routing.targetStageId ?? null };
    }
    case "next_stage":
    default:
      return { outcome: "next_stage", targetStageId: null };
  }
}

/**
 * Fire a structured interrupt for a pipeline run at an approval gate stage.
 * Creates a workflow checkpoint and an interrupt_instance record.
 */
export async function fireInterrupt(params: {
  pipelineRunId: string;
  stageId: string;
  stageName: string;
  definition: InterruptDefinition;
  currentStateJson: Record<string, unknown>;
  stageOutput?: string;
  previousLoopIteration?: number;
}): Promise<FireInterruptResult> {
  const {
    pipelineRunId, stageId, stageName, definition,
    currentStateJson, stageOutput,
  } = params;

  // Auto-detect loop iteration: if the caller did not pass an explicit value,
  // look up the highest completed iteration for this definition in this run.
  // This ensures loop-cap enforcement is accurate even across stage re-entries.
  let loopIteration: number;
  if (params.previousLoopIteration !== undefined) {
    loopIteration = params.previousLoopIteration;
  } else {
    const prevMax = await storage.getMaxLoopIterationForDef(pipelineRunId, definition.id);
    // If there are prior responded instances, next iteration is prevMax + 1;
    // if none exist yet (first fire), prevMax is 0 and loopIteration stays 0.
    const priorCount = await storage.listInterruptInstances(pipelineRunId)
      .then((list) => list.filter((i) => i.definitionId === definition.id && i.status !== "pending").length);
    loopIteration = priorCount > 0 ? prevMax + 1 : 0;
  }

  const interruptId = crypto.randomUUID();
  const stateHash = crypto.createHash("sha256")
    .update(JSON.stringify(currentStateJson))
    .digest("hex");

  const allowedActions = (definition.allowedActions as InterruptAction[]) || [];

  const checkpoint = await storage.createWorkflowCheckpoint({
    pipelineRunId,
    trigger: "interrupt",
    triggerStageId: stageId,
    stateJson: currentStateJson,
    stateHash,
    interruptId,
    interruptNode: stageId,
    interruptPayload: {
      gateId: stageId,
      gateName: stageName,
      interruptDefinitionId: definition.id,
      stateSnapshot: currentStateJson,
      stageOutput: stageOutput ?? "",
      context: `Structured interrupt at ${stageName}: ${definition.name}`,
      allowedActions,
      loopIteration,
    },
    interruptResponded: false,
  });

  const instance = await storage.createInterruptInstance({
    definitionId: definition.id,
    pipelineRunId,
    checkpointId: checkpoint.id,
    status: "pending",
    loopIteration,
  });

  return { instanceId: instance.id, checkpointId: checkpoint.id, interruptId, allowedActions };
}

/**
 * Resume a structured interrupt.
 * Validates the action + data, enforces loop-cap, applies state injection,
 * determines routing, and updates both the instance and checkpoint records.
 */
export async function resumeInterrupt(params: {
  instanceId: string;
  action: string;
  data: Record<string, unknown>;
  respondedBy?: string;
}): Promise<ResumeInterruptResult & { definition: InterruptDefinition }> {
  const { instanceId, action: actionId, data, respondedBy } = params;

  const instance = await storage.getInterruptInstance(instanceId);
  if (!instance) throw new Error(`Interrupt instance ${instanceId} not found`);
  if (instance.status !== "pending") {
    throw new Error(`Interrupt instance ${instanceId} is already ${instance.status}`);
  }

  const definition = await storage.getInterruptDefinition(instance.definitionId);
  if (!definition) throw new Error(`Interrupt definition ${instance.definitionId} not found`);

  const allowedActions = (definition.allowedActions as InterruptAction[]) || [];
  const chosenAction = allowedActions.find((a) => a.id === actionId);
  if (!chosenAction) {
    const allowed = allowedActions.map((a) => a.id).join(", ");
    throw new Error(`Action "${actionId}" is not in allowedActions [${allowed}]`);
  }

  const validationErrors = validateResponseFields(chosenAction.responseFields, data);
  if (validationErrors.length > 0) {
    await storage.updateInterruptInstance(instanceId, { validationErrors });
    return {
      routingOutcome: "next_stage",
      targetStageId: null,
      loopIteration: instance.loopIteration,
      stateUpdates: {},
      validationErrors,
      respondedAction: actionId,
      definition,
    };
  }

  const stateUpdates: Record<string, unknown> = {};
  for (const entry of chosenAction.stateInjection) {
    if (data[entry.responseKey] !== undefined) {
      stateUpdates[entry.stateKey] = applyTransform(data[entry.responseKey], entry.transform);
    }
  }

  const { outcome: routingOutcome, targetStageId } = resolveRoutingOutcome(
    chosenAction.routing,
    instance.loopIteration,
    definition.maxLoops,
    definition.loopBackEnabled,
  );

  const finalStatus: string =
    routingOutcome === "loop_back"  ? "loop_back"  :
    routingOutcome === "loop_capped" ? "loop_capped" :
    "responded";

  await storage.updateInterruptInstance(instanceId, {
    status: finalStatus,
    respondedAt: new Date(),
    respondedAction: actionId,
    responseData: data,
    routingOutcome,
    validationErrors: [],
  });

  if (instance.checkpointId) {
    await storage.updateWorkflowCheckpoint(instance.checkpointId, {
      interruptResponded: true,
      interruptResponse: {
        instanceId,
        respondedBy: respondedBy ?? "operator",
        actionId,
        responseData: data,
        routingOutcome,
        stateUpdates,
      },
    });
  }

  return {
    routingOutcome,
    targetStageId,
    loopIteration: instance.loopIteration,
    stateUpdates,
    validationErrors: [],
    respondedAction: actionId,
    definition,
  };
}
