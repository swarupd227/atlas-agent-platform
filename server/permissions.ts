import type { Request, Response, NextFunction } from "express";
import { getSecurityMode } from "./auth";

export type RoleId =
  | "admin"
  | "outcome_owner"
  | "agent_engineer"
  | "ops_sre"
  | "compliance_security"
  | "expert_validator"
  | "finance"
  | "domain_expert";

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
  | "manage_mcp_servers"
  | "manage_security"
  | "manage_agents"
  | "view_agents"
  | "manage_autonomy";

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
    manage_security: "full",
    manage_agents: "full",
    view_agents: "full",
    manage_autonomy: "full",
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
    manage_security: "denied",
    manage_agents: "denied",
    view_agents: "conditional",
    manage_autonomy: "denied",
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
    manage_security: "denied",
    manage_agents: "full",
    view_agents: "full",
    manage_autonomy: "conditional",
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
    manage_security: "conditional",
    manage_agents: "conditional",
    view_agents: "full",
    manage_autonomy: "denied",
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
    manage_security: "full",
    manage_agents: "conditional",
    view_agents: "full",
    manage_autonomy: "full",
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
    manage_security: "denied",
    manage_agents: "conditional",
    view_agents: "full",
    manage_autonomy: "full",
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
    manage_security: "denied",
    manage_agents: "denied",
    view_agents: "denied",
    manage_autonomy: "denied",
  },
  domain_expert: {
    create_modify_outcomes: "conditional",
    create_modify_blueprints: "denied",
    deploy_staging_pilot: "denied",
    deploy_prod: "denied",
    create_modify_policies: "conditional",
    view_traces: "conditional",
    export_audit_bundle: "conditional",
    approve_changes: "conditional",
    billing_invoices: "denied",
    manage_mcp_servers: "denied",
    manage_security: "denied",
    manage_agents: "denied",
    view_agents: "full",
    manage_autonomy: "denied",
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

export function hasPermission(role: RoleId, action: PermissionAction): boolean {
  const access = PERMISSION_MATRIX[role]?.[action];
  return access !== "denied" && access !== undefined;
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

// ─── Permissions-aware retrieval ────────────────────────────────────────────
// Knowledge-base chunks carry a sensitivityLevel (see shared/schema.ts
// knowledgeSources); this maps the caller's role to the highest tier they
// may retrieve, reusing the existing R0/R1/R2 redaction grouping for
// consistency rather than inventing a parallel role taxonomy just for KB
// access. Used by searchKnowledgeBaseChunks (server/embeddings.ts) to filter
// results before they ever reach a prompt.
export type KbSensitivityLevel = "public" | "internal" | "confidential" | "restricted";
const KB_SENSITIVITY_RANK: Record<KbSensitivityLevel, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

/** Highest sensitivity tier this role may retrieve. Fail-safe: an absent
 *  role (e.g. a scheduled run with no requesting user) gets "internal" —
 *  never "restricted" — rather than defaulting to full access. Never widen
 *  this to "no role → restricted"; that would silently leak regulated
 *  content into unattended runs nobody explicitly authorized. */
export function getMaxKbSensitivity(role: RoleId | undefined | null): KbSensitivityLevel {
  if (!role) return "internal";
  const level = getRedactionLevel(role);
  if (level === "R0") return "restricted";
  if (level === "R1") return "confidential";
  return "internal";
}

/** All sensitivity tiers this role may retrieve, at or below its max — for
 *  callers that need a SQL `WHERE level IN (...)` list rather than a
 *  per-row boolean check (e.g. filtering before LIMIT so a topK result set
 *  isn't short-counted by post-hoc filtering). */
export function getAllowedKbSensitivityLevels(role: RoleId | undefined | null): KbSensitivityLevel[] {
  const max = KB_SENSITIVITY_RANK[getMaxKbSensitivity(role)];
  return (Object.keys(KB_SENSITIVITY_RANK) as KbSensitivityLevel[]).filter(l => KB_SENSITIVITY_RANK[l] <= max);
}

/** True if the given role may see a chunk/source classified at `sensitivity`.
 *  Unrecognized/missing sensitivity values are treated as "public" (the
 *  default every knowledgeSources row has) so pre-existing, unclassified
 *  content isn't accidentally hidden from everyone. */
export function canAccessKbSensitivity(role: RoleId | undefined | null, sensitivity: string | null | undefined): boolean {
  const docLevel: KbSensitivityLevel = sensitivity && sensitivity in KB_SENSITIVITY_RANK ? (sensitivity as KbSensitivityLevel) : "public";
  return KB_SENSITIVITY_RANK[docLevel] <= KB_SENSITIVITY_RANK[getMaxKbSensitivity(role)];
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
