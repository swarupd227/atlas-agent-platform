export function generateOpenAPISpec(baseUrl: string): object {
  return {
    openapi: "3.0.3",
    info: {
      title: "Nous Agent Orchestrator API",
      version: "1.0.0",
      description: "Complete REST API for the Nous Agent Orchestrator platform — an AI agent lifecycle management system covering agent creation, governance, evaluation, deployment, monitoring, and execution across industry verticals.",
      contact: {
        name: "Nous Platform Team",
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Current server",
      },
    ],
    security: [
      { ApiKeyBearer: [] },
      { ApiKeyHeader: [] },
      { CookieAuth: [] },
    ],
    components: {
      securitySchemes: {
        ApiKeyBearer: {
          type: "http",
          scheme: "bearer",
          description: "API key authentication using Authorization header. Keys are prefixed with `nous_` and generated per-agent. Usage: `Authorization: Bearer nous_xxxxxxxx...`",
        },
        ApiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Alternative API key header. Same key format (`nous_` prefix). Usage: `X-API-Key: nous_xxxxxxxx...`",
        },
        CookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "auth_token",
          description: "Session cookie set after login. Used by the web dashboard. JWT-based.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
        Agent: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Lead Qualifier" },
            role: { type: "string", example: "Qualifies inbound leads using CRM data" },
            model: { type: "string", example: "gpt-4o" },
            systemPrompt: { type: "string" },
            industry: { type: "string", example: "financial_services" },
            status: { type: "string", enum: ["active", "draft", "archived", "paused"] },
            autonomyMode: { type: "string", enum: ["supervised", "semi_autonomous", "autonomous"] },
            maxToolIterations: { type: "integer", example: 5 },
            outcomeId: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        AgentCreate: {
          type: "object",
          required: ["name", "role", "model"],
          properties: {
            name: { type: "string", example: "Lead Qualifier" },
            role: { type: "string", example: "Qualifies inbound leads using CRM data" },
            model: { type: "string", example: "gpt-4o" },
            systemPrompt: { type: "string", example: "You are an AI agent that qualifies sales leads." },
            industry: { type: "string", example: "financial_services" },
            autonomyMode: { type: "string", enum: ["supervised", "semi_autonomous", "autonomous"], default: "supervised" },
            maxToolIterations: { type: "integer", minimum: 1, maximum: 20, default: 5 },
            outcomeId: { type: "string", format: "uuid" },
          },
        },
        Outcome: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Increase Lead Conversion" },
            description: { type: "string" },
            industry: { type: "string" },
            status: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Deployment: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            agentId: { type: "string", format: "uuid" },
            version: { type: "string" },
            stage: { type: "string", enum: ["development", "staging", "canary", "production"] },
            status: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Policy: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "PII Redaction Policy" },
            domain: { type: "string", example: "data_privacy" },
            severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
            enabled: { type: "boolean" },
            rules: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        RuntimeRun: {
          type: "object",
          properties: {
            agentId: { type: "string", format: "uuid" },
            input: { type: "string", example: "Analyze the latest sales report" },
          },
          required: ["agentId", "input"],
        },
        RuntimeResult: {
          type: "object",
          properties: {
            traceId: { type: "string" },
            output: { type: "string" },
            toolCalls: { type: "array", items: { type: "object" } },
            policyResults: { type: "array", items: { type: "object" } },
            duration: { type: "number" },
          },
        },
        Trace: {
          type: "object",
          properties: {
            id: { type: "integer" },
            agentId: { type: "string", format: "uuid" },
            input: { type: "string" },
            output: { type: "string" },
            duration: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        KnowledgeBase: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            description: { type: "string" },
            industry: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        McpServer: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            url: { type: "string" },
            status: { type: "string" },
          },
        },
        Trigger: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            agentId: { type: "string", format: "uuid" },
            triggerType: { type: "string", enum: ["webhook", "schedule", "agent_completion", "mcp_resource_change"] },
            config: { type: "object" },
            enabled: { type: "boolean" },
            fireCount: { type: "integer" },
            lastFiredAt: { type: "string", format: "date-time", nullable: true },
          },
        },
        ApiKey: {
          type: "object",
          properties: {
            id: { type: "integer" },
            agentId: { type: "string", format: "uuid" },
            name: { type: "string" },
            keyPrefix: { type: "string", example: "nous_abc123..." },
            scopes: { type: "array", items: { type: "string" } },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        EvalSuite: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            agentId: { type: "string", format: "uuid" },
            status: { type: "string" },
          },
        },
      },
    },
    tags: [
      { name: "Authentication", description: "Login, register, and session management" },
      { name: "Agents", description: "Create, configure, and manage AI agents" },
      { name: "Runtime & Execution", description: "Execute agents, test runs, and manage active runtimes" },
      { name: "Deployments", description: "Deploy, promote, rollback, and monitor agent releases" },
      { name: "Outcomes & KPIs", description: "Define business outcomes, KPIs, and track evidence" },
      { name: "Governance & Policies", description: "Policy management, compliance checks, and enforcement" },
      { name: "Evaluations", description: "Evaluation suites, runs, and quality metrics" },
      { name: "Traces & Observability", description: "Execution traces, provenance, and observability" },
      { name: "Knowledge Base", description: "Document ingestion, RAG search, and knowledge management" },
      { name: "MCP Servers & Tools", description: "Model Context Protocol server registration, tools, and resources" },
      { name: "Event Triggers", description: "Webhooks, schedules, and event-driven agent triggers" },
      { name: "API Gateway", description: "Programmatic agent invocation via API keys" },
      { name: "Channels & Integrations", description: "Slack, Teams, Discord channels, and web widget" },
      { name: "Multi-Agent", description: "Agent teams, remote agents, and orchestration" },
      { name: "Approvals", description: "Approval workflows, gates, and human-in-the-loop" },
      { name: "Audit Trail", description: "Immutable audit log of all platform actions" },
      { name: "Autonomy & Calibration", description: "Autonomy engine calibration and maturity scoring" },
      { name: "Canary & Healing", description: "Canary deployments, healing pipelines, and runbooks" },
      { name: "Marketplace", description: "Agent marketplace, registry sources, and publishers" },
      { name: "Skills", description: "Agent skill definitions, composition, and evaluation" },
      { name: "Context & Memory", description: "Context studio, memory architecture, and optimization" },
      { name: "Pipelines", description: "Deployment pipelines and CI/CD workflows" },
      { name: "LLM Providers", description: "Multi-provider LLM management and health checks" },
      { name: "AI Utilities", description: "AI-powered enhancement, generation, and analysis endpoints" },
      { name: "Billing", description: "Metering, invoices, and usage tracking" },
    ],
    paths: {
      // === Authentication ===
      "/api/auth/mode": {
        get: {
          tags: ["Authentication"],
          summary: "Get authentication mode",
          description: "Returns whether the platform is in 'demo' or 'production' security mode.",
          responses: {
            "200": { description: "Authentication mode", content: { "application/json": { schema: { type: "object", properties: { mode: { type: "string", enum: ["demo", "production"] } } } } } },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Authentication"],
          summary: "Login",
          description: "Authenticate with username and password. Returns a JWT in an httpOnly cookie.",
          requestBody: {
            content: { "application/json": { schema: { type: "object", required: ["username", "password"], properties: { username: { type: "string", example: "admin" }, password: { type: "string", example: "password123" } } } } },
          },
          responses: {
            "200": { description: "Login successful" },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      "/api/auth/register": {
        post: {
          tags: ["Authentication"],
          summary: "Register a new user",
          requestBody: {
            content: { "application/json": { schema: { type: "object", required: ["username", "password", "role"], properties: { username: { type: "string" }, password: { type: "string" }, role: { type: "string", enum: ["admin", "developer", "reviewer", "viewer"] } } } } },
          },
          responses: {
            "201": { description: "User created" },
            "400": { description: "Username taken" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Authentication"],
          summary: "Logout",
          description: "Clears the auth_token cookie.",
          responses: { "200": { description: "Logged out" } },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Authentication"],
          summary: "Get current user",
          responses: { "200": { description: "Current user info" } },
        },
      },

      // === Agents ===
      "/api/agents": {
        get: {
          tags: ["Agents"],
          summary: "List all agents",
          description: "Returns all agents with their configurations, status, and metadata.",
          responses: {
            "200": { description: "Array of agents", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/Agent" } } } } },
          },
        },
        post: {
          tags: ["Agents"],
          summary: "Create a new agent",
          description: "Creates a new AI agent with the specified configuration. Requires create_modify_blueprints permission.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { "$ref": "#/components/schemas/AgentCreate" } } },
          },
          responses: {
            "201": { description: "Agent created", content: { "application/json": { schema: { "$ref": "#/components/schemas/Agent" } } } },
          },
        },
      },
      "/api/agents/{id}": {
        get: {
          tags: ["Agents"],
          summary: "Get agent by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: {
            "200": { description: "Agent details", content: { "application/json": { schema: { "$ref": "#/components/schemas/Agent" } } } },
            "404": { description: "Agent not found" },
          },
        },
        patch: {
          tags: ["Agents"],
          summary: "Update agent",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { content: { "application/json": { schema: { "$ref": "#/components/schemas/AgentCreate" } } } },
          responses: { "200": { description: "Agent updated" } },
        },
        delete: {
          tags: ["Agents"],
          summary: "Delete agent",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Agent deleted" } },
        },
      },
      "/api/agents/{id}/validate-config": {
        post: {
          tags: ["Agents"],
          summary: "Validate agent configuration",
          description: "Validates agent config against ontology requirements and policy constraints.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Validation results" } },
        },
      },
      "/api/agents/{id}/versions": {
        get: {
          tags: ["Agents"],
          summary: "Get agent version history",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of agent versions" } },
        },
      },
      "/api/agents/{id}/traces": {
        get: {
          tags: ["Agents"],
          summary: "Get agent execution traces",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of traces" } },
        },
      },
      "/api/agents/{id}/evals": {
        get: {
          tags: ["Agents"],
          summary: "Get agent evaluations",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of eval results" } },
        },
      },
      "/api/agents/{id}/recommendations": {
        get: {
          tags: ["Agents"],
          summary: "Get agent improvement recommendations",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Recommendations" } },
        },
      },
      "/api/agents/{id}/deployment-recommendation": {
        get: {
          tags: ["Agents"],
          summary: "Get deployment readiness recommendation",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Deployment recommendation with readiness score" } },
        },
      },
      "/api/agents/bulk-action": {
        post: {
          tags: ["Agents"],
          summary: "Perform bulk action on agents",
          description: "Apply an action (archive, activate, pause, delete) to multiple agents at once.",
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: { agentIds: { type: "array", items: { type: "string" } }, action: { type: "string", enum: ["archive", "activate", "pause", "delete"] } } } } },
          },
          responses: { "200": { description: "Bulk action result" } },
        },
      },

      // === API Keys (per Agent) ===
      "/api/agents/{agentId}/api-keys": {
        get: {
          tags: ["API Gateway"],
          summary: "List API keys for an agent",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of API keys (hashes redacted)", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/ApiKey" } } } } } },
        },
        post: {
          tags: ["API Gateway"],
          summary: "Generate a new API key",
          description: "Creates a new API key for the agent. The raw key is returned ONLY in this response — store it securely.",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", example: "Production Key" }, scopes: { type: "array", items: { type: "string" }, default: ["invoke"] }, expiresInDays: { type: "integer", example: 90 } } } } },
          },
          responses: {
            "201": { description: "API key created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" }, key: { type: "string", example: "nous_abc123def456..." }, name: { type: "string" } } } } } },
          },
        },
      },
      "/api/agents/{agentId}/api-keys/{keyId}": {
        delete: {
          tags: ["API Gateway"],
          summary: "Revoke an API key",
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "keyId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Key revoked" } },
        },
      },
      "/api/gateway/v1/invoke/{agentId}": {
        post: {
          tags: ["API Gateway"],
          summary: "Invoke an agent via API",
          description: "Execute an agent programmatically using an API key. This is the primary endpoint for SDK/CLI integration.",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          security: [{ ApiKeyBearer: [] }, { ApiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["input"], properties: { input: { type: "string", example: "Analyze Q4 sales pipeline and recommend top 5 leads" } } } } },
          },
          responses: {
            "200": { description: "Agent execution result", content: { "application/json": { schema: { "$ref": "#/components/schemas/RuntimeResult" } } } },
            "401": { description: "Invalid or missing API key" },
            "403": { description: "Key does not belong to this agent or has expired" },
          },
        },
      },

      // === Runtime & Execution ===
      "/api/runtime/run": {
        post: {
          tags: ["Runtime & Execution"],
          summary: "Execute an agent",
          description: "Run an agent with the given input. Returns the full execution result including tool calls, policy checks, and trace ID.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { "$ref": "#/components/schemas/RuntimeRun" } } },
          },
          responses: {
            "200": { description: "Execution result", content: { "application/json": { schema: { "$ref": "#/components/schemas/RuntimeResult" } } } },
          },
        },
      },
      "/api/agents/{id}/run-test": {
        post: {
          tags: ["Runtime & Execution"],
          summary: "Run a test execution",
          description: "Execute an agent in test mode for validation before deployment.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: { input: { type: "string", example: "Test input for the agent" } } } } },
          },
          responses: { "200": { description: "Test execution result" } },
        },
      },
      "/api/agent-runtime/active": {
        get: {
          tags: ["Runtime & Execution"],
          summary: "List active agent runtimes",
          responses: { "200": { description: "Array of active runtimes" } },
        },
      },
      "/api/agent-runtime/runs": {
        get: {
          tags: ["Runtime & Execution"],
          summary: "List recent runtime runs",
          parameters: [{ name: "agentId", in: "query", required: false, schema: { type: "string" } }],
          responses: { "200": { description: "Array of runtime runs" } },
        },
      },
      "/api/agent-runtime/runs/{id}": {
        get: {
          tags: ["Runtime & Execution"],
          summary: "Get runtime run details",
          description: "Retrieve the full execution trace including all intermediate steps (LLM plans, tool calls, policy results).",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Runtime run details with execution trace" } },
        },
      },
      "/api/live-agent-test": {
        post: {
          tags: ["Runtime & Execution"],
          summary: "Live agent test",
          description: "Run an ad-hoc live test with a prompt against an agent.",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { agentId: { type: "string" }, prompt: { type: "string" } } } } } },
          responses: { "200": { description: "Test result" } },
        },
      },

      // === Deployments ===
      "/api/deployments": {
        get: {
          tags: ["Deployments"],
          summary: "List all deployments",
          responses: { "200": { description: "Array of deployments" } },
        },
        post: {
          tags: ["Deployments"],
          summary: "Create a deployment",
          description: "Deploy an agent version to a target stage.",
          requestBody: {
            content: { "application/json": { schema: { "$ref": "#/components/schemas/Deployment" } } },
          },
          responses: { "201": { description: "Deployment created" } },
        },
      },
      "/api/deployments/{id}": {
        get: {
          tags: ["Deployments"],
          summary: "Get deployment details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Deployment details" } },
        },
        patch: {
          tags: ["Deployments"],
          summary: "Update deployment",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Deployment updated" } },
        },
      },
      "/api/deployments/{id}/promote": {
        post: {
          tags: ["Deployments"],
          summary: "Promote deployment",
          description: "Promote a deployment to the next stage (e.g., staging → production). Runs policy checks and approval gates.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Promotion result" } },
        },
      },
      "/api/deployments/{id}/rollback": {
        post: {
          tags: ["Deployments"],
          summary: "Rollback deployment",
          description: "Revert a deployment to a previous stable state.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Rollback result" } },
        },
      },
      "/api/deployments/{id}/readiness": {
        get: {
          tags: ["Deployments"],
          summary: "Check deployment readiness",
          description: "Evaluate whether a deployment meets all gates (evaluations, approvals, policy compliance).",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Readiness assessment with gate statuses" } },
        },
      },
      "/api/deployments/{id}/start-runtime": {
        post: {
          tags: ["Deployments"],
          summary: "Start deployment runtime",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Runtime started" } },
        },
      },
      "/api/deployments/{id}/stop-runtime": {
        post: {
          tags: ["Deployments"],
          summary: "Stop deployment runtime",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Runtime stopped" } },
        },
      },
      "/api/deployments/{id}/runtime-status": {
        get: {
          tags: ["Deployments"],
          summary: "Get deployment runtime status",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Runtime status" } },
        },
      },
      "/api/deployments/{id}/routing": {
        post: {
          tags: ["Deployments"],
          summary: "Configure traffic routing",
          description: "Set traffic split between deployment versions (blue/green, canary percentages).",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Routing configured" } },
        },
      },
      "/api/deployments/{id}/auto-promote": {
        post: {
          tags: ["Deployments"],
          summary: "Auto-promote deployment",
          description: "Automatically promote a deployment if all quality gates pass.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Auto-promotion result" } },
        },
      },
      "/api/deployments/health": {
        get: {
          tags: ["Deployments"],
          summary: "Get deployment health overview",
          responses: { "200": { description: "Health status for all deployments" } },
        },
      },
      "/api/deployments/freeze-status": {
        get: {
          tags: ["Deployments"],
          summary: "Get deployment freeze status",
          responses: { "200": { description: "Current freeze status" } },
        },
      },
      "/api/deployments/freeze": {
        post: {
          tags: ["Deployments"],
          summary: "Freeze/unfreeze deployments",
          description: "Enable or disable a deployment freeze window.",
          responses: { "200": { description: "Freeze status updated" } },
        },
      },
      "/api/deployments/{id}/run-pipeline": {
        post: {
          tags: ["Deployments"],
          summary: "Run deployment pipeline",
          description: "Execute the full deployment pipeline with evaluation, policy, and approval stages.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Pipeline execution result" } },
        },
      },
      "/api/deployments/{id}/execute-now": {
        post: {
          tags: ["Deployments"],
          summary: "Execute deployed agent",
          description: "Send a prompt to a deployed agent for immediate execution.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Execution result" } },
        },
      },
      "/api/agents/{id}/deploy-and-run": {
        post: {
          tags: ["Deployments"],
          summary: "Deploy and run agent",
          description: "Create a deployment and immediately execute the agent.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Deploy and run result" } },
        },
      },

      // === Outcomes & KPIs ===
      "/api/outcomes": {
        get: {
          tags: ["Outcomes & KPIs"],
          summary: "List all outcomes",
          responses: { "200": { description: "Array of outcomes" } },
        },
        post: {
          tags: ["Outcomes & KPIs"],
          summary: "Create an outcome",
          requestBody: { content: { "application/json": { schema: { "$ref": "#/components/schemas/Outcome" } } } },
          responses: { "201": { description: "Outcome created" } },
        },
      },
      "/api/outcomes/{id}": {
        get: {
          tags: ["Outcomes & KPIs"],
          summary: "Get outcome by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Outcome details" } },
        },
        patch: {
          tags: ["Outcomes & KPIs"],
          summary: "Update outcome",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Outcome updated" } },
        },
        delete: {
          tags: ["Outcomes & KPIs"],
          summary: "Delete outcome",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Outcome deleted" } },
        },
      },
      "/api/outcomes/{id}/kpis": {
        get: {
          tags: ["Outcomes & KPIs"],
          summary: "Get KPIs for an outcome",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of KPIs" } },
        },
      },
      "/api/outcomes/{id}/evidence": {
        get: {
          tags: ["Outcomes & KPIs"],
          summary: "Get evidence for an outcome",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Evidence entries" } },
        },
      },
      "/api/outcomes/{id}/recompute": {
        post: {
          tags: ["Outcomes & KPIs"],
          summary: "Recompute outcome metrics",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Recomputation result" } },
        },
      },
      "/api/outcomes/{id}/agent-contributions": {
        get: {
          tags: ["Outcomes & KPIs"],
          summary: "Get agent contributions to outcome",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Agent contribution breakdown" } },
        },
      },
      "/api/outcomes/{id}/financial-ledger": {
        get: {
          tags: ["Outcomes & KPIs"],
          summary: "Get financial ledger for outcome",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Financial ledger entries" } },
        },
      },
      "/api/kpis": {
        get: {
          tags: ["Outcomes & KPIs"],
          summary: "List all KPIs",
          responses: { "200": { description: "Array of KPIs" } },
        },
        post: {
          tags: ["Outcomes & KPIs"],
          summary: "Create a KPI",
          responses: { "201": { description: "KPI created" } },
        },
      },
      "/api/kpis/{id}": {
        patch: {
          tags: ["Outcomes & KPIs"],
          summary: "Update KPI",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "KPI updated" } },
        },
        delete: {
          tags: ["Outcomes & KPIs"],
          summary: "Delete KPI",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "KPI deleted" } },
        },
      },

      // === Governance & Policies ===
      "/api/policies": {
        get: {
          tags: ["Governance & Policies"],
          summary: "List all policies",
          responses: { "200": { description: "Array of policies" } },
        },
      },
      "/api/policies/bulk-create": {
        post: {
          tags: ["Governance & Policies"],
          summary: "Bulk create policies",
          description: "Create multiple policies at once (e.g., from a policy pack activation).",
          responses: { "200": { description: "Bulk creation result" } },
        },
      },
      "/api/policy-check": {
        post: {
          tags: ["Governance & Policies"],
          summary: "Run policy check",
          description: "Check a payload or agent configuration against active policies.",
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: { agentId: { type: "string" }, content: { type: "string" }, context: { type: "object" } } } } },
          },
          responses: { "200": { description: "Policy check results" } },
        },
      },

      // === Evaluations ===
      "/api/evals": {
        get: {
          tags: ["Evaluations"],
          summary: "List evaluation suites",
          responses: { "200": { description: "Array of eval suites" } },
        },
        post: {
          tags: ["Evaluations"],
          summary: "Create evaluation suite",
          responses: { "201": { description: "Eval suite created" } },
        },
      },
      "/api/eval-runs": {
        get: {
          tags: ["Evaluations"],
          summary: "List evaluation runs",
          responses: { "200": { description: "Array of eval runs" } },
        },
      },
      "/api/eval/results": {
        get: {
          tags: ["Evaluations"],
          summary: "Get evaluation results",
          parameters: [{ name: "suiteId", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Evaluation results" } },
        },
      },

      // === Traces & Observability ===
      "/api/traces": {
        get: {
          tags: ["Traces & Observability"],
          summary: "List execution traces",
          description: "List all execution traces across agents. Supports pagination and filtering.",
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Array of traces", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/Trace" } } } } } },
        },
        post: {
          tags: ["Traces & Observability"],
          summary: "Create a trace",
          responses: { "201": { description: "Trace created" } },
        },
      },
      "/api/traces/{id}": {
        get: {
          tags: ["Traces & Observability"],
          summary: "Get trace details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Trace with full execution details" } },
        },
      },
      "/api/provenance/{traceId}": {
        get: {
          tags: ["Traces & Observability"],
          summary: "Get trace provenance",
          description: "Retrieve the full provenance chain for a trace — inputs, outputs, decisions, and tool calls.",
          parameters: [{ name: "traceId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Provenance chain" } },
        },
      },
      "/api/provenance/{traceId}/reconstruct": {
        get: {
          tags: ["Traces & Observability"],
          summary: "Reconstruct trace execution",
          parameters: [{ name: "traceId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Reconstructed execution" } },
        },
      },
      "/api/provenance/{traceId}/diff": {
        get: {
          tags: ["Traces & Observability"],
          summary: "Get trace diff",
          parameters: [{ name: "traceId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Diff between trace versions" } },
        },
      },
      "/api/provenance/{traceId}/export": {
        get: {
          tags: ["Traces & Observability"],
          summary: "Export trace",
          parameters: [{ name: "traceId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Exported trace data" } },
        },
      },
      "/api/provenance/verify-integrity": {
        post: {
          tags: ["Traces & Observability"],
          summary: "Verify trace integrity",
          description: "Verify the cryptographic integrity of trace provenance records.",
          responses: { "200": { description: "Integrity verification result" } },
        },
      },

      // === Knowledge Base ===
      "/api/knowledge-bases": {
        get: {
          tags: ["Knowledge Base"],
          summary: "List knowledge bases",
          responses: { "200": { description: "Array of knowledge bases" } },
        },
        post: {
          tags: ["Knowledge Base"],
          summary: "Create a knowledge base",
          requestBody: {
            content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" }, industry: { type: "string" } } } } },
          },
          responses: { "201": { description: "Knowledge base created" } },
        },
      },
      "/api/knowledge-bases/{id}": {
        get: {
          tags: ["Knowledge Base"],
          summary: "Get knowledge base details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Knowledge base details" } },
        },
        patch: {
          tags: ["Knowledge Base"],
          summary: "Update knowledge base",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          tags: ["Knowledge Base"],
          summary: "Delete knowledge base",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Deleted" } },
        },
      },
      "/api/knowledge-bases/{id}/sources": {
        get: {
          tags: ["Knowledge Base"],
          summary: "List knowledge base sources",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Array of sources" } },
        },
      },
      "/api/knowledge-bases/{id}/sources/upload": {
        post: {
          tags: ["Knowledge Base"],
          summary: "Upload a document source",
          description: "Upload a file (PDF, TXT, CSV, etc.) to the knowledge base for ingestion.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } } },
          responses: { "201": { description: "Source uploaded and queued for processing" } },
        },
      },
      "/api/knowledge-bases/{id}/sources/url": {
        post: {
          tags: ["Knowledge Base"],
          summary: "Add URL source",
          description: "Scrape and ingest a web page into the knowledge base.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", example: "https://docs.example.com" } } } } } },
          responses: { "201": { description: "URL source added" } },
        },
      },
      "/api/knowledge-bases/{id}/sources/text": {
        post: {
          tags: ["Knowledge Base"],
          summary: "Add text source",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } } } } } },
          responses: { "201": { description: "Text source added" } },
        },
      },
      "/api/knowledge-bases/{id}/search": {
        post: {
          tags: ["Knowledge Base"],
          summary: "Search knowledge base",
          description: "Perform a semantic search across the knowledge base using embeddings.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { query: { type: "string", example: "What are our data retention policies?" }, topK: { type: "integer", default: 5 } } } } } },
          responses: { "200": { description: "Search results with relevance scores" } },
        },
      },
      "/api/knowledge-bases/{id}/query": {
        post: {
          tags: ["Knowledge Base"],
          summary: "RAG query",
          description: "Ask a natural language question against the knowledge base using RAG (Retrieval-Augmented Generation).",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" } } } } } },
          responses: { "200": { description: "RAG-generated answer with source citations" } },
        },
      },
      "/api/knowledge-bases/{id}/embed": {
        post: {
          tags: ["Knowledge Base"],
          summary: "Generate embeddings",
          description: "Trigger embedding generation for all sources in the knowledge base.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Embedding generation started" } },
        },
      },
      "/api/knowledge-bases/{id}/auto-tune": {
        post: {
          tags: ["Knowledge Base"],
          summary: "Auto-tune RAG pipeline",
          description: "Automatically optimize chunking, overlap, and retrieval parameters.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Auto-tune recommendations" } },
        },
      },
      "/api/agents/{agentId}/knowledge-bases": {
        get: {
          tags: ["Knowledge Base"],
          summary: "List knowledge bases linked to agent",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of linked knowledge bases" } },
        },
        post: {
          tags: ["Knowledge Base"],
          summary: "Link knowledge base to agent",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { knowledgeBaseId: { type: "integer" } } } } } },
          responses: { "201": { description: "Knowledge base linked" } },
        },
      },

      // === MCP Servers & Tools ===
      "/api/mcp-servers": {
        get: {
          tags: ["MCP Servers & Tools"],
          summary: "List MCP servers",
          responses: { "200": { description: "Array of registered MCP servers" } },
        },
        post: {
          tags: ["MCP Servers & Tools"],
          summary: "Register MCP server",
          responses: { "201": { description: "MCP server registered" } },
        },
      },
      "/api/mcp-servers/{id}": {
        get: {
          tags: ["MCP Servers & Tools"],
          summary: "Get MCP server details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "MCP server details with tools and resources" } },
        },
        patch: {
          tags: ["MCP Servers & Tools"],
          summary: "Update MCP server",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          tags: ["MCP Servers & Tools"],
          summary: "Delete MCP server",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Deleted" } },
        },
      },
      "/api/agents/{agentId}/mcp-servers": {
        get: {
          tags: ["MCP Servers & Tools"],
          summary: "List MCP servers linked to agent",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of linked MCP servers" } },
        },
        post: {
          tags: ["MCP Servers & Tools"],
          summary: "Link MCP server to agent",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "201": { description: "MCP server linked" } },
        },
      },

      // === Event Triggers ===
      "/api/agents/{agentId}/triggers": {
        get: {
          tags: ["Event Triggers"],
          summary: "List triggers for agent",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of triggers", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/Trigger" } } } } } },
        },
        post: {
          tags: ["Event Triggers"],
          summary: "Create a trigger",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            content: { "application/json": { schema: { type: "object", required: ["triggerType"], properties: { triggerType: { type: "string", enum: ["webhook", "schedule", "agent_completion", "mcp_resource_change"] }, config: { type: "object", example: { secret: "my-secret" } }, enabled: { type: "boolean", default: true } } } } },
          },
          responses: { "201": { description: "Trigger created" } },
        },
      },
      "/api/agents/{agentId}/triggers/{triggerId}": {
        patch: {
          tags: ["Event Triggers"],
          summary: "Update trigger",
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "triggerId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Trigger updated" } },
        },
        delete: {
          tags: ["Event Triggers"],
          summary: "Delete trigger",
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "triggerId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Trigger deleted" } },
        },
      },
      "/api/webhooks/{triggerId}": {
        post: {
          tags: ["Event Triggers"],
          summary: "Receive webhook",
          description: "External webhook receiver. Validates the trigger's secret (if configured) and enqueues agent execution.",
          parameters: [{ name: "triggerId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", description: "Arbitrary webhook payload" } } } },
          responses: {
            "200": { description: "Webhook accepted and agent execution queued" },
            "401": { description: "Invalid secret" },
            "404": { description: "Trigger not found" },
          },
        },
      },

      // === Channels & Integrations ===
      "/api/agents/{agentId}/channels": {
        get: {
          tags: ["Channels & Integrations"],
          summary: "List agent channels",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of configured channels" } },
        },
        post: {
          tags: ["Channels & Integrations"],
          summary: "Create agent channel",
          description: "Connect an agent to a communication channel (Slack, Teams, Discord, email, or web widget).",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "201": { description: "Channel created" } },
        },
      },

      // === Approvals ===
      "/api/approvals": {
        get: {
          tags: ["Approvals"],
          summary: "List approval requests",
          responses: { "200": { description: "Array of approval requests" } },
        },
        post: {
          tags: ["Approvals"],
          summary: "Create approval request",
          responses: { "201": { description: "Approval request created" } },
        },
      },
      "/api/approvals/{id}": {
        get: {
          tags: ["Approvals"],
          summary: "Get approval request details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Approval request details" } },
        },
        patch: {
          tags: ["Approvals"],
          summary: "Update approval (approve/reject)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Updated" } },
        },
      },

      // === Audit Trail ===
      "/api/audit-trail": {
        get: {
          tags: ["Audit Trail"],
          summary: "Query audit trail",
          description: "Retrieve immutable audit log entries. Supports filtering by actor, action, and time range.",
          parameters: [
            { name: "actorId", in: "query", schema: { type: "string" } },
            { name: "action", in: "query", schema: { type: "string" } },
            { name: "objectType", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Array of audit events" } },
        },
      },

      // === Multi-Agent ===
      "/api/agent-teams": {
        get: {
          tags: ["Multi-Agent"],
          summary: "List agent teams",
          responses: { "200": { description: "Array of agent teams" } },
        },
        post: {
          tags: ["Multi-Agent"],
          summary: "Create agent team",
          responses: { "201": { description: "Team created" } },
        },
      },
      "/api/remote-agents": {
        get: {
          tags: ["Multi-Agent"],
          summary: "List remote agents",
          responses: { "200": { description: "Array of remote agents" } },
        },
        post: {
          tags: ["Multi-Agent"],
          summary: "Register remote agent",
          responses: { "201": { description: "Remote agent registered" } },
        },
      },

      // === Autonomy & Calibration ===
      "/api/autonomy/calibrate": {
        post: {
          tags: ["Autonomy & Calibration"],
          summary: "Calibrate agent autonomy",
          description: "Run autonomy calibration to determine optimal autonomy level based on agent performance history.",
          responses: { "200": { description: "Calibration result" } },
        },
      },
      "/api/autonomy/compute-maturity": {
        post: {
          tags: ["Autonomy & Calibration"],
          summary: "Compute autonomy maturity score",
          responses: { "200": { description: "Maturity score" } },
        },
      },
      "/api/autonomy/industry-baselines": {
        get: {
          tags: ["Autonomy & Calibration"],
          summary: "Get industry autonomy baselines",
          responses: { "200": { description: "Industry-specific baseline configurations" } },
        },
      },

      // === Canary & Healing ===
      "/api/canary-deployments": {
        get: {
          tags: ["Canary & Healing"],
          summary: "List canary deployments",
          responses: { "200": { description: "Array of canary deployments" } },
        },
        post: {
          tags: ["Canary & Healing"],
          summary: "Create canary deployment",
          responses: { "201": { description: "Canary deployment created" } },
        },
      },
      "/api/healing-pipelines": {
        get: {
          tags: ["Canary & Healing"],
          summary: "List healing pipelines",
          responses: { "200": { description: "Array of healing pipelines" } },
        },
        post: {
          tags: ["Canary & Healing"],
          summary: "Create healing pipeline",
          responses: { "201": { description: "Pipeline created" } },
        },
      },
      "/api/healing-pipelines/auto-detect": {
        post: {
          tags: ["Canary & Healing"],
          summary: "Auto-detect healing opportunities",
          description: "Analyze agent performance data to automatically detect issues and suggest healing actions.",
          responses: { "200": { description: "Auto-detection results" } },
        },
      },
      "/api/runbooks": {
        get: {
          tags: ["Canary & Healing"],
          summary: "List runbooks",
          responses: { "200": { description: "Array of runbooks" } },
        },
        post: {
          tags: ["Canary & Healing"],
          summary: "Create runbook",
          responses: { "201": { description: "Runbook created" } },
        },
      },

      // === Marketplace ===
      "/api/marketplace/registry-sources": {
        get: {
          tags: ["Marketplace"],
          summary: "List marketplace registry sources",
          responses: { "200": { description: "Array of registry sources" } },
        },
      },

      // === Skills ===
      "/api/skills": {
        get: {
          tags: ["Skills"],
          summary: "List agent skills",
          responses: { "200": { description: "Array of skills" } },
        },
        post: {
          tags: ["Skills"],
          summary: "Create skill",
          responses: { "201": { description: "Skill created" } },
        },
      },

      // === Pipelines ===
      "/api/pipelines": {
        get: {
          tags: ["Pipelines"],
          summary: "List deployment pipelines",
          responses: { "200": { description: "Array of pipelines" } },
        },
        post: {
          tags: ["Pipelines"],
          summary: "Create pipeline",
          responses: { "201": { description: "Pipeline created" } },
        },
      },
      "/api/pipelines/{id}/runs": {
        get: {
          tags: ["Pipelines"],
          summary: "List pipeline runs",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Array of pipeline runs" } },
        },
        post: {
          tags: ["Pipelines"],
          summary: "Start pipeline run",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "201": { description: "Pipeline run started" } },
        },
      },

      // === LLM Providers ===
      "/api/llm-providers": {
        get: {
          tags: ["LLM Providers"],
          summary: "List LLM providers",
          description: "Returns available LLM providers (OpenAI, Anthropic, etc.) with their models and status.",
          responses: { "200": { description: "Array of LLM providers" } },
        },
      },
      "/api/llm-providers/health": {
        get: {
          tags: ["LLM Providers"],
          summary: "Check LLM provider health",
          responses: { "200": { description: "Health status for all providers" } },
        },
      },
      "/api/llm-providers/usage": {
        get: {
          tags: ["LLM Providers"],
          summary: "Get LLM provider usage",
          responses: { "200": { description: "Usage statistics per provider" } },
        },
      },

      // === Shadow Replay ===
      "/api/shadow-traces": {
        get: {
          tags: ["Traces & Observability"],
          summary: "List shadow traces",
          responses: { "200": { description: "Array of shadow traces" } },
        },
        post: {
          tags: ["Traces & Observability"],
          summary: "Create shadow trace",
          responses: { "201": { description: "Shadow trace created" } },
        },
      },
      "/api/shadow-replay-sessions": {
        get: {
          tags: ["Traces & Observability"],
          summary: "List shadow replay sessions",
          responses: { "200": { description: "Array of replay sessions" } },
        },
        post: {
          tags: ["Traces & Observability"],
          summary: "Create shadow replay session",
          responses: { "201": { description: "Replay session created" } },
        },
      },

      // === Playground ===
      "/api/agents/{agentId}/playground/sessions": {
        get: {
          tags: ["Runtime & Execution"],
          summary: "List playground sessions",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Array of playground sessions" } },
        },
        post: {
          tags: ["Runtime & Execution"],
          summary: "Create playground session",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "201": { description: "Session created" } },
        },
      },
      "/api/agents/{agentId}/playground/chat": {
        post: {
          tags: ["Runtime & Execution"],
          summary: "Send playground chat message",
          description: "Send a message to an agent in the playground. Returns SSE stream with real-time progress events.",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: { content: { type: "string" }, sessionId: { type: "integer" } } } } },
          },
          responses: { "200": { description: "SSE stream with progress events and final response" } },
        },
      },

      // === Context & Memory ===
      "/api/context-profiles/{id}/auto-adjust": {
        post: {
          tags: ["Context & Memory"],
          summary: "Auto-adjust context profile",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Adjustment result" } },
        },
      },
      "/api/context-economics/agent/{agentId}/roi": {
        get: {
          tags: ["Context & Memory"],
          summary: "Get context ROI for agent",
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Context economics ROI analysis" } },
        },
      },

      // === AI Utilities ===
      "/api/ai/enhance-policy-rules": {
        post: {
          tags: ["AI Utilities"],
          summary: "AI-enhance policy rules",
          description: "Use AI to generate enhanced policy rules and suggestions.",
          responses: { "200": { description: "Enhanced rules" } },
        },
      },
      "/api/ai/enhance-policy-pack": {
        post: {
          tags: ["AI Utilities"],
          summary: "AI-enhance policy pack",
          description: "Generate enhanced description and policy suggestions for a policy pack.",
          responses: { "200": { description: "Enhanced pack suggestions" } },
        },
      },
      "/api/ai/generate-shadow-traces": {
        post: {
          tags: ["AI Utilities"],
          summary: "Generate synthetic shadow traces",
          responses: { "200": { description: "Generated traces" } },
        },
      },
      "/api/ai/canary-analyze": {
        post: {
          tags: ["AI Utilities"],
          summary: "AI canary analysis",
          description: "Use AI to analyze canary deployment metrics and provide recommendations.",
          responses: { "200": { description: "Analysis result" } },
        },
      },
      "/api/ai/healing-diagnose": {
        post: {
          tags: ["AI Utilities"],
          summary: "AI healing diagnosis",
          description: "AI-powered diagnosis of agent failures and suggested fixes.",
          responses: { "200": { description: "Diagnosis result" } },
        },
      },

      // === Billing ===
      "/api/billing/metering": {
        get: {
          tags: ["Billing"],
          summary: "Get metering data",
          responses: { "200": { description: "Usage metering data" } },
        },
      },
      "/api/billing/invoices": {
        get: {
          tags: ["Billing"],
          summary: "List invoices",
          responses: { "200": { description: "Array of invoices" } },
        },
      },

      // === Exports ===
      "/api/exports/outcome/{id}/audit": {
        post: {
          tags: ["Outcomes & KPIs"],
          summary: "Export outcome audit report",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Audit report export" } },
        },
      },
    },
  };
}
