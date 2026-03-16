# Nous Agent Orchestrator

## Overview
The Nous Agent Orchestrator is an AI agent lifecycle management platform designed for autonomous execution and expert validation. It integrates compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across various sectors. Its core purpose is to empower AI agents to reason within specific industry contexts, driving business value and ensuring efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator uses a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend, and Express.js for its REST API backend. PostgreSQL with Drizzle ORM handles data persistence.

**UI/UX Design Principles**:
- Outcome-first navigation focused on KPI delivery.
- Evidence-by-default for approvals.
- Autonomy with integrated guardrails via policy checks.
- Time travel functionality for agent timelines and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Tools for creation, deployment, monitoring, and governance, including a Blueprint Studio and an Industry-Governed Deployment Pipeline.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls through registered integrations, and tracking execution with compliance checks.
- **Validation and Deployment Safety**: Features Shadow Replay Studio for zero-risk deployment validation and a Canary Deployment Console for graduated rollouts.
- **Governance & Compliance**: A Certified Agent Compliance Layer provides policy management, enforcement, and immutable audit trails, supported by Ontology Structural Enforcement and Regulatory Change Propagation.
- **Optimization & Healing**: Autonomous optimization, self-healing mechanisms, and AI-proposed changes.
- **Knowledge Management**: Utilizes vector-embedded document collections for RAG grounding, including web crawl ingestion and structured data import (JSON files).
- **Conversational AI**: Outcome Builder for defining goals and generating AI agent development plans.
- **Multi-Agent Orchestration**: Supports team-based multi-agent orchestration, an Agent Skills Library, and a Context Engineering Studio.
- **API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight**: Provides dynamic human oversight with a risk dimension matrix and expert intervention thresholds.
- **Outcome Traceability & KPI Binding**: Links agent creation to outcome contracts, inheriting specifications like risk tier, KPI targets, and compliance guardrails.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Event-Driven Trigger System**: Configurable triggers (`webhook`, `schedule`, `agent_completion`, `mcp_resource_change`) for automating agent runs.
- **Developer Experience**: A Developer Portal with Quick Start guides, Authentication docs, an interactive API Reference, and SDKs.
- **Blueprint Library**: Blueprints support `patternType`, `tags`, `isShared`, and `forkedFromId` for enhanced organization and provenance tracking.
- **Blueprint-First Agent Creation**: Blueprints are integrated into all agent creation paths, with a "Choose Blueprint" step in the Agent Wizard.
- **Configurable Tool Iterations**: Per-agent `maxToolIterations` setting.
- **Deployment Activation Flow**: Pending/inactive deployments can be activated directly from the release detail page.
- **Product Intelligence in Code Generation**: Exported code now incorporates all Product Intelligence data, including `maxIterations`, matched skills, KB retrieval config, outcome contract, policy module, and agent metadata.
- **Full-Screen Export Page**: Dedicated full-screen page for agent code export with a three-step flow: Configure, Preview, and Deliver. Includes file search palette (Cmd+P), per-file regeneration, diff view toggle, dynamic deployment checklist, export presets (localStorage), and CI/CD manifest generation.
- **Table-Aware Document Chunking**: Knowledge base ingestion preserves tabular data structure from Word documents and HTML web crawls, converting tables to Markdown.
- **Eval Dataset Transformation**: Renamed "Golden Dataset" to "Eval Dataset," with support for structured Data Records, AI-generated evaluation data, and performance benchmarks.
- **LLM Provider Abstraction Layer**: Multi-provider LLM support (OpenAI, Anthropic) for uniform interfaces and per-agent provider selection.
- **SSE Streaming for Agent Runtime**: Real-time progress streaming of agent execution via Server-Sent Events.
- **Agentic Chat Widget**: Embeddable chat widget with SSE streaming, real-time status indicators, markdown rendering, AI-generated suggested actions, and configurable greetings.
- **BlackRock Synthetic Worker Demo**: Self-contained demo environment showcasing autonomous agent orchestration across multiple mock systems.

## External Dependencies
- **OpenAI**: Primary LLM provider for agent runtime, evaluations, AI enhancements, and embeddings.
- **Anthropic**: Secondary LLM provider for Claude models with tool calling.
- **PostgreSQL**: Primary database.
- **Express.js**: Backend web application framework.
- **React**: Frontend JavaScript library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Client-side routing library.
- **Drizzle ORM**: Object-Relational Mapper.
- **pgvector**: For similarity search within the Knowledge Base System.