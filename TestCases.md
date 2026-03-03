# Nous Agent Orchestrator - Comprehensive Test Cases

**Version:** 1.0
**Last Updated:** March 2, 2026

---

## Table of Contents

1. [Test Strategy Overview](#1-test-strategy-overview)
2. [Phase 1: Outcome Definition & Agent Planning](#2-phase-1-outcome-definition--agent-planning)
3. [Phase 2: Agent Build & Configuration](#3-phase-2-agent-build--configuration)
4. [Phase 3: Governance & Compliance](#4-phase-3-governance--compliance)
5. [Phase 4: Evaluation & Quality Assurance](#5-phase-4-evaluation--quality-assurance)
6. [Phase 5: Deployment & Release Management](#6-phase-5-deployment--release-management)
7. [Phase 6: Monitoring & Operational Intelligence](#7-phase-6-monitoring--operational-intelligence)
8. [Phase 7: Continuous Improvement & Healing](#8-phase-7-continuous-improvement--healing)
9. [Cross-Cutting Concerns](#9-cross-cutting-concerns)
10. [Industry-Specific Test Scenarios](#10-industry-specific-test-scenarios)

---

## 1. Test Strategy Overview

### Testing Philosophy

These test cases follow the Outcome-to-Agent lifecycle, covering how a user:
1. **Defines a business outcome** with KPIs and SLA targets
2. **Builds an agent** (or multi-agent team) to fulfill that outcome
3. **Governs the agent** with policies, compliance frameworks, and guardrails
4. **Evaluates the agent** through golden datasets, eval suites, and scoring
5. **Deploys the agent** through industry-governed pipelines with safety gates
6. **Monitors the agent** through dashboards, drift detection, and health scores
7. **Heals and improves** the agent through autonomous remediation and feedback loops

### Priority Levels

| Priority | Label | Description |
|---|---|---|
| P0 | Critical | Core user journey blockers; must pass for any release |
| P1 | High | Key feature functionality; must pass for feature completeness |
| P2 | Medium | Enhancement and edge case coverage |
| P3 | Low | Nice-to-have validations and UI polish |

### Test Case Format

Each test case follows this structure:
- **ID**: Unique identifier (e.g., TC-OUT-001)
- **Title**: Descriptive name
- **Priority**: P0-P3
- **Preconditions**: Required state before test execution
- **Steps**: Numbered actions to perform
- **Expected Results**: Observable outcomes that constitute a pass
- **Traceability**: Maps to product feature/requirement

---

## 2. Phase 1: Outcome Definition & Agent Planning

### 2.1 Outcome Contract Creation

---

**TC-OUT-001: Create a Basic Outcome Contract**
- **Priority**: P0
- **Preconditions**: User is logged in with Admin or Outcome Owner role
- **Steps**:
  1. Navigate to Outcomes page (/outcomes)
  2. Click "New Outcome" button
  3. Enter outcome name: "Automated Customer Support Resolution"
  4. Enter description: "Autonomously resolve Tier 1 customer support tickets"
  5. Select Risk Tier: "MEDIUM"
  6. Select Pricing Model: "PER_OUTCOME_EVENT"
  7. Enter Price Per Unit: "2.50"
  8. Click "Create"
- **Expected Results**:
  - Outcome contract is created and appears in the outcomes list
  - Status is set to "active" by default
  - Toast notification confirms successful creation
  - Outcome detail page shows all entered fields correctly
- **Traceability**: Outcome Contract Engine

---

**TC-OUT-002: Create Outcome with KPIs (Atomic Creation)**
- **Priority**: P0
- **Preconditions**: User is logged in with Admin or Outcome Owner role
- **Steps**:
  1. Navigate to Outcomes page (/outcomes)
  2. Click "New Outcome with KPIs"
  3. Enter outcome name: "Fraud Detection Pipeline"
  4. Select Risk Tier: "HIGH"
  5. Add KPI 1: Name "False Positive Rate", Target "< 5%", Threshold "10%"
  6. Add KPI 2: Name "Detection Latency", Target "< 2s", Threshold "5s"
  7. Add KPI 3: Name "Autonomous Resolution Rate", Target "> 85%", Threshold "70%"
  8. Click "Create Outcome & KPIs"
- **Expected Results**:
  - Outcome and all 3 KPIs are created atomically
  - KPIs appear in the outcome detail page
  - Each KPI shows its target and threshold values
  - Constraint graph is automatically computed from KPI thresholds
- **Traceability**: Outcome Contract Engine, KPI System

---

**TC-OUT-003: Outcome SLA Configuration and Downstream Impact**
- **Priority**: P1
- **Preconditions**: Outcome "Fraud Detection Pipeline" exists with bound KPIs and at least one linked agent
- **Steps**:
  1. Navigate to the outcome detail page
  2. Click "Edit" and modify the KPI "False Positive Rate" target from "<5%" to "<3%"
  3. Save the changes
  4. Navigate to the "Downstream Impact" tab
- **Expected Results**:
  - Impact analysis shows all agents bound to this outcome
  - Each affected agent's evaluation thresholds are flagged as potentially requiring update
  - Audit event generated for the SLA modification
  - Warning displayed if any bound agent's current performance falls below the new threshold
- **Traceability**: Bidirectional KPI Binding, Outcome-Driven Deployment Guardrails

---

### 2.2 AI-Driven Agent Planning

---

**TC-PLAN-001: Generate Agent Development Plan from Outcome**
- **Priority**: P0
- **Preconditions**: Outcome "Fraud Detection Pipeline" exists with defined KPIs
- **Steps**:
  1. Navigate to the Outcome detail page
  2. Open the "Agent Proposals" tab
  3. Click "Generate Agent Plan"
  4. Wait for AI proposal generation to complete
- **Expected Results**:
  - AI generates a structured plan with:
    - An orchestrator agent proposal
    - One or more worker agent proposals (e.g., "Transaction Screener", "Alert Classifier")
    - An orchestration pattern (Sequential, Parallel, Fan-out, or Supervisor)
  - Each proposed agent shows:
    - Descriptive name and purpose
    - Specific KPI bindings (which KPIs it is responsible for)
    - Inherited risk tier from the outcome
    - Suggested tool requirements
    - Compliance tags propagated from the outcome
  - The plan is saved and visible in the Agent Proposals tab
- **Traceability**: Outcome-to-Agent Traceability, Constraint Propagation

---

**TC-PLAN-002: Create Agents from Approved Plan**
- **Priority**: P0
- **Preconditions**: Agent Development Plan exists for "Fraud Detection Pipeline" outcome
- **Steps**:
  1. Navigate to the Outcome detail page > Agent Proposals tab
  2. Review the proposed agents
  3. Select all proposed agents
  4. Click "Create Selected Agents"
  5. Wait for agent creation to complete
- **Expected Results**:
  - All selected agents are created in the system
  - Each agent has:
    - `outcomeId` linking it to the parent outcome
    - Inherited `riskTier` from the outcome
    - Pre-populated `policyBindings` from the outcome's compliance context
    - Auto-generated system prompt referencing the outcome goal and KPI targets
    - `autonomyMode` set based on risk tier (HIGH risk = "assisted" or "manual")
  - If a Team Agent structure is proposed, a Team Blueprint (DAG) is created
  - Agents appear in the Agents list page
  - Outcome status updated to reflect bound agents
- **Traceability**: Outcome-to-Agent Traceability, Multi-Agent Orchestration

---

**TC-PLAN-003: Constraint Propagation Verification**
- **Priority**: P1
- **Preconditions**: Agents created from outcome "Fraud Detection Pipeline" with HIGH risk tier
- **Steps**:
  1. Navigate to the created agent's detail page
  2. Review the "Configuration" section
  3. Check the Risk Tier, Autonomy Mode, and Policy Bindings
  4. Navigate to the agent's Eval bindings
- **Expected Results**:
  - Agent Risk Tier matches the outcome's HIGH tier
  - Autonomy Mode is restricted (not "autonomous" for HIGH risk)
  - Policy Bindings include at least `data_handling` domain policies
  - Compliance tags include relevant frameworks (e.g., "PCI-DSS", "SOX" for Financial Services)
  - Evaluation thresholds are derived from KPI targets
- **Traceability**: Constraint Propagation, Outcome-to-Agent Traceability

---

## 3. Phase 2: Agent Build & Configuration

### 3.1 Agent Creation Wizard

---

**TC-BUILD-001: Create Agent from Scratch via Wizard**
- **Priority**: P0
- **Preconditions**: User is logged in as Agent Engineer or Admin
- **Steps**:
  1. Navigate to Agents page (/agents)
  2. Click "Create Agent" to launch the wizard
  3. **Step 0 - Define Agent**:
     - Enter Name: "AML Transaction Monitor"
     - Enter Description: "Monitors transactions for anti-money laundering compliance"
     - Select Risk Tier: "HIGH"
     - Select Autonomy Mode: "Assisted"
     - Link to an existing outcome (if available)
  4. **Step 1 - Start Path**: Select "Build from Scratch"
  5. **Step 2 - Configure Tools**: Add at least one MCP tool (e.g., "Transaction Lookup")
  6. **Step 3 - Governance**: Toggle on a policy bundle (e.g., "Financial Compliance")
  7. **Step 4 - Memory & Context**: Configure RAG with default settings
  8. **Step 5 - Eval Suite**: Add one custom test case with input and expected output
  9. **Step 6 - Rollout Plan**: Set Shadow Mode Duration to "24 hours" and Canary Steps
  10. **Step 7 - Review**: Review all configuration
  11. Click "Create Agent"
- **Expected Results**:
  - Job Progress Panel appears showing creation steps (compiling_blueprint, running_eval_cases)
  - Progress bar advances through each step
  - Baseline evaluation runs and shows pass rate, passed count, total cases
  - Expert Validation Gate notice appears for HIGH risk agent
  - Agent is created successfully
  - "View Agent" button navigates to agent detail page
  - All configured values are reflected on the detail page
- **Traceability**: Agent Lifecycle Management, Agent Creation Wizard

---

**TC-BUILD-002: Create Agent with Industry Auto-Configuration**
- **Priority**: P0
- **Preconditions**: User is logged in as Agent Engineer or Admin
- **Steps**:
  1. Navigate to Agents > Create Agent wizard
  2. **Step 0 - Define Agent**:
     - Enter Name: "Claims Processing Assistant"
     - Select Industry: "Insurance"
     - Click "Auto-Configure from Industry" button
  3. Observe the auto-populated fields
  4. Complete remaining wizard steps with defaults
  5. Create the agent
- **Expected Results**:
  - Auto-configuration applies insurance-specific presets:
    - Appropriate model and tool defaults for insurance
    - Insurance-specific guardrails and stop conditions
    - Department set to insurance-relevant option
    - Compliance tags include relevant insurance regulations
  - All auto-populated fields are editable by the user
  - Agent is created with industry-specific configuration
- **Traceability**: Industry Contextualization

---

**TC-BUILD-003: Create Agent from Industry Golden Template**
- **Priority**: P1
- **Preconditions**: User is logged in; industry templates exist in the system
- **Steps**:
  1. Navigate to Agents > Create Agent wizard
  2. **Step 0**: Enter agent name and select industry "Healthcare"
  3. **Step 1 - Start Path**: Select "Start from Industry Golden Template"
  4. Wait for AI template matching to complete
  5. Review suggested templates with match scores
  6. Select the highest-scoring template
  7. Complete wizard and create agent
- **Expected Results**:
  - AI matching suggests templates ranked by relevance score
  - Selected template pre-populates:
    - Tool configurations
    - Policy bindings (HIPAA-related)
    - Memory and RAG settings
    - Evaluation suite with healthcare-specific test cases
  - User can modify any pre-populated field
  - Created agent inherits template configuration
- **Traceability**: Agent Templates, Industry Contextualization

---

**TC-BUILD-004: Create Agent Linked to Outcome**
- **Priority**: P0
- **Preconditions**: Outcome "Automated Customer Support Resolution" exists with KPIs
- **Steps**:
  1. Navigate to Agents > Create Agent wizard
  2. **Step 0**: Enter Name, select "Link to Outcome" and choose the existing outcome
  3. Observe pre-populated fields from the outcome
  4. Complete remaining wizard steps
  5. Create the agent
- **Expected Results**:
  - Risk Tier is pre-populated from the outcome's risk tier
  - Description references the outcome's goal
  - Evaluation thresholds are derived from outcome KPI targets
  - Context banner shows the linked outcome details
  - After creation, agent detail shows `outcomeId` binding
  - Outcome detail page shows this agent as a bound agent
- **Traceability**: Outcome-to-Agent Traceability

---

### 3.2 Blueprint Studio

---

**TC-BUILD-005: Create and Compile a Blueprint**
- **Priority**: P1
- **Preconditions**: Agent "AML Transaction Monitor" exists
- **Steps**:
  1. Navigate to Blueprints page (/blueprints)
  2. Create a new blueprint linked to the agent
  3. Add the following nodes:
     - `llm_call` node: "Analyze Transaction"
     - `tool_call` node: "Lookup Customer History" (linked to MCP tool)
     - `router` node: "Risk Decision"
     - `human_review` node: "Expert Review" (for high-risk decisions)
  4. Connect nodes with edges defining the execution flow
  5. Click "Compile"
- **Expected Results**:
  - Compilation validates the blueprint:
    - No disconnected nodes
    - All tool references resolve to available MCP tools
    - High-risk agent has a `human_review` node (pass)
  - Compiled snapshot captures current MCP tool schemas
  - Blueprint status changes to "compiled"
  - Governance warnings displayed if any policy compatibility issues found
- **Traceability**: Blueprint Studio

---

**TC-BUILD-006: Sign a Compiled Blueprint**
- **Priority**: P1
- **Preconditions**: Blueprint is in "compiled" status; user has Expert Validator or Admin role
- **Steps**:
  1. Navigate to the compiled blueprint
  2. Review the compilation results and any governance warnings
  3. Click "Sign Blueprint"
- **Expected Results**:
  - Blueprint version is incremented
  - Previous version archived in version history
  - Blueprint status changes to "signed"
  - Audit event created for the signing action
  - For HIGH risk agents, an approval gate request is generated
- **Traceability**: Blueprint Studio, Governance

---

### 3.3 MCP Server Integration

---

**TC-BUILD-007: Link MCP Server to Agent with Policy Check**
- **Priority**: P1
- **Preconditions**: Agent exists; MCP server with high-risk tools exists; agent lacks `tool_permissions` policy
- **Steps**:
  1. Navigate to Agent Detail page > Integrations section
  2. Click "Link MCP Server"
  3. Select an MCP server with high-risk/write tools
  4. Confirm the linking
- **Expected Results**:
  - System performs tool-to-policy compatibility check
  - Policy warnings are displayed for high-risk tools without matching policies
  - User must acknowledge warnings before proceeding
  - Audit event `agent.mcp_policy_mismatch` is logged
  - After acknowledgment, MCP server is linked to the agent
  - Tools become available in the agent's blueprint and runtime
- **Traceability**: MCP Tool-to-Policy Compatibility, Proactive Design-Time Enforcement

---

**TC-BUILD-008: MCP Tool Ontology Alignment Check**
- **Priority**: P2
- **Preconditions**: Agent linked to MCP server; industry ontology configured
- **Steps**:
  1. Navigate to Agent Detail > MCP Server section
  2. View the Ontology Readiness panel
  3. Check alignment scores for each linked tool
- **Expected Results**:
  - Each tool shows an ontology alignment percentage
  - Tools below 50% alignment are flagged with warnings
  - Alignment score reflects parameter matching against industry canonical terms
  - For production deployment, tools below threshold would block deployment
- **Traceability**: Ontology Alignment, MCP Governance

---

### 3.4 Knowledge Base Configuration

---

**TC-BUILD-009: Create and Populate Knowledge Base**
- **Priority**: P1
- **Preconditions**: User is logged in as Agent Engineer or Admin
- **Steps**:
  1. Navigate to Knowledge Bases page (/knowledge-bases)
  2. Create new KB: Name "AML Regulations KB", Industry "Financial Services"
  3. Upload a document (PDF or DOCX) containing financial regulation content
  4. Wait for processing (chunking and embedding)
  5. Link the KB to the "AML Transaction Monitor" agent
- **Expected Results**:
  - KB is created with correct industry tag
  - Document is uploaded and processing begins
  - Source shows "processing" then "processed" status
  - Chunk count and token count are populated
  - Ontology alignment score is computed
  - KB appears in the agent's knowledge base bindings
- **Traceability**: Knowledge Base System

---

**TC-BUILD-010: KB Sensitivity Scan on Upload**
- **Priority**: P1
- **Preconditions**: KB linked to agent; agent lacks HIPAA data_handling policy; document contains PHI-related terms
- **Steps**:
  1. Navigate to the KB detail page
  2. Upload a document containing health-related sensitive content (e.g., "patient diagnosis", "medical record number")
  3. Observe the sensitivity scan results
- **Expected Results**:
  - Sensitivity pre-scan detects PHI-class content
  - System checks linked agents for `data_handling` policies covering PHI
  - Warning dialog appears showing sensitivity findings
  - `knowledge.sensitivity_warning` audit event is generated
  - User can acknowledge and proceed or cancel the upload
- **Traceability**: KB Source Sensitivity Validation, Proactive Design-Time Enforcement

---

### 3.5 Context Engineering

---

**TC-BUILD-011: Configure Context Engineering Profile**
- **Priority**: P2
- **Preconditions**: Agent exists with linked KB and MCP tools
- **Steps**:
  1. Navigate to Context Studio (/context-studio)
  2. Select the agent
  3. Review the default context source inventory
  4. Adjust token allocation:
     - Increase "Regulatory Context" allocation to 20,000 tokens
     - Decrease "Conversation History" allocation to 5,000 tokens
  5. Save the profile
- **Expected Results**:
  - Context budget visualization updates in real-time
  - Total allocation does not exceed model capacity (e.g., 128K tokens)
  - Priority ordering reflects the adjustment
  - Context simulation shows the new allocation breakdown per task type
  - Profile is saved and will be used in future agent executions
- **Traceability**: Context Engineering Studio

---

### 3.6 Skill Configuration

---

**TC-BUILD-012: Create and Attach Agent Skill**
- **Priority**: P2
- **Preconditions**: Agent exists; Skill Catalog is accessible
- **Steps**:
  1. Navigate to Skills > Skill Studio (/skills/studio)
  2. Create a new skill:
     - Name: "Suspicious Transaction Escalation"
     - Industry: Financial Services
     - Define trigger conditions, procedures, and edge cases
  3. Run the AI quality scorer
  4. Validate against policies
  5. Save the skill
  6. Attach the skill to the agent
- **Expected Results**:
  - Skill quality score is computed and displayed
  - Policy validation confirms no conflicts
  - Ontology tags are applied based on industry
  - Skill appears in agent's configuration
  - Required MCP tools for the skill are validated as available
- **Traceability**: Agent Skills Library, Skill Studio

---

## 4. Phase 3: Governance & Compliance

### 4.1 Policy Creation and Binding

---

**TC-GOV-001: Create Governance Policy**
- **Priority**: P0
- **Preconditions**: User logged in with Compliance/Security or Admin role
- **Steps**:
  1. Navigate to Governance page (/governance)
  2. Click "Create Policy"
  3. Enter Policy Name: "PCI-DSS Data Handling"
  4. Select Domain: "data_handling"
  5. Select Scope Type: "industry"
  6. Enter policy rules (natural language or OPA Rego)
  7. Activate the policy
- **Expected Results**:
  - Policy is created with version 1
  - Policy status is set to "active"
  - Policy appears in the policies list
  - Audit event generated for policy creation
  - Compliance posture dashboard recalculates framework coverage
- **Traceability**: Governance & Compliance Engine

---

**TC-GOV-002: Bind Policy to Agent**
- **Priority**: P0
- **Preconditions**: Active policy exists; agent exists
- **Steps**:
  1. Navigate to Agent Detail page
  2. Go to Governance/Policy section
  3. Click "Bind Policy"
  4. Select "PCI-DSS Data Handling" policy
  5. Set enforcement level to "hard"
  6. Save the binding
- **Expected Results**:
  - Policy binding appears in agent's `policyBindings`
  - Agent detail shows the bound policy with enforcement level
  - Audit event generated for policy binding
  - Agent's runtime context will now include this policy's rules
- **Traceability**: Policy Binding, Agent Configuration

---

**TC-GOV-003: AI-Enhanced Policy Rule Generation**
- **Priority**: P2
- **Preconditions**: Policy exists in draft form
- **Steps**:
  1. Navigate to Policy Engine (/governance/policy-engine)
  2. Select an existing policy
  3. Click "AI Enhance Rules"
  4. Wait for AI to refine the policy rules
- **Expected Results**:
  - AI generates more specific, measurable rule definitions
  - Enhanced rules maintain the original policy intent
  - User can review and accept/reject the enhancements
  - Version is incremented if changes are accepted
- **Traceability**: AI-Assisted Features, Policy Engine

---

### 4.2 Design-Time Policy Gates

---

**TC-GOV-004: Agent Creation Policy Gate - Missing Required Policy**
- **Priority**: P0
- **Preconditions**: No active HIPAA data_handling policy exists in the workspace
- **Steps**:
  1. Navigate to Agent Wizard
  2. Create a new agent for industry "Healthcare"
  3. Complete all wizard steps
  4. Arrive at Step 7 (Review)
  5. Observe the Governance Readiness panel
- **Expected Results**:
  - Governance Readiness panel shows a warning
  - Required policy for Healthcare/HIPAA is marked as "missing"
  - Compliance readiness score is reduced
  - "Create Agent" button requires governance override acknowledgment
  - Warning text clearly indicates which policies are needed
- **Traceability**: Agent Creation Policy Gate, Proactive Design-Time Enforcement

---

**TC-GOV-005: Agent Creation Policy Gate - All Policies Satisfied**
- **Priority**: P0
- **Preconditions**: Active HIPAA data_handling policy exists in the workspace
- **Steps**:
  1. Navigate to Agent Wizard
  2. Create a new agent for industry "Healthcare"
  3. Complete all wizard steps
  4. Arrive at Step 7 (Review)
- **Expected Results**:
  - Governance Readiness panel shows all requirements satisfied
  - Each required policy is marked with a green check
  - Compliance readiness score is at maximum
  - "Create Agent" button is enabled without override
- **Traceability**: Agent Creation Policy Gate

---

**TC-GOV-006: Blueprint Compilation Policy Compatibility**
- **Priority**: P1
- **Preconditions**: Agent has a blueprint with `tool_call` nodes using PCI-tagged tools; agent lacks `data_handling` policy
- **Steps**:
  1. Navigate to the agent's blueprint
  2. Click "Compile"
  3. Review the compilation results
- **Expected Results**:
  - Compilation generates `policyCompatibility` warnings
  - Warnings identify tool_call nodes handling sensitive data classes without matching policies
  - If `llm_call` nodes lack output filtering and agent has `output_control` policies, additional warnings appear
  - Blueprint signing is gated until warnings are addressed or acknowledged
- **Traceability**: Blueprint Policy Compatibility

---

### 4.3 Compliance Posture Dashboard

---

**TC-GOV-007: View Compliance Posture**
- **Priority**: P1
- **Preconditions**: Multiple policies active; compliance frameworks configured
- **Steps**:
  1. Navigate to Governance page
  2. Click "Compliance Posture" tab
  3. Review the posture dashboard
- **Expected Results**:
  - Each framework shows a coverage score gauge (percentage)
  - Control coverage table lists individual controls with status (covered/gap)
  - Gap controls are highlighted with severity indicators
  - Framework health cards show total controls, covered count, gap count
  - Agent coverage mapping shows which agents satisfy which controls
- **Traceability**: Live Compliance Posture Dashboard

---

**TC-GOV-008: Compliance Posture Updates on Policy Mutation**
- **Priority**: P1
- **Preconditions**: Compliance posture dashboard is visible
- **Steps**:
  1. Open the Compliance Posture tab
  2. Note the current coverage score for a framework
  3. In a new tab, create and activate a new policy covering a gap control
  4. Return to the Compliance Posture tab
  5. Wait for auto-refresh (or trigger manual refresh)
- **Expected Results**:
  - Coverage score increases to reflect the new policy
  - Previously "gap" control now shows as "covered"
  - Framework health card updates counts
  - The newly bound agents appear in the control's agent coverage list
- **Traceability**: Live Compliance Posture Dashboard

---

### 4.4 Approval Workflows

---

**TC-GOV-009: Approval Gate for High-Risk Agent Change**
- **Priority**: P1
- **Preconditions**: HIGH risk agent exists; tool permission expansion is attempted
- **Steps**:
  1. Navigate to Agent Detail
  2. Attempt to expand tool permissions (e.g., add write access)
  3. Observe the approval creation
  4. Navigate to Approvals page (/approvals)
  5. Find the pending approval
  6. Review and approve (as Expert Validator or Admin)
- **Expected Results**:
  - Tool permission change triggers approval gate
  - Pending approval appears with risk score, evidence, and constraints
  - Approval record shows requester, description, and diff summary
  - After approval, tool permissions are updated
  - Audit events generated for both the request and the decision
- **Traceability**: Approval Workflows, Autonomy with Guardrails

---

### 4.5 Audit Trail

---

**TC-GOV-010: Audit Trail Hash Chain Verification**
- **Priority**: P1
- **Preconditions**: Multiple audit events exist in the system
- **Steps**:
  1. Navigate to Audit Trail page (/audit-trail)
  2. Click "Verify Integrity"
  3. Wait for verification to complete
- **Expected Results**:
  - System checks each event's `eventHash` against `previousHash` chain
  - Integrity verification result shows pass/fail
  - If chain is intact, success message displayed
  - If tampered, specific break point identified
  - Verification itself generates an audit event
- **Traceability**: Immutable Audit Log, Hash-Chain Integrity

---

**TC-GOV-011: Regulatory Export Generation**
- **Priority**: P2
- **Preconditions**: Audit events exist for a financial services agent
- **Steps**:
  1. Navigate to Governance page
  2. Select "Regulatory Exports"
  3. Choose format: "FinCEN SAR"
  4. Select date range and relevant agents
  5. Generate the export
- **Expected Results**:
  - Export is generated in the selected regulatory format
  - Content includes relevant audit events mapped to SAR fields
  - Export is downloadable
  - Audit event generated for the export action
- **Traceability**: Regulatory Exports, Audit Trail

---

## 5. Phase 4: Evaluation & Quality Assurance

### 5.1 Eval Suite Management

---

**TC-EVAL-001: Create Eval Suite Linked to Agent**
- **Priority**: P0
- **Preconditions**: Agent "AML Transaction Monitor" exists
- **Steps**:
  1. Navigate to Evaluations page (/evals)
  2. Click "Create Eval Suite"
  3. Enter Name: "AML Regression Suite"
  4. Select Type: "regression"
  5. Link to Agent: "AML Transaction Monitor"
  6. Select Industry: "Financial Services"
  7. Set Environment Thresholds:
     - Staging: 70%
     - Pilot: 85%
     - Production: 95%
  8. Save the suite
- **Expected Results**:
  - Eval suite created and linked to the agent
  - Suite appears on agent detail page under "Evals" tab
  - Environment thresholds are saved correctly
  - Suite appears in the evaluations list page
- **Traceability**: Evaluation Framework

---

**TC-EVAL-002: Add Test Cases to Eval Suite**
- **Priority**: P0
- **Preconditions**: Eval suite "AML Regression Suite" exists
- **Steps**:
  1. Navigate to the eval suite detail page
  2. Click "Add Test Case"
  3. Enter:
     - Name: "Large Cash Deposit Screening"
     - Input: "Customer deposits $12,000 cash at branch counter"
     - Expected Output: "Flag transaction for CTR reporting (>$10K threshold)"
  4. Save the test case
  5. Repeat to add at least 3 more test cases
- **Expected Results**:
  - Each test case is saved with input and expected output
  - Test case count updates in the suite summary
  - Cases appear in the test cases list within the suite
- **Traceability**: Evaluation Framework

---

**TC-EVAL-003: AI-Generate Test Cases for Eval Suite**
- **Priority**: P1
- **Preconditions**: Eval suite exists with agent context
- **Steps**:
  1. Navigate to eval suite detail page
  2. Click "AI Generate Test Cases"
  3. Select count: 10
  4. Wait for generation to complete
- **Expected Results**:
  - AI generates 10 test cases relevant to the agent's purpose and industry
  - Each case has a descriptive name, realistic input, and expected output
  - Cases include a mix of difficulty levels
  - Cases are added to the suite and count updates
- **Traceability**: AI-Assisted Features, Evaluation Framework

---

**TC-EVAL-004: Run Eval Suite and View Results**
- **Priority**: P0
- **Preconditions**: Eval suite has at least 5 test cases
- **Steps**:
  1. Navigate to eval suite detail page
  2. Click "Run Now"
  3. Wait for evaluation to complete
  4. Review results
- **Expected Results**:
  - Run appears in the run history
  - Aggregate pass rate is computed and displayed
  - Individual case results show: input, expected output, actual output, score
  - Scorers (semantic_match, policy_compliance, etc.) show per-case results
  - Pass/fail is determined against environment thresholds
- **Traceability**: Evaluation Framework, Scoring Mechanisms

---

**TC-EVAL-005: Detect Regression Between Eval Runs**
- **Priority**: P1
- **Preconditions**: At least 2 eval runs exist for the same suite
- **Steps**:
  1. Navigate to eval suite detail
  2. Open the "Regression Diff" tab
  3. Select two runs for comparison
- **Expected Results**:
  - Side-by-side comparison shows which cases improved vs. regressed
  - Regression percentage is calculated (cases that previously passed but now fail)
  - If pass rate dropped by more than 2%, suite is flagged in the global regressions view
  - Specific case-level delta shown for each test case
- **Traceability**: Regression Tracking, Evaluation Framework

---

### 5.2 Golden Dataset Management

---

**TC-EVAL-006: Create Golden Dataset**
- **Priority**: P1
- **Preconditions**: User logged in as Agent Engineer or Admin
- **Steps**:
  1. Navigate to Golden Datasets page (/golden-datasets)
  2. Click "Create Dataset"
  3. Enter:
     - Name: "Financial Services - AML Benchmark"
     - Industry: "Financial Services"
     - Use Case: "Anti-Money Laundering"
     - Description: "Ground truth benchmark for AML agent evaluation"
  4. Create the dataset
- **Expected Results**:
  - Dataset is created with correct metadata
  - Test case count starts at 0
  - Dataset appears in the golden datasets list
  - Industry and use case are displayed correctly
- **Traceability**: Golden Dataset Repository

---

**TC-EVAL-007: AI Bulk Generate Golden Test Cases**
- **Priority**: P1
- **Preconditions**: Golden dataset exists
- **Steps**:
  1. Navigate to golden dataset detail page
  2. Click "Generate with AI"
  3. Select count: 25
  4. Wait for generation to complete
- **Expected Results**:
  - 25 test cases are generated, each with:
    - Descriptive name
    - Detailed input scenario
    - Expected behavior
    - Difficulty tier (mix of routine, complex, edge_case, adversarial)
    - Scenario category (mix of happy_path, edge_case, adversarial, compliance_critical)
    - Evaluation criteria with weighted dimensions
    - Rubric scoring
    - Tags
  - Dataset test case count updates to 25
  - Cases are contextually relevant to the dataset's industry and use case
- **Traceability**: AI-Powered Test Case Generation, Golden Datasets

---

**TC-EVAL-008: AI Enhance Draft Test Case**
- **Priority**: P1
- **Preconditions**: Golden dataset exists for Financial Services industry
- **Steps**:
  1. Navigate to golden dataset detail page
  2. Click "Add Test Case"
  3. Enter Name: "Wire Transfer Structuring Detection"
  4. Enter Input Scenario: "Customer makes multiple wire transfers just under $10,000"
  5. Click "AI Enhance" button
  6. Wait for AI enhancement to complete
- **Expected Results**:
  - AI Enhance button shows loading state ("Enhancing with AI...")
  - On completion, all fields are auto-populated:
    - Input Scenario is expanded with realistic context and specifics
    - Expected Behavior is filled with detailed agent response steps
    - Difficulty Tier is selected (likely "complex" or "adversarial")
    - Scenario Category is selected (likely "compliance_critical")
  - Toast notification confirms enhancement
  - Save button becomes enabled (Expected Behavior now populated)
  - Enhanced evaluation criteria, rubric scoring, and tags are included when saved
- **Traceability**: AI Enhance for Test Case Drafts

---

**TC-EVAL-009: AI Enhance Existing Test Case**
- **Priority**: P2
- **Preconditions**: Golden test case exists in a dataset
- **Steps**:
  1. Navigate to golden dataset detail page
  2. Expand an existing test case
  3. Select enhance type: "adversarial"
  4. Click "Enhance" button
  5. Wait for enhancement
- **Expected Results**:
  - Test case is modified to be more adversarial
  - Edge cases and failure modes are introduced
  - Original core intent is preserved
  - Updated fields are saved automatically
  - Query cache is invalidated and UI refreshes
- **Traceability**: AI-Assisted Features, Golden Datasets

---

### 5.3 Production Feedback Loop

---

**TC-EVAL-010: Sync Production Feedback to Eval Suite**
- **Priority**: P1
- **Preconditions**: Outcome has rejected events or billing disputes; eval suite is linked to the agent
- **Steps**:
  1. Navigate to Outcome Detail page
  2. Click "Sync Eval Feedback"
  3. Wait for sync to complete
  4. Navigate to the linked eval suite
- **Expected Results**:
  - Rejected outcome events are imported as new test cases
  - Billing disputes are converted to ground-truth test cases
  - New test cases appear in the eval suite with source attribution
  - Future eval runs include these production-derived cases
  - This ensures failures that caused financial loss become regression tests
- **Traceability**: Production Feedback Loop, Acceptance-Based Ground Truth Flywheel

---

## 6. Phase 5: Deployment & Release Management

### 6.1 Deployment Pipeline

---

**TC-DEPLOY-001: Create Release via Deployment Wizard**
- **Priority**: P0
- **Preconditions**: Agent exists with a signed blueprint and passing eval results
- **Steps**:
  1. Navigate to Deployments page (/deployments)
  2. Click "New Release"
  3. **Step 1 - Source & Target**:
     - Select Agent: "AML Transaction Monitor"
     - Select Target: "staging"
     - Observe Industry Pre-Deploy Check results
  4. **Step 2 - Rollback Safeguards**:
     - Configure auto-rollback triggers (eval_pass_rate_drop, policy_violations)
  5. **Step 3 - Autopromote Rules**:
     - Enable autopromote with eval pass threshold
  6. **Step 4 - Review & Submit**:
     - Review configuration summary
     - Click "Submit Release"
- **Expected Results**:
  - Release is created with "pending" status
  - Industry Pre-Deploy Check validates ontology tags, risk tier, eval suites, and memory governance
  - Deployment appears in the deployments list
  - Pipeline stages are initialized based on industry requirements
  - Audit event generated for deployment creation
- **Traceability**: Deployment Pipeline

---

**TC-DEPLOY-002: Advance Through Pipeline Stages**
- **Priority**: P0
- **Preconditions**: Deployment in "staging" environment; Financial Services industry
- **Steps**:
  1. Navigate to Release Detail page
  2. Observe mandatory pipeline stages for Financial Services:
     - Regulatory Compliance Attestation
     - Suitability Testing
     - Rating Model Validation
  3. Complete each mandatory stage (attestation, testing)
  4. Click "Advance Stage" after each completion
- **Expected Results**:
  - Each stage advances only when prerequisites are met
  - Attestation stages require manual sign-off
  - Testing stages require eval results above threshold
  - Progress indicator shows current stage
  - Evidence items are recorded at each stage
  - After all stages, deployment progresses to the next environment
- **Traceability**: Pipeline Stages, Industry-Governed Deployment

---

**TC-DEPLOY-003: Deployment Rollback**
- **Priority**: P0
- **Preconditions**: Active deployment exists in production
- **Steps**:
  1. Navigate to Release Detail page
  2. Click "Rollback"
  3. Confirm rollback action
- **Expected Results**:
  - Deployment status changes to "rolled_back"
  - Traffic reverts to "Last Known Good Version"
  - Rollback audit event is generated
  - Agent health indicators reflect the rollback
  - Incident record may be auto-created
- **Traceability**: Rollback Mechanisms, Deployment Pipeline

---

**TC-DEPLOY-004: Auto-Rollback on Eval Pass Rate Drop**
- **Priority**: P1
- **Preconditions**: Active deployment with auto-rollback trigger configured for eval_pass_rate_drop; eval pass rate falls below threshold
- **Steps**:
  1. Deploy agent to production with auto-rollback configured
  2. Trigger an eval run that shows a significant pass rate drop
  3. Observe automated rollback behavior
- **Expected Results**:
  - System detects eval pass rate drop below configured threshold
  - Auto-rollback is triggered without manual intervention
  - Deployment status changes to "rolled_back"
  - Alert/incident generated explaining the rollback reason
  - Traffic reverts to the last stable version
  - Audit event logged with rollback trigger details
- **Traceability**: Auto-Rollback Triggers, Eval Gates

---

### 6.2 Shadow Replay

---

**TC-DEPLOY-005: Run Shadow Replay Before Production Promotion**
- **Priority**: P1
- **Preconditions**: Agent has production traces (baseline); new version exists as candidate
- **Steps**:
  1. Navigate to Shadow Replay page (/shadow-replay)
  2. Create a new replay session:
     - Select Baseline: Current production version
     - Select Candidate: New version
     - Select traces to replay
  3. Start the replay
  4. Wait for completion
  5. Review the comparison results
- **Expected Results**:
  - Production traces are replayed through the candidate version
  - Comparison shows per-trace verdicts:
    - `equivalent`, `improved`, `regressed`, or `different_but_acceptable`
  - Aggregate scores for:
    - Regulatory compliance adherence
    - Ontology consistency
    - Output accuracy
    - Safety assessment
  - Any "regressed" verdicts block automatic promotion
  - Replay results become part of the deployment evidence package
- **Traceability**: Shadow Replay Studio

---

### 6.3 Canary Deployment

---

**TC-DEPLOY-006: Canary Deployment with Traffic Graduation**
- **Priority**: P1
- **Preconditions**: Agent deployed to production; canary strategy selected
- **Steps**:
  1. Navigate to Canary Deployment Console (/canary-deployment)
  2. Initiate a canary deployment
  3. Observe the traffic at 1% stage
  4. Wait for observation window
  5. Advance to 5%, then 25%, then 50%, then 100%
- **Expected Results**:
  - Traffic starts at 1% for the candidate version
  - Metrics displayed: error rate, latency, compliance score
  - At each stage, industry safety gates are checked:
    - Financial Services: Max AUM exposure limit enforced
    - Healthcare: Max patient exposure limit enforced
  - Manual or automated advancement based on metrics
  - At 100%, full traffic is on the new version
  - Audit trail records each stage advancement
- **Traceability**: Canary Deployment Console

---

**TC-DEPLOY-007: Canary Rollback on Safety Gate Breach**
- **Priority**: P1
- **Preconditions**: Active canary deployment at 25% traffic
- **Steps**:
  1. Observe the canary deployment metrics
  2. Simulate a safety gate breach (e.g., error rate > 2% for Tech/SaaS)
  3. Observe rollback behavior
- **Expected Results**:
  - Safety gate violation is detected
  - Automated rollback triggers (if configured)
  - Traffic reverts to 0% candidate / 100% baseline
  - Rollback event is logged with breach details
  - Incident is auto-created for investigation
- **Traceability**: Canary Deployment, Auto-Rollback

---

### 6.4 Evidence Packages

---

**TC-DEPLOY-008: Verify Evidence Package Completeness**
- **Priority**: P1
- **Preconditions**: Deployment has progressed through all pipeline stages
- **Steps**:
  1. Navigate to Release Detail page
  2. Open the "Evidence Package" section
  3. Review all collected evidence items
- **Expected Results**:
  - Evidence package includes:
    - Shadow Replay results (if applicable)
    - Canary performance data
    - Golden Dataset evaluation results
    - Approval chain records
    - Policy compliance attestations
    - Audit event logs
  - Each item is linked to its source regulation (e.g., HIPAA, FINRA)
  - Package is exportable for regulatory review
- **Traceability**: Evidence Packages, Deployment Pipeline

---

## 7. Phase 6: Monitoring & Operational Intelligence

### 7.1 Platform Health Monitoring

---

**TC-MON-001: View Platform Health Dashboard**
- **Priority**: P0
- **Preconditions**: Multiple agents are deployed and active
- **Steps**:
  1. Navigate to Overview page (/dashboard)
  2. Review the Platform Pulse Strip
- **Expected Results**:
  - Overall Health percentage is displayed
  - Active Outcomes count is accurate
  - Agents Running count matches active deployments
  - Attention counter shows items requiring action
  - "Needs Attention" section lists specific alerts
- **Traceability**: Platform Health Monitoring

---

**TC-MON-002: Agent Health Score Monitoring**
- **Priority**: P0
- **Preconditions**: Agent is deployed and has run traces
- **Steps**:
  1. Navigate to Agents page
  2. Observe the health score column for each agent
  3. Click on an agent with a health score below 80
  4. Review the health details
- **Expected Results**:
  - Health score (0-100) is displayed for each agent
  - Color coding: Green (>80), Yellow (60-80), Red (<60)
  - Agent detail shows health score breakdown:
    - Uptime contribution
    - Success rate contribution
    - Latency contribution
  - Underperforming agents (<60) are flagged
  - Auto-pause triggers if health breaches outcome risk threshold
- **Traceability**: Health Scores, Agent Monitoring

---

### 7.2 Drift Detection

---

**TC-MON-003: KPI Drift Detection and Diagnosis**
- **Priority**: P1
- **Preconditions**: Agent is deployed; KPI baseline established
- **Steps**:
  1. Navigate to Monitor page (/monitor)
  2. Review drift signals for active agents
  3. Click on a detected drift signal
  4. Review the drift diagnosis
- **Expected Results**:
  - Drift signals show:
    - KPI name and current value vs. baseline
    - Drift percentage
    - Severity (warning, critical)
  - Diagnosis panel shows industry-specific probable causes:
    - Financial Services: "AMA updated CPT billing codes"
    - Healthcare: "Clinical guideline revision"
  - Correlated events (eval failures, KB staleness) are shown
  - Kill-Chain Alert triggered if drift crosses SLA threshold
- **Traceability**: Drift Detection, Kill-Chain Alerts

---

**TC-MON-004: MCP Tool Behavioral Drift Detection**
- **Priority**: P2
- **Preconditions**: Agent using MCP tools with established behavior baseline
- **Steps**:
  1. Navigate to MCP Server detail page
  2. Review tool behavior fingerprints
  3. Check for behavioral drift indicators
- **Expected Results**:
  - Tools show latency baselines (mean/P95/P99)
  - Drift status indicators: `stable`, `warning` (>2x), `drifted` (>3x)
  - Error rate trends displayed
  - `governance.alignment_regression` audit events for drifted tools
  - Continuous assurance loop auto-triggers re-matching
- **Traceability**: Behavior Fingerprinting, MCP Governance

---

### 7.3 Execution Traces

---

**TC-MON-005: View Agent Execution Traces**
- **Priority**: P1
- **Preconditions**: Agent has completed execution runs
- **Steps**:
  1. Navigate to Agent Detail > Traces section
  2. Select a recent trace
  3. Review trace details
- **Expected Results**:
  - Trace shows:
    - Start/end timestamps and duration
    - Input summary and output summary
    - Status (completed, failed, etc.)
    - Cost (USD) and latency (ms)
    - Token usage breakdown
  - Expandable steps show:
    - LLM calls with prompts and responses
    - Tool calls with parameters and results
    - Policy checks with pass/fail results
  - MCP span waterfall visualization shows timing
  - Provenance hash available for integrity verification
- **Traceability**: Traces & Provenance, Agent Runtime

---

**TC-MON-006: Trace Provenance Verification**
- **Priority**: P2
- **Preconditions**: Trace exists with provenance data
- **Steps**:
  1. Navigate to a specific trace
  2. Click "View Provenance"
  3. Review the provenance snapshot
  4. Click "Verify Integrity"
- **Expected Results**:
  - Provenance shows:
    - Blueprint version used
    - KB retrieval records
    - Tool fingerprints at execution time
    - Active policy snapshot
    - Context profile configuration
    - Memory IDs referenced
    - Industry context and ontology concepts
  - Integrity verification confirms the provenance hash
  - Diff view available between this trace and previous executions
- **Traceability**: End-to-End Provenance Graph

---

### 7.4 Autonomy & Oversight

---

**TC-MON-007: Oversight Console Decision Review**
- **Priority**: P1
- **Preconditions**: Agent has pending decisions requiring expert review
- **Steps**:
  1. Navigate to Oversight Console (/oversight-console)
  2. Review the live decision queue
  3. Select a high-risk pending decision
  4. Review the reasoning chain and regulatory alignment
  5. Approve the decision with a precedent rule
- **Expected Results**:
  - Decision queue shows items sorted by composite risk score
  - Selected decision displays:
    - Agent's reasoning chain and thought process
    - Relevant policies and regulatory controls
    - AI "second opinion" analysis
    - Historical precedents
  - "Approve with Precedent" creates a rule for future auto-approval
  - Validation is recorded in decision quality profile
  - Autonomy calibration is updated based on the decision outcome
- **Traceability**: Oversight Console, Autonomy Engine

---

**TC-MON-008: Autonomy Boundary Proposal Review**
- **Priority**: P2
- **Preconditions**: Agent has significant decision history (>50 validated decisions with >95% accuracy)
- **Steps**:
  1. Navigate to Autonomy Engine (/autonomy-engine)
  2. Review the calibration summary
  3. Check for boundary expansion proposals
  4. Review and approve a proposal
- **Expected Results**:
  - Maturity leaderboard shows agents ranked by accuracy
  - Boundary proposal suggests expanding autonomy level (e.g., "Confirm Before" -> "Log Only")
  - Proposal shows supporting evidence (accuracy rate, total decisions, trend)
  - After approval, agent's autonomy level is updated
  - Audit event records the boundary change
- **Traceability**: Adaptive Autonomy Calibration Engine

---

## 8. Phase 7: Continuous Improvement & Healing

### 8.1 Self-Healing Operations

---

**TC-HEAL-001: Healing Pipeline Detection and Diagnosis**
- **Priority**: P1
- **Preconditions**: Agent experiencing performance degradation (failing evals or increased errors)
- **Steps**:
  1. Navigate to Healing Operations (/healing-operations)
  2. Observe active healing pipelines
  3. Select a pipeline in "Detected" or "Diagnosed" stage
  4. Click "AI Diagnose" to trigger root cause analysis
  5. Review the diagnosis
- **Expected Results**:
  - Healing pipeline shows lifecycle: Detected -> Diagnosed -> Hypothesis -> Experiment -> Verified -> Resolved
  - AI diagnosis classifies the root cause into categories:
    - knowledge_base_staleness
    - tool_schema_change
    - context_window_overflow
    - model_drift
  - Evidence is correlated across eval history, KB freshness, ontology revalidation, and MCP fingerprints
  - Remediation recommendations are generated
- **Traceability**: Self-Healing, Root Cause Classification Engine

---

**TC-HEAL-002: KB Staleness Detection and Remediation**
- **Priority**: P1
- **Preconditions**: KB source is older than staleness threshold (90 days default)
- **Steps**:
  1. Navigate to Knowledge Base detail page
  2. Click "Check Staleness"
  3. Review staleness results
  4. Reprocess a stale source
- **Expected Results**:
  - Sources are classified: fresh, stale, critical
  - Stale sources show freshness badges with time since last update
  - Staleness impact analysis shows affected agents
  - Affected agents are flagged with `requiresRevalidation`
  - `knowledge.staleness_detected` audit events generated
  - Reprocessing a source restores its freshness status
- **Traceability**: Knowledge Staleness Tracking

---

**TC-HEAL-003: RAG Pipeline Auto-Tuning**
- **Priority**: P2
- **Preconditions**: KB has been used for multiple agent runs with retrieval telemetry
- **Steps**:
  1. Navigate to KB detail > Configuration tab > Pipeline Tuning section
  2. Click "Analyze & Recommend"
  3. Review the tuning recommendations
  4. Apply a recommendation
- **Expected Results**:
  - Analysis shows metrics:
    - Average similarity score
    - Retrieval utilization (% chunks >0.7 similarity)
    - Context overflow signals
  - Recommendations include:
    - chunkSize adjustment (with confidence level)
    - chunkOverlap adjustment
    - retrievalTopK adjustment
  - Applying a recommendation:
    - Updates KB configuration
    - `knowledge.pipeline_auto_tuned` audit event generated
    - Future retrievals use updated parameters
- **Traceability**: RAG Pipeline Auto-Tuning

---

**TC-HEAL-004: Context Engineering Auto-Adjustment**
- **Priority**: P2
- **Preconditions**: Agent has failed runs attributable to context issues
- **Steps**:
  1. Observe healing pipeline diagnosing "context_window_overflow"
  2. Review the context adjustment recommendations
  3. Apply the recommended changes
- **Expected Results**:
  - System identifies context-related failure patterns
  - Recommendations suggest priority and token allocation changes
  - After applying, context profile is updated
  - Future runs use the optimized context allocation
  - Improvement is measurable in subsequent eval runs
- **Traceability**: Context Engineering Auto-Adjustment

---

### 8.2 Improvement Cycles

---

**TC-HEAL-005: Continuous Improvement Loop**
- **Priority**: P1
- **Preconditions**: Agent has drift signals or eval regressions
- **Steps**:
  1. Navigate to Improvement Loop (/improvement-loop)
  2. Observe the improvement cycle stages: Detect -> Analyze -> Evaluate -> Decide
  3. Review a current improvement recommendation
- **Expected Results**:
  - Detection phase shows identified issues (drift, regression, failures)
  - Analysis phase shows AI-proposed patches (prompt optimization, model upgrade, config tuning)
  - Evaluate phase shows proposed changes tested via eval suites and shadow replay
  - Decide phase:
    - Low-risk changes (80%): Auto-applied with audit trail
    - High-risk changes (20%): Escalated to Expert Validators
  - Improvement cycle records outcome and feeds back into the system
- **Traceability**: Continuous Improvement Loop, 80/20 Autonomous Validation

---

### 8.3 Usage Analytics

---

**TC-HEAL-006: KB Usage Analytics and Dead Knowledge Detection**
- **Priority**: P2
- **Preconditions**: KB has been in use for 30+ days; some sources have never been retrieved
- **Steps**:
  1. Navigate to KB detail > Usage Analytics tab
  2. Review per-source retrieval statistics
  3. Identify dead knowledge sources
- **Expected Results**:
  - Per-source retrieval bars show usage frequency
  - Sources with 0 retrievals in 30+ days flagged as "dead knowledge"
  - Summary metrics: total retrievals, active sources, dead sources
  - Dead knowledge warnings suggest cleanup or investigation
- **Traceability**: KB Usage Analytics & Dead Knowledge Detection

---

## 9. Cross-Cutting Concerns

### 9.1 Role-Based Access Control

---

**TC-RBAC-001: Permission Enforcement - Agent Engineer Cannot Access Billing**
- **Priority**: P0
- **Preconditions**: User logged in with Agent Engineer role
- **Steps**:
  1. Attempt to navigate to Billing page (/billing)
  2. Attempt to navigate to Outcomes page (/outcomes)
- **Expected Results**:
  - Billing page is not accessible (route not in sidebar, navigation blocked)
  - Outcomes page may be inaccessible or read-only depending on role definition
  - Sidebar only shows routes permitted for Agent Engineer
- **Traceability**: RBAC, Route Guarding

---

**TC-RBAC-002: Data Redaction by Role**
- **Priority**: P1
- **Preconditions**: Run traces exist with financial and PII data
- **Steps**:
  1. Log in as Agent Engineer (R1 redaction)
  2. View a run trace with PII content
  3. Log in as Finance role (R2 redaction)
  4. View the same trace
  5. Log in as Admin (R0 redaction)
  6. View the same trace
- **Expected Results**:
  - Agent Engineer (R1): PII (emails, SSNs, phone numbers) and identity keys are redacted
  - Finance (R2): PII, identity, financial data (costUsd, revenue), and sensitive config are redacted
  - Admin (R0): No redaction, full data visibility
  - Redaction is applied server-side before data reaches the client
- **Traceability**: Redaction Levels, RBAC

---

### 9.2 Cost Attribution

---

**TC-COST-001: View Cost Attribution for Agent**
- **Priority**: P1
- **Preconditions**: Agent has completed multiple runs with tool calls
- **Steps**:
  1. Navigate to agent detail page
  2. Review cost metrics
  3. Navigate to Billing page > Margins tab
- **Expected Results**:
  - Agent shows:
    - Cost per run (LLM + Tool + Infrastructure overhead)
    - Monthly cost total
    - Monthly revenue (if linked to outcome)
  - Margin analysis shows:
    - Revenue vs. cost-to-serve per outcome
    - Margin percentage
    - Monthly trend
  - If margin is negative, "Critical" alert is generated
  - Cost attribution chain is traceable: Traces -> Agents -> Outcomes
- **Traceability**: Cost Attribution Chain, Margin Analysis

---

### 9.3 Context Window Economics

---

**TC-COST-002: Context ROI Analysis**
- **Priority**: P2
- **Preconditions**: Agent has multiple runs with context economics data
- **Steps**:
  1. Access context economics ROI data for the agent
  2. Review per-category ROI scores
  3. Generate optimization recommendations
- **Expected Results**:
  - Each context category shows:
    - Average token count
    - Average cost
    - Quality contribution
    - ROI score
    - Trend (improving, stable, declining)
  - Context cliff detection identifies optimal token count
  - Recommendations identify low-ROI categories consuming disproportionate budget
  - Source attribution ranks KB sources by their quality contribution
- **Traceability**: Context Window Economics Engine

---

### 9.4 Agent API Gateway

---

**TC-API-001: Test Agent via Playground**
- **Priority**: P1
- **Preconditions**: Agent is deployed and active
- **Steps**:
  1. Navigate to Agent Detail > Playground
  2. Start a new session
  3. Send a chat message: "What are the AML screening requirements for wire transfers over $3,000?"
  4. Review the response
- **Expected Results**:
  - Agent processes the message and returns a response
  - Tool calls (if any) are visible in the session
  - Response is contextually relevant to the agent's domain
  - Session is recorded and visible in session history
  - Response time and token usage are displayed
- **Traceability**: Agent API Gateway, Agent Playground

---

### 9.5 Multi-Industry Selection

---

**TC-CROSS-001: Cross-Industry Dropdown Availability**
- **Priority**: P1
- **Preconditions**: User navigates to any page with industry selection
- **Steps**:
  1. Navigate to Golden Datasets > Create Dataset
  2. Open the Industry dropdown
  3. Repeat for: Healing Operations, Runbook Automation, Canary Deployment, Agent Wizard, Policy Engine, Skill Studio
- **Expected Results**:
  - All industry dropdowns include the full set:
    - Healthcare
    - Financial Services
    - Manufacturing
    - Insurance
    - Retail
    - Technology/SaaS
    - Cross-Industry
  - Selection is consistent across all pages
  - Industry selection triggers appropriate context changes (presets, ontology, etc.)
- **Traceability**: Cross-Industry Workspace

---

## 10. Industry-Specific Test Scenarios

### 10.1 Healthcare Vertical

---

**TC-IND-HC-001: Healthcare Agent End-to-End Lifecycle**
- **Priority**: P0
- **Preconditions**: HIPAA data_handling policy exists and is active
- **Steps**:
  1. **Outcome**: Create "Patient Triage Automation" outcome with KPIs: Triage Accuracy >95%, PHI Compliance 100%
  2. **Build**: Generate Agent Plan from outcome; create Healthcare agent with:
     - Industry: Healthcare
     - HIPAA policy binding
     - KB with clinical guidelines
     - Blueprint with `human_review` node for critical decisions
  3. **Govern**: Verify governance readiness shows HIPAA compliance satisfied
  4. **Eval**: Create eval suite with healthcare-specific test cases (PHI redaction, clinical accuracy)
  5. **Deploy**: Deploy with mandatory Clinical Safety Review and HIPAA Attestation stages
  6. **Monitor**: Verify PHI redaction in traces, patient safety metrics
- **Expected Results**:
  - Agent correctly binds to HIPAA policies
  - Blueprint compilation validates human_review node exists for HIGH risk
  - Eval suite includes PHI redaction scoring
  - Deployment requires Clinical Safety Review stage
  - Canary deployment enforces max patient exposure limits
  - Traces show PHI data is properly redacted for non-Admin roles
  - Memory governance enforces HIPAA retention (6 years)
- **Traceability**: Healthcare Vertical, HIPAA Compliance

---

### 10.2 Financial Services Vertical

---

**TC-IND-FS-001: Financial Services Agent End-to-End Lifecycle**
- **Priority**: P0
- **Preconditions**: PCI-DSS and SOX policies exist and are active
- **Steps**:
  1. **Outcome**: Create "AML Transaction Monitoring" outcome with KPIs: Detection Rate >98%, False Positive Rate <5%, Reporting Latency <30min
  2. **Build**: Generate Agent Plan; create Financial Services agent with:
     - Industry: Financial Services
     - PCI-DSS and SOX policy bindings
     - KB with AML regulations and compliance guidelines
     - MCP tools for transaction lookup and screening
  3. **Govern**: Verify PCI-DSS and SOX prerequisites satisfied in wizard review
  4. **Eval**: Create eval suite with financial-specific test cases:
     - CTR threshold detection ($10K+ cash)
     - Structuring pattern recognition
     - Sanctions list screening
  5. **Deploy**: Deploy with mandatory Regulatory Compliance Attestation and Suitability Testing stages
  6. **Monitor**: Verify AML metrics, transaction monitoring accuracy
- **Expected Results**:
  - Agent binds to PCI-DSS and SOX policies
  - Tool-to-policy compatibility verified for financial tools
  - Deployment pipeline includes Financial Services mandatory stages
  - Canary deployment enforces Max AUM exposure limits
  - Audit events are exportable in FinCEN SAR format
  - Memory governance enforces SOX retention (7 years)
  - Cost attribution shows cost-per-screening metric
- **Traceability**: Financial Services Vertical, PCI-DSS/SOX Compliance

---

### 10.3 Manufacturing Vertical

---

**TC-IND-MF-001: Manufacturing Agent Lifecycle**
- **Priority**: P1
- **Preconditions**: ISA 62443 policy exists
- **Steps**:
  1. **Outcome**: Create "Predictive Maintenance Automation" with KPIs: Equipment Uptime >99.5%, False Alarm Rate <2%
  2. **Build**: Create Manufacturing agent with ISA 62443 policy binding
  3. **Govern**: Verify ISA 62443 prerequisites in wizard
  4. **Eval**: Create eval suite with manufacturing scenarios (equipment failure prediction, safety compliance)
  5. **Deploy**: Deploy with manufacturing-specific pipeline stages
  6. **Monitor**: Track equipment safety metrics and autonomy boundaries
- **Expected Results**:
  - Agent correctly applies manufacturing industry presets
  - Autonomy risk dimensions include "Equipment Criticality" and "Safety Impact"
  - Deployment enforces manufacturing safety gates
  - Drift detection monitors equipment-specific KPIs
- **Traceability**: Manufacturing Vertical, ISA 62443

---

### 10.4 Insurance Vertical

---

**TC-IND-IN-001: Insurance Agent Lifecycle**
- **Priority**: P1
- **Preconditions**: Insurance data_handling policy exists
- **Steps**:
  1. **Outcome**: Create "Claims Processing Automation" with KPIs: Processing Time <24hrs, Accuracy >97%, Fraud Detection Rate >90%
  2. **Build**: Create Insurance agent with appropriate policy bindings
  3. **Govern**: Verify industry prerequisites; bind claims-specific policies
  4. **Eval**: Create eval suite with insurance scenarios (claims assessment, fraud detection, coverage determination)
  5. **Deploy**: Deploy with insurance-specific safety gates
  6. **Monitor**: Track claims accuracy, fraud detection metrics, and processing times
- **Expected Results**:
  - Agent applies insurance industry presets
  - Risk dimensions include "Claim Value" and "Fraud Indicator Score"
  - Eval suite includes compliance_critical test cases for regulated decisions
  - Canary deployment respects claim volume exposure limits
- **Traceability**: Insurance Vertical

---

### 10.5 Retail Vertical

---

**TC-IND-RT-001: Retail Agent Lifecycle**
- **Priority**: P1
- **Preconditions**: PCI-DSS data_handling policy exists for payment data
- **Steps**:
  1. **Outcome**: Create "Customer Service Automation" with KPIs: Resolution Rate >85%, CSAT >4.5/5, Response Time <30s
  2. **Build**: Create Retail agent with PCI-DSS binding for payment queries
  3. **Govern**: Verify PCI-DSS prerequisites for retail
  4. **Eval**: Create eval suite with retail scenarios (product inquiry, order status, refund processing, payment issue handling)
  5. **Deploy**: Deploy with retail-appropriate pipeline
  6. **Monitor**: Track customer satisfaction, resolution rates, and PCI compliance
- **Expected Results**:
  - Agent handles payment-related queries with PCI-DSS compliance
  - Sensitivity scan detects PCI data in KB uploads
  - Eval includes payment data handling test cases
  - Canary measures customer impact and CSAT scores
- **Traceability**: Retail Vertical, PCI-DSS

---

### 10.6 Technology/SaaS Vertical

---

**TC-IND-TS-001: Technology/SaaS Agent Lifecycle**
- **Priority**: P1
- **Preconditions**: SOC 2 and EU AI Act policies exist
- **Steps**:
  1. **Outcome**: Create "DevOps Incident Response" with KPIs: MTTR <15min, Incident Resolution Rate >90%, False Alert Rate <5%
  2. **Build**: Create Technology/SaaS agent with SOC 2 and EU AI Act bindings
  3. **Govern**: Verify SOC 2 and EU AI Act prerequisites
  4. **Eval**: Create eval suite with tech scenarios (incident classification, runbook execution, alert correlation)
  5. **Deploy**: Deploy with SOC 2 Control Validation and Data Privacy Review stages
  6. **Monitor**: Track MTTR, incident resolution, and error rate ceiling (2%)
- **Expected Results**:
  - Agent applies Tech/SaaS industry presets
  - Deployment includes SOC 2 and GDPR pipeline stages
  - Canary rollback triggers on error rate > 2%
  - EU AI Act risk classification applied
- **Traceability**: Technology/SaaS Vertical, SOC 2/EU AI Act

---

## Appendix A: Test Data Requirements

### Required Outcome Contracts
1. "Automated Customer Support Resolution" - MEDIUM risk, Retail/Tech
2. "Fraud Detection Pipeline" - HIGH risk, Financial Services
3. "Patient Triage Automation" - HIGH risk, Healthcare
4. "Claims Processing Automation" - MEDIUM risk, Insurance
5. "Predictive Maintenance Automation" - MEDIUM risk, Manufacturing
6. "DevOps Incident Response" - LOW risk, Technology/SaaS

### Required Policies
1. HIPAA Data Handling - Healthcare, domain: data_handling
2. PCI-DSS Data Handling - Financial Services/Retail, domain: data_handling
3. SOX Audit Compliance - Financial Services, domain: audit_compliance
4. ISA 62443 Data Handling - Manufacturing, domain: data_handling
5. SOC 2 Data Handling - Technology/SaaS, domain: data_handling
6. EU AI Act Compliance - Cross-Industry, domain: model_governance

### Required MCP Servers
1. Transaction Lookup Server (Financial Services tools)
2. Patient Records Server (Healthcare tools)
3. Claims Processing Server (Insurance tools)
4. Equipment Monitoring Server (Manufacturing tools)
5. Customer Service Server (Retail tools)

### Required Knowledge Bases
1. AML Regulations KB (Financial Services)
2. Clinical Guidelines KB (Healthcare)
3. Insurance Policy KB (Insurance)
4. Equipment Maintenance KB (Manufacturing)
5. Product Catalog KB (Retail)

---

## Appendix B: Test Execution Order

### Recommended Execution Sequence

**Phase 1 - Foundation (P0 tests first)**:
1. TC-OUT-001, TC-OUT-002 (Create outcomes)
2. TC-PLAN-001, TC-PLAN-002, TC-PLAN-003 (Agent planning)
3. TC-BUILD-001, TC-BUILD-002, TC-BUILD-004 (Agent creation)

**Phase 2 - Build Intelligence**:
4. TC-BUILD-005, TC-BUILD-006 (Blueprint)
5. TC-BUILD-007, TC-BUILD-009, TC-BUILD-010 (MCP & KB)
6. TC-BUILD-011, TC-BUILD-012 (Context & Skills)

**Phase 3 - Governance Layer**:
7. TC-GOV-001 through TC-GOV-006 (Policy creation and gates)
8. TC-GOV-007 through TC-GOV-011 (Posture and audit)

**Phase 4 - Quality Assurance**:
9. TC-EVAL-001 through TC-EVAL-005 (Eval suites)
10. TC-EVAL-006 through TC-EVAL-010 (Golden datasets and feedback)

**Phase 5 - Deployment**:
11. TC-DEPLOY-001 through TC-DEPLOY-008 (Pipeline, shadow, canary, evidence)

**Phase 6 - Operations**:
12. TC-MON-001 through TC-MON-008 (Monitoring, drift, oversight)
13. TC-HEAL-001 through TC-HEAL-006 (Healing and improvement)

**Phase 7 - Cross-Cutting & Industry**:
14. TC-RBAC-001, TC-RBAC-002 (Access control)
15. TC-COST-001, TC-COST-002 (Cost and economics)
16. TC-IND-* (Industry-specific end-to-end)

---

## Appendix C: Test Metrics Summary

| Category | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| Outcome & Planning | 3 | 1 | 0 | 0 | 4 |
| Agent Build | 3 | 5 | 4 | 0 | 12 |
| Governance & Compliance | 3 | 6 | 2 | 0 | 11 |
| Evaluation & QA | 2 | 6 | 2 | 0 | 10 |
| Deployment & Release | 1 | 6 | 0 | 0 | 7 |
| Monitoring & Operations | 1 | 5 | 2 | 0 | 8 |
| Healing & Improvement | 0 | 3 | 3 | 0 | 6 |
| Cross-Cutting | 1 | 3 | 1 | 0 | 5 |
| Industry-Specific | 2 | 4 | 0 | 0 | 6 |
| **Total** | **16** | **39** | **14** | **0** | **69** |

---

*This test case document provides comprehensive coverage of the Outcome-to-Agent lifecycle, from business goal definition through continuous operational improvement. Test cases should be executed in the recommended sequence to build upon prerequisite data and configurations. Each test case maps directly to product features documented in ProductDocumentation.md.*
