/**
 * Create an outcome from a proposal: the outcome (pending review), its KPIs,
 * its constraint graph and starter process flow, agent bindings and the
 * outcome_review approval, in one transaction, plus the audit record.
 *
 * Moved from POST /api/outcomes/from-proposal (server/routes/outcomes.ts) so
 * the Astra Workspace can create an outcome without an HTTP request. The route
 * calls this with the same options, so its behaviour is unchanged.
 */
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  agents,
  approvals,
  insertKpiDefinitionSchema,
  insertOutcomeContractSchema,
  kpiDefinitions,
  outcomeContracts,
} from "@shared/schema";
import { normalizeToGraph, starterFlow } from "@shared/process-flow";
import { computeConstraintGraph, resolveOntologyTags } from "./routes/helpers";

export class OutcomeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeInputError";
  }
}

export interface OutcomeProposalBody {
  outcome?: Record<string, any>;
  kpis?: Array<Record<string, any>>;
  constraints?: unknown;
  acceptedAgentIds?: unknown;
  source?: string;
  evidence?: unknown;
}

export interface PrepareOptions {
  /**
   * Baseline to store when a KPI gives none. The Outcome Builder route has
   * always stored 0; the Astra Workspace stores null, so a baseline nobody
   * gave is never shown as measured.
   */
  baselineWhenMissing: 0 | null;
}

const toNumber = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)));

/** Validate and normalize a proposal. Pure: no database. */
export function prepareOutcomeFromProposal(body: OutcomeProposalBody, opts: PrepareOptions) {
  const { outcome: outcomeData, kpis: kpiData, constraints, acceptedAgentIds } = body ?? {};
  if (!outcomeData || typeof outcomeData !== "object") throw new OutcomeInputError("outcome is required");

  // Carry discovery policy matches into the constraint graph.
  const matchedPolicyIds: string[] = Array.isArray(outcomeData.matchedPolicyIds) ? outcomeData.matchedPolicyIds : [];
  const discoveryPolicies: any[] = Array.isArray(outcomeData.discoveryPolicies) ? outcomeData.discoveryPolicies : [];
  const { matchedPolicyIds: _mp, discoveryPolicies: _dp, status: _st, ...cleanOutcome } = outcomeData;

  const parsedOutcome = insertOutcomeContractSchema.omit({ organizationId: true }).parse({
    ...cleanOutcome,
    status: "pending_review", // real governance gate
    slaConfig: constraints ? { constraints, ...(cleanOutcome.slaConfig || {}) } : cleanOutcome.slaConfig,
  });

  const parsedKpis = Array.isArray(kpiData)
    ? kpiData.map((kpi: any) => {
        // A proposal can't claim where a current value came from, nor declare
        // what measures the KPI -- a person does that, knowingly, later.
        const { valueSource: _vs, valueUpdatedAt: _vu, measurementSource: _ms, ...rest } = kpi ?? {};
        return insertKpiDefinitionSchema.omit({ outcomeId: true }).parse({
          ...rest,
          target: typeof kpi.target === "number" ? kpi.target : (parseFloat(kpi.target) || 0),
          baseline: kpi.baseline != null
            ? (typeof kpi.baseline === "number" ? kpi.baseline : (parseFloat(kpi.baseline) || 0))
            : (kpi.currentBaseline ?? opts.baselineWhenMissing),
          // Preserve the proposal's own SLA threshold / weight (no hardcoding).
          slaThreshold: kpi.slaThreshold != null ? toNumber(kpi.slaThreshold) : undefined,
          weight: kpi.weight != null ? toNumber(kpi.weight) : 1,
        });
      })
    : [];

  const agentIds: string[] = Array.isArray(acceptedAgentIds) ? acceptedAgentIds.filter((x: any) => typeof x === "string") : [];
  const riskScore = parsedOutcome.riskTier === "HIGH" ? 8 : parsedOutcome.riskTier === "MEDIUM" ? 5 : 3;

  return { parsedOutcome, parsedKpis, agentIds, riskScore, matchedPolicyIds, discoveryPolicies };
}

export type PreparedOutcome = ReturnType<typeof prepareOutcomeFromProposal>;

/** Persist a prepared proposal in the organization and record who created it. */
export async function createOutcomeFromProposal(
  orgId: string,
  actor: string,
  prepared: PreparedOutcome,
  meta: { source?: string; evidence?: unknown },
) {
  const { parsedOutcome, parsedKpis, agentIds, riskScore, matchedPolicyIds, discoveryPolicies } = prepared;

  const result = await db.transaction(async (tx) => {
    const [outcome] = await tx.insert(outcomeContracts).values({ ...parsedOutcome, organizationId: orgId }).returning();

    const createdKpis = [];
    for (const kpi of parsedKpis) {
      const [created] = await tx.insert(kpiDefinitions).values({ ...kpi, outcomeId: outcome.id }).returning();
      createdKpis.push(created);
    }

    const graph = computeConstraintGraph(outcome, createdKpis);
    const graphWithPolicies = {
      ...graph,
      ...(matchedPolicyIds.length > 0 ? { matchedPolicyIds } : {}),
      ...(discoveryPolicies.length > 0 ? { discoveryPolicies } : {}),
    };

    // Seed an editable process flow at creation so it's ready before the
    // Agent Plan. Use a typed flow the proposal already carried (graph or
    // typed steps); otherwise a sensible starter from the risk tier.
    const discoveryFlow = (parsedOutcome.slaConfig as any)?.processFlow;
    const isGraph = !!discoveryFlow && Array.isArray((discoveryFlow as any).nodes);
    const isTypedSteps = Array.isArray(discoveryFlow) && discoveryFlow.length > 0 && discoveryFlow.every((s: any) => s?.type && s?.label);
    const seeded = (isGraph || isTypedSteps) ? normalizeToGraph(discoveryFlow, outcome.name) : null;
    const processFlow = { ...(seeded || starterFlow(outcome.name, outcome.riskTier)), updatedAt: new Date().toISOString() };

    const [updatedOutcome] = await tx.update(outcomeContracts)
      .set({ constraintGraph: graphWithPolicies, processFlow })
      .where(eq(outcomeContracts.id, outcome.id)).returning();

    // Bind accepted agents (org-scoped) atomically with the outcome.
    let boundAgents = 0;
    for (const agentId of agentIds) {
      const bound = await tx.update(agents)
        .set({ outcomeId: outcome.id })
        .where(and(eq(agents.id, agentId), eq(agents.organizationId, orgId)))
        .returning();
      if (bound.length > 0) boundAgents++;
    }

    // The governance review gate — created atomically with the outcome.
    const [approval] = await tx.insert(approvals).values({
      type: "outcome_review",
      objectType: "outcome_contract",
      objectId: updatedOutcome.id,
      objectName: updatedOutcome.name,
      riskScore,
      status: "pending",
      requestedBy: actor,
      requesterType: "user",
      outcomeId: updatedOutcome.id,
      organizationId: orgId,
      evidenceJson: (meta.evidence ?? null) as any,
    }).returning();

    return { outcome: updatedOutcome, kpis: createdKpis, approval, boundAgents };
  });

  // Audit (best-effort, outside the tx — matches the with-kpis pattern).
  await storage.createAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: actor,
    action: "outcome_created",
    objectType: "outcome",
    objectId: result.outcome.id,
    details: `Outcome "${result.outcome.name}" created (source: ${meta.source || "unknown"}) — pending review`,
    ontologyTags: resolveOntologyTags("outcome", "created", { details: String(result.outcome.name) }),
  }).catch((err) => console.error("from-proposal audit error:", err));

  return result;
}
