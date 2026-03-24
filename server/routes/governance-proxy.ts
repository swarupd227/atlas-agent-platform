import { Router } from "express";
import { storage } from "../storage";
import { z, ZodError } from "zod";

const router = Router();

  // Policy Resolver
  // ──────────────────────────────────
  async function resolvePolicyBundle(agentId: string) {
    const agent = await storage.getAgent(agentId);
    const allPolicies = await storage.getPolicies();
    const activePolicies = allPolicies.filter(p => p.status === "active");

    const orgPolicies = activePolicies.filter(p => p.scopeType === "org");
    const outcomePolicies = agent?.outcomeId
      ? activePolicies.filter(p => p.scopeType === "outcome" && p.scopeId === agent.outcomeId)
      : [];
    const agentPolicies = activePolicies.filter(p => p.scopeType === "agent" && p.scopeId === agentId);
    const envPolicies = agent?.environment
      ? activePolicies.filter(p => p.scopeType === "env" && p.scopeId === agent.environment)
      : [];

    const toolAllowlist: string[] = [];
    const blockedTools: string[] = [];
    const guardrails: string[] = [];
    const redactPatterns: string[] = [];

    const allScoped = [...orgPolicies, ...outcomePolicies, ...agentPolicies, ...envPolicies];
    for (const p of allScoped) {
      const pj = p.policyJson as Record<string, unknown> | null;
      if (!pj) continue;
      if (Array.isArray(pj.toolAllowlist)) toolAllowlist.push(...(pj.toolAllowlist as string[]));
      if (Array.isArray(pj.blockedTools)) blockedTools.push(...(pj.blockedTools as string[]));
      if (Array.isArray(pj.guardrails)) guardrails.push(...(pj.guardrails as string[]));
      if (Array.isArray(pj.redactPatterns)) redactPatterns.push(...(pj.redactPatterns as string[]));
    }

    return {
      appliedPolicies: allScoped.map(p => ({ id: p.id, name: p.name, scope: p.scopeType, domain: p.domain })),
      toolAllowlist: Array.from(new Set(toolAllowlist)),
      blockedTools: Array.from(new Set(blockedTools)),
      guardrails: Array.from(new Set(guardrails)),
      redactPatterns: Array.from(new Set(redactPatterns)),
      agentConfig: agent ? {
        autonomyMode: agent.autonomyMode,
        riskTier: agent.riskTier,
        modelProvider: agent.modelProvider,
        modelName: agent.modelName,
        toolAccessClass: agent.toolAccessClass,
      } : null,
    };
  }

  // ──────────────────────────────────
  // Tool Proxy with rate limiting, retry/backoff, shadow dry-run, audit logging
  // ──────────────────────────────────
  const toolRateLimiter: Map<string, { timestamps: number[]; limit: number; windowMs: number }> = new Map();

  function checkRateLimit(agentId: string, toolName: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
    const key = `${agentId}:${toolName}`;
    const now = Date.now();
    const windowMs = 60_000;
    const limit = 100;

    if (!toolRateLimiter.has(key)) {
      toolRateLimiter.set(key, { timestamps: [], limit, windowMs });
    }
    const bucket = toolRateLimiter.get(key)!;
    bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);

    if (bucket.timestamps.length >= limit) {
      const oldest = bucket.timestamps[0];
      return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - oldest) };
    }

    bucket.timestamps.push(now);
    return { allowed: true, remaining: limit - bucket.timestamps.length };
  }

  async function proxyToolCall(
    toolName: string,
    toolInput: Record<string, unknown>,
    policyBundle: Awaited<ReturnType<typeof resolvePolicyBundle>>,
    options: { agentId: string; traceId?: string; environment?: string; shadow?: boolean } = { agentId: "unknown" }
  ): Promise<{ allowed: boolean; result: Record<string, unknown>; policyCheck: Record<string, unknown>; rateLimit?: { remaining: number }; shadow?: boolean; retryAttempts?: number }> {
    const blocked = policyBundle.blockedTools.includes(toolName);
    const allowlistExists = policyBundle.toolAllowlist.length > 0;
    const onAllowlist = policyBundle.toolAllowlist.includes(toolName);
    const allowed = !blocked && (!allowlistExists || onAllowlist);

    const policyCheck: Record<string, unknown> = {
      tool: toolName,
      allowed,
      reason: blocked
        ? `Tool "${toolName}" is blocked by policy`
        : (allowlistExists && !onAllowlist)
          ? `Tool "${toolName}" is not on the allowlist`
          : "Allowed",
      checkedPolicies: policyBundle.appliedPolicies.map(p => p.name),
    };

    await storage.createAuditEvent({
      action: "tool_proxy_call",
      objectType: "tool",
      objectId: toolName,
      actorId: options.agentId,
      actorType: "agent",
      details: `Tool proxy: ${toolName} by agent ${options.agentId}. Allowed=${allowed}, env=${options.environment || "unknown"}, shadow=${options.shadow || false}, inputKeys=[${Object.keys(toolInput).join(",")}]`,
    });

    if (!allowed) {
      return {
        allowed: false,
        result: { error: policyCheck.reason, blocked: true },
        policyCheck,
      };
    }

    // Rate limiting check
    const rateCheck = checkRateLimit(options.agentId, toolName);
    if (!rateCheck.allowed) {
      policyCheck.rateLimited = true;
      policyCheck.retryAfterMs = rateCheck.retryAfterMs;
      await storage.createAuditEvent({
        action: "tool_proxy_rate_limited",
        objectType: "tool",
        objectId: toolName,
        actorId: options.agentId,
        actorType: "agent",
        details: `Rate limit exceeded for ${toolName} by agent ${options.agentId}. Retry after ${rateCheck.retryAfterMs}ms`,
      });
      return {
        allowed: false,
        result: { error: `Rate limit exceeded for tool "${toolName}". Retry after ${rateCheck.retryAfterMs}ms`, rateLimited: true, retryAfterMs: rateCheck.retryAfterMs },
        policyCheck,
        rateLimit: { remaining: 0 },
      };
    }

    // Apply redaction to input
    let redactedInput = { ...toolInput };
    for (const pattern of policyBundle.redactPatterns) {
      try {
        const re = new RegExp(pattern, "gi");
        for (const key of Object.keys(redactedInput)) {
          if (typeof redactedInput[key] === "string") {
            redactedInput[key] = (redactedInput[key] as string).replace(re, "[REDACTED]");
          }
        }
      } catch {}
    }

    // Shadow dry-run mode: log but don't execute
    if (options.shadow) {
      const dryRunResult: Record<string, unknown> = {
        toolName,
        status: "dry_run",
        mode: "shadow",
        output: `[DRY RUN] Would execute ${toolName} in shadow mode`,
        input: redactedInput,
        executedAt: new Date().toISOString(),
      };
      await storage.createAuditEvent({
        action: "tool_proxy_shadow_dry_run",
        objectType: "tool",
        objectId: toolName,
        actorId: options.agentId,
        actorType: "agent",
        details: `Shadow dry-run: ${toolName} for agent ${options.agentId}. Input logged but not executed.`,
      });
      return { allowed: true, result: dryRunResult, policyCheck, rateLimit: { remaining: rateCheck.remaining }, shadow: true };
    }

    // Simulate execution with retry/backoff logic
    const maxRetries = 3;
    let retryAttempts = 0;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const simulatedResult: Record<string, unknown> = {
          toolName,
          status: "success",
          output: `Executed ${toolName} successfully`,
          executedAt: new Date().toISOString(),
          redactedFields: policyBundle.redactPatterns.length > 0 ? policyBundle.redactPatterns : undefined,
          attempt: attempt + 1,
        };
        return { allowed: true, result: simulatedResult, policyCheck, rateLimit: { remaining: rateCheck.remaining }, retryAttempts };
      } catch (err: any) {
        retryAttempts = attempt + 1;
        lastError = err.message || "Unknown error";
        if (attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    return {
      allowed: true,
      result: { toolName, status: "failed", error: lastError, retryAttempts },
      policyCheck,
      rateLimit: { remaining: rateCheck.remaining },
      retryAttempts,
    };
  }

  // GET /api/tool-proxy/status - rate limiter and proxy status
  router.get("/api/tool-proxy/status", async (req, res) => {
    const entries: Array<{ key: string; callsInWindow: number; limit: number; windowMs: number }> = [];
    const now = Date.now();
    toolRateLimiter.forEach((bucket, key) => {
      const active = bucket.timestamps.filter((t: number) => now - t < bucket.windowMs);
      entries.push({ key, callsInWindow: active.length, limit: bucket.limit, windowMs: bucket.windowMs });
    });
    res.json({
      activeRateLimiters: entries.length,
      rateLimiters: entries,
      invocationType: "mcp_tool",
      features: {
        allowlist: true,
        blocklist: true,
        rateLimiting: true,
        retryBackoff: { maxRetries: 3, strategy: "exponential", maxBackoffMs: 8000 },
        shadowDryRun: true,
        redaction: true,
        auditLogging: true,
      },
    });
  });

  // ──────────────────────────────────
  // A2A Delegation Proxy — routes remote-agent calls through governance
  // ──────────────────────────────────
  const a2aRateLimiter: Map<string, { timestamps: number[]; limit: number; windowMs: number }> = new Map();

  function checkA2aRateLimit(agentId: string, remoteAgentId: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
    const key = `a2a:${agentId}:${remoteAgentId}`;
    const now = Date.now();
    const windowMs = 60_000;
    const limit = 50;
    if (!a2aRateLimiter.has(key)) {
      a2aRateLimiter.set(key, { timestamps: [], limit, windowMs });
    }
    const bucket = a2aRateLimiter.get(key)!;
    bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);
    if (bucket.timestamps.length >= limit) {
      const oldest = bucket.timestamps[0];
      return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - oldest) };
    }
    bucket.timestamps.push(now);
    return { allowed: true, remaining: limit - bucket.timestamps.length };
  }

  async function proxyA2aDelegation(
    remoteAgentId: string,
    skillName: string,
    taskInput: Record<string, unknown>,
    policyBundle: Awaited<ReturnType<typeof resolvePolicyBundle>>,
    options: { agentId: string; traceId?: string; environment?: string } = { agentId: "unknown" }
  ): Promise<{
    allowed: boolean;
    result: Record<string, unknown>;
    policyCheck: Record<string, unknown>;
    trustCheck: Record<string, unknown>;
    rateLimit?: { remaining: number };
    interruptionState?: string;
    gateId?: string;
  }> {
    const allRemoteAgents = await storage.getRemoteAgents();
    const remoteAgent = allRemoteAgents.find(ra => ra.id === remoteAgentId);

    const trustCheck: Record<string, unknown> = {
      remoteAgentId,
      found: !!remoteAgent,
      trustTier: remoteAgent?.trustTier || "untrusted",
      connectivityStatus: remoteAgent?.connectivityStatus || "unknown",
      skillRequested: skillName,
      skillAllowed: false,
    };

    if (!remoteAgent) {
      const policyCheck = { remoteAgentId, allowed: false, reason: "Remote agent not found in registry" };
      await storage.createAuditEvent({
        action: "a2a_delegation_blocked",
        objectType: "remote_agent",
        objectId: remoteAgentId,
        actorId: options.agentId,
        actorType: "agent",
        details: `A2A delegation blocked: remote agent ${remoteAgentId} not found`,
      });
      return { allowed: false, result: { error: "Remote agent not found" }, policyCheck, trustCheck };
    }

    const trustTierOrder: Record<string, number> = { untrusted: 0, basic: 1, verified: 2, trusted: 3, privileged: 4 };
    const currentTier = trustTierOrder[remoteAgent.trustTier || "basic"] ?? 1;
    if (currentTier < 1) {
      const policyCheck = { remoteAgentId, allowed: false, reason: `Trust tier "${remoteAgent.trustTier}" is below minimum (basic)` };
      await storage.createAuditEvent({
        action: "a2a_delegation_blocked",
        objectType: "remote_agent",
        objectId: remoteAgentId,
        actorId: options.agentId,
        actorType: "agent",
        details: `A2A delegation blocked: trust tier ${remoteAgent.trustTier} below minimum`,
      });
      return { allowed: false, result: { error: policyCheck.reason }, policyCheck, trustCheck };
    }

    const allowedSkills = remoteAgent.allowedSkills || [];
    const skillAllowed = allowedSkills.length === 0 || allowedSkills.includes(skillName);
    trustCheck.skillAllowed = skillAllowed;

    if (!skillAllowed) {
      const policyCheck = { remoteAgentId, allowed: false, reason: `Skill "${skillName}" not in allowed skills whitelist` };
      await storage.createAuditEvent({
        action: "a2a_delegation_blocked",
        objectType: "remote_agent",
        objectId: remoteAgentId,
        actorId: options.agentId,
        actorType: "agent",
        details: `A2A delegation blocked: skill ${skillName} not in allowed skills [${allowedSkills.join(",")}]`,
      });
      return { allowed: false, result: { error: policyCheck.reason }, policyCheck, trustCheck };
    }

    if (remoteAgent.connectivityStatus !== "connected") {
      const policyCheck = { remoteAgentId, allowed: false, reason: `Remote agent connectivity: ${remoteAgent.connectivityStatus}` };
      await storage.createAuditEvent({
        action: "a2a_delegation_blocked",
        objectType: "remote_agent",
        objectId: remoteAgentId,
        actorId: options.agentId,
        actorType: "agent",
        details: `A2A delegation blocked: connectivity ${remoteAgent.connectivityStatus}`,
      });
      return { allowed: false, result: { error: policyCheck.reason }, policyCheck, trustCheck };
    }

    const rateCheck = checkA2aRateLimit(options.agentId, remoteAgentId);
    if (!rateCheck.allowed) {
      await storage.createAuditEvent({
        action: "a2a_delegation_rate_limited",
        objectType: "remote_agent",
        objectId: remoteAgentId,
        actorId: options.agentId,
        actorType: "agent",
        details: `A2A rate limit exceeded for ${remoteAgentId} by agent ${options.agentId}`,
      });
      return {
        allowed: false,
        result: { error: `A2A rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`, rateLimited: true },
        policyCheck: { allowed: false, rateLimited: true },
        trustCheck,
        rateLimit: { remaining: 0 },
      };
    }

    await storage.createAuditEvent({
      action: "a2a_delegation_call",
      objectType: "remote_agent",
      objectId: remoteAgentId,
      actorId: options.agentId,
      actorType: "agent",
      details: `A2A delegation: ${skillName} to ${remoteAgentId} by agent ${options.agentId}. TrustTier=${remoteAgent.trustTier}, env=${options.environment || "unknown"}`,
    });

    const policyCheck = { remoteAgentId, allowed: true, reason: "Delegation permitted", trustTier: remoteAgent.trustTier, skill: skillName };

    const simulateInterruption = (taskInput as Record<string, unknown>)._simulateInterruption as string | undefined;
    if (simulateInterruption === "input_required" || simulateInterruption === "auth_required") {
      const gate = await storage.createMcpElicitation({
        mode: simulateInterruption === "auth_required" ? "url" : "form",
        gateType: simulateInterruption === "auth_required" ? "a2a_auth_required" : "a2a_input_required",
        status: "pending",
        toolName: skillName,
        serverName: (remoteAgent.agentCardData as Record<string, unknown>)?.name as string || remoteAgentId,
        serverId: remoteAgentId,
        agentId: options.agentId,
        runTraceId: options.traceId || null,
        invocationType: "a2a_delegation",
        remoteAgentId,
        a2aTaskId: `a2a-task-${Date.now()}`,
        a2aInterruptionState: simulateInterruption,
        a2aInterruptionContext: {
          skillName,
          remoteAgentId,
          taskInput: Object.keys(taskInput).filter(k => !k.startsWith("_")),
          message: simulateInterruption === "auth_required"
            ? "Remote agent requires out-of-band authentication"
            : "Remote agent requires additional input to proceed",
        },
        riskFlags: simulateInterruption === "auth_required" ? ["auth_handshake"] : ["additional_data"],
        reason: simulateInterruption === "auth_required"
          ? "Remote agent requires credentials/authorization"
          : "Remote agent needs additional user data",
        requestedBy: "system",
        urlTarget: simulateInterruption === "auth_required" ? `https://auth.remote-agent.example/${remoteAgentId}/oauth` : null,
        formSchema: simulateInterruption === "input_required" ? { type: "object", properties: { additionalData: { type: "string", title: "Additional Data Required" } } } : null,
      });

      await storage.createAuditEvent({
        action: `a2a_interruption_${simulateInterruption}`,
        objectType: "remote_agent",
        objectId: remoteAgentId,
        actorId: options.agentId,
        actorType: "system",
        details: `A2A task interrupted: ${simulateInterruption} for skill ${skillName} on remote agent ${remoteAgentId}. Gate created: ${gate.id}`,
      });

      return {
        allowed: true,
        result: { status: "interrupted", interruptionState: simulateInterruption, gateId: gate.id, message: `Task paused: ${simulateInterruption}` },
        policyCheck,
        trustCheck,
        rateLimit: { remaining: rateCheck.remaining },
        interruptionState: simulateInterruption,
        gateId: gate.id,
      };
    }

    const delegationResult: Record<string, unknown> = {
      status: "completed",
      taskState: "TASK_STATE_COMPLETED",
      skill: skillName,
      remoteAgentId,
      output: `Delegated "${skillName}" to remote agent successfully`,
      executedAt: new Date().toISOString(),
    };

    return { allowed: true, result: delegationResult, policyCheck, trustCheck, rateLimit: { remaining: rateCheck.remaining } };
  }

  // POST /api/tool-proxy/a2a-delegate — A2A delegation through governance proxy
  router.post("/api/tool-proxy/a2a-delegate", async (req, res) => {
    try {
      const schema = z.object({
        agentId: z.string(),
        remoteAgentId: z.string(),
        skillName: z.string(),
        taskInput: z.record(z.unknown()).optional().default({}),
        environment: z.string().optional().default("staging"),
        traceId: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const policyBundle = await resolvePolicyBundle(body.agentId);
      const result = await proxyA2aDelegation(
        body.remoteAgentId,
        body.skillName,
        body.taskInput,
        policyBundle,
        { agentId: body.agentId, traceId: body.traceId, environment: body.environment },
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/tool-proxy/a2a-status — A2A delegation rate limiter status
  router.get("/api/tool-proxy/a2a-status", async (_req, res) => {
    const entries: Array<{ key: string; callsInWindow: number; limit: number; windowMs: number }> = [];
    const now = Date.now();
    a2aRateLimiter.forEach((bucket, key) => {
      const active = bucket.timestamps.filter((t: number) => now - t < bucket.windowMs);
      entries.push({ key, callsInWindow: active.length, limit: bucket.limit, windowMs: bucket.windowMs });
    });
    res.json({
      activeRateLimiters: entries.length,
      rateLimiters: entries,
      invocationType: "a2a_delegation",
      features: {
        trustTierCheck: true,
        skillWhitelist: true,
        connectivityCheck: true,
        rateLimiting: { limit: 50, windowMs: 60000 },
        interruptionStateMapping: true,
        auditLogging: true,
      },
    });
  });

  // ──────────────────────────────────

export default router;
