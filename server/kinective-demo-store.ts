export type KinectiveScenario = "happy" | "invalid_address" | "system_failure";

export interface KinectiveAuditEntry {
  id: number;
  timestamp: string;
  action: string;
  system: string;
  details: string;
}

export interface SystemUpdateStatus {
  system: string;
  status: "success" | "failed" | "rolled_back" | "pending" | "skipped";
  confirmationId: string | null;
  error: string | null;
  rolledBackAt: string | null;
}

export interface KinectiveDemoState {
  scenario: KinectiveScenario;
  running: boolean;
  finalized: boolean;
  runStartedAt: number | null;
  traceId: string | null;
  auditLog: KinectiveAuditEntry[];
  systemUpdates: SystemUpdateStatus[];
  validationResult: {
    valid: boolean;
    standardizedAddress: string | null;
    zip4: string | null;
    errorMessage: string | null;
  } | null;
  rollbackLog: { system: string; status: string; rolledBackAt: string }[];
  enabledSystems: string[];
}

let auditCounter = 0;

export const SYSTEMS = [
  "Kinective Gateway (Core Banking)",
  "Digital Banking (Alkami)",
  "Statement Vendor (Doxim)",
  "Card Management (PSCU)",
  "Loan Origination",
  "CRM (Salesforce)",
  "Bill Pay",
  "Fraud Detection",
  "BSA/AML Compliance",
  "SignPlus Archive",
  "Member Notification",
];

export const SYSTEM_TOOLS: Record<string, string[]> = {
  "Kinective Gateway (Core Banking)": ["update_member_address", "get_member_profile"],
  "Digital Banking (Alkami)": ["update_digital_address", "notify_digital_banking"],
  "Statement Vendor (Doxim)": ["update_statement_address"],
  "Card Management (PSCU)": ["update_card_address"],
  "Loan Origination": ["update_loan_address"],
  "CRM (Salesforce)": ["update_crm_contact", "create_interaction_record"],
  "Bill Pay": ["update_bill_pay_address"],
  "Fraud Detection": ["flag_address_change"],
  "BSA/AML Compliance": ["log_bsa_event", "create_compliance_record"],
  "SignPlus Archive": ["archive_signed_document"],
  "Member Notification": ["notify_digital_banking"],
};

function createInitialState(): KinectiveDemoState {
  return {
    scenario: "happy",
    running: false,
    finalized: false,
    runStartedAt: null,
    traceId: null,
    auditLog: [],
    systemUpdates: SYSTEMS.map((s) => ({
      system: s,
      status: "pending",
      confirmationId: null,
      error: null,
      rolledBackAt: null,
    })),
    validationResult: null,
    rollbackLog: [],
    enabledSystems: [...SYSTEMS],
  };
}

let state: KinectiveDemoState = createInitialState();
let runGeneration = 0;

export function getRunGeneration(): number {
  return runGeneration;
}

export function getKinectiveState(): KinectiveDemoState {
  return state;
}

export function resetKinectiveDemo(scenario: KinectiveScenario = "happy"): void {
  const enabledSystems = [...state.enabledSystems];
  auditCounter = 0;
  runGeneration++;
  state = createInitialState();
  state.scenario = scenario;
  state.running = true;
  state.runStartedAt = Date.now();
  state.enabledSystems = enabledSystems;
  for (const su of state.systemUpdates) {
    if (!enabledSystems.includes(su.system)) {
      su.status = "skipped";
    }
  }
}

export function fullResetKinectiveDemo(): void {
  auditCounter = 0;
  runGeneration++;
  state = createInitialState();
}

export function setKinectiveTraceId(traceId: string): void {
  state.traceId = traceId;
  state.running = false;
}

export function setKinectiveRunning(running: boolean): void {
  state.running = running;
}

const PIPELINE_STALE_MS = 120_000;

export function isKinectiveRunning(): boolean {
  if (!state.running || state.finalized) return false;
  if (state.runStartedAt && Date.now() - state.runStartedAt > PIPELINE_STALE_MS) {
    state.running = false;
    return false;
  }
  return true;
}

export function getEnabledSystems(): string[] {
  return state.enabledSystems;
}

export function setEnabledSystems(systems: string[]): void {
  state.enabledSystems = systems;
}

export function addKinectiveAudit(action: string, system: string, details: string): KinectiveAuditEntry {
  auditCounter++;
  const entry: KinectiveAuditEntry = {
    id: auditCounter,
    timestamp: new Date().toISOString(),
    action,
    system,
    details,
  };
  state.auditLog.push(entry);
  return entry;
}

function updateSystemStatus(systemSubstr: string, status: SystemUpdateStatus["status"], confirmationId?: string, error?: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, " ");
  const item = state.systemUpdates.find((s) => normalize(s.system).includes(normalize(systemSubstr)));
  if (item) {
    item.status = status;
    if (confirmationId) item.confirmationId = confirmationId;
    if (error) item.error = error;
    if (status === "rolled_back") item.rolledBackAt = new Date().toISOString();
  }
}

function isSystemEnabled(systemKey: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return state.enabledSystems.some((s) => normalize(s).includes(normalize(systemKey)));
}

export function finalizeKinectiveSystemUpdates(scenario: KinectiveScenario): void {
  const confId = () => `CONF-${Date.now().toString(36).toUpperCase()}-AUTO`;

  if (scenario === "invalid_address") {
    for (const su of state.systemUpdates) {
      if (su.status === "pending") su.status = "skipped";
    }
    state.finalized = true;
    return;
  }

  if (scenario === "system_failure") {
    const now = new Date().toISOString();
    for (const su of state.systemUpdates) {
      const name = su.system.toLowerCase();
      if (name.includes("card")) {
        su.status = "failed";
        su.error = "TIMEOUT: Connection to PSCU card management timed out after 3 retries";
        su.confirmationId = null;
      } else if (name.includes("loan") || name.includes("crm") || name.includes("salesforce")) {
        su.status = "rolled_back";
        su.confirmationId = null;
        if (!su.rolledBackAt) su.rolledBackAt = now;
        if (!state.rollbackLog.find((r) => r.system === su.system)) {
          state.rollbackLog.push({ system: su.system, status: "rolled_back", rolledBackAt: now });
        }
      } else if (
        name.includes("bill") ||
        name.includes("fraud") ||
        name.includes("bsa") ||
        name.includes("compliance") ||
        name.includes("signplus") ||
        name.includes("archive") ||
        name.includes("member") ||
        name.includes("notification")
      ) {
        su.status = "skipped";
        su.confirmationId = null;
      } else {
        su.status = "rolled_back";
        su.confirmationId = null;
        if (!su.rolledBackAt) su.rolledBackAt = now;
        if (!state.rollbackLog.find((r) => r.system === su.system)) {
          state.rollbackLog.push({ system: su.system, status: "rolled_back", rolledBackAt: now });
        }
      }
    }
    if (!state.auditLog.find((e) => e.action === "PARTIAL_FAILURE")) {
      addKinectiveAudit("PARTIAL_FAILURE", "ATLAS Engine", "Card Management (PSCU) failure triggered full rollback of all updated systems (Gateway, Digital Banking, Statement Vendor, Loan Origination, CRM). COA-2026-00412 marked partial failure and reverted to consistent state.");
    }
    state.finalized = true;
    return;
  }

  for (const su of state.systemUpdates) {
    if (su.status === "pending") {
      su.status = "success";
      su.confirmationId = confId();
    }
  }
  if (!state.auditLog.find((e) => e.action === "COA_COMPLETE")) {
    const updatedCount = state.systemUpdates.filter((s) => s.status === "success").length;
    addKinectiveAudit("COA_COMPLETE", "ATLAS Engine", `COA-2026-00412 complete. All ${updatedCount} systems synchronized successfully. Member notified via email and SMS. Signed form archived in SignPlus.`);
  }
  state.finalized = true;
}

export function getScenarioFormData(): Record<string, any> {
  const base = {
    form_id: "COA-2026-00412",
    member_id: "MBR-2026-84291",
    member_name: "Sarah Mitchell",
    member_dob: "1982-04-15",
    old_address: {
      street: "420 Elm St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
    },
    signed_at: new Date().toISOString(),
    status: "SIGNED",
  };

  if (state.scenario === "invalid_address") {
    return {
      ...base,
      new_address: {
        street: "1847 Lakewod Drve",
        city: "Austin",
        state: "TX",
        zip: "",
      },
    };
  }

  return {
    ...base,
    new_address: {
      street: "1847 Lakewood Drive",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
  };
}

export function getScenarioValidation(): Record<string, any> {
  if (state.scenario === "invalid_address") {
    state.validationResult = {
      valid: false,
      standardizedAddress: null,
      zip4: null,
      errorMessage: "Address not found in USPS database. Street name 'Lakewod Drve' could not be matched. Missing ZIP code.",
    };
    for (const su of state.systemUpdates) {
      su.status = "skipped";
    }
    return { valid: false, error_message: state.validationResult.errorMessage };
  }

  state.validationResult = {
    valid: true,
    standardizedAddress: "1847 LAKEWOOD DR, AUSTIN TX 78701-3847",
    zip4: "78701-3847",
    errorMessage: null,
  };
  return {
    valid: true,
    standardized_address: state.validationResult.standardizedAddress,
    zip4: state.validationResult.zip4,
  };
}

export function getScenarioSystemUpdate(system: string): Record<string, any> {
  if (state.finalized) {
    return { success: true, skipped: true, reason: "Run already finalized — state is locked" };
  }

  const confirmId = `CONF-${Date.now().toString(36).toUpperCase()}`;

  if (state.scenario === "invalid_address") {
    return { success: false, error: "Address validation failed. System update blocked." };
  }

  if (!isSystemEnabled(system)) {
    const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, " ");
    const item = state.systemUpdates.find((s) => normalize(s.system).includes(normalize(system)));
    if (item && item.status !== "skipped") item.status = "skipped";
    return { success: false, skipped: true, reason: "System disabled in configuration" };
  }

  if (state.scenario === "system_failure" && system.toLowerCase().includes("card")) {
    updateSystemStatus("Card", "failed", undefined, "TIMEOUT: Connection to PSCU card management timed out after 3 retries (30s)");
    return {
      success: false,
      error: "TIMEOUT: Connection to PSCU card management system timed out after 3 retries (30s each). Service may be undergoing maintenance.",
      retryable: true,
    };
  }

  const systemMap: Record<string, string> = {
    "gateway": "Gateway",
    "core": "Gateway",
    "member_address": "Gateway",
    "digital": "Digital",
    "statement": "Statement",
    "card": "Card",
    "loan": "Loan",
    "crm": "CRM",
    "bill": "Bill",
    "fraud": "Fraud",
    "bsa": "BSA",
    "compliance": "BSA",
    "signplus": "SignPlus",
    "archive": "SignPlus",
    "notify": "Member",
    "notification": "Member",
  };

  let matchedSystem = "";
  const sysLower = system.toLowerCase();
  for (const [key, val] of Object.entries(systemMap)) {
    if (sysLower.includes(key)) {
      matchedSystem = val;
      break;
    }
  }

  if (matchedSystem) {
    updateSystemStatus(matchedSystem, "success", confirmId);
  }

  return { success: true, confirmation_id: confirmId, system, timestamp: new Date().toISOString() };
}

export function getScenarioRollback(system: string): Record<string, any> {
  const now = new Date().toISOString();
  updateSystemStatus(system, "rolled_back");
  state.rollbackLog.push({ system, status: "rolled_back", rolledBackAt: now });
  return { success: true, system, rolled_back_at: now, prior_state_restored: true };
}

export function getScenarioFraudScore(): Record<string, any> {
  return {
    risk_score: 12,
    flag_reason: null,
    assessment: "LOW_RISK",
    details: "Address change within continental US. No high-risk indicators detected. Member account age: 8 years.",
  };
}
