/**
 * Guardrail flags into the Approval Queue (Phase 3, item 9).
 *
 * A team run records a judgment for every policy bound to each agent step and
 * for a review step's verdict against the run's facts (NodeExecutionResult
 * .judgments in server/dag-execution-engine.ts). Until now a flag ended at the
 * run monitor: someone had to open the run to learn of it. When the platform
 * setting GUARDRAIL_REVIEW is on, a finished run whose flags are worth a
 * person's attention raises ONE review in the Approval Queue, carrying the
 * flags as its evidence.
 *
 * Worth a person's attention: a verdict that disagrees with the facts, or a
 * policy flag of high severity. Lower-severity policy flags stay on the run
 * and in the guardrail_flags KPI statistic; a queue item per medium flag is
 * how a queue gets ignored.
 *
 * The review changes nothing about the run, which has already finished:
 * approving acknowledges the flags, rejecting dismisses them. Off by default,
 * and raising one can never fail a run.
 */
import { storage } from "./storage";

export const GUARDRAIL_REVIEW_SETTING = "GUARDRAIL_REVIEW";
export const GUARDRAIL_REVIEW_TYPE = "guardrail_review";

export interface ReviewFlag {
  step: string;
  kind: "policy" | "facts";
  subject: string;
  severity?: string;
  evidence?: string;
}

type WaveLike = { nodes?: Array<{ nodeId?: string; judgments?: Array<{ kind?: string; subject?: string; ok?: boolean; severity?: string; evidence?: string }> }> };

/**
 * The flags that warrant a review, one per step and subject. A wave that was
 * revised appears twice in the results; the later judgment is the one kept.
 */
export function reviewableFlags(waveResults: unknown, labelOf: (nodeId: string) => string): ReviewFlag[] {
  const latest = new Map<string, ReviewFlag | null>();
  for (const wave of (Array.isArray(waveResults) ? waveResults : []) as WaveLike[]) {
    for (const node of wave?.nodes ?? []) {
      const step = labelOf(String(node?.nodeId ?? ""));
      for (const j of node?.judgments ?? []) {
        if (!j || (j.kind !== "policy" && j.kind !== "facts")) continue;
        const key = `${step}\u0000${j.kind}\u0000${j.subject ?? ""}`;
        const reviewable = j.ok === false && (j.kind === "facts" || String(j.severity ?? "").toLowerCase() === "high");
        latest.set(key, reviewable
          ? { step, kind: j.kind, subject: String(j.subject ?? ""), ...(j.severity ? { severity: j.severity } : {}), ...(j.evidence ? { evidence: String(j.evidence).slice(0, 1_000) } : {}) }
          : null);
      }
    }
  }
  return Array.from(latest.values()).filter((f): f is ReviewFlag => f !== null);
}

async function reviewOn(): Promise<boolean> {
  try {
    const row = await (storage as { getPlatformSetting?: (key: string) => Promise<{ value?: string | null } | undefined> }).getPlatformSetting?.(GUARDRAIL_REVIEW_SETTING);
    return String(row?.value ?? "").trim().toLowerCase() === "on";
  } catch {
    return false;
  }
}

/** Raise one review for a finished run's reviewable flags. Returns the approval's id, or null when there is nothing to raise. */
export async function raiseGuardrailReview(args: {
  teamAgentId: string;
  dagRunId: string;
  waveResults: unknown;
  labelOf: (nodeId: string) => string;
}): Promise<string | null> {
  try {
    if (!(await reviewOn())) return null;
    const flags = reviewableFlags(args.waveResults, args.labelOf);
    if (flags.length === 0) return null;
    const team = await storage.getAgent(args.teamAgentId).catch(() => undefined);
    const facts = flags.filter((f) => f.kind === "facts").length;
    const policy = flags.length - facts;
    const parts = [
      ...(policy ? [`${policy} high-severity policy ${policy === 1 ? "flag" : "flags"}`] : []),
      ...(facts ? [`${facts} ${facts === 1 ? "verdict" : "verdicts"} that disagree with the run's facts`] : []),
    ];
    const approval = await storage.createApproval({
      ...(team?.organizationId ? { organizationId: team.organizationId } : {}),
      type: GUARDRAIL_REVIEW_TYPE,
      objectType: "dag_run",
      objectId: args.dagRunId,
      objectName: `${team?.name ?? "Team run"}: ${flags.length} guardrail ${flags.length === 1 ? "flag" : "flags"}`,
      status: "pending",
      requestedBy: args.teamAgentId,
      requesterType: "agent",
      agentId: args.teamAgentId,
      riskScore: facts > 0 ? 0.75 : 0.65,
      description: `A run of ${team?.name ?? "this team"} finished with ${parts.join(" and ")}: ${flags.slice(0, 3).map((f) => `${f.step} (${f.subject})`).join("; ")}${flags.length > 3 ? "; and more" : ""}. The run has already finished; this asks someone to look.`,
      evidenceJson: { dagRunId: args.dagRunId, flags },
    } as any);
    return approval?.id ?? null;
  } catch (err: unknown) {
    console.warn(`[guardrail-review] could not raise a review for run ${args.dagRunId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
