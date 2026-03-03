# Nous Agent Orchestrator - End-to-End Use Case Test Scenarios

**Version:** 2.0
**Last Updated:** March 3, 2026

---

## Table of Contents

1. [Test Strategy Overview](#1-test-strategy-overview)
2. [Scenario 1: Healthcare — Patient Care Coordination](#2-scenario-1-healthcare--patient-care-coordination)
3. [Scenario 2: Financial Services — Fraud Detection & Prevention](#3-scenario-2-financial-services--fraud-detection--prevention)
4. [Scenario 3: Insurance — Claims Processing Automation](#4-scenario-3-insurance--claims-processing-automation)
5. [Scenario 4: Manufacturing — Predictive Maintenance](#5-scenario-4-manufacturing--predictive-maintenance)
6. [Scenario 5: Retail — Dynamic Inventory & Demand Forecasting](#6-scenario-5-retail--dynamic-inventory--demand-forecasting)
7. [Scenario 6: Technology/SaaS — Intelligent Incident Response](#7-scenario-6-technologysaas--intelligent-incident-response)
8. [Scenario 7: Financial Services — Client Onboarding (Multi-Agent Team)](#8-scenario-7-financial-services--client-onboarding-multi-agent-team)
9. [Scenario 8: Healthcare — Clinical Trial Safety Monitoring](#9-scenario-8-healthcare--clinical-trial-safety-monitoring)
10. [Scenario 9: Insurance — Underwriting Risk Assessment](#10-scenario-9-insurance--underwriting-risk-assessment)
11. [Scenario 10: Manufacturing — Quality Assurance Defect Detection](#11-scenario-10-manufacturing--quality-assurance-defect-detection)
12. [Scenario 11: Retail — Personalized Customer Experience](#12-scenario-11-retail--personalized-customer-experience)
13. [Scenario 12: Cross-Industry — Regulatory Compliance Automation](#13-scenario-12-cross-industry--regulatory-compliance-automation)
14. [Scenario 13: Multi-Agent Orchestration — Supply Chain Disruption Response](#14-scenario-13-multi-agent-orchestration--supply-chain-disruption-response)
15. [Scenario 14: Financial Services — Portfolio Risk Management](#15-scenario-14-financial-services--portfolio-risk-management)
16. [Scenario 15: Healthcare — Medical Inquiry Response](#16-scenario-15-healthcare--medical-inquiry-response)
17. [Appendix A: Scenario-to-Platform Capability Matrix](#appendix-a-scenario-to-platform-capability-matrix)
18. [Appendix B: Test Execution Order](#appendix-b-test-execution-order)

---

## 1. Test Strategy Overview

### Philosophy: Use Case First, Platform Second

These test scenarios are designed around **real business outcomes and use cases**, not platform modules. Each scenario tells the story of a specific business problem being solved by one or more AI agents across their full lifecycle:

1. **Define the business problem** — What outcome does the business need?
2. **Build the agent(s)** — What agent or team solves this problem?
3. **Ensure compliance** — What regulations and policies apply?
4. **Prove quality** — Does the agent actually work for this use case?
5. **Deploy safely** — How do we release this without risk?
6. **Monitor in production** — Is the agent delivering the promised outcome?
7. **Improve continuously** — What happens when the agent drifts or the business evolves?

Platform intelligence (AI generation, proactive governance, drift detection, self-healing) emerges naturally as the user moves through these stages — it's not tested in isolation, but validated in context.

### Priority Levels

| Priority | Description |
|---|---|
| P0 | Must work for any demo or customer engagement |
| P1 | Expected for complete lifecycle demonstration |
| P2 | Demonstrates advanced platform differentiation |

### How to Read Each Scenario

Each scenario is structured as a **complete story arc** with sequential steps. Steps are grouped by lifecycle phase but flow continuously — the output of one phase feeds the next. Platform capabilities that surface during each step are noted in **[Platform Intelligence]** callouts.

---

## 2. Scenario 1: Healthcare — Patient Care Coordination

**Business Problem:** A regional hospital network needs to reduce patient wait times in emergency departments by 35% and improve care handoff accuracy between shifts. Currently, nurse coordinators spend 40% of their time on manual triage documentation and handoff preparation.

**Target Outcome:** Deploy an AI agent that autonomously handles patient triage documentation, generates shift-handoff summaries, and flags high-acuity patients requiring immediate physician attention.

**Industry:** Healthcare
**Risk Tier:** CRITICAL
**Compliance Frameworks:** HIPAA, HL7 FHIR, Joint Commission Standards

---

### Phase 1: Define the Outcome

**Step 1.1 — Create the Outcome Contract**
- Navigate to Outcomes (/outcomes) and click "New Outcome"
- Enter:
  - Name: "Emergency Department Care Coordination"
  - Description: "Autonomously triage incoming ED patients, generate real-time shift handoff summaries, and escalate high-acuity cases to attending physicians within 90 seconds"
  - Risk Tier: CRITICAL
  - Industry: Healthcare
  - Pricing Model: PER_OUTCOME_EVENT
  - Price per unit: $4.50
- Create the outcome
- **Expected:** Outcome created with CRITICAL risk tier badge, industry tag "Healthcare"

**Step 1.2 — Define KPIs**
- On the outcome detail page, add KPIs:
  - KPI 1: "Triage Documentation Time" — Target: < 3 minutes, Threshold: 5 minutes, Unit: seconds
  - KPI 2: "Handoff Accuracy Score" — Target: > 95%, Threshold: 90%, Unit: percentage
  - KPI 3: "High-Acuity Escalation Time" — Target: < 90 seconds, Threshold: 120 seconds, Unit: seconds
  - KPI 4: "Patient Wait Time Reduction" — Target: 35%, Threshold: 25%, Unit: percentage
- **Expected:** All 4 KPIs created and visible on outcome detail page with target vs. threshold visualization

**[Platform Intelligence]:** The system should recognize the CRITICAL risk tier and Healthcare industry context, which will later influence deployment pipeline stages and policy requirements.

**Step 1.3 — Generate Agent Development Plan**
- On the outcome detail page, click "Generate Agent Plan" (AI-assisted)
- Review the generated plan which should propose:
  - Agent capabilities needed (NLP for triage, summarization for handoffs, classification for acuity)
  - Recommended MCP tools (EHR integration, notification service)
  - Suggested compliance requirements (HIPAA data handling, PHI redaction)
  - Estimated resource requirements
- Accept or refine the plan
- **Expected:** AI generates a structured development plan linked to the outcome's KPIs

---

### Phase 2: Build the Agent

**Step 2.1 — Create Agent from Outcome**
- From the outcome detail page, click "Create Agent from Outcome" (or navigate to Agent Wizard)
- The wizard should auto-populate:
  - Agent name derived from the outcome
  - Industry: Healthcare (inherited)
  - Risk tier: CRITICAL (inherited)
  - KPI targets linked from the outcome
- Configure:
  - Model: GPT-4o
  - Task Instructions: "You are a Patient Care Coordinator for [Hospital Network]. Your primary responsibilities are: 1) Process incoming ED patient data and generate triage documentation following ESI (Emergency Severity Index) guidelines. 2) Generate shift-handoff summaries every 8 hours. 3) Flag patients with ESI Level 1 or 2 for immediate physician notification."
- **Expected:** Agent created with outcome linkage visible, industry presets auto-applied

**[Platform Intelligence]:** Healthcare industry presets should auto-configure HIPAA-relevant settings, suggest PHI-aware redaction profiles, and recommend healthcare-specific MCP tools.

**Step 2.2 — Configure Knowledge Base**
- Navigate to Knowledge Bases (/knowledge-bases), create a new KB:
  - Name: "ED Triage Protocols"
  - Description: "Emergency Severity Index guidelines, hospital-specific triage procedures, and handoff templates"
  - Industry: Healthcare
- Upload documents (triage protocols, handoff templates)
- Link the KB to the agent
- **Expected:** KB created, documents processed and embedded, linked to agent

**[Platform Intelligence]:** KB sensitivity scan should automatically detect PHI-related content and flag it, recommending appropriate data handling policies.

**Step 2.3 — Create Agent Blueprint**
- Navigate to Blueprints (/blueprints), create a new blueprint for the agent:
  - Name: "ED Care Coordination Blueprint v1"
  - Define workflow steps:
    - Step 1: Receive patient intake data
    - Step 2: Run ESI classification
    - Step 3: Generate triage documentation
    - Step 4: Check for high-acuity flags
    - Step 5: If high-acuity → escalate to physician
    - Step 6: Update shift handoff summary
- Compile and sign the blueprint
- **Expected:** Blueprint compiled without errors, signed, linked to agent

**Step 2.4 — Configure MCP Tool Integrations**
- Navigate to MCP Servers (/integrations/mcp-servers) and link relevant tools:
  - EHR System connector (for patient data)
  - Notification service (for physician escalations)
  - Scheduling system (for shift data)
- Verify tool-policy compatibility checks pass
- **Expected:** Tools linked, policy compatibility confirmed

**[Platform Intelligence]:** MCP tool-policy checks should verify that linked tools are compatible with HIPAA requirements. If a non-compliant tool is linked, the platform should warn before allowing the link.

---

### Phase 3: Govern the Agent

**Step 3.1 — Create and Bind Healthcare Policies**
- Navigate to Governance (/governance), create policies:
  - Policy 1: "HIPAA PHI Handling" — Type: DATA_PRIVACY
    - Rules: No PHI in logs, PHI must be encrypted at rest, minimum necessary access
  - Policy 2: "Clinical Decision Support Safety" — Type: SAFETY
    - Rules: Agent must not make diagnosis recommendations, must defer to physician for ESI 1-2
  - Policy 3: "ED Response Time SLA" — Type: SLA
    - Rules: Triage documentation within 5 minutes, escalation within 120 seconds
- Bind all 3 policies to the agent
- **Expected:** Policies created, bound to agent, visible in agent's governance tab

**[Platform Intelligence]:** When binding policies to a CRITICAL-tier healthcare agent, the platform should proactively check for policy gaps — e.g., if no data privacy policy is bound, it should surface a warning in the compliance posture dashboard.

**Step 3.2 — Verify Compliance Posture**
- Navigate to the Compliance Posture dashboard (Governance page)
- Check the agent's compliance posture:
  - HIPAA framework coverage should show > 0% (based on bound policies)
  - Any missing control areas should be flagged
- **Expected:** Compliance posture dashboard shows per-framework coverage with the agent mapped to relevant controls

**Step 3.3 — Submit for Approval**
- From the agent detail page, submit the agent for review/approval
- Switch to the Compliance/Security role
- Navigate to Approvals (/approvals), find the pending approval
- Review the evidence package (policies bound, blueprint signed, KB linked)
- Approve the agent
- **Expected:** Approval workflow completes, audit trail records the approval with reviewer, timestamp, and evidence

---

### Phase 4: Evaluate the Agent

**Step 4.1 — Create Evaluation Suite**
- Navigate to Evals (/evals), create a new eval suite:
  - Name: "ED Care Coordination Eval v1"
  - Link to the agent
  - Link to the outcome (KPI-aligned evaluation)
- **Expected:** Eval suite created, linked to both agent and outcome

**Step 4.2 — Build Test Cases (Including AI Generation)**
- Add test cases manually:
  - Test Case 1: "Standard Triage — Chest Pain" — Input: Patient presents with chest pain, age 55, history of hypertension. Expected: ESI Level 2, immediate physician escalation
  - Test Case 2: "Low-Acuity — Sprained Ankle" — Input: Patient presents with ankle injury, ambulatory, no distress. Expected: ESI Level 4, standard documentation, no escalation
  - Test Case 3: "Shift Handoff Summary" — Input: End of 8-hour shift with 15 patients seen. Expected: Complete handoff summary with all patient statuses
- Use "AI Generate Test Cases" to create additional scenarios:
  - Select count: 10
  - Review generated cases — they should be healthcare-relevant with varying acuity levels
- **Expected:** Manual + AI-generated test cases in the suite, covering edge cases and typical scenarios

**[Platform Intelligence]:** AI-generated test cases should be contextually relevant to the healthcare/ED triage domain, not generic. They should include industry-specific scenarios (pediatric patients, multi-symptom presentations, psychiatric emergencies).

**Step 4.3 — Create Golden Dataset**
- Navigate to Golden Datasets (/golden-datasets), create:
  - Name: "ED Triage Ground Truth"
  - Link to the eval suite
  - Add verified ground-truth entries for critical scenarios
- Use "AI Enhance" on test case drafts to auto-populate evaluation criteria, rubric scoring, and tags
- **Expected:** Golden dataset created with AI-enhanced test cases, rubric scoring defined

**Step 4.4 — Run Evaluation**
- From the eval suite, click "Run Evaluation"
- Wait for results
- Review:
  - Overall pass rate
  - Per-test-case results with agent responses
  - KPI alignment scores (how well does the agent meet the outcome's KPIs?)
  - Any failed cases — particularly high-acuity escalation timing
- **Expected:** Eval run completes, results show per-case pass/fail, aggregate scores, and KPI alignment

**Step 4.5 — Run a Second Evaluation (Regression Detection)**
- Make a minor change to the agent (update task instructions slightly)
- Run the eval suite again
- Compare Run 2 vs Run 1:
  - Check for regression detection — did any previously passing tests now fail?
  - Compare aggregate scores
- **Expected:** Regression comparison shows delta between runs, highlights any degraded cases

---

### Phase 5: Deploy the Agent

**Step 5.1 — Initiate Deployment**
- Navigate to Deployments (/deployments), click "New Deployment"
- Select the agent and target environment
- **Expected:** Deployment wizard shows healthcare-specific pipeline stages (should include stages like "Clinical Validation", "HIPAA Compliance Gate", "Pilot Ward")

**[Platform Intelligence]:** The deployment pipeline should be industry-aware. A Healthcare CRITICAL agent should have more stages and stricter gates than a Retail LOW agent.

**Step 5.2 — Progress Through Pipeline Stages**
- Advance through deployment stages:
  - Stage 1: Development → Staging (automatic if eval passed)
  - Stage 2: Staging → Clinical Validation (requires evidence package)
  - Stage 3: Clinical Validation → Pilot Ward (requires compliance sign-off)
  - Stage 4: Pilot Ward → Production (requires final approval)
- At each stage, verify:
  - Stage advancement criteria are checked
  - Evidence package includes required artifacts (eval results, policy bindings, blueprint signature)
  - Auto-rollback triggers are configured
- **Expected:** Each stage shows required criteria, evidence is attached, advancement is gated appropriately

**Step 5.3 — Verify Auto-Rollback Configuration**
- On the deployment, verify auto-rollback rules:
  - If high-acuity escalation time exceeds 120s → auto-rollback
  - If error rate exceeds 5% → auto-rollback
- **Expected:** Rollback rules configured and visible in deployment detail

---

### Phase 6: Monitor in Production

**Step 6.1 — Check Agent Health**
- Navigate to Monitor (/monitor)
- Find the deployed agent's health dashboard:
  - Health score should be visible (e.g., 85/100)
  - KPI metrics should show real-time values vs. targets
  - Execution traces should be available
- **Expected:** Agent appears in monitoring with health score, KPI tracking, and trace history

**Step 6.2 — Inspect Execution Traces**
- Click on a specific execution trace
- Verify:
  - Full trace shows input → processing → output
  - PHI redaction is applied in trace viewing (based on role/redaction level)
  - Tool calls to MCP servers are logged
  - Latency breakdown is visible
- **Expected:** Trace detail shows complete execution path with appropriate redaction

**[Platform Intelligence]:** Trace viewing should automatically apply redaction based on the viewer's role. An admin sees more than a finance user. PHI fields should be masked for non-clinical roles.

**Step 6.3 — KPI Drift Detection**
- Over time (or simulated), the agent's KPI metrics drift:
  - Triage documentation time increases from 2.5 minutes to 4.8 minutes
  - Handoff accuracy drops from 96% to 91%
- Verify:
  - KPI drift alerts appear in the monitoring dashboard
  - Kill-chain alerts correlate drift signals with outcome SLA thresholds
  - The system flags that the outcome's 35% wait-time reduction target is at risk
- **Expected:** Drift detection triggers alerts, correlates with outcome KPIs, and flags risk

**Step 6.4 — Review in Oversight Console**
- Navigate to Oversight Console (/oversight-console)
- Verify:
  - The agent's autonomy level is visible
  - Risk dimensions are displayed (data sensitivity, decision impact, regulatory exposure)
  - Expert intervention thresholds are set appropriately for a CRITICAL healthcare agent
- **Expected:** Oversight console shows the agent with appropriate autonomy calibration

---

### Phase 7: Heal and Improve

**Step 7.1 — Trigger Self-Healing Pipeline**
- With KPI drift detected, initiate the healing pipeline:
  - Navigate to Healing Operations (/healing-operations)
  - The system should have auto-detected the drift and proposed a diagnosis
- Review the root cause classification:
  - Is it a KB staleness issue? (triage protocols updated but KB not refreshed)
  - Is it a model degradation? (prompt drift)
  - Is it an MCP tool issue? (EHR API latency increased)
- **Expected:** Root cause engine classifies the drift and proposes remediation

**[Platform Intelligence]:** The platform should automatically classify the drift into structured categories (KB staleness, model drift, tool degradation) and propose specific fixes.

**Step 7.2 — Apply Remediation**
- Accept the proposed remediation (e.g., refresh KB with updated triage protocols)
- The system should:
  - Update the knowledge base
  - Trigger a shadow replay to validate the fix
  - Block deployment of the fix until shadow replay passes
- **Expected:** Remediation applied, shadow replay validates, fix deployed

**Step 7.3 — Verify Continuous Improvement Loop**
- Navigate to Improvement Loop (/improvement-loop)
- Verify:
  - The drift → diagnosis → fix → validation cycle is tracked
  - Production feedback (rejected escalations, missed high-acuity cases) feeds back into eval suites
  - The agent's health score improves post-remediation
- **Expected:** Complete improvement cycle visible with before/after metrics

---

### Full Scenario Validation Checklist

| Checkpoint | Status |
|---|---|
| Outcome created with 4 KPIs | |
| Agent created from outcome with industry presets | |
| KB created, scanned for sensitivity, linked | |
| Blueprint created, compiled, signed | |
| MCP tools linked with policy compatibility check | |
| 3 policies created and bound | |
| Compliance posture shows coverage | |
| Approval workflow completed with evidence | |
| Eval suite with manual + AI-generated test cases | |
| Golden dataset with AI-enhanced entries | |
| Eval run completed with KPI alignment | |
| Regression detection between runs | |
| Healthcare deployment pipeline with proper stages | |
| Auto-rollback rules configured | |
| Agent health monitored with KPI tracking | |
| Traces show PHI redaction by role | |
| KPI drift detected and alerted | |
| Self-healing diagnosed and remediated | |
| Improvement loop completed | |

---

## 3. Scenario 2: Financial Services — Fraud Detection & Prevention

**Business Problem:** A mid-tier bank processes 2M transactions daily and currently catches only 72% of fraudulent transactions, with a 12% false positive rate that creates customer friction. The bank needs to improve detection to 95%+ while reducing false positives below 3%.

**Target Outcome:** Deploy a real-time fraud detection agent that monitors payment streams, scores transactions for fraud risk, and either blocks or flags suspicious activity — all within 500ms per transaction.

**Industry:** Financial Services
**Risk Tier:** HIGH
**Compliance Frameworks:** PCI-DSS, SOX, Basel III, BSA/AML

---

### Phase 1: Define the Outcome

**Step 1.1 — Create the Outcome Contract**
- Navigate to Outcomes, create:
  - Name: "Real-Time Fraud Detection Pipeline"
  - Description: "Monitor all payment transactions in real-time, score for fraud risk using behavioral analysis and pattern matching, and autonomously block high-confidence fraud while flagging borderline cases for human review"
  - Risk Tier: HIGH
  - Industry: Financial Services
  - Pricing Model: PER_OUTCOME_EVENT
  - Price per unit: $0.15 (per transaction screened)
- **Expected:** Outcome created with HIGH risk tier

**Step 1.2 — Define KPIs**
- Add KPIs:
  - "Fraud Detection Rate" — Target: > 95%, Threshold: 90%
  - "False Positive Rate" — Target: < 3%, Threshold: 5%
  - "Transaction Scoring Latency" — Target: < 500ms, Threshold: 1000ms
  - "Autonomous Block Accuracy" — Target: > 99%, Threshold: 97%
  - "Daily Transaction Coverage" — Target: 2,000,000, Threshold: 1,800,000
- **Expected:** 5 KPIs created with clear targets and thresholds

---

### Phase 2: Build the Agent

**Step 2.1 — Create Agent Using Financial Services Template**
- Navigate to Agent Wizard (/agents/wizard)
- Choose "Use Template" and select "Fraud Detection Agent" template
- The template should auto-configure:
  - Industry: Financial Services
  - Model configuration
  - Suggested MCP tools (payment gateway, sanctions database, behavioral analytics)
  - Compliance annotations (PCI-DSS, SOX)
- Customize the task instructions for the specific bank's transaction patterns
- Link to the outcome created in Step 1.1
- **Expected:** Agent created from template with financial services presets, linked to outcome

**[Platform Intelligence]:** Template auto-configures industry-specific settings. The wizard should show which compliance frameworks are recommended for this agent type.

**Step 2.2 — Configure Knowledge Base for Fraud Patterns**
- Create KB: "Fraud Pattern Library"
  - Upload: Historical fraud patterns, known attack vectors, sanctions lists
  - Industry: Financial Services
- Link to agent
- **Expected:** KB created with financial services sensitivity classifications applied

**[Platform Intelligence]:** KB sensitivity scan should detect financial PII (account numbers, SSNs) and recommend PCI-DSS-compliant handling.

**Step 2.3 — Set Up Context Engineering**
- Navigate to Context Studio (/context-studio)
- Configure context priorities for the fraud agent:
  - High priority: Transaction data, customer behavioral history, sanctions list matches
  - Medium priority: Historical fraud patterns, merchant risk scores
  - Low priority: General banking context
  - Set token budget: 4,000 tokens per inference
- **Expected:** Context priority matrix configured with budget constraints

**Step 2.4 — Create and Compile Blueprint**
- Create blueprint: "Fraud Detection Pipeline v1"
  - Step 1: Ingest transaction data
  - Step 2: Run behavioral analysis against customer profile
  - Step 3: Check sanctions/watchlists
  - Step 4: Score transaction risk (0-100)
  - Step 5: If score > 90 → auto-block and notify
  - Step 6: If score 70-90 → flag for human review
  - Step 7: Log decision with full audit trail
- Compile and sign
- **Expected:** Blueprint compiled, signed, all steps mapped to MCP tools

---

### Phase 3: Govern the Agent

**Step 3.1 — Create Financial Services Policies**
- Create policies:
  - "PCI-DSS Data Handling" — Type: DATA_PRIVACY
    - No storage of full card numbers, CVV must never be logged
  - "Transaction Blocking Authority" — Type: OPERATIONAL
    - Agent can block transactions up to $10,000 autonomously; above $10,000 requires human approval
  - "AML Reporting Obligation" — Type: REGULATORY
    - Suspicious Activity Reports (SARs) must be filed for patterns matching BSA thresholds
  - "Fair Lending Compliance" — Type: BIAS
    - Fraud scoring must not disproportionately affect protected classes
- Bind all to the fraud detection agent
- **Expected:** 4 policies bound, covering data, operations, regulatory, and bias dimensions

**Step 3.2 — Verify Design-Time Policy Gates**
- Attempt to proceed to deployment without the AML policy bound
- **Expected:** Platform blocks advancement and surfaces a policy prerequisite warning

**[Platform Intelligence]:** Proactive governance gates should prevent deployment of a HIGH-risk financial services agent without required regulatory policies.

**Step 3.3 — Run Policy Engine Analysis**
- Navigate to Policy Engine (/governance/policy-engine)
- Analyze the agent against all bound policies
- Verify each policy shows compliance status
- **Expected:** Policy engine shows pass/fail for each policy rule against the agent configuration

---

### Phase 4: Evaluate the Agent

**Step 4.1 — Create Eval Suite with Financial Scenarios**
- Create eval suite: "Fraud Detection Eval v1"
- Add test cases covering:
  - Legitimate large transaction (should NOT be blocked)
  - Known fraud pattern (card-not-present with velocity spike)
  - Sanctions list match (should block + file SAR)
  - Edge case: Customer's first international transaction (behavioral anomaly but legitimate)
  - Bias test: Ensure scoring parity across demographic segments
- AI-generate additional test cases (25 count) specific to financial fraud patterns
- **Expected:** Test suite with 30+ cases covering happy path, edge cases, compliance scenarios, and bias testing

**Step 4.2 — Run Evaluation and Review**
- Run the eval suite
- Review results focusing on:
  - Detection rate vs. 95% target
  - False positive rate vs. 3% target
  - Latency per scoring decision
  - Any bias indicators in scoring distributions
- **Expected:** Eval results show per-KPI alignment with detailed case-by-case analysis

**Step 4.3 — Create Golden Dataset from Production Feedback**
- Create golden dataset: "Confirmed Fraud Cases Q1 2026"
- Import ground truth from historical confirmed fraud cases
- Use these as regression benchmarks for future eval runs
- **Expected:** Golden dataset established as baseline for ongoing quality validation

---

### Phase 5: Deploy the Agent

**Step 5.1 — Deploy with Financial Services Pipeline**
- Initiate deployment
- Verify financial-services-specific pipeline stages:
  - Development → Staging
  - Staging → Compliance Review (PCI-DSS attestation required)
  - Compliance Review → Shadow Mode (runs alongside current system, no blocking)
  - Shadow Mode → Canary (1% of traffic, real blocking)
  - Canary → Production (full traffic)
- **Expected:** Pipeline includes financial-specific stages with appropriate evidence requirements

**Step 5.2 — Shadow Replay Validation**
- In Shadow Mode, replay 10,000 historical transactions through the agent
- Compare agent decisions against known outcomes
- Verify detection rate meets threshold before advancing to Canary
- **Expected:** Shadow replay completes, results justify advancement

**Step 5.3 — Canary Deployment with Traffic Graduation**
- Start canary at 1% of transaction traffic
- Monitor for 24 hours (simulated)
- Verify metrics: detection rate, false positive rate, latency
- Graduate to 5%, then 25%, then 100%
- **Expected:** Canary metrics tracked at each graduation level

---

### Phase 6: Monitor in Production

**Step 6.1 — Real-Time Transaction Monitoring**
- On Monitor dashboard, verify:
  - Transaction throughput (targeting 2M/day)
  - Real-time fraud score distribution
  - Block/flag/pass ratios
  - Latency p50, p95, p99
- **Expected:** Monitoring dashboard shows real-time operational metrics

**Step 6.2 — Cost Attribution**
- Navigate to Billing (/billing)
- Verify cost-to-serve per transaction:
  - LLM token costs per scoring decision
  - MCP tool call costs (sanctions DB lookups, behavioral analytics API)
  - Infrastructure overhead
- Compare against the $0.15/event pricing
- **Expected:** Cost breakdown shows profitability per outcome event

**Step 6.3 — Audit Trail Integrity**
- Navigate to Audit Trail (/audit-trail)
- Verify:
  - Every fraud block decision has a complete audit entry
  - Hash-chain integrity verification passes
  - Entries include: who (agent), what (block/flag), why (risk score + factors), when (timestamp)
- **Expected:** Immutable audit log with verifiable integrity for regulatory evidence

---

### Phase 7: Heal and Improve

**Step 7.1 — Detect Emerging Fraud Pattern**
- New fraud pattern emerges that the agent doesn't catch (detection rate drops to 88%)
- KPI drift detection triggers alerts
- Kill-chain alert correlates with the outcome's 95% detection rate target
- **Expected:** Platform proactively alerts about the coverage gap

**Step 7.2 — Diagnose and Remediate**
- Healing pipeline diagnoses: KB staleness (new fraud pattern not in knowledge base)
- Remediation: Update KB with new pattern documentation
- Shadow replay validates the fix catches the new pattern
- **Expected:** Root cause identified, KB updated, validation confirms fix

**Step 7.3 — Production Feedback Loop**
- Confirmed fraud cases that were missed become ground truth test cases
- These auto-sync to the eval suite
- Next eval run includes these as regression tests
- **Expected:** Continuous improvement flywheel operational

---

## 4. Scenario 3: Insurance — Claims Processing Automation

**Business Problem:** An insurance company receives 5,000 claims/day across auto, home, and health lines. Average claim processing takes 14 days with 23% of claims requiring rework due to missing information. The company wants to reduce processing time to 3 days and rework rate to under 5%.

**Target Outcome:** Deploy a multi-agent team that handles First Notice of Loss (FNOL) intake, coverage verification, damage assessment, and settlement estimation — escalating complex claims to human adjusters.

**Industry:** Insurance
**Risk Tier:** HIGH
**Compliance Frameworks:** State Insurance Regulations, NAIC Guidelines, Fair Claims Settlement Practices

---

### Phase 1: Define the Outcome

**Step 1.1 — Create Outcome Contract**
- Create: "Automated Claims Adjudication"
  - Description: "End-to-end claims processing from FNOL through settlement estimation for standard auto, home, and health claims under $50,000"
  - Risk Tier: HIGH
  - Industry: Insurance
  - Pricing Model: PER_OUTCOME_EVENT
  - Price per unit: $12.00 (per claim processed)
- KPIs:
  - "Average Processing Time" — Target: 3 days, Threshold: 5 days
  - "Rework Rate" — Target: < 5%, Threshold: 10%
  - "Straight-Through Processing Rate" — Target: > 60%, Threshold: 45%
  - "Settlement Accuracy" — Target: within 5% of adjuster estimate, Threshold: 10%
  - "Customer Satisfaction (Claims)" — Target: 4.2/5, Threshold: 3.8/5
- **Expected:** Outcome with 5 KPIs, HIGH risk tier, Insurance industry

---

### Phase 2: Build the Multi-Agent Team

**Step 2.1 — Create the Claims Team**
- Navigate to Agent Teams (/agents/teams)
- Use the "Claims Adjudication Team" template (or build from scratch):
  - **FNOL Intake Agent**: Receives claim, extracts key data, requests missing info
  - **Coverage Verification Agent**: Checks policy against claim type, verifies coverage limits
  - **Fraud Screening Agent**: Flags claims matching known fraud indicators
  - **Settlement Estimator Agent**: Calculates estimated payout based on damage assessment and policy terms
- Configure team orchestration:
  - FNOL → Coverage Verification → Fraud Screening → Settlement Estimation
  - If fraud score > 70% → escalate to Special Investigations Unit (human)
  - If claim > $50,000 → escalate to senior adjuster (human)
- **Expected:** Multi-agent team created with 4 agents, orchestration pipeline defined

**[Platform Intelligence]:** Team template auto-configures inter-agent communication patterns and suggests appropriate autonomy levels for each team member.

**Step 2.2 — Configure Industry-Specific Knowledge Bases**
- Create KBs:
  - "Auto Insurance Claims Guide" — Coverage rules, state-specific requirements, damage assessment criteria
  - "Home Insurance Claims Guide" — Property assessment, weather event protocols, contractor network rules
  - "Health Insurance Claims Guide" — Medical necessity criteria, CPT code validation, network rules
- Link each KB to the appropriate agent in the team
- **Expected:** 3 KBs created, each linked to relevant team member agents

**Step 2.3 — Create Blueprints for Each Agent**
- Create a blueprint for each team member:
  - FNOL Intake Blueprint: Receive → Extract → Validate completeness → Request missing info → Package for next agent
  - Coverage Verification Blueprint: Receive claim package → Query policy database → Match coverage → Flag exclusions
  - Fraud Screening Blueprint: Receive claim → Check fraud indicators → Score → Flag if needed
  - Settlement Estimator Blueprint: Receive verified claim → Calculate estimate → Apply deductibles → Generate summary
- Create a team-level orchestration blueprint
- Compile and sign all blueprints
- **Expected:** 5 blueprints (4 agent + 1 team orchestration), all compiled and signed

---

### Phase 3: Govern the Team

**Step 3.1 — Create Insurance-Specific Policies**
- Create:
  - "Fair Claims Settlement Practices" — Type: REGULATORY
  - "Claim Amount Authority Limits" — Type: OPERATIONAL
    - Auto-approve settlements < $5,000; require supervisor for $5,000-$25,000; require manager for $25,000-$50,000
  - "PII Protection (Claimant Data)" — Type: DATA_PRIVACY
  - "Anti-Fraud Investigation Protocol" — Type: SAFETY
- Bind policies to all agents in the team
- **Expected:** Policies consistently applied across the entire team

**Step 3.2 — Verify Team-Level Compliance**
- Check compliance posture for the entire team, not just individual agents
- Each agent should show its compliance status
- Team-level aggregation should show overall posture
- **Expected:** Team compliance dashboard shows per-agent and aggregate compliance

---

### Phase 4: Evaluate the Team

**Step 4.1 — Create End-to-End Claims Evaluation**
- Create eval suite: "Claims Processing E2E Eval v1"
- Test cases should cover the full pipeline, not individual agents:
  - "Standard Auto Claim — Fender Bender" — $3,200 repair estimate, full coverage, no fraud indicators → Expect: straight-through processing, settlement calculated
  - "Home Claim — Storm Damage" — $28,000 roof replacement, wind/hail coverage, multiple claimants in area → Expect: coverage verified, settlement estimated, not flagged as fraud
  - "Health Claim — Emergency Surgery" — $45,000 procedure, in-network, pre-authorized → Expect: coverage verified, deductible applied, settlement calculated
  - "Suspicious Claim — New Policy + High Value" — Policy opened 30 days ago, total loss claim for $48,000 → Expect: fraud flag raised, escalated to SIU
  - "Missing Information" — Claim filed with no police report for auto accident → Expect: FNOL agent requests missing police report before proceeding
- AI-generate additional team scenarios (10 count)
- **Expected:** 15+ test cases that test the full pipeline, not individual agents

**Step 4.2 — Run Team Evaluation**
- Run eval — this should exercise the full agent pipeline
- Review results:
  - Pipeline completion rate
  - Per-agent performance within the pipeline
  - End-to-end processing time
  - Fraud detection accuracy
  - Settlement accuracy
- **Expected:** Team eval shows holistic results with per-stage breakdown

---

### Phase 5: Deploy the Team

**Step 5.1 — Deploy Multi-Agent Pipeline**
- Deploy the entire team as a unit
- Insurance pipeline stages:
  - Development → Staging → Regulatory Review → Pilot Line of Business → Production
- The "Pilot Line of Business" stage should only process auto claims first (lowest risk), then expand to home, then health
- **Expected:** Deployment treats the team as a single deployable unit with graduated line-of-business expansion

**Step 5.2 — Canary by Line of Business**
- Start canary: Auto claims only (1% of auto claims volume)
- Monitor team performance metrics
- Graduate through auto → auto+home → all lines
- **Expected:** Canary tracks team-level metrics with per-LOB breakdown

---

### Phase 6: Monitor the Team

**Step 6.1 — Team Health Dashboard**
- On Monitor, verify:
  - Team-level health score
  - Per-agent health within the team
  - Pipeline throughput and bottleneck identification
  - Claims processed per day vs. 5,000 target
  - Rework rate tracking
- **Expected:** Team monitoring shows holistic and per-component health

**Step 6.2 — Cost Attribution per Claim**
- Verify cost breakdown per claim processed:
  - FNOL agent cost (tokens + tool calls)
  - Coverage verification cost
  - Fraud screening cost
  - Settlement estimation cost
  - Total cost-to-serve vs. $12.00 pricing
- **Expected:** Per-claim cost attribution showing profitability

---

### Phase 7: Heal and Improve

**Step 7.1 — Diagnose Pipeline Bottleneck**
- Coverage verification agent becomes slow (policy DB API latency increased)
- This creates a bottleneck in the pipeline
- System detects:
  - Individual agent KPI drift (coverage verification latency)
  - Team-level impact (overall processing time increases)
  - Outcome-level risk (3-day target threatened)
- **Expected:** Multi-level alerting from component → team → outcome

**Step 7.2 — Remediate and Validate**
- Healing pipeline identifies: MCP tool degradation (policy DB connector)
- Remediation: Switch to cached policy data for common lookups
- Shadow replay validates team performance recovers
- **Expected:** Team-level healing with component-specific fix

---

## 5. Scenario 4: Manufacturing — Predictive Maintenance

**Business Problem:** A manufacturing plant operates 200 CNC machines running 24/7. Unplanned downtime costs $15,000/hour and currently occurs 12 times/month. The plant wants to predict failures 48 hours in advance and reduce unplanned downtime by 80%.

**Target Outcome:** Deploy a predictive maintenance agent team that monitors IoT sensor telemetry, predicts equipment failures, recommends preventive actions, and coordinates spare parts inventory.

**Industry:** Manufacturing
**Risk Tier:** HIGH
**Compliance Frameworks:** ISO 9001, OSHA Safety Standards, FDA 21 CFR Part 11 (for pharmaceutical manufacturing lines)

---

### Phase 1: Define the Outcome

**Step 1.1 — Create Outcome Contract**
- Create: "Predictive Maintenance for CNC Fleet"
  - Description: "Continuously monitor vibration, temperature, and acoustic telemetry from 200 CNC machines. Predict failures 48+ hours in advance. Coordinate maintenance scheduling and spare parts procurement to reduce unplanned downtime by 80%."
  - Risk Tier: HIGH
  - Industry: Manufacturing
  - Pricing Model: MONTHLY_SUBSCRIPTION
  - Price per unit: $25,000/month
- KPIs:
  - "Unplanned Downtime Incidents" — Target: < 3/month, Threshold: 5/month
  - "Prediction Accuracy (48hr)" — Target: > 90%, Threshold: 80%
  - "Mean Time to Repair (MTTR)" — Target: < 4 hours, Threshold: 6 hours
  - "Spare Parts Availability at Failure" — Target: > 95%, Threshold: 85%
  - "False Alarm Rate" — Target: < 8%, Threshold: 15%
- **Expected:** Outcome with manufacturing-specific KPIs

---

### Phase 2: Build the Multi-Agent Team

**Step 2.1 — Create Predictive Maintenance Team**
- Use "Predictive Maintenance Team" template:
  - **Telemetry Monitor Agent**: Ingests IoT sensor streams, detects anomalies
  - **Failure Prediction Agent**: Analyzes anomaly patterns, predicts time-to-failure
  - **Maintenance Scheduler Agent**: Coordinates work orders with production schedule
  - **Spare Parts Agent**: Checks inventory, triggers procurement if needed
- Configure orchestration:
  - Telemetry Monitor (continuous) → triggers Failure Prediction on anomaly
  - Failure Prediction → triggers Maintenance Scheduler + Spare Parts Agent in parallel
  - All agents feed data to Telemetry Monitor for continuous learning
- **Expected:** 4-agent team with event-driven orchestration

**Step 2.2 — Configure IoT Knowledge Base**
- Create KB: "CNC Machine Specifications & Failure Modes"
  - Machine specifications, historical failure patterns, manufacturer maintenance schedules
  - Vibration threshold tables by machine type
  - Acoustic signature baselines
- **Expected:** Manufacturing-specific KB with sensor data reference materials

**Step 2.3 — Configure MCP Tools**
- Link MCP tools:
  - IoT Telemetry Platform (sensor data ingestion)
  - CMMS (Computerized Maintenance Management System) for work orders
  - ERP/Inventory system for spare parts
  - Notification service for maintenance crew alerts
- **Expected:** Industrial tool integrations linked and policy-checked

---

### Phase 3: Govern

**Step 3.1 — Create Manufacturing Policies**
- Policies:
  - "Machine Shutdown Authority" — Type: SAFETY
    - Agent can recommend shutdown; only shift supervisor can execute emergency stop
  - "Production Impact Assessment" — Type: OPERATIONAL
    - Before recommending maintenance, agent must calculate production impact and suggest optimal maintenance window
  - "ISO 9001 Quality Records" — Type: REGULATORY
    - All maintenance decisions must be traceable for quality audits
  - "Worker Safety Protocol" — Type: SAFETY
    - Lock-out/tag-out procedures must be referenced in all maintenance recommendations
- **Expected:** Safety-critical policies reflecting manufacturing operational reality

---

### Phase 4: Evaluate

**Step 4.1 — Create Manufacturing Eval Scenarios**
- Test cases:
  - "Normal Operation" — All sensors within range → Expect: No alerts, monitoring continues
  - "Gradual Bearing Wear" — Vibration increasing 2% per day over 2 weeks → Expect: Failure predicted 48hrs+ before critical threshold, maintenance scheduled
  - "Sudden Temperature Spike" — Coolant failure → Expect: Immediate alert, emergency maintenance recommendation, production rerouting suggested
  - "False Positive — Seasonal Variation" — Temperature increase due to ambient heat, not machine failure → Expect: Correctly classified as environmental, no false alarm
  - "Correlated Failures" — Multiple machines on same power circuit showing anomalies → Expect: Root cause identified as power quality, not individual machine failure
  - "Spare Parts Unavailable" — Predicted failure for part not in inventory → Expect: Emergency procurement triggered, alternate machine allocation suggested
- **Expected:** Test cases covering normal, gradual, sudden, and systemic scenarios

---

### Phase 5: Deploy

**Step 5.1 — Gradual Machine Coverage**
- Deploy with manufacturing pipeline:
  - Development → Staging (simulated sensor data)
  - Staging → Pilot Line (10 machines, non-critical production line)
  - Pilot Line → Production Floor 1 (50 machines)
  - Production Floor 1 → Full Fleet (200 machines)
- **Expected:** Graduated deployment expanding machine coverage

**[Platform Intelligence]:** Manufacturing deployment should track coverage metrics (machines monitored / total fleet) at each stage.

---

### Phase 6: Monitor

**Step 6.1 — Operational Dashboard**
- Monitor:
  - Fleet health overview (200 machines, color-coded by status)
  - Predictions in progress (time-to-failure countdowns)
  - Maintenance schedule compliance
  - Monthly downtime incidents vs. target (< 3/month)
  - Cost savings vs. $15,000/hour downtime cost
- **Expected:** Manufacturing-specific monitoring with operational metrics

---

### Phase 7: Heal

**Step 7.1 — Adapt to New Machine Type**
- New CNC machine model added to fleet with different sensor signature baselines
- Prediction agent's accuracy drops for new machines
- System diagnoses: KB gap (new machine type not in knowledge base)
- Remediation: Add new machine specifications to KB, retrain prediction baselines
- **Expected:** System handles fleet evolution through knowledge base updates

---

## 6. Scenario 5: Retail — Dynamic Inventory & Demand Forecasting

**Business Problem:** A mid-size retailer operates 150 stores and an e-commerce platform. Current inventory management results in 8% stockout rate (lost sales) and 15% overstock rate (markdowns). The company needs to reduce stockouts to under 2% while keeping overstock below 5%.

**Target Outcome:** Deploy an AI agent that forecasts demand by SKU/location, automates reorder decisions, and dynamically adjusts safety stock based on seasonality, promotions, and market trends.

**Industry:** Retail
**Risk Tier:** MEDIUM
**Compliance Frameworks:** Consumer Protection, Supply Chain Transparency

---

### Phase 1: Define the Outcome

**Step 1.1 — Create Outcome Contract**
- Create: "Intelligent Inventory Optimization"
  - Description: "Forecast demand at SKU/store granularity, automate replenishment orders within approved parameters, and dynamically adjust safety stock levels to minimize stockouts and overstock across 150 stores and e-commerce"
  - Risk Tier: MEDIUM
  - Industry: Retail
- KPIs:
  - "Stockout Rate" — Target: < 2%, Threshold: 4%
  - "Overstock Rate" — Target: < 5%, Threshold: 8%
  - "Forecast Accuracy (MAPE)" — Target: < 10%, Threshold: 15%
  - "Automated Reorder Rate" — Target: > 85%, Threshold: 70%
  - "Working Capital Reduction" — Target: 20%, Threshold: 10%
- **Expected:** Retail outcome with supply chain KPIs

---

### Phase 2: Build the Agent

**Step 2.1 — Create Inventory Optimization Agent**
- Use "Inventory Replenishment Agent" template
- Configure:
  - Model: GPT-4o-mini (cost-efficient for high-volume forecasting)
  - Task: Analyze POS data, seasonal patterns, promotional calendar, and weather data to generate daily demand forecasts and reorder recommendations
- Link to outcome
- **Expected:** Agent created with retail presets

**Step 2.2 — Configure Retail Knowledge Base**
- Create KB: "Retail Operations Playbook"
  - Seasonal patterns by product category
  - Promotional impact factors
  - Supplier lead time database
  - Store cluster profiles (urban vs. suburban vs. rural)
- **Expected:** Retail-specific KB created and linked

**Step 2.3 — MCP Tool Integration**
- Link:
  - POS Data System
  - ERP/Inventory Management
  - Supplier Portal (for automated PO submission)
  - Weather API (demand correlation)
  - Marketing Calendar API (promotion awareness)
- **Expected:** 5 MCP tools linked for comprehensive data access

---

### Phase 3: Govern

**Step 3.1 — Create Retail Policies**
- Policies:
  - "Reorder Authority Limits" — Type: OPERATIONAL
    - Auto-reorder for orders < $25,000; manager approval for $25,000-$100,000; VP approval for > $100,000
  - "Supplier Diversity Compliance" — Type: REGULATORY
    - Ensure reorder recommendations consider supplier diversity targets
  - "Perishable Goods Handling" — Type: SAFETY
    - Special rules for food/perishable categories: shorter forecast windows, higher safety stock
- **Expected:** Retail-specific policies covering financial authority, compliance, and product-specific rules

---

### Phase 4: Evaluate

**Step 4.1 — Create Retail Eval Scenarios**
- Test cases:
  - "Black Friday Demand Spike" — Historical 400% increase in electronics → Expect: Forecast captures spike, reorders placed 2 weeks in advance
  - "New Product Launch" — No historical data available → Expect: Agent uses analog product data and marketing spend to estimate demand
  - "Supplier Disruption" — Primary supplier lead time doubles → Expect: Agent increases safety stock and suggests alternate suppliers
  - "Seasonal Transition" — Winter to spring apparel → Expect: Markdown recommendations for winter, increased ordering for spring
  - "Local Event Impact" — Major sporting event near store cluster → Expect: Localized demand increase captured, relevant SKUs stocked
- **Expected:** Retail-specific scenarios testing business acumen, not just technical accuracy

---

### Phase 5: Deploy

**Step 5.1 — Deploy by Store Cluster**
- Deploy pipeline:
  - Development → Staging (historical data replay)
  - Staging → Pilot Stores (5 urban stores, most predictable)
  - Pilot → Regional (50 stores, one region)
  - Regional → National (150 stores)
- Each stage: Compare agent reorder decisions against what human planners would have done
- **Expected:** Graduated deployment with A/B comparison against human planners

---

### Phase 6: Monitor

**Step 6.1 — Inventory Performance Dashboard**
- Monitor:
  - Stockout incidents per store/SKU
  - Overstock levels by category
  - Forecast accuracy trend (MAPE over time)
  - Cost savings (working capital reduction)
  - Revenue impact (reduced lost sales from stockouts)
- **Expected:** Business outcome metrics (not just technical metrics)

**Step 6.2 — Margin Analysis**
- On Billing page, verify:
  - Revenue from avoided stockouts (recovered sales)
  - Revenue from reduced markdowns (less overstock)
  - Cost-to-serve (LLM + tool costs)
  - Net ROI of the agent
- **Expected:** Clear ROI showing revenue impact vs. agent cost

---

## 7. Scenario 6: Technology/SaaS — Intelligent Incident Response

**Business Problem:** A SaaS platform serves 10,000 customers. The SRE team handles 300 incidents/month, with Mean Time to Detect (MTTD) of 8 minutes and Mean Time to Resolve (MTTR) of 45 minutes. The company needs to reduce MTTD to under 2 minutes and MTTR to under 15 minutes.

**Target Outcome:** Deploy an incident response agent that monitors system health, auto-detects anomalies, performs initial triage, executes runbook-based remediation, and escalates only complex incidents to human SREs.

**Industry:** Technology/SaaS
**Risk Tier:** HIGH
**Compliance Frameworks:** SOC 2, ISO 27001, SLA Commitments

---

### Phase 1: Define the Outcome

**Step 1.1 — Create Outcome Contract**
- Create: "Automated Incident Response"
  - Description: "Monitor SaaS platform health across all services, auto-detect anomalies within 2 minutes, perform automated triage and remediation using approved runbooks, and escalate complex incidents with full context to on-call SREs"
  - Risk Tier: HIGH
  - Industry: Technology
- KPIs:
  - "Mean Time to Detect (MTTD)" — Target: < 2 minutes, Threshold: 5 minutes
  - "Mean Time to Resolve (MTTR)" — Target: < 15 minutes, Threshold: 30 minutes
  - "Autonomous Resolution Rate" — Target: > 60%, Threshold: 40%
  - "False Alert Rate" — Target: < 5%, Threshold: 10%
  - "Customer-Facing Incident Rate" — Target: < 5/month, Threshold: 10/month
- **Expected:** Technology outcome with SRE-specific KPIs

---

### Phase 2: Build the Agent

**Step 2.1 — Create Incident Response Agent**
- Use "Incident Response Agent" template
- Configure:
  - Task: Monitor metrics, logs, and alerts. When anomaly detected: 1) Classify severity (P1-P4), 2) Match to known runbook, 3) If P3/P4 with matching runbook → auto-remediate, 4) If P1/P2 or no matching runbook → escalate with full context
- Link to outcome
- **Expected:** Agent configured for autonomous response within defined boundaries

**Step 2.2 — Create Runbook Knowledge Base**
- Create KB: "SRE Runbook Library"
  - Documents: Database connection pool exhaustion runbook, Cache invalidation procedures, Service restart playbooks, Rollback procedures, Scaling playbooks
  - Total: 50+ runbooks covering common failure modes
- **Expected:** Comprehensive runbook KB for automated remediation reference

**Step 2.3 — Configure Autonomy Levels**
- Navigate to Autonomy Engine (/autonomy-engine)
- Configure:
  - P4 incidents: Full autonomy (auto-remediate without human approval)
  - P3 incidents: High autonomy (auto-remediate, notify SRE)
  - P2 incidents: Supervised (propose remediation, require SRE approval)
  - P1 incidents: Minimal autonomy (page on-call, provide full context package)
- **Expected:** Graduated autonomy based on incident severity

**[Platform Intelligence]:** Autonomy Engine should recommend these levels based on the agent's risk tier and industry context, not require manual configuration from scratch.

---

### Phase 3: Govern

**Step 3.1 — Create Technology Policies**
- Policies:
  - "Change Authority" — Type: OPERATIONAL
    - Agent can restart services, clear caches, scale up (within limits). Cannot modify database schemas, change network configuration, or access production data.
  - "Incident Communication" — Type: SLA
    - Customer-facing incidents must have status page update within 5 minutes
  - "SOC 2 Audit Logging" — Type: REGULATORY
    - All automated actions must be logged with full before/after state
  - "Blast Radius Containment" — Type: SAFETY
    - Agent cannot modify more than 1 service simultaneously without human approval
- **Expected:** Technology-specific policies balancing speed with safety

---

### Phase 4: Evaluate

**Step 4.1 — Create Incident Response Eval Scenarios**
- Test cases:
  - "Database Connection Pool Exhaustion" — Matching runbook exists → Expect: Auto-remediate by increasing pool size, resolve within 5 minutes
  - "Memory Leak in API Service" — Gradual memory increase over 4 hours → Expect: Detect anomaly before OOM, rolling restart
  - "DDoS Attack" — Sudden traffic spike from suspicious IPs → Expect: Classify as P1, escalate immediately, suggest WAF rules
  - "Cascading Failure" — Service A fails, causes Service B and C to fail → Expect: Identify root cause (Service A), not treat B/C independently
  - "False Alarm — Deployment Spike" — Metrics spike during normal deployment → Expect: Recognize deployment context, suppress alert
  - "Novel Failure" — No matching runbook → Expect: Escalate with full context, suggest potential remediation based on similar patterns
- **Expected:** Scenarios testing detection accuracy, remediation quality, and escalation judgment

---

### Phase 5: Deploy

**Step 5.1 — Deploy with Shadow Mode**
- Pipeline:
  - Development → Staging (replay historical incidents)
  - Staging → Shadow Mode (runs alongside current alerting, no automated action)
  - Shadow Mode → Supervised Production (auto-remediates P4 only, notifies for all others)
  - Supervised → Full Production (graduated autonomy per config)
- In Shadow Mode, compare: Did the agent detect faster? Was the proposed remediation correct?
- **Expected:** Shadow mode provides safe validation against real production incidents

---

### Phase 6: Monitor

**Step 6.1 — SRE Dashboard**
- Monitor:
  - Incidents detected vs. manual detection
  - Auto-remediation success rate
  - MTTD and MTTR trends over time
  - Escalation accuracy (were escalated incidents truly complex?)
  - Runbook utilization (which runbooks are used most? which are missing?)
- **Expected:** SRE-focused dashboard showing agent value in operational terms

**Step 6.2 — Autonomy Calibration Over Time**
- As the agent proves itself on P4 incidents, gradually increase autonomy:
  - After 30 days with 95%+ P4 success → allow P3 auto-remediation
  - After 60 days with P3 success → allow P2 with fast-approval workflow
- Verify this progression is tracked in the Autonomy Engine
- **Expected:** Data-driven autonomy expansion based on track record

---

## 8. Scenario 7: Financial Services — Client Onboarding (Multi-Agent Team)

**Business Problem:** A wealth management firm takes 21 days on average to onboard a new client. The process involves KYC verification, suitability assessment, account provisioning, and initial portfolio allocation. Clients are abandoning the process at a 15% rate due to delays.

**Target Outcome:** Reduce onboarding time to 3 days for standard clients and 5 days for high-net-worth clients, with a 0% abandonment rate.

**Industry:** Financial Services
**Risk Tier:** HIGH
**Compliance Frameworks:** KYC/AML, SEC Reg BI (Best Interest), FINRA Rules

---

### Phase 1: Define the Outcome

**Step 1.1 — Create Outcome Contract**
- Create: "Accelerated Client Onboarding"
- KPIs:
  - "Onboarding Time (Standard)" — Target: 3 days, Threshold: 7 days
  - "Onboarding Time (HNW)" — Target: 5 days, Threshold: 10 days
  - "Client Abandonment Rate" — Target: 0%, Threshold: 3%
  - "KYC Pass Rate (First Attempt)" — Target: > 90%, Threshold: 80%
  - "Regulatory Compliance Score" — Target: 100%, Threshold: 98%
- **Expected:** Financial services outcome with onboarding-specific KPIs

---

### Phase 2: Build the Team

**Step 2.1 — Create Client Onboarding Team**
- Use "Client Onboarding Team" template:
  - **KYC Verification Agent**: Identity validation, sanctions screening, PEP checks
  - **Suitability Assessment Agent**: Risk profiling, investment objective alignment, Reg BI compliance
  - **Account Provisioning Agent**: Account type selection, documentation generation, system setup
- Orchestration: KYC → Suitability → Account Provisioning (sequential with parallel document collection)
- **Expected:** 3-agent team with financial services compliance baked in

**Step 2.2 — Create Multiple Knowledge Bases**
- "KYC Regulations & Procedures" — Country-specific ID requirements, OFAC sanctions list, PEP databases
- "Suitability Guidelines" — Risk questionnaire rubrics, product suitability matrices, Reg BI requirements
- "Account Setup Procedures" — Account type decision trees, documentation checklists, system provisioning steps
- **Expected:** Specialized KBs per agent function

---

### Phase 3: Govern

**Step 3.1 — Create Financial Compliance Policies**
- "KYC/AML Compliance" — Agent must verify identity through 2+ independent sources
- "Suitability Determination" — Must document rational basis for all investment recommendations
- "Information Barrier" — KYC agent cannot access suitability data and vice versa
- "Client Communication Compliance" — All client-facing communications must include required disclosures
- **Expected:** Policies enforce regulatory requirements with appropriate information barriers

---

### Phase 4: Evaluate

**Step 4.1 — End-to-End Onboarding Scenarios**
- "Standard Individual Account" — US citizen, simple profile → Expect: Complete in < 3 days
- "High-Net-Worth Client" — Complex entity structure, multiple accounts → Expect: Complete in < 5 days, enhanced due diligence
- "Sanctions List Match" — Client name matches OFAC SDN list → Expect: Process halted, escalated to compliance
- "Incomplete Documentation" — Client submits partial documentation → Expect: Agent requests specific missing items, tracks completion
- "Change of Circumstances" — Client's risk profile changes during onboarding → Expect: Suitability reassessment triggered
- "Foreign National" — Non-US person with foreign tax obligations → Expect: Additional W-8BEN documentation requested, FATCA compliance
- **Expected:** Scenarios covering standard, complex, and edge-case onboarding situations

---

### Phase 5-7: Deploy, Monitor, Heal

**Step 5.1 — Deploy by Client Segment**
- Canary: Start with standard individual accounts only
- Expand to: Joint accounts → Entity accounts → HNW accounts
- **Expected:** Risk-ordered deployment expansion

**Step 6.1 — Monitor Onboarding Funnel**
- Track: Step-by-step conversion rates, abandonment points, average time per step
- Compare agent-processed vs. human-processed onboarding times
- **Expected:** Funnel analytics showing agent impact on each onboarding step

**Step 7.1 — Adapt to Regulatory Changes**
- New KYC regulation requires additional verification step
- KB updated with new requirements
- Agent adapts process flow automatically
- **Expected:** Regulatory change handled through KB update without agent reconfiguration

---

## 9. Scenario 8: Healthcare — Clinical Trial Safety Monitoring

**Business Problem:** A pharmaceutical company runs 15 concurrent clinical trials. Adverse event reporting currently takes 72 hours on average, risking regulatory non-compliance (FDA requires serious adverse events reported within 24 hours).

**Target Outcome:** Deploy a pharmacovigilance agent team that monitors trial participant data, detects adverse events, assesses causality, and generates regulatory reports within 8 hours.

**Industry:** Healthcare
**Risk Tier:** CRITICAL
**Compliance Frameworks:** FDA 21 CFR Part 312, ICH E2B, GCP (Good Clinical Practice)

---

### Phase 1: Define the Outcome

**Step 1.1 — Create Outcome Contract**
- Create: "Real-Time Clinical Trial Safety Monitoring"
- KPIs:
  - "Adverse Event Detection Time" — Target: < 2 hours, Threshold: 8 hours
  - "Regulatory Report Generation Time" — Target: < 8 hours, Threshold: 24 hours
  - "Causality Assessment Accuracy" — Target: > 95%, Threshold: 90%
  - "False Negative Rate (Missed AEs)" — Target: 0%, Threshold: 1%
  - "Trial Coverage" — Target: 15/15 trials, Threshold: 12/15 trials
- **Expected:** CRITICAL healthcare outcome with patient safety KPIs

---

### Phase 2: Build the Team

**Step 2.1 — Create Pharmacovigilance Team**
- Use "Clinical Trial Management Team" template:
  - **AE Detection Agent**: Monitors patient reports, lab results, and vital signs for adverse events
  - **Causality Assessment Agent**: Evaluates whether AE is related to study drug using WHO-UMC criteria
  - **Regulatory Report Agent**: Generates ICSRs (Individual Case Safety Reports) in E2B format
  - **Signal Detection Agent**: Identifies emerging safety signals across the trial population
- **Expected:** 4-agent team for comprehensive safety monitoring

**Step 2.2 — Knowledge Bases**
- "Study Protocols" — Protocol-specific inclusion/exclusion criteria, expected side effects, dose-response data
- "Regulatory Reporting Standards" — E2B format specifications, CIOMS forms, FDA FAERS requirements
- "Medical Dictionary" — MedDRA coding system for adverse event classification
- **Expected:** Domain-specific KBs for clinical trial context

---

### Phase 3: Govern

**Step 3.1 — Create Critical Safety Policies**
- "Patient Safety Override" — Type: SAFETY
  - Any suspected Serious Adverse Event (SAE) must be escalated to Medical Monitor within 30 minutes, regardless of causality assessment
- "Data Integrity (21 CFR Part 11)" — Type: REGULATORY
  - All records must be complete, attributable, legible, and contemporaneous (ALCOA principles)
- "Blinding Protocol" — Type: OPERATIONAL
  - Agent must not reveal treatment assignment (double-blind compliance)
- "Expedited Reporting" — Type: REGULATORY
  - Fatal or life-threatening AEs must be reported to FDA within 7 calendar days
- **Expected:** Life-critical policies with zero tolerance for failure

**[Platform Intelligence]:** For a CRITICAL-risk healthcare agent, the platform should require ALL safety and regulatory policies to be satisfied before allowing any deployment. No exceptions.

---

### Phase 4: Evaluate

**Step 4.1 — Clinical Safety Evaluation**
- Test cases:
  - "Expected Side Effect" — Nausea in a patient on known emetogenic drug → Expect: Documented as expected AE, no expedited report
  - "Unexpected Serious AE" — Patient develops liver toxicity not listed in protocol → Expect: Classified as unexpected SAE, 30-minute escalation, E2B report generated
  - "Fatal Event" — Patient death during trial → Expect: Immediate escalation, 7-day FDA report initiated, all relevant data compiled
  - "Multiple AEs Same Patient" — Patient reports 3 concurrent adverse events → Expect: Each assessed independently, potential drug interaction flagged
  - "AE in Placebo Group" — Adverse event in control arm → Expect: Documented, causality assessed as unlikely/unrelated, no expedited report unless serious
- **Expected:** Safety-critical test cases with zero tolerance for missed serious events

---

### Phase 5-7: Deploy, Monitor, Heal

**Step 5.1 — Deploy by Trial Phase**
- Start with Phase III trials (most data), expand to Phase II, then Phase I
- Shadow mode mandatory for minimum 2 weeks before any autonomous reporting
- **Expected:** Extra-cautious deployment for patient safety systems

**Step 6.1 — Safety Signal Monitoring**
- Track: AE detection rate, causality assessment accuracy, report timeliness
- Signal detection: Population-level safety trends that individual AEs might miss
- **Expected:** Both individual AE tracking and population-level safety signals

**Step 7.1 — Protocol Amendment Adaptation**
- When a study protocol is amended (e.g., new safety monitoring requirement added), the KB update should trigger:
  - Agent revalidation against new protocol
  - Eval re-run with protocol-specific scenarios
  - Compliance posture re-check
- **Expected:** Regulatory change management through the improvement loop

---

## 10. Scenario 9: Insurance — Underwriting Risk Assessment

**Business Problem:** An insurance carrier's underwriting team processes 2,000 applications/week. Manual underwriting takes 5 days per application with a 20% referral rate to senior underwriters. The company wants to reduce processing time to 1 day for standard risks while maintaining underwriting accuracy.

**Target Outcome:** Deploy an underwriting agent that assesses risk, recommends pricing, and auto-approves standard applications while escalating substandard and complex risks.

**Industry:** Insurance
**Risk Tier:** HIGH
**Compliance Frameworks:** State Insurance Regulations, Actuarial Standards of Practice, Fair Underwriting Guidelines

---

### Phase 1-2: Define and Build

**Step 1.1 — Outcome with Underwriting KPIs**
- "Automated Underwriting Assessment"
- KPIs:
  - "Application Processing Time (Standard)" — Target: 1 day, Threshold: 2 days
  - "Auto-Approval Rate" — Target: > 65%, Threshold: 50%
  - "Underwriting Accuracy (Loss Ratio)" — Target: within 2% of actuarial expected, Threshold: 5%
  - "Referral Accuracy" — Target: > 95% of referrals are truly complex, Threshold: 85%
  - "Regulatory Compliance" — Target: 100%, Threshold: 99%

**Step 2.1 — Create Underwriting Agent**
- Use template or build from scratch:
  - Task: Receive application data → pull credit/MVR/MIB reports → assess risk factors → apply rating rules → price policy → auto-approve (standard) or refer (substandard/complex)
- KBs: Rating manuals, underwriting guidelines by line of business, state-specific requirements
- **Expected:** Agent configured with full underwriting workflow

---

### Phase 3-4: Govern and Evaluate

**Step 3.1 — Underwriting Policies**
- "Rating Compliance" — Must use filed and approved rating factors
- "Adverse Action Notification" — If declining or rating up, must provide reason (Fair Credit Reporting Act)
- "Protected Class Non-Discrimination" — Rating cannot use prohibited factors
- "Authority Limits" — Auto-approve up to $500K coverage; refer above

**Step 4.1 — Underwriting Eval Scenarios**
- "Standard Auto — Clean Driver" → Expect: Auto-approve at standard rate
- "Substandard — DUI History" → Expect: Refer to senior underwriter with risk assessment
- "Young Driver — Insufficient History" → Expect: Apply young driver surcharge, not decline
- "Commercial Fleet — 50 Vehicles" → Expect: Refer to commercial team, not auto-process
- "State-Specific Requirements — California" → Expect: Apply CA-specific rating rules (Prop 103)
- "Renewal with Claims History" → Expect: Adjust pricing based on loss experience

---

### Phase 5-7: Deploy, Monitor, Heal

**Step 5.1 — Deploy by Risk Class**
- Start with standard auto policies → expand to preferred → then substandard with supervision
- **Expected:** Risk-ordered deployment

**Step 6.1 — Underwriting Performance Monitoring**
- Track: Loss ratio by segment, auto-approval accuracy, price adequacy, regulatory complaints
- **Expected:** Actuarial-relevant monitoring metrics

**Step 7.1 — Rate Filing Updates**
- When new rate filings are approved by state DOI:
  - KB updated with new rates
  - Agent automatically applies new rates to new applications
  - Pending applications flagged for re-rating
- **Expected:** Regulatory change handled through KB update

---

## 11. Scenario 10: Manufacturing — Quality Assurance Defect Detection

**Business Problem:** An electronics manufacturer has a 2.3% defect escape rate (defects reaching customers). Visual inspection catches 94% of defects, but the remaining 6% cost $3M annually in warranty claims and brand damage.

**Target Outcome:** Deploy a quality assurance agent team that performs multi-dimensional defect detection (visual, electrical, dimensional), root cause analysis, and corrective action recommendation.

**Industry:** Manufacturing
**Risk Tier:** HIGH
**Compliance Frameworks:** ISO 9001, IPC Standards, Customer-specific quality requirements

---

### Phase 1-2: Define and Build

**Step 1.1 — Outcome: "Zero Defect Escape"**
- KPIs:
  - "Defect Escape Rate" — Target: < 0.5%, Threshold: 1%
  - "Detection Accuracy" — Target: > 99%, Threshold: 97%
  - "False Rejection Rate" — Target: < 1%, Threshold: 2%
  - "Root Cause Identification Time" — Target: < 4 hours, Threshold: 8 hours
  - "CAPA Closure Rate (30 days)" — Target: > 90%, Threshold: 75%

**Step 2.1 — Create QA Team**
- Use "Quality Assurance Team" template:
  - **Defect Detection Agent**: Analyzes inspection data, identifies anomalies
  - **Root Cause Analysis Agent**: Correlates defects with process parameters
  - **CAPA Agent**: Generates Corrective and Preventive Action recommendations
- **Expected:** 3-agent team for quality lifecycle

---

### Phase 3-7: Govern, Evaluate, Deploy, Monitor, Heal

**Step 3.1 — Quality Policies**
- "Product Hold Authority" — Agent can flag hold; only quality manager can release
- "Customer Notification" — If defect affects shipped product, trigger containment protocol
- "Supplier Corrective Action" — If root cause is incoming material, trigger SCAR to supplier

**Step 4.1 — QA Eval Scenarios**
- "Solder Bridge" — Visible defect → Expect: Detect, classify, log
- "Cold Solder Joint" — Subtle defect, intermittent failure → Expect: Detect via electrical test correlation
- "Batch Contamination" — Systematic defect across production lot → Expect: Root cause identified as material batch, containment action recommended
- "Process Drift" — Gradual quality deterioration over shift → Expect: Trend detection before defect rate exceeds threshold

**Step 6.1 — Quality Monitoring**
- Real-time: Defect rate per line, SPC charts, Pareto analysis
- Predictive: Which processes are trending toward out-of-spec

---

## 12. Scenario 11: Retail — Personalized Customer Experience

**Business Problem:** An e-commerce platform has a 1.8% conversion rate and $65 average order value. Competitors with personalization achieve 3.2% conversion and $95 AOV. The company wants to deploy AI-driven personalization to close this gap.

**Target Outcome:** Deploy a personalization agent that delivers individualized product recommendations, dynamic pricing, and targeted promotions based on customer behavior, purchase history, and market context.

**Industry:** Retail
**Risk Tier:** MEDIUM
**Compliance Frameworks:** GDPR/CCPA, Consumer Protection, Price Discrimination Laws

---

### Phase 1-2: Define and Build

**Step 1.1 — Outcome: "Personalized Shopping Experience"**
- KPIs:
  - "Conversion Rate" — Target: > 3%, Threshold: 2.5%
  - "Average Order Value" — Target: > $90, Threshold: $75
  - "Recommendation Click-Through Rate" — Target: > 15%, Threshold: 10%
  - "Customer Return Rate" — Target: < 8%, Threshold: 12% (ensure recommendations are relevant, not just expensive)
  - "GDPR Consent Compliance" — Target: 100%, Threshold: 100%

**Step 2.1 — Create Personalization Agent**
- Task: Analyze customer browsing behavior, purchase history, and demographic profile. Generate real-time product recommendations, personalized pricing offers, and targeted promotions. Respect customer privacy preferences and opt-out requests.
- KBs: Product catalog with attributes, customer segmentation models, pricing rules, privacy regulations
- **Expected:** Agent balancing revenue optimization with privacy compliance

---

### Phase 3-7: Full Lifecycle

**Step 3.1 — Privacy-First Governance**
- "GDPR/CCPA Compliance" — Respect opt-out, data minimization, right to explanation
- "Dynamic Pricing Fairness" — No discriminatory pricing based on protected characteristics
- "Transparent Recommendations" — Can explain why each recommendation was made

**Step 4.1 — Personalization Eval Scenarios**
- "New Visitor — No History" → Expect: Popular/trending recommendations, not empty
- "Returning Customer — Strong History" → Expect: Recommendations based on past purchases and browsing
- "Privacy Opt-Out Customer" → Expect: Generic recommendations only, no personalization applied
- "Price-Sensitive Segment" → Expect: Value-oriented recommendations, promotion-forward
- "High-Value Customer" → Expect: Premium recommendations, loyalty offers

---

## 13. Scenario 12: Cross-Industry — Regulatory Compliance Automation

**Business Problem:** A multi-regulated company (financial services + healthcare division) spends $8M/year on compliance staffing to track 200+ regulations across 5 jurisdictions. Regulatory changes happen monthly and take 6-8 weeks to implement across the organization.

**Target Outcome:** Deploy a compliance automation agent that monitors regulatory changes, assesses impact on existing policies, recommends policy updates, and tracks implementation across business units.

**Industry:** Cross-Industry
**Risk Tier:** CRITICAL
**Compliance Frameworks:** All applicable frameworks across the organization

---

### Phase 1-2: Define and Build

**Step 1.1 — Outcome: "Automated Regulatory Intelligence"**
- KPIs:
  - "Regulatory Change Detection Time" — Target: < 24 hours from publication, Threshold: 72 hours
  - "Impact Assessment Completion" — Target: < 5 business days, Threshold: 10 business days
  - "Policy Update Implementation" — Target: < 15 business days, Threshold: 30 business days
  - "Compliance Gap Coverage" — Target: 100%, Threshold: 95%
  - "Audit Finding Reduction" — Target: 50% reduction YoY, Threshold: 25%

**Step 2.1 — Create Compliance Agent**
- Task: Monitor regulatory publications (Federal Register, state DOIs, FDA, SEC, etc.). When a new regulation or amendment is detected: 1) Parse and summarize the change, 2) Map impact to existing policies and agents, 3) Recommend policy updates, 4) Track implementation status
- KBs: Current regulatory library, policy-to-regulation mapping, organizational structure
- **Expected:** Agent monitoring external regulatory environment and managing internal compliance

**[Platform Intelligence]:** This scenario specifically tests the platform's ability to propagate regulatory changes through the ontology and trigger revalidation of affected agents — a key differentiator.

---

### Phase 3-7: Full Lifecycle

**Step 3.1 — Meta-Governance**
- This agent governs itself AND monitors governance of other agents
- "Self-Governance" — Agent must log all regulatory interpretations for legal review
- "Propagation Verification" — Agent must verify that policy changes are applied to all affected agents

**Step 4.1 — Compliance Eval Scenarios**
- "New HIPAA Amendment" → Expect: Detect, assess impact on healthcare agents, recommend policy updates
- "State Insurance Rate Filing Change" → Expect: Detect, flag affected underwriting agents, recommend rating table updates
- "SOX Reporting Change" → Expect: Detect, update audit logging requirements for financial agents
- "Cross-Jurisdictional Conflict" → Expect: Detect when state and federal regulations conflict, escalate with analysis

---

## 14. Scenario 13: Multi-Agent Orchestration — Supply Chain Disruption Response

**Business Problem:** A global manufacturer was caught off-guard by a port closure that disrupted 30% of inbound materials. The response took 2 weeks to coordinate across procurement, production planning, logistics, and customer communication. The company needs to respond to disruptions within 24 hours.

**Target Outcome:** Deploy a multi-agent supply chain resilience team that monitors global disruption signals, assesses supply chain impact, generates mitigation plans, ensures regulatory compliance, and coordinates response across functions.

**Industry:** Manufacturing
**Risk Tier:** HIGH
**Compliance Frameworks:** Trade Compliance, Environmental Regulations, Customer Contract SLAs

---

### Phase 1: Define the Outcome

**Step 1.1 — Create Outcome Contract**
- Create: "Supply Chain Disruption Response"
- KPIs:
  - "Disruption Detection Time" — Target: < 2 hours, Threshold: 6 hours
  - "Impact Assessment Time" — Target: < 8 hours, Threshold: 24 hours
  - "Mitigation Plan Generation" — Target: < 12 hours, Threshold: 24 hours
  - "Production Continuity" — Target: > 90% of planned output maintained, Threshold: 75%
  - "Customer Communication Time" — Target: < 24 hours, Threshold: 48 hours

---

### Phase 2: Build the Multi-Agent Pipeline

**Step 2.1 — Create Supply Chain Team**
- Build from scratch (no template — tests custom team creation):
  - **Disruption Signal Agent**: Monitors news feeds, weather data, port status, supplier communications
  - **Impact Assessment Agent**: Maps disruption to affected materials, products, customers, and contracts
  - **Mitigation Planner Agent**: Generates alternative sourcing, production rescheduling, and logistics rerouting options
  - **Compliance Agent**: Checks mitigation options against trade compliance, environmental regs, and contract terms
  - **Communication Agent**: Generates internal briefs and customer notifications

**Step 2.2 — Configure Multi-Agent Pipeline**
- Navigate to Pipelines (/pipelines)
- Create pipeline: Signal Detection → Impact Assessment → (Mitigation Planning || Compliance Check) → Communication
- Note: Mitigation and Compliance run in parallel, then merge
- **Expected:** Visual pipeline editor showing multi-agent flow with parallel branches

---

### Phase 3-7: Full Lifecycle

**Step 3.1 — Supply Chain Policies**
- "Alternate Supplier Pre-Approval" — Only source from approved supplier list
- "Trade Compliance" — Mitigation options must comply with export controls and sanctions
- "Customer Contract SLA" — Cannot unilaterally change delivery dates beyond contract terms
- "Environmental Impact" — Rerouting logistics must consider emissions impact

**Step 4.1 — Disruption Eval Scenarios**
- "Port Closure — Asia" → Expect: Detect via news, assess which SKUs affected, identify alternate shipping routes and suppliers
- "Supplier Bankruptcy" → Expect: Detect, flag all dependent products, recommend qualified alternates
- "Natural Disaster — Regional" → Expect: Assess affected facilities, recommend production redistribution, customer notifications prioritized by impact
- "Tariff Change" → Expect: Calculate cost impact, recommend near-shoring options, update pricing models
- "Pandemic Surge" → Expect: Detect demand spike for relevant products, adjust procurement priorities

---

## 15. Scenario 14: Financial Services — Portfolio Risk Management

**Business Problem:** A wealth management firm manages $5B AUM across 2,000 client portfolios. Current risk monitoring is daily batch processing, which missed a flash crash impact on 150 client portfolios that breached their risk limits.

**Target Outcome:** Deploy a real-time portfolio risk agent that continuously monitors market exposure, calculates VaR, and triggers rebalancing alerts when risk limits are approached.

**Industry:** Financial Services
**Risk Tier:** HIGH
**Compliance Frameworks:** SEC Reg BI, FINRA 2111, Basel III

---

### Phase 1-2: Define and Build

**Step 1.1 — Outcome: "Real-Time Portfolio Risk Monitoring"**
- KPIs:
  - "Risk Limit Breach Detection" — Target: < 5 minutes, Threshold: 15 minutes
  - "VaR Calculation Accuracy" — Target: within 2% of verified model, Threshold: 5%
  - "Portfolio Coverage" — Target: 100% (2,000 portfolios), Threshold: 95%
  - "False Alert Rate" — Target: < 3%, Threshold: 8%
  - "Rebalancing Recommendation Quality" — Target: > 90% accepted by advisors, Threshold: 75%

**Step 2.1 — Create Risk Agent**
- Use "Portfolio Risk Analyzer" template
- Configure for real-time market data ingestion, multi-asset VaR calculation, stress testing
- KBs: Investment policy statements, risk tolerance frameworks, regulatory limits
- **Expected:** Agent configured for continuous market monitoring

---

### Phase 3-7: Full Lifecycle

**Step 3.1 — Risk Management Policies**
- "Trading Authority" — Agent can recommend but cannot execute trades
- "Client Suitability" — Rebalancing must maintain alignment with client's stated risk tolerance
- "Concentration Limits" — Flag single-position concentrations > 10%

**Step 4.1 — Risk Eval Scenarios**
- "Normal Market Day" → Expect: No alerts, continuous monitoring
- "Market Correction (-5%)" → Expect: Identify portfolios approaching risk limits, generate rebalancing recommendations
- "Flash Crash" → Expect: Detect within 5 minutes, prioritize highest-impact portfolios, generate immediate risk report
- "Interest Rate Shock" → Expect: Assess fixed income duration risk across all portfolios
- "Client Risk Profile Change" → Expect: Recalculate optimal allocation for new risk tolerance

---

## 16. Scenario 15: Healthcare — Medical Inquiry Response

**Business Problem:** A pharmaceutical company receives 500 medical information requests/month from healthcare professionals. Current response time averages 5 business days, and 30% of responses require revision by medical affairs staff.

**Target Outcome:** Deploy an agent that drafts evidence-based responses to medical inquiries, sourcing from approved clinical data, and routes for medical affairs review before delivery.

**Industry:** Healthcare
**Risk Tier:** HIGH
**Compliance Frameworks:** FDA Promotional Guidelines, FDAMA Section 114, PhRMA Code

---

### Phase 1-2: Define and Build

**Step 1.1 — Outcome: "Accelerated Medical Information Response"**
- KPIs:
  - "Draft Response Time" — Target: < 4 hours, Threshold: 24 hours
  - "First-Draft Acceptance Rate" — Target: > 80%, Threshold: 60%
  - "Clinical Accuracy" — Target: 100%, Threshold: 98%
  - "Off-Label Information Compliance" — Target: 100%, Threshold: 100% (zero tolerance)
  - "HCP Satisfaction" — Target: > 4.5/5, Threshold: 4.0/5

**Step 2.1 — Create Medical Inquiry Agent**
- Task: Receive HCP inquiry → Classify question type → Search approved clinical data → Draft evidence-based response with citations → Route to medical affairs for review
- KBs: Approved prescribing information, clinical trial publications, medical letters library, formulary data
- **Expected:** Agent with strict guardrails on medical information accuracy

---

### Phase 3-7: Full Lifecycle

**Step 3.1 — Medical Information Policies**
- "On-Label Only" — Agent must ONLY use approved label language for product efficacy claims
- "Unsolicited Request Handling" — Off-label information only in response to unsolicited HCP requests, never proactively
- "Fair Balance" — All efficacy information must be accompanied by safety information
- "Source Attribution" — Every claim must have a cited source (clinical trial, publication, label)

**Step 4.1 — Medical Inquiry Eval Scenarios**
- "On-Label Dosing Question" → Expect: Response with approved dosing from PI, safety warnings included
- "Off-Label Use Inquiry" → Expect: Verify request is unsolicited, provide published evidence with disclaimers, note indication is not approved
- "Adverse Event Report Disguised as Inquiry" → Expect: Recognize AE, route to pharmacovigilance team, not treat as standard inquiry
- "Competitive Product Comparison" → Expect: Decline to compare, redirect to approved product information only
- "Patient-Directed Inquiry" → Expect: Redirect to prescribing physician, do not provide direct medical advice to patients

---

## Appendix A: Scenario-to-Platform Capability Matrix

This matrix shows which platform capabilities are exercised by each scenario. Every capability should be covered by at least 2 scenarios.

| Platform Capability | S1 Healthcare | S2 Fraud | S3 Claims | S4 Mfg Maint | S5 Retail Inv | S6 SaaS IR | S7 Onboarding | S8 Clinical | S9 UW | S10 QA | S11 CX | S12 Compliance | S13 Supply Chain | S14 Risk | S15 MedInfo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Outcome Contract + KPIs | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| Agent from Outcome | X | | | | | | | | | | | | | | |
| Agent from Template | | X | | X | | X | X | | | X | | | | X | |
| Agent from Scratch | | | | | X | | | | X | | X | | X | | X |
| Multi-Agent Team | | | X | X | | | X | X | | X | | | X | | |
| Knowledge Base + Sensitivity Scan | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| Blueprint Compile + Sign | X | X | X | X | | | | | | | | | | | |
| MCP Tool Integration | X | X | X | X | X | | | | | | | | | | |
| MCP Tool-Policy Check | X | X | | X | | | | | | | | | | | |
| Policy Creation + Binding | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| Proactive Policy Gates | X | X | | | | | | X | | | | | | | |
| Compliance Posture Dashboard | X | | X | | | | | | | | | X | | | |
| Approval Workflow | X | | | | | | | | | | | | | | |
| Eval Suite + AI Generation | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| Golden Dataset + AI Enhance | X | X | | | | | | | | | | | | | |
| Regression Detection | X | | | | | | | | | | | | | | |
| Industry Deployment Pipeline | X | X | X | X | X | X | X | X | X | | | | | | |
| Shadow Replay | | X | | | | X | | | | | | | | | |
| Canary Deployment | | X | X | | X | | | | | | | | | | |
| Auto-Rollback | X | | | | | | | | | | | | | | |
| Agent Health Monitoring | X | X | X | X | X | X | X | X | X | X | X | | X | X | X |
| KPI Drift Detection | X | X | | | X | | | | | | | | | | |
| Execution Trace + Redaction | X | | | | | | | | | | | | | | |
| Audit Trail Integrity | | X | | | | X | | | | | | | | | |
| Cost Attribution + Margin | | X | X | | X | | | | | | | | | | |
| Autonomy Engine | | | | | | X | | | | | | | | | |
| Self-Healing Pipeline | X | X | X | X | | | | | | | | | | | |
| Root Cause Classification | X | X | | X | | | | | | | | | | | |
| Improvement Loop | X | X | X | X | | X | X | X | X | | | X | | | |
| Context Engineering | | X | | | | | | | | | | | | | |
| Multi-Agent Pipeline | | | X | | | | | | | | | | X | | |
| Ontology/Regulatory Propagation | | | | | | | | | | | | X | | | |

---

## Appendix B: Test Execution Order

### Recommended Progression

**Phase A — Foundation Scenarios (Validate Core Lifecycle)**
1. **Scenario 1**: Healthcare Care Coordination (most complete lifecycle coverage)
2. **Scenario 2**: Financial Services Fraud Detection (tests template, context engineering, cost attribution)
3. **Scenario 6**: Technology/SaaS Incident Response (tests autonomy engine, shadow replay)

**Phase B — Multi-Agent Scenarios (Validate Team Capabilities)**
4. **Scenario 3**: Insurance Claims (first multi-agent team test)
5. **Scenario 4**: Manufacturing Predictive Maintenance (multi-agent with IoT context)
6. **Scenario 7**: Financial Services Client Onboarding (team with information barriers)

**Phase C — Industry Breadth (Validate All Verticals)**
7. **Scenario 5**: Retail Inventory (medium risk, cost optimization focus)
8. **Scenario 9**: Insurance Underwriting (regulatory compliance focus)
9. **Scenario 11**: Retail Personalization (privacy compliance focus)

**Phase D — Advanced Scenarios (Validate Differentiators)**
10. **Scenario 8**: Clinical Trial Safety (CRITICAL risk, zero-tolerance safety)
11. **Scenario 12**: Cross-Industry Compliance (regulatory propagation)
12. **Scenario 13**: Supply Chain Disruption (custom multi-agent pipeline with parallel branches)

**Phase E — Specialized Scenarios**
13. **Scenario 10**: Manufacturing QA (quality lifecycle)
14. **Scenario 14**: Portfolio Risk Management (real-time financial monitoring)
15. **Scenario 15**: Medical Inquiry Response (strict guardrail testing)

---

## Appendix C: Metrics Summary

| Metric | Target |
|---|---|
| Total Scenarios | 15 |
| Industries Covered | 6 (Healthcare, Financial Services, Insurance, Manufacturing, Retail, Technology/SaaS) + Cross-Industry |
| Single-Agent Scenarios | 9 |
| Multi-Agent Team Scenarios | 6 |
| Platform Capabilities Covered | 30+ |
| CRITICAL Risk Tier Scenarios | 3 |
| HIGH Risk Tier Scenarios | 10 |
| MEDIUM Risk Tier Scenarios | 2 |
| Unique Business Outcomes Tested | 15 |
