# Nous Agent Orchestrator - Product Documentation

**Version:** 1.0
**Last Updated:** March 2, 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Industry Verticals](#3-industry-verticals)
4. [Role-Based Access Control (RBAC)](#4-role-based-access-control-rbac)
5. [Agent Lifecycle Management](#5-agent-lifecycle-management)
6. [Blueprint Studio](#6-blueprint-studio)
7. [Agent Runtime Engine](#7-agent-runtime-engine)
8. [MCP Server Integration Layer](#8-mcp-server-integration-layer)
9. [Knowledge Base System](#9-knowledge-base-system)
10. [Evaluation Framework](#10-evaluation-framework)
11. [Golden Dataset Repository](#11-golden-dataset-repository)
12. [Deployment Pipeline](#12-deployment-pipeline)
13. [Shadow Replay Studio](#13-shadow-replay-studio)
14. [Canary Deployment Console](#14-canary-deployment-console)
15. [Governance & Compliance Engine](#15-governance--compliance-engine)
16. [Autonomy Engine & Oversight Console](#16-autonomy-engine--oversight-console)
17. [Self-Healing & Operational Intelligence](#17-self-healing--operational-intelligence)
18. [Context Engineering Studio](#18-context-engineering-studio)
19. [Agent Skills Library](#19-agent-skills-library)
20. [Multi-Agent Orchestration](#20-multi-agent-orchestration)
21. [Outcome Contract Engine](#21-outcome-contract-engine)
22. [Billing & Revenue Operations](#22-billing--revenue-operations)
23. [Ontology Explorer](#23-ontology-explorer)
24. [Agent API Gateway](#24-agent-api-gateway)
25. [Audit Trail & Provenance](#25-audit-trail--provenance)
26. [AI-Assisted Features](#26-ai-assisted-features)
27. [Database Schema Overview](#27-database-schema-overview)
28. [API Reference Summary](#28-api-reference-summary)
29. [Technology Stack](#29-technology-stack)

---

## 1. Executive Summary

Nous Agent Orchestrator is an enterprise-grade AI agent lifecycle management platform designed for autonomous execution with expert validation. The platform integrates compliance frameworks, governance policies, and industry-specific ontologies into every stage of AI agent behavior -- from design and deployment to monitoring and continuous improvement.

The platform operates on an **80% Autonomous / 20% Expert Validation** philosophy, where AI agents handle routine operations autonomously while high-risk decisions are escalated to qualified human experts for validation.

### Core Value Proposition

- **Full Agent Lifecycle Coverage**: Creation, configuration, deployment, monitoring, healing, and retirement of AI agents
- **Industry-Governed Operations**: Six industry verticals with sector-specific compliance frameworks, safety controls, and regulatory enforcement
- **Outcome-Based Economics**: Shift from compute-time billing to value-delivered billing tied to measurable business outcomes
- **Proactive Governance**: Design-time policy enforcement, runtime compliance checks, and continuous posture monitoring
- **Closed-Loop Improvement**: Production feedback, evaluation-driven optimization, and autonomous healing pipelines

### Supported Industry Verticals

| Industry | Key Regulations | Primary Use Cases |
|---|---|---|
| Healthcare | HIPAA, FDA AI/ML | Patient triage, clinical decision support, PHI handling |
| Financial Services | PCI DSS, SOX, GLBA, MiFID II | AML screening, fraud detection, trade compliance |
| Manufacturing | ISA 62443 | Quality control, supply chain optimization, predictive maintenance |
| Insurance | State regulations, NAIC | Claims processing, underwriting, risk assessment |
| Retail | PCI DSS, consumer protection | Customer service, inventory management, personalization |
| Technology/SaaS | SOC 2, EU AI Act | DevOps automation, content moderation, support triage |

---

## 2. System Architecture

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, wouter (routing) |
| Backend | Express.js (Node.js), TypeScript |
| Database | PostgreSQL with Drizzle ORM |
| Vector Search | pgvector (similarity search for RAG) |
| AI Provider | OpenAI (GPT-4o-mini, GPT-4.1) |
| Protocol | Model Context Protocol (MCP) for tool integration |

### Design Principles

- **Outcome-First Navigation**: UI organized around KPI delivery and business results
- **Evidence-by-Default**: All approvals and changes require evidence packages and blast radius analysis
- **Autonomy with Guardrails**: Policy checks at every enforcement point with soft-block overrides
- **Time Travel**: Full agent timeline reconstruction and audit event history
- **Minimal Context Pollution**: Context engineering treats the LLM context window as a scarce, optimizable resource

### High-Level Architecture

```
+------------------+     +-------------------+     +------------------+
|   React Frontend |<--->|  Express Backend   |<--->|   PostgreSQL     |
|   (Vite + SPA)   |     |  (REST API)        |     |   (+ pgvector)   |
+------------------+     +-------------------+     +------------------+
                                |
                    +-----------+-----------+
                    |                       |
              +-----v------+        +------v------+
              |   OpenAI   |        |  MCP Servers |
              |   (LLM)    |        |  (Tools)     |
              +------------+        +-------------+
```

---

## 3. Industry Verticals

Each industry vertical provides:

- **Industry-Specific Ontology**: Canonical terminology, data sensitivity classifications, and regulatory vocabulary
- **Compliance Framework Mapping**: Pre-configured regulatory controls (HIPAA, PCI DSS, SOX, etc.)
- **Deployment Safety Gates**: Mandatory pipeline stages tailored to industry risk profiles
- **Autonomy Risk Dimensions**: Industry-specific factors for autonomy calibration (e.g., "Transaction Value" for Finance, "Patient Acuity" for Healthcare)
- **Evaluation Dimensions**: Sector-specific scoring criteria (e.g., "PHI Redaction" for Healthcare, "Regulatory Compliance" for Finance)

### Industry Policy Requirements

The platform enforces industry-specific policy prerequisites at agent creation time:

| Industry | Required Policy Domains | Applicable Regulations |
|---|---|---|
| Healthcare | `data_handling` | HIPAA |
| Financial Services | `data_handling`, `audit_compliance` | PCI-DSS, GLBA, SOX |
| Insurance | `data_handling` | State Insurance Regulations |
| Manufacturing | `data_handling` | ISA 62443 |
| Retail | `data_handling` | PCI-DSS |
| Technology/SaaS | `data_handling` | SOC 2, EU AI Act |

---

## 4. Role-Based Access Control (RBAC)

### Roles

The platform defines seven distinct roles with specific permissions and data visibility:

| Role | Purpose | Redaction Level |
|---|---|---|
| **Admin** | Full platform access, user management, system configuration | R0 (None) |
| **Outcome Owner** | Business KPIs, ROI monitoring, outcome contract management | R2 (High) |
| **Agent Engineer** | Agent design, blueprints, tools, evaluation suites | R1 (Partial) |
| **Ops / SRE** | Monitoring, incidents, deployments, cost controls | R1 (Partial) |
| **Compliance / Security** | Policy authoring, audit exports, access controls | R0 (None) |
| **Expert Validator** | Approval of high-risk changes, trace validation | R1 (Partial) |
| **Finance** | Billing rules, outcome metering, dispute management | R2 (High) |

### Redaction Levels

Data sensitivity is enforced through three tiers of redaction:

- **R0 (None)**: Full visibility into all data including PII, financial data, and policy definitions
- **R1 (Partial)**: Redacts PII (emails, SSNs, phone numbers) and identity keys (actorId, owner)
- **R2 (High)**: Redacts PII, identity keys, financial data (costUsd, revenue), and sensitive configuration (payload, policyJson)

### Permission Matrix

Key permission actions include:

| Action | Admin | Outcome Owner | Agent Engineer | Ops/SRE | Compliance | Expert Validator | Finance |
|---|---|---|---|---|---|---|---|
| Create/Modify Outcomes | Full | Full | Denied | Denied | Denied | Denied | Conditional |
| Create/Modify Blueprints | Full | Denied | Full | Denied | Denied | Denied | Denied |
| Deploy to Staging/Pilot | Full | Denied | Full | Full | Denied | Denied | Denied |
| Deploy to Production | Full | Denied | Conditional | Full | Denied | Full | Denied |
| Create/Modify Policies | Full | Denied | Denied | Denied | Full | Denied | Denied |
| View Traces | Full | Conditional | Full | Full | Full | Full | Denied |
| Export Audit Bundle | Full | Denied | Denied | Denied | Full | Conditional | Denied |
| Approve Changes | Full | Full | Denied | Conditional | Full | Full | Denied |
| Billing/Invoices | Full | Full | Denied | Denied | Denied | Denied | Full |
| Manage MCP Servers | Full | Denied | Full | Full | Conditional | Denied | Denied |

### Enforcement

- **Backend**: Middleware (`checkPermission`) extracts the user role from request headers and enforces access checks. Data is redacted via `redactPayload()` before response.
- **Frontend**: Route guarding via `RoleProvider`, conditional UI rendering via `PermissionGate` component and `usePermission` hook. The `X-Role` header is automatically attached to every API request.

---

## 5. Agent Lifecycle Management

### Agent Creation Wizard

The agent creation wizard provides a guided, multi-step workflow:

1. **Basic Information**: Name, description, owner, department
2. **Industry Selection**: Assigns industry-specific ontology, compliance frameworks, and deployment defaults
3. **Capability Configuration**: Model selection, tool access class, system prompt
4. **Policy Binding**: Attach governance policies to the agent
5. **Evaluation Binding**: Link evaluation suites and golden datasets
6. **Memory & Context**: Configure memory architecture and RAG pipeline
7. **Review & Governance Readiness**: Design-time policy gate validation with override capability

### Agent Types

- **Single Agent**: Standard autonomous agent with direct tool access
- **Team Agent**: Orchestrator that coordinates multiple worker agents

### Agent Configuration

Each agent maintains comprehensive configuration:

- **Blueprint**: Visual workflow definition (nodes and edges)
- **Tool Configuration**: Permitted MCP tools and access classes
- **Policy Bindings**: Attached governance policies with domain and scope
- **Eval Bindings**: Linked evaluation suites for quality monitoring
- **Memory/RAG Config**: Episodic memory retention and retrieval settings
- **Runtime Config**: Scheduling interval, model provider/name, temperature
- **Git Config**: Repository integration for version control
- **CI/CD Config**: Webhook pipeline for automated deployments
- **Ontology Tags**: Semantic labels linking the agent to domain concepts

### Agent States

| Status | Description |
|---|---|
| `active` | Agent is operational and available for execution |
| `paused` | Agent execution is temporarily suspended |
| `retired` | Agent has been decommissioned |
| `draft` | Agent is in configuration, not yet deployed |

### Agent Versioning

- Semantic versioning (semver) for all agent configurations
- Full version history with diff comparison
- Config rollback to any previous version
- Git-based manifest export/import for GitOps workflows

---

## 6. Blueprint Studio

Blueprint Studio is a visual editor for designing auditable agent workflows as Directed Acyclic Graphs (DAGs).

### Node Types

| Node Type | Description |
|---|---|
| `llm_call` | Executes a prompt against a specific LLM with configurable model and temperature |
| `tool_call` | Invokes an MCP tool with input/output schema validation |
| `rag` | Retrieval-augmented generation from a vector knowledge base |
| `classifier` | Routes logic based on intent classification |
| `router` | Conditional branching based on business logic |
| `human_review` | Mandatory human-in-the-loop checkpoint for high-risk actions |
| `schema_validate` | Validates outputs against JSON schemas for data integrity and redaction |

### Blueprint Lifecycle

1. **Draft**: Initial design in the visual editor
2. **Compilation**: Automated validation including:
   - Schema validation (missing IDs, invalid types, disconnected nodes)
   - Tool permission checks against active policies
   - Human review node requirements for high/critical risk agents
   - Policy compatibility checks (PHI/PCI data handling, output control)
   - MCP tool snapshot generation for execution consistency
3. **Signing**: Expert-reviewed and version-locked
   - Role-restricted (expert_validator, admin)
   - Version increment with history preservation
   - Audit event generation
   - Approval gate triggers for high-risk agents

### Team Blueprints

For multi-agent systems, Team Graph Editor provides:
- Visual orchestration canvas for agent dependencies
- DAG-based execution tier computation (parallel vs sequential)
- State handoff definitions between worker agents
- Supervisor pattern support

---

## 7. Agent Runtime Engine

The runtime engine executes deployed agents as background workers with full observability and compliance integration.

### Execution Flow

1. **Trigger**: Scheduled (interval-based via `setInterval`) or on-demand execution
2. **Context Construction**: `buildRuntimeContext()` aggregates a "super-prompt" containing:
   - Outcome contract targets and KPI definitions
   - Active governance policies
   - Domain ontology (canonical vocabulary, sensitivity classifications)
   - Skill instructions and knowledge graph results
   - Episodic memory (last 10 execution summaries)
   - Blueprint workflow steps
3. **LLM Processing**: `executePromptWithMcp()` sends the assembled context to the LLM
4. **Tool Calling Loop**: Up to 5 iterations of MCP tool calling (MAX_TOOL_ITERATIONS = 5)
5. **Compliance Validation**: Post-execution checks for data sources, audit trails, and ontology compliance
6. **Memory Persistence**: Execution summary saved as episodic memory
7. **Provenance Capture**: Immutable hash of blueprint version, tools, policies, and context

### Tool Execution

- **Discovery**: `gatherAvailableTools()` fetches tools from linked MCP servers
- **Translation**: Tools converted to OpenAI-compatible function definitions (`mcp_{idx}_{toolName}`)
- **Proxy**: `callMcpTool()` translates LLM function calls into real API requests (REST/JSON-RPC)
- **Iteration**: Multi-step tool chains where output of one tool feeds into the next

### Memory System

- **Episodic Memory**: Recent execution history loaded into context for temporal awareness
- **Memory Governance**: Configurable retention periods, erasure policies, and PII protection rules
- **Pruning**: Automatic removal of expired memories based on governance rules
- **PII Detection**: Runtime scanning for unprotected SSNs, credit card numbers, and other sensitive patterns

### Team Pipeline Execution

- `executeTeamPipeline()` coordinates multi-agent workflows
- `computeExecutionTiers()` uses DAG analysis for parallel/sequential scheduling
- `executeWorkerAgent()` handles context passing between pipeline stages
- Supports supervisor and peer orchestration patterns

---

## 8. MCP Server Integration Layer

The platform implements the Model Context Protocol (MCP) for extensible, governed tool integration.

### MCP Server Directory

- **Registration**: Mock and real MCP servers registered with transport type, URL, capabilities
- **Server Types**: Supports Salesforce, Marketo, Adobe Analytics, and custom integrations
- **Health Monitoring**: Periodic health checks with status tracking
- **Risk Classification**: Servers classified by risk tier (low, medium, high, critical)

### Tool Discovery and Management

Each MCP server exposes:
- **Tools**: Executable functions with JSON Schema input/output definitions
- **Resources**: Data endpoints for reading structured information
- **Prompts**: Pre-built prompt templates for common operations

Tool metadata includes:
- `inputSchema` / `outputSchema`: JSON Schema definitions
- `annotations`: Usage hints and risk indicators
- `riskClassification`: Individual tool risk level
- `ontologyTags`: Semantic labels for domain alignment
- `behaviorBaseline`: Statistical execution profile (latency, error rates)
- `fingerprintHash`: Schema fingerprint for drift detection

### Ontology Alignment

The Semantic Interoperability Layer ensures tool-domain alignment:

- **Auto-triggered matching**: `runParameterMatching()` maps tool parameters to ontology concepts on server initialization
- **Alignment scoring**: Percentage-based readiness score for industry vocabulary compliance
- **Deployment gate**: Tools below 50% alignment block production deployments unless explicitly bypassed
- **Context injection**: `DOMAIN ONTOLOGY` section in runtime system prompt enforces canonical terminology

### Behavior Fingerprinting

- **Statistical Profiling**: Latency baselines (mean/P95/P99), error rates from trace spans
- **Drift Detection**: Threshold rules (>2x = warning, >3x = drifted) independent of schema changes
- **Continuous Assurance Loop**: Drift detection triggers auto re-matching, alignment re-scoring, and blueprint impact analysis
- **Audit Events**: `governance.alignment_regression` events for governance trail

### Governance Enforcement

- **Policy-to-Tool Compatibility**: High-risk tools checked against agent policy bindings before linking
- **Tool Permission Policies**: `tool_permissions` domain policies govern which tools an agent can access
- **Data Handling Checks**: Tools tagged with sensitivity data classes (PCI, PHI) require corresponding `data_handling` policies
- **Approval Gates**: Critical actions like "expand tool permissions" require manual high-tier approval

---

## 9. Knowledge Base System

The Knowledge Base System provides vector-embedded document collections for Retrieval-Augmented Generation (RAG).

### Source Types

| Source Type | Description |
|---|---|
| Document Upload | PDF, DOCX, TXT, MD, CSV, JSON file processing |
| Web Scraping | URL content extraction using Cheerio |
| Structured Data | JSON/CSV with custom field mapping |
| Manual Text | Direct text input via API |

### Processing Pipeline

1. **Text Extraction**: Format-specific parsers (pdf-parse, mammoth, etc.)
2. **Sensitivity Pre-Scan**: Detects PHI, PCI, PII, and Financial Restricted content
3. **Chunking**: Configurable chunk size and overlap
4. **Embedding Generation**: OpenAI embeddings for vector similarity search
5. **Ontology Alignment**: Scoring against industry-specific canonical terms

### Sensitivity Scanning

The `performSensitivityScan()` function checks ingested content at upload time:

- **Detection Classes**: PHI (health data), PCI (payment data), PII (personal identifiers), Financial Restricted (MNPI)
- **Term Matching**: Pattern-based detection using `SENSITIVITY_TERMS` dictionary
- **Policy Verification**: Checks if agents linked to the KB have active `data_handling` policies for detected sensitivity classes
- **Audit Trail**: Generates `knowledge.sensitivity_warning` audit events for compliance tracking
- **User Notification**: Frontend warning dialog with override acknowledgment

### Staleness Tracking

- **Freshness Status**: Sources categorized as `fresh`, `stale`, or `critical` based on configurable thresholds (default: 90 days)
- **Impact Analysis**: Identifies affected agents and revalidation requirements
- **Auto-Triggers**: Staleness detection flags agents for revalidation and creates incidents for critical staleness
- **Reprocessing**: Source re-ingestion automatically restores freshness

### Usage Analytics & Dead Knowledge Detection

- **Retrieval Tracking**: Per-source and per-chunk `retrievalCount` and `lastRetrievedAt`
- **Real-Time Counting**: Incremented during actual RAG retrieval in `executePromptWithMcp`
- **Dead Knowledge**: Sources processed 30+ days ago with zero retrievals flagged for cleanup
- **Summary Metrics**: Aggregate retrieval stats, active vs. dead source breakdown

### RAG Pipeline Auto-Tuning

- **Telemetry Analysis**: Analyzes recent run traces for similarity scores and retrieval utilization
- **Heuristic Recommendations**: Suggests changes to `chunkSize`, `chunkOverlap`, and `retrievalTopK`
- **Confidence Levels**: Each recommendation tagged with confidence score
- **Auto-Apply**: One-click application with `knowledge.pipeline_auto_tuned` audit events
- **Healing Integration**: Root cause classification for `knowledge_gap`/`context_window_overflow` auto-generates tuning recommendations

### Knowledge Base Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/knowledge-bases` | List all knowledge bases |
| POST | `/api/knowledge-bases` | Create a new knowledge base |
| GET | `/api/knowledge-bases/:id` | Get knowledge base details |
| PATCH | `/api/knowledge-bases/:id` | Update KB settings (chunk size, thresholds) |
| POST | `/api/knowledge-bases/:id/sources/upload` | Upload a file source |
| POST | `/api/knowledge-bases/:id/sources/url` | Ingest from a URL |
| POST | `/api/knowledge-bases/:id/sources/:sourceId/reprocess` | Re-trigger chunking and embedding |
| GET | `/api/knowledge-bases/:id/embedding-status` | Check vectorization progress |
| POST | `/api/knowledge-bases/:id/embed` | Generate missing embeddings |
| GET | `/api/knowledge-bases/freshness-summary` | Overview of staleness across all KBs |
| GET | `/api/knowledge-bases/:id/usage-analytics` | Retrieval stats and dead source detection |
| POST | `/api/knowledge-bases/:id/auto-tune` | Get RAG optimization recommendations |
| POST | `/api/knowledge-bases/:id/apply-tuning` | Apply recommended RAG parameters |
| GET | `/api/knowledge-bases/:id/staleness-impact` | Identify agents affected by stale data |

---

## 10. Evaluation Framework

The Evaluation Framework (Eval Studio) provides comprehensive quality measurement and regression detection for AI agents.

### Eval Suite Types

| Type | Description |
|---|---|
| `regression` | Detects performance degradation across versions |
| `smoke` | Quick validation of basic functionality |
| `benchmark` | Comprehensive performance measurement against standards |
| `adversarial` | Tests agent resilience against hostile/malicious inputs |
| `kpi_aligned` | Evaluates performance against outcome contract KPI thresholds |

### Industry-Specific Evaluation Dimensions

Evaluations are scored against industry-specific criteria:

- **Healthcare**: PHI redaction accuracy, clinical decision quality, patient safety
- **Financial Services**: Regulatory compliance, AML screening accuracy, transaction accuracy
- **Manufacturing**: Quality control precision, safety compliance, equipment reliability
- **Insurance**: Claims accuracy, risk assessment precision, regulatory adherence

### Environment Thresholds

Configurable pass thresholds per deployment environment:
- **Development**: Typically 60% pass rate
- **Staging**: Typically 70% pass rate
- **Pilot**: Typically 85% pass rate
- **Production**: Typically 95% pass rate

### Scoring Mechanisms

| Scorer | Description |
|---|---|
| LLM-as-Judge | AI-powered semantic similarity and reasoning quality evaluation |
| Structured Correctness | JSON schema validation for output format compliance |
| Ontology Scorer | Canonical industry terminology compliance |
| KPI Boundary Testing | Performance at SLA/KPI limit conditions |

### Eval Run Process

1. Test cases executed against agent with specific inputs
2. Outputs scored by configured scorers
3. Results compared against threshold configuration
4. Regression detection via historical comparison
5. Automated alerts for threshold violations

### Production Feedback Loop

The platform implements a closed-loop improvement cycle:

1. **Detection**: Monitors for drift, regressions, or production failures
2. **Import**: Rejected outcome events and billing disputes imported as ground-truth test cases
3. **Evaluation**: New test cases added to regression suites
4. **Prevention**: Future deployments must pass the enriched eval suites

---

## 11. Golden Dataset Repository

Golden Datasets provide ground-truth benchmarks for agent evaluation with AI-assisted curation.

### Dataset Structure

Each golden dataset contains:
- **Metadata**: Name, description, industry, use case, version, status
- **Test Cases**: Collection of golden test cases with structured inputs and expected outputs
- **Coverage Dimensions**: Multi-dimensional quality tracking
- **Benchmark Range**: Performance baselines across agent versions
- **Contributor Tracking**: Source attribution for test cases

### Golden Test Case Schema

| Field | Description |
|---|---|
| `name` | Descriptive test case name |
| `inputScenario` | Detailed input prompt/scenario |
| `expectedBehavior` | Expected agent response (text or structured JSON) |
| `difficultyTier` | `routine`, `complex`, `edge_case`, or `adversarial` |
| `scenarioCategory` | `happy_path`, `edge_case`, `adversarial`, or `compliance_critical` |
| `evaluationCriteria` | Array of `{dimension, weight, description}` scoring criteria |
| `rubricScoring` | Structured rubric with dimensions, max scores, and passing threshold |
| `tags` | Categorical labels for filtering and organization |

### AI-Powered Test Case Generation

- **Bulk Generation**: Generate up to 50 test cases at once based on dataset industry/use case context
- **AI Enhance (Draft)**: Given a name and brief input scenario, AI auto-populates all remaining fields:
  - Enhanced input scenario with realistic context and edge conditions
  - Expected behavior (step-by-step agent response)
  - Difficulty tier and scenario category classification
  - Evaluation criteria with weighted dimensions
  - Rubric scoring with passing threshold
  - Relevant tags
- **AI Enhance (Existing)**: Improve specific aspects of saved test cases (rubric, criteria, adversarial hardening, or comprehensive enhancement)

### Benchmarking

- Performance tracking across agent versions
- Leaderboard view for agent comparison
- Benchmark average computation and trend analysis

---

## 12. Deployment Pipeline

The deployment pipeline enforces industry-governed release management with mandatory stages, evidence collection, and automated rollback.

### Rollout Strategies

| Strategy | Description |
|---|---|
| `canary` | Graduated traffic percentage rollout with monitoring |
| `shadow` | Replay production traffic against candidate version |
| `blue-green` | Full environment swap with instant rollback capability |
| `recreate` | Full replacement deployment |

### Pipeline Stages

Deployments progress through mandatory industry-specific stages:

**Healthcare Pipeline**:
1. Clinical Safety Review
2. HIPAA Attestation
3. Shadow Replay Validation
4. Pilot with Patient Exposure Limits
5. Production with PHI Compliance Monitoring

**Financial Services Pipeline**:
1. Regulatory Compliance Attestation
2. Suitability Testing
3. Rating Model Validation
4. AUM Exposure-Limited Canary
5. Production with Transaction Monitoring

### Evidence Packages

Each production release requires an automatically aggregated evidence package including:
- Audit event logs
- Evaluation results and pass rates
- Approval chain records
- Policy compliance attestations
- Shadow replay outcomes (where applicable)

### Auto-Rollback Triggers

Configurable triggers for automated rollback:
- `eval_pass_rate_drop`: Evaluation score falls below threshold
- `policy_violations`: Governance policy breaches detected
- `kpi_confidence`: KPI performance falls below SLA confidence interval
- **Industry-Specific**: "Patient Safety Event" (Healthcare), "AML Screening Failure" (Finance)

### Deployment Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/deployments` | List all deployments |
| POST | `/api/deployments` | Initiate a new deployment |
| POST | `/api/deployments/:id/advance-stage` | Progress to next pipeline stage |
| POST | `/api/deployments/:id/rollback` | Trigger rollback to last known good version |
| GET | `/api/canary-deployments` | List active canary deployments |

---

## 13. Shadow Replay Studio

Shadow Replay enables zero-risk agent validation by replaying production traces through candidate versions before live deployment.

### How It Works

1. **Capture**: Production interactions (traces) are recorded during normal agent operation
2. **Replay**: Captured traces replayed through a "Candidate" agent version
3. **Compare**: Output compared against the "Baseline" (live) version across multiple dimensions
4. **Verdict**: Sessions scored and classified

### Comparison Criteria

- Regulatory compliance adherence
- Ontology consistency (canonical terminology usage)
- Output accuracy and quality
- Safety and risk assessment

### Verdicts

| Verdict | Description |
|---|---|
| `equivalent` | Candidate produces substantially similar output |
| `improved` | Candidate performs measurably better |
| `regressed` | Candidate performs worse -- blocks promotion |
| `different_but_acceptable` | Different approach but within acceptable bounds |

### Industry-Specific Scorers

- **Healthcare**: Patient Safety scorer evaluates clinical decision quality
- **Financial Services**: Compliance scorer evaluates regulatory adherence
- **Manufacturing**: Safety compliance scorer evaluates equipment/process safety

---

## 14. Canary Deployment Console

Canary deployments enable graduated traffic rollout with automated safety gates and industry-specific exposure limits.

### Traffic Progression

Standard canary stages: **1% -> 5% -> 25% -> 50% -> 100%**

### Industry-Specific Safety Gates

| Industry | Safety Gate | Example Limit |
|---|---|---|
| Healthcare | Max Patient Exposure | 50 patients per stage |
| Healthcare | PHI Compliance Floor | 99.5% |
| Financial Services | Max AUM Exposure | $1M per stage |
| Financial Services | Compliance Floor | 99.0% |
| Technology/SaaS | Error Rate Ceiling | 2% |

### Promotion & Rollback Rules

- **Automated Promotion**: Canary advances to the next stage if metrics remain within thresholds for the observation window
- **Automated Rollback**: Triggered when error rates, compliance scores, or other metrics breach safety thresholds
- **Manual Override**: Operators can manually advance or roll back at any stage

---

## 15. Governance & Compliance Engine

The Governance Engine provides a comprehensive "Policy-as-Code" framework with proactive enforcement at design-time, deploy-time, and runtime.

### Policy Domains

| Domain | Description |
|---|---|
| `data_handling` | Data access, storage, and privacy controls (PHI, PCI, PII) |
| `tool_permissions` | Permitted tools and access boundaries |
| `logging` | Required logging levels and data capture |
| `allowed_actions` | Permitted agent actions and boundaries |
| `content_boundaries` | Output content restrictions and filters |
| `financial_reporting` | Financial data handling and reporting rules |
| `audit_compliance` | Audit trail requirements and retention |
| `deployment_safety` | Deployment process and rollback requirements |
| `model_governance` | Model selection, validation, and monitoring rules |

### Policy-as-Code

Policies are encoded using two formal languages:
- **OPA Rego**: Open Policy Agent rules for declarative policy enforcement
- **Cedar**: Amazon's policy language for fine-grained access control

### Regulatory Framework Support

| Framework | Industry | Key Controls |
|---|---|---|
| EU AI Act | Cross-Industry | Risk classification, transparency, human oversight |
| GDPR | Cross-Industry | Data protection, consent, right to erasure |
| HIPAA | Healthcare | PHI protection, access controls, audit trails |
| SOX | Financial Services | Financial reporting integrity, internal controls |
| PCI DSS | Finance/Retail | Payment card data security standards |
| ISO 42001 | Cross-Industry | AI management system certification |
| NIST AI RMF | Cross-Industry | AI risk management framework |
| MiFID II | Financial Services | Investment services regulations |
| FDA AI/ML | Healthcare | Medical device AI/ML requirements |
| ISA 62443 | Manufacturing | Industrial automation security |

### Policy Packs

Pre-configured industry bundles:
- **HIPAA Compliance Pack**: PHI data handling, access logging, retention rules
- **Clinical Safety Pack**: Patient safety protocols, adverse event reporting
- **MiFID II Compliance Pack**: Transaction monitoring, suitability testing, record retention

### Retention Policies

Automated data retention mapped to regulations:
- HIPAA: 6 years
- SOX: 7 years
- MiFID II: 10 years
- EU AI Act: Varies by risk classification

### Regulatory Exports

Specialized export formats for compliance reporting:
- **FinCEN SAR**: Suspicious Activity Reports (Financial)
- **XBRL**: Financial reporting standard
- **HL7 FHIR**: Healthcare interoperability
- **OASIS STIX**: Security threat intelligence

### Proactive Design-Time Enforcement

Four design-time gates ensure compliance before agents reach production:

1. **Agent Creation Policy Gate**: Validates required policy prerequisites per industry at wizard completion
2. **KB Source Sensitivity Validation**: Upload-time content scanning for regulated data classes with policy-agent alignment checks
3. **MCP Tool-to-Policy Compatibility**: High-risk tool linking requires matching policy bindings
4. **Blueprint Policy Compatibility**: Compilation checks for sensitive tool nodes and output control requirements

### Live Compliance Posture Dashboard

Real-time compliance monitoring:
- Per-framework control coverage scores with visual gauges
- Control-level coverage table with agent-to-control mapping
- Gap highlighting with severity indicators
- Framework health summary cards
- Auto-refresh on policy mutations and via 60-second polling

### Policy Exceptions

Formal workflow for temporary governance deviations:
- Exception request with justification
- Compensating controls requirement
- Expert validation and approval
- Time-bound exceptions with automatic expiration
- Full audit trail for exception lifecycle

### Governance Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/policies` | List governance policies |
| POST | `/api/policies` | Create a new governance policy |
| POST | `/api/governance/design-time-check` | Validate policy prerequisites for agent creation |
| GET | `/api/governance/compliance-posture` | Live compliance posture per framework |
| GET | `/api/approvals` | List pending and historical approval requests |
| PATCH | `/api/approvals/:id` | Approve or reject a change request |

---

## 16. Autonomy Engine & Oversight Console

### Autonomy Engine

The Autonomy Engine manages the level of independence granted to AI agents based on risk, industry context, and historical performance.

#### Autonomy Levels

| Level | Description |
|---|---|
| Full Auto | Agent acts independently, decisions logged only |
| Log Only | Agent acts independently, all decisions logged for review |
| Notify After | Agent acts, notifications sent post-action |
| Confirm Before | Agent proposes, human confirms before execution |
| Expert Approval | Agent proposes, qualified expert must approve |

#### Industry-Specific Risk Dimensions

Each industry defines specific risk factors for autonomy calibration:

- **Financial Services**: Transaction Value, AML Flag Level, Customer Tier, Regulatory Impact
- **Healthcare**: Patient Acuity, PHI Sensitivity, Clinical Decision Complexity
- **Manufacturing**: Equipment Criticality, Safety Impact, Production Line Value
- **Insurance**: Claim Value, Fraud Indicator Score, Policy Complexity

#### Adaptive Calibration

The Adaptive Autonomy Calibration Engine learns optimal human-machine decision boundaries:

- **Decision Quality Tracking**: Records autonomous decision outcomes (validated_correct, validated_incorrect)
- **Quality Profiles**: Per agent-action accuracy rate, total decisions, and trend computation
- **Boundary Proposals**: System proposes expanding autonomy (>95% accuracy) or tightening (<80% accuracy)
- **Maturity Scoring**: Agent maturity leaderboard based on historical performance

#### Dynamic Overrides

Time-bound or condition-based autonomy adjustments:
- "Quarter-End Close": Increased scrutiny during financial reporting periods
- "Weekend Operations": Reduced autonomy when expert staff unavailable
- Custom overrides with expiration and audit trail

### Oversight Console

The Oversight Console provides a real-time human-in-the-loop interface for reviewing high-risk agent decisions.

#### Live Decision Queue

- **Risk-Based Prioritization**: Decisions ranked by composite risk score (0-100)
- **Severity Classification**: Critical (>80), High (60-80), Medium (40-60), Low (<40)
- **Filters**: Pending vs. Resolved, by agent, by risk level

#### Expert Resolution Options

| Action | Description |
|---|---|
| Approve | Confirm the agent's proposed action |
| Reject | Block the proposed action |
| Modify | Adjust the action before execution |
| Escalate | Forward to a higher authority |
| Approve with Precedent | Approve and create a rule for future auto-approval |

#### Deep Context Analysis

For each pending decision:
- **Reasoning Chain**: Agent's internal logic and thought process
- **Regulatory Alignment**: Relevant policies and controls
- **AI Oversight Assistant**: Automated "second opinion" analyzing the action against industry context
- **Historical Precedents**: Similar past decisions and their outcomes

---

## 17. Self-Healing & Operational Intelligence

### Healing Operations Center

The platform provides autonomous detection, diagnosis, and remediation of agent issues.

#### Root Cause Classification Engine

Classifies agent drift into structured categories by correlating evidence across:
- Evaluation history and regression patterns
- Knowledge base freshness and coverage gaps
- Ontology revalidation requirements
- MCP tool schema fingerprint changes
- Context profile drift
- Episodic memory state analysis

#### Healing Pipeline

1. **Detection**: Automated monitoring identifies performance degradation or failures
2. **Diagnosis**: AI-powered root cause analysis (`/api/ai/healing-diagnose`)
3. **Remediation Proposal**: Automated generation of fix recommendations
4. **Validation**: Shadow replay of remediation against production traces
5. **Application**: Low-risk fixes auto-applied; high-risk fixes escalated to experts

#### Context Engineering Auto-Adjustment

- Analyzes failure patterns to identify context-related root causes
- Recommends context priority and token allocation changes
- Applies changes with audit trail

### Runbook Automation

Operational runbooks for standardized incident response:
- Pre-built runbook templates per industry
- Step-by-step playbooks with automated and manual steps
- Incident correlation and pattern detection
- Execution tracking and outcome recording

### Self-Healing Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/healing-pipelines` | List active healing operations |
| POST | `/api/ai/healing-diagnose` | AI-powered root cause analysis |
| GET | `/api/runbooks` | List operational runbooks |

---

## 18. Context Engineering Studio

The Context Engineering Studio provides systematic management of an agent's LLM context window, treating it as a scarce, optimizable resource.

### Context Sources

| Source | Description | Typical Priority |
|---|---|---|
| System Instructions | Core agent identity and behavioral rules | Highest |
| Industry Ontology | Canonical terminology and domain constraints | High |
| Regulatory Context | Active compliance policies and rules | High (Finance) |
| Skill Instructions | Active skill procedures and decision trees | Medium |
| Conversation History | Recent interaction context | Medium |
| Retrieved Knowledge | RAG-retrieved document chunks | Medium |
| Tool Descriptions | Available MCP tool schemas | Lower |

### Token Budget Management

- Visual allocation interface with progress bars per source
- Total capacity tracking (e.g., 128,000 tokens)
- Per-source `tokenAllocation` and `maxTokens` configuration
- Industry presets with recommended priority ordering

### Context Simulation

Users can simulate context window composition for specific task types, visualizing exactly what content occupies the window and identifying optimization opportunities.

### Context Window Economics Engine

Per-context-source ROI optimization connecting token consumption to outcome quality:

- **ROI Computation**: `(avgQualityAbove - avgQualityBelow) / avgCostUsd` -- compares runs with above/below median token counts
- **Trend Analysis**: Quality-per-token trend tracking (improving, stable, declining)
- **Context Cliff Detection**: Identifies the optimal token count where quality plateaus or drops
- **Source Attribution**: Maps quality impact to specific knowledge base sources, ranked by ROI
- **Recommendations Engine**: Identifies low-ROI categories consuming disproportionate budget and suggests reallocation
- **Industry Benchmarks**: Compares context efficiency against industry averages

### Context Economics Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/context-economics/agent/:agentId/roi` | ROI analysis by context category |
| GET | `/api/context-economics/agent/:agentId/generate-recommendations` | Budget optimization recommendations |

---

## 19. Agent Skills Library

### Skill Catalog

A central repository of composable, versioned skill units organized by industry and domain.

- **Categorization**: Skills grouped by Industry (Financial Services, Healthcare, etc.) and Domain (Fraud Detection, Order to Cash, etc.)
- **Trust Tiers**: `platform-provided`, `customer-created`, `marketplace`
- **Dependency Validation**: Automatic verification that required MCP tools and servers are available
- **AI Generation**: Create new skills from industry/domain context
- **AI Enhancement**: Improve existing skill descriptions and metadata
- **Comparison Tool**: Side-by-side skill performance comparison

### Skill Studio

An integrated development environment for creating and testing individual skills:

- **Structured Authoring**: Templates for Trigger Conditions, Procedures, Decision Trees, and Edge Cases
- **Quality Scoring**: AI-powered real-time clarity and completeness assessment
- **Policy Validation**: Pre-save validation against organizational policies and regulations
- **Ontology Tagging**: Integration with industry ontology for semantic labeling
- **Sandbox Testing**: Scenario execution environment with activation and step verification
- **Dependency Management**: Real-time validation of required tools and servers

### Skill Composition Designer

Visual chain builder for combining multiple skills into complex workflows:

- **Visual Canvas**: Drag-and-drop interface for skill placement and edge drawing
- **Conflict Analysis**: AI-powered detection of contradictions, overlaps, or ordering issues
- **Context Budgeting**: Token usage gauge tracking against model context window limits
- **Data Flow**: Input/output mapping between chained skills

---

## 20. Multi-Agent Orchestration

### Team Agents

Team agents coordinate multiple worker agents with defined roles and responsibilities:

- **Supervisor Pattern**: Central orchestrator dispatches tasks to specialized workers
- **Peer Pattern**: Agents collaborate as equals with defined interaction protocols
- **Pipeline Pattern**: Sequential processing through specialized agent stages

### Pipeline Orchestrator

Visual workflow editor for multi-agent pipelines:

#### Stage Types

| Type | Description |
|---|---|
| `agent` | Invokes a specific agent with defined inputs |
| `approval_gate` | Human-in-the-loop checkpoint requiring intervention |
| `parallel_group` | Runs multiple agents simultaneously |

#### Pipeline Features

- Linear or branched workflow designer with stage ordering
- Input/output mapping between stages
- Run management with scenario inputs and real-time progress tracking
- Interactive stage advancement (manual approval, simulated advancement)
- Execution history with duration and output logs per stage

---

## 21. Outcome Contract Engine

Outcome Contracts define the commercial and operational terms for AI agent deployments, shifting the model from compute-time to value-delivered.

### Contract Structure

| Field | Description |
|---|---|
| `name` | Contract identifier |
| `riskTier` | LOW, MEDIUM, HIGH, CRITICAL |
| `pricingModel` | PER_OUTCOME_EVENT, TIERED, SUBSCRIPTION |
| `pricePerUnit` | Revenue per successful outcome |
| `slaConfig` | Service Level Agreement thresholds |
| `approvalGates` | Required human checkpoints |
| `constraintGraph` | Decomposed constraints with downstream propagation targets |

### Constraint Propagation Engine

Outcomes generate a typed `constraintGraph` decomposing into:
- Quality constraints (accuracy, completeness)
- Latency constraints (response time SLAs)
- Cost constraints (per-run budget limits)
- Compliance constraints (regulatory requirements)

Downstream propagation enables:
- KPI-driven evaluation suite auto-generation
- Pre-save constraint validation
- SLA renegotiation flagging when changes impact bound agents

### KPI System

Key Performance Indicators track outcome delivery:
- Bidirectional binding between agents and KPIs
- Automatic recomputation on agent configuration changes
- SLA threshold enforcement
- Kill-chain alerts correlating drift signals with KPI thresholds

### Outcome-to-Agent Traceability

- Agent creation inherits outcome specifications (risk tier, KPI targets, compliance guardrails)
- Full traceability from business outcome to agent execution
- Deployment guardrails derived from outcome KPI SLA thresholds

### Outcome Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/outcomes` | List outcome contracts |
| POST | `/api/outcomes` | Create a new outcome contract |
| POST | `/api/outcomes/with-kpis` | Atomic creation of outcome + KPIs |
| PATCH | `/api/outcomes/:id` | Update (triggers downstream impact analysis) |
| GET | `/api/outcomes/:id/downstream-impact` | SLA change impact analysis |
| GET | `/api/outcomes/:id/evidence` | Performance evidence and quality metrics |
| POST | `/api/outcomes/:id/recompute` | Re-calculate KPI values from traces |
| POST | `/api/outcomes/:id/sync-eval-feedback` | Sync production feedback to eval suites |

---

## 22. Billing & Revenue Operations

### Outcome-Based Metering

The billing engine meters business results rather than raw compute usage:
- Revenue projections based on outcome event volume
- Acceptance rate tracking and billing adjustments
- Volume cap enforcement with automated exclusions

### Invoicing

- Automated invoice generation from billable outcome events
- Period-based aggregation (monthly, custom)
- Stripe integration for payment processing
- Exclusion rules: `outcome_inactive`, `volume_cap_exceeded`, `duplicate_event`

### Fraud & Anomaly Detection

Built into the outcome event ingestion pipeline:
- **Volume Spike Detection**: Alerts on 5x hourly average surges
- **Value Anomaly Detection**: Statistical analysis (3 standard deviations from mean)
- **Tamper Evidence**: SHA-256 signed hashes on every event

### Cost Attribution Chain

Full cost-to-serve analysis:

| Component | Calculation |
|---|---|
| LLM Cost | Per-trace token usage pricing |
| Tool Call Cost | Fixed rate per MCP tool execution ($0.001) |
| Infrastructure Overhead | Standard 15% markup |
| **Total** | **(LLM + Tool Calls) x (1 + 0.15)** |

Attribution hierarchy: **Traces -> Agents -> Outcomes**

### Margin Analysis

- Revenue vs. cost-to-serve per outcome
- Monthly trend analysis
- Automated alerts:
  - **Negative Margins**: Outcomes operating at a loss (Critical)
  - **Margin Erosion**: Significant month-over-month drops
  - **Low Margin**: Below 20% threshold
- AI-suggested mitigations: model downgrade, prompt compression, price increase

### Billing Dispute & Ground Truth Flywheel

Disputes feed into agent improvement:
1. User disputes specific outcome events
2. Disputes categorized (quality, accuracy, etc.)
3. Resolved disputes automatically synced into agent eval suites as regression test cases
4. Future deployments must pass enriched evaluations

### Billing Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/outcome-events` | Ingest outcome events with verification |
| GET | `/api/billing/margin-analysis` | Revenue vs. cost analysis |
| POST | `/api/billing/disputes` | File a billing dispute |

---

## 23. Ontology Explorer

The Ontology Explorer provides a workspace for building, managing, and versioning industry-specific knowledge graphs.

### Ontology Concepts

Each concept includes:
- **Canonical Term**: Authoritative vocabulary
- **Synonyms**: Alternative terms mapped to canonical
- **Category**: Domain classification
- **Sensitivity Classifications**: Data types and redaction requirements
- **Version History**: Full change tracking

### Structural Enforcement

Ontology concepts function as structural constraints across the platform:
- **Prompt Vocabulary**: Enforced canonical terms in agent system prompts
- **Post-Execution Compliance**: Output checked against ontology vocabulary
- **Evaluation Scoring**: Ontology-aware scorers validate terminology usage
- **KB Concept Coverage**: Ingested content scored against industry concepts
- **MCP Tool Alignment**: Tool parameters matched to ontology entities

### Regulatory Change Propagation

When an ontology concept is updated:
1. All affected agents flagged for revalidation
2. Audit events generated for compliance trail
3. Downstream policy and evaluation impacts assessed

### Design-Time Validation Layer

Ontology validation integrated across:
- KB concept coverage analysis
- Eval I/O schema validation
- MCP tool blueprint alignment
- Prompt vocabulary pre-validation
- Skill ontology tag linking

---

## 24. Agent API Gateway

The Agent API Gateway exposes deployed agents as REST API endpoints for external consumption.

### Features

- **API Key Management**: Generate, rotate, and revoke API keys per agent
- **Rate Limiting**: Configurable request limits per key
- **Request/Response Tracing**: Full trace capture for every API call
- **Authentication**: API key-based authentication for external callers
- **Endpoint Generation**: Automatic REST endpoint creation for deployed agents

### Playground

Interactive testing environment:
- Chat-based interface for real-time agent interaction
- Session management with history
- Tool call visualization
- Response inspection and debugging

---

## 25. Audit Trail & Provenance

### Immutable Audit Log

Every significant action in the platform generates an audit event:

| Field | Description |
|---|---|
| `actorType` | User, System, Agent, or Scheduler |
| `actorId` | Identifier of the acting entity |
| `action` | Action performed (e.g., `agent.created`, `policy.activated`) |
| `objectType` | Type of affected entity |
| `objectId` | Identifier of affected entity |
| `details` | JSON-serialized action details |
| `correlationId` | Links related events across distributed operations |
| `complianceFrameworks` | Applicable regulatory frameworks |
| `retentionPolicy` | Data retention requirements |

### Hash-Chain Integrity

- Each event includes `previousHash` and `eventHash`
- Chain verification detects tampering or unauthorized modifications
- Sequential numbering via `sequenceNum`

### End-to-End Provenance Graph

Tamper-proof reconstruction of any historical agent decision, capturing:
- Blueprint version at time of execution
- Knowledge base retrieval records
- Tool fingerprints and schemas
- Active policy snapshot
- Context profile configuration
- Episodic memory state
- Industry context and ontology concepts used
- Provenance hash for integrity verification

### Provenance Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/traces` | List execution traces |
| GET | `/api/traces/:id` | Fetch specific trace details |
| GET | `/api/provenance/:traceId` | Retrieve full provenance data |
| GET | `/api/provenance/:traceId/diff` | Configuration diff between executions |
| POST | `/api/provenance/verify-integrity` | Cryptographic integrity verification |

---

## 26. AI-Assisted Features

The platform leverages OpenAI throughout the product for intelligent automation:

| Feature | Endpoint | Description |
|---|---|---|
| Outcome Design | `/api/ai/design-outcome` | Conversational AI for defining business outcomes |
| Ontology Generation | `/api/ai/generate-ontology` | Generate industry-specific ontology concepts |
| Policy Enhancement | `/api/ai/enhance-policy-rules` | AI refinement of policy rule definitions |
| Test Case Generation | `/api/ai/generate-golden-test-cases` | Bulk generation of evaluation test cases (up to 50) |
| Test Case Enhancement | `/api/ai/enhance-golden-test-case` | Improve existing test cases (rubric, criteria, adversarial) |
| Draft Enhancement | `/api/ai/enhance-test-case-draft` | Auto-populate test case fields from name + scenario |
| Healing Diagnosis | `/api/ai/healing-diagnose` | Root cause analysis for agent failures |
| Autonomy Profile | `/api/ai/generate-autonomy-profile` | Generate risk dimensions and autonomy levels |
| Oversight Context | `/api/ai/oversight-context` | Second opinion analysis for pending decisions |
| Skill Generation | `/api/ai/generate-skill` | Create new skills from industry/domain context |
| Skill Enhancement | `/api/ai/enhance-skill` | Improve skill descriptions and metadata |

---

## 27. Database Schema Overview

The platform uses PostgreSQL with 60+ tables organized into functional domains.

### Core Entities

| Table | Description |
|---|---|
| `users` | Platform user accounts with roles |
| `agents` | AI agent configurations and metadata |
| `agent_versions` | Semantic version history for agents |
| `outcome_contracts` | Business outcome definitions with SLAs |

### Operations & Deployment

| Table | Description |
|---|---|
| `deployments` | Deployment pipeline instances with stage tracking |
| `run_traces` | Agent execution traces with provenance |
| `run_steps` | Individual steps within an execution trace |
| `trace_spans` | Distributed tracing spans for tool calls |

### Governance & Compliance

| Table | Description |
|---|---|
| `policies` | Governance policy definitions (OPA/Cedar) |
| `approvals` | Approval request lifecycle |
| `audit_events` | Hash-chained immutable audit log |
| `policy_exceptions` | Temporary policy deviation requests |
| `compliance_reports` | Generated compliance documentation |
| `regulations` | Regulatory framework definitions |
| `regulatory_policies` | Framework-to-policy mappings |
| `compliance_controls` | Individual regulatory controls |

### MCP Integration

| Table | Description |
|---|---|
| `mcp_servers` | Registered MCP server instances |
| `mcp_server_tools` | Discovered tools with fingerprints and baselines |
| `mcp_server_resources` | Server resource endpoints |
| `mcp_server_prompts` | Server prompt templates |
| `mcp_server_auth` | Server authentication configurations |
| `mcp_transcripts` | Tool execution transcripts |
| `mcp_apps` | MCP application registrations |
| `mcp_elicitations` | Runtime elicitation requests |

### Knowledge Base

| Table | Description |
|---|---|
| `knowledge_bases` | KB configurations and metadata |
| `knowledge_sources` | Individual source documents with freshness tracking |
| `knowledge_chunks` | Chunked and embedded text segments |
| `agent_knowledge_bases` | Agent-to-KB linkage |

### Evaluation

| Table | Description |
|---|---|
| `eval_suites` | Evaluation suite configurations |
| `eval_test_cases` | Individual eval test case definitions |
| `eval_runs` | Evaluation execution results |
| `eval_case_results` | Per-case scoring within a run |
| `golden_datasets` | Ground-truth benchmark collections |
| `golden_test_cases` | Individual golden test cases |

### Billing & Finance

| Table | Description |
|---|---|
| `invoices` | Generated invoices with Stripe integration |
| `outcome_events` | Metered outcome events with tamper-evident hashing |
| `billing_disputes` | Dispute tracking and resolution |

### Autonomy & Oversight

| Table | Description |
|---|---|
| `autonomy_decisions` | Recorded autonomous agent decisions |
| `decision_quality_profiles` | Per-action accuracy profiles |
| `autonomy_boundary_proposals` | System-generated boundary adjustments |

### Context & Memory

| Table | Description |
|---|---|
| `context_economics` | Per-run context token usage and ROI data |
| `context_recommendations` | AI-generated context optimization suggestions |

### Skills & Ontology

| Table | Description |
|---|---|
| `skills` | Skill definitions with ontology tags |
| `skill_versions` | Skill version history |
| `skill_chains` | Composed skill workflows |
| `ontology_concepts` | Industry ontology terms and classifications |
| `ontology_enhancements` | AI-suggested ontology improvements |

### Additional Tables

| Table | Description |
|---|---|
| `incidents` | Operational incident tracking |
| `patches` | Agent configuration patches |
| `experiments` | A/B testing experiments |
| `blueprints` | Agent workflow blueprints |
| `agent_templates` | Reusable agent configuration templates |
| `agent_teams` | Multi-agent team definitions |
| `remote_agents` | External agent registrations |
| `jobs` | Background job queue |
| `org_settings` | Organization-level configuration |
| `admin_users` | Administrative user records |

---

## 28. API Reference Summary

The platform exposes 600+ REST API endpoints organized by domain. Below are the primary endpoint groups:

### Agent Management
- `GET /api/agents` -- List all agents
- `GET /api/agents/:id` -- Get agent details
- `POST /api/agents` -- Create a new agent
- `PATCH /api/agents/:id` -- Update agent configuration
- `DELETE /api/agents/:id` -- Delete an agent
- `POST /api/agents/bulk-action` -- Bulk pause/resume
- `POST /api/agents/:id/validate-config` -- Validate configuration

### Outcome Contracts
- `GET /api/outcomes` -- List outcomes
- `POST /api/outcomes` -- Create outcome
- `POST /api/outcomes/with-kpis` -- Atomic outcome + KPIs creation
- `PATCH /api/outcomes/:id` -- Update with downstream impact
- `GET /api/outcomes/:id/downstream-impact` -- Impact analysis
- `POST /api/outcomes/:id/recompute` -- Recompute KPIs
- `POST /api/outcomes/:id/sync-eval-feedback` -- Sync production feedback

### Deployment Pipeline
- `GET /api/deployments` -- List deployments
- `POST /api/deployments` -- Initiate deployment
- `POST /api/deployments/:id/advance-stage` -- Progress pipeline
- `POST /api/deployments/:id/rollback` -- Trigger rollback

### Governance & Policy
- `GET /api/policies` -- List policies
- `POST /api/policies` -- Create policy
- `POST /api/governance/design-time-check` -- Design-time validation
- `GET /api/governance/compliance-posture` -- Compliance dashboard
- `GET /api/approvals` -- List approvals
- `PATCH /api/approvals/:id` -- Approve/reject

### Knowledge Base
- `GET /api/knowledge-bases` -- List KBs
- `POST /api/knowledge-bases` -- Create KB
- `POST /api/knowledge-bases/:id/sources/upload` -- Upload source
- `POST /api/knowledge-bases/:id/sources/url` -- Ingest URL
- `GET /api/knowledge-bases/:id/usage-analytics` -- Usage stats
- `POST /api/knowledge-bases/:id/auto-tune` -- RAG optimization

### Evaluation & Golden Datasets
- `GET /api/eval-suites` -- List evaluation suites
- `POST /api/ai/generate-golden-test-cases` -- AI test case generation
- `POST /api/ai/enhance-test-case-draft` -- AI draft enhancement
- `POST /api/ai/enhance-golden-test-case` -- AI existing case enhancement

### Traces & Provenance
- `GET /api/traces` -- List traces
- `GET /api/provenance/:traceId` -- Full provenance
- `POST /api/provenance/verify-integrity` -- Integrity verification

### Agent Runtime
- `GET /api/agent-runtime/active` -- Active agent instances
- `POST /api/agents/:agentId/playground/chat` -- Interactive testing

### Autonomy & Oversight
- `GET /api/autonomy/decisions` -- Decision log
- `POST /api/autonomy/decisions/:id/validate` -- Expert validation
- `GET /api/autonomy/calibration-summary` -- Calibration data

### Billing
- `POST /api/outcome-events` -- Ingest metered events
- `GET /api/billing/margin-analysis` -- Margin analytics

### MCP Servers
- `GET /api/mcp/servers` -- List servers
- `GET /api/mcp/servers/:id/tools` -- Server tools
- `POST /api/agents/:id/mcp-servers` -- Link server to agent

### Context Economics
- `GET /api/context-economics/agent/:agentId/roi` -- Context ROI
- `GET /api/context-economics/agent/:agentId/generate-recommendations` -- Optimization recommendations

---

## 29. Technology Stack

### Frontend

| Package | Purpose |
|---|---|
| React 18 | UI component library |
| Vite | Build tool and dev server |
| Tailwind CSS | Utility-first CSS framework |
| shadcn/ui | Pre-built UI components |
| wouter | Client-side routing |
| @tanstack/react-query | Data fetching and cache management |
| react-hook-form | Form state management |
| zod | Schema validation |
| lucide-react | Icon library |
| react-icons | Brand/company logos |
| recharts | Chart and data visualization |

### Backend

| Package | Purpose |
|---|---|
| Express.js | HTTP server and routing |
| TypeScript | Type-safe development |
| Drizzle ORM | Database schema and query builder |
| drizzle-zod | Schema-to-validation bridge |
| OpenAI SDK | LLM API integration |
| multer | File upload handling |
| pdf-parse | PDF text extraction |
| mammoth | DOCX text extraction |
| cheerio | HTML/web content parsing |
| crypto | Hash-chain audit integrity |

### Infrastructure

| Component | Technology |
|---|---|
| Database | PostgreSQL |
| Vector Search | pgvector extension |
| Hosting | Replit (NixOS container) |
| Process Management | Replit Workflows |

---

*This document provides a comprehensive overview of the Nous Agent Orchestrator platform. For implementation-level details, refer to the source code and inline documentation. For deployment and operations guides, consult the platform administration documentation.*
