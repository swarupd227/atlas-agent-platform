import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import {
  Target,
  Bot,
  Activity,
  Shield,
  UserCheck,
  DollarSign,
  type LucideIcon,
} from "lucide-react";

export type RoleId =
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
    id: "outcome_owner",
    label: "Outcome Owner",
    shortLabel: "Business",
    initials: "OO",
    description: "Defines KPIs, sees ROI, approves outcome contracts",
    icon: Target,
    allowedRoutes: ["/", "/outcomes", "/outcomes/discover", "/billing", "/approvals"],
  },
  {
    id: "agent_engineer",
    label: "Agent Engineer",
    shortLabel: "Builder",
    initials: "AE",
    description: "Designs blueprints, tools, memory, eval suites",
    icon: Bot,
    allowedRoutes: ["/", "/agents", "/templates", "/evals", "/improvements", "/outcomes/discover"],
  },
  {
    id: "ops_sre",
    label: "Ops / SRE",
    shortLabel: "Operations",
    initials: "SR",
    description: "Monitoring, incidents, reliability, rollback, cost controls",
    icon: Activity,
    allowedRoutes: ["/", "/deployments", "/monitor", "/agents"],
  },
  {
    id: "compliance_security",
    label: "Compliance / Security",
    shortLabel: "Compliance",
    initials: "CS",
    description: "Policy authoring, audit exports, access controls",
    icon: Shield,
    allowedRoutes: ["/", "/governance", "/approvals"],
  },
  {
    id: "expert_validator",
    label: "Expert Validator",
    shortLabel: "Validator",
    initials: "EV",
    description: "Approves high-risk changes, exceptions, major releases",
    icon: UserCheck,
    allowedRoutes: ["/", "/approvals", "/agents", "/deployments", "/evals"],
  },
  {
    id: "finance",
    label: "Finance",
    shortLabel: "Finance",
    initials: "FI",
    description: "Billing rules, outcome metering, disputes",
    icon: DollarSign,
    allowedRoutes: ["/", "/billing", "/outcomes"],
  },
];

interface RoleContextType {
  role: RoleDefinition;
  setRole: (roleId: RoleId) => void;
  isRouteAllowed: (route: string) => boolean;
}

const RoleContext = createContext<RoleContextType | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<RoleId>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-role") as RoleId) || "agent_engineer";
    }
    return "agent_engineer";
  });

  const role = useMemo(() => ROLES.find((r) => r.id === roleId) || ROLES[1], [roleId]);

  const setRole = (newRoleId: RoleId) => {
    setRoleId(newRoleId);
    localStorage.setItem("almp-role", newRoleId);
  };

  const isRouteAllowed = (route: string) => {
    return role.allowedRoutes.some((allowed) => {
      if (allowed === "/") return route === "/";
      return route.startsWith(allowed);
    });
  };

  return (
    <RoleContext.Provider value={{ role, setRole, isRouteAllowed }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
