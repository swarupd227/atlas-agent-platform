/**
 * The organization's industry, as the server sees it.
 *
 * Read on most requests that care about industry, so it is cached briefly per
 * organization (same approach as the Astra flag cache); the one write path
 * invalidates the entry. The precedence rules live in shared/industry-filter.ts.
 */
import type { Request } from "express";
import { getDefaultOrgId, getOrgId } from "./auth";
import { storage } from "./storage";
import { resolveIndustrySelection, type IndustrySelection } from "@shared/industry-filter";

export interface TenantIndustry {
  industryId: string | null;
  subVertical: string | null;
  workspaceConfig: unknown | null;
  setAt: Date | null;
  setBy: string | null;
}

const EMPTY: TenantIndustry = { industryId: null, subVertical: null, workspaceConfig: null, setAt: null, setBy: null };
const TTL_MS = 30_000;
const cache = new Map<string, { value: TenantIndustry; at: number }>();

export async function getTenantIndustry(orgId: string | null | undefined): Promise<TenantIndustry> {
  if (!orgId) return EMPTY;
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const org = await storage.getOrganization(orgId).catch(() => undefined);
  const value: TenantIndustry = org
    ? {
        industryId: org.industryId ?? null,
        subVertical: org.subVertical ?? null,
        workspaceConfig: org.workspaceConfig ?? null,
        setAt: org.industrySetAt ?? null,
        setBy: org.industrySetBy ?? null,
      }
    : EMPTY;
  cache.set(orgId, { value, at: Date.now() });
  return value;
}

export function invalidateTenantIndustry(orgId: string): void {
  cache.delete(orgId);
}

/** The caller's organization. */
export function requestOrgId(req: Request): string | undefined {
  return getOrgId(req) ?? getDefaultOrgId();
}

/** The industry in effect for a request: an explicitly requested one, else the organization's. */
export async function resolveIndustry(
  req: Request,
  requested?: string | null,
  requestedSubVertical?: string | null,
): Promise<IndustrySelection> {
  const tenant = await getTenantIndustry(requestOrgId(req));
  return resolveIndustrySelection({
    requested,
    requestedSubVertical,
    tenantIndustryId: tenant.industryId,
    tenantSubVertical: tenant.subVertical,
  });
}
