import type { Request, Response, NextFunction } from "express";

type RoleId =
  | "admin"
  | "outcome_owner"
  | "agent_engineer"
  | "ops_sre"
  | "compliance_security"
  | "expert_validator"
  | "finance";

type PermissionAction =
  | "create_modify_outcomes"
  | "create_modify_blueprints"
  | "deploy_staging_pilot"
  | "deploy_prod"
  | "create_modify_policies"
  | "view_traces"
  | "export_audit_bundle"
  | "approve_changes"
  | "billing_invoices";

type AccessLevel = "full" | "conditional" | "denied";

const PERMISSION_MATRIX: Record<RoleId, Record<PermissionAction, AccessLevel>> = {
  admin: {
    create_modify_outcomes: "full",
    create_modify_blueprints: "full",
    deploy_staging_pilot: "full",
    deploy_prod: "full",
    create_modify_policies: "full",
    view_traces: "full",
    export_audit_bundle: "full",
    approve_changes: "full",
    billing_invoices: "full",
  },
  outcome_owner: {
    create_modify_outcomes: "full",
    create_modify_blueprints: "denied",
    deploy_staging_pilot: "denied",
    deploy_prod: "denied",
    create_modify_policies: "denied",
    view_traces: "conditional",
    export_audit_bundle: "conditional",
    approve_changes: "denied",
    billing_invoices: "conditional",
  },
  agent_engineer: {
    create_modify_outcomes: "conditional",
    create_modify_blueprints: "full",
    deploy_staging_pilot: "full",
    deploy_prod: "conditional",
    create_modify_policies: "denied",
    view_traces: "conditional",
    export_audit_bundle: "denied",
    approve_changes: "denied",
    billing_invoices: "denied",
  },
  ops_sre: {
    create_modify_outcomes: "denied",
    create_modify_blueprints: "conditional",
    deploy_staging_pilot: "full",
    deploy_prod: "conditional",
    create_modify_policies: "denied",
    view_traces: "conditional",
    export_audit_bundle: "conditional",
    approve_changes: "denied",
    billing_invoices: "denied",
  },
  compliance_security: {
    create_modify_outcomes: "conditional",
    create_modify_blueprints: "conditional",
    deploy_staging_pilot: "conditional",
    deploy_prod: "conditional",
    create_modify_policies: "full",
    view_traces: "conditional",
    export_audit_bundle: "full",
    approve_changes: "denied",
    billing_invoices: "denied",
  },
  expert_validator: {
    create_modify_outcomes: "conditional",
    create_modify_blueprints: "conditional",
    deploy_staging_pilot: "conditional",
    deploy_prod: "conditional",
    create_modify_policies: "conditional",
    view_traces: "full",
    export_audit_bundle: "full",
    approve_changes: "full",
    billing_invoices: "denied",
  },
  finance: {
    create_modify_outcomes: "denied",
    create_modify_blueprints: "denied",
    deploy_staging_pilot: "denied",
    deploy_prod: "denied",
    create_modify_policies: "denied",
    view_traces: "denied",
    export_audit_bundle: "conditional",
    approve_changes: "denied",
    billing_invoices: "full",
  },
};

const VALID_ROLES = new Set<string>(Object.keys(PERMISSION_MATRIX));

export function getRequestRole(req: Request): RoleId {
  const role = req.headers["x-role"] as string;
  if (role && VALID_ROLES.has(role)) return role as RoleId;
  return "admin";
}

export function checkPermission(action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getRequestRole(req);
    const access = PERMISSION_MATRIX[role]?.[action];
    if (access === "denied") {
      return res.status(403).json({
        message: "Permission denied",
        role,
        action,
        requiredAccess: action,
      });
    }
    (req as any).permissionAccess = access;
    (req as any).userRole = role;
    next();
  };
}

export function getTraceRedactionLevel(role: RoleId): "full" | "less_redaction" | "redacted" | "denied" {
  switch (role) {
    case "admin":
    case "expert_validator":
      return "full";
    case "compliance_security":
      return "less_redaction";
    case "outcome_owner":
    case "agent_engineer":
    case "ops_sre":
      return "redacted";
    case "finance":
    default:
      return "denied";
  }
}
