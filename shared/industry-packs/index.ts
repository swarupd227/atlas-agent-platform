/**
 * Industry pack registry.
 *
 * Adding a vertical means adding a pack file and one line here — not editing
 * industry-provider.tsx, industry-assurance.ts, industry-deployment-pipeline.ts,
 * policy-packs.ts, server/routes.ts, agent-wizard.tsx, outcome-discover.tsx and
 * ten dropdown lists, which is what it used to mean.
 *
 * The seven original industries still live in their historical arrays; the
 * selectors below are what the platform merges pack content in through, so a
 * pack and a built-in are indistinguishable downstream. Those seven can be
 * migrated into packs incrementally without changing any consumer.
 */
import type {
  IndustryPack, IndustryScorer, RegulatoryTemplate, KpiDimension,
  RegressionImpactTemplate, ProductionEdgeCase, PipelineStage, RollbackTrigger,
  EvidenceItem, PolicyPack, EvalFramework, StarterPrompt, WizardPreset, WizardContext,
} from "./types";
import { EQUIPMENT_DEALER_PACK } from "./equipment-dealer";

export * from "./types";

/** Every industry supplied as a pack. Order determines menu order. */
export const INDUSTRY_PACKS: IndustryPack[] = [
  EQUIPMENT_DEALER_PACK,
];

export const PACK_INDUSTRY_IDS: string[] = INDUSTRY_PACKS.map((p) => p.id);

export function getIndustryPack(id: string): IndustryPack | undefined {
  return INDUSTRY_PACKS.find((p) => p.id === id);
}

/** id -> display label, for the many places that render an industry name. */
export const packIndustryLabels: Record<string, string> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.profile.label])
);

/** Ready-made {value,label} options for industry dropdowns. */
export const packIndustryOptions: Array<{ value: string; label: string }> = INDUSTRY_PACKS.map(
  (p) => ({ value: p.id, label: p.profile.label })
);

/** id -> terminology overrides. */
export const packIndustryTerms: Record<string, Record<string, string>> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.terminology])
);

// ── Flattened selectors, shaped to match the platform's existing arrays ──────
export const packScorers: IndustryScorer[] = INDUSTRY_PACKS.flatMap((p) => p.assurance.scorers);
export const packRegulatoryTemplates: RegulatoryTemplate[] = INDUSTRY_PACKS.flatMap((p) => p.assurance.regulatoryTemplates);
export const packKpiDimensions: KpiDimension[] = INDUSTRY_PACKS.flatMap((p) => p.assurance.kpiDimensions);
export const packRegressionImpactTemplates: RegressionImpactTemplate[] = INDUSTRY_PACKS.flatMap((p) => p.assurance.regressionImpactTemplates);
export const packProductionEdgeCases: ProductionEdgeCase[] = INDUSTRY_PACKS.flatMap((p) => p.assurance.productionEdgeCases);
export const packPolicyPacks: PolicyPack[] = INDUSTRY_PACKS.flatMap((p) => p.policyPacks);

export const packPipelineStages: Record<string, PipelineStage[]> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.deployment.pipelineStages])
);
export const packRollbackTriggers: Record<string, RollbackTrigger[]> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.deployment.rollbackTriggers])
);
export const packEvidenceItems: Record<string, EvidenceItem[]> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.deployment.evidenceItems])
);
export const packEvalFrameworks: Record<string, EvalFramework> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.evalFramework])
);
export const packWizardPresets: Record<string, WizardPreset> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.wizard.preset])
);
export const packWizardContexts: Record<string, WizardContext> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.wizard.context])
);
export const packStarterPrompts: Record<string, StarterPrompt[]> = Object.fromEntries(
  INDUSTRY_PACKS.map((p) => [p.id, p.starterPrompts])
);

/**
 * Sanity check for pack authors — a pack that declares an eval framework whose
 * id disagrees with its own industry id will bind to nothing at runtime, and
 * that failure is otherwise silent.
 */
export function validateIndustryPacks(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const p of INDUSTRY_PACKS) {
    if (seen.has(p.id)) errors.push(`duplicate industry pack id "${p.id}"`);
    seen.add(p.id);
    if (p.evalFramework.id !== p.id) {
      errors.push(`${p.id}: evalFramework.id is "${p.evalFramework.id}" — must equal the pack id`);
    }
    if (!p.profile.iconName) errors.push(`${p.id}: profile.iconName is required`);
    for (const [label, rows] of [
      ["scorers", p.assurance.scorers],
      ["kpiDimensions", p.assurance.kpiDimensions],
      ["regulatoryTemplates", p.assurance.regulatoryTemplates],
      ["productionEdgeCases", p.assurance.productionEdgeCases],
    ] as const) {
      for (const r of rows as Array<{ industry: string; id?: string }>) {
        if (r.industry !== p.id) {
          errors.push(`${p.id}: ${label} entry "${r.id ?? "?"}" has industry "${r.industry}"`);
        }
      }
    }
    for (const pk of p.policyPacks) {
      if (pk.industry !== p.id) errors.push(`${p.id}: policy pack "${pk.id}" has industry "${pk.industry}"`);
    }
  }
  return { ok: errors.length === 0, errors };
}
