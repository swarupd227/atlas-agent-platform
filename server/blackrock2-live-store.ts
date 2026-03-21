export type Bk2LiveScenario = "happy_path" | "portal_unreachable" | "pending_trades" | "admin_access";

export interface Bk2ScenarioSpec {
  scenarioId: Bk2LiveScenario;
  employee: string;
  empId: string;
  role: string;
  caseId: string;
  portals: Bk2Portal[];
  tradeCheck: boolean;
  criticalTier: boolean;
  hkexDown: boolean;
}

export interface Bk2Portal {
  name: string;
  accountId: string;
  role: string;
  authType: "SAML" | "PKI_CERT" | "SWIFT_TOKEN" | "API_KEY";
  reachable: boolean;
  hasPendingTrades: boolean;
}

const SCENARIOS: Record<Bk2LiveScenario, Bk2ScenarioSpec> = {
  happy_path: {
    scenarioId: "happy_path",
    employee: "Robert Kessler",
    empId: "EMP-29471",
    role: "Portfolio Manager",
    caseId: "AIM-2026-0847",
    portals: [
      { name: "DTCC", accountId: "DTCC-RK-00491", role: "Settlement Participant", authType: "SAML", reachable: true, hasPendingTrades: false },
      { name: "Bloomberg TOMS", accountId: "BBG-RK-7734", role: "Trader", authType: "SAML", reachable: true, hasPendingTrades: false },
      { name: "ICE Trade Vault", accountId: "ICE-BLK-RK-002", role: "Trade Reporter", authType: "API_KEY", reachable: true, hasPendingTrades: false },
      { name: "Euroclear", accountId: "EU-BLK-29471", role: "Participant", authType: "PKI_CERT", reachable: true, hasPendingTrades: false },
      { name: "Clearstream", accountId: "CS-BLK-29471", role: "Participant", authType: "PKI_CERT", reachable: true, hasPendingTrades: false },
      { name: "MarkitServ", accountId: "MS-RK-4821", role: "Confirmation User", authType: "SAML", reachable: true, hasPendingTrades: false },
    ],
    tradeCheck: false,
    criticalTier: false,
    hkexDown: false,
  },
  portal_unreachable: {
    scenarioId: "portal_unreachable",
    employee: "Karen Nakamura",
    empId: "EMP-19823",
    role: "Equity Trader - APAC",
    caseId: "AIM-2026-0831",
    portals: [
      { name: "DTCC", accountId: "DTCC-KN-00312", role: "Settlement Participant", authType: "SAML", reachable: true, hasPendingTrades: false },
      { name: "Bloomberg TOMS", accountId: "BBG-KN-6621", role: "Trader", authType: "SAML", reachable: true, hasPendingTrades: false },
      { name: "ICE Trade Vault", accountId: "ICE-BLK-KN-007", role: "Trade Reporter", authType: "API_KEY", reachable: true, hasPendingTrades: false },
      { name: "MarkitServ", accountId: "MS-KN-3319", role: "Confirmation User", authType: "SAML", reachable: true, hasPendingTrades: false },
      { name: "HKEX CCASS", accountId: "HKEX-KN-7734", role: "Participant", authType: "SAML", reachable: false, hasPendingTrades: false },
    ],
    tradeCheck: false,
    criticalTier: false,
    hkexDown: true,
  },
  pending_trades: {
    scenarioId: "pending_trades",
    employee: "Marcus Thompson",
    empId: "EMP-34102",
    role: "Fixed Income Trader",
    caseId: "AIM-2026-0812",
    portals: [
      { name: "Euroclear", accountId: "EU-BLK-34102", role: "Settlement Participant", authType: "PKI_CERT", reachable: true, hasPendingTrades: true },
      { name: "DTCC FICC", accountId: "DTC-MT-00891", role: "GCF Repo Participant", authType: "SAML", reachable: true, hasPendingTrades: true },
      { name: "Clearstream", accountId: "CS-BLK-34102", role: "Participant", authType: "PKI_CERT", reachable: true, hasPendingTrades: false },
    ],
    tradeCheck: true,
    criticalTier: false,
    hkexDown: false,
  },
  admin_access: {
    scenarioId: "admin_access",
    employee: "James Whitfield",
    empId: "EMP-41087",
    role: "SWIFT Alliance Administrator",
    caseId: "AIM-2026-0798",
    portals: [
      { name: "SWIFT Alliance", accountId: "SWIFT-JW-ADMIN-001", role: "System Administrator", authType: "SWIFT_TOKEN", reachable: true, hasPendingTrades: false },
      { name: "DTCC", accountId: "DTCC-JW-00218", role: "Settlement Participant", authType: "SAML", reachable: true, hasPendingTrades: false },
      { name: "Euroclear", accountId: "EU-BLK-41087", role: "Participant", authType: "PKI_CERT", reachable: true, hasPendingTrades: false },
      { name: "Bloomberg TOMS", accountId: "BBG-JW-9901", role: "Trader", authType: "SAML", reachable: true, hasPendingTrades: false },
    ],
    tradeCheck: false,
    criticalTier: true,
    hkexDown: false,
  },
};

let currentScenario: Bk2ScenarioSpec | null = null;

export function setBk2LiveScenario(scenarioId: Bk2LiveScenario): Bk2ScenarioSpec {
  currentScenario = SCENARIOS[scenarioId];
  return currentScenario;
}

export function getBk2LiveScenario(): Bk2ScenarioSpec | null {
  return currentScenario;
}

export function getBk2ScenarioSpec(scenarioId: Bk2LiveScenario): Bk2ScenarioSpec {
  return SCENARIOS[scenarioId];
}

export function clearBk2LiveScenario(): void {
  currentScenario = null;
}
