/**
 * Read-only reporting layer for PRD S1.1.4 ("read the same document
 * engineering works from"): regulatory-ceiling lookup and the version-history
 * diff computation, kept pure and separately testable (mirrors
 * server/mandate-lint.ts's shape). No write path lives here.
 */
import type { Agent, AuditEvent } from "@shared/schema";
import { storage } from "./storage";

export interface RegulatoryCeiling {
  description: string;
  articleRef: string;
  sourceRegulation: string;
  regulationFullName: string | null;
  jurisdiction: string | null;
  severity: string;
}

// agents.policyBindings is jsonb, not a hard-typed relation (see
// shared/schema.ts) -- the shape actually written is { policyId, enforcement }
// (server/routes/mandates.ts's /decide handler).
export async function getRegulatoryCeilings(agent: Agent, orgId?: string): Promise<RegulatoryCeiling[]> {
  const bindings: Array<{ policyId?: string }> = Array.isArray(agent.policyBindings) ? (agent.policyBindings as any[]) : [];
  if (!bindings.length) return [];

  const ceilings: RegulatoryCeiling[] = [];
  const regulationCache = new Map<string, Awaited<ReturnType<typeof storage.getRegulation>>>();

  for (const binding of bindings) {
    if (!binding.policyId) continue;
    const policy = await storage.getPolicy(binding.policyId, orgId);
    if (!policy) continue;
    // A policy can carry multiple rules -- check every element, not just the
    // first, or ceilings from a mixed policy pack go missing silently.
    const rules: any[] = Array.isArray((policy.policyJson as any)?.rules) ? (policy.policyJson as any).rules : [];
    for (const rule of rules) {
      if (rule?.type !== "regulatory_enforcement") continue;
      let regulationFullName: string | null = null;
      let jurisdiction: string | null = null;
      if (rule.sourceRegulationId) {
        if (!regulationCache.has(rule.sourceRegulationId)) {
          regulationCache.set(rule.sourceRegulationId, await storage.getRegulation(rule.sourceRegulationId));
        }
        const reg = regulationCache.get(rule.sourceRegulationId);
        regulationFullName = reg?.fullName ?? null;
        jurisdiction = reg?.jurisdiction ?? null;
      }
      ceilings.push({
        description: rule.description || "",
        articleRef: rule.articleRef || "",
        sourceRegulation: rule.sourceRegulation || "Unknown",
        regulationFullName,
        jurisdiction,
        severity: rule.severity || "medium",
      });
    }
  }
  return ceilings;
}

// The mandate fields that constitute "the document" -- id/agentId/
// organizationId/createdAt/updatedAt are identity/bookkeeping, not content,
// and would otherwise produce a spurious diff entry on every single save.
const MANDATE_SNAPSHOT_FIELDS = [
  "accountableOwnerUserId", "whatItDoes", "mustNever", "whenToAskAHuman",
  "whenToStop", "fallbackBehavior", "howWeKnowItsWorking", "status", "version",
  "approvedBy", "approvedAt",
] as const;

// Called at write time (server/routes/mandates.ts) to build the audit
// event's `details` payload, and read back at history time by
// computeMandateHistoryDiff below -- the same field list on both ends is
// what keeps the diff meaningful.
export function snapshotMandateForAudit(mandate: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of MANDATE_SNAPSHOT_FIELDS) snapshot[field] = (mandate as any)[field] ?? null;
  return snapshot;
}

export interface MandateHistoryEntry {
  version: number;
  action: string;
  actorId: string | null;
  createdAt: string;
  diff: Array<{ field: string; from: unknown; to: unknown }>;
  eventHash: string | null;
}

// Mirrors server/routes/improvements.ts's GET .../timeline pattern: diffs
// are computed at READ time from stored snapshots, never persisted as their
// own object.
export function computeMandateHistoryDiff(events: AuditEvent[]): MandateHistoryEntry[] {
  const parsed = events
    .map(event => {
      let snapshot: Record<string, unknown> | null = null;
      try {
        snapshot = event.details ? JSON.parse(event.details) : null;
      } catch {
        snapshot = null;
      }
      return { event, snapshot };
    })
    .filter((x): x is { event: AuditEvent; snapshot: Record<string, unknown> } => !!x.snapshot)
    .sort((a, b) => new Date(a.event.createdAt || 0).getTime() - new Date(b.event.createdAt || 0).getTime());

  const entries: MandateHistoryEntry[] = [];
  let prev: Record<string, unknown> | null = null;
  for (const { event, snapshot } of parsed) {
    const diff: Array<{ field: string; from: unknown; to: unknown }> = [];
    if (prev) {
      for (const field of MANDATE_SNAPSHOT_FIELDS) {
        const from = prev[field];
        const to = snapshot[field];
        if (from !== to) diff.push({ field, from: from ?? "—", to: to ?? "—" });
      }
    } else {
      diff.push({ field: "mandate", from: "—", to: "created" });
    }
    entries.push({
      version: Number(snapshot.version) || entries.length + 1,
      action: event.action,
      actorId: event.actorId ?? null,
      createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
      diff,
      eventHash: event.eventHash ?? null,
    });
    prev = snapshot;
  }
  return entries;
}
