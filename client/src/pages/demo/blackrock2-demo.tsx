import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  BookOpen,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  XCircle,
  Clock,
  Lock,
  UserCheck,
  FileText,
  Building2,
} from "lucide-react";
import { BLACKROCK2_AGENTS } from "./blackrock2-constants";

// ─── Scenario definitions ────────────────────────────────────────────────────

type PortalStatus = "pending" | "removed" | "failed" | "deferred" | "held" | "approved";
type AgentNodeId = "termination_intake" | "portal_discovery" | "active_trade_check" | "access_removal" | "removal_verification" | "audit_evidence";
type ScenarioId = "happy_path" | "portal_unreachable" | "pending_trades" | "admin_access";

interface Portal {
  name: string;
  authType: "SAML SSO" | "Certificate" | "API Key" | "Token" | "Password";
  riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  role: string;
  status: PortalStatus;
  note?: string;
}

interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  terminationDate: string;
  lastWorkingDay: string;
  manager: string;
}

interface ActivityEntry {
  id: number;
  agent: AgentNodeId;
  agentLabel: string;
  tool: string;
  message: string;
  level: "info" | "warn" | "success" | "error";
  timestamp: string;
}

interface ScenarioDef {
  id: ScenarioId;
  label: string;
  subtitle: string;
  icon: "check" | "warn" | "clock" | "lock";
  employee: Employee;
  portals: Portal[];
  steps: ScenarioStep[];
}

interface ScenarioStep {
  agent: AgentNodeId;
  agentLabel: string;
  tool: string;
  message: string;
  level: "info" | "warn" | "success" | "error";
  portalUpdates?: { name: string; status: PortalStatus; note?: string }[];
  approval?: boolean;
  delay?: number;
}

const mkTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const AGENT_LABELS: Record<AgentNodeId, string> = {
  termination_intake: "Termination Intake",
  portal_discovery: "Portal Discovery",
  active_trade_check: "Active Trade Check",
  access_removal: "Access Removal Executor",
  removal_verification: "Removal Verification",
  audit_evidence: "Audit & Evidence",
};

const AGENT_COLORS: Record<AgentNodeId, string> = {
  termination_intake: "bg-blue-600",
  portal_discovery: "bg-indigo-600",
  active_trade_check: "bg-amber-600",
  access_removal: "bg-orange-600",
  removal_verification: "bg-teal-600",
  audit_evidence: "bg-purple-700",
};

// ─── Scenario 1: Happy Path ──────────────────────────────────────────────────

const EMPLOYEE_KESSLER: Employee = {
  id: "EMP-4821",
  name: "Robert Kessler",
  title: "Fixed Income Portfolio Manager",
  department: "Fixed Income Trading",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Diana Chen (MD, Fixed Income)",
};

const PORTALS_KESSLER: Portal[] = [
  { name: "DTCC (DTC)",           authType: "SAML SSO",    riskTier: "MEDIUM",   role: "Settlement_Participant", status: "pending" },
  { name: "Euroclear",            authType: "Certificate", riskTier: "HIGH",     role: "Settlement_Officer",     status: "pending" },
  { name: "Clearstream",          authType: "Certificate", riskTier: "HIGH",     role: "Custodian_Access",       status: "pending" },
  { name: "SWIFT (MyStandards)",  authType: "Token",       riskTier: "HIGH",     role: "Message_Sender",         status: "pending" },
  { name: "Bloomberg TOMS",       authType: "API Key",     riskTier: "MEDIUM",   role: "Trade_Blotter_Writer",   status: "pending" },
  { name: "ICE Connect",          authType: "SAML SSO",    riskTier: "LOW",      role: "Data_Viewer",            status: "pending" },
];

const STEPS_HAPPY: ScenarioStep[] = [
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_pending_tasks",      message: "SailPoint lifecycle event detected → Termination workflow triggered for Robert Kessler (EMP-4821). Separation type: Voluntary.", level: "info" },
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_identity_cube",      message: "Identity cube retrieved: 6 portal accounts active, 23 SailPoint entitlements, 4 AD groups. Last working day confirmed: 2026-03-20.", level: "info" },
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "check_policy_violations",message: "SoD policy check passed. No active violations. Removal case created: CASE-BR2-2891.", level: "success" },
  { agent: "portal_discovery",   agentLabel: AGENT_LABELS.portal_discovery,   tool: "scan_accounts",         message: "Partner Portal Registry scanned. 6 active portal accounts discovered for EMP-4821: DTCC, Euroclear, Clearstream, SWIFT, Bloomberg TOMS, ICE Connect.", level: "info" },
  { agent: "portal_discovery",   agentLabel: AGENT_LABELS.portal_discovery,   tool: "get_portal_status",     message: "Health checks complete: all 6 portals reachable and operational. Discovery complete → triggering parallel trade check.", level: "success" },
  { agent: "active_trade_check", agentLabel: AGENT_LABELS.active_trade_check, tool: "get_pending_trades",    message: "Settlement systems checked: DTCC, Euroclear, Clearstream. No pending or unsettled trades found. Removal may proceed immediately.", level: "success" },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "DTCC (DTC): SAML SSO session terminated. Account disabled. Removal confirmed.", level: "success", portalUpdates: [{ name: "DTCC (DTC)", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "revoke_certificate",    message: "Euroclear: Client certificate revoked (CN=kessler-r, serial 0x4F2A). Account suspended. PKI revocation propagated.", level: "success", portalUpdates: [{ name: "Euroclear", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "revoke_certificate",    message: "Clearstream: Certificate revoked and account disabled. Custodian_Access role removed.", level: "success", portalUpdates: [{ name: "Clearstream", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "invalidate_token",      message: "SWIFT (MyStandards): SWIFT token invalidated. Message_Sender permissions revoked from MyStandards portal.", level: "success", portalUpdates: [{ name: "SWIFT (MyStandards)", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "Bloomberg TOMS: API key deactivated. Trade_Blotter_Writer role removed from TOMS configuration.", level: "success", portalUpdates: [{ name: "Bloomberg TOMS", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "ICE Connect: SAML SSO access revoked. Data_Viewer role removed.", level: "success", portalUpdates: [{ name: "ICE Connect", status: "removed" }] },
  { agent: "removal_verification",agentLabel: AGENT_LABELS.removal_verification,tool: "verify_removal",      message: "Verification pass complete: 6/6 portals confirmed removed. SailPoint entitlement revocation logged. RadiantOne directory updated.", level: "success" },
  { agent: "audit_evidence",     agentLabel: AGENT_LABELS.audit_evidence,     tool: "create_monitoring_rule",message: "90-day Splunk monitoring rule created: alert on any auth attempt from kessler-r credentials across monitored portals.", level: "info" },
  { agent: "audit_evidence",     agentLabel: AGENT_LABELS.audit_evidence,     tool: "close_ticket",          message: "SOX-compliant evidence package generated. All 6 portal removals timestamped and signed. ServiceNow INC-2026-4821 closed. Audit complete in 4m 12s.", level: "success" },
];

// ─── Scenario 2: Portal Unreachable ─────────────────────────────────────────

const EMPLOYEE_NAKAMURA: Employee = {
  id: "EMP-2293",
  name: "Karen Nakamura",
  title: "Asia Pacific Equities Trader",
  department: "Equities — APAC Desk",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Oliver Park (MD, APAC Equities)",
};

const PORTALS_NAKAMURA: Portal[] = [
  { name: "DTCC (DTC)",    authType: "SAML SSO",    riskTier: "MEDIUM", role: "Settlement_Participant", status: "pending" },
  { name: "Euroclear",     authType: "Certificate", riskTier: "HIGH",   role: "Trade_Viewer",          status: "pending" },
  { name: "Bloomberg TOMS",authType: "API Key",     riskTier: "MEDIUM", role: "Trade_Blotter_Writer",  status: "pending" },
  { name: "HKEX CCASS",   authType: "Password",    riskTier: "MEDIUM", role: "Clearing_Participant",  status: "pending", note: "Portal health check FAILED — connectivity issue" },
];

const STEPS_UNREACHABLE: ScenarioStep[] = [
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_pending_tasks",      message: "SailPoint lifecycle event detected → Termination for Karen Nakamura (EMP-2293). Separation type: Involuntary. Case CASE-BR2-2892 created.", level: "info" },
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_identity_cube",      message: "Identity cube retrieved: 4 portal accounts active. Entitlements include APAC equities systems.", level: "info" },
  { agent: "portal_discovery",   agentLabel: AGENT_LABELS.portal_discovery,   tool: "scan_accounts",         message: "Scanning Partner Portal Registry for EMP-2293. 4 portal accounts found.", level: "info" },
  { agent: "portal_discovery",   agentLabel: AGENT_LABELS.portal_discovery,   tool: "get_portal_status",     message: "Health check: DTCC ✓ Euroclear ✓ Bloomberg TOMS ✓ — HKEX CCASS ✗ (timeout after 3 retries, portal unreachable). Flagged for deferred removal.", level: "warn", portalUpdates: [{ name: "HKEX CCASS", status: "failed", note: "Portal unreachable — deferred to retry queue" }] },
  { agent: "active_trade_check", agentLabel: AGENT_LABELS.active_trade_check, tool: "get_pending_trades",    message: "Settlement check: no pending trades across DTCC, Euroclear. Proceeding with available portal removals.", level: "success" },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "DTCC: SAML SSO access revoked. Clearing_Participant role removed.", level: "success", portalUpdates: [{ name: "DTCC (DTC)", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "revoke_certificate",    message: "Euroclear: Certificate revoked. Trade_Viewer access removed.", level: "success", portalUpdates: [{ name: "Euroclear", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "Bloomberg TOMS: API key deactivated. Trade_Blotter_Writer role removed.", level: "success", portalUpdates: [{ name: "Bloomberg TOMS", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "HKEX CCASS: Removal SKIPPED — portal unreachable. Creating retry task and ServiceNow incident.", level: "warn", portalUpdates: [{ name: "HKEX CCASS", status: "deferred", note: "Retry scheduled in 6h via ServiceNow INC-2026-2293" }] },
  { agent: "removal_verification",agentLabel: AGENT_LABELS.removal_verification,tool: "verify_removal",      message: "Verification: 3/4 portals confirmed removed. HKEX CCASS deferred — retry job scheduled. Exception documented.", level: "warn" },
  { agent: "audit_evidence",     agentLabel: AGENT_LABELS.audit_evidence,     tool: "create_monitoring_rule",message: "Splunk monitoring rules created for confirmed portals. Escalation alert set for HKEX CCASS if retry fails within 24h.", level: "info" },
  { agent: "audit_evidence",     agentLabel: AGENT_LABELS.audit_evidence,     tool: "close_ticket",          message: "SOX package generated with exception documentation for HKEX CCASS portal outage. ServiceNow INC-2026-2293 flagged for follow-up. Audit complete.", level: "warn" },
];

// ─── Scenario 3: Pending Trades ──────────────────────────────────────────────

const EMPLOYEE_THOMPSON: Employee = {
  id: "EMP-7711",
  name: "Marcus Thompson",
  title: "European Fixed Income Trader",
  department: "Fixed Income — EMEA Desk",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Sarah Liu (MD, EMEA Fixed Income)",
};

const PORTALS_THOMPSON: Portal[] = [
  { name: "DTCC (DTC)",   authType: "SAML SSO",    riskTier: "MEDIUM", role: "Settlement_Participant", status: "pending" },
  { name: "Euroclear",    authType: "Certificate", riskTier: "HIGH",   role: "Settlement_Officer",     status: "pending", note: "2 pending trades — T+2 settlement due 2026-03-23" },
  { name: "Clearstream",  authType: "Certificate", riskTier: "HIGH",   role: "Custodian_Access",       status: "pending" },
];

const STEPS_PENDING_TRADES: ScenarioStep[] = [
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_pending_tasks",      message: "SailPoint event: Termination for Marcus Thompson (EMP-7711). Case CASE-BR2-2893 created.", level: "info" },
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_identity_cube",      message: "Identity cube retrieved: 3 portal accounts. EMEA Fixed Income entitlements confirmed.", level: "info" },
  { agent: "portal_discovery",   agentLabel: AGENT_LABELS.portal_discovery,   tool: "scan_accounts",         message: "Partner Portal Registry: 3 portal accounts found for EMP-7711. All portals reachable.", level: "info" },
  { agent: "active_trade_check", agentLabel: AGENT_LABELS.active_trade_check, tool: "get_pending_trades",    message: "Settlement check: DTCC — clean. Clearstream — clean. Euroclear — 2 PENDING TRADES DETECTED.", level: "warn", portalUpdates: [{ name: "Euroclear", status: "held", note: "2 pending trades (T+2): ISIN XS2387241811 €8.2M, ISIN XS2345119283 €4.1M — settlement due 2026-03-23" }] },
  { agent: "active_trade_check", agentLabel: AGENT_LABELS.active_trade_check, tool: "get_pending_trades",    message: "Recommendation: HOLD Euroclear removal until trade settlement (T+2, 2026-03-23). DTCC and Clearstream may proceed. Escalating to human for approval.", level: "warn", approval: true },
];

const STEPS_PENDING_TRADES_POST_APPROVAL: ScenarioStep[] = [
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "Approval received. Proceeding with DTCC and Clearstream removals. Euroclear on HOLD.", level: "info" },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "DTCC: SAML SSO access revoked. Settlement_Participant role removed.", level: "success", portalUpdates: [{ name: "DTCC (DTC)", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "revoke_certificate",    message: "Clearstream: Certificate revoked. Custodian_Access removed.", level: "success", portalUpdates: [{ name: "Clearstream", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "Euroclear: Removal DEFERRED — pending trade hold active. Scheduled for 2026-03-23 post-settlement.", level: "warn", portalUpdates: [{ name: "Euroclear", status: "deferred", note: "Removal deferred until 2026-03-23 post-settlement" }] },
  { agent: "removal_verification",agentLabel: AGENT_LABELS.removal_verification,tool: "verify_removal",      message: "Verification: 2/3 portals confirmed removed. Euroclear hold documented. Retry task scheduled for 2026-03-24.", level: "warn" },
  { agent: "audit_evidence",     agentLabel: AGENT_LABELS.audit_evidence,     tool: "close_ticket",          message: "SOX package generated with Euroclear hold exception. Human approval decision recorded. ServiceNow INC-2026-7711 updated. Audit complete.", level: "success" },
];

// ─── Scenario 4: Admin Access ────────────────────────────────────────────────

const EMPLOYEE_WHITFIELD: Employee = {
  id: "EMP-9034",
  name: "James Whitfield",
  title: "Senior Credit Risk Officer",
  department: "Credit Risk — Counterparty",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Rachel Evans (CRO, Counterparty Risk)",
};

const PORTALS_WHITFIELD: Portal[] = [
  { name: "DTCC (DTC)",    authType: "SAML SSO",    riskTier: "MEDIUM",   role: "Settlement_Participant",  status: "pending" },
  { name: "Euroclear",     authType: "Certificate", riskTier: "HIGH",     role: "Settlement_Viewer",       status: "pending" },
  { name: "Bloomberg TOMS",authType: "API Key",     riskTier: "MEDIUM",   role: "Trade_Blotter_Writer",   status: "pending" },
  { name: "ICE Connect",   authType: "SAML SSO",    riskTier: "LOW",      role: "Data_Viewer",            status: "pending" },
  { name: "SWIFT (MyStandards)", authType: "Token", riskTier: "CRITICAL", role: "SWIFT_Admin",            status: "pending", note: "ADMIN-level role: SOX policy requires manager approval before removal" },
];

const STEPS_ADMIN: ScenarioStep[] = [
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_pending_tasks",      message: "SailPoint event: Termination for James Whitfield (EMP-9034). Case CASE-BR2-2894 created.", level: "info" },
  { agent: "termination_intake", agentLabel: AGENT_LABELS.termination_intake, tool: "get_identity_cube",      message: "Identity cube retrieved: 5 portal accounts. CRITICAL flag: SWIFT_Admin role detected.", level: "warn" },
  { agent: "portal_discovery",   agentLabel: AGENT_LABELS.portal_discovery,   tool: "scan_accounts",         message: "Partner Portal Registry scan: 5 portal accounts. SWIFT flagged CRITICAL — admin-level access role: SWIFT_Admin.", level: "warn", portalUpdates: [{ name: "SWIFT (MyStandards)", status: "held", note: "CRITICAL tier — SWIFT_Admin role requires SOX manager approval" }] },
  { agent: "active_trade_check", agentLabel: AGENT_LABELS.active_trade_check, tool: "get_pending_trades",    message: "Settlement check: all systems clean. No pending trades.", level: "success" },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "SWIFT (MyStandards): CRITICAL tier admin access — escalating for manager approval per SOX policy. Removal PAUSED.", level: "warn", approval: true },
];

const STEPS_ADMIN_POST_APPROVAL: ScenarioStep[] = [
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "Manager approval received from Rachel Evans (CRO). Proceeding with all portal removals.", level: "info" },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "DTCC: SAML SSO access revoked.", level: "success", portalUpdates: [{ name: "DTCC (DTC)", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "revoke_certificate",    message: "Euroclear: Certificate revoked. Trade_Viewer access removed.", level: "success", portalUpdates: [{ name: "Euroclear", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "Bloomberg TOMS: API key deactivated.", level: "success", portalUpdates: [{ name: "Bloomberg TOMS", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "remove_access",         message: "ICE Connect: SAML SSO access revoked.", level: "success", portalUpdates: [{ name: "ICE Connect", status: "removed" }] },
  { agent: "access_removal",     agentLabel: AGENT_LABELS.access_removal,     tool: "invalidate_token",      message: "SWIFT (MyStandards): SWIFT_Admin token invalidated. Admin access fully revoked post manager approval.", level: "success", portalUpdates: [{ name: "SWIFT (MyStandards)", status: "approved" }] },
  { agent: "removal_verification",agentLabel: AGENT_LABELS.removal_verification,tool: "verify_removal",      message: "Verification: 5/5 portals confirmed removed. Manager approval decision logged. SailPoint and RadiantOne updated.", level: "success" },
  { agent: "audit_evidence",     agentLabel: AGENT_LABELS.audit_evidence,     tool: "create_monitoring_rule",message: "90-day Splunk monitoring rule created for SWIFT admin credentials. Enhanced alert threshold (any auth attempt).", level: "info" },
  { agent: "audit_evidence",     agentLabel: AGENT_LABELS.audit_evidence,     tool: "close_ticket",          message: "SOX package generated with manager approval chain documented. SWIFT admin removal evidence signed. ServiceNow INC-2026-9034 closed.", level: "success" },
];

const SCENARIOS: ScenarioDef[] = [
  {
    id: "happy_path",
    label: "Happy Path",
    subtitle: "6 portals, clean removal",
    icon: "check",
    employee: EMPLOYEE_KESSLER,
    portals: PORTALS_KESSLER,
    steps: STEPS_HAPPY,
  },
  {
    id: "portal_unreachable",
    label: "Portal Unreachable",
    subtitle: "HKEX CCASS offline",
    icon: "warn",
    employee: EMPLOYEE_NAKAMURA,
    portals: PORTALS_NAKAMURA,
    steps: STEPS_UNREACHABLE,
  },
  {
    id: "pending_trades",
    label: "Pending Trades",
    subtitle: "Euroclear hold required",
    icon: "clock",
    employee: EMPLOYEE_THOMPSON,
    portals: PORTALS_THOMPSON,
    steps: STEPS_PENDING_TRADES,
  },
  {
    id: "admin_access",
    label: "Admin Access",
    subtitle: "SWIFT admin approval gate",
    icon: "lock",
    employee: EMPLOYEE_WHITFIELD,
    portals: PORTALS_WHITFIELD,
    steps: STEPS_ADMIN,
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

const PIPELINE_NODES: { id: AgentNodeId; label: string; short: string }[] = [
  { id: "termination_intake",  label: "Termination Intake",      short: "Intake"    },
  { id: "portal_discovery",    label: "Portal Discovery",         short: "Discovery" },
  { id: "active_trade_check",  label: "Active Trade Check",       short: "Trade Chk" },
  { id: "access_removal",      label: "Access Removal Executor",  short: "Removal"   },
  { id: "removal_verification",label: "Removal Verification",     short: "Verify"    },
  { id: "audit_evidence",      label: "Audit & Evidence",         short: "Audit"     },
];

function PipelineBanner({ activeAgent, completedAgents }: { activeAgent: AgentNodeId | null; completedAgents: Set<AgentNodeId> }) {
  return (
    <div className="flex items-center justify-center gap-1 py-3 px-4 flex-wrap" data-testid="bk2-pipeline-banner">
      {PIPELINE_NODES.map((node, i) => {
        const isDone   = completedAgents.has(node.id);
        const isActive = activeAgent === node.id && !isDone;
        return (
          <div key={node.id} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
              isActive  ? "bg-primary/20 border-primary text-primary ring-1 ring-primary/50 animate-pulse" :
              isDone    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" :
                          "bg-muted/50 border-border text-muted-foreground"
            }`} data-testid={`bk2-node-${node.id}`}>
              {isDone
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                : isActive
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Circle className="w-3.5 h-3.5" />
              }
              <span className="hidden sm:inline">{node.short}</span>
            </div>
            {i < PIPELINE_NODES.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScenarioIcon({ icon, className }: { icon: ScenarioDef["icon"]; className?: string }) {
  if (icon === "check") return <CheckCircle2 className={className} />;
  if (icon === "warn")  return <AlertTriangle className={className} />;
  if (icon === "clock") return <Clock className={className} />;
  return <Lock className={className} />;
}

function PortalStatusBadge({ status }: { status: PortalStatus }) {
  if (status === "removed")  return <Badge variant="outline" className="text-[9px] border-emerald-500/50 text-emerald-400 bg-emerald-500/5">Removed</Badge>;
  if (status === "failed")   return <Badge variant="outline" className="text-[9px] border-red-500/50 text-red-400 bg-red-500/5">Failed</Badge>;
  if (status === "deferred") return <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400 bg-amber-500/5">Deferred</Badge>;
  if (status === "held")     return <Badge variant="outline" className="text-[9px] border-orange-500/50 text-orange-400 bg-orange-500/5">On Hold</Badge>;
  if (status === "approved") return <Badge variant="outline" className="text-[9px] border-emerald-500/50 text-emerald-400 bg-emerald-500/5">Approved & Removed</Badge>;
  return <Badge variant="outline" className="text-[9px] border-muted-foreground/40 text-muted-foreground">Pending</Badge>;
}

function RiskTierDot({ tier }: { tier: Portal["riskTier"] }) {
  const color = tier === "CRITICAL" ? "bg-red-500" : tier === "HIGH" ? "bg-orange-500" : tier === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500";
  return <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} title={`Risk: ${tier}`} />;
}

function AgentTeamCard() {
  const [open, setOpen] = useState(false);
  const agentRows = [
    { ...BLACKROCK2_AGENTS.terminationIntake,  badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    { ...BLACKROCK2_AGENTS.portalDiscovery,    badge: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
    { ...BLACKROCK2_AGENTS.activeTradeCheck,   badge: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    { ...BLACKROCK2_AGENTS.accessRemovalExecutor, badge: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    { ...BLACKROCK2_AGENTS.removalVerification,badge: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
    { ...BLACKROCK2_AGENTS.auditEvidence,      badge: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  ];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-bk2-agent-team">
          <BookOpen className="w-4 h-4" />
          Agent Team
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2 border-emerald-500/30 bg-emerald-500/5 absolute right-4 z-50 w-[560px] max-w-[90vw]">
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <h4 className="font-semibold text-emerald-400">Pre-configured Offboarding Agent Team</h4>
            </div>
            <p className="text-xs text-muted-foreground">6 specialised agents — SailPoint, Partner Portal Registry, Settlement systems, Splunk, and ServiceNow.</p>
            <div className="space-y-2">
              {agentRows.map((agent) => (
                <div key={agent.id} className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/50 p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold truncate">{agent.name}</span>
                      <Badge variant="outline" className={`text-[8px] px-1.5 py-0 h-4 ${agent.badge}`}>{agent.riskTier}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
                  </div>
                  <Link href={`/agents/${agent.id}?tab=traces`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[10px] shrink-0" data-testid={`button-view-bk2-agent-${agent.id}`}>
                      Runs & Traces <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BlackRock2Demo() {
  const [selectedId, setSelectedId]       = useState<ScenarioId>("happy_path");
  const [running, setRunning]             = useState(false);
  const [complete, setComplete]           = useState(false);
  const [stepIndex, setStepIndex]         = useState(0);
  const [portals, setPortals]             = useState<Portal[]>([]);
  const [activityLog, setActivityLog]     = useState<ActivityEntry[]>([]);
  const [activeAgent, setActiveAgent]     = useState<AgentNodeId | null>(null);
  const [completedAgents, setCompletedAgents] = useState<Set<AgentNodeId>>(new Set());
  const [approvalPending, setApprovalPending] = useState(false);
  const [postApproval, setPostApproval]   = useState(false);
  const feedRef  = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  let entryId = useRef(0);

  const scenario = SCENARIOS.find((s) => s.id === selectedId)!;

  const getSteps = (): ScenarioStep[] => {
    if (selectedId === "pending_trades") {
      if (!postApproval) return STEPS_PENDING_TRADES;
      return [...STEPS_PENDING_TRADES, ...STEPS_PENDING_TRADES_POST_APPROVAL];
    }
    if (selectedId === "admin_access") {
      if (!postApproval) return STEPS_ADMIN;
      return [...STEPS_ADMIN, ...STEPS_ADMIN_POST_APPROVAL];
    }
    return scenario.steps;
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRunning(false);
    setComplete(false);
    setStepIndex(0);
    setPortals(scenario.portals.map((p) => ({ ...p })));
    setActivityLog([]);
    setActiveAgent(null);
    setCompletedAgents(new Set());
    setApprovalPending(false);
    setPostApproval(false);
    entryId.current = 0;
  };

  useEffect(() => { reset(); }, [selectedId]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [activityLog]);

  const runStep = (steps: ScenarioStep[], idx: number, currentPortals: Portal[]) => {
    if (idx >= steps.length) {
      setRunning(false);
      setComplete(true);
      setActiveAgent(null);
      fetch("/demo-api/blackrock2/run-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedId }),
      }).catch(() => {});
      return;
    }

    const step = steps[idx];

    if (step.approval) {
      setActiveAgent(step.agent);
      setActivityLog((prev) => [
        ...prev,
        {
          id: entryId.current++,
          agent: step.agent,
          agentLabel: step.agentLabel,
          tool: step.tool,
          message: step.message,
          level: step.level,
          timestamp: mkTime(),
        },
      ]);
      if (step.portalUpdates) {
        const updated = currentPortals.map((p) => {
          const upd = step.portalUpdates!.find((u) => u.name === p.name);
          return upd ? { ...p, status: upd.status, note: upd.note ?? p.note } : p;
        });
        setPortals(updated);
      }
      setRunning(false);
      setApprovalPending(true);
      setStepIndex(idx + 1);
      return;
    }

    const delay = step.delay ?? 900;

    timerRef.current = setTimeout(() => {
      setActiveAgent(step.agent);
      let updatedPortals = currentPortals;
      if (step.portalUpdates) {
        updatedPortals = currentPortals.map((p) => {
          const upd = step.portalUpdates!.find((u) => u.name === p.name);
          return upd ? { ...p, status: upd.status, note: upd.note ?? p.note } : p;
        });
        setPortals(updatedPortals);
      }

      setActivityLog((prev) => [
        ...prev,
        {
          id: entryId.current++,
          agent: step.agent,
          agentLabel: step.agentLabel,
          tool: step.tool,
          message: step.message,
          level: step.level,
          timestamp: mkTime(),
        },
      ]);

      const nextIdx = idx + 1;
      setStepIndex(nextIdx);

      const nextStep = steps[nextIdx];
      if (!nextStep || nextStep.agent !== step.agent) {
        setCompletedAgents((prev) => new Set([...prev, step.agent]));
      }

      runStep(steps, nextIdx, updatedPortals);
    }, delay);
  };

  const handleRun = () => {
    if (running || approvalPending) return;
    setRunning(true);
    setComplete(false);
    if (activityLog.length === 0) {
      setPortals(scenario.portals.map((p) => ({ ...p })));
    }
    const steps = getSteps();
    runStep(steps, stepIndex, portals.length > 0 ? portals : scenario.portals.map((p) => ({ ...p })));
  };

  const handleApprove = () => {
    setApprovalPending(false);
    setPostApproval(true);
    const updatedSteps = getSteps().concat(
      selectedId === "pending_trades" ? STEPS_PENDING_TRADES_POST_APPROVAL : STEPS_ADMIN_POST_APPROVAL
    );
    setRunning(true);
    runStep(updatedSteps, stepIndex, portals);
  };

  const levelColors: Record<string, string> = {
    info:    "text-muted-foreground",
    warn:    "text-amber-400",
    success: "text-emerald-400",
    error:   "text-red-400",
  };
  const agentBadgeColors: Record<AgentNodeId, string> = AGENT_COLORS;

  const removedCount  = portals.filter((p) => p.status === "removed" || p.status === "approved").length;
  const deferredCount = portals.filter((p) => p.status === "deferred").length;
  const heldCount     = portals.filter((p) => p.status === "held").length;
  const failedCount   = portals.filter((p) => p.status === "failed").length;

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="bk2-demo-page">
      {/* Header */}
      <div className="flex flex-col border-b bg-background">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold tracking-tight">BlackRock — External Portal Offboarding</h1>
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Use Case 2</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Automated termination detection and multi-portal access revocation — SailPoint → Partner Registry → Settlement → Audit
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AgentTeamCard />
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5" data-testid="button-bk2-reset" disabled={running}>
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>
        </div>

        {/* Scenario tabs */}
        <div className="flex gap-1 px-6 pb-0 overflow-x-auto">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { if (!running) setSelectedId(s.id); }}
              disabled={running}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                selectedId === s.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid={`button-bk2-scenario-${s.id}`}
            >
              <ScenarioIcon
                icon={s.icon}
                className={`w-3.5 h-3.5 ${
                  s.icon === "check" ? "text-emerald-500" :
                  s.icon === "warn"  ? "text-amber-500"   :
                  s.icon === "clock" ? "text-orange-500"  :
                                       "text-red-500"
                }`}
              />
              {s.label}
              <span className="text-muted-foreground font-normal hidden sm:inline">— {s.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Pipeline */}
        <div className="border-t bg-muted/20">
          <PipelineBanner activeAgent={activeAgent} completedAgents={completedAgents} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Left panel: employee + portals */}
        <div className="w-72 shrink-0 flex flex-col gap-3 p-4 border-r overflow-y-auto">
          {/* Employee */}
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Terminated Employee
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1.5">
              <div>
                <p className="text-sm font-semibold">{scenario.employee.name}</p>
                <p className="text-[11px] text-muted-foreground">{scenario.employee.title}</p>
                <p className="text-[11px] text-muted-foreground">{scenario.employee.department}</p>
              </div>
              <div className="border-t pt-1.5 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">ID: <span className="font-mono text-foreground">{scenario.employee.id}</span></p>
                <p className="text-[10px] text-muted-foreground">Termination: <span className="text-foreground">{scenario.employee.terminationDate}</span></p>
                <p className="text-[10px] text-muted-foreground">Last day: <span className="text-foreground">{scenario.employee.lastWorkingDay}</span></p>
                <p className="text-[10px] text-muted-foreground line-clamp-2">Manager: <span className="text-foreground">{scenario.employee.manager}</span></p>
              </div>
            </CardContent>
          </Card>

          {/* Portal list */}
          <Card className="flex-1">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Partner Portals
                <span className="ml-auto text-[10px] font-normal">
                  {removedCount}/{portals.length} removed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1.5">
              {(portals.length > 0 ? portals : scenario.portals).map((portal, i) => (
                <div key={i} className={`flex flex-col gap-0.5 p-2 rounded-md border text-[11px] ${
                  portal.status === "removed" || portal.status === "approved" ? "bg-emerald-500/5 border-emerald-500/20" :
                  portal.status === "failed"   ? "bg-red-500/5 border-red-500/20" :
                  portal.status === "deferred" ? "bg-amber-500/5 border-amber-500/20" :
                  portal.status === "held"     ? "bg-orange-500/5 border-orange-500/20" :
                                                  "bg-muted/30 border-transparent"
                }`} data-testid={`bk2-portal-${i}`}>
                  <div className="flex items-center gap-1.5">
                    <RiskTierDot tier={portal.riskTier} />
                    <span className="font-medium truncate flex-1">{portal.name}</span>
                    <PortalStatusBadge status={portal.status} />
                  </div>
                  <div className="pl-3.5 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <span>{portal.authType}</span>
                    <span className="opacity-50">·</span>
                    <span className="truncate">{portal.role}</span>
                  </div>
                  {portal.note && (
                    <p className="pl-3.5 text-[10px] text-amber-400 italic">{portal.note}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Summary stats */}
          {(running || complete || activityLog.length > 0) && (
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col items-center p-2 rounded-md border bg-emerald-500/5 border-emerald-500/20" data-testid="bk2-stat-removed">
                <span className="text-xl font-bold text-emerald-400">{removedCount}</span>
                <span className="text-[10px] text-muted-foreground">Removed</span>
              </div>
              <div className="flex flex-col items-center p-2 rounded-md border bg-amber-500/5 border-amber-500/20" data-testid="bk2-stat-deferred">
                <span className="text-xl font-bold text-amber-400">{deferredCount + heldCount}</span>
                <span className="text-[10px] text-muted-foreground">Deferred / Held</span>
              </div>
              {failedCount > 0 && (
                <div className="col-span-2 flex flex-col items-center p-2 rounded-md border bg-red-500/5 border-red-500/20" data-testid="bk2-stat-failed">
                  <span className="text-xl font-bold text-red-400">{failedCount}</span>
                  <span className="text-[10px] text-muted-foreground">Unreachable</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel: activity feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Controls */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-background">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Live Agent Activity</span>
              {running && (
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary animate-pulse">
                  Running
                </Badge>
              )}
              {complete && (
                <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">
                  Complete
                </Badge>
              )}
              {approvalPending && (
                <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-400 animate-pulse">
                  Awaiting Approval
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {approvalPending && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApprove}
                  data-testid="button-bk2-approve"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve & Continue
                </Button>
              )}
              {!complete && !approvalPending && (
                <Button
                  size="sm"
                  onClick={handleRun}
                  disabled={running || complete}
                  className="gap-1.5"
                  data-testid="button-bk2-run"
                >
                  {running ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Running…</>
                  ) : activityLog.length === 0 ? (
                    <>Run Scenario</>
                  ) : (
                    <>Continue</>
                  )}
                </Button>
              )}
              {complete && (
                <Button size="sm" variant="outline" onClick={reset} className="gap-1.5" data-testid="button-bk2-rerun">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Run Again
                </Button>
              )}
            </div>
          </div>

          {/* Approval gate banner */}
          {approvalPending && (
            <div className="flex items-start gap-3 px-5 py-3 bg-orange-500/10 border-b border-orange-500/30" data-testid="bk2-approval-gate">
              <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-orange-400">Human Approval Required</p>
                <p className="text-xs text-muted-foreground">
                  {selectedId === "pending_trades"
                    ? "Active Trade Check detected 2 unsettled trades on Euroclear. The agent recommends deferring Euroclear removal until settlement on 2026-03-23. Approve to proceed with DTCC and Clearstream now."
                    : "SWIFT (MyStandards) has an admin-level role (SWIFT_Admin) classified CRITICAL. SOX policy requires manager approval before admin access can be revoked. Approve to proceed."}
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {activityLog.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-8" data-testid="bk2-empty-state">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                <ScenarioIcon icon={scenario.icon} className={`w-6 h-6 ${
                  scenario.icon === "check" ? "text-emerald-500" :
                  scenario.icon === "warn"  ? "text-amber-500"   :
                  scenario.icon === "clock" ? "text-orange-500"  :
                                               "text-red-500"
                }`} />
              </div>
              <div>
                <p className="text-sm font-semibold">{scenario.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{scenario.subtitle}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {scenario.portals.length} portal{scenario.portals.length !== 1 ? "s" : ""} · {scenario.employee.name} ({scenario.employee.id})
                </p>
              </div>
              <Button size="sm" className="mt-2" onClick={handleRun} data-testid="button-bk2-run-center">
                Run Scenario
              </Button>
            </div>
          )}

          {/* Activity feed */}
          {activityLog.length > 0 && (
            <div ref={feedRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2" data-testid="bk2-activity-feed">
              {activityLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2.5 text-xs" data-testid={`bk2-entry-${entry.id}`}>
                  <span className="text-muted-foreground font-mono text-[10px] pt-0.5 w-16 shrink-0">{entry.timestamp}</span>
                  <Badge
                    variant="secondary"
                    className={`text-white text-[9px] px-1.5 shrink-0 mt-0.5 ${agentBadgeColors[entry.agent] || "bg-gray-600"}`}
                  >
                    {entry.agentLabel.split(" ")[0]}
                  </Badge>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] text-muted-foreground font-mono">{entry.tool}</span>
                    <span className={`leading-relaxed ${levelColors[entry.level]}`}>
                      {entry.level === "warn"    && <AlertTriangle className="inline w-3 h-3 mr-1 text-amber-400" />}
                      {entry.level === "error"   && <XCircle       className="inline w-3 h-3 mr-1 text-red-400" />}
                      {entry.level === "success" && <CheckCircle2  className="inline w-3 h-3 mr-1 text-emerald-400" />}
                      {entry.message}
                    </span>
                  </div>
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground" data-testid="bk2-running-indicator">
                  <span className="w-16 shrink-0" />
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="italic">Agent working…</span>
                </div>
              )}
              {complete && (
                <div className="flex items-center gap-2.5 text-xs mt-2 pt-2 border-t" data-testid="bk2-complete-banner">
                  <span className="w-16 shrink-0" />
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 font-semibold">
                    {failedCount > 0 || deferredCount > 0
                      ? `Offboarding complete with exceptions — ${removedCount} portals removed, ${deferredCount + failedCount} deferred/unreachable`
                      : `Offboarding complete — ${removedCount}/${portals.length} portals removed. SOX audit package filed.`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
