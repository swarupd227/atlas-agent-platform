# Nous Agent Orchestrator

## Overview
The Nous Agent Orchestrator is an AI agent lifecycle management platform designed for autonomous execution and expert validation. Its primary goal is to integrate compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform offers tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across diverse sectors like Healthcare, Financial Services, Manufacturing, Insurance, Retail, and Technology/SaaS. It empowers AI agents to reason within specific industry contexts, thereby driving business value and ensuring efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator employs a modern web stack. The frontend is built with React, Vite, Tailwind CSS, shadcn/ui, and wouter, while the backend uses Express.js for its REST API. Data persistence is handled by PostgreSQL with Drizzle ORM.

**UI/UX Design Principles**:
- Outcome-first navigation focused on KPI delivery.
- Evidence-by-default for approvals and blast radius analysis.
- Autonomy with integrated guardrails via policy checks.
- Time travel functionality for agent timelines and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Comprehensive tools for agent creation, deployment, monitoring, and governance.
- **Blueprint Studio**: A visual editor for auditable agent blueprints, featuring versioning and compliance annotations.
- **Industry-Governed Deployment Pipeline**: Includes a Release Orchestrator with industry-specific stages, auto-rollback capabilities, and regulatory policy-as-code enforcement.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls through registered integrations, and tracking execution with compliance checks.
- **Shadow Replay Studio**: Enables zero-risk agent deployment through production trace replay for validation.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls.
- **Governance**: A Certified Agent Compliance Layer provides policy management, enforcement, and immutable audit trails.
- **Optimization & Healing**: Features autonomous optimization, self-healing mechanisms, and AI-proposed changes.
- **Knowledge Base System**: Utilizes vector-embedded document collections for RAG grounding.
- **Outcome Builder**: A conversational AI for defining goals and generating AI agent development plans.
- **Team-Based Multi-Agent Orchestration**: Supports management of Team Agents, worker agents, and blueprints.
- **Agent Skills Library**: A catalog of composable, versioned skill units organized by industry.
- **Context Engineering Studio**: Manages how agents acquire and utilize context, including inventory, priority matrix, and budget visualization.
- **Multi-Agent Pipeline Orchestrator**: A visual workflow editor for designing and executing multi-agent pipelines.
- **Agent API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight Console**: Provides dynamic human oversight with a risk dimension matrix and expert intervention thresholds.
- **Outcome-to-Agent Traceability**: Links agent creation to outcome contracts, inheriting specifications like risk tier, KPI targets, and compliance guardrails.
- **Cross-Industry Workspace**: Includes an Ontology Explorer for building custom ontologies.
- **Bidirectional KPI Binding**: Automatically triggers KPI recomputation and audit events upon agent configuration changes.
- **Outcome-Driven Deployment Guardrails**: Analyzes outcome KPI SLA thresholds to recommend and enforce deployment strategies.
- **Kill-Chain Alerts**: Correlates agent drift signals with outcome KPI SLA thresholds to generate proactive alerts.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Ontology Structural Enforcement**: Ontology concepts serve as structural constraints across prompt vocabulary, post-execution compliance checks, and evaluation.
- **Outcome Contract Propagation Engine**: Outcomes generate a typed `constraintGraph` which decomposes into various constraints with downstream propagation targets, enabling KPI-driven evaluation suite auto-generation, pre-save constraint validation, and SLA renegotiation flagging.

**Technical Implementations**:
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Episodic Memory Persistence**: Stores execution history, summarizing runs and loading recent memories into runtime context.
- **Blueprint-to-Runtime Resolution**: Validates blueprint nodes against available tools, extracts workflow steps, and injects a `BLUEPRINT WORKFLOW` section into the runtime system prompt.
- **Outcome-Aware Eval Scoring**: KPI-aligned evaluation suites load associated KPI definitions, scoring cases against thresholds, and aggregating results for outcome alignment.
- **Production Feedback Loop**: Imports rejected outcome events and resolved billing disputes as ground-truth evaluation test cases.
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge.
- **Ontology Concept Versioning**: Supports versioning and history tracking for ontology concepts.
- **Regulatory Change Propagation**: Updating an ontology concept triggers revalidation flags and audit events for affected agents.
- **Ontology-Encoded Data Sensitivity Classifications**: Defines data types and redaction requirements, injected into runtime system prompts and used for dynamic payload redaction.
- **Root Cause Classification Engine**: Classifies agent drift into structured categories by correlating evidence across eval history, KB freshness/coverage, ontology revalidation, MCP tool schema fingerprints, context profiles, and episodic memory state.
- **Shadow Replay Validation Gate**: Creates shadow replay jobs linked to healing pipelines to validate remediation, blocking deployment if replay fails.
- **Context Engineering Auto-Adjustment**: Analyzes failure patterns to recommend and apply context priority and token allocation changes.
- **Cost Attribution Chain**: Full cost-to-serve analysis aggregating LLM token costs + MCP tool call costs + infrastructure overhead per agent, per outcome.
- **Margin Analysis Dashboard**: Revenue vs cost-to-serve per outcome with monthly trend analysis.
- **Acceptance-Based Ground Truth Flywheel**: Closed-loop system where billing acceptance/rejection events continuously improve agent quality via automatic synchronization of eval feedback.
- **Agent Config Versioning & GitOps**: Full lifecycle versioning and Git-based config management, including context/memory profile versioning, unified agent manifest export/import, config rollback, and Git push/pull integration with CI/CD webhook pipeline for automated deployments.
- **Adaptive Autonomy Calibration Engine**: Self-adjusting autonomy system that learns optimal human-machine decision boundaries, tracking autonomous decision outcomes, computing quality profiles, and generating boundary adjustment proposals.
- **End-to-End Provenance Graph**: Tamper-proof execution environment reconstruction for any historical agent decision, capturing blueprint version, KB retrieval records, tool fingerprints, active policy snapshot, context profile, memory IDs, industry context, and used ontology concepts.
- **Ontology Design-Time Validation Layer**: Integrates ontology validation across KB concept coverage, Eval I/O schema, MCP tool blueprint alignment, prompt vocabulary pre-validation, and skill ontology tag linking.
- **Eval-Driven Operational Intelligence Fixes**: Implements server-side eval gates for deployment promotion and direct eval failure to KB gap analysis.
- **Context Window Economics Engine**: Per-context-source ROI optimization engine connecting token consumption to outcome quality and cost, including ROI computation, industry benchmarks, context cliff detection, and source attribution.
- **MCP Governance & Semantic Interoperability Layer**: Governed ontology-validated bridge between AI agents and enterprise MCP tool ecosystems, featuring auto-triggered ontology parameter matching, a continuous assurance loop for drift detection, enforced ontology alignment, and tool behavior fingerprinting.
- **Knowledge Staleness Tracking**: Automated time-based freshness detection for KB sources, triggering revalidation flags and audit events.
- **KB Usage Analytics & Dead Knowledge Detection**: Tracks per-source and per-chunk retrieval, identifying unused "dead knowledge" and providing usage statistics.
- **RAG Pipeline Auto-Tuning**: Automated analysis of retrieval quality metrics to recommend optimal KB configuration parameters like `chunkSize`, `chunkOverlap`, and `retrievalTopK`.
- **Proactive Design-Time Governance Enforcement**: Includes policy gates for agent creation, sensitivity validation for KB sources, MCP tool-to-policy compatibility checks, and blueprint policy compatibility validations.
- **Live Compliance Posture Dashboard**: Provides real-time per-framework control coverage with agent-level mapping, showing scores, gaps, and agent coverage.
- **AI Enhance for Test Case Drafts**: Uses AI to generate enhanced test case components (input scenario, expected behavior, difficulty, etc.) based on initial inputs.
- **Security Mode**: Feature-flagged JWT authentication layer with `SECURITY_MODE=demo` for frictionless demo and `SECURITY_MODE=production` for JWT-based login, HTTP-only cookies, password hashing, and role-from-session enforcement.

- **LLM Provider Abstraction Layer**: Multi-provider LLM support (`server/llm-provider.ts`) with uniform `complete()`, `completeWithTools()`, and `embed()` interfaces. Supports OpenAI (fully implemented), Anthropic (fully implemented), with extension points for Google AI, Azure OpenAI, and self-hosted (vLLM/Ollama). Per-agent provider selection via `modelProvider`/`modelName` fields. Provider management UI at `/model-providers` with health checks, model catalog, and usage stats. Agent Wizard dynamically shows configured providers with cost-per-token info.

## External Dependencies
- **OpenAI**: Primary LLM provider for agent runtime, evaluations, AI enhancements, and embeddings. Accessed through LLM Provider Abstraction Layer.
- **Anthropic**: Secondary LLM provider (requires `ANTHROPIC_API_KEY` env var). Supports Claude models with tool calling through the abstraction layer.
- **PostgreSQL**: The primary database.
- **Express.js**: The backend web application framework.
- **React**: The frontend JavaScript library.
- **Vite**: The frontend build tool.
- **Tailwind CSS**: Used for styling the user interface.
- **shadcn/ui**: Provides UI components.
- **wouter**: Used for client-side routing.
- **Drizzle ORM**: The Object-Relational Mapper for database interaction.
- **pgvector**: Integrated for similarity search capabilities within the Knowledge Base System.
- **Web Audio API**: Used for background music playback in the product demo player.