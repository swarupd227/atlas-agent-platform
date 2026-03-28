import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { checkPermission } from "../permissions";
import { generateKpiAlignedEvalSuite } from "./helpers";
import { getOrgId } from "../auth";

const router = Router();

  // ========== BILLING METERING PIPELINE ==========

  // Step 1: Runtime emits outcome candidate event
  // Applies exclusion rules, deduplication, fraud checks, signed hash
  router.post("/api/outcome-events", checkPermission("billing_invoices"), async (req, res) => {
    try {
      const eventSchema = z.object({
        outcomeId: z.string().min(1, "outcomeId is required"),
        agentId: z.string().optional().nullable(),
        traceId: z.string().optional().nullable(),
        type: z.string().min(1, "type is required"),
        payload: z.any().optional().nullable(),
        unitCount: z.number().int().positive().optional().default(1),
        unitValue: z.number().optional().nullable(),
      });
      const parsed = eventSchema.parse(req.body);
      const { outcomeId, agentId, traceId, type, payload, unitCount, unitValue } = parsed;

      const orgId = getOrgId(req);
      const outcome = await storage.getOutcome(outcomeId, orgId);
      if (!outcome) {
        return res.status(404).json({ error: "Outcome not found" });
      }

      let billable = true;
      let excludeReason: string | null = null;
      const checks: string[] = [];

      // --- Exclusion rules ---
      if (outcome.status !== "active") {
        billable = false;
        excludeReason = "outcome_inactive";
        checks.push("EXCLUDED: outcome is not active");
      }

      if (billable && outcome.volumeCap) {
        const existingEvents = await storage.getOutcomeEventsByOutcome(outcomeId);
        const billableCount = existingEvents.filter(e => e.billable).length;
        if (billableCount >= outcome.volumeCap) {
          billable = false;
          excludeReason = "volume_cap_exceeded";
          checks.push(`EXCLUDED: volume cap ${outcome.volumeCap} reached (current: ${billableCount})`);
        }
      }

      // --- Deduplication: same traceId + outcomeId within 5-minute window ---
      if (billable && traceId) {
        const existingEvents = await storage.getOutcomeEventsByOutcome(outcomeId);
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const duplicate = existingEvents.find(e =>
          e.traceId === traceId &&
          e.createdAt && new Date(e.createdAt) > fiveMinAgo
        );
        if (duplicate) {
          billable = false;
          excludeReason = "duplicate_event";
          checks.push(`EXCLUDED: duplicate trace ${traceId} within 5-minute window (existing event: ${duplicate.id})`);
        }
      }

      // --- Fraud checks: volume spike detection ---
      if (billable) {
        const existingEvents = await storage.getOutcomeEventsByOutcome(outcomeId);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentCount = existingEvents.filter(e =>
          e.createdAt && new Date(e.createdAt) > oneHourAgo
        ).length;
        const avgHourlyRate = existingEvents.length > 0
          ? existingEvents.length / Math.max(1, (Date.now() - new Date(existingEvents[existingEvents.length - 1]?.createdAt || Date.now()).getTime()) / (60 * 60 * 1000))
          : 0;
        if (avgHourlyRate > 0 && recentCount > avgHourlyRate * 5) {
          billable = false;
          excludeReason = "fraud_volume_spike";
          checks.push(`EXCLUDED: volume spike detected (${recentCount} events in last hour vs avg ${Math.round(avgHourlyRate)}/hr)`);
        }
      }

      // --- Value anomaly check ---
      if (billable && unitValue !== undefined && unitValue !== null) {
        const existingEvents = await storage.getOutcomeEventsByOutcome(outcomeId);
        const billableValues = existingEvents
          .filter(e => e.billable && e.unitValue !== null && e.unitValue !== undefined)
          .map(e => e.unitValue as number);
        if (billableValues.length >= 5) {
          const mean = billableValues.reduce((s, v) => s + v, 0) / billableValues.length;
          const stdDev = Math.sqrt(billableValues.reduce((s, v) => s + (v - mean) ** 2, 0) / billableValues.length);
          if (stdDev > 0 && Math.abs(unitValue - mean) > 3 * stdDev) {
            billable = false;
            excludeReason = "fraud_value_anomaly";
            checks.push(`EXCLUDED: value anomaly (${unitValue} is >3 std devs from mean ${mean.toFixed(2)})`);
          }
        }
      }

      // --- Compute signed hash for tamper evidence ---
      const crypto = await import("crypto");
      const hashPayload = JSON.stringify({
        outcomeId, agentId, traceId, type, unitCount, unitValue,
        billable, excludeReason, timestamp: new Date().toISOString(),
      });
      const signedHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

      const event = await storage.createOutcomeEvent({
        organizationId: orgId ?? undefined,
        outcomeId,
        agentId: agentId || null,
        traceId: traceId || null,
        type,
        billable,
        excludeReason,
        unitCount: unitCount || 1,
        unitValue: unitValue || (outcome.pricePerUnit || 0),
        signedHash,
        payload: payload || null,
      });

      await storage.createAuditEvent({
        organizationId: orgId ?? undefined,
        action: "outcome_event_ingested",
        objectType: "outcome_event",
        objectId: event.id,
        actorId: "metering_service",
        actorType: "system",
        details: `Event ${event.id} for outcome "${outcome.name}": billable=${billable}${excludeReason ? `, reason=${excludeReason}` : ""}. Checks: ${checks.length > 0 ? checks.join("; ") : "all passed"}`,
      });

      let flywheelAutoSync: any = null;
      if (!billable && excludeReason) {
        try {
          const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);
          if (agents.length > 0) {
            const primaryAgent = agents[0];
            const existingSuites = await storage.getEvalsByAgent(primaryAgent.id);
            let kpiSuite = existingSuites.find(s => s.type === "kpi_aligned");
            if (!kpiSuite) {
              const generated = await generateKpiAlignedEvalSuite(primaryAgent.id, outcomeId, orgId ?? undefined);
              if (generated) {
                kpiSuite = generated.suite;
              } else {
                kpiSuite = await storage.createEvalSuite({
                  agentId: primaryAgent.id,
                  name: `${primaryAgent.name} - Production Feedback Suite (${outcome.name})`,
                  type: "kpi_aligned",
                  totalCases: 0,
                  coverageTags: ["production_feedback", "ground_truth"],
                  ontologyTags: { kpiAligned: true, outcomeId, outcomeName: outcome.name, generatedAt: new Date().toISOString() },
                });
              }
            }

            const suiteId = kpiSuite!.id;
            const existingCases = await storage.getEvalTestCases(suiteId);
            const alreadyExists = existingCases.some(tc => {
              const input = tc.inputData as Record<string, unknown> | null;
              return input?.sourceEventId === event.id;
            });

            if (!alreadyExists) {
              const tc = await storage.createEvalTestCase({
                suiteId,
                name: `Production Rejection: ${excludeReason} (${type})`,
                inputData: {
                  type: "production_feedback",
                  sourceEventId: event.id,
                  traceId: traceId || null,
                  agentId: agentId || null,
                  eventType: type,
                  payload: payload || null,
                  scenario: "rejected_outcome_event",
                  groundTruthLabel: "negative",
                  autoSynced: true,
                  trigger: "event_rejection",
                },
                expectedOutput: {
                  shouldPass: false,
                  rejectionReason: excludeReason,
                  expectedBehavior: `Agent output was rejected: ${excludeReason}. Future runs must not reproduce this failure pattern.`,
                },
                tags: ["production_feedback", "ground_truth", "rejected_event", "auto_synced", excludeReason],
                weight: 1.5,
                origin: "production_feedback",
                severity: "high",
              });

              const currentCases = await storage.getEvalTestCases(suiteId);
              await storage.updateEvalSuite(suiteId, { totalCases: currentCases.length });

              flywheelAutoSync = { suiteId, testCaseId: tc.id, trigger: "event_rejection" };

              await storage.createAuditEvent({
                organizationId: orgId ?? undefined,
                actorType: "system",
                action: "flywheel_auto_sync",
                objectType: "eval_test_case",
                objectId: tc.id,
                details: `Auto-created negative ground truth test case from rejected event ${event.id} (reason: ${excludeReason}) for outcome ${outcome.name}`,
              });
            }
          }
        } catch (syncErr: any) {
          flywheelAutoSync = { error: syncErr.message };
        }
      }

      let autonomyValidation: any = null;
      if (agentId) {
        try {
          const pendingDecisions = await storage.getAutonomyDecisions({ agentId, outcome: "pending" });
          const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
          const recentPending = pendingDecisions.filter((d: any) => d.createdAt && new Date(d.createdAt) >= thirtyMinAgo);
          let validatedCount = 0;
          for (const dec of recentPending) {
            const outcome_val = billable ? "validated_correct" : "validated_incorrect";
            await storage.updateAutonomyDecision(dec.id, {
              outcome: outcome_val,
              outcomeSource: "customer_acceptance",
              outcomeDetails: { eventId: event.id, billable, excludeReason: excludeReason || null } as any,
              outcomeAt: new Date(),
            });
            const profiles = await storage.getDecisionQualityProfiles({ agentId: dec.agentId, decisionType: dec.decisionType });
            const matching = profiles.find((p: any) => (p.riskDimension || null) === (dec.riskDimension || null));
            if (matching) {
              const newCorrect = matching.correctDecisions + (billable ? 1 : 0);
              const newIncorrect = matching.incorrectDecisions + (billable ? 0 : 1);
              const newPending = Math.max(0, matching.pendingDecisions - 1);
              const resolved = newCorrect + newIncorrect;
              await storage.updateDecisionQualityProfile(matching.id, {
                correctDecisions: newCorrect,
                incorrectDecisions: newIncorrect,
                pendingDecisions: newPending,
                accuracyRate: resolved > 0 ? Math.round((newCorrect / resolved) * 10000) / 10000 : 0,
                updatedAt: new Date(),
              });
            }
            validatedCount++;
          }
          if (validatedCount > 0) {
            autonomyValidation = { validatedDecisions: validatedCount, outcomeSignal: billable ? "correct" : "incorrect" };
          }
        } catch (_autoValErr) {}
      }

      res.status(201).json({
        event,
        metering: { billable, excludeReason, checks, signedHash },
        flywheelAutoSync,
        autonomyValidation,
      });
    } catch (e: any) {
      if (e.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: e.errors });
      }
      res.status(500).json({ error: e.message || "Failed to ingest outcome event" });
    }
  });

  // GET all outcome events
  router.get("/api/outcome-events", async (req, res) => {
    const events = await storage.getOutcomeEvents(getOrgId(req));
    res.json(events);
  });

  // GET single outcome event
  router.get("/api/outcome-events/:id", async (req, res) => {
    const event = await storage.getOutcomeEvent(req.params.id, getOrgId(req));
    if (!event) return res.status(404).json({ error: "Outcome event not found" });
    res.json(event);
  });

  // GET outcome event -> trace drill-down
  router.get("/api/outcome-events/:id/trace", async (req, res) => {
    const event = await storage.getOutcomeEvent(req.params.id, getOrgId(req));
    if (!event) return res.status(404).json({ error: "Outcome event not found" });
    if (!event.traceId) return res.status(404).json({ error: "No trace linked to this event" });
    const trace = await storage.getTrace(event.traceId, getOrgId(req));
    if (!trace) return res.status(404).json({ error: "Linked trace not found" });
    const outcome = await storage.getOutcome(event.outcomeId, getOrgId(req));
    const agent = event.agentId ? await storage.getAgent(event.agentId, getOrgId(req)) : null;
    res.json({
      event,
      trace,
      outcome: outcome ? { id: outcome.id, name: outcome.name, pricingModel: outcome.pricingModel } : null,
      agent: agent ? { id: agent.id, name: agent.name } : null,
    });
  });

  router.get("/api/flywheel/metrics", async (req, res) => {
    try {
      const [allSuites, allOutcomes, allAgents, allEvents, allGoldenDatasets, allEvalRuns] = await Promise.all([
        storage.getEvalSuites(),
        storage.getOutcomes(getOrgId(req)),
        storage.getAgents(getOrgId(req)),
        storage.getOutcomeEvents(getOrgId(req)),
        storage.getGoldenDatasets(),
        storage.getAllEvalRuns(),
      ]);

      const allTestCases: Array<{ suiteId: string; tags: string[] | null; origin: string | null; lastRunAt: Date | null }> = [];
      for (const suite of allSuites) {
        const cases = await storage.getEvalTestCases(suite.id);
        for (const tc of cases) {
          allTestCases.push({
            suiteId: suite.id,
            tags: tc.tags,
            origin: tc.origin,
            lastRunAt: suite.lastRunAt,
          });
        }
      }

      const productionFeedbackCases = allTestCases.filter(tc => tc.origin === "production_feedback");
      let positiveLabels = 0;
      let negativeLabels = 0;
      for (const tc of productionFeedbackCases) {
        const tags = (tc.tags || []).map(t => t.toLowerCase());
        if (tags.includes("rejected_event") || tags.includes("billing_dispute")) {
          negativeLabels++;
        } else if (tags.includes("accepted_event")) {
          positiveLabels++;
        } else {
          positiveLabels++;
        }
      }
      const totalGroundTruth = productionFeedbackCases.length;

      const monthlyMap = new Map<string, { positive: number; negative: number; total: number }>();
      for (const tc of productionFeedbackCases) {
        const date = tc.lastRunAt ? new Date(tc.lastRunAt) : new Date();
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (!monthlyMap.has(month)) monthlyMap.set(month, { positive: 0, negative: 0, total: 0 });
        const entry = monthlyMap.get(month)!;
        const tags = (tc.tags || []).map(t => t.toLowerCase());
        if (tags.includes("rejected_event") || tags.includes("billing_dispute")) {
          entry.negative++;
        } else {
          entry.positive++;
        }
        entry.total++;
      }
      const monthlyGrowth = Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data }));

      const eventsByMonth = new Map<string, { totalEvents: number; accepted: number }>();
      for (const ev of allEvents) {
        const date = ev.createdAt ? new Date(ev.createdAt) : new Date();
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (!eventsByMonth.has(month)) eventsByMonth.set(month, { totalEvents: 0, accepted: 0 });
        const entry = eventsByMonth.get(month)!;
        entry.totalEvents++;
        if (ev.billable) entry.accepted++;
      }
      const acceptanceTrend = Array.from(eventsByMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          rate: data.totalEvents > 0 ? Math.round((data.accepted / data.totalEvents) * 10000) / 100 : 0,
          totalEvents: data.totalEvents,
          accepted: data.accepted,
        }));

      let goldenPromotions = 0;
      for (const ds of allGoldenDatasets) {
        const goldenCases = await storage.getGoldenTestCases(ds.id);
        goldenPromotions += goldenCases.filter(gc => gc.contributorOrg === "production_feedback").length;
      }

      const totalAccepted = allEvents.filter(e => e.billable).length;
      const overallAcceptanceRate = allEvents.length > 0
        ? Math.round((totalAccepted / allEvents.length) * 10000) / 100
        : 0;

      const agentsByOutcome = new Map<string, string[]>();
      for (const agent of allAgents) {
        if (agent.outcomeId) {
          if (!agentsByOutcome.has(agent.outcomeId)) agentsByOutcome.set(agent.outcomeId, []);
          agentsByOutcome.get(agent.outcomeId)!.push(agent.id);
        }
      }

      const suitesByAgent = new Map<string, string[]>();
      for (const suite of allSuites) {
        if (!suitesByAgent.has(suite.agentId)) suitesByAgent.set(suite.agentId, []);
        suitesByAgent.get(suite.agentId)!.push(suite.id);
      }

      const latestRunBySuite = new Map<string, { passRate: number | null; startedAt: Date | null }>();
      for (const run of allEvalRuns) {
        const existing = latestRunBySuite.get(run.suiteId);
        const runDate = run.startedAt ? new Date(run.startedAt) : null;
        if (!existing || (runDate && (!existing.startedAt || runDate > existing.startedAt))) {
          latestRunBySuite.set(run.suiteId, { passRate: run.passRate, startedAt: runDate });
        }
      }

      const productionCasesBySuite = new Map<string, number>();
      for (const tc of productionFeedbackCases) {
        productionCasesBySuite.set(tc.suiteId, (productionCasesBySuite.get(tc.suiteId) || 0) + 1);
      }

      const outcomeStatus = allOutcomes.map(outcome => {
        const agentIds = agentsByOutcome.get(outcome.id) || [];
        const outcomeEvents = allEvents.filter(e => e.outcomeId === outcome.id);
        const acceptedEvents = outcomeEvents.filter(e => e.billable).length;
        const acceptanceRate = outcomeEvents.length > 0
          ? Math.round((acceptedEvents / outcomeEvents.length) * 10000) / 100
          : 0;

        let groundTruthCases = 0;
        const passRates: number[] = [];
        for (const agentId of agentIds) {
          const suiteIds = suitesByAgent.get(agentId) || [];
          for (const suiteId of suiteIds) {
            groundTruthCases += productionCasesBySuite.get(suiteId) || 0;
            const latestRun = latestRunBySuite.get(suiteId);
            if (latestRun && latestRun.passRate != null) {
              passRates.push(latestRun.passRate);
            }
          }
        }

        const evalPassRate = passRates.length > 0
          ? Math.round((passRates.reduce((a, b) => a + b, 0) / passRates.length) * 100) / 100
          : 0;

        return {
          outcomeId: outcome.id,
          outcomeName: outcome.name,
          groundTruthCases,
          acceptanceRate,
          evalPassRate,
        };
      });

      res.json({
        summary: {
          totalGroundTruth,
          positiveLabels,
          negativeLabels,
          goldenPromotions,
          acceptanceRate: overallAcceptanceRate,
        },
        monthlyGrowth,
        acceptanceTrend,
        outcomeStatus,
      });
    } catch (error: any) {
      console.error("Error computing flywheel metrics:", error);
      res.status(500).json({ error: "Failed to compute flywheel metrics" });
    }
  });

  router.get("/api/flywheel/acceptance-patterns", async (req, res) => {
    try {
      const [allEvents, allAgents, allDisputes] = await Promise.all([
        storage.getOutcomeEvents(getOrgId(req)),
        storage.getAgents(getOrgId(req)),
        storage.getBillingDisputes(),
      ]);

      const agentIndustryMap = new Map<string, string>();
      for (const agent of allAgents) {
        let industry = "general";
        const tags: string[] = [];
        if (Array.isArray(agent.complianceTags)) tags.push(...agent.complianceTags);
        if (Array.isArray(agent.ontologyTags)) {
          for (const t of agent.ontologyTags as any[]) {
            if (typeof t === "string") tags.push(t);
            else if (t && typeof t === "object" && t.conceptLabel) tags.push(t.conceptLabel);
            else if (t && typeof t === "object" && t.conceptId) tags.push(t.conceptId);
          }
        }
        const combined = tags.join(" ").toUpperCase();
        if (combined.includes("HIPAA") || combined.includes("HITECH")) industry = "healthcare";
        else if (combined.includes("BSA") || combined.includes("AML") || combined.includes("SOX") || combined.includes("CIP") || combined.includes("GLBA")) industry = "financial_services";
        else if (combined.includes("NAIC")) industry = "insurance";
        else if (combined.includes("OSHA") || combined.includes("ISO 9001")) industry = "manufacturing";
        else if (combined.includes("PCI-DSS") || combined.includes("PCI") || combined.includes("CCPA") || combined.includes("FTC")) industry = "retail";
        else if (combined.includes("SOC 2") || combined.includes("FEDRAMP") || combined.includes("ISO 27001")) industry = "technology_saas";
        if (agent.department) {
          const dept = agent.department.toLowerCase();
          if (dept.includes("health") || dept.includes("clinical")) industry = "healthcare";
          else if (dept.includes("financ") || dept.includes("bank")) industry = "financial_services";
          else if (dept.includes("insurance") || dept.includes("underwriting")) industry = "insurance";
          else if (dept.includes("manufactur") || dept.includes("production")) industry = "manufacturing";
          else if (dept.includes("retail") || dept.includes("commerce")) industry = "retail";
          else if (dept.includes("tech") || dept.includes("saas") || dept.includes("engineering")) industry = "technology_saas";
        }
        agentIndustryMap.set(agent.id, industry);
      }

      const eventsByIndustry = new Map<string, typeof allEvents>();
      for (const ev of allEvents) {
        const industry = (ev.agentId && agentIndustryMap.get(ev.agentId)) || "general";
        if (!eventsByIndustry.has(industry)) eventsByIndustry.set(industry, []);
        eventsByIndustry.get(industry)!.push(ev);
      }

      const disputesByOutcome = new Map<string, typeof allDisputes>();
      for (const d of allDisputes) {
        const oid = d.outcomeId || "";
        if (!disputesByOutcome.has(oid)) disputesByOutcome.set(oid, []);
        disputesByOutcome.get(oid)!.push(d);
      }

      const outcomeToIndustry = new Map<string, string>();
      for (const agent of allAgents) {
        if (agent.outcomeId) {
          outcomeToIndustry.set(agent.outcomeId, agentIndustryMap.get(agent.id) || "general");
        }
      }

      const overallTotal = allEvents.length;
      const overallAccepted = allEvents.filter(e => e.billable === true).length;
      const overallAcceptanceRate = overallTotal > 0 ? Math.round((overallAccepted / overallTotal) * 10000) / 100 : 0;

      const overallRejectionReasons = new Map<string, number>();
      for (const ev of allEvents) {
        if (!ev.billable && ev.excludeReason) {
          overallRejectionReasons.set(ev.excludeReason, (overallRejectionReasons.get(ev.excludeReason) || 0) + 1);
        }
      }
      const overallRejectionTotal = Array.from(overallRejectionReasons.values()).reduce((s, c) => s + c, 0);

      const industries: any[] = [];

      for (const [industry, events] of Array.from(eventsByIndustry.entries())) {
        const totalEvents = events.length;
        const accepted = events.filter(e => e.billable === true).length;
        const acceptanceRate = totalEvents > 0 ? Math.round((accepted / totalEvents) * 10000) / 100 : 0;

        const rejectionReasons = new Map<string, number>();
        for (const ev of events) {
          if (!ev.billable && ev.excludeReason) {
            rejectionReasons.set(ev.excludeReason, (rejectionReasons.get(ev.excludeReason) || 0) + 1);
          }
        }
        const totalRejections = Array.from(rejectionReasons.values()).reduce((s, c) => s + c, 0);
        const topRejectionReasons = Array.from(rejectionReasons.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([reason, count]) => ({ reason, count, percentOfRejections: totalRejections > 0 ? Math.round((count / totalRejections) * 1000) / 10 : 0 }));

        const industryOutcomeIds = new Set<string>();
        for (const ev of events) {
          if (ev.outcomeId) industryOutcomeIds.add(ev.outcomeId);
        }
        const disputeCategories = new Map<string, number>();
        for (const oid of Array.from(industryOutcomeIds)) {
          const disputes = disputesByOutcome.get(oid) || [];
          for (const d of disputes) {
            disputeCategories.set(d.category, (disputeCategories.get(d.category) || 0) + 1);
          }
        }
        const topDisputeCategories = Array.from(disputeCategories.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([category, count]) => ({ category, count }));

        const monthlyBuckets = new Map<string, { total: number; accepted: number }>();
        for (const ev of events) {
          if (!ev.createdAt) continue;
          const d = new Date(ev.createdAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyBuckets.has(key)) monthlyBuckets.set(key, { total: 0, accepted: 0 });
          const bucket = monthlyBuckets.get(key)!;
          bucket.total++;
          if (ev.billable === true) bucket.accepted++;
        }
        const monthlyTrend = Array.from(monthlyBuckets.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, data]) => ({
            month,
            totalEvents: data.total,
            acceptedEvents: data.accepted,
            acceptanceRate: data.total > 0 ? Math.round((data.accepted / data.total) * 10000) / 100 : 0,
          }));

        const industryRejectionTotal = Array.from(rejectionReasons.values()).reduce((s, c) => s + c, 0);
        const distinctiveFailureModes: any[] = [];
        if (overallRejectionTotal > 0 && industryRejectionTotal > 0) {
          for (const [reason, count] of Array.from(rejectionReasons.entries())) {
            const industryRate = count / industryRejectionTotal;
            const overallCount = overallRejectionReasons.get(reason) || 0;
            const overallRate = overallCount / overallRejectionTotal;
            if (overallRate > 0) {
              const overRepresentationFactor = Math.round((industryRate / overallRate) * 100) / 100;
              if (overRepresentationFactor > 1.5) {
                distinctiveFailureModes.push({
                  reason,
                  industryCount: count,
                  industryRate: Math.round(industryRate * 10000) / 100,
                  overallRate: Math.round(overallRate * 10000) / 100,
                  overRepresentationFactor,
                });
              }
            }
          }
          distinctiveFailureModes.sort((a, b) => b.overRepresentationFactor - a.overRepresentationFactor);
        }

        industries.push({
          industry,
          acceptanceRate,
          totalEvents,
          acceptedEvents: accepted,
          rejectedEvents: totalEvents - accepted,
          topRejectionReasons,
          topDisputeCategories,
          monthlyTrend,
          distinctiveFailureModes,
        });
      }

      industries.sort((a, b) => b.totalEvents - a.totalEvents);

      res.json({
        industries,
        overallAcceptanceRate,
        totalEvents: overallTotal,
        totalAccepted: overallAccepted,
        totalRejected: overallTotal - overallAccepted,
        industriesCount: industries.length,
      });
    } catch (error: any) {
      console.error("Acceptance patterns error:", error);
      res.status(500).json({ error: "Failed to compute acceptance patterns", details: error.message });
    }
  });

  // Step 4-5: Billing aggregates events for period, creates invoice + line items
  router.post("/api/billing/generate-invoice", checkPermission("billing_invoices"), async (req, res) => {
    try {
      const { outcomeId, periodStart, periodEnd } = req.body;
      if (!outcomeId) {
        return res.status(400).json({ error: "outcomeId is required" });
      }

      const orgId = getOrgId(req);
      const outcome = await storage.getOutcome(outcomeId, orgId);
      if (!outcome) {
        return res.status(404).json({ error: "Outcome not found" });
      }

      const pStart = periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const pEnd = periodEnd ? new Date(periodEnd) : new Date();

      // Get all billable events for this outcome in the period that are not yet invoiced
      const allEvents = await storage.getOutcomeEventsByOutcome(outcomeId);
      const eligibleEvents = allEvents.filter(e => {
        if (!e.billable) return false;
        if (e.invoiceId) return false;
        if (!e.createdAt) return false;
        const eventDate = new Date(e.createdAt);
        return eventDate >= pStart && eventDate <= pEnd;
      });

      if (eligibleEvents.length === 0) {
        return res.status(400).json({ error: "No unbilled billable events found for this period" });
      }

      // Compute totals based on pricing model
      let totalAmount = 0;
      const totalUnits = eligibleEvents.reduce((sum, e) => sum + (e.unitCount || 1), 0);
      const pricingModel = outcome.pricingModel || "PER_OUTCOME_EVENT";

      if (pricingModel === "PER_OUTCOME_EVENT") {
        const pricePerUnit = outcome.pricePerUnit || 0;
        totalAmount = totalUnits * pricePerUnit;
      } else if (pricingModel === "TIERED") {
        const tiers = (outcome.pricingTiers as Array<{ upTo: number; price: number }>) || [];
        let remaining = totalUnits;
        let prevLimit = 0;
        for (const tier of tiers) {
          const tierUnits = Math.min(remaining, (tier.upTo || Infinity) - prevLimit);
          if (tierUnits <= 0) break;
          totalAmount += tierUnits * (tier.price || 0);
          remaining -= tierUnits;
          prevLimit = tier.upTo || Infinity;
        }
        if (remaining > 0 && tiers.length > 0) {
          totalAmount += remaining * (tiers[tiers.length - 1].price || 0);
        }
      } else if (pricingModel === "MONTHLY_FIXED") {
        totalAmount = outcome.pricePerUnit || 0;
      }

      // Create the invoice
      const invoice = await storage.createInvoice({
        organizationId: orgId ?? undefined,
        outcomeId,
        outcomeName: outcome.name,
        periodStart: pStart,
        periodEnd: pEnd,
        totalUnits,
        billableUnits: totalUnits,
        excludedUnits: 0,
        unitPrice: outcome.pricePerUnit || 0,
        amount: Math.round(totalAmount * 100) / 100,
        status: "pending",
      });

      // Link all eligible events to this invoice
      let linkedCount = 0;
      for (const event of eligibleEvents) {
        try {
          await storage.updateOutcomeEvent(event.id, { invoiceId: invoice.id }, orgId ?? undefined);
          linkedCount++;
        } catch (linkErr: any) {
          await storage.createAuditEvent({
            organizationId: orgId ?? undefined,
            action: "invoice_event_link_failed",
            objectType: "outcome_event",
            objectId: event.id,
            actorId: "billing_service",
            actorType: "system",
            details: `Failed to link event ${event.id} to invoice ${invoice.id}: ${linkErr.message}`,
          });
        }
      }

      if (linkedCount < eligibleEvents.length) {
        await storage.updateInvoice(invoice.id, {
          billableUnits: linkedCount,
          totalUnits: linkedCount,
        }, orgId ?? undefined);
      }

      // Audit event
      await storage.createAuditEvent({
        organizationId: orgId ?? undefined,
        action: "invoice_generated",
        objectType: "invoice",
        objectId: invoice.id,
        actorId: "billing_service",
        actorType: "system",
        details: `Invoice ${invoice.id} generated for outcome "${outcome.name}": ${totalUnits} units, $${totalAmount.toFixed(2)} (${pricingModel}), period ${pStart.toISOString().split("T")[0]} to ${pEnd.toISOString().split("T")[0]}`,
      });

      // Notification audit event for finance users
      await storage.createAuditEvent({
        organizationId: orgId ?? undefined,
        action: "invoice_ready_notification",
        objectType: "invoice",
        objectId: invoice.id,
        actorId: "billing_service",
        actorType: "system",
        details: `Invoice ready for review: $${totalAmount.toFixed(2)} for "${outcome.name}" (${eligibleEvents.length} events, ${totalUnits} units). Period: ${pStart.toISOString().split("T")[0]} to ${pEnd.toISOString().split("T")[0]}`,
      });

      res.status(201).json({
        invoice,
        summary: {
          pricingModel,
          eventsLinked: eligibleEvents.length,
          totalUnits,
          unitPrice: outcome.pricePerUnit || 0,
          totalAmount: Math.round(totalAmount * 100) / 100,
          periodStart: pStart.toISOString(),
          periodEnd: pEnd.toISOString(),
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to generate invoice" });
    }
  });

  // ========== END BILLING METERING PIPELINE ==========

export default router;
