import crypto from "crypto";
import { storage } from "../storage";
import type {
  InterruptDefinition,
  InterruptResponseField,
  InterruptRoutingRule,
  InterruptStateInjectionEntry,
} from "@shared/schema";

export interface FireInterruptResult {
  instanceId: string;
  checkpointId: string;
  interruptId: string;
  responseSchema: InterruptResponseField[];
  routingRules: InterruptRoutingRule[];
}

export interface ResumeInterruptResult {
  routingOutcome: "next_stage" | "loop_back" | "conditional_route" | "complete";
  targetStageId: string | null;
  loopIteration: number;
  stateUpdates: Record<string, unknown>;
  validationErrors: string[];
}

function applyTransform(
  value: unknown,
  transform: InterruptStateInjectionEntry["transform"],
): unknown {
  switch (transform) {
    case "stringify": return String(value);
    case "parse_number": return Number(value);
    case "parse_bool": return value === "true" || value === true || value === 1;
    default: return value;
  }
}

function evalRoutingRule(
  rule: InterruptRoutingRule,
  payload: Record<string, unknown>,
): boolean {
  const actual = payload[rule.fieldKey];
  switch (rule.operator) {
    case "eq":       return actual === rule.value;
    case "neq":      return actual !== rule.value;
    case "contains": return String(actual).includes(String(rule.value));
    case "gte":      return Number(actual) >= Number(rule.value);
    case "lte":      return Number(actual) <= Number(rule.value);
    case "in":       return Array.isArray(rule.value) && (rule.value as unknown[]).includes(actual);
    default:         return false;
  }
}

function validatePayload(
  fields: InterruptResponseField[],
  payload: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const val = payload[field.key];
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
      const vals = Array.isArray(val) ? val : [val];
      const invalid = (vals as string[]).filter((v) => !field.options!.includes(String(v)));
      if (invalid.length > 0) {
        errors.push(`Field "${field.label || field.key}" contains invalid options: ${invalid.join(", ")}.`);
      }
    }
  }
  return errors;
}

/**
 * Fire a structured interrupt for a pipeline run at an approval gate stage.
 * Creates a workflow checkpoint and an interrupt_instance record.
 * Returns IDs needed to surface the interrupt to the frontend.
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
    currentStateJson, stageOutput, previousLoopIteration,
  } = params;

  const interruptId = crypto.randomUUID();
  const stateHash = crypto.createHash("sha256")
    .update(JSON.stringify(currentStateJson))
    .digest("hex");

  const responseSchema = (definition.responseSchema as InterruptResponseField[]) || [];
  const routingRules = (definition.routingRules as InterruptRoutingRule[]) || [];

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
      stageOutput: stageOutput || "",
      context: `Structured interrupt at ${stageName}: ${definition.name}`,
      responseSchema,
      routingRules,
    },
    interruptResponded: false,
  });

  const loopIteration = previousLoopIteration ?? 0;
  const instance = await storage.createInterruptInstance({
    definitionId: definition.id,
    pipelineRunId,
    checkpointId: checkpoint.id,
    status: "pending",
    loopIteration,
  });

  return {
    instanceId: instance.id,
    checkpointId: checkpoint.id,
    interruptId,
    responseSchema,
    routingRules,
  };
}

/**
 * Resume a structured interrupt. Validates the response payload, applies state
 * injection, determines routing, and updates the interrupt_instance record.
 */
export async function resumeInterrupt(params: {
  instanceId: string;
  responsePayload: Record<string, unknown>;
  respondedBy?: string;
}): Promise<ResumeInterruptResult & { definition: InterruptDefinition }> {
  const { instanceId, responsePayload, respondedBy } = params;

  const instance = await storage.getInterruptInstance(instanceId);
  if (!instance) throw new Error(`Interrupt instance ${instanceId} not found`);
  if (instance.status !== "pending") {
    throw new Error(`Interrupt instance ${instanceId} is already ${instance.status}`);
  }

  const definition = await storage.getInterruptDefinition(instance.definitionId);
  if (!definition) throw new Error(`Interrupt definition ${instance.definitionId} not found`);

  const responseSchema = (definition.responseSchema as InterruptResponseField[]) || [];
  const routingRules = (definition.routingRules as InterruptRoutingRule[]) || [];
  const injectionMap = (definition.stateInjectionMap as InterruptStateInjectionEntry[]) || [];

  const validationErrors = validatePayload(responseSchema, responsePayload);
  if (validationErrors.length > 0) {
    await storage.updateInterruptInstance(instanceId, {
      validationErrors,
    });
    return {
      instanceId,
      routingOutcome: "next_stage",
      targetStageId: null,
      loopIteration: instance.loopIteration,
      stateUpdates: {},
      validationErrors,
      definition,
    } as ResumeInterruptResult & { definition: InterruptDefinition };
  }

  const stateUpdates: Record<string, unknown> = {};
  for (const entry of injectionMap) {
    if (responsePayload[entry.responseKey] !== undefined) {
      stateUpdates[entry.stateKey] = applyTransform(
        responsePayload[entry.responseKey],
        entry.transform,
      );
    }
  }

  let routingOutcome: ResumeInterruptResult["routingOutcome"] = "next_stage";
  let targetStageId: string | null = null;

  for (const rule of routingRules) {
    if (evalRoutingRule(rule, responsePayload)) {
      routingOutcome = "conditional_route";
      targetStageId = rule.targetStageId;
      break;
    }
  }

  if (routingOutcome === "next_stage" && definition.loopBackStageId) {
    const loopTrigger = responsePayload._loop_back === true || responsePayload._loop_back === "true";
    if (loopTrigger) {
      routingOutcome = "loop_back";
      targetStageId = definition.loopBackStageId;
    }
  }

  await storage.updateInterruptInstance(instanceId, {
    status: routingOutcome === "loop_back" ? "loop_back" : "responded",
    respondedAt: new Date(),
    responsePayload,
    routingOutcome,
    respondedBy: respondedBy || "operator",
    validationErrors: [],
  });

  if (instance.checkpointId) {
    await storage.updateWorkflowCheckpoint(instance.checkpointId, {
      interruptResponded: true,
      interruptResponse: {
        instanceId,
        respondedBy: respondedBy || "operator",
        responsePayload,
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
    definition,
  };
}
