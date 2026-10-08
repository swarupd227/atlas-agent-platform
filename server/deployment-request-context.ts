/**
 * Who is acting on a deployment, read from the request: the organization, the signed-in person's
 * name for the audit trail, and whether they hold deploy_prod. Kept apart from
 * deployment-lifecycle.ts so the lifecycle rules do not depend on the web layer.
 */
import type { Request } from "express";
import { getOrgId } from "./auth";
import { getRequestActorLabel, getRequestRole, hasPermission } from "./permissions";
import type { LifecycleContext } from "./deployment-lifecycle";

export function lifecycleContext(req: Request): LifecycleContext {
  return {
    orgId: getOrgId(req),
    actor: getRequestActorLabel(req),
    canDeployProd: hasPermission(getRequestRole(req), "deploy_prod"),
  };
}
