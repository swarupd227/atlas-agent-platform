import { Router } from "express";
import { storage } from "../storage";
import { z, ZodError } from "zod";
import { getProvider, getAvailableProviders } from "../llm-provider";
import { insertAgentTriggerSchema } from "@shared/schema";
import { runtimeEvents } from "../agent-runtime";

const router = Router();

  // === LLM Provider Management Routes ===

  router.get("/api/llm-providers", async (_req, res) => {
    try {
      const providers = getAvailableProviders();
      res.json(providers);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get providers" });
    }
  });

  router.get("/api/llm-providers/health", async (_req, res) => {
    try {
      const providers = getAvailableProviders();
      const healthResults = await Promise.all(
        providers
          .filter((p) => p.configured)
          .map(async (p) => {
            try {
              const provider = getProvider(p.name);
              const health = await provider.healthCheck();
              return { provider: p.name, displayName: p.displayName, ...health };
            } catch (err: any) {
              return { provider: p.name, displayName: p.displayName, ok: false, latencyMs: 0, error: err.message };
            }
          }),
      );
      res.json(healthResults);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to check health" });
    }
  });

  router.get("/api/llm-providers/usage", async (_req, res) => {
    try {
      const allTraces = await storage.getTraces();
      const usageByProvider: Record<string, { totalTokens: number; totalCost: number; totalRuns: number }> = {};

      for (const trace of allTraces) {
        const summary = (trace.resultSummary as any) || {};
        const providerUsed = summary.llmProvider || "openai";
        if (!usageByProvider[providerUsed]) {
          usageByProvider[providerUsed] = { totalTokens: 0, totalCost: 0, totalRuns: 0 };
        }
        usageByProvider[providerUsed].totalRuns++;
        usageByProvider[providerUsed].totalTokens += (trace as any).totalTokensUsed || summary.totalTokens || 0;
        usageByProvider[providerUsed].totalCost += (trace as any).totalCostUsd || summary.totalCost || 0;
      }

      res.json(usageByProvider);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get usage" });
    }
  });
  router.get("/api/agents/:agentId/triggers", async (req, res) => {
    try {
      const triggers = await storage.getAgentTriggers(req.params.agentId);
      res.json(triggers);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get triggers" });
    }
  });

  router.post("/api/agents/:agentId/triggers", async (req, res) => {
    try {
      const parsed = insertAgentTriggerSchema.parse({
        ...req.body,
        agentId: req.params.agentId,
      });
      const trigger = await storage.createAgentTrigger(parsed);
      await storage.createAuditEvent({
        actorType: "user",
        action: "trigger_created",
        objectType: "agent_trigger",
        objectId: trigger.id,
        details: `Created ${trigger.triggerType} trigger for agent ${req.params.agentId}`,
      });
      res.status(201).json(trigger);
    } catch (err: any) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      res.status(500).json({ error: err.message || "Failed to create trigger" });
    }
  });

  router.patch("/api/agents/:agentId/triggers/:triggerId", async (req, res) => {
    try {
      const existing = await storage.getAgentTrigger(req.params.triggerId);
      if (!existing || existing.agentId !== req.params.agentId) {
        return res.status(404).json({ error: "Trigger not found" });
      }
      const updated = await storage.updateAgentTrigger(req.params.triggerId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Trigger not found" });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update trigger" });
    }
  });

router.delete("/api/agents/:agentId/triggers/:triggerId", async (req, res) => {
    try {
      const existing = await storage.getAgentTrigger(req.params.triggerId);
      if (!existing || existing.agentId !== req.params.agentId) {
        return res.status(404).json({ error: "Trigger not found" });
      }
      const deleted = await storage.deleteAgentTrigger(req.params.triggerId);
      if (!deleted) {
        return res.status(404).json({ error: "Trigger not found" });
      }
      await storage.createAuditEvent({
        actorType: "user",
        action: "trigger_deleted",
        objectType: "agent_trigger",
        objectId: req.params.triggerId,
        details: `Deleted trigger for agent ${req.params.agentId}`,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete trigger" });
    }
  });

  router.post("/api/webhooks/:triggerId", async (req, res) => {
    try {
      const trigger = await storage.getAgentTrigger(req.params.triggerId);
      if (!trigger) {
        return res.status(404).json({ error: "Trigger not found" });
      }
      if (!trigger.enabled) {
        return res.status(403).json({ error: "Trigger is disabled" });
      }
      if (trigger.triggerType !== "webhook") {
        return res.status(400).json({ error: "Trigger is not a webhook type" });
      }
      const config = (trigger.config || {}) as Record<string, any>;
      if (config.secret) {
        const providedSecret = req.headers["x-webhook-secret"] || req.query.secret;
        if (providedSecret !== config.secret) {
          return res.status(401).json({ error: "Invalid webhook secret" });
        }
      }
      await storage.updateAgentTrigger(trigger.id, {
        lastFiredAt: new Date(),
        fireCount: (trigger.fireCount || 0) + 1,
      });
      const agent = await storage.getAgent(trigger.agentId);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      const job = await storage.createJob({
        type: "agent_run",
        agentId: trigger.agentId,
        status: "queued",
        payload: {
          triggeredBy: "webhook",
          triggerId: trigger.id,
          webhookPayload: req.body,
        },
      });
      await storage.createAuditEvent({
        actorType: "system",
        action: "webhook_received",
        objectType: "agent_trigger",
        objectId: trigger.id,
        details: `Webhook trigger fired for agent ${trigger.agentId}, job ${job.id} enqueued`,
      });
      res.json({ success: true, jobId: job.id, agentId: trigger.agentId });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to process webhook" });
    }
  });

  runtimeEvents.on("agent_execution", async (event: { agentId: string; runId: string; result: any }) => {
    try {
      const completionTriggers = await storage.getAgentTriggersByType("agent_completion");
      const matchingTriggers = completionTriggers.filter(t => {
        if (!t.enabled) return false;
        const config = (t.config || {}) as Record<string, any>;
        return config.sourceAgentId === event.agentId;
      });
      for (const trigger of matchingTriggers) {
        try {
          await storage.updateAgentTrigger(trigger.id, {
            lastFiredAt: new Date(),
            fireCount: (trigger.fireCount || 0) + 1,
          });
          await storage.createJob({
            type: "agent_run",
            agentId: trigger.agentId,
            status: "queued",
            payload: {
              triggeredBy: "agent_completion",
              triggerId: trigger.id,
              sourceAgentId: event.agentId,
              sourceRunId: event.runId,
            },
          });
          console.log(`[triggers] Agent completion trigger ${trigger.id} fired: agent ${event.agentId} -> agent ${trigger.agentId}`);
        } catch (trigErr: any) {
          console.error(`[triggers] Failed to fire completion trigger ${trigger.id}:`, trigErr.message);
        }
      }
    } catch (err: any) {
      console.error(`[triggers] Failed to process agent_completion triggers:`, err.message);
    }
  });

export default router;
