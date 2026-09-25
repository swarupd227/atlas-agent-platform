/**
 * Declaring what measures a KPI, and recording a measurement.
 *
 * The Outcomes page and Astra Cowork both do these two things, so they do them
 * here: same organization check, same refusals, same audit record, whether the
 * value was typed into a form or spoken into a conversation.
 *
 * The rules that live here rather than in a caller:
 *   - a KPI belongs to its outcome, and the outcome to an organization; a KPI
 *     outside the caller's organization is not found, not forbidden;
 *   - a value can't be recorded against a KPI that agent runs keep up to date,
 *     because the next run would overwrite it. The caller is told why;
 *   - recording a value declares the KPI measured by a person, so a run
 *     doesn't quietly take it back;
 *   - a reading taken earlier than the current value is kept as history
 *     without rewriting what the KPI reads now.
 */
import { storage } from "./storage";
import { breachesThreshold, describeSource, parseMeasurementSource, trendBetween, type MeasurementSource } from "@shared/kpi-measurement";
import type { KpiDefinition, KpiReading } from "@shared/schema";

export interface KpiActor {
  orgId: string | undefined;
  /** The signed-in user's id, when there is one. */
  actorId: string | null;
  /** The name to show in the audit trail. */
  actorLabel: string;
  /** Where it was done: "Outcomes page", "Astra Cowork". */
  via: string;
}

export class KpiActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The KPI, if it belongs to one of this organization's outcomes. */
export async function getKpiInOrg(kpiId: string, orgId: string | undefined): Promise<KpiDefinition | null> {
  const kpi = await storage.getKpi(kpiId);
  if (!kpi) return null;
  const outcome = await storage.getOutcome(kpi.outcomeId, orgId);
  return outcome ? kpi : null;
}

async function requireKpi(kpiId: string, orgId: string | undefined): Promise<KpiDefinition> {
  const kpi = await getKpiInOrg(kpiId, orgId);
  if (!kpi) throw new KpiActionError("No KPI with that id in this organization.", 404);
  return kpi;
}

/** Declare what measures a KPI, or clear it back to nothing measuring it. */
export async function declareKpiMeasurement(actor: KpiActor, kpiId: string, source: MeasurementSource | null): Promise<{ kpi: KpiDefinition; describes: string; was: string }> {
  const kpi = await requireKpi(kpiId, actor.orgId);
  const before = parseMeasurementSource((kpi as any).measurementSource);
  const updated = (await storage.updateKpi(kpi.id, { measurementSource: source } as any)) ?? kpi;

  await storage.createAuditEvent({
    organizationId: actor.orgId,
    actorType: "user",
    actorId: actor.actorId ?? actor.actorLabel,
    objectType: "kpi",
    objectId: kpi.id,
    action: "kpi_measurement_declared",
    details: JSON.stringify({ kpi: kpi.name, from: describeSource(before), to: describeSource(source), via: actor.via }),
  });

  return { kpi: updated, describes: describeSource(source), was: describeSource(before) };
}

export interface RecordedReading {
  reading: KpiReading;
  kpi: KpiDefinition;
  /** Whether this is now what the KPI reads, or was filed behind a later one. */
  appliedAsCurrent: boolean;
  breached: boolean;
}

/** Record a measurement somebody took. */
export async function recordKpiReading(
  actor: KpiActor,
  kpiId: string,
  input: { value: number; takenAt?: Date; note?: string | null },
): Promise<RecordedReading> {
  const kpi = await requireKpi(kpiId, actor.orgId);
  const source = parseMeasurementSource((kpi as any).measurementSource);
  if (source?.kind === "agent_runs") {
    throw new KpiActionError(
      `"${kpi.name}" is measured by agent runs, so a recorded value would be overwritten on the next run. Change what measures it to "recorded by a person" first.`,
      409,
    );
  }

  const takenAt = input.takenAt ?? new Date();
  const reading = await storage.createKpiReading({
    kpiId: kpi.id,
    outcomeId: kpi.outcomeId,
    organizationId: actor.orgId ?? null,
    value: input.value,
    takenAt,
    source: "manual",
    statistic: null,
    windowDays: null,
    note: input.note ?? null,
    recordedBy: actor.actorId,
    recordedByName: actor.actorLabel,
  });

  const appliedAsCurrent = !kpi.valueUpdatedAt || takenAt >= new Date(kpi.valueUpdatedAt);
  let updated = kpi;
  if (appliedAsCurrent) {
    updated = (await storage.updateKpi(kpi.id, {
      currentValue: input.value,
      trend: trendBetween(kpi.valueUpdatedAt ? kpi.currentValue : null, input.value),
      valueSource: "manual",
      valueUpdatedAt: takenAt,
      measurementSource: source ?? { kind: "manual" },
    } as any)) ?? kpi;
  }

  await storage.createAuditEvent({
    organizationId: actor.orgId,
    actorType: "user",
    actorId: actor.actorId ?? actor.actorLabel,
    objectType: "kpi",
    objectId: kpi.id,
    action: "kpi_value_recorded",
    details: JSON.stringify({
      kpi: kpi.name,
      value: input.value,
      unit: kpi.unit,
      takenAt: takenAt.toISOString(),
      note: input.note ?? null,
      via: actor.via,
    }),
  });

  return { reading, kpi: updated, appliedAsCurrent, breached: breachesThreshold(input.value, kpi.slaThreshold, kpi.targetOperator) };
}
