export const KINECTIVE_AGENT = {
  id: "c4b3099f-dfd8-4cce-9cf4-0cbb031f7f73",
  name: "Change of Address Agent",
} as const;

export const KINECTIVE_MCP_SERVERS = {
  signplus: {
    id: "342cbdc9-6757-4600-9ca5-abe22aab5212",
    name: "Kinective SignPlus MCP Server",
    tools: ["get_form_data", "archive_signed_document", "get_signing_status"],
  },
  gatewayCore: {
    id: "ad15b89f-b45a-4eeb-9dc4-86f7769f4451",
    name: "Kinective Gateway Core MCP Server",
    tools: ["update_member_address", "get_member_profile"],
  },
  usps: {
    id: "b8b0d00d-280e-4d2b-946d-f5611d22473b",
    name: "USPS Address Validation MCP Server",
    tools: ["validate_address"],
  },
  digitalBanking: {
    id: "7665f8ba-5162-400b-b2c0-bd2c10ae534c",
    name: "Digital Banking Connector MCP Server",
    tools: ["update_digital_address", "notify_digital_banking"],
  },
  statementVendor: {
    id: "4a33df90-fda6-4d55-b6e0-0f616f8910a4",
    name: "Statement Vendor Connector MCP Server",
    tools: ["update_statement_address"],
  },
  cardManagement: {
    id: "10dce6b3-8645-433d-bd2c-fbab17db127f",
    name: "Card Management Connector MCP Server",
    tools: ["update_card_address"],
  },
  loanOrigination: {
    id: "0f821a1d-c46c-4561-bcf7-22558d62099e",
    name: "Loan Origination Connector MCP Server",
    tools: ["update_loan_address"],
  },
  crm: {
    id: "d9d2b2ff-0827-4e8c-a19d-2a3efd96d679",
    name: "CRM Connector MCP Server",
    tools: ["update_crm_contact", "create_interaction_record"],
  },
  billPay: {
    id: "7600115e-f721-450a-b640-4799c5d9e6eb",
    name: "Bill Pay Connector MCP Server",
    tools: ["update_bill_pay_address"],
  },
  fraudDetection: {
    id: "8dbce5ea-3941-40b2-a2ea-95ee22fbddc4",
    name: "Fraud Detection Connector MCP Server",
    tools: ["flag_address_change"],
  },
  compliance: {
    id: "3d5bfe63-df5d-42c0-9dfb-ce4bfcf6b41b",
    name: "Compliance Connector MCP Server",
    tools: ["log_bsa_event", "create_compliance_record", "log_action", "rollback_address_update"],
  },
} as const;

export const KINECTIVE_SKILLS = [
  { id: "b66b9146-8870-4b0b-8ad2-738066976e01", name: "Address Extraction" },
  { id: "7931981f-0290-4c97-8c38-b235be440137", name: "USPS Validation" },
  { id: "3a7917c8-948e-4bfb-9260-1683a7105db7", name: "System Orchestrator" },
  { id: "48b2b7c1-2e78-4fd3-90dd-982b5b02b721", name: "Rollback Handler" },
  { id: "196864a2-5d6a-42b4-b032-10238b76d1dd", name: "Compliance Logger" },
  { id: "6c4f4c83-a325-4b96-984f-cb25d410a444", name: "Notification Manager" },
] as const;

export const KINECTIVE_TRIGGER = {
  id: "abade7b3-6651-4f77-8ca1-e0e2468a7dbe",
  triggerType: "webhook",
  eventName: "form_signed",
  source: "kinective_signplus",
} as const;

export const KINECTIVE_CONFIG = {
  department: "Member Services",
  environment: "production",
  riskTier: "MEDIUM",
  complianceTags: ["BSA/AML", "NCUA", "Reg E", "GLBA"],
} as const;
