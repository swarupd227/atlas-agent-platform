import { z } from "zod";
import { isKnownIndustry } from "./industry-filter";

export const DEMO_INDUSTRY_ENABLED_KEY = "DEMO_INDUSTRY_VISIBILITY";
export const DEMO_INDUSTRY_USER_PREFIX = "DEMO_INDUSTRY_USER:";
export const demoIndustryUserKey = (userId: string) => DEMO_INDUSTRY_USER_PREFIX + userId;
const canonicalIndustry = (id: string) => id.trim().toLowerCase() === "cross_industry" ? "custom" : id.trim().toLowerCase();
export const demoIndustryAssignmentSchema = z.object({
  clientLabel: z.string().trim().min(1).max(120),
  allowedIndustryIds: z.array(z.string().transform(canonicalIndustry)).min(1).max(64)
    .transform(ids => [...new Set(ids)]).refine(ids => ids.every(isKnownIndustry), "Choose registered industries."),
  defaultIndustryId: z.string().transform(canonicalIndustry).refine(isKnownIndustry, "Choose a registered default."),
}).strict().refine(value => value.allowedIndustryIds.includes(value.defaultIndustryId), {
  message: "The default must be one of the selected industries.", path: ["defaultIndustryId"],
});
export type DemoIndustryAssignment = z.infer<typeof demoIndustryAssignmentSchema>;
export interface DemoIndustryVisibility {
  enabled: boolean;
  canManage: boolean;
  configured: boolean;
  allowedIndustryIds: string[];
  defaultIndustryId: string | null;
}

/** Presentation only: this deliberately does not authorize backend resources. */
export function visibleDemoIndustries<T extends { id: string }>(industries: T[], visibility?: DemoIndustryVisibility): T[] {
  if (!visibility) return [];
  if (!visibility.enabled || visibility.canManage) return industries;
  if (!visibility.configured) return [];
  return industries.filter(industry => visibility.allowedIndustryIds.includes(industry.id));
}

export function demoIndustrySelection(current: string | null, visibility: DemoIndustryVisibility | undefined, industries: { id: string }[]): string | null {
  const visible = visibleDemoIndustries(industries, visibility);
  if (current && visible.some(i => i.id === current)) return current;
  if (visibility?.enabled && !visibility.canManage && visibility.configured && visible.some(i => i.id === visibility.defaultIndustryId)) return visibility.defaultIndustryId;
  return null;
}

export interface DemoIndustryOptions { includeAll?: boolean; general?: boolean; excludeCrossIndustry?: boolean }
export function demoIndustryOptionValues(visibleIds: string[], options: DemoIndustryOptions = {}): string[] {
  return [
    ...(options.includeAll ? ["all"] : []),
    ...(options.general && !options.excludeCrossIndustry && visibleIds.includes("custom") ? ["general"] : []),
    ...visibleIds.filter(id => !options.excludeCrossIndustry || id !== "custom").map(id => id === "custom" ? "cross_industry" : id),
  ];
}
/** Keep a form's submitted value aligned with the actual rendered options. */
export function demoIndustryFormValue(current: string, visibleIds: string[], preferred: string | null, options: DemoIndustryOptions = {}): string | null {
  const values = demoIndustryOptionValues(visibleIds, options);
  if (!values.length) return null;
  const normalized = current === "custom" ? "cross_industry" : current;
  if (values.includes(normalized)) return normalized;
  const next = preferred === "custom" ? "cross_industry" : preferred;
  return next && values.includes(next) ? next : values[0];
}
