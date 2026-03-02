# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator is an AI agent lifecycle management platform for autonomous execution and expert validation. It integrates compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across various verticals including Healthcare, Financial Services, Manufacturing, Insurance, Retail, and Technology/SaaS. Its core purpose is to enable AI agents to reason within specific industry contexts, driving business value and efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator utilizes a modern web stack with React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for database management.

**UI/UX Design Principles**:
- Outcome-first navigation for KPI delivery.
- Evidence-by-default for approvals and blast radius analysis.
- Autonomy with guardrails through policy checks.
- Time travel for agent timelines and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Tools for creation, deployment, monitoring, and governance.
- **Blueprint Studio**: Visual editor for auditable agent blueprints with versioning and compliance annotations.
- **Industry-Governed Deployment Pipeline**: Features a Release Orchestrator with industry-specific stages, auto-rollback, and regulatory policy-as-code enforcement.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls via registered integrations, and tracking execution with compliance checks.
- **Shadow Replay Studio**: Enables zero-risk agent deployment via production trace replay for validation.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and immutable audit trails.
- **Optimization & Healing**: Autonomous optimization, self-healing, and AI-proposed changes.
- **Knowledge Base System**: Vector-embedded document collections for RAG grounding.
- **Outcome Builder**: Conversational AI for defining goals and generating AI agent development plans.
- **Team-Based Multi-Agent Orchestration**: Supports management of Team Agents with worker agents and blueprints.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing.
- **Context Engineering Studio**: Manages how agents acquire and utilize context with inventory, priority matrix, and budget visualizer.
- **Multi-Agent Pipeline Orchestrator**: Visual workflow editor for designing and executing multi-agent pipelines.
- **Agent API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight Console**: Dynamic human oversight with risk dimension matrix and expert intervention thresholds.
- **Outcome-to-Agent Traceability**: Links agent creation to outcome contracts, inheriting structured specifications like risk tier, KPI targets, and compliance guardrails.
- **Cross-Industry Workspace**: Provides access to an Ontology Explorer for building custom ontologies.
- **Bidirectional KPI Binding**: Automatically triggers KPI recomputation and audit events upon agent configuration changes.
- **Outcome-Driven Deployment Guardrails**: Analyzes outcome KPI SLA thresholds to recommend and enforce deployment strategies.
- **Kill-Chain Alerts**: Correlates agent drift signals with outcome KPI SLA thresholds to generate proactive alerts.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Ontology Structural Enforcement**: Ontology concepts function as structural constraints across prompt vocabulary, post-execution compliance checks, and evaluation.
- **Outcome Contract Propagation Engine**: Outcomes generate a typed `constraintGraph` decomposing into various constraints with downstream propagation targets, enabling KPI-driven evaluation suite auto-generation, pre-save constraint validation, and SLA renegotiation flagging.

**Technical Implementations**:
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Episodic Memory Persistence**: `agent_memories` table stores execution history, summarizing runs and loading recent memories into runtime context.
- **Blueprint-to-Runtime Resolution**: `resolveBlueprint()` validates blueprint nodes against available tools, extracts workflow steps, and injects a `BLUEPRINT WORKFLOW` section into the runtime system prompt.
- **Outcome-Aware Eval Scoring**: KPI-aligned eval suites load associated KPI definitions, scoring cases against thresholds, and aggregating results for outcome alignment.
- **Production Feedback Loop**: Imports rejected outcome events and resolved billing disputes as ground-truth eval test cases.
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge.
- **Ontology Concept Versioning**: `ontology_concepts` supports versioning and history tracking.
- **Regulatory Change Propagation**: Updating an ontology concept triggers revalidation flags and audit events for affected agents.
- **Ontology-Encoded Data Sensitivity Classifications**: `sensitivityClassification` field on `ontology_concepts` defines data types and redaction requirements, injected into runtime system prompts and used for dynamic payload redaction.
- **Root Cause Classification Engine**: Classifies agent drift into structured categories by correlating evidence across eval history, KB freshness/coverage, ontology revalidation, MCP tool schema fingerprints, context profiles, and episodic memory state.
- **Shadow Replay Validation Gate**: Creates shadow replay jobs linked to healing pipelines to validate remediation, blocking deployment if replay fails.
- **Context Engineering Auto-Adjustment**: Analyzes failure patterns to recommend and apply context priority and token allocation changes.
- **Cost Attribution Chain**: Full cost-to-serve analysis aggregating LLM token costs + MCP tool call costs + infrastructure overhead per agent, per outcome.
- **Margin Analysis Dashboard**: Revenue vs cost-to-serve per outcome with monthly trend analysis.
- **Acceptance-Based Ground Truth Flywheel**: Complete closed-loop system where billing acceptance/rejection events become ground-truth labels that continuously improve agent quality via automatic synchronization of eval feedback.
- **Agent Config Versioning & GitOps**: Full lifecycle versioning and Git-based config management, including context/memory profile versioning, unified agent manifest export/import, config rollback, and Git push/pull integration with CI/CD webhook pipeline for automated deployments.
- **Adaptive Autonomy Calibration Engine (IP #5)**: Self-adjusting autonomy system that learns optimal human-machine decision boundaries. Tracks autonomous decision outcomes via `autonomy_decisions` table, computes per-agent/decision-type/industry quality profiles (`decision_quality_profiles`), and generates boundary adjustment proposals (`autonomy_boundary_proposals`). Features expansion criteria (≥0.95 accuracy, ≥50 decisions), tightening criteria (<0.80 accuracy or recent errors), auto-apply for high-confidence expansions, agent maturity scoring, industry baseline aggregation with cross-agent benchmarking, and auto-validation triggers from billing events and timed-out decisions. Calibration Dashboard UI in Autonomy Engine page with quality heatmap, pending proposals with approve/reject workflow, boundary evolution history, industry baselines, and agent maturity leaderboard.
- **End-to-End Provenance Graph (IP #6)**: Tamper-proof execution environment reconstruction for any historical agent decision. Unified `provenanceSnapshot` (jsonb) and `provenanceHash` (SHA-256) on `run_traces` capturing: blueprint version hash, KB retrieval records (chunk IDs, similarity scores, embedding model, content hashes), MCP tool fingerprints per execution, MCP server versions, active policy snapshot, autonomy level, context profile version/budgets, memory IDs loaded with content hash, industry context, and ontology concepts used. Hash-chained into audit trail via `auditEventId` link creating bidirectional provenance ↔ audit binding. KB retrieval now persists structured chunk data to `retrievedDocs` column (previously never populated). Reconstruction API (`/api/provenance/:traceId/reconstruct`) resolves all references to actual content. Diff API (`/api/provenance/:traceId/diff`) detects state drift since execution. Integrity verification (`/api/provenance/verify-integrity`) batch-validates provenance hash + audit chain. Regulatory export formats (`/api/provenance/:traceId/export?format=sec|hipaa|insurance|generic`) with chain-of-custody and tamper-evidence sections. Provenance Explorer UI in trace-detail.tsx with integrity badges, summary cards, expandable KB/tool/policy/memory sections, drift indicators, and full reconstruction panel.

## External Dependencies
- **OpenAI**: Used for TTS narration, AI skill generation/enhancement, conversational design, and other AI features.
- **PostgreSQL**: Primary database for the platform.
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library for the frontend.
- **Drizzle ORM**: Object-Relational Mapper.
- **pgvector**: Used for similarity search within the Knowledge Base System.
- **Web Audio API**: Used for background music in the product demo player.