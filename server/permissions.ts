import type { Request, Response, NextFunction } from "express";
import { getSecurityMode } from "./auth";

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
  | "billing_invoices"
  | "manage_mcp_servers";

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
    manage_mcp_servers: "full",
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
    manage_mcp_servers: "denied",
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
    manage_mcp_servers: "conditional",
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
    manage_mcp_servers: "denied",
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
    manage_mcp_servers: "full",
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
    manage_mcp_servers: "conditional",
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
    manage_mcp_servers: "denied",
  },
};

const VALID_ROLES = new Set<string>(Object.keys(PERMISSION_MATRIX));

export function getRequestRole(req: Request): RoleId {
  if (getSecurityMode() === "production" && req.authUser) {
    const role = req.authUser.role;
    if (VALID_ROLES.has(role)) return role as RoleId;
    return "agent_engineer";
  }
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

export type RedactionLevel = "R0" | "R1" | "R2";

export function getRedactionLevel(role: RoleId): RedactionLevel {
  switch (role) {
    case "admin":
    case "compliance_security":
      return "R0";
    case "agent_engineer":
    case "ops_sre":
    case "expert_validator":
      return "R1";
    case "outcome_owner":
    case "finance":
    default:
      return "R2";
  }
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

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
];

const FINANCIAL_KEYS = ["costUsd", "amount", "revenue", "revenueExposure", "unitPrice", "pricePerUnit", "unitValue", "totalAmount"];
const SENSITIVE_KEYS = ["evidenceJson", "constraintsJson", "payload", "policyJson", "diff", "evidenceBundle", "toolsConfig", "permissionsConfig"];
const IDENTITY_KEYS = ["actorId", "requestedBy", "decidedBy", "approvedBy", "owner", "submittedBy", "signedBy"];

export interface OntologySensitivityEntry {
  conceptId: string;
  label: string;
  level: string;
  dataTypes: string[];
  redactionRequired: boolean;
  retentionDays: number | null;
}

let cachedOntologySensitivityKeys: { keys: string[]; entries: OntologySensitivityEntry[]; cachedAt: number } | null = null;
const SENSITIVITY_CACHE_TTL_MS = 60_000;

export async function getOntologySensitivityKeys(): Promise<{ keys: string[]; entries: OntologySensitivityEntry[] }> {
  if (cachedOntologySensitivityKeys && Date.now() - cachedOntologySensitivityKeys.cachedAt < SENSITIVITY_CACHE_TTL_MS) {
    return { keys: cachedOntologySensitivityKeys.keys, entries: cachedOntologySensitivityKeys.entries };
  }

  try {
    const { storage } = await import("./storage");
    const allConcepts = await storage.getAllOntologyConcepts();
    const keys: string[] = [];
    const entries: OntologySensitivityEntry[] = [];

    for (const concept of allConcepts) {
      const sc = concept.sensitivityClassification as any;
      if (!sc || !sc.redactionRequired) continue;

      const dataTypes: string[] = Array.isArray(sc.dataTypes) ? sc.dataTypes : [];
      keys.push(...dataTypes);

      entries.push({
        conceptId: concept.id,
        label: concept.label,
        level: sc.level || "internal",
        dataTypes,
        redactionRequired: sc.redactionRequired,
        retentionDays: sc.retentionDays ?? null,
      });
    }

    cachedOntologySensitivityKeys = { keys, entries, cachedAt: Date.now() };
    return { keys, entries };
  } catch {
    return { keys: [], entries: [] };
  }
}

export function invalidateOntologySensitivityCache() {
  cachedOntologySensitivityKeys = null;
}

export function redactWithOntologyKeys(data: any, level: RedactionLevel, ontologyKeys: string[]): any {
  if (level === "R0") return data;
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(item => redactWithOntologyKeys(item, level, ontologyKeys));
  }

  const result: Record<string, any> = {};
  const ontologyKeysLower = ontologyKeys.map(k => k.toLowerCase());

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();

    if (ontologyKeysLower.some(ok => keyLower.includes(ok) || ok.includes(keyLower))) {
      result[key] = "[ONTOLOGY_SENSITIVE_REDACTED]";
      continue;
    }

    if (level === "R1" || level === "R2") {
      if (IDENTITY_KEYS.includes(key) && typeof value === "string") {
        result[key] = "[PII_REDACTED]";
        continue;
      }
      if (typeof value === "string") {
        let redacted = value;
        for (const pattern of PII_PATTERNS) {
          redacted = redacted.replace(new RegExp(pattern.source, pattern.flags), "[PII_REDACTED]");
        }
        result[key] = redacted;
        continue;
      }
    }

    if (level === "R2") {
      if (FINANCIAL_KEYS.includes(key)) {
        result[key] = "[FINANCIAL_REDACTED]";
        continue;
      }
      if (SENSITIVE_KEYS.includes(key)) {
        result[key] = "[SENSITIVE_REDACTED]";
        continue;
      }
    }

    if (typeof value === "object" && value !== null) {
      result[key] = redactWithOntologyKeys(value, level, ontologyKeys);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function redactPayload(data: any, level: RedactionLevel): any {
  if (level === "R0") return data;
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  const ontologyKeys = cachedOntologySensitivityKeys?.keys || [];
  const ontologyKeysLower = ontologyKeys.map(k => k.toLowerCase());

  if (Array.isArray(data)) {
    return data.map(item => redactPayload(item, level));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (ontologyKeysLower.length > 0) {
      const keyLower = key.toLowerCase();
      if (ontologyKeysLower.some(ok => keyLower.includes(ok) || ok.includes(keyLower))) {
        result[key] = "[ONTOLOGY_SENSITIVE_REDACTED]";
        continue;
      }
    }

    if (level === "R1" || level === "R2") {
      if (IDENTITY_KEYS.includes(key) && typeof value === "string") {
        result[key] = "[PII_REDACTED]";
        continue;
      }
      if (typeof value === "string") {
        let redacted = value;
        for (const pattern of PII_PATTERNS) {
          redacted = redacted.replace(new RegExp(pattern.source, pattern.flags), "[PII_REDACTED]");
        }
        result[key] = redacted;
        continue;
      }
    }

    if (level === "R2") {
      if (FINANCIAL_KEYS.includes(key)) {
        result[key] = "[FINANCIAL_REDACTED]";
        continue;
      }
      if (SENSITIVE_KEYS.includes(key)) {
        result[key] = "[SENSITIVE_REDACTED]";
        continue;
      }
    }

    if (typeof value === "object" && value !== null) {
      result[key] = redactPayload(value, level);
    } else {
      result[key] = value;
    }
  }
  return result;
}
