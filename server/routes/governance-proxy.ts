import { Router } from "express";
import { storage } from "../storage";
import { z, ZodError } from "zod";
import { resolvePolicyBundle } from "./helpers";
import { getOrgId, getSecurityMode } from "../auth";
import { getToolRateLimiterSnapshot } from "../tool-dispatcher";

const router = Router();

  // ──────────────────────────────────
  // Tool dispatch (gates + rate limiting + real execution) lives in
  // server/tool-dispatcher.ts — the single dispatch path for all engines.
  // The former simulated tool-proxy helper here was removed (it fabricated
  // "Executed X successfully" instead of calling anything).
  // ──────────────────────────────────

  // GET /api/tool-proxy/status - rate limiter and dispatch-path status
  router.get("/api/tool-proxy/status", async (_req, res) => {
    const entries = getToolRateLimiterSnapshot();
    res.json({
      activeRateLimiters: entries.length,
      rateLimiters: entries,
      invocationType: "mcp_tool",
      features: {
        allowlist: true,
        blocklist: true,
        rateLimiting: true,
        shadowDryRun: true,
        redaction: true,
        auditLogging: true,
        realExecution: true,
        dispatcher: "tool-dispatcher",
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

    const skillNameLower = skillName.toLowerCase();
    const isPolicyBlocked = policyBundle.blockedTools.some(b => b.toLowerCase() === skillNameLower);
    if (isPolicyBlocked) {
      const policyCheck = { remoteAgentId, allowed: false, reason: `Skill "${skillName}" is blocked by a strict/block-enforcement policy` };
      await storage.createAuditEvent({
        action: "a2a_delegation_blocked",
        objectType: "remote_agent",
        objectId: remoteAgentId,
        actorId: options.agentId,
        actorType: "agent",
        details: `A2A delegation blocked: skill ${skillName} is blocked by policy [${policyBundle.blockedToolsToPolicyIds?.[skillNameLower]?.join(",") || ""}]`,
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

    const simulateInterruption = getSecurityMode() === "demo"
      ? (taskInput as Record<string, unknown>)._simulateInterruption as string | undefined
      : undefined;
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

    if (!remoteAgent.agentCardUrl) {
      const failResult = { status: "failed", skill: skillName, remoteAgentId, error: "Remote agent has no agentCardUrl configured" };
      return { allowed: true, result: failResult, policyCheck, trustCheck, rateLimit: { remaining: rateCheck.remaining } };
    }

    const recordOutcome = (success: boolean, failureReason?: string) => {
      const invocationCount = (remoteAgent.invocationCount ?? 0) + 1;
      const successCount = (remoteAgent.successCount ?? 0) + (success ? 1 : 0);
      storage.updateRemoteAgent(remoteAgent.id, {
        invocationCount,
        successCount,
        trustScore: successCount / invocationCount,
        lastInvokedAt: new Date(),
        ...(failureReason ? { lastFailureReason: failureReason } : {}),
      } as any).catch(() => {});
    };

    // Agent Card URLs conventionally point at the card document itself
    // (e.g. .../.well-known/agent.json); the message endpoint lives at the
    // same base with that suffix swapped out. Mirrors dag-execution-engine.ts's
    // executeRemoteAgentNode, the "real" A2A client this proxy previously
    // fabricated a result instead of calling.
    const invokeUrl = remoteAgent.agentCardUrl.replace(/\/\.well-known\/agent\.json$/, "/message");
    const messageText = JSON.stringify({ skill: skillName, input: taskInput });

    try {
      const httpRes = await fetch(invokeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { role: "user", parts: [{ type: "text", text: messageText }] } }),
        signal: AbortSignal.timeout(30000),
      });
      if (!httpRes.ok) {
        recordOutcome(false, `HTTP ${httpRes.status}`);
        const failResult = { status: "failed", skill: skillName, remoteAgentId, error: `Remote agent returned ${httpRes.status}` };
        return { allowed: true, result: failResult, policyCheck, trustCheck, rateLimit: { remaining: rateCheck.remaining } };
      }
      const data: any = await httpRes.json();
      const text = data?.message?.parts?.find((p: any) => p?.type === "text")?.text
        ?? data?.message?.parts?.[0]?.text
        ?? (typeof data === "string" ? data : JSON.stringify(data));
      recordOutcome(true);
      const delegationResult: Record<string, unknown> = {
        status: "completed",
        taskState: "TASK_STATE_COMPLETED",
        skill: skillName,
        remoteAgentId,
        output: text,
        executedAt: new Date().toISOString(),
        taskId: data?.taskId,
      };
      return { allowed: true, result: delegationResult, policyCheck, trustCheck, rateLimit: { remaining: rateCheck.remaining } };
    } catch (err: any) {
      recordOutcome(false, err.message);
      const failResult = { status: "failed", skill: skillName, remoteAgentId, error: `A2A call failed: ${err.message}` };
      return { allowed: true, result: failResult, policyCheck, trustCheck, rateLimit: { remaining: rateCheck.remaining } };
    }
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
      const policyBundle = await resolvePolicyBundle(body.agentId, getOrgId(req));
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
