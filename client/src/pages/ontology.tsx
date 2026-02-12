import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Search,
  BookOpen,
  Network,
  Sparkles,
  Wand2,
  Loader2,
  ChevronRight,
  Tag,
  Link2,
  Brain,
  GitBranch,
  Check,
  XCircle,
  Shield,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIndustry, type IndustryId } from "@/components/industry-provider";
import { PermissionGate } from "@/components/role-provider";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OntologyProperty {
  name: string;
  type: string;
  description: string;
}

interface OntologyRelationship {
  type: "parent" | "child" | "related" | "depends_on";
  targetId: string;
  label: string;
}

interface OntologyConcept {
  id: string;
  label: string;
  category: string;
  description: string;
  properties: OntologyProperty[];
  relationships: OntologyRelationship[];
  tags: string[];
  industryRelevance: string;
}

interface OntologyDefinition {
  name: string;
  description: string;
  concepts: OntologyConcept[];
}

const FIBO_ONTOLOGY: OntologyDefinition = {
  name: "FIBO (Financial Industry Business Ontology)",
  description: "A comprehensive formal ontology for the financial industry, covering instruments, parties, processes, and regulatory concepts used by AI agents in banking and capital markets.",
  concepts: [
    { id: "fibo-1", label: "Derivative Contract", category: "Financial Instruments", description: "A financial contract whose value is derived from the performance of an underlying asset, index, or rate.", properties: [{ name: "notionalAmount", type: "decimal", description: "The face value of the contract" }, { name: "underlyingAsset", type: "string", description: "Reference to the underlying asset" }, { name: "maturityDate", type: "date", description: "Contract expiration date" }, { name: "contractType", type: "enum", description: "Option, future, swap, or forward" }], relationships: [{ type: "parent", targetId: "fibo-2", label: "Is a type of Financial Instrument" }, { type: "related", targetId: "fibo-8", label: "Subject to Market Risk" }, { type: "depends_on", targetId: "fibo-10", label: "Requires Trade Settlement" }], tags: ["derivatives", "trading", "risk"], industryRelevance: "Agents use derivative contract data for automated pricing, risk calculation, and compliance checks in capital markets workflows." },
    { id: "fibo-2", label: "Financial Instrument", category: "Financial Instruments", description: "A tradeable asset or contract that represents a legal agreement involving monetary value.", properties: [{ name: "instrumentId", type: "string", description: "Unique identifier (ISIN, CUSIP)" }, { name: "currency", type: "string", description: "Denomination currency" }, { name: "issuer", type: "string", description: "Issuing entity" }], relationships: [{ type: "child", targetId: "fibo-1", label: "Includes Derivatives" }, { type: "child", targetId: "fibo-3", label: "Includes Equities" }, { type: "related", targetId: "fibo-9", label: "Priced by Market Data" }], tags: ["securities", "trading", "assets"], industryRelevance: "Core entity for agent-driven portfolio management, trade execution, and regulatory reporting." },
    { id: "fibo-3", label: "Equity Security", category: "Financial Instruments", description: "An ownership interest in a corporation, typically represented by shares of stock.", properties: [{ name: "ticker", type: "string", description: "Stock ticker symbol" }, { name: "exchange", type: "string", description: "Primary listing exchange" }, { name: "sharesOutstanding", type: "integer", description: "Total shares issued" }], relationships: [{ type: "parent", targetId: "fibo-2", label: "Is a Financial Instrument" }, { type: "related", targetId: "fibo-9", label: "Has Market Data" }], tags: ["equities", "stocks", "shares"], industryRelevance: "Agents process equity data for automated trading signals, portfolio rebalancing, and corporate action processing." },
    { id: "fibo-4", label: "Fixed Income Security", category: "Financial Instruments", description: "A debt instrument that provides returns in the form of regular interest payments and return of principal at maturity.", properties: [{ name: "couponRate", type: "decimal", description: "Annual interest rate" }, { name: "yieldToMaturity", type: "decimal", description: "Expected rate of return" }, { name: "creditRating", type: "string", description: "Rating agency assessment" }], relationships: [{ type: "parent", targetId: "fibo-2", label: "Is a Financial Instrument" }, { type: "related", targetId: "fibo-8", label: "Subject to Credit Risk" }], tags: ["bonds", "debt", "fixed-income"], industryRelevance: "Agents analyze fixed income securities for yield optimization, credit risk assessment, and duration management." },
    { id: "fibo-5", label: "Counterparty", category: "Parties & Roles", description: "An entity on the other side of a financial transaction, subject to credit risk assessment.", properties: [{ name: "legalEntityId", type: "string", description: "LEI identifier" }, { name: "jurisdiction", type: "string", description: "Legal jurisdiction" }, { name: "creditScore", type: "integer", description: "Internal credit rating" }], relationships: [{ type: "related", targetId: "fibo-6", label: "Requires KYC Verification" }, { type: "related", targetId: "fibo-8", label: "Assessed for Credit Risk" }], tags: ["counterparty", "entity", "credit"], industryRelevance: "Agents perform automated counterparty due diligence, credit limit monitoring, and exposure calculations." },
    { id: "fibo-6", label: "KYC Verification", category: "Risk & Compliance", description: "Know Your Customer process to verify the identity and assess the risk profile of clients and counterparties.", properties: [{ name: "verificationLevel", type: "enum", description: "Basic, enhanced, or simplified due diligence" }, { name: "riskCategory", type: "string", description: "Client risk classification" }, { name: "lastReviewDate", type: "date", description: "Most recent review date" }], relationships: [{ type: "related", targetId: "fibo-5", label: "Verifies Counterparty" }, { type: "related", targetId: "fibo-7", label: "Part of AML Screening" }, { type: "depends_on", targetId: "fibo-15", label: "Required by Regulatory Framework" }], tags: ["kyc", "compliance", "identity"], industryRelevance: "Agents automate KYC document collection, identity verification, risk scoring, and periodic review scheduling." },
    { id: "fibo-7", label: "AML Screening", category: "Risk & Compliance", description: "Anti-Money Laundering screening process to detect suspicious activities and sanctioned entities.", properties: [{ name: "screeningType", type: "enum", description: "Transaction monitoring, name screening, or PEP check" }, { name: "alertThreshold", type: "decimal", description: "Threshold for triggering alerts" }, { name: "sanctionsLists", type: "string[]", description: "Reference sanctions databases" }], relationships: [{ type: "related", targetId: "fibo-6", label: "Complements KYC" }, { type: "depends_on", targetId: "fibo-15", label: "Mandated by Regulations" }, { type: "related", targetId: "fibo-12", label: "Monitors Payments" }], tags: ["aml", "sanctions", "compliance", "screening"], industryRelevance: "Agents perform real-time transaction screening, sanctions list matching, and suspicious activity report generation." },
    { id: "fibo-8", label: "Credit Risk Assessment", category: "Risk & Compliance", description: "Evaluation of the likelihood that a borrower or counterparty will default on financial obligations.", properties: [{ name: "probabilityOfDefault", type: "decimal", description: "Estimated default probability" }, { name: "lossGivenDefault", type: "decimal", description: "Expected loss if default occurs" }, { name: "exposureAtDefault", type: "decimal", description: "Total exposure amount at default" }], relationships: [{ type: "related", targetId: "fibo-5", label: "Assesses Counterparty" }, { type: "related", targetId: "fibo-4", label: "Evaluates Fixed Income" }, { type: "related", targetId: "fibo-1", label: "Evaluates Derivatives" }], tags: ["credit-risk", "risk-management", "default"], industryRelevance: "Agents calculate real-time credit risk metrics, trigger limit breach alerts, and generate risk reports for portfolio managers." },
    { id: "fibo-9", label: "Market Data Feed", category: "Market Data", description: "Real-time or delayed pricing, volume, and reference data for financial instruments.", properties: [{ name: "dataSource", type: "string", description: "Provider (Bloomberg, Reuters, etc.)" }, { name: "updateFrequency", type: "string", description: "Tick, second, minute, or end-of-day" }, { name: "dataQuality", type: "enum", description: "Validated, indicative, or firm" }], relationships: [{ type: "related", targetId: "fibo-2", label: "Prices Financial Instruments" }, { type: "related", targetId: "fibo-11", label: "Used in Portfolio Valuation" }], tags: ["market-data", "pricing", "real-time"], industryRelevance: "Agents consume market data feeds for automated pricing, valuation, and signal generation across asset classes." },
    { id: "fibo-10", label: "Trade Settlement", category: "Payment Systems", description: "The process of transferring securities and cash between counterparties to complete a trade.", properties: [{ name: "settlementCycle", type: "string", description: "T+1, T+2, or T+0" }, { name: "settlementMethod", type: "enum", description: "DVP, FOP, or cash settlement" }, { name: "clearingHouse", type: "string", description: "Central counterparty or CSD" }], relationships: [{ type: "related", targetId: "fibo-1", label: "Settles Derivatives" }, { type: "related", targetId: "fibo-3", label: "Settles Equities" }, { type: "depends_on", targetId: "fibo-12", label: "Triggers Payment" }], tags: ["settlement", "clearing", "post-trade"], industryRelevance: "Agents automate settlement instruction matching, fail management, and reconciliation across custodians." },
    { id: "fibo-11", label: "Portfolio Valuation", category: "Market Data", description: "The process of calculating the current market value of a portfolio of financial instruments.", properties: [{ name: "valuationMethod", type: "enum", description: "Mark-to-market, mark-to-model, or fair value" }, { name: "baseCurrency", type: "string", description: "Portfolio reporting currency" }, { name: "navFrequency", type: "string", description: "Daily, weekly, or monthly" }], relationships: [{ type: "depends_on", targetId: "fibo-9", label: "Uses Market Data" }, { type: "related", targetId: "fibo-2", label: "Values Instruments" }, { type: "related", targetId: "fibo-14", label: "Reports to Regulators" }], tags: ["valuation", "portfolio", "nav"], industryRelevance: "Agents perform automated portfolio valuation, NAV calculation, and P&L attribution for fund managers." },
    { id: "fibo-12", label: "Payment Instruction", category: "Payment Systems", description: "An order to transfer funds between accounts, supporting domestic and cross-border payments.", properties: [{ name: "paymentType", type: "enum", description: "Wire, ACH, SEPA, or SWIFT" }, { name: "amount", type: "decimal", description: "Payment amount" }, { name: "beneficiary", type: "string", description: "Recipient account details" }], relationships: [{ type: "related", targetId: "fibo-10", label: "Triggered by Settlement" }, { type: "related", targetId: "fibo-7", label: "Screened for AML" }], tags: ["payments", "transfers", "swift"], industryRelevance: "Agents process payment instructions, validate routing, perform sanctions screening, and handle exception management." },
    { id: "fibo-13", label: "Customer Account", category: "Parties & Roles", description: "A record of financial transactions and balances maintained by a financial institution for a client.", properties: [{ name: "accountType", type: "enum", description: "Current, savings, investment, or margin" }, { name: "accountStatus", type: "string", description: "Active, dormant, or closed" }, { name: "balance", type: "decimal", description: "Current account balance" }], relationships: [{ type: "related", targetId: "fibo-5", label: "Belongs to Counterparty" }, { type: "related", targetId: "fibo-6", label: "Subject to KYC" }], tags: ["accounts", "banking", "client"], industryRelevance: "Agents manage account lifecycle events, balance monitoring, dormancy detection, and cross-sell opportunity identification." },
    { id: "fibo-14", label: "Regulatory Report", category: "Regulatory", description: "A mandatory submission to financial regulators containing transaction, risk, or compliance data.", properties: [{ name: "reportType", type: "string", description: "EMIR, MiFIR, CFTC, or internal" }, { name: "submissionDeadline", type: "string", description: "Filing deadline" }, { name: "regulatoryBody", type: "string", description: "Target regulator" }], relationships: [{ type: "depends_on", targetId: "fibo-11", label: "Uses Valuation Data" }, { type: "depends_on", targetId: "fibo-15", label: "Governed by Framework" }], tags: ["regulatory", "reporting", "compliance"], industryRelevance: "Agents generate and validate regulatory reports, check data completeness, and manage submission workflows." },
    { id: "fibo-15", label: "Regulatory Framework", category: "Regulatory", description: "A set of laws, rules, and guidelines that govern financial activities within a jurisdiction.", properties: [{ name: "frameworkName", type: "string", description: "MiFID II, Basel III, Dodd-Frank, etc." }, { name: "jurisdiction", type: "string", description: "Applicable jurisdiction" }, { name: "effectiveDate", type: "date", description: "Date framework became effective" }], relationships: [{ type: "child", targetId: "fibo-6", label: "Mandates KYC" }, { type: "child", targetId: "fibo-7", label: "Mandates AML" }, { type: "child", targetId: "fibo-14", label: "Requires Reports" }], tags: ["regulation", "framework", "law"], industryRelevance: "Agents reference regulatory frameworks for automated compliance checking, policy enforcement, and change impact analysis." },
    { id: "fibo-16", label: "Trade Order", category: "Financial Instruments", description: "An instruction to buy or sell a financial instrument at specified conditions.", properties: [{ name: "orderType", type: "enum", description: "Market, limit, stop, or conditional" }, { name: "side", type: "enum", description: "Buy or sell" }, { name: "quantity", type: "decimal", description: "Number of units" }], relationships: [{ type: "related", targetId: "fibo-2", label: "References Instrument" }, { type: "related", targetId: "fibo-10", label: "Leads to Settlement" }], tags: ["orders", "trading", "execution"], industryRelevance: "Agents handle order routing, best execution analysis, and algorithmic trading strategy implementation." },
    { id: "fibo-17", label: "Compliance Check", category: "Risk & Compliance", description: "An automated or manual verification that an activity conforms to regulatory and internal policy requirements.", properties: [{ name: "checkType", type: "enum", description: "Pre-trade, post-trade, or periodic" }, { name: "ruleSet", type: "string", description: "Applicable compliance rules" }, { name: "outcome", type: "enum", description: "Pass, fail, or warning" }], relationships: [{ type: "depends_on", targetId: "fibo-15", label: "Based on Framework" }, { type: "related", targetId: "fibo-16", label: "Validates Orders" }], tags: ["compliance", "checks", "validation"], industryRelevance: "Agents run real-time compliance checks on trades, detect violations, and generate exception reports." },
    { id: "fibo-18", label: "Beneficial Owner", category: "Parties & Roles", description: "The natural person who ultimately owns or controls a legal entity or arrangement.", properties: [{ name: "ownershipPercentage", type: "decimal", description: "Percentage of beneficial ownership" }, { name: "controlType", type: "enum", description: "Direct, indirect, or through chain" }, { name: "verificationStatus", type: "string", description: "Verified, pending, or expired" }], relationships: [{ type: "related", targetId: "fibo-5", label: "Controls Counterparty" }, { type: "related", targetId: "fibo-6", label: "Identified via KYC" }], tags: ["beneficial-owner", "ubo", "transparency"], industryRelevance: "Agents trace beneficial ownership chains, validate UBO declarations, and flag complex ownership structures." },
    { id: "fibo-19", label: "Market Risk Model", category: "Risk & Compliance", description: "A quantitative model for measuring and predicting potential losses from market movements.", properties: [{ name: "modelType", type: "enum", description: "VaR, Expected Shortfall, or stress test" }, { name: "confidenceLevel", type: "decimal", description: "Statistical confidence (e.g., 99%)" }, { name: "holdingPeriod", type: "integer", description: "Time horizon in days" }], relationships: [{ type: "related", targetId: "fibo-9", label: "Uses Market Data" }, { type: "related", targetId: "fibo-11", label: "Feeds Valuation" }], tags: ["var", "risk-model", "quantitative"], industryRelevance: "Agents compute risk metrics, run scenario analyses, and trigger alerts when risk thresholds are breached." },
    { id: "fibo-20", label: "Collateral Management", category: "Risk & Compliance", description: "The process of managing assets pledged as security for financial obligations.", properties: [{ name: "collateralType", type: "enum", description: "Cash, securities, or other assets" }, { name: "haircutPercentage", type: "decimal", description: "Valuation discount applied" }, { name: "marginCallThreshold", type: "decimal", description: "Trigger level for margin calls" }], relationships: [{ type: "related", targetId: "fibo-1", label: "Secures Derivatives" }, { type: "related", targetId: "fibo-8", label: "Mitigates Credit Risk" }], tags: ["collateral", "margin", "security"], industryRelevance: "Agents automate collateral optimization, margin call processing, and substitution workflows." },
    { id: "fibo-21", label: "Fund Structure", category: "Financial Instruments", description: "The legal and operational structure of an investment fund, including share classes and NAV.", properties: [{ name: "fundType", type: "enum", description: "UCITS, hedge fund, PE, or ETF" }, { name: "domicile", type: "string", description: "Fund domicile country" }, { name: "aum", type: "decimal", description: "Assets under management" }], relationships: [{ type: "parent", targetId: "fibo-2", label: "Is a Financial Instrument" }, { type: "related", targetId: "fibo-11", label: "Valued by Portfolio Valuation" }], tags: ["funds", "investment", "aum"], industryRelevance: "Agents manage fund operations including subscription/redemption processing, NAV calculation, and investor reporting." },
    { id: "fibo-22", label: "Corporate Action", category: "Market Data", description: "An event initiated by a corporation that affects its securities holders, such as dividends or mergers.", properties: [{ name: "actionType", type: "enum", description: "Dividend, split, merger, or rights issue" }, { name: "exDate", type: "date", description: "Ex-date for the action" }, { name: "electionDeadline", type: "date", description: "Deadline for holder elections" }], relationships: [{ type: "related", targetId: "fibo-3", label: "Affects Equities" }, { type: "related", targetId: "fibo-13", label: "Impacts Accounts" }], tags: ["corporate-actions", "dividends", "events"], industryRelevance: "Agents process corporate action notifications, calculate entitlements, and manage election workflows." },
    { id: "fibo-23", label: "Liquidity Risk", category: "Risk & Compliance", description: "The risk that an entity cannot meet short-term financial obligations due to inability to convert assets to cash.", properties: [{ name: "lcr", type: "decimal", description: "Liquidity coverage ratio" }, { name: "nsfr", type: "decimal", description: "Net stable funding ratio" }, { name: "stressScenario", type: "string", description: "Applied stress test scenario" }], relationships: [{ type: "related", targetId: "fibo-19", label: "Complements Market Risk" }, { type: "depends_on", targetId: "fibo-15", label: "Regulated by Framework" }], tags: ["liquidity", "risk", "basel"], industryRelevance: "Agents monitor liquidity ratios, forecast cash positions, and trigger early warning alerts for funding gaps." },
    { id: "fibo-24", label: "Transaction Monitoring", category: "Risk & Compliance", description: "Ongoing surveillance of financial transactions to detect suspicious patterns and potential fraud.", properties: [{ name: "monitoringRules", type: "integer", description: "Number of active detection rules" }, { name: "alertVolume", type: "integer", description: "Daily alerts generated" }, { name: "falsePositiveRate", type: "decimal", description: "Rate of false positive alerts" }], relationships: [{ type: "related", targetId: "fibo-7", label: "Part of AML Program" }, { type: "related", targetId: "fibo-12", label: "Monitors Payments" }], tags: ["monitoring", "fraud", "surveillance"], industryRelevance: "Agents triage transaction alerts, reduce false positives through pattern learning, and escalate genuine suspicious activity." },
    { id: "fibo-25", label: "Client Onboarding", category: "Parties & Roles", description: "The end-to-end process of registering a new client, including documentation, verification, and account setup.", properties: [{ name: "onboardingStage", type: "enum", description: "Application, verification, approval, or active" }, { name: "documentsRequired", type: "string[]", description: "Required documentation list" }, { name: "slaHours", type: "integer", description: "Target completion time" }], relationships: [{ type: "depends_on", targetId: "fibo-6", label: "Requires KYC" }, { type: "related", targetId: "fibo-13", label: "Creates Account" }, { type: "related", targetId: "fibo-18", label: "Identifies UBOs" }], tags: ["onboarding", "client", "workflow"], industryRelevance: "Agents orchestrate onboarding workflows, auto-collect documents, verify identities, and track SLA compliance." },
    { id: "fibo-26", label: "Interest Rate Swap", category: "Financial Instruments", description: "A derivative contract where two parties exchange interest rate cash flows based on a notional principal.", properties: [{ name: "fixedRate", type: "decimal", description: "Fixed leg rate" }, { name: "floatingIndex", type: "string", description: "Reference rate (SOFR, EURIBOR)" }, { name: "tenor", type: "string", description: "Swap duration" }], relationships: [{ type: "parent", targetId: "fibo-1", label: "Is a Derivative" }, { type: "related", targetId: "fibo-20", label: "Requires Collateral" }], tags: ["swaps", "interest-rate", "otc"], industryRelevance: "Agents price interest rate swaps, manage reset schedules, and calculate variation margin requirements." },
    { id: "fibo-27", label: "Sanctions List", category: "Regulatory", description: "Official lists of individuals, entities, and countries subject to economic sanctions and trade restrictions.", properties: [{ name: "listProvider", type: "string", description: "OFAC, EU, UN, or HMT" }, { name: "lastUpdated", type: "date", description: "Most recent list update" }, { name: "totalEntries", type: "integer", description: "Number of entries on list" }], relationships: [{ type: "related", targetId: "fibo-7", label: "Used in AML Screening" }, { type: "depends_on", targetId: "fibo-15", label: "Part of Regulatory Framework" }], tags: ["sanctions", "ofac", "screening"], industryRelevance: "Agents perform real-time sanctions screening against multiple lists, handle fuzzy matching, and manage alert resolution." },
    { id: "fibo-28", label: "Reconciliation Process", category: "Payment Systems", description: "The process of comparing internal records with external statements to identify and resolve discrepancies.", properties: [{ name: "reconciliationType", type: "enum", description: "Cash, position, or transaction" }, { name: "matchRate", type: "decimal", description: "Percentage of auto-matched items" }, { name: "breakThreshold", type: "decimal", description: "Tolerance for discrepancies" }], relationships: [{ type: "related", targetId: "fibo-10", label: "Validates Settlement" }, { type: "related", targetId: "fibo-13", label: "Reconciles Accounts" }], tags: ["reconciliation", "matching", "breaks"], industryRelevance: "Agents automate reconciliation matching, identify breaks, suggest resolutions, and track aging items." },
  ],
};

const SNOMED_ONTOLOGY: OntologyDefinition = {
  name: "SNOMED CT (Clinical Terms)",
  description: "A systematically organized, computer-processable collection of medical terms used in clinical documentation, reporting, and AI-driven clinical decision support.",
  concepts: [
    { id: "sno-1", label: "Clinical Assessment", category: "Clinical Findings", description: "A systematic evaluation of a patient's health status through history taking, examination, and diagnostic reasoning.", properties: [{ name: "assessmentType", type: "enum", description: "Initial, follow-up, or emergency" }, { name: "clinicalDomain", type: "string", description: "Medical specialty area" }, { name: "acuityLevel", type: "enum", description: "Patient acuity classification" }], relationships: [{ type: "child", targetId: "sno-2", label: "Includes Vital Signs" }, { type: "related", targetId: "sno-5", label: "Leads to Diagnosis" }, { type: "related", targetId: "sno-3", label: "May trigger Triage" }], tags: ["assessment", "evaluation", "clinical"], industryRelevance: "Agents assist clinicians with structured assessment workflows, symptom checking, and preliminary differential diagnosis." },
    { id: "sno-2", label: "Vital Signs Monitoring", category: "Clinical Findings", description: "Continuous or periodic measurement of essential physiological parameters including heart rate, blood pressure, and temperature.", properties: [{ name: "measurementFrequency", type: "string", description: "Monitoring interval" }, { name: "alertThresholds", type: "object", description: "Critical value thresholds" }, { name: "deviceType", type: "string", description: "Monitoring device used" }], relationships: [{ type: "parent", targetId: "sno-1", label: "Part of Clinical Assessment" }, { type: "related", targetId: "sno-16", label: "Recorded in EHR" }], tags: ["vitals", "monitoring", "physiological"], industryRelevance: "Agents monitor vital sign trends, detect deterioration patterns, and trigger early warning alerts for clinical teams." },
    { id: "sno-3", label: "Patient Triage", category: "Patient Management", description: "The process of determining the priority of patient treatment based on the severity of their condition.", properties: [{ name: "triageScale", type: "enum", description: "ESI, MTS, or CTAS scale" }, { name: "priorityLevel", type: "integer", description: "Urgency classification (1-5)" }, { name: "reassessmentInterval", type: "string", description: "Time to reassess" }], relationships: [{ type: "related", targetId: "sno-1", label: "Based on Assessment" }, { type: "related", targetId: "sno-4", label: "Determines Bed Assignment" }], tags: ["triage", "emergency", "priority"], industryRelevance: "Agents assist with triage scoring, predict patient acuity, and optimize ED patient flow." },
    { id: "sno-4", label: "Bed Management", category: "Patient Management", description: "The coordination of hospital bed availability, assignment, and discharge planning to optimize patient flow.", properties: [{ name: "bedStatus", type: "enum", description: "Available, occupied, cleaning, or blocked" }, { name: "ward", type: "string", description: "Hospital ward or unit" }, { name: "isolationRequired", type: "boolean", description: "Infection control requirement" }], relationships: [{ type: "related", targetId: "sno-3", label: "Assigned after Triage" }, { type: "related", targetId: "sno-10", label: "Released at Discharge" }], tags: ["beds", "capacity", "flow"], industryRelevance: "Agents predict bed demand, optimize assignments, and coordinate cleaning schedules to reduce wait times." },
    { id: "sno-5", label: "Diagnostic Coding", category: "Diagnostic", description: "Assignment of standardized codes (ICD-10, SNOMED CT) to clinical findings and diagnoses.", properties: [{ name: "codingSystem", type: "enum", description: "ICD-10, SNOMED CT, or DSM-5" }, { name: "primaryDiagnosis", type: "string", description: "Principal diagnosis code" }, { name: "coMorbidities", type: "string[]", description: "Associated condition codes" }], relationships: [{ type: "related", targetId: "sno-1", label: "Codes Assessment Findings" }, { type: "related", targetId: "sno-17", label: "Used in Billing" }], tags: ["coding", "icd", "diagnosis"], industryRelevance: "Agents suggest diagnostic codes from clinical notes, validate coding accuracy, and ensure reimbursement optimization." },
    { id: "sno-6", label: "Medication Administration", category: "Pharmaceutical", description: "The process of preparing and giving medications to patients according to prescribed orders.", properties: [{ name: "route", type: "enum", description: "Oral, IV, IM, or topical" }, { name: "dosage", type: "string", description: "Prescribed dose and frequency" }, { name: "verificationSteps", type: "string[]", description: "Safety check requirements" }], relationships: [{ type: "depends_on", targetId: "sno-7", label: "Based on Prescription" }, { type: "related", targetId: "sno-8", label: "Checked for Interactions" }], tags: ["medication", "administration", "nursing"], industryRelevance: "Agents verify medication orders against patient allergies, check interactions, and ensure five-rights compliance." },
    { id: "sno-7", label: "Prescription Order", category: "Pharmaceutical", description: "A formal instruction from a clinician for the preparation and administration of a medication.", properties: [{ name: "prescriber", type: "string", description: "Ordering clinician" }, { name: "medication", type: "string", description: "Drug name and formulation" }, { name: "duration", type: "string", description: "Treatment duration" }], relationships: [{ type: "child", targetId: "sno-6", label: "Administered as Medication" }, { type: "related", targetId: "sno-8", label: "Checked for Drug Interactions" }, { type: "related", targetId: "sno-9", label: "Sourced from Formulary" }], tags: ["prescription", "ordering", "cpoe"], industryRelevance: "Agents assist with prescription decision support, formulary checks, and prior authorization processing." },
    { id: "sno-8", label: "Drug Interaction Check", category: "Pharmaceutical", description: "Automated screening of medication combinations for potentially harmful interactions.", properties: [{ name: "severityLevel", type: "enum", description: "Contraindicated, major, moderate, or minor" }, { name: "interactionType", type: "string", description: "Pharmacokinetic or pharmacodynamic" }, { name: "evidenceLevel", type: "string", description: "Quality of supporting evidence" }], relationships: [{ type: "related", targetId: "sno-6", label: "Validates Medication" }, { type: "related", targetId: "sno-7", label: "Checks Prescriptions" }], tags: ["interactions", "safety", "pharmacology"], industryRelevance: "Agents perform real-time interaction screening across patient medication lists and alert clinicians to risks." },
    { id: "sno-9", label: "Formulary Management", category: "Pharmaceutical", description: "The process of maintaining an approved list of medications available within a healthcare organization.", properties: [{ name: "formularyStatus", type: "enum", description: "On-formulary, restricted, or non-formulary" }, { name: "therapeuticClass", type: "string", description: "Drug classification" }, { name: "costCategory", type: "enum", description: "Generic, preferred brand, or specialty" }], relationships: [{ type: "related", targetId: "sno-7", label: "Referenced by Prescriptions" }, { type: "related", targetId: "sno-17", label: "Impacts Billing" }], tags: ["formulary", "pharmacy", "cost"], industryRelevance: "Agents suggest formulary alternatives, calculate cost savings, and process therapeutic substitution requests." },
    { id: "sno-10", label: "Discharge Planning", category: "Patient Management", description: "The process of preparing a patient for safe transition from hospital to the next care setting.", properties: [{ name: "dischargeDestination", type: "enum", description: "Home, SNF, rehab, or hospice" }, { name: "followUpRequired", type: "boolean", description: "Post-discharge follow-up needed" }, { name: "dischargeMedications", type: "string[]", description: "Medications at discharge" }], relationships: [{ type: "related", targetId: "sno-4", label: "Frees Bed" }, { type: "related", targetId: "sno-11", label: "Generates Care Plan" }, { type: "depends_on", targetId: "sno-6", label: "Reconciles Medications" }], tags: ["discharge", "transition", "planning"], industryRelevance: "Agents coordinate discharge readiness checks, medication reconciliation, and follow-up appointment scheduling." },
    { id: "sno-11", label: "Care Plan", category: "Patient Management", description: "A structured document outlining the patient's diagnosis, treatment goals, interventions, and outcomes.", properties: [{ name: "planType", type: "enum", description: "Acute, chronic, or preventive" }, { name: "goals", type: "string[]", description: "Treatment objectives" }, { name: "reviewDate", type: "date", description: "Next plan review date" }], relationships: [{ type: "related", targetId: "sno-10", label: "Created at Discharge" }, { type: "related", targetId: "sno-1", label: "Based on Assessment" }], tags: ["care-plan", "treatment", "goals"], industryRelevance: "Agents generate personalized care plans, track goal progress, and suggest evidence-based interventions." },
    { id: "sno-12", label: "Lab Order Processing", category: "Diagnostic", description: "The workflow for ordering, collecting, processing, and reporting laboratory test results.", properties: [{ name: "testCategory", type: "enum", description: "Chemistry, hematology, microbiology, or pathology" }, { name: "urgency", type: "enum", description: "Routine, urgent, or STAT" }, { name: "turnaroundTime", type: "string", description: "Expected result delivery time" }], relationships: [{ type: "related", targetId: "sno-5", label: "Supports Diagnosis" }, { type: "related", targetId: "sno-13", label: "Results in Lab Report" }], tags: ["laboratory", "orders", "testing"], industryRelevance: "Agents optimize lab order panels, detect duplicate orders, and route results to appropriate clinicians." },
    { id: "sno-13", label: "Lab Results Interpretation", category: "Diagnostic", description: "The clinical evaluation of laboratory test results including reference range comparison and trending.", properties: [{ name: "resultStatus", type: "enum", description: "Preliminary, final, or amended" }, { name: "criticalFlag", type: "boolean", description: "Critical value requiring immediate action" }, { name: "trendDirection", type: "enum", description: "Improving, stable, or worsening" }], relationships: [{ type: "parent", targetId: "sno-12", label: "Result of Lab Order" }, { type: "related", targetId: "sno-1", label: "Informs Assessment" }], tags: ["results", "interpretation", "critical-values"], industryRelevance: "Agents flag abnormal results, compute trends, and generate clinical decision support alerts for physicians." },
    { id: "sno-14", label: "Surgical Procedure", category: "Procedures", description: "A medical intervention involving operative techniques performed in a controlled clinical setting.", properties: [{ name: "procedureType", type: "enum", description: "Elective, urgent, or emergency" }, { name: "anesthesiaType", type: "string", description: "General, regional, or local" }, { name: "estimatedDuration", type: "integer", description: "Expected procedure time in minutes" }], relationships: [{ type: "related", targetId: "sno-15", label: "Documented with Consent" }, { type: "related", targetId: "sno-4", label: "Requires Bed Post-Op" }], tags: ["surgery", "operative", "procedure"], industryRelevance: "Agents schedule surgical cases, check pre-op requirements, and coordinate OR resources." },
    { id: "sno-15", label: "Informed Consent", category: "Procedures", description: "The process of obtaining patient agreement for treatment after explaining risks, benefits, and alternatives.", properties: [{ name: "consentType", type: "enum", description: "Procedure, research, or treatment" }, { name: "witnessRequired", type: "boolean", description: "Witness signature needed" }, { name: "languageUsed", type: "string", description: "Communication language" }], relationships: [{ type: "related", targetId: "sno-14", label: "Required for Surgery" }, { type: "related", targetId: "sno-16", label: "Stored in EHR" }], tags: ["consent", "ethics", "documentation"], industryRelevance: "Agents track consent status, generate consent forms, and ensure documentation completeness before procedures." },
    { id: "sno-16", label: "EHR Documentation", category: "Administrative", description: "Electronic health record entries including clinical notes, assessments, and orders.", properties: [{ name: "documentType", type: "enum", description: "Progress note, H&P, or consultation" }, { name: "author", type: "string", description: "Documenting clinician" }, { name: "signatureStatus", type: "enum", description: "Draft, signed, or co-signed" }], relationships: [{ type: "related", targetId: "sno-2", label: "Records Vital Signs" }, { type: "related", targetId: "sno-15", label: "Stores Consents" }], tags: ["ehr", "documentation", "notes"], industryRelevance: "Agents assist with clinical note generation, template selection, and documentation quality auditing." },
    { id: "sno-17", label: "Clinical Billing", category: "Administrative", description: "The process of coding, submitting, and managing healthcare claims for reimbursement.", properties: [{ name: "payerType", type: "enum", description: "Medicare, Medicaid, commercial, or self-pay" }, { name: "claimStatus", type: "enum", description: "Submitted, pending, paid, or denied" }, { name: "totalCharges", type: "decimal", description: "Total billed amount" }], relationships: [{ type: "depends_on", targetId: "sno-5", label: "Uses Diagnostic Codes" }, { type: "related", targetId: "sno-9", label: "References Formulary" }], tags: ["billing", "claims", "reimbursement"], industryRelevance: "Agents optimize claim submissions, predict denial risk, and automate appeals for rejected claims." },
    { id: "sno-18", label: "Clinical Trial Enrollment", category: "Procedures", description: "The process of screening, consenting, and enrolling patients into research studies.", properties: [{ name: "trialPhase", type: "enum", description: "Phase I, II, III, or IV" }, { name: "eligibilityCriteria", type: "string[]", description: "Inclusion/exclusion criteria" }, { name: "protocolId", type: "string", description: "Study protocol identifier" }], relationships: [{ type: "related", targetId: "sno-15", label: "Requires Informed Consent" }, { type: "related", targetId: "sno-1", label: "Based on Clinical Assessment" }], tags: ["clinical-trials", "research", "enrollment"], industryRelevance: "Agents match patients to eligible trials, automate screening workflows, and track enrollment metrics." },
    { id: "sno-19", label: "Infection Control", category: "Clinical Findings", description: "Practices and procedures to prevent and control the spread of infections within healthcare facilities.", properties: [{ name: "precautionType", type: "enum", description: "Standard, contact, droplet, or airborne" }, { name: "organism", type: "string", description: "Identified pathogen" }, { name: "outbreakStatus", type: "boolean", description: "Active outbreak flagging" }], relationships: [{ type: "related", targetId: "sno-4", label: "Impacts Bed Management" }, { type: "related", targetId: "sno-16", label: "Documented in EHR" }], tags: ["infection", "prevention", "control"], industryRelevance: "Agents track infection patterns, predict outbreaks, and enforce isolation protocols automatically." },
    { id: "sno-20", label: "Radiology Order", category: "Diagnostic", description: "A request for imaging studies including X-ray, CT, MRI, and ultrasound examinations.", properties: [{ name: "modality", type: "enum", description: "X-ray, CT, MRI, US, or nuclear medicine" }, { name: "bodyRegion", type: "string", description: "Anatomical area to image" }, { name: "contrastRequired", type: "boolean", description: "Contrast media needed" }], relationships: [{ type: "related", targetId: "sno-5", label: "Supports Diagnosis" }, { type: "related", targetId: "sno-15", label: "May require Consent" }], tags: ["radiology", "imaging", "diagnostic"], industryRelevance: "Agents validate imaging appropriateness criteria, reduce duplicate orders, and prioritize reading queues." },
    { id: "sno-21", label: "Patient Transfer", category: "Patient Management", description: "The movement of a patient between care units, facilities, or levels of care.", properties: [{ name: "transferType", type: "enum", description: "Internal, external, or step-down" }, { name: "acuityChange", type: "string", description: "Change in care intensity" }, { name: "transportMode", type: "enum", description: "Ambulatory, wheelchair, or stretcher" }], relationships: [{ type: "related", targetId: "sno-4", label: "Involves Bed Assignment" }, { type: "related", targetId: "sno-11", label: "Updates Care Plan" }], tags: ["transfer", "transport", "handoff"], industryRelevance: "Agents coordinate transfer logistics, ensure handoff completeness, and manage inter-facility communication." },
    { id: "sno-22", label: "Adverse Event Reporting", category: "Clinical Findings", description: "Documentation and analysis of unexpected clinical events that result in patient harm or near-miss situations.", properties: [{ name: "severityGrade", type: "enum", description: "Near-miss, minor, moderate, or severe" }, { name: "eventCategory", type: "string", description: "Medication, fall, procedure, or device" }, { name: "rootCauseAnalysis", type: "boolean", description: "RCA initiated" }], relationships: [{ type: "related", targetId: "sno-6", label: "May involve Medication" }, { type: "related", targetId: "sno-14", label: "May involve Procedure" }], tags: ["adverse-events", "safety", "reporting"], industryRelevance: "Agents detect potential adverse events from clinical data, automate incident reporting, and identify systemic patterns." },
    { id: "sno-23", label: "Nursing Assessment", category: "Procedures", description: "A systematic evaluation performed by nursing staff covering patient needs, risks, and functional status.", properties: [{ name: "assessmentTool", type: "string", description: "Standardized tool used (Braden, Morse, etc.)" }, { name: "riskScore", type: "integer", description: "Calculated risk score" }, { name: "interventionsPlanned", type: "string[]", description: "Planned nursing interventions" }], relationships: [{ type: "related", targetId: "sno-1", label: "Part of Clinical Assessment" }, { type: "related", targetId: "sno-11", label: "Informs Care Plan" }], tags: ["nursing", "assessment", "risk-scoring"], industryRelevance: "Agents calculate risk scores, suggest prevention protocols, and track nursing assessment completion rates." },
    { id: "sno-24", label: "Referral Management", category: "Administrative", description: "The process of directing patients to specialist services, including authorization and scheduling.", properties: [{ name: "referralType", type: "enum", description: "Internal, external, or e-consult" }, { name: "specialtyTarget", type: "string", description: "Target medical specialty" }, { name: "urgency", type: "enum", description: "Routine, urgent, or emergent" }], relationships: [{ type: "related", targetId: "sno-1", label: "Based on Assessment" }, { type: "related", targetId: "sno-17", label: "Requires Authorization" }], tags: ["referral", "specialist", "coordination"], industryRelevance: "Agents automate referral routing, check authorization requirements, and match patients with appropriate specialists." },
    { id: "sno-25", label: "Medication Reconciliation", category: "Pharmaceutical", description: "The process of comparing a patient's medication orders with all medications the patient is currently taking.", properties: [{ name: "reconciliationPoint", type: "enum", description: "Admission, transfer, or discharge" }, { name: "discrepanciesFound", type: "integer", description: "Number of medication discrepancies" }, { name: "resolutionStatus", type: "enum", description: "Resolved, pending, or escalated" }], relationships: [{ type: "related", targetId: "sno-6", label: "Reviews Medications" }, { type: "related", targetId: "sno-10", label: "Required at Discharge" }], tags: ["reconciliation", "medication-safety", "transitions"], industryRelevance: "Agents compare medication lists across care transitions, identify discrepancies, and alert providers to unintentional changes." },
    { id: "sno-26", label: "Telehealth Encounter", category: "Procedures", description: "A clinical visit conducted remotely using video, audio, or asynchronous communication technology.", properties: [{ name: "modality", type: "enum", description: "Synchronous video, audio-only, or store-and-forward" }, { name: "platform", type: "string", description: "Telehealth platform used" }, { name: "technicalRequirements", type: "string[]", description: "Required technology" }], relationships: [{ type: "related", targetId: "sno-1", label: "Includes Assessment" }, { type: "related", targetId: "sno-16", label: "Documented in EHR" }], tags: ["telehealth", "virtual-care", "remote"], industryRelevance: "Agents schedule telehealth visits, verify technology readiness, and assist with virtual care documentation." },
    { id: "sno-27", label: "Quality Measure Reporting", category: "Administrative", description: "Collection and submission of healthcare quality metrics to regulatory and accreditation bodies.", properties: [{ name: "measureSet", type: "enum", description: "HEDIS, MIPS, or Core Measures" }, { name: "reportingPeriod", type: "string", description: "Measurement timeframe" }, { name: "performanceRate", type: "decimal", description: "Achievement percentage" }], relationships: [{ type: "depends_on", targetId: "sno-5", label: "Uses Diagnostic Data" }, { type: "related", targetId: "sno-16", label: "Sourced from EHR" }], tags: ["quality", "measures", "reporting"], industryRelevance: "Agents extract quality measure data, calculate performance rates, and identify gaps in care for improvement." },
    { id: "sno-28", label: "Pathology Report", category: "Diagnostic", description: "A detailed analysis of tissue, fluid, or cellular samples providing diagnostic information.", properties: [{ name: "specimenType", type: "string", description: "Type of specimen analyzed" }, { name: "findings", type: "string", description: "Pathological findings" }, { name: "reportStatus", type: "enum", description: "Preliminary, final, or addendum" }], relationships: [{ type: "related", targetId: "sno-14", label: "Follows Surgical Procedure" }, { type: "related", targetId: "sno-5", label: "Provides Diagnostic Codes" }], tags: ["pathology", "histology", "cytology"], industryRelevance: "Agents assist with pathology report structuring, synoptic formatting, and critical result notification routing." },
  ],
};

const ISA95_ONTOLOGY: OntologyDefinition = {
  name: "ISA-95 (Enterprise-Control Integration)",
  description: "An international standard for developing automated interfaces between enterprise and control systems in manufacturing, covering production, quality, maintenance, and inventory operations.",
  concepts: [
    { id: "isa-1", label: "Production Order", category: "Production Operations", description: "A directive to manufacture a specific quantity of product according to defined specifications and schedule.", properties: [{ name: "orderNumber", type: "string", description: "Unique production order identifier" }, { name: "quantity", type: "decimal", description: "Ordered quantity" }, { name: "scheduledStart", type: "datetime", description: "Planned start time" }, { name: "priority", type: "enum", description: "Normal, high, or rush" }], relationships: [{ type: "child", targetId: "isa-2", label: "Contains Work Orders" }, { type: "depends_on", targetId: "isa-11", label: "Requires Materials" }, { type: "related", targetId: "isa-5", label: "Subject to Quality Inspection" }], tags: ["production", "order", "scheduling"], industryRelevance: "Agents schedule production orders, optimize sequencing, and manage priority changes across production lines." },
    { id: "isa-2", label: "Work Order", category: "Production Operations", description: "A specific task or set of operations within a production order, assigned to a work center.", properties: [{ name: "workCenter", type: "string", description: "Assigned work center" }, { name: "operationSequence", type: "integer", description: "Step number in routing" }, { name: "setupTime", type: "decimal", description: "Equipment setup duration" }], relationships: [{ type: "parent", targetId: "isa-1", label: "Part of Production Order" }, { type: "related", targetId: "isa-15", label: "Uses Equipment" }, { type: "related", targetId: "isa-3", label: "Tracked by OEE" }], tags: ["work-order", "operations", "routing"], industryRelevance: "Agents dispatch work orders, track operation progress, and optimize work center loading." },
    { id: "isa-3", label: "OEE Calculation", category: "Production Operations", description: "Overall Equipment Effectiveness measurement combining availability, performance, and quality metrics.", properties: [{ name: "availability", type: "decimal", description: "Planned vs actual uptime" }, { name: "performance", type: "decimal", description: "Actual vs ideal cycle time" }, { name: "quality", type: "decimal", description: "Good units vs total produced" }], relationships: [{ type: "related", targetId: "isa-2", label: "Measures Work Orders" }, { type: "related", targetId: "isa-15", label: "Evaluates Equipment" }], tags: ["oee", "metrics", "effectiveness"], industryRelevance: "Agents calculate real-time OEE, identify loss categories, and recommend improvement actions." },
    { id: "isa-4", label: "Batch Record", category: "Production Operations", description: "A documented record of all activities, measurements, and deviations during a production batch.", properties: [{ name: "batchNumber", type: "string", description: "Unique batch identifier" }, { name: "startTime", type: "datetime", description: "Batch start timestamp" }, { name: "yieldPercentage", type: "decimal", description: "Actual vs expected yield" }], relationships: [{ type: "related", targetId: "isa-1", label: "Linked to Production Order" }, { type: "related", targetId: "isa-5", label: "Subject to Quality Check" }, { type: "related", targetId: "isa-11", label: "Consumes Materials" }], tags: ["batch", "record", "traceability"], industryRelevance: "Agents manage electronic batch records, validate process parameters, and ensure regulatory traceability." },
    { id: "isa-5", label: "Quality Inspection", category: "Quality Management", description: "A systematic examination of products, processes, or materials against defined quality standards.", properties: [{ name: "inspectionType", type: "enum", description: "Incoming, in-process, or final" }, { name: "sampleSize", type: "integer", description: "Number of items inspected" }, { name: "acceptanceCriteria", type: "string", description: "Pass/fail criteria" }], relationships: [{ type: "related", targetId: "isa-1", label: "Inspects Production" }, { type: "related", targetId: "isa-6", label: "May trigger NCR" }, { type: "depends_on", targetId: "isa-7", label: "Uses Quality Standards" }], tags: ["quality", "inspection", "testing"], industryRelevance: "Agents automate inspection scheduling, analyze measurement data, and predict quality issues before they occur." },
    { id: "isa-6", label: "Non-Conformance Report", category: "Quality Management", description: "Documentation of a product or process that does not meet specified quality requirements.", properties: [{ name: "ncrNumber", type: "string", description: "NCR tracking number" }, { name: "severity", type: "enum", description: "Critical, major, or minor" }, { name: "disposition", type: "enum", description: "Rework, scrap, use-as-is, or return" }], relationships: [{ type: "related", targetId: "isa-5", label: "Identified by Inspection" }, { type: "related", targetId: "isa-7", label: "Tracked under Quality System" }], tags: ["ncr", "non-conformance", "defect"], industryRelevance: "Agents classify non-conformances, suggest dispositions, and track CAPA effectiveness." },
    { id: "isa-7", label: "Quality Standard", category: "Quality Management", description: "Documented specifications and acceptance criteria that products and processes must meet.", properties: [{ name: "standardId", type: "string", description: "Standard reference number" }, { name: "version", type: "string", description: "Current version" }, { name: "reviewDate", type: "date", description: "Next review date" }], relationships: [{ type: "child", targetId: "isa-5", label: "Applied in Inspections" }, { type: "child", targetId: "isa-6", label: "Basis for NCRs" }], tags: ["standards", "specifications", "quality"], industryRelevance: "Agents manage standard revisions, distribute updates, and verify compliance across production lines." },
    { id: "isa-8", label: "Preventive Maintenance", category: "Maintenance", description: "Scheduled maintenance activities performed to prevent equipment failures and extend asset life.", properties: [{ name: "frequency", type: "string", description: "Maintenance interval" }, { name: "maintenanceType", type: "enum", description: "Lubrication, calibration, or replacement" }, { name: "estimatedDuration", type: "decimal", description: "Expected maintenance time" }], relationships: [{ type: "related", targetId: "isa-15", label: "Maintains Equipment" }, { type: "related", targetId: "isa-9", label: "May evolve to Predictive" }], tags: ["preventive", "maintenance", "scheduling"], industryRelevance: "Agents schedule preventive maintenance, optimize intervals based on usage, and minimize production disruption." },
    { id: "isa-9", label: "Predictive Maintenance", category: "Maintenance", description: "Condition-based maintenance using sensor data and analytics to predict equipment failures before they occur.", properties: [{ name: "predictionModel", type: "string", description: "ML model used for prediction" }, { name: "conditionIndicators", type: "string[]", description: "Monitored parameters (vibration, temp)" }, { name: "failureProbability", type: "decimal", description: "Predicted failure likelihood" }], relationships: [{ type: "related", targetId: "isa-8", label: "Enhances Preventive Maintenance" }, { type: "related", targetId: "isa-15", label: "Monitors Equipment" }, { type: "depends_on", targetId: "isa-16", label: "Uses Sensor Data" }], tags: ["predictive", "condition-based", "analytics"], industryRelevance: "Agents analyze equipment sensor data, predict failures, and automatically generate maintenance work orders." },
    { id: "isa-10", label: "Corrective Maintenance", category: "Maintenance", description: "Unplanned maintenance performed to restore equipment to operational condition after a failure.", properties: [{ name: "failureCode", type: "string", description: "Standardized failure classification" }, { name: "downtime", type: "decimal", description: "Total equipment downtime" }, { name: "rootCause", type: "string", description: "Identified root cause" }], relationships: [{ type: "related", targetId: "isa-15", label: "Repairs Equipment" }, { type: "related", targetId: "isa-3", label: "Impacts OEE" }], tags: ["corrective", "breakdown", "repair"], industryRelevance: "Agents prioritize corrective maintenance, analyze failure patterns, and recommend design improvements." },
    { id: "isa-11", label: "Material Tracking", category: "Inventory", description: "End-to-end tracking of raw materials, WIP, and finished goods through the production process.", properties: [{ name: "materialCode", type: "string", description: "Material identification code" }, { name: "lotNumber", type: "string", description: "Lot/batch tracking number" }, { name: "location", type: "string", description: "Current storage location" }], relationships: [{ type: "related", targetId: "isa-1", label: "Required by Production Orders" }, { type: "related", targetId: "isa-12", label: "Managed in Warehouse" }], tags: ["materials", "tracking", "traceability"], industryRelevance: "Agents track material movements, enforce lot traceability, and manage shelf-life expiration alerts." },
    { id: "isa-12", label: "Warehouse Management", category: "Inventory", description: "The operation and control of storage facilities including receiving, putaway, picking, and shipping.", properties: [{ name: "storageZone", type: "string", description: "Warehouse zone classification" }, { name: "capacityUtilization", type: "decimal", description: "Space utilization percentage" }, { name: "pickStrategy", type: "enum", description: "FIFO, LIFO, or FEFO" }], relationships: [{ type: "related", targetId: "isa-11", label: "Stores Materials" }, { type: "related", targetId: "isa-13", label: "Feeds Supply Chain" }], tags: ["warehouse", "storage", "logistics"], industryRelevance: "Agents optimize warehouse slotting, direct pick paths, and manage inventory accuracy programs." },
    { id: "isa-13", label: "Supply Chain Planning", category: "Supply Chain", description: "The strategic planning of material procurement, production scheduling, and distribution to meet demand.", properties: [{ name: "planningHorizon", type: "string", description: "Short, medium, or long-term" }, { name: "demandForecast", type: "decimal", description: "Projected demand quantity" }, { name: "safetyStock", type: "decimal", description: "Buffer inventory level" }], relationships: [{ type: "related", targetId: "isa-12", label: "Plans Warehouse Needs" }, { type: "related", targetId: "isa-14", label: "Manages Suppliers" }, { type: "related", targetId: "isa-1", label: "Drives Production Orders" }], tags: ["planning", "demand", "supply-chain"], industryRelevance: "Agents generate demand forecasts, optimize safety stock levels, and simulate supply chain scenarios." },
    { id: "isa-14", label: "Supplier Management", category: "Supply Chain", description: "The process of evaluating, selecting, and managing relationships with material and service suppliers.", properties: [{ name: "supplierRating", type: "decimal", description: "Performance score" }, { name: "leadTime", type: "integer", description: "Average delivery lead time" }, { name: "qualityCertification", type: "string[]", description: "Held certifications" }], relationships: [{ type: "related", targetId: "isa-13", label: "Supports Supply Planning" }, { type: "related", targetId: "isa-5", label: "Subject to Incoming Inspection" }], tags: ["suppliers", "procurement", "vendor"], industryRelevance: "Agents evaluate supplier performance, predict delivery risks, and automate purchase order generation." },
    { id: "isa-15", label: "Equipment Asset", category: "Equipment", description: "A physical machine, tool, or device used in manufacturing operations, tracked as a maintainable asset.", properties: [{ name: "assetId", type: "string", description: "Asset tag number" }, { name: "manufacturer", type: "string", description: "Equipment manufacturer" }, { name: "installDate", type: "date", description: "Installation date" }, { name: "status", type: "enum", description: "Running, idle, maintenance, or decommissioned" }], relationships: [{ type: "related", targetId: "isa-2", label: "Used in Work Orders" }, { type: "related", targetId: "isa-8", label: "Subject to Preventive Maintenance" }, { type: "related", targetId: "isa-9", label: "Monitored by Predictive Maintenance" }], tags: ["equipment", "asset", "machine"], industryRelevance: "Agents manage equipment lifecycle, track utilization, and optimize asset allocation across production lines." },
    { id: "isa-16", label: "Sensor Data Collection", category: "Equipment", description: "The acquisition and processing of real-time data from equipment sensors including temperature, pressure, and vibration.", properties: [{ name: "sensorType", type: "enum", description: "Temperature, pressure, vibration, or flow" }, { name: "samplingRate", type: "string", description: "Data collection frequency" }, { name: "dataProtocol", type: "string", description: "OPC UA, MQTT, or Modbus" }], relationships: [{ type: "related", targetId: "isa-15", label: "Monitors Equipment" }, { type: "child", targetId: "isa-9", label: "Feeds Predictive Maintenance" }], tags: ["sensors", "iot", "data-collection"], industryRelevance: "Agents process sensor streams, detect anomalies in real-time, and correlate sensor data with quality outcomes." },
    { id: "isa-17", label: "Production Schedule", category: "Production Operations", description: "A detailed plan specifying what to produce, when, and on which equipment, optimized for efficiency.", properties: [{ name: "scheduleHorizon", type: "string", description: "Planning window (shift, day, week)" }, { name: "utilizationTarget", type: "decimal", description: "Target capacity utilization" }, { name: "changeoverMinimization", type: "boolean", description: "Optimize for fewer changeovers" }], relationships: [{ type: "child", targetId: "isa-1", label: "Sequences Production Orders" }, { type: "related", targetId: "isa-15", label: "Allocates Equipment" }], tags: ["scheduling", "planning", "capacity"], industryRelevance: "Agents create optimized production schedules, handle disruptions, and rebalance loads dynamically." },
    { id: "isa-18", label: "Changeover Process", category: "Production Operations", description: "The set of activities required to switch production from one product to another on the same equipment.", properties: [{ name: "changeoverType", type: "enum", description: "Full, partial, or cleaning-only" }, { name: "targetDuration", type: "decimal", description: "Target changeover time" }, { name: "cleaningRequired", type: "boolean", description: "Product-contact cleaning needed" }], relationships: [{ type: "related", targetId: "isa-15", label: "Performed on Equipment" }, { type: "related", targetId: "isa-17", label: "Impacts Schedule" }], tags: ["changeover", "setup", "smed"], industryRelevance: "Agents optimize changeover sequences, track setup reduction initiatives, and minimize lost production time." },
    { id: "isa-19", label: "Energy Management", category: "Equipment", description: "Monitoring and optimization of energy consumption across manufacturing equipment and facilities.", properties: [{ name: "energyType", type: "enum", description: "Electricity, gas, steam, or compressed air" }, { name: "consumptionRate", type: "decimal", description: "Current usage rate" }, { name: "costPerUnit", type: "decimal", description: "Energy cost per unit" }], relationships: [{ type: "related", targetId: "isa-15", label: "Consumed by Equipment" }, { type: "related", targetId: "isa-3", label: "Part of Efficiency Metrics" }], tags: ["energy", "sustainability", "cost"], industryRelevance: "Agents monitor energy consumption patterns, identify waste, and schedule energy-intensive operations during off-peak periods." },
    { id: "isa-20", label: "Bill of Materials", category: "Inventory", description: "A comprehensive list of raw materials, components, and sub-assemblies required to manufacture a product.", properties: [{ name: "bomLevel", type: "integer", description: "BOM hierarchy level" }, { name: "componentCount", type: "integer", description: "Number of components" }, { name: "revision", type: "string", description: "Current BOM revision" }], relationships: [{ type: "related", targetId: "isa-1", label: "Defines Production Requirements" }, { type: "related", targetId: "isa-11", label: "Lists Materials" }], tags: ["bom", "components", "structure"], industryRelevance: "Agents validate BOM accuracy, calculate material requirements, and manage engineering change orders." },
    { id: "isa-21", label: "SPC Analysis", category: "Quality Management", description: "Statistical Process Control using control charts and statistical methods to monitor process stability.", properties: [{ name: "controlChartType", type: "enum", description: "X-bar, R, p, or c chart" }, { name: "controlLimits", type: "object", description: "UCL, LCL, and CL values" }, { name: "processCapability", type: "decimal", description: "Cpk value" }], relationships: [{ type: "related", targetId: "isa-5", label: "Supports Quality Inspection" }, { type: "related", targetId: "isa-16", label: "Uses Sensor Data" }], tags: ["spc", "statistics", "process-control"], industryRelevance: "Agents monitor SPC charts in real-time, detect out-of-control conditions, and trigger corrective actions." },
    { id: "isa-22", label: "CAPA Process", category: "Quality Management", description: "Corrective and Preventive Action methodology for systematically resolving quality issues and preventing recurrence.", properties: [{ name: "capaType", type: "enum", description: "Corrective or preventive" }, { name: "rootCauseMethod", type: "string", description: "5-Why, fishbone, or FMEA" }, { name: "effectivenessReview", type: "date", description: "Effectiveness check date" }], relationships: [{ type: "related", targetId: "isa-6", label: "Addresses NCRs" }, { type: "related", targetId: "isa-7", label: "Updates Quality Standards" }], tags: ["capa", "improvement", "root-cause"], industryRelevance: "Agents track CAPA timelines, analyze root cause patterns across incidents, and verify effectiveness of corrective actions." },
    { id: "isa-23", label: "Production Line", category: "Equipment", description: "A coordinated sequence of workstations and equipment configured to produce specific products.", properties: [{ name: "lineId", type: "string", description: "Production line identifier" }, { name: "throughput", type: "decimal", description: "Units per hour capacity" }, { name: "productFamily", type: "string", description: "Product types supported" }], relationships: [{ type: "child", targetId: "isa-15", label: "Contains Equipment Assets" }, { type: "related", targetId: "isa-17", label: "Scheduled for Production" }], tags: ["production-line", "capacity", "layout"], industryRelevance: "Agents balance production lines, simulate layout changes, and optimize throughput across multiple configurations." },
    { id: "isa-24", label: "Shipping and Logistics", category: "Supply Chain", description: "The coordination of finished goods packaging, shipping documentation, and transportation to customers.", properties: [{ name: "shippingMethod", type: "enum", description: "Truck, rail, air, or ocean" }, { name: "trackingNumber", type: "string", description: "Shipment tracking identifier" }, { name: "deliveryWindow", type: "string", description: "Expected delivery timeframe" }], relationships: [{ type: "related", targetId: "isa-12", label: "Ships from Warehouse" }, { type: "related", targetId: "isa-1", label: "Fulfills Production Orders" }], tags: ["shipping", "logistics", "transportation"], industryRelevance: "Agents optimize shipping routes, consolidate loads, and proactively manage delivery exceptions." },
    { id: "isa-25", label: "Calibration Management", category: "Maintenance", description: "The systematic process of verifying and adjusting measurement instruments to ensure accuracy.", properties: [{ name: "calibrationInterval", type: "string", description: "Required calibration frequency" }, { name: "tolerance", type: "decimal", description: "Acceptable measurement tolerance" }, { name: "certificateExpiry", type: "date", description: "Calibration certificate expiry" }], relationships: [{ type: "related", targetId: "isa-15", label: "Calibrates Equipment" }, { type: "related", targetId: "isa-5", label: "Ensures Inspection Accuracy" }], tags: ["calibration", "measurement", "accuracy"], industryRelevance: "Agents track calibration schedules, flag overdue instruments, and prevent use of out-of-calibration equipment." },
    { id: "isa-26", label: "Scrap and Rework", category: "Production Operations", description: "Management of defective products including scrapping unusable items and reworking salvageable ones.", properties: [{ name: "scrapRate", type: "decimal", description: "Percentage of scrapped output" }, { name: "reworkCost", type: "decimal", description: "Cost of rework operations" }, { name: "dispositionCode", type: "string", description: "Scrap category code" }], relationships: [{ type: "related", targetId: "isa-6", label: "Result of NCR" }, { type: "related", targetId: "isa-3", label: "Impacts OEE Quality" }], tags: ["scrap", "rework", "waste"], industryRelevance: "Agents analyze scrap patterns, calculate waste costs, and identify process improvements to reduce defect rates." },
    { id: "isa-27", label: "Recipe Management", category: "Production Operations", description: "Definition and management of product recipes including ingredients, process parameters, and procedures.", properties: [{ name: "recipeVersion", type: "string", description: "Active recipe version" }, { name: "parameters", type: "object", description: "Process set-points and ranges" }, { name: "approvalStatus", type: "enum", description: "Draft, approved, or obsolete" }], relationships: [{ type: "related", targetId: "isa-1", label: "Used in Production" }, { type: "related", targetId: "isa-20", label: "Linked to BOM" }], tags: ["recipe", "formula", "process"], industryRelevance: "Agents manage recipe versions, enforce parameter limits, and ensure correct recipe selection for production runs." },
  ],
};

const GS1_ONTOLOGY: OntologyDefinition = {
  name: "GS1 (Global Standards)",
  description: "A global system of standards for product identification, data capture, and information sharing across retail and e-commerce supply chains.",
  concepts: [
    { id: "gs1-1", label: "GTIN Management", category: "Product Identification", description: "Global Trade Item Number management for uniquely identifying products across the supply chain.", properties: [{ name: "gtinFormat", type: "enum", description: "GTIN-8, GTIN-12, GTIN-13, or GTIN-14" }, { name: "brandOwner", type: "string", description: "Brand owner company" }, { name: "productHierarchy", type: "string", description: "Item, case, or pallet level" }], relationships: [{ type: "child", targetId: "gs1-2", label: "Includes Product Attributes" }, { type: "related", targetId: "gs1-8", label: "Tracked in Inventory" }], tags: ["gtin", "barcode", "identification"], industryRelevance: "Agents manage GTIN assignments, validate barcode accuracy, and ensure product data syndication across channels." },
    { id: "gs1-2", label: "Product Data Enrichment", category: "Product Identification", description: "The process of enhancing product information with detailed attributes, images, and marketing content.", properties: [{ name: "attributeCompleteness", type: "decimal", description: "Percentage of filled attributes" }, { name: "imageCount", type: "integer", description: "Number of product images" }, { name: "contentScore", type: "decimal", description: "Content quality score" }], relationships: [{ type: "parent", targetId: "gs1-1", label: "Enriches GTIN Data" }, { type: "related", targetId: "gs1-7", label: "Supports Customer Experience" }], tags: ["product-data", "enrichment", "content"], industryRelevance: "Agents auto-enrich product listings, generate descriptions, and score content quality for marketplace optimization." },
    { id: "gs1-3", label: "Category Management", category: "Product Identification", description: "Strategic management of product categories as business units to optimize assortment and shelf space.", properties: [{ name: "categoryTree", type: "string", description: "Taxonomy hierarchy path" }, { name: "shareOfShelf", type: "decimal", description: "Category space allocation" }, { name: "categoryRole", type: "enum", description: "Destination, routine, seasonal, or convenience" }], relationships: [{ type: "related", targetId: "gs1-1", label: "Categorizes Products" }, { type: "related", targetId: "gs1-10", label: "Influences Pricing" }], tags: ["category", "assortment", "merchandising"], industryRelevance: "Agents analyze category performance, recommend assortment changes, and optimize planogram layouts." },
    { id: "gs1-4", label: "Demand Forecasting", category: "Supply Chain", description: "Statistical and ML-based prediction of future product demand to optimize inventory and procurement.", properties: [{ name: "forecastHorizon", type: "string", description: "Prediction timeframe" }, { name: "forecastAccuracy", type: "decimal", description: "MAPE or WMAPE metric" }, { name: "modelType", type: "enum", description: "Statistical, ML, or ensemble" }], relationships: [{ type: "related", targetId: "gs1-8", label: "Drives Inventory Planning" }, { type: "related", targetId: "gs1-5", label: "Informs Replenishment" }], tags: ["forecast", "demand", "prediction"], industryRelevance: "Agents generate demand forecasts, detect promotional lifts, and adjust predictions for seasonal patterns." },
    { id: "gs1-5", label: "Replenishment Order", category: "Supply Chain", description: "An automated or manual order to replenish inventory from suppliers or distribution centers.", properties: [{ name: "reorderPoint", type: "decimal", description: "Trigger inventory level" }, { name: "orderQuantity", type: "decimal", description: "Replenishment quantity" }, { name: "leadTime", type: "integer", description: "Supplier lead time in days" }], relationships: [{ type: "depends_on", targetId: "gs1-4", label: "Based on Demand Forecast" }, { type: "related", targetId: "gs1-8", label: "Replenishes Inventory" }, { type: "related", targetId: "gs1-6", label: "Part of Supply Chain" }], tags: ["replenishment", "reorder", "procurement"], industryRelevance: "Agents automate replenishment triggers, optimize order quantities, and manage supplier lead time variability." },
    { id: "gs1-6", label: "Supply Chain Visibility", category: "Supply Chain", description: "End-to-end tracking and monitoring of goods movement from supplier through distribution to store shelf.", properties: [{ name: "trackingLevel", type: "enum", description: "Pallet, case, or item level" }, { name: "visibilityPoints", type: "integer", description: "Number of tracking checkpoints" }, { name: "etaAccuracy", type: "decimal", description: "ETA prediction accuracy" }], relationships: [{ type: "related", targetId: "gs1-5", label: "Tracks Replenishment" }, { type: "related", targetId: "gs1-12", label: "Supports Fulfillment" }], tags: ["visibility", "tracking", "transparency"], industryRelevance: "Agents provide real-time shipment visibility, predict delays, and proactively reroute inventory." },
    { id: "gs1-7", label: "Customer Journey Analytics", category: "Customer Experience", description: "Analysis of customer interactions across touchpoints from awareness through purchase and post-sale.", properties: [{ name: "touchpoints", type: "string[]", description: "Tracked interaction channels" }, { name: "conversionRate", type: "decimal", description: "Overall conversion percentage" }, { name: "customerLifetimeValue", type: "decimal", description: "Predicted CLV" }], relationships: [{ type: "related", targetId: "gs1-2", label: "Uses Product Data" }, { type: "related", targetId: "gs1-9", label: "Informs Personalization" }], tags: ["journey", "analytics", "conversion"], industryRelevance: "Agents analyze customer journeys, identify drop-off points, and recommend engagement strategies." },
    { id: "gs1-8", label: "Inventory Optimization", category: "Inventory", description: "Strategic management of inventory levels to balance availability with carrying costs and waste reduction.", properties: [{ name: "turnoverRate", type: "decimal", description: "Inventory turns per period" }, { name: "daysOfSupply", type: "decimal", description: "Current days of coverage" }, { name: "stockoutRate", type: "decimal", description: "Out-of-stock percentage" }], relationships: [{ type: "related", targetId: "gs1-1", label: "Tracks GTIN Inventory" }, { type: "depends_on", targetId: "gs1-4", label: "Driven by Forecasts" }, { type: "related", targetId: "gs1-5", label: "Triggers Replenishment" }], tags: ["inventory", "optimization", "stock"], industryRelevance: "Agents optimize inventory positions, calculate economic order quantities, and reduce carrying costs." },
    { id: "gs1-9", label: "Personalization Engine", category: "Customer Experience", description: "Real-time recommendation and content personalization based on customer behavior and preferences.", properties: [{ name: "algorithmType", type: "enum", description: "Collaborative, content-based, or hybrid" }, { name: "recommendationCount", type: "integer", description: "Items recommended per session" }, { name: "clickThroughRate", type: "decimal", description: "Recommendation CTR" }], relationships: [{ type: "depends_on", targetId: "gs1-7", label: "Uses Journey Analytics" }, { type: "related", targetId: "gs1-2", label: "References Product Data" }], tags: ["personalization", "recommendations", "ai"], industryRelevance: "Agents deliver personalized product recommendations, optimize content placement, and adapt to real-time behavior." },
    { id: "gs1-10", label: "Price Elasticity Analysis", category: "Pricing", description: "Measurement of demand sensitivity to price changes to optimize pricing strategies.", properties: [{ name: "elasticityCoefficient", type: "decimal", description: "Price elasticity value" }, { name: "competitorPricing", type: "object", description: "Competitor price tracking" }, { name: "marginTarget", type: "decimal", description: "Target gross margin" }], relationships: [{ type: "related", targetId: "gs1-3", label: "By Category" }, { type: "related", targetId: "gs1-11", label: "Feeds Promotion Planning" }], tags: ["pricing", "elasticity", "optimization"], industryRelevance: "Agents model price elasticity, simulate pricing scenarios, and recommend optimal price points." },
    { id: "gs1-11", label: "Promotion Planning", category: "Pricing", description: "Design and execution of promotional campaigns including discounts, bundles, and loyalty offers.", properties: [{ name: "promotionType", type: "enum", description: "Discount, BOGO, bundle, or loyalty" }, { name: "upliftTarget", type: "decimal", description: "Expected sales lift" }, { name: "cannibalizeRisk", type: "decimal", description: "Risk of cannibalizing other products" }], relationships: [{ type: "depends_on", targetId: "gs1-10", label: "Based on Elasticity" }, { type: "related", targetId: "gs1-4", label: "Impacts Demand Forecast" }], tags: ["promotions", "campaigns", "offers"], industryRelevance: "Agents optimize promotion calendars, predict uplift, and measure post-promotion cannibalization effects." },
    { id: "gs1-12", label: "Order Fulfillment", category: "Fulfillment", description: "The end-to-end process of receiving, processing, picking, packing, and shipping customer orders.", properties: [{ name: "fulfillmentMethod", type: "enum", description: "Ship-from-store, DC, or drop-ship" }, { name: "pickAccuracy", type: "decimal", description: "Order accuracy rate" }, { name: "cycleTime", type: "decimal", description: "Order-to-ship time" }], relationships: [{ type: "related", targetId: "gs1-8", label: "Uses Inventory" }, { type: "related", targetId: "gs1-6", label: "Tracked by Supply Chain" }, { type: "related", targetId: "gs1-13", label: "May result in Returns" }], tags: ["fulfillment", "shipping", "picking"], industryRelevance: "Agents optimize pick routes, allocate orders to optimal fulfillment nodes, and manage shipping carrier selection." },
    { id: "gs1-13", label: "Returns Processing", category: "Fulfillment", description: "Management of product returns including authorization, inspection, restocking, and refund processing.", properties: [{ name: "returnRate", type: "decimal", description: "Product return percentage" }, { name: "returnReason", type: "enum", description: "Defective, wrong item, not as described, or changed mind" }, { name: "dispositionPath", type: "enum", description: "Restock, refurbish, liquidate, or recycle" }], relationships: [{ type: "related", targetId: "gs1-12", label: "Reverses Fulfillment" }, { type: "related", targetId: "gs1-8", label: "Returns to Inventory" }], tags: ["returns", "reverse-logistics", "refunds"], industryRelevance: "Agents classify return reasons, automate RMA processing, and identify fraud patterns in return behavior." },
    { id: "gs1-14", label: "Loyalty Program Management", category: "Customer Experience", description: "Administration of customer loyalty programs including points accrual, redemption, and tier management.", properties: [{ name: "programType", type: "enum", description: "Points, tiered, paid, or coalition" }, { name: "activeMembers", type: "integer", description: "Active loyalty members" }, { name: "redemptionRate", type: "decimal", description: "Points redemption percentage" }], relationships: [{ type: "related", targetId: "gs1-7", label: "Enriches Journey Data" }, { type: "related", targetId: "gs1-9", label: "Feeds Personalization" }], tags: ["loyalty", "rewards", "retention"], industryRelevance: "Agents manage loyalty accruals, predict churn, and personalize reward offers based on member behavior." },
    { id: "gs1-15", label: "Markdown Optimization", category: "Pricing", description: "Strategic timing and depth of price reductions to clear excess inventory while maximizing revenue recovery.", properties: [{ name: "markdownCadence", type: "string", description: "Reduction schedule" }, { name: "clearanceTarget", type: "date", description: "Target clearance date" }, { name: "revenueRecovery", type: "decimal", description: "Percentage of original price recovered" }], relationships: [{ type: "related", targetId: "gs1-8", label: "Reduces Inventory" }, { type: "depends_on", targetId: "gs1-10", label: "Uses Elasticity Data" }], tags: ["markdown", "clearance", "optimization"], industryRelevance: "Agents optimize markdown timing and depth, simulate sell-through scenarios, and maximize margin recovery." },
    { id: "gs1-16", label: "Store Operations", category: "Fulfillment", description: "Day-to-day management of retail store activities including staffing, display, and customer service.", properties: [{ name: "storeFormat", type: "enum", description: "Full-line, express, outlet, or pop-up" }, { name: "laborHours", type: "decimal", description: "Allocated labor hours" }, { name: "salesPerSquareFoot", type: "decimal", description: "Space productivity metric" }], relationships: [{ type: "related", targetId: "gs1-8", label: "Manages Store Inventory" }, { type: "related", targetId: "gs1-12", label: "Supports Ship-from-Store" }], tags: ["store", "operations", "retail"], industryRelevance: "Agents optimize labor scheduling, predict foot traffic, and generate task lists for store associates." },
    { id: "gs1-17", label: "Omnichannel Integration", category: "Customer Experience", description: "Unified commerce approach ensuring consistent experience across online, mobile, and physical channels.", properties: [{ name: "channels", type: "string[]", description: "Active commerce channels" }, { name: "unifiedCartEnabled", type: "boolean", description: "Cross-channel cart support" }, { name: "inventoryVisibility", type: "enum", description: "Channel-specific or unified" }], relationships: [{ type: "related", targetId: "gs1-7", label: "Enables Journey Analytics" }, { type: "related", targetId: "gs1-12", label: "Unifies Fulfillment" }], tags: ["omnichannel", "unified-commerce", "integration"], industryRelevance: "Agents synchronize inventory and pricing across channels, manage click-and-collect workflows, and resolve cross-channel conflicts." },
    { id: "gs1-18", label: "Planogram Compliance", category: "Product Identification", description: "Monitoring and enforcement of product placement according to approved planogram layouts.", properties: [{ name: "complianceRate", type: "decimal", description: "Planogram adherence percentage" }, { name: "auditFrequency", type: "string", description: "Compliance check interval" }, { name: "shelfCapacity", type: "integer", description: "Maximum facing count" }], relationships: [{ type: "related", targetId: "gs1-3", label: "Implements Category Strategy" }, { type: "related", targetId: "gs1-1", label: "Places GTINs on Shelf" }], tags: ["planogram", "shelf", "compliance"], industryRelevance: "Agents analyze shelf images for compliance, detect out-of-stocks, and suggest planogram adjustments." },
    { id: "gs1-19", label: "Vendor Collaboration", category: "Supply Chain", description: "Strategic partnership programs with suppliers including VMI, collaborative planning, and joint business planning.", properties: [{ name: "collaborationType", type: "enum", description: "VMI, CPFR, or JBP" }, { name: "dataSharing", type: "string[]", description: "Shared data categories" }, { name: "performanceScorecard", type: "decimal", description: "Vendor performance score" }], relationships: [{ type: "related", targetId: "gs1-5", label: "Manages Replenishment" }, { type: "related", targetId: "gs1-4", label: "Shares Forecast Data" }], tags: ["vendor", "collaboration", "vmi"], industryRelevance: "Agents facilitate data sharing with vendors, generate performance scorecards, and automate collaborative forecasting." },
    { id: "gs1-20", label: "Last Mile Delivery", category: "Fulfillment", description: "The final stage of delivery from distribution point to the customer's location.", properties: [{ name: "deliveryMethod", type: "enum", description: "Standard, express, same-day, or curbside" }, { name: "deliveryWindow", type: "string", description: "Promised delivery timeframe" }, { name: "deliverySuccessRate", type: "decimal", description: "First-attempt delivery rate" }], relationships: [{ type: "related", targetId: "gs1-12", label: "Final step of Fulfillment" }, { type: "related", targetId: "gs1-6", label: "Tracked for Visibility" }], tags: ["last-mile", "delivery", "logistics"], industryRelevance: "Agents optimize delivery routes, predict delivery windows, and manage customer communication for last-mile operations." },
    { id: "gs1-21", label: "Customer Segmentation", category: "Customer Experience", description: "Classification of customers into distinct groups based on behavior, demographics, and value.", properties: [{ name: "segmentCount", type: "integer", description: "Number of active segments" }, { name: "segmentationModel", type: "enum", description: "RFM, behavioral, or predictive" }, { name: "refreshFrequency", type: "string", description: "Model refresh interval" }], relationships: [{ type: "related", targetId: "gs1-7", label: "Uses Journey Data" }, { type: "related", targetId: "gs1-9", label: "Feeds Personalization" }], tags: ["segmentation", "targeting", "analytics"], industryRelevance: "Agents build dynamic customer segments, predict segment migration, and tailor marketing campaigns." },
    { id: "gs1-22", label: "Competitive Intelligence", category: "Pricing", description: "Systematic collection and analysis of competitor pricing, assortment, and promotional activities.", properties: [{ name: "competitorCount", type: "integer", description: "Number of tracked competitors" }, { name: "priceMatchPolicy", type: "enum", description: "Match, beat, or ignore" }, { name: "scrapeFrequency", type: "string", description: "Data collection frequency" }], relationships: [{ type: "related", targetId: "gs1-10", label: "Informs Pricing" }, { type: "related", targetId: "gs1-11", label: "Benchmarks Promotions" }], tags: ["competitive", "intelligence", "pricing"], industryRelevance: "Agents monitor competitor prices, detect competitive threats, and recommend reactive pricing strategies." },
    { id: "gs1-23", label: "Product Recall Management", category: "Supply Chain", description: "The process of managing product recalls including identification, notification, and recovery of affected items.", properties: [{ name: "recallClass", type: "enum", description: "Class I, II, or III severity" }, { name: "affectedUnits", type: "integer", description: "Number of units in scope" }, { name: "recoveryRate", type: "decimal", description: "Percentage of units recovered" }], relationships: [{ type: "related", targetId: "gs1-1", label: "Identifies Affected GTINs" }, { type: "related", targetId: "gs1-6", label: "Tracked through Supply Chain" }], tags: ["recall", "safety", "compliance"], industryRelevance: "Agents identify affected inventory across locations, automate customer notifications, and track recovery progress." },
    { id: "gs1-24", label: "Sustainability Tracking", category: "Supply Chain", description: "Monitoring and reporting of environmental impact metrics across the retail supply chain.", properties: [{ name: "carbonFootprint", type: "decimal", description: "CO2 equivalent per unit" }, { name: "packagingScore", type: "decimal", description: "Sustainable packaging rating" }, { name: "supplyChainMiles", type: "decimal", description: "Total transport distance" }], relationships: [{ type: "related", targetId: "gs1-6", label: "Measured across Supply Chain" }, { type: "related", targetId: "gs1-2", label: "Enriches Product Data" }], tags: ["sustainability", "esg", "carbon"], industryRelevance: "Agents calculate carbon footprints, score supplier sustainability, and generate ESG compliance reports." },
    { id: "gs1-25", label: "Digital Shelf Analytics", category: "Product Identification", description: "Monitoring and optimization of product presentation and performance on e-commerce platforms.", properties: [{ name: "searchRanking", type: "integer", description: "Average search result position" }, { name: "buyBoxWinRate", type: "decimal", description: "Buy box ownership percentage" }, { name: "reviewScore", type: "decimal", description: "Average customer rating" }], relationships: [{ type: "related", targetId: "gs1-2", label: "Evaluates Product Content" }, { type: "related", targetId: "gs1-22", label: "Compares to Competitors" }], tags: ["digital-shelf", "e-commerce", "analytics"], industryRelevance: "Agents monitor digital shelf metrics, optimize product listings, and alert teams to ranking drops." },
    { id: "gs1-26", label: "Fraud Detection", category: "Customer Experience", description: "Identification and prevention of fraudulent transactions, account takeovers, and payment abuse.", properties: [{ name: "detectionMethod", type: "enum", description: "Rule-based, ML, or hybrid" }, { name: "falsePositiveRate", type: "decimal", description: "Rate of legitimate orders flagged" }, { name: "chargebackRate", type: "decimal", description: "Chargeback percentage" }], relationships: [{ type: "related", targetId: "gs1-12", label: "Screens Orders" }, { type: "related", targetId: "gs1-13", label: "Detects Return Fraud" }], tags: ["fraud", "security", "prevention"], industryRelevance: "Agents score transactions for fraud risk, adapt detection rules, and automate investigation workflows." },
    { id: "gs1-27", label: "Assortment Planning", category: "Product Identification", description: "Selection and management of the optimal product mix for each store, channel, or market.", properties: [{ name: "assortmentDepth", type: "integer", description: "SKU count per category" }, { name: "localRelevance", type: "decimal", description: "Market fit score" }, { name: "newItemIntroRate", type: "decimal", description: "New product adoption rate" }], relationships: [{ type: "related", targetId: "gs1-3", label: "Within Category Strategy" }, { type: "related", targetId: "gs1-4", label: "Based on Demand Signals" }], tags: ["assortment", "planning", "merchandising"], industryRelevance: "Agents recommend assortment changes based on local demand, competitor analysis, and trend signals." },
  ],
};

const ONTOLOGY_MAP: Record<string, OntologyDefinition> = {
  financial_services: FIBO_ONTOLOGY,
  healthcare: SNOMED_ONTOLOGY,
  manufacturing: ISA95_ONTOLOGY,
  retail: GS1_ONTOLOGY,
};

const AGENT_MAPPING: Record<string, { skills: string[]; agentTypes: string[] }> = {
  "Financial Instruments": { skills: ["Trade Execution", "Pricing", "Portfolio Analysis", "Risk Calculation"], agentTypes: ["Trading Agent", "Portfolio Manager Agent", "Market Analyst Agent"] },
  "Parties & Roles": { skills: ["Identity Verification", "Client Onboarding", "Due Diligence", "Relationship Management"], agentTypes: ["KYC Agent", "Onboarding Agent", "Client Service Agent"] },
  "Risk & Compliance": { skills: ["Risk Scoring", "Compliance Checking", "Alert Triage", "Report Generation"], agentTypes: ["Compliance Agent", "Risk Monitor Agent", "AML Agent"] },
  "Market Data": { skills: ["Data Aggregation", "Price Discovery", "Valuation", "Analytics"], agentTypes: ["Data Agent", "Valuation Agent", "Analytics Agent"] },
  "Payment Systems": { skills: ["Payment Processing", "Reconciliation", "Settlement Matching", "Exception Handling"], agentTypes: ["Payment Agent", "Settlement Agent", "Reconciliation Agent"] },
  "Regulatory": { skills: ["Report Filing", "Rule Interpretation", "Impact Analysis", "Change Tracking"], agentTypes: ["Regulatory Agent", "Reporting Agent", "Compliance Monitor Agent"] },
  "Clinical Findings": { skills: ["Symptom Analysis", "Pattern Detection", "Alert Generation", "Trend Monitoring"], agentTypes: ["Clinical Decision Support Agent", "Monitoring Agent", "Infection Control Agent"] },
  "Procedures": { skills: ["Scheduling", "Documentation", "Consent Tracking", "Protocol Compliance"], agentTypes: ["Surgical Coordinator Agent", "Documentation Agent", "Clinical Trial Agent"] },
  "Patient Management": { skills: ["Flow Optimization", "Capacity Planning", "Discharge Coordination", "Care Planning"], agentTypes: ["Patient Flow Agent", "Bed Management Agent", "Care Coordinator Agent"] },
  "Pharmaceutical": { skills: ["Drug Interaction Checking", "Formulary Management", "Dosage Verification", "Reconciliation"], agentTypes: ["Pharmacy Agent", "Medication Safety Agent", "Formulary Agent"] },
  "Diagnostic": { skills: ["Code Suggestion", "Result Interpretation", "Order Optimization", "Critical Value Alerting"], agentTypes: ["Coding Agent", "Lab Results Agent", "Radiology Agent"] },
  "Administrative": { skills: ["Documentation", "Billing", "Referral Processing", "Quality Reporting"], agentTypes: ["Billing Agent", "Documentation Agent", "Quality Agent"] },
  "Production Operations": { skills: ["Scheduling", "OEE Monitoring", "Recipe Control", "Waste Analysis"], agentTypes: ["Production Agent", "Scheduling Agent", "Process Control Agent"] },
  "Quality Management": { skills: ["Inspection Automation", "SPC Monitoring", "CAPA Tracking", "Standard Management"], agentTypes: ["Quality Agent", "SPC Agent", "CAPA Agent"] },
  "Maintenance": { skills: ["Failure Prediction", "Schedule Optimization", "Calibration Tracking", "Root Cause Analysis"], agentTypes: ["Predictive Maintenance Agent", "Calibration Agent", "Reliability Agent"] },
  "Inventory": { skills: ["Material Tracking", "BOM Validation", "Warehouse Optimization", "Lot Tracing"], agentTypes: ["Inventory Agent", "Warehouse Agent", "Material Agent"] },
  "Supply Chain": { skills: ["Demand Planning", "Supplier Evaluation", "Logistics Optimization", "Risk Monitoring"], agentTypes: ["Planning Agent", "Procurement Agent", "Logistics Agent"] },
  "Equipment": { skills: ["Asset Monitoring", "Sensor Analysis", "Energy Optimization", "Line Balancing"], agentTypes: ["Asset Agent", "IoT Agent", "Energy Agent"] },
  "Product Identification": { skills: ["GTIN Management", "Content Scoring", "Shelf Monitoring", "Assortment Analysis"], agentTypes: ["Product Data Agent", "Digital Shelf Agent", "Category Agent"] },
  "Customer Experience": { skills: ["Journey Analysis", "Personalization", "Loyalty Management", "Fraud Detection"], agentTypes: ["Personalization Agent", "Loyalty Agent", "Fraud Agent"] },
  "Pricing": { skills: ["Elasticity Modeling", "Competitive Monitoring", "Markdown Optimization", "Promotion Planning"], agentTypes: ["Pricing Agent", "Competitive Intel Agent", "Promotion Agent"] },
  "Fulfillment": { skills: ["Order Routing", "Pick Optimization", "Returns Processing", "Delivery Management"], agentTypes: ["Fulfillment Agent", "Returns Agent", "Last Mile Agent"] },
};

const relationshipTypeColors: Record<string, string> = {
  parent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  child: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  related: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  depends_on: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

export default function OntologyExplorer() {
  const { industry } = useIndustry();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  interface EnrichedConcept {
    enrichedDescription?: string;
    regulatoryRelevance?: string;
    agentUseCases?: string[];
    dataHandlingConsiderations?: string;
    relatedStandards?: string[];
    implementationGuidance?: string;
    riskFactors?: string[];
  }
  const [enrichedConcepts, setEnrichedConcepts] = useState<Record<string, EnrichedConcept>>({});
  const [appliedEnhancements, setAppliedEnhancements] = useState<Set<string>>(new Set());

  const ontology = industry && industry.id !== "custom" ? ONTOLOGY_MAP[industry.id] || null : null;

  const categories = useMemo(() => {
    if (!ontology) return {};
    const cats: Record<string, OntologyConcept[]> = {};
    for (const concept of ontology.concepts) {
      if (!cats[concept.category]) cats[concept.category] = [];
      cats[concept.category].push(concept);
    }
    return cats;
  }, [ontology]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    const result: Record<string, OntologyConcept[]> = {};
    for (const [cat, concepts] of Object.entries(categories)) {
      const filtered = concepts.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [categories, searchQuery]);

  const selectedConcept = useMemo(() => {
    if (!selectedConceptId || !ontology) return null;
    return ontology.concepts.find((c) => c.id === selectedConceptId) || null;
  }, [selectedConceptId, ontology]);

  const enhanceMutation = useMutation({
    mutationFn: async (concept: OntologyConcept) => {
      const res = await apiRequest("POST", "/api/ai/enhance-ontology-concept", {
        conceptId: concept.id,
        label: concept.label,
        category: concept.category,
        description: concept.description,
        industry: industry?.id,
        ontologyName: ontology?.name,
        properties: concept.properties,
        relationships: concept.relationships,
      });
      return res.json();
    },
    onSuccess: (data, concept) => {
      const enriched: EnrichedConcept = data.enriched || {};
      setEnrichedConcepts((prev) => ({ ...prev, [concept.id]: enriched }));
      toast({ title: "Concept enriched", description: `AI generated comprehensive enhancement for ${concept.label}` });
    },
    onError: (err: Error) => {
      toast({ title: "Enhancement failed", description: err.message, variant: "destructive" });
    },
  });

  const handleConceptClick = (conceptId: string) => {
    setSelectedConceptId(conceptId);
  };

  const handleRelationshipClick = (targetId: string) => {
    setSelectedConceptId(targetId);
  };

  const getConceptLabel = (id: string): string => {
    if (!ontology) return id;
    const c = ontology.concepts.find((concept) => concept.id === id);
    return c ? c.label : id;
  };

  if (!industry || industry.id === "custom") {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="ontology-no-industry">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold" data-testid="text-no-industry-title">No Industry Ontology Selected</h2>
            <p className="text-sm text-muted-foreground">
              Select an industry workspace using the workspace selector to explore its domain ontology and knowledge graph.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ontology) {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="ontology-unavailable">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <Network className="w-12 h-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Ontology Unavailable</h2>
            <p className="text-sm text-muted-foreground">
              No ontology data is available for the selected industry.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalConcepts = ontology.concepts.length;
  const categoryNames = Object.keys(filteredCategories);

  return (
    <div className="flex h-full" data-testid="ontology-explorer">
      <div className="w-[300px] border-r flex flex-col shrink-0" data-testid="ontology-sidebar">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold truncate" data-testid="text-ontology-name">{ontology.name}</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search concepts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-concepts"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <Accordion type="multiple" defaultValue={Object.keys(categories)} className="space-y-1">
              {categoryNames.map((category) => {
                const concepts = filteredCategories[category];
                return (
                  <AccordionItem key={category} value={category} className="border-none">
                    <AccordionTrigger
                      className="py-2 px-2 text-xs font-medium rounded-md hover:no-underline"
                      data-testid={`accordion-category-${category.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="truncate">{category}</span>
                        <Badge variant="secondary" className="text-[10px]" data-testid={`badge-count-${category.toLowerCase().replace(/\s+/g, "-")}`}>
                          {concepts.length}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-0">
                      <div className="space-y-0.5 pl-1">
                        {concepts.map((concept) => (
                          <Tooltip key={concept.id}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleConceptClick(concept.id)}
                                className={`w-full text-left text-xs py-1.5 px-2 rounded-md transition-colors flex items-center gap-1.5 ${
                                  selectedConceptId === concept.id
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover-elevate"
                                }`}
                                data-testid={`button-concept-${concept.id}`}
                              >
                                <ChevronRight className="w-3 h-3 shrink-0" />
                                <span className="truncate">{concept.label}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[250px]">
                              <p className="text-xs">{concept.industryRelevance}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            {categoryNames.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-no-results">
                No concepts match your search.
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0" data-testid="ontology-main-content">
        <ScrollArea className="h-full">
          {!selectedConcept ? (
            <div className="flex items-center justify-center h-full min-h-[400px] p-8">
              <div className="text-center max-w-md space-y-4" data-testid="ontology-empty-state">
                <Network className="w-16 h-16 text-muted-foreground mx-auto" />
                <h2 className="text-xl font-semibold" data-testid="text-ontology-title">{ontology.name}</h2>
                <p className="text-sm text-muted-foreground">{ontology.description}</p>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <div className="text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-concepts">{totalConcepts}</div>
                    <div className="text-xs text-muted-foreground">Total Concepts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-categories">{Object.keys(categories).length}</div>
                    <div className="text-xs text-muted-foreground">Categories</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select a concept from the sidebar to explore its properties, relationships, and agent mapping.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6 max-w-4xl">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-semibold" data-testid="text-concept-label">{selectedConcept.label}</h1>
                  <Badge variant="secondary" data-testid="badge-concept-category">{selectedConcept.category}</Badge>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-concept-description">
                  {appliedEnhancements.has(selectedConcept.id) && enrichedConcepts[selectedConcept.id]?.enrichedDescription
                    ? enrichedConcepts[selectedConcept.id].enrichedDescription
                    : selectedConcept.description}
                </p>
                {appliedEnhancements.has(selectedConcept.id) && enrichedConcepts[selectedConcept.id]?.enrichedDescription && (
                  <Badge variant="secondary" className="text-[10px] mt-1" data-testid="badge-ai-enhanced">
                    <Sparkles className="w-2.5 h-2.5 mr-1" /> AI Enhanced
                  </Badge>
                )}
              </div>

              <Card data-testid="card-properties">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GitBranch className="w-4 h-4" />
                    Properties
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedConcept.properties.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No properties defined.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedConcept.properties.map((prop) => (
                        <div
                          key={prop.name}
                          className="flex items-start gap-3 text-xs py-1.5 border-b last:border-0"
                          data-testid={`property-${prop.name}`}
                        >
                          <code className="font-mono text-primary shrink-0 min-w-[120px]">{prop.name}</code>
                          <Badge variant="outline" className="text-[10px] shrink-0">{prop.type}</Badge>
                          <span className="text-muted-foreground">{prop.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-relationships">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Relationships
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedConcept.relationships.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No relationships defined.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedConcept.relationships.map((rel, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleRelationshipClick(rel.targetId)}
                          className="text-left p-3 rounded-md border hover-elevate transition-colors"
                          data-testid={`button-relationship-${rel.targetId}`}
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className={`text-[10px] ${relationshipTypeColors[rel.type] || ""}`}>
                              {rel.type.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="text-xs font-medium">{getConceptLabel(rel.targetId)}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{rel.label}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-tags">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {selectedConcept.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-tag-${tag}`}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-agent-mapping">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Agent Mapping
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {AGENT_MAPPING[selectedConcept.category] ? (
                    <>
                      <div>
                        <div className="text-xs font-medium mb-1.5">Relevant Agent Skills</div>
                        <div className="flex flex-wrap gap-1.5">
                          {AGENT_MAPPING[selectedConcept.category].skills.map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-[10px]" data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-")}`}>
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-1.5">Applicable Agent Types</div>
                        <div className="flex flex-wrap gap-1.5">
                          {AGENT_MAPPING[selectedConcept.category].agentTypes.map((agentType) => (
                            <Badge key={agentType} variant="outline" className="text-[10px]" data-testid={`badge-agent-${agentType.toLowerCase().replace(/\s+/g, "-")}`}>
                              {agentType}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No agent mapping available for this category.</p>
                  )}
                </CardContent>
              </Card>

              <PermissionGate action="create_modify_policies">
                <Card data-testid="card-ai-enhance">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      AI Enhancement
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        onClick={() => enhanceMutation.mutate(selectedConcept)}
                        disabled={enhanceMutation.isPending}
                        data-testid="button-ai-enhance"
                      >
                        {enhanceMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4 mr-2" />
                        )}
                        AI Enhance Concept
                      </Button>
                      {appliedEnhancements.has(selectedConcept.id) && (
                        <Badge variant="secondary" className="text-[10px]" data-testid="badge-enhancement-applied">
                          <Check className="w-3 h-3 mr-1" />
                          Applied
                        </Badge>
                      )}
                    </div>

                    {enrichedConcepts[selectedConcept.id] && (
                      <div className="space-y-3" data-testid="enrichment-results">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs font-medium flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            AI Enrichment Results
                          </div>
                          <div className="flex items-center gap-1.5">
                            {!appliedEnhancements.has(selectedConcept.id) && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setAppliedEnhancements((prev) => { const next = new Set(Array.from(prev)); next.add(selectedConcept.id); return next; });
                                  toast({ title: "Enhancement applied", description: `Enrichment saved for ${selectedConcept.label}` });
                                }}
                                data-testid="button-apply-enhancement"
                              >
                                <Check className="w-3.5 h-3.5 mr-1.5" />
                                Apply Enhancement
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEnrichedConcepts((prev) => {
                                  const next = { ...prev };
                                  delete next[selectedConcept.id];
                                  return next;
                                });
                                setAppliedEnhancements((prev) => {
                                  const next = new Set(prev);
                                  next.delete(selectedConcept.id);
                                  return next;
                                });
                              }}
                              data-testid="button-dismiss-enhancement"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {enrichedConcepts[selectedConcept.id].enrichedDescription && (
                          <Card className="bg-muted/50" data-testid="card-enriched-description">
                            <CardContent className="pt-4">
                              <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                <BookOpen className="w-3 h-3" />
                                Enhanced Description
                              </div>
                              <p className="text-sm text-muted-foreground" data-testid="text-enriched-description">
                                {enrichedConcepts[selectedConcept.id].enrichedDescription}
                              </p>
                            </CardContent>
                          </Card>
                        )}

                        {enrichedConcepts[selectedConcept.id].agentUseCases && enrichedConcepts[selectedConcept.id].agentUseCases!.length > 0 && (
                          <Card className="bg-muted/50" data-testid="card-agent-use-cases">
                            <CardContent className="pt-4">
                              <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                <Brain className="w-3 h-3" />
                                Agent Use Cases
                              </div>
                              <ul className="space-y-1.5">
                                {enrichedConcepts[selectedConcept.id].agentUseCases!.map((uc, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2" data-testid={`text-use-case-${i}`}>
                                    <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500" />
                                    <span>{uc}</span>
                                  </li>
                                ))}
                              </ul>
                            </CardContent>
                          </Card>
                        )}

                        {enrichedConcepts[selectedConcept.id].regulatoryRelevance && (
                          <Card className="bg-muted/50" data-testid="card-regulatory-relevance">
                            <CardContent className="pt-4">
                              <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                <Shield className="w-3 h-3" />
                                Regulatory Relevance
                              </div>
                              <p className="text-xs text-muted-foreground" data-testid="text-regulatory-relevance">
                                {enrichedConcepts[selectedConcept.id].regulatoryRelevance}
                              </p>
                            </CardContent>
                          </Card>
                        )}

                        {enrichedConcepts[selectedConcept.id].riskFactors && enrichedConcepts[selectedConcept.id].riskFactors!.length > 0 && (
                          <Card className="bg-muted/50" data-testid="card-risk-factors">
                            <CardContent className="pt-4">
                              <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                <AlertTriangle className="w-3 h-3" />
                                Risk Factors
                              </div>
                              <ul className="space-y-1">
                                {enrichedConcepts[selectedConcept.id].riskFactors!.map((rf, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2" data-testid={`text-risk-factor-${i}`}>
                                    <span className="text-destructive mt-0.5 shrink-0">-</span>
                                    <span>{rf}</span>
                                  </li>
                                ))}
                              </ul>
                            </CardContent>
                          </Card>
                        )}

                        {enrichedConcepts[selectedConcept.id].relatedStandards && enrichedConcepts[selectedConcept.id].relatedStandards!.length > 0 && (
                          <Card className="bg-muted/50" data-testid="card-related-standards">
                            <CardContent className="pt-4">
                              <div className="text-xs font-semibold mb-1.5">Related Standards</div>
                              <div className="flex flex-wrap gap-1.5">
                                {enrichedConcepts[selectedConcept.id].relatedStandards!.map((std, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px]" data-testid={`badge-standard-${i}`}>
                                    {std}
                                  </Badge>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {enrichedConcepts[selectedConcept.id].dataHandlingConsiderations && (
                          <Card className="bg-muted/50" data-testid="card-data-handling">
                            <CardContent className="pt-4">
                              <div className="text-xs font-semibold mb-1.5">Data Handling Considerations</div>
                              <p className="text-xs text-muted-foreground" data-testid="text-data-handling">
                                {enrichedConcepts[selectedConcept.id].dataHandlingConsiderations}
                              </p>
                            </CardContent>
                          </Card>
                        )}

                        {enrichedConcepts[selectedConcept.id].implementationGuidance && (
                          <Card className="bg-muted/50" data-testid="card-implementation-guidance">
                            <CardContent className="pt-4">
                              <div className="text-xs font-semibold mb-1.5">Implementation Guidance</div>
                              <p className="text-xs text-muted-foreground" data-testid="text-implementation-guidance">
                                {enrichedConcepts[selectedConcept.id].implementationGuidance}
                              </p>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </PermissionGate>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
