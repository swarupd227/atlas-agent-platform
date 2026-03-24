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

  // ── Kinective Demo: one-click COA pipeline run ──────────────────────────────
  // ── Kinective ensure-agent (registered directly on app for reliable Express 5 routing) ──
  router.post("/demo-api/kinective/ensure-agent", async (req, res) => {
    const { kinectiveEnsureAgentHandler } = await import("./demo-routes");
    return kinectiveEnsureAgentHandler(req, res);
  });

  router.post("/demo-api/kinective/run-pipeline", async (req, res) => {
    try {
      const { scenario } = req.body || {};
      const validScenarios = ["happy", "invalid_address", "system_failure"];
      const selectedScenario = validScenarios.includes(scenario) ? scenario : "happy";

      const KINECTIVE_AGENT_ID = "c4b3099f-dfd8-4cce-9cf4-0cbb031f7f73";

      const { resetKinectiveDemo, setKinectiveTraceId, setKinectiveRunning, isKinectiveRunning, getEnabledSystems, getRunGeneration } = await import("./kinective-demo-store");

      if (isKinectiveRunning()) {
        return res.status(409).json({ error: "Pipeline already running. Please wait for current run to complete." });
      }

      const enabledSystems = getEnabledSystems();
      const isEnabled = (key: string) => enabledSystems.some((s) => s.toLowerCase().includes(key.toLowerCase()));

      const happySteps: string[] = [
        `1. Call get_form_data with form_id "COA-2026-00412" to retrieve the signed form`,
        `2. Call validate_address with street "1847 Lakewood Drive", city "Austin", state "TX", zip "78701"`,
      ];
      let stepNum = 3;
      if (isEnabled("Gateway") || isEnabled("Core Banking")) {
        happySteps.push(`${stepNum++}. Call update_member_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Digital Banking") || isEnabled("Alkami")) {
        happySteps.push(`${stepNum++}. Call update_digital_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Statement")) {
        happySteps.push(`${stepNum++}. Call update_statement_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Card")) {
        happySteps.push(`${stepNum++}. Call update_card_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Loan")) {
        happySteps.push(`${stepNum++}. Call update_loan_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("CRM") || isEnabled("Salesforce")) {
        happySteps.push(`${stepNum++}. Call update_crm_contact with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Bill Pay")) {
        happySteps.push(`${stepNum++}. Call update_bill_pay_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Fraud")) {
        happySteps.push(`${stepNum++}. Call flag_address_change with member_id "MBR-2026-84291", old and new addresses`);
      }
      if (isEnabled("BSA") || isEnabled("Compliance") || isEnabled("AML")) {
        happySteps.push(`${stepNum++}. Call log_bsa_event with member_id "MBR-2026-84291", event_type "address_change"`);
        happySteps.push(`${stepNum++}. Call create_compliance_record with member_id "MBR-2026-84291", status "complete"`);
      }
      if (isEnabled("SignPlus")) {
        happySteps.push(`${stepNum++}. Call archive_signed_document with form_id "COA-2026-00412" and member_id "MBR-2026-84291"`);
      }
      if (isEnabled("Notification") || isEnabled("Member Notification")) {
        happySteps.push(`${stepNum++}. Call notify_digital_banking with member_id "MBR-2026-84291" and confirmation message`);
      }

      const HAPPY_PROMPT = `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps in order. Call each tool exactly once:

${happySteps.join("\n")}

Complete all steps. Log every action.`;

      const INVALID_ADDRESS_PROMPT = `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps:

1. Call get_form_data with form_id "COA-2026-00412" to retrieve the signed form
2. Call validate_address with street "1847 Lakewod Drve", city "Austin", state "TX", zip ""
3. The validation will return valid=false. When it does:
   - Call log_action with action "VALIDATION_FAILED", system "USPS", details "Address not found in USPS database. Routing to human review."
   - Call create_compliance_record with member_id "MBR-2026-84291", status "pending_review", details "USPS validation failed. Address change routed to manual review."
   - STOP. Do NOT call any system update tools. The member address must remain unchanged.

Log every action.`;

      const SYSTEM_FAILURE_PROMPT = `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps in order:

1. Call get_form_data with form_id "COA-2026-00412"
2. Call validate_address with street "1847 Lakewood Drive", city "Austin", state "TX", zip "78701"
3. Call update_member_address with member_id "MBR-2026-84291" — success
4. Call update_digital_address with member_id "MBR-2026-84291" — success
5. Call update_statement_address with member_id "MBR-2026-84291" — success
6. Call update_bill_pay_address with member_id "MBR-2026-84291" — success
7. Call update_loan_address with member_id "MBR-2026-84291" — success
8. Call update_crm_contact with member_id "MBR-2026-84291" — success
9. Call flag_address_change with member_id "MBR-2026-84291"
10. Call update_card_address with member_id "MBR-2026-84291" — this will return a TIMEOUT error
11. The card update failed. Now initiate rollback:
    - Call log_action with action "SYSTEM_FAILURE", system "Card Management", details "PSCU card management timeout after 3 retries. Initiating rollback for data consistency."
    - Call rollback_address_update with member_id "MBR-2026-84291", system "loan-origination", reason "Card management failure — rolling back for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "crm", reason "Card management failure — rolling back for data consistency"
12. Call create_compliance_record with member_id "MBR-2026-84291", status "partial_failure"
13. Call log_action with action "RETRY_SCHEDULED", system "ATLAS", details "Card management retry scheduled for next maintenance window. Ops ticket opened."

Log every action.`;

      const prompts: Record<string, string> = {
        happy: HAPPY_PROMPT,
        invalid_address: INVALID_ADDRESS_PROMPT,
        system_failure: SYSTEM_FAILURE_PROMPT,
      };

      const agent = await storage.getAgent(KINECTIVE_AGENT_ID);
      if (!agent) return res.status(404).json({ error: "Kinective Change of Address Agent not found" });

      resetKinectiveDemo(selectedScenario);
      setKinectiveRunning(true);
      const thisGeneration = getRunGeneration();

      const allDeployments = await storage.getDeployments();
      let deployment = allDeployments.find(
        (d) => d.agentId === KINECTIVE_AGENT_ID && d.environment === "staging" && d.status !== "rolled_back"
      );
      if (!deployment) {
        deployment = await storage.createDeployment({
          agentId: KINECTIVE_AGENT_ID,
          environment: "staging",
          version: "1.0.0",
          status: "active",
          rolloutStrategy: "direct",
          trafficPercentage: 100,
        });
      }
      if (isRuntimeActive(deployment.id)) {
        stopAgentRuntime(deployment.id);
      }

      const selectedPrompt = prompts[selectedScenario];
      const maxSteps = selectedScenario === "invalid_address" ? 10 : 25;

      (async () => {
        try {
          console.log(`[kinective-pipeline] Starting COA agent (scenario=${selectedScenario})`);
          const result = await runAgentOnce(deployment!.id, selectedPrompt, maxSteps);
          console.log(`[kinective-pipeline] Agent complete.`);

          if (getRunGeneration() !== thisGeneration) {
            console.log(`[kinective-pipeline] Run superseded by reset — discarding results`);
            return;
          }


          const traces = await storage.getTracesByAgent(KINECTIVE_AGENT_ID);
          if (traces.length > 0) {
            const sorted = [...traces].sort((a, b) =>
              new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
            );
            setKinectiveTraceId(sorted[0].id);
          }
          setKinectiveRunning(false);
        } catch (err: any) {
          console.error("[kinective-pipeline] Error:", err.message);
          if (getRunGeneration() === thisGeneration) setKinectiveRunning(false);
        }
      })();

      return res.json({
        started: true,
        deploymentId: deployment.id,
        scenario: selectedScenario,
        message: `Kinective COA pipeline started (scenario: ${selectedScenario}). Agent is processing form COA-2026-00412.`,
      });
    } catch (err: any) {
      console.error("[demo-api/kinective/run-pipeline]", err);
      return res.status(500).json({ error: err.message || "Failed to run Kinective pipeline" });
    }
  });

  // ── Kinective Demo: submit-coa — acknowledges COA; SSE stream handles reset + agent ──
  router.post("/demo-api/kinective/submit-coa", async (req, res) => {
    try {
      const { scenario } = req.body || {};
      const validScenarios = ["happy", "invalid_address", "system_failure"];
      const selectedScenario = validScenarios.includes(scenario) ? scenario : "happy";

      // Do NOT reset state here — resetKinectiveDemo sets running=true which would
      // cause the SSE stream endpoint to immediately reject with "already running".
      // The SSE /kinective/stream endpoint resets state itself at run start.

      return res.json({
        started: true,
        scenario: selectedScenario,
        formId: "COA-2026-00412",
        webhookId: `WH-${Date.now().toString(36).toUpperCase()}`,
        memberId: "MBR-2026-84291",
        memberName: "Sarah Mitchell",
        message: "COA request received. Open /demo-api/kinective/stream to begin agent processing.",
      });
    } catch (err: any) {
      console.error("[demo-api/kinective/submit-coa]", err);
      return res.status(500).json({ error: err.message || "Failed to submit COA" });
    }
  });
  // ── Kinective Demo: full demo reset ─────────────────────────────────────────
  router.post("/demo-api/kinective/full-reset", async (_req, res) => {
    try {
      const { fullResetKinectiveDemo } = await import("./kinective-demo-store");
      fullResetKinectiveDemo();
      res.json({ success: true, scenario: "happy" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── BlackRock Use Case 2: Partner Portal Registry MCP Server ────────────────

export default router;
