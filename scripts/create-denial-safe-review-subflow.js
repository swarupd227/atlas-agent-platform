#!/usr/bin/env node
/**
 * Denial-Safe Review Sub-Flow — reusable, drop-in sub-flow
 *
 * Ships the "reusable denial-safe sub-flow" recommendation from the August
 * stock-take (§6, rec 05): confidence gate at the existing 0.80
 * financial-services baseline, human review via the Edge Gate node, and
 * adverse-action notice generation -- built once as its own team blueprint,
 * then dropped into any denial-shaped team via a Sub-Flow node instead of
 * being reimplemented per template.
 *
 * Idempotent: skips creation if a team agent named "Denial-Safe Review
 * Sub-Flow" already exists. Safe to re-run.
 *
 * Usage:
 *   node scripts/create-denial-safe-review-subflow.js [--wire-into <teamAgentId> --auto-decline-edge <edgeId> --decline-node <nodeId>]
 *
 * With no flags, only the reusable sub-flow team + blueprint is created.
 * --wire-into / --auto-decline-edge / --decline-node retarget an existing
 * team's "route to auto-decline"-style edge through the sub-flow, the same
 * way it was wired into the Loan Application Underwriting Risk Assessment
 * Orchestrator in dev (see README note at the bottom of this file).
 */

const BASE = process.env.ATLAS_BASE_URL || "http://localhost:5000";

async function req(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`${method} ${path} -> HTML (route missing?): ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

const CONFIDENCE_AGENT_PROMPT = `You review an automated decision that is about to deny an application, claim, or dispute. Given the upstream context (risk tier, decision inputs, any prior reasoning already in state), assess how confident a reasonable reviewer should be that this specific denial is correct and well-supported by the evidence on hand.

Respond with ONLY a JSON object, no other text:
{
  "decision": "deny",
  "confidence": <number between 0 and 1, your confidence this denial is correct>,
  "reasoning": "<one or two sentences on why>",
  "factors": ["<specific factor 1>", "<specific factor 2>"]
}

Be honest about uncertainty -- if the inputs are thin, contradictory, or borderline, say so with a lower confidence score rather than defaulting to a high one. A confidence below 0.80 will route this case to a human reviewer before anything is finalized.`;

const NOTICE_AGENT_PROMPT = `You draft an adverse-action notice for a denial that has been confirmed (either by a confident automated assessment or by human review). Use the reasoning and factors already present in state.

Respond with ONLY a JSON object, no other text:
{
  "noticeText": "<the full notice: principal reason(s) for the adverse action, the specific factors considered, and a plain-language statement of the applicant/claimant's right to request the specific reasons and to dispute the decision>",
  "principalReasons": ["<reason 1>", "<reason 2>"]
}

Be specific and factual -- vague boilerplate like "did not meet our criteria" does not satisfy an adverse-action notice requirement (e.g. Reg B, FCRA). Ground the reasons in the actual factors from state.`;

async function createSubFlow() {
  const existing = await req("GET", "/api/agents").then(agents =>
    agents.find(a => a.name === "Denial-Safe Review Sub-Flow" && a.agentType === "team"));
  if (existing) {
    console.log(`Already exists: ${existing.id} (blueprint ${existing.blueprintId})`);
    return existing;
  }

  const blueprint = await req("POST", "/api/blueprints", { name: "Denial-Safe Review Sub-Flow Blueprint", status: "draft" });

  const teamAgent = await req("POST", "/api/agents", {
    name: "Denial-Safe Review Sub-Flow",
    description: "Reusable confidence-gated denial review: assesses confidence in an automated denial decision, routes low-confidence cases to human review, and drafts an adverse-action notice before the decision executes. Drop into any denial-shaped team (loan, claim, dispute) via a Sub-Flow node.",
    agentType: "team",
    blueprintId: blueprint.id,
    modelProvider: "openai",
    modelName: "gpt-4.1",
    defaultRiskTier: "HIGH",
    status: "active",
  });

  const confidenceAgent = await req("POST", "/api/agents", {
    name: "Denial-Safe Review: Confidence Assessment",
    description: "Assesses confidence in an upstream automated denial decision before it executes, so low-confidence denials route to a human instead of firing automatically.",
    agentType: "single",
    modelProvider: "openai",
    modelName: "gpt-4.1",
    riskTier: "HIGH",
    systemPrompt: CONFIDENCE_AGENT_PROMPT,
  });

  const noticeAgent = await req("POST", "/api/agents", {
    name: "Denial-Safe Review: Adverse-Action Notice Generator",
    description: "Drafts a compliant adverse-action notice for a confirmed denial -- principal reasons, specific factors, and applicant rights -- generated as a byproduct of the decision rather than a manual follow-up task.",
    agentType: "single",
    modelProvider: "openai",
    modelName: "gpt-4.1",
    riskTier: "HIGH",
    systemPrompt: NOTICE_AGENT_PROMPT,
  });

  const nodeA = await req("POST", "/api/team-blueprint-nodes", {
    blueprintId: blueprint.id, nodeType: "internal_agent", label: "Confidence Assessment",
    refAgentId: confidenceAgent.id, stateKey: "confidenceAssessment", positionX: 0, positionY: 0,
  });
  const nodeB = await req("POST", "/api/team-blueprint-nodes", {
    blueprintId: blueprint.id, nodeType: "edge_gate", label: "Human Review (confidence below 0.80)",
    gateType: "approval", positionX: 280, positionY: -60,
  });
  const nodeC = await req("POST", "/api/team-blueprint-nodes", {
    blueprintId: blueprint.id, nodeType: "internal_agent", label: "Adverse-Action Notice Generator",
    refAgentId: noticeAgent.id, stateKey: "adverseActionNotice", positionX: 560, positionY: 0,
  });

  await req("POST", "/api/team-blueprint-edges", {
    blueprintId: blueprint.id, sourceNodeId: nodeA.id, targetNodeId: nodeB.id,
    label: "confidence below 0.80", evaluationMode: "deterministic",
    rule: { combinator: "AND", conditions: [{ field: "confidence", operator: "<", value: 0.8 }] },
  });
  await req("POST", "/api/team-blueprint-edges", {
    blueprintId: blueprint.id, sourceNodeId: nodeA.id, targetNodeId: nodeC.id,
    label: "confidence at or above 0.80", evaluationMode: "deterministic",
    rule: { combinator: "AND", conditions: [{ field: "confidence", operator: ">=", value: 0.8 }] },
  });
  await req("POST", "/api/team-blueprint-edges", {
    blueprintId: blueprint.id, sourceNodeId: nodeB.id, targetNodeId: nodeC.id,
    label: "human review confirmed",
  });

  console.log(`Created: ${teamAgent.id} (blueprint ${blueprint.id})`);
  return teamAgent;
}

async function wireInto(teamAgentId, blueprintId, autoDeclineEdgeId, declineNodeId, subFlowTeamAgentId) {
  const subFlowNode = await req("POST", "/api/team-blueprint-nodes", {
    blueprintId, nodeType: "sub_flow", label: "Denial-Safe Review",
    refTeamAgentId: subFlowTeamAgentId, stateKey: "denialSafeReview", positionX: 800, positionY: 40,
  });
  await req("PATCH", `/api/team-blueprint-edges/${autoDeclineEdgeId}`, { targetNodeId: subFlowNode.id });
  await req("POST", "/api/team-blueprint-edges", {
    blueprintId, sourceNodeId: subFlowNode.id, targetNodeId: declineNodeId,
    label: "denial-safe review complete",
  });
  console.log(`Wired into ${teamAgentId}: sub-flow node ${subFlowNode.id} inserted before decline node ${declineNodeId}`);
}

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const subFlow = await createSubFlow();

const wireIntoId = flag("wire-into");
if (wireIntoId) {
  const autoDeclineEdge = flag("auto-decline-edge");
  const declineNode = flag("decline-node");
  if (!autoDeclineEdge || !declineNode) {
    throw new Error("--wire-into requires --auto-decline-edge and --decline-node");
  }
  const target = await req("GET", `/api/agents/${wireIntoId}`);
  await wireInto(wireIntoId, target.blueprintId, autoDeclineEdge, declineNode, subFlow.id);
}

// Reference wiring used in dev against the Loan Application Underwriting Risk
// Assessment Orchestrator (team agent 9b449897-f488-4806-80b8-5b077d4d750d,
// blueprint d87e1736-747c-4522-9abb-8817412436e4): retargeted edge
// 0daac3fc-caca-4fb1-8fef-1e052e066a1e ("if risk is high", route ==
// auto-decline) from the Decline Loan Agent node
// (81f5629f-d789-4340-a67f-414aa8d636a5) to the new sub_flow node, then added
// a new edge from the sub_flow node to that same Decline Loan Agent node.
//   node scripts/create-denial-safe-review-subflow.js \
//     --wire-into 9b449897-f488-4806-80b8-5b077d4d750d \
//     --auto-decline-edge 0daac3fc-caca-4fb1-8fef-1e052e066a1e \
//     --decline-node 81f5629f-d789-4340-a67f-414aa8d636a5
