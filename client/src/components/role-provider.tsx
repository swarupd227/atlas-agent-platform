import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Target,
  Bot,
  Activity,
  Shield,
  UserCheck,
  DollarSign,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type RoleId =
  | "admin"
  | "outcome_owner"
  | "agent_engineer"
  | "ops_sre"
  | "compliance_security"
  | "expert_validator"
  | "finance";

export interface RoleDefinition {
  id: RoleId;
  label: string;
  shortLabel: string;
  initials: string;
  description: string;
  icon: LucideIcon;
  allowedRoutes: string[];
}

export const ROLES: RoleDefinition[] = [
  {
    id: "admin",
    label: "Admin",
    shortLabel: "Admin",
    initials: "AD",
    description: "Full platform access, user management, system configuration",
    icon: ShieldCheck,
    allowedRoutes: ["/dashboard", "/outcomes", "/outcomes/discover", "/agents", "/templates", "/blueprints", "/evals", "/deployments", "/monitor", "/governance", "/audit-trail", "/approvals", "/billing", "/improvements", "/improvement-loop", "/integrations", "/admin", "/ontology"],
  },
  {
    id: "outcome_owner",
    label: "Outcome Owner",
    shortLabel: "Business",
    initials: "OO",
    description: "Defines KPIs, sees ROI, approves outcome contracts",
    icon: Target,
    allowedRoutes: ["/dashboard", "/outcomes", "/outcomes/discover", "/billing", "/approvals", "/agents", "/monitor", "/ontology"],
  },
  {
    id: "agent_engineer",
    label: "Agent Engineer",
    shortLabel: "Builder",
    initials: "AE",
    description: "Designs blueprints, tools, memory, eval suites",
    icon: Bot,
    allowedRoutes: ["/dashboard", "/agents", "/templates", "/blueprints", "/evals", "/improvements", "/improvement-loop", "/outcomes/discover", "/integrations", "/deployments", "/ontology"],
  },
  {
    id: "ops_sre",
    label: "Ops / SRE",
    shortLabel: "Operations",
    initials: "SR",
    description: "Monitoring, incidents, reliability, rollback, cost controls",
    icon: Activity,
    allowedRoutes: ["/dashboard", "/deployments", "/monitor", "/agents", "/improvements", "/improvement-loop", "/integrations", "/governance", "/ontology"],
  },
  {
    id: "compliance_security",
    label: "Compliance / Security",
    shortLabel: "Compliance",
    initials: "CS",
    description: "Policy authoring, audit exports, access controls",
    icon: Shield,
    allowedRoutes: ["/dashboard", "/governance", "/audit-trail", "/approvals", "/admin", "/agents", "/deployments", "/monitor", "/ontology"],
  },
  {
    id: "expert_validator",
    label: "Expert Validator",
    shortLabel: "Validator",
    initials: "EV",
    description: "Approves high-risk changes, exceptions, major releases",
    icon: UserCheck,
    allowedRoutes: ["/dashboard", "/approvals", "/agents", "/deployments", "/evals", "/governance", "/audit-trail", "/ontology"],
  },
  {
    id: "finance",
    label: "Finance",
    shortLabel: "Finance",
    initials: "FI",
    description: "Billing rules, outcome metering, disputes",
    icon: DollarSign,
    allowedRoutes: ["/dashboard", "/billing", "/outcomes"],
  },
];

export type PermissionAction =
  | "create_modify_outcomes"
  | "create_modify_blueprints"
  | "deploy_staging_pilot"
  | "deploy_prod"
  | "create_modify_policies"
  | "view_traces"
  | "export_audit_bundle"
  | "approve_changes"
  | "billing_invoices";

export type AccessLevel = "full" | "conditional" | "denied";

export interface PermissionEntry {
  access: AccessLevel;
  annotation?: string;
}

type PermissionMatrix = Record<RoleId, Record<PermissionAction, PermissionEntry>>;

export const PERMISSION_MATRIX: PermissionMatrix = {
  admin: {
    create_modify_outcomes: { access: "full" },
    create_modify_blueprints: { access: "full" },
    deploy_staging_pilot: { access: "full" },
    deploy_prod: { access: "full" },
    create_modify_policies: { access: "full" },
    view_traces: { access: "full" },
    export_audit_bundle: { access: "full" },
    approve_changes: { access: "full" },
    billing_invoices: { access: "full" },
  },
  outcome_owner: {
    create_modify_outcomes: { access: "full" },
    create_modify_blueprints: { access: "denied" },
    deploy_staging_pilot: { access: "denied" },
    deploy_prod: { access: "denied" },
    create_modify_policies: { access: "denied" },
    view_traces: { access: "conditional", annotation: "redacted" },
    export_audit_bundle: { access: "conditional", annotation: "scoped" },
    approve_changes: { access: "denied" },
    billing_invoices: { access: "conditional", annotation: "outcome" },
  },
  agent_engineer: {
    create_modify_outcomes: { access: "conditional", annotation: "draft only" },
    create_modify_blueprints: { access: "full" },
    deploy_staging_pilot: { access: "full" },
    deploy_prod: { access: "conditional", annotation: "submit only" },
    create_modify_policies: { access: "denied" },
    view_traces: { access: "conditional", annotation: "redacted" },
    export_audit_bundle: { access: "denied" },
    approve_changes: { access: "denied" },
    billing_invoices: { access: "denied" },
  },
  ops_sre: {
    create_modify_outcomes: { access: "denied" },
    create_modify_blueprints: { access: "conditional", annotation: "rollout settings" },
    deploy_staging_pilot: { access: "full" },
    deploy_prod: { access: "conditional", annotation: "submit" },
    create_modify_policies: { access: "denied" },
    view_traces: { access: "conditional", annotation: "redacted" },
    export_audit_bundle: { access: "conditional", annotation: "incident scope" },
    approve_changes: { access: "denied" },
    billing_invoices: { access: "denied" },
  },
  compliance_security: {
    create_modify_outcomes: { access: "conditional", annotation: "policy constraints" },
    create_modify_blueprints: { access: "conditional", annotation: "tool permissions" },
    deploy_staging_pilot: { access: "conditional" },
    deploy_prod: { access: "conditional", annotation: "if policy impact" },
    create_modify_policies: { access: "full" },
    view_traces: { access: "conditional", annotation: "less redaction" },
    export_audit_bundle: { access: "full" },
    approve_changes: { access: "denied" },
    billing_invoices: { access: "denied" },
  },
  expert_validator: {
    create_modify_outcomes: { access: "conditional", annotation: "approve" },
    create_modify_blueprints: { access: "conditional", annotation: "approve high risk" },
    deploy_staging_pilot: { access: "conditional", annotation: "if required" },
    deploy_prod: { access: "conditional", annotation: "required for high risk" },
    create_modify_policies: { access: "conditional", annotation: "approve exceptions" },
    view_traces: { access: "full" },
    export_audit_bundle: { access: "full" },
    approve_changes: { access: "full" },
    billing_invoices: { access: "denied" },
  },
  finance: {
    create_modify_outcomes: { access: "denied" },
    create_modify_blueprints: { access: "denied" },
    deploy_staging_pilot: { access: "denied" },
    deploy_prod: { access: "denied" },
    create_modify_policies: { access: "denied" },
    view_traces: { access: "denied" },
    export_audit_bundle: { access: "conditional", annotation: "billing evidence" },
    approve_changes: { access: "denied" },
    billing_invoices: { access: "full" },
  },
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  create_modify_outcomes: "Create/modify outcome contracts",
  create_modify_blueprints: "Create/modify blueprints",
  deploy_staging_pilot: "Deploy to staging/pilot",
  deploy_prod: "Deploy to production",
  create_modify_policies: "Create/modify policies",
  view_traces: "View traces",
  export_audit_bundle: "Export audit bundle",
  approve_changes: "Approve changes",
  billing_invoices: "Billing and invoices",
};

interface RoleContextType {
  role: RoleDefinition;
  setRole: (roleId: RoleId) => void;
  isRouteAllowed: (route: string) => boolean;
  getPermission: (action: PermissionAction) => PermissionEntry;
  canPerform: (action: PermissionAction) => boolean;
  hasFullAccess: (action: PermissionAction) => boolean;
}

const RoleContext = createContext<RoleContextType | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<RoleId>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-role") as RoleId) || "admin";
    }
    return "admin";
  });

  const role = useMemo(() => ROLES.find((r) => r.id === roleId) || ROLES[0], [roleId]);

  const setRole = (newRoleId: RoleId) => {
    setRoleId(newRoleId);
    localStorage.setItem("almp-role", newRoleId);
  };

  const isRouteAllowed = useCallback((route: string) => {
    const currentRole = ROLES.find((r) => r.id === roleId) || ROLES[0];
    return currentRole.allowedRoutes.some((allowed) => {
      if (allowed === "/") return route === "/";
      return route.startsWith(allowed);
    });
  }, [roleId]);

  const getPermission = useCallback((action: PermissionAction): PermissionEntry => {
    return PERMISSION_MATRIX[roleId]?.[action] || { access: "denied" };
  }, [roleId]);

  const canPerform = useCallback((action: PermissionAction): boolean => {
    const perm = getPermission(action);
    return perm.access !== "denied";
  }, [getPermission]);

  const hasFullAccess = useCallback((action: PermissionAction): boolean => {
    const perm = getPermission(action);
    return perm.access === "full";
  }, [getPermission]);

  return (
    <RoleContext.Provider value={{ role, setRole, isRouteAllowed, getPermission, canPerform, hasFullAccess }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}

export function usePermission(action: PermissionAction) {
  const { getPermission, canPerform, hasFullAccess } = useRole();
  return {
    permission: getPermission(action),
    allowed: canPerform(action),
    fullAccess: hasFullAccess(action),
  };
}

interface PermissionGateProps {
  action: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
  showConditional?: boolean;
}

export function PermissionGate({ action, children, fallback, showConditional = true }: PermissionGateProps) {
  const { permission } = usePermission(action);

  if (permission.access === "denied") {
    return fallback ? <>{fallback}</> : null;
  }

  if (permission.access === "conditional" && !showConditional) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
