import { z } from "zod";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";
import { resolveAgentRef, resolveOutcomeRef, resolvePolicyRef } from "./refs";

/**
 * Governance studio pack: which policies apply and what they block, installing
 * and binding policies, governance readiness, audit-chain verification and the
 * regulatory exam package. Reads call shared code with the caller's
 * organization; changes pause on a confirmation card and are audited.
 */

const PACK = "governance";

const compactPolicy = (p: any) => ({ id: p.id, name: p.name, domain: p.domain, scope: p.scope ?? p.scopeType, enforcement: p.enforcement ?? (p.policyJson?.enforcement ?? "monitor"), status: p.status });

export const listPoliciesTool: AstraTool<{ domain?: string; query?: string }> = {
  name: "list_policies",
  description: "List the organization's policies, optionally filtered by domain (e.g. data_handling, tool_permissions, output_control) or a word in the name or description.",
  input: z.object({
    domain: z.string().max(60).optional(),
    query: z.string().max(100).optional(),
  }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const all: any[] = await ctx.services.listPolicies(ctx.orgId);
    const q = input.query?.toLowerCase();
    const rows = all
      .filter((p) => !input.domain || p.domain === input.domain)
      .filter((p) => !q || `${p.name} ${p.description ?? ""}`.toLowerCase().includes(q))
      .map(compactPolicy);
    return {
      payload: { total: rows.length, active: rows.filter((p) => p.status === "active").length, policies: rows.slice(0, 40) },
      artifact: { kind: "policies", title: "Policies", props: { mode: "list", policies: rows.slice(0, 100), total: rows.length }, fullViewHref: "/governance/policy-engine" },
      proof: { compliance: { status: "measured", summary: `${rows.length} ${rows.length === 1 ? "policy" : "policies"}${input.domain ? ` in ${input.domain}` : ""}` } },
    };
  },
};

export const explainPoliciesTool: AstraTool<{ agent: string }> = {
  name: "explain_policies",
  description: "Explain which policies apply to one agent and why (organization, outcome, agent, environment or an explicit binding), and what they do at run time: tools blocked outright, tools only monitored, the tool allowlist.",
  input: z.object({ agent: z.string().min(1).describe("The agent's id or name.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ref = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in ref) throw new Error(ref.refuse);
    const r = await ctx.services.explainPolicies(ctx.orgId, ref.item.id);
    if (!r) throw new Error("That agent isn't in this organization.");
    const byScope: Record<string, number> = {};
    for (const p of r.applied as Array<{ scope: string }>) byScope[p.scope] = (byScope[p.scope] ?? 0) + 1;
    return {
      payload: { agent: r.agent, policies: r.applied, byScope, blockedTools: r.blockedTools, monitoredTools: r.monitoredTools, toolAllowlist: r.toolAllowlist, guardrails: r.guardrailCount, redactionPatterns: r.redactionPatternCount },
      artifact: { kind: "policies", title: `Policies for ${r.agent.name}`, props: { mode: "agent", ...r }, fullViewHref: `/agents/${r.agent.id}` },
      proof: {
        compliance: {
          status: "measured",
          summary: `${r.applied.length} ${r.applied.length === 1 ? "policy applies" : "policies apply"} · ${r.blockedTools.length} tools blocked · ${r.monitoredTools.length} monitored`,
        },
      },
    };
  },
};

export const checkGovernanceReadinessTool: AstraTool<{ agent: string }> = {
  name: "check_governance_readiness",
  description: "Check an agent against its industry's policy requirements (built-in lists and industry policy packs), using the policies that actually apply to that agent. Says when nothing could be checked.",
  input: z.object({ agent: z.string().min(1).describe("The agent's id or name.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ref = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in ref) throw new Error(ref.refuse);
    const r = await ctx.services.governanceReadiness(ctx.orgId, ref.item.id);
    if (!r) throw new Error("That agent isn't in this organization.");
    const missing = (r.requirements as Array<{ status: string }>).filter((x) => x.status === "missing").length;
    const proof: Partial<ProofEnvelope> = r.checked
      ? { compliance: { status: "measured", summary: `${r.requirements.length - missing}/${r.requirements.length} requirements covered for ${r.industryId}` } }
      : { compliance: { status: "not_measured", reason: r.message ?? "No requirements were checked." } };
    return {
      payload: { agent: r.agent, industry: r.industryId, checked: r.checked, passed: r.checked ? r.passed : null, missing, requirements: r.requirements, ...(r.message ? { message: r.message } : {}) },
      artifact: { kind: "readiness", title: `Governance readiness · ${r.agent.name}`, props: r },
      proof,
    };
  },
};

export const verifyAuditChainTool: AstraTool<Record<string, never>> = {
  name: "verify_audit_chain",
  description: "Verify the organization's hash-chained audit trail: every event's link to the previous one and every signature. Reports how many events were checked and where the chain first breaks, if it does.",
  input: z.object({}),
  permission: "export_audit_bundle",
  pack: PACK,
  confirm: false,
  run: async (ctx) => {
    const r = await ctx.services.verifyAuditChain(ctx.orgId);
    const intact = r.valid && r.signatureValid !== false;
    return {
      payload: {
        intact,
        linkageValid: r.valid,
        signaturesValid: r.signatureValid ?? null,
        eventsChecked: r.verifiedEvents,
        signedEvents: r.signedEvents ?? 0,
        unsignedEvents: r.unsignedEvents ?? 0,
        ...(r.brokenAt != null ? { linkageBrokenAt: r.brokenAt } : {}),
        ...(r.signatureBrokenAt != null ? { signatureBrokenAt: r.signatureBrokenAt } : {}),
        note: r.unsignedEvents ? "Unsigned events were written before signing was introduced; their linkage is checked, their signatures can't be." : undefined,
      },
      artifact: { kind: "auditChain", title: "Audit trail integrity", props: { ...r, intact }, fullViewHref: "/audit-trail" },
      proof: { compliance: { status: "measured", summary: `${intact ? "Chain intact" : "Chain broken"} · ${r.verifiedEvents} events checked` } },
    };
  },
};

export const regulatoryExamPackageTool: AstraTool<{ agent: string; days?: number }> = {
  name: "regulatory_exam_package",
  description: "Prepare an agent's signed regulatory exam package (decision-log sample, human overrides, red-team probe results, policy coverage, AIUC-1 report): says what it contains for the period and gives the download link.",
  input: z.object({ agent: z.string().min(1), days: z.number().int().min(1).max(365).optional().describe("Period in days (default 90).") }),
  permission: "export_audit_bundle",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ref = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in ref) throw new Error(ref.refuse);
    const r = await ctx.services.examPackageSummary(ctx.orgId, ref.item.id, input.days ?? 90);
    if (!r) throw new Error("That agent isn't in this organization.");
    return {
      payload: {
        ...r,
        caution: r.redTeamRuns === 0
          ? "No red-team probes ran in this period, so the package's bias and security scores are the report's defaults, not measurements."
          : "Scores in the package are computed from the red-team probes and eval runs in the period.",
      },
      artifact: { kind: "examPackage", title: `Regulatory exam package · ${r.agent.name}`, props: r },
      proof: { compliance: { status: "measured", summary: `${r.decisionLogEvents} logged decisions · ${r.humanOverrides} human overrides · ${r.redTeamRuns} red-team runs in ${r.days} days` } },
    };
  },
};

export const installPolicyPackTool: AstraTool<{ pack: string }> = {
  name: "install_policy_pack",
  description: "Install an industry policy pack into the organization: creates its policies (organization-wide, active), skipping any that already exist by name. Call without a known pack name to see the packs for the organization's industry in the refusal.",
  input: z.object({ pack: z.string().min(1).describe("The policy pack's id or name.") }),
  permission: "create_modify_policies",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const packs: any[] = await ctx.services.listPolicyPacks(null);
    const needle = input.pack.toLowerCase();
    const pack = packs.find((p) => p.id === input.pack) ?? packs.find((p) => p.name.toLowerCase() === needle) ?? packs.find((p) => p.name.toLowerCase().includes(needle));
    if (!pack) {
      const forIndustry = ctx.industryId ? packs.filter((p) => p.industry === ctx.industryId) : packs;
      return { refuse: `No policy pack "${input.pack}". Available${ctx.industryId ? ` for ${ctx.industryId}` : ""}: ${forIndustry.map((p) => `${p.name} (${p.id})`).join("; ") || "none"}.` };
    }
    const existing = new Set(((await ctx.services.listPolicies(ctx.orgId)) as Array<{ name: string }>).map((p) => p.name));
    const toCreate = pack.policies.filter((p: any) => !existing.has(p.name));
    const already = pack.policies.filter((p: any) => existing.has(p.name));
    if (toCreate.length === 0) return { refuse: `Every policy in ${pack.name} is already installed.` };
    return {
      summary: `Install policy pack: ${pack.name}`,
      details: [
        `${toCreate.length} ${toCreate.length === 1 ? "policy" : "policies"} will be created, active for the whole organization: ${toCreate.map((p: any) => p.name).join(", ")}.`,
        ...(already.length ? [`Already installed, left as they are: ${already.map((p: any) => p.name).join(", ")}.`] : []),
        `Framework: ${pack.framework}. Recorded in the audit trail.`,
      ],
      warnings: [{ title: "Applies to every agent", detail: "Organization-wide policies apply to every agent from its next run; hard-enforced rules can block tool calls." }],
      frozen: { packId: pack.id },
    };
  },
  run: async (ctx, input) => {
    const packId = (ctx.confirmation?.frozen as { packId?: string } | undefined)?.packId ?? input.pack;
    const actor = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.installPolicyPackAs(ctx.orgId, packId, actor, ctx.userId ?? actor);
    return {
      payload: { installed: true, pack: r.pack, created: r.created, skipped: r.skipped },
      proof: { compliance: { status: "measured", summary: `${r.created.length} policies created · ${r.skipped.length} already present · audit recorded` } },
    };
  },
};

type BindInput = { policy: string; agent?: string; outcome?: string; enforcement?: "monitor" | "hard" };

export const bindPolicyTool: AstraTool<BindInput> = {
  name: "bind_policy",
  description: "Bind an existing policy to one agent (with monitor or hard enforcement) or to an outcome (it then applies to the outcome's agents). Give either agent or outcome.",
  input: z.object({
    policy: z.string().min(1).describe("The policy's id or name."),
    agent: z.string().optional().describe("The agent's id or name."),
    outcome: z.string().optional().describe("The outcome's id or name."),
    enforcement: z.enum(["monitor", "hard"]).optional().describe("For an agent: monitor (log violations) or hard (refuse blocked tools). Default monitor."),
  }),
  permission: "create_modify_policies",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    if (!!input.agent === !!input.outcome) return { refuse: "Give either an agent or an outcome to bind the policy to." };
    const policy = await resolvePolicyRef(ctx, input.policy);
    if ("refuse" in policy) return policy;
    const enforcement = input.enforcement ?? "monitor";
    if (input.agent) {
      const agent = await resolveAgentRef(ctx, input.agent);
      if ("refuse" in agent) return agent;
      return {
        summary: `Bind ${policy.item.name} to ${agent.item.name} (${enforcement})`,
        details: [
          enforcement === "hard"
            ? `From ${agent.item.name}'s next run, tools this policy blocks are refused.`
            : `From ${agent.item.name}'s next run, violations of this policy are logged; tool calls still go ahead.`,
          "Recorded in the audit trail.",
        ],
        frozen: { policyId: policy.item.id, agentId: agent.item.id, enforcement },
      };
    }
    const outcome = await resolveOutcomeRef(ctx, input.outcome!);
    if ("refuse" in outcome) return outcome;
    return {
      summary: `Bind ${policy.item.name} to outcome ${outcome.item.name}`,
      details: [
        `The policy applies to every agent working on ${outcome.item.name}. If it's scoped elsewhere today, a copy is made for the outcome and the original binding stays.`,
        "Recorded in the audit trail.",
      ],
      frozen: { policyId: policy.item.id, outcomeId: outcome.item.id, enforcement },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { policyId: string; agentId?: string; outcomeId?: string; enforcement: "monitor" | "hard" } | undefined;
    if (!f) throw new Error("Binding a policy needs the confirmation card.");
    const actor = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.bindPolicyAs(ctx.orgId, actor, ctx.userId ?? actor, f);
    return {
      payload: { bound: true, ...r },
      proof: { compliance: { status: "measured", summary: `Policy bound to ${r.kind === "agent" ? `agent ${r.agent.name}` : `outcome ${r.outcome.name}`} · audit recorded` } },
    };
  },
};

export const GOVERNANCE_TOOLS = [listPoliciesTool, explainPoliciesTool, checkGovernanceReadinessTool, verifyAuditChainTool, regulatoryExamPackageTool, installPolicyPackTool, bindPolicyTool];
