/**
 * Creating, promoting, re-routing and rolling back deployments, shared by the
 * deployment routes (server/routes/agents.ts) and the Astra Workspace. Moved
 * from the route handlers; each returns the HTTP status and body the route
 * sends. Every gate stays as it was: deployment freeze, ontology alignment for
 * production, the eval gate, the fail-closed policy gate, and the approval
 * each hop creates -- which now carries the deployment's organization so it
 * can be decided within that organization.
 */
import * as nodeCrypto from "crypto";
import { storage } from "./storage";
import { assessToolAlignment } from "./ontology-alignment";
import { insertDeploymentSchema } from "@shared/schema";
import { resolveOntologyTags, resolvePolicyBundle } from "./routes/helpers";
import { ensureAarConfig } from "./routes/aar";
import { buildBlastRadius } from "./blast-radius";
import { stopAgentRuntime } from "./agent-runtime";

export interface DeploymentActionContext {
  orgId: string | undefined;
}

export interface ActionResult {
  status: number;
  body: any;
}

export async function checkDeploymentFreeze(orgId: string | undefined, agentId: string | undefined): Promise<{ frozen: boolean; reason?: string; scope?: string }> {
  const auditEvents = await storage.getAuditEvents(orgId);
  const freezeEvents = auditEvents.filter(e => e.action === "deployment_freeze" || e.action === "deployment_unfreeze");
  const statusMap: Record<string, { frozen: boolean; reason?: string; scope?: string }> = {};
  for (const evt of freezeEvents) {
    try {
      const details = JSON.parse(evt.details || "{}");
      const key = details.targetId || details.scope || "unknown";
      if (evt.action === "deployment_freeze") {
        statusMap[key] = { frozen: true, reason: details.reason, scope: details.scope };
      } else {
        delete statusMap[key];
      }
    } catch {}
  }
  if (statusMap["org"]?.frozen) return statusMap["org"];
  if (agentId && statusMap[agentId]?.frozen) return statusMap[agentId];
  return { frozen: false };
}

export async function createDeploymentAction(ctx: DeploymentActionContext, body: any): Promise<ActionResult> {
    const bypassOntologyCheck = body.bypassOntologyCheck === true;
    const { bypassOntologyCheck: _boc, organizationId: _orgIdFromBody, ...deploymentBody } = body;
    const data = insertDeploymentSchema.parse(deploymentBody);
    const env = data.environment || "staging";

    const freezeCheck = await checkDeploymentFreeze(ctx.orgId, data.agentId);
    if (freezeCheck.frozen) {
      return { status: 423, body: { message: `Deployments are frozen${freezeCheck.reason ? `: ${freezeCheck.reason}` : ""}`, frozen: true } };
    }

    const agent = await storage.getAgent(data.agentId, ctx.orgId);

    if (env === "prod" && agent) {
      // The same assessment Astra's agent_ontology_alignment reports, so what
      // a refusal here says and what the conversation explains cannot drift.
      const alignment = await assessToolAlignment(data.agentId);
      if (alignment.hasBlueprint) {
        const lowAlignmentTools = alignment.low;

        if (lowAlignmentTools.length > 0 && !bypassOntologyCheck) {
          return { status: 400, body: {
            blocked: true,
            reason: "ontology_alignment",
            message: `Deployment to prod blocked: ${lowAlignmentTools.length} tool(s) have ontology alignment below 50% threshold`,
            lowAlignmentTools,
          } };
        }

        if (lowAlignmentTools.length > 0 && bypassOntologyCheck) {
          const auditEvents = await storage.getAuditEvents(ctx.orgId);
          const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
          const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
          const eventData = `${maxSeq + 1}:ontology_bypass:${data.agentId}:${Date.now()}`;
          const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

          await storage.createAuditEvent({
            actorType: "user",
            actorId: "deployment-service",
            action: "ontology_alignment_bypass",
            objectType: "deployment",
            objectId: data.agentId,
            details: JSON.stringify({
              environment: env,
              agentName: agent.name,
              bypassedTools: lowAlignmentTools,
              reason: "User explicitly bypassed ontology alignment check for prod deployment",
            }),
            sequenceNum: maxSeq + 1,
            previousHash: lastHash,
            eventHash,
            ontologyTags: resolveOntologyTags("deployment", "ontology_alignment_bypass"),
          });
        }
      }
    }

    const deployment = await storage.createDeployment({ ...data, organizationId: ctx.orgId ?? undefined });

    if (deployment.version && deployment.agentId) {
      await storage.ensureAgentVersion(deployment.agentId, deployment.version, "active");
    }

    // Auto-generate/refresh AAR config when deployment reaches active/deployed state
    if (deployment.status === "deployed" || deployment.status === "active") {
      ensureAarConfig(deployment.agentId).catch(() => {});
    }

    const riskTier = agent?.riskTier || "LOW";
    const strategy = deployment.rolloutStrategy || "canary";

    const needsApproval =
      env === "prod" ||
      riskTier === "HIGH" || riskTier === "CRITICAL" ||
      (env === "pilot" && (riskTier === "MEDIUM" || riskTier === "HIGH" || riskTier === "CRITICAL"));

    let approval = null;
    if (needsApproval) {
      const approvalType = env === "prod" ? "launch_readiness" : "deployment_review";
      const riskScore = riskTier === "CRITICAL" ? 10 : riskTier === "HIGH" ? 8 : riskTier === "MEDIUM" ? 5 : 3;

      const evalSuites = await storage.getEvalSuites();
      const agentSuites = evalSuites.filter(s => s.agentId === deployment.agentId);
      const traces = await storage.getTracesByAgent(deployment.agentId, ctx.orgId);
      const recentTraces = traces.slice(0, 30);
      const totalT = recentTraces.length;
      const failedT = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
      const successRate = totalT > 0 ? ((totalT - failedT) / totalT * 100) : 100;

      approval = await storage.createApproval({
        organizationId: ctx.orgId,
        type: approvalType,
        objectType: "deployment",
        objectId: deployment.id,
        objectName: `${deployment.agentName || agent?.name || "Agent"} v${deployment.version || "?"} → ${env}`,
        status: "pending",
        requestedBy: "System (Release Creation)",
        agentId: deployment.agentId,
        environment: env,
        description: `${approvalType === "launch_readiness" ? "Production launch readiness" : "Deployment"} review required. Risk: ${riskTier}, Strategy: ${strategy}, Environment: ${env}.`,
        riskScore,
        evidenceJson: {
          agentName: deployment.agentName || agent?.name,
          version: deployment.version,
          riskTier,
          strategy,
          environment: env,
          evalResults: agentSuites.map(s => ({ name: s.name, passRate: s.passRate, totalCases: s.totalCases })),
          metrics: {
            successRate: successRate.toFixed(1) + "%",
            traceCount: totalT,
            errorRate: (totalT > 0 ? (failedT / totalT * 100).toFixed(1) : "0") + "%",
          },
          canaryConfig: deployment.canaryConfig,
          rollbackConfig: deployment.rollbackConfig,
        },
      });

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "release_service",
        action: "approval_auto_created",
        objectType: "deployment",
        objectId: deployment.id,
        details: `Auto-created ${approvalType} approval for ${deployment.agentName || "agent"} v${deployment.version} → ${env} (risk: ${riskTier})`,
        ontologyTags: resolveOntologyTags("deployment", "approval_auto_created"),
      });
    }

    let strategyWarning: string | null = null;
    if (agent?.outcomeId && (strategy === "full" || strategy === "direct")) {
      const kpis = await storage.getKpisByOutcome(agent.outcomeId);
      const pctUnits = ["percent", "%", "percentage", "rate", "ratio", "pct"];
      const slaKpis = kpis.filter(k => k.slaThreshold != null && k.slaThreshold >= 95 && (pctUnits.includes(k.unit.toLowerCase()) || k.slaThreshold <= 100));
      if (slaKpis.length > 0) {
        const maxSla = Math.max(...slaKpis.map(k => k.slaThreshold!));
        const outcome = await storage.getOutcome(agent.outcomeId, ctx.orgId);
        strategyWarning = `Direct deploy not recommended — outcome "${outcome?.name}" requires ≥${maxSla.toFixed(1)}% SLA. Consider canary deployment with tight rollback thresholds.`;
      }
    }

    return { status: 201, body: { ...deployment, approval, strategyWarning } };
}

export async function promoteDeploymentAction(ctx: DeploymentActionContext, id: string, body: any): Promise<ActionResult> {
    const source = await storage.getDeployment(id, ctx.orgId);
    if (!source) return { status: 404, body: { message: "Deployment not found" } };

    const promoteFreezeCheck = await checkDeploymentFreeze(ctx.orgId, source.agentId);
    if (promoteFreezeCheck.frozen) {
      return { status: 423, body: { message: `Deployments are frozen${promoteFreezeCheck.reason ? `: ${promoteFreezeCheck.reason}` : ""}`, frozen: true } };
    }

    const envOrder = ["staging", "pilot", "prod"];
    const currentIdx = envOrder.indexOf(source.environment);
    if (currentIdx === -1 || currentIdx >= envOrder.length - 1) {
      return { status: 400, body: { message: `Cannot promote from ${source.environment}` } };
    }
    const nextEnv = envOrder[currentIdx + 1];

    const bypassEvalGate = body.bypassEvalGate === true;

    const promoteAgent = await storage.getAgent(source.agentId, ctx.orgId);
    const promoteRtConfig = (promoteAgent?.runtimeConfig as Record<string, any>) || {};
    const promoteGateOverrides = promoteRtConfig.promotionGateOverrides || {};
    const configuredEvalThreshold = typeof promoteGateOverrides.minEvalPassRate === "number" ? promoteGateOverrides.minEvalPassRate : (nextEnv === "prod" ? 80 : 60);

    const allEvalSuites = await storage.getEvalSuites();
    const agentSuites = allEvalSuites.filter(s => s.agentId === source.agentId);

    let evalWarning: string | undefined;
    const failingSuites: Array<{ name: string; passRate: number }> = [];

    if (configuredEvalThreshold === 0) {
      evalWarning = undefined;
    } else if (agentSuites.length === 0) {
      evalWarning = "No eval suites configured";
    } else {
      for (const suite of agentSuites) {
        const passRate = suite.passRate ?? 0;
        if (passRate < configuredEvalThreshold) {
          failingSuites.push({ name: suite.name, passRate });
        }
      }

      if (failingSuites.length > 0 && nextEnv === "prod" && !bypassEvalGate) {
        const auditEventsAll = await storage.getAuditEvents(ctx.orgId);
        const maxSeqNum = auditEventsAll.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
        const lastHashVal = auditEventsAll.length > 0 ? auditEventsAll[auditEventsAll.length - 1].eventHash || "" : "";
        const evtData = `${maxSeqNum + 1}:eval_gate_blocked:${source.id}:${Date.now()}`;
        const evtHash = `sha256:${nodeCrypto.createHash("sha256").update(evtData + lastHashVal).digest("hex")}`;

        await storage.createAuditEvent({
          actorType: "system",
          actorId: "eval-gate",
          action: "eval_gate_blocked",
          objectType: "deployment",
          objectId: source.id,
          details: JSON.stringify({
            targetEnv: nextEnv,
            failingSuites,
            threshold: 80,
            agentName: source.agentName,
            version: source.version,
          }),
          sequenceNum: maxSeqNum + 1,
          previousHash: lastHashVal,
          eventHash: evtHash,
        });

        return { status: 400, body: {
          message: "Eval pass rate too low for production promotion",
          evalGateBlocked: true,
          threshold: configuredEvalThreshold,
          failingSuites,
        } };
      }

      if (failingSuites.length > 0 && nextEnv === "pilot") {
        evalWarning = `Eval pass rate below ${configuredEvalThreshold}% on: ${failingSuites.map(s => `${s.name} (${s.passRate.toFixed(1)}%)`).join(", ")}`;
      }
    }

    if (bypassEvalGate && failingSuites.length > 0) {
      const auditEventsAll = await storage.getAuditEvents(ctx.orgId);
      const maxSeqNum = auditEventsAll.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const lastHashVal = auditEventsAll.length > 0 ? auditEventsAll[auditEventsAll.length - 1].eventHash || "" : "";
      const evtData = `${maxSeqNum + 1}:eval_gate_bypassed:${source.id}:${Date.now()}`;
      const evtHash = `sha256:${nodeCrypto.createHash("sha256").update(evtData + lastHashVal).digest("hex")}`;

      await storage.createAuditEvent({
        actorType: "user",
        actorId: body.approvedBy || "unknown",
        action: "eval_gate_bypassed",
        objectType: "deployment",
        objectId: source.id,
        details: JSON.stringify({
          targetEnv: nextEnv,
          failingSuites,
          threshold: configuredEvalThreshold,
          agentName: source.agentName,
          version: source.version,
          bypassAcknowledgment: true,
        }),
        sequenceNum: maxSeqNum + 1,
        previousHash: lastHashVal,
        eventHash: evtHash,
      });
    }

    const bypassOntologyCheck = body.bypassOntologyCheck === true;
    if (nextEnv === "prod") {
      const alignment = await assessToolAlignment(source.agentId);
      if (alignment.hasBlueprint) {
        const lowAlignmentTools = alignment.low;

        if (lowAlignmentTools.length > 0 && !bypassOntologyCheck) {
          return { status: 400, body: {
            blocked: true,
            reason: "ontology_alignment",
            message: `Promotion to prod blocked: ${lowAlignmentTools.length} tool(s) have ontology alignment below 50% threshold`,
            lowAlignmentTools,
          } };
        }

        if (lowAlignmentTools.length > 0 && bypassOntologyCheck) {
          const auditEventsAll2 = await storage.getAuditEvents(ctx.orgId);
          const maxSeqNum2 = auditEventsAll2.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
          const lastHashVal2 = auditEventsAll2.length > 0 ? auditEventsAll2[auditEventsAll2.length - 1].eventHash || "" : "";
          const evtData2 = `${maxSeqNum2 + 1}:ontology_bypass:${source.id}:${Date.now()}`;
          const evtHash2 = `sha256:${nodeCrypto.createHash("sha256").update(evtData2 + lastHashVal2).digest("hex")}`;

          await storage.createAuditEvent({
            actorType: "user",
            actorId: body.approvedBy || "unknown",
            action: "ontology_alignment_bypass",
            objectType: "deployment",
            objectId: source.id,
            details: JSON.stringify({
              targetEnv: nextEnv,
              agentName: source.agentName,
              version: source.version,
              bypassedTools: lowAlignmentTools,
              reason: "User explicitly bypassed ontology alignment check during promotion to prod",
            }),
            sequenceNum: maxSeqNum2 + 1,
            previousHash: lastHashVal2,
            eventHash: evtHash2,
            ontologyTags: resolveOntologyTags("deployment", "ontology_alignment_bypass"),
          });
        }
      }
    }

    // Policy gate: fail-closed enforcement for staging/prod promotion
    // Any unhandled error in this block BLOCKS promotion (not allows it).
    // No bypass flag — this gate is mandatory per policy enforcement requirements.
    if (nextEnv === "staging" || nextEnv === "prod") {
      const policyFailingChecks: Array<{ check: string; reason: string; severity: "error" | "warn" }> = [];
      let policyGateError: string | null = null;

      try {
        const pBundle = await resolvePolicyBundle(source.agentId, ctx.orgId);
        const agentForGate = promoteAgent;

        // (a) Check policyJson.promotionBlockedEnvs on applied policies
        const allPoliciesForGate = await storage.getPolicies(ctx.orgId);
        const appliedIds = new Set(pBundle.appliedPolicies.map((p: any) => p.id));
        const applicablePolicies = allPoliciesForGate.filter(p => appliedIds.has(p.id));
        for (const p of applicablePolicies) {
          const pj = p.policyJson as Record<string, any> | null;
          if (!pj) continue;
          const blockedEnvs: string[] = Array.isArray(pj.promotionBlockedEnvs) ? pj.promotionBlockedEnvs : [];
          if (blockedEnvs.includes(nextEnv) || blockedEnvs.includes("*")) {
            policyFailingChecks.push({ check: "policy_promotion_blocked", reason: `Policy "${p.name}" (${p.domain}) blocks promotion to ${nextEnv}`, severity: "error" });
          }
          // (b) Check strict/block enforcement: inspect the most recent completed eval run
          // for this agent. Eval runs are the authoritative compliance evidence for promotion —
          // they are purpose-built regression suites, unlike ad-hoc runtime traces.
          // Falls back to runtime traces only when no eval runs exist for the agent.
          const enforcement = pj.enforcement || "monitor";
          if (enforcement === "strict" || enforcement === "block") {
            // Find the SINGLE latest completed eval run across ALL suites for this agent.
            // Sort globally by completedAt/startedAt DESC — deterministic, not suite-order-dependent.
            const agentEvalSuites = await storage.getEvalsByAgent(source.agentId);
            const allCompletedEvalRuns: Array<{ run: any; suiteId: string }> = [];
            for (const suite of agentEvalSuites) {
              const runs = await storage.getEvalRuns(suite.id);
              for (const r of runs) {
                if (r.status === "completed" || r.status === "failed") {
                  allCompletedEvalRuns.push({ run: r, suiteId: suite.id });
                }
              }
            }
            allCompletedEvalRuns.sort(
              (a, b) =>
                new Date(b.run.completedAt || b.run.startedAt || 0).getTime() -
                new Date(a.run.completedAt || a.run.startedAt || 0).getTime()
            );
            const latestEvalEntry = allCompletedEvalRuns[0];
            if (!latestEvalEntry) {
              // Fail-closed: no completed eval run exists — a strict/block policy cannot be
              // cleared without eval evidence. Block promotion unconditionally.
              policyFailingChecks.push({
                check: "missing_eval_compliance_artifact",
                reason: `Policy "${p.name}" (${enforcement}) requires a completed eval run as compliance evidence — none found. Run an eval suite before promoting.`,
                severity: "error",
              });
            } else {
              // Authoritative path: read policyChecks from resultsJson (same schema as run-trace
              // policyChecks: { violations: [{ toolName, reason, policyIds, ... }] }).
              // Fail-closed if the artifact is absent — an eval run without policyChecks means
              // the compliance check was never recorded and cannot pass a strict/block gate.
              const resultsJson = latestEvalEntry.run.resultsJson as any;
              const evalPolicyChecks = resultsJson?.policyChecks as any;
              if (!evalPolicyChecks) {
                policyFailingChecks.push({
                  check: "missing_eval_policy_checks",
                  reason: `Policy "${p.name}" (${enforcement}) — latest eval run (id: ${latestEvalEntry.run.id}) is missing its policyChecks compliance record. Cannot verify policy gate.`,
                  severity: "error",
                });
              } else {
                // Check violations filtered to this specific policy's ID + version
                const violations: any[] = Array.isArray(evalPolicyChecks.violations)
                  ? evalPolicyChecks.violations.filter((v: any) =>
                      Array.isArray(v.policyIds) ? v.policyIds.includes(p.id) : false
                    )
                  : [];
                if (violations.length > 0) {
                  policyFailingChecks.push({
                    check: "eval_policy_violation",
                    reason: `Policy "${p.name}" v${p.version ?? 1} (${enforcement}) has ${violations.length} violation(s) in latest eval run (id: ${latestEvalEntry.run.id})`,
                    policyId: p.id,
                    policyVersion: p.version ?? 1,
                    severity: "error",
                  } as any);
                }
              }
            }
          }
        }

        // (c) Unresolved hard violations aggregated across ALL completed non-dry-run traces.
        // Checks every run (not just the latest) so older unresolved violations aren't silently
        // cleared by a newer run that happens to have no violations.
        const agentTraces = await storage.getTracesByAgent(source.agentId, ctx.orgId);
        const allCompletedTraces = agentTraces.filter(
          t => t.environment !== "dry-run" && (t.status === "completed" || t.status === "failed")
        );
        let totalUnresolvedViolations = 0;
        for (const trace of allCompletedTraces) {
          const traceChecks = trace.policyChecks as any;
          const violations: any[] = Array.isArray(traceChecks?.violations) ? traceChecks.violations : [];
          totalUnresolvedViolations += violations.length;
        }
        if (totalUnresolvedViolations > 0) {
          policyFailingChecks.push({
            check: "unresolved_hard_violations",
            reason: `${totalUnresolvedViolations} unresolved hard violation(s) across ${allCompletedTraces.length} completed run(s) — blocks promotion to ${nextEnv}`,
            severity: "error",
          });
        }

        // (d) High/Critical risk + autonomous mode always requires manual approval for prod
        const riskTier = agentForGate?.riskTier || "MEDIUM";
        const autonomyMode = agentForGate?.autonomyMode || "assisted";
        if (nextEnv === "prod" && (riskTier === "HIGH" || riskTier === "CRITICAL") && autonomyMode === "autonomous") {
          const approvals = await storage.getApprovals(ctx.orgId);
          const hasPromoApproval = approvals.some(a =>
            a.objectId === source.agentId &&
            a.status === "approved" &&
            (a.type === "deployment_approval" || a.type === "production_promotion") &&
            new Date(a.updatedAt || a.createdAt || 0).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
          );
          if (!hasPromoApproval) {
            policyFailingChecks.push({ check: "manual_approval_required", reason: `Agent is ${riskTier} risk with fully autonomous mode — manual promotion approval required`, severity: "error" });
          }
        }
      } catch (pgErr: any) {
        policyGateError = pgErr.message;
      }

      const hasErrors = policyFailingChecks.some(c => c.severity === "error") || policyGateError !== null;
      if (hasErrors) {
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "policy-gate",
          action: "policy_gate_blocked",
          objectType: "deployment",
          objectId: source.id,
          details: JSON.stringify({
            targetEnv: nextEnv,
            failingChecks: policyFailingChecks,
            gateError: policyGateError,
            agentName: source.agentName,
            version: source.version,
          }),
        }).catch(() => {});
        return { status: 409, body: {
          blocked: true,
          reason: "policy_gate",
          message: policyGateError
            ? `Promotion policy gate failed unexpectedly — blocked for safety: ${policyGateError}`
            : `Promotion to ${nextEnv} blocked: ${policyFailingChecks.filter(c => c.severity === "error").length} policy check(s) failed`,
          failingChecks: policyFailingChecks,
        } };
      }
    }

    await storage.updateDeployment(source.id, { status: "promoted", promotedAt: new Date() }, ctx.orgId);

    const promoted = await storage.createDeployment({
      agentId: source.agentId,
      agentName: source.agentName,
      environment: nextEnv,
      versionId: source.versionId,
      version: source.version,
      status: "pending",
      canaryPercent: source.canaryConfig ? (source.canaryConfig as any).startPercent || 0 : 0,
      rolloutStrategy: source.rolloutStrategy,
      approvedBy: body.approvedBy || source.approvedBy,
      organizationId: source.organizationId ?? undefined,
      signatureHash: source.signatureHash,
      promotedFrom: source.id,
      canaryConfig: source.canaryConfig as any,
      rollbackConfig: source.rollbackConfig as any,
    });

    if (promoted.version && promoted.agentId) {
      await storage.ensureAgentVersion(promoted.agentId, promoted.version, "active");
    }

    if (nextEnv === "prod") {
      const agent = await storage.getAgent(source.agentId, ctx.orgId);
      const evalSuites = await storage.getEvalSuites();
      const agentSuites = evalSuites.filter(s => s.agentId === source.agentId);
      const traces = await storage.getTracesByAgent(source.agentId, ctx.orgId);
      const recentTraces = traces.slice(0, 30);
      const totalT = recentTraces.length;
      const failedT = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
      const successRate = totalT > 0 ? ((totalT - failedT) / totalT * 100) : 100;
      const avgLat = totalT > 0 ? Math.round(recentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalT) : 0;

      const outcomes = await storage.getOutcomes(ctx.orgId);
      const boundOutcomes = outcomes.filter(o => {
        const attrs = (o.attributionRules as any)?.agents;
        return Array.isArray(attrs) && attrs.some((a: any) => a.agentId === source.agentId);
      });
      const invoices = await storage.getInvoices();
      const agentInvoices = invoices.filter(inv => boundOutcomes.some(o => o.id === inv.outcomeId));
      const revenueExposure = agentInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

      await storage.createApproval({
        organizationId: source.organizationId ?? ctx.orgId,
        type: "launch_readiness",
        objectType: "deployment",
        objectId: promoted.id,
        objectName: `${source.agentName || "Agent"} v${source.version} → Production`,
        status: "pending",
        requestedBy: "System (Auto-Promotion)",
        description: `Production launch readiness review for ${source.agentName} v${source.version}. Requires expert validation before deployment goes live.`,
        riskScore: agent?.riskTier === "HIGH" ? 9 : agent?.riskTier === "MEDIUM" ? 6 : 3,
        evidenceJson: {
          agentName: source.agentName,
          version: source.version,
          riskTier: agent?.riskTier || "MEDIUM",
          autonomyMode: agent?.autonomyMode || "supervised",
          evalResults: agentSuites.map(s => ({ name: s.name, passRate: s.passRate, totalCases: s.totalCases })),
          canaryMetrics: {
            successRate: successRate.toFixed(1) + "%",
            avgLatency: avgLat + "ms",
            errorRate: (totalT > 0 ? (failedT / totalT * 100).toFixed(1) : "0") + "%",
            traceCount: totalT,
          },
          // Counted, not invented: "users affected" was the trace count times 30,
          // and runs per day assumed the last 30 traces spanned a week.
          blastRadius: buildBlastRadius({
            environment: "prod",
            traces: recentTraces,
            boundOutcomes,
            revenueExposureUsd: revenueExposure > 0 ? revenueExposure : null,
            rollbackCooldownMinutes: (source.rollbackConfig as any)?.cooldownMinutes ?? null,
          }),
          promotedFrom: source.environment,
          deploymentId: promoted.id,
        },
      });
    } else {
      // Non-prod hop (e.g. staging -> pilot): the promoted deployment is
      // created "pending" and only goes live when an approval attached to
      // it is approved (the approvals PATCH handler activates pending
      // deployments). Without this approval object the deployment waits
      // forever on a review that doesn't exist, while the team page shows
      // "Awaiting deployment approval — review in Governance".
      const promotedAgent = await storage.getAgent(source.agentId, ctx.orgId);
      const promotedRiskTier = promotedAgent?.riskTier || "MEDIUM";
      await storage.createApproval({
        organizationId: source.organizationId ?? ctx.orgId,
        type: "deployment_review",
        objectType: "deployment",
        objectId: promoted.id,
        objectName: `${source.agentName || "Agent"} v${source.version || "?"} → ${nextEnv}`,
        status: "pending",
        requestedBy: "System (Promotion)",
        agentId: source.agentId,
        environment: nextEnv,
        description: `Deployment review required to complete promotion from ${source.environment} to ${nextEnv}. Risk: ${promotedRiskTier}.`,
        riskScore: promotedRiskTier === "CRITICAL" ? 10 : promotedRiskTier === "HIGH" ? 8 : promotedRiskTier === "MEDIUM" ? 5 : 3,
        evidenceJson: {
          agentName: source.agentName,
          version: source.version,
          riskTier: promotedRiskTier,
          environment: nextEnv,
          promotedFrom: source.environment,
          deploymentId: promoted.id,
        },
      });
    }

    const responseBody: any = { ...promoted };
    if (evalWarning) {
      responseBody.evalWarning = evalWarning;
    }
    return { status: 201, body: responseBody };
}

export async function changeRoutingAction(ctx: DeploymentActionContext, id: string, body: any): Promise<ActionResult> {
    const deployment = await storage.getDeployment(id, ctx.orgId);
    if (!deployment) return { status: 404, body: { message: "Deployment not found" } };

    const routingFreezeCheck = await checkDeploymentFreeze(ctx.orgId, deployment.agentId);
    if (routingFreezeCheck.frozen) {
      return { status: 423, body: { message: `Deployments are frozen${routingFreezeCheck.reason ? `: ${routingFreezeCheck.reason}` : ""}`, frozen: true } };
    }

    const { shadowEnabled, canaryPercent, action } = body;
    const updateData: Record<string, unknown> = {};

    if (action === "shadow_on") {
      updateData.shadowEnabled = true;
      updateData.status = "shadow";
    } else if (action === "shadow_off") {
      updateData.shadowEnabled = false;
    } else if (action === "canary_start") {
      const startPercent = canaryPercent || (deployment.canaryConfig as any)?.startPercent || 10;
      updateData.canaryPercent = startPercent;
      updateData.status = "canary";
      updateData.shadowEnabled = false;
      updateData.deployedAt = new Date();
    } else if (action === "canary_increase") {
      // Health check before allowing canary to grow — auto-rollback if metrics fail
      const canaryConfig = (deployment.canaryConfig as any) || {};
      const maxErrorRate: number = canaryConfig.maxErrorRate ?? 0.05;
      const minSuccessRate: number = canaryConfig.minSuccessRate ?? 0.90;
      const recentTraces = await storage.getTracesByAgent(deployment.agentId, ctx.orgId);
      const sample = recentTraces.slice(0, 20);
      if (sample.length >= 5) {
        const successCount = sample.filter(t => t.status === "completed").length;
        const errorRate = 1 - successCount / sample.length;
        if (errorRate > maxErrorRate || successCount / sample.length < minSuccessRate) {
          // Auto-rollback: canary health below thresholds
          const rolled = await storage.updateDeployment(deployment.id, { status: "rolled_back", completedAt: new Date() }, ctx.orgId);
          try { await stopAgentRuntime(deployment.id); } catch (_) {}
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "canary-monitor",
            action: "canary_auto_rollback",
            objectType: "deployment",
            objectId: deployment.id,
            details: JSON.stringify({ errorRate: (errorRate * 100).toFixed(1) + "%", successRate: ((successCount / sample.length) * 100).toFixed(1) + "%", maxErrorRate, minSuccessRate, sampleSize: sample.length }),
          });
          return { status: 409, body: { message: `Canary auto-rolled back: error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(maxErrorRate * 100).toFixed(1)}%`, autoRollback: true, deployment: rolled } };
        }
      }
      const newPercent = Math.min(canaryPercent || (deployment.canaryPercent || 0) + 10, 100);
      updateData.canaryPercent = newPercent;
      if (newPercent >= 100) {
        updateData.status = "active";
        updateData.completedAt = new Date();
      }
    } else if (action === "full_rollout") {
      updateData.canaryPercent = 100;
      updateData.status = "active";
      updateData.shadowEnabled = false;
      updateData.completedAt = new Date();

      if (deployment.incidentId) {
        const incident = await storage.getIncident(deployment.incidentId);
        if (incident && incident.status !== "resolved" && incident.status !== "closed") {
          await storage.updateIncident(incident.id, {
            status: "resolved",
            resolvedAt: new Date(),
            remediationRecord: {
              patchId: deployment.patchId || null,
              deploymentId: deployment.id,
              rolloutStrategy: deployment.rolloutStrategy,
              finalCanaryPercent: 100,
              resolvedAt: new Date().toISOString(),
              duration: incident.createdAt ? `${Math.round((Date.now() - new Date(incident.createdAt).getTime()) / 60000)}m` : "unknown",
            },
          }, ctx.orgId);
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "self_healing_service",
            action: "incident_resolved",
            objectType: "incident",
            objectId: incident.id,
            details: `Incident ${incident.id} resolved via full rollout of deployment ${deployment.id}. Patch: ${deployment.patchId || "N/A"}`,
            ontologyTags: resolveOntologyTags("incident", "incident_resolved"),
          });
        }
      }
    } else if (action === "rollback") {
      updateData.status = "rolled_back";
      updateData.canaryPercent = 0;
      updateData.shadowEnabled = false;

      if (deployment.incidentId) {
        const incident = await storage.getIncident(deployment.incidentId);
        if (incident && incident.status !== "open") {
          await storage.updateIncident(incident.id, {
            status: "open",
            remediationRecord: {
              ...(incident.remediationRecord as object || {}),
              rollbackAt: new Date().toISOString(),
              rollbackDeploymentId: deployment.id,
              rollbackReason: "Canary gates failed or manual rollback triggered",
            },
          }, ctx.orgId);
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "self_healing_service",
            action: "incident_reopened",
            objectType: "incident",
            objectId: incident.id,
            details: `Incident ${incident.id} reopened: deployment ${deployment.id} rolled back`,
            ontologyTags: resolveOntologyTags("incident", "incident_reopened"),
          });
        }
      }
    } else {
      if (shadowEnabled !== undefined) updateData.shadowEnabled = shadowEnabled;
      if (canaryPercent !== undefined) updateData.canaryPercent = canaryPercent;
    }

    const updated = await storage.updateDeployment(deployment.id, updateData, ctx.orgId);

    const allEvents = await storage.getAuditEvents(ctx.orgId);
    const maxSeq = allEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
          const lastHash = allEvents.length > 0 ? allEvents[allEvents.length - 1].eventHash || "" : "";
    const eventData = `${maxSeq + 1}:routing_change:${deployment.id}:${Date.now()}`;
    const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

    await storage.createAuditEvent({
      actorType: "system",
      actorId: "routing_service",
      action: `routing_${action || "update"}`,
      objectType: "deployment",
      objectId: deployment.id,
      ontologyTags: resolveOntologyTags("deployment", `routing_${action || "update"}`),
      details: `Routing update for ${deployment.agentName || "agent"}: ${action || "manual"} | shadow=${updateData.shadowEnabled ?? deployment.shadowEnabled} canary=${updateData.canaryPercent ?? deployment.canaryPercent}%`,
      sequenceNum: maxSeq + 1,
      previousHash: lastHash,
      eventHash,
    });

    if (updateData.status === "active" && deployment.status !== "active") {
      const agent = await storage.getAgent(deployment.agentId, ctx.orgId);
      const srcTplId = agent?.sourceTemplateId || (agent?.runtimeConfig as any)?.sourceTemplateId;
      if (srcTplId) {
        await storage.incrementTemplateDeployments(srcTplId);
      }
      // Auto-generate/refresh AAR config when routing transition reaches active
      ensureAarConfig(deployment.agentId).catch(() => {});
    }

    return { status: 200, body: updated };
}

export async function rollbackDeploymentAction(ctx: DeploymentActionContext, id: string, body: any): Promise<ActionResult> {
    const deployment = await storage.getDeployment(id, ctx.orgId);
    if (!deployment) return { status: 404, body: { message: "Deployment not found" } };

    const updated = await storage.updateDeployment(deployment.id, {
      status: "rolled_back",
      completedAt: new Date(),
    }, ctx.orgId);

    // Kill any in-flight execution cycles so rolled-back agents don't keep running
    try { await stopAgentRuntime(deployment.id); } catch (_) {}

    const reason = body?.reason || "Manual rollback triggered";
    const auditEvents = await storage.getAuditEvents(ctx.orgId);
    const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
    const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
          const eventData = `${maxSeq + 1}:deployment_rollback:${deployment.id}:${Date.now()}`;
    const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

    await storage.createAuditEvent({
      actorType: "system",
      actorId: "release-service",
      action: "deployment_rollback_incident",
      objectType: "deployment",
      objectId: deployment.id,
      details: JSON.stringify({
        type: "incident",
        severity: deployment.environment === "prod" ? "high" : "medium",
        agentId: deployment.agentId,
        agentName: deployment.agentName,
        version: deployment.version,
        environment: deployment.environment,
        rolloutStrategy: deployment.rolloutStrategy,
        reason,
        rolledBackAt: new Date().toISOString(),
        previousStatus: deployment.status,
      }),
      sequenceNum: maxSeq + 1,
      previousHash: lastHash,
      eventHash,
    });

    return { status: 200, body: updated };
}
