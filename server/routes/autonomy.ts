import { Router } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { storage } from "../storage";
import {
  insertAutonomyProfileSchema,
  insertOversightDecisionSchema,
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const router = Router();

  router.get("/api/autonomy-profiles", async (_req, res) => {
    try {
      const profiles = await storage.getAutonomyProfiles();
      res.json(profiles);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy-profiles/:id", async (req, res) => {
    try {
      const profile = await storage.getAutonomyProfile(req.params.id);
      if (!profile) return res.status(404).json({ error: "Not found" });
      res.json(profile);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/autonomy-profiles", async (req, res) => {
    try {
      const data = insertAutonomyProfileSchema.parse(req.body);
      const created = await storage.createAutonomyProfile(data);
      res.status(201).json(created);
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: e.message });
    }
  });

  router.patch("/api/autonomy-profiles/:id", async (req, res) => {
    try {
      const updated = await storage.updateAutonomyProfile(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/api/autonomy-profiles/:id", async (req, res) => {
    try {
      const ok = await storage.deleteAutonomyProfile(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Oversight Decisions CRUD
  router.get("/api/oversight-decisions", async (req, res) => {
    try {
      const decisions = await storage.getOversightDecisions();
      res.json(decisions);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/oversight-decisions/:id", async (req, res) => {
    try {
      const decision = await storage.getOversightDecision(req.params.id);
      if (!decision) return res.status(404).json({ error: "Not found" });
      res.json(decision);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/oversight-decisions", async (req, res) => {
    try {
      const validated = insertOversightDecisionSchema.parse(req.body);
      const decision = await storage.createOversightDecision(validated);
      res.json(decision);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: e.message });
    }
  });

  router.patch("/api/oversight-decisions/:id", async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.resolvedAt === "string") body.resolvedAt = new Date(body.resolvedAt);
      const validated = insertOversightDecisionSchema.partial().parse(body);
      const updated = await storage.updateOversightDecision(req.params.id, validated);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: e.message });
    }
  });

  router.delete("/api/oversight-decisions/:id", async (req, res) => {
    try {
      const ok = await storage.deleteOversightDecision(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/ai/generate-oversight-decisions", async (req, res) => {
    try {
      const { industry, count = 3 } = req.body;
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI governance expert generating realistic oversight decision scenarios for AI agent management platforms. Generate decisions that require human review.

Return JSON with this structure:
{
  "decisions": [
    {
      "agentName": "string - realistic agent name for the industry",
      "actionType": "string - short action label (e.g. Block Transaction, Recommend Treatment, Halt Production)",
      "actionDescription": "string - detailed 2-3 sentence description of what the agent wants to do and why",
      "priority": "critical|high|medium|low",
      "compositeRiskScore": number 0-100,
      "confidence": number 0-1,
      "reasoningChain": [{"step": number, "action": "string", "result": "string"}],
      "industryContext": {"key": "value pairs relevant to the industry"},
      "regulatoryPolicies": [{"regulation": "string", "relevance": "string", "requirement": "string", "complianceRisk": "low|medium|high"}],
      "ontologyRefs": ["string array of relevant domain concepts"],
      "similarDecisions": [{"description": "string", "outcome": "approved|rejected|modified", "result": "string", "similarity": number 0-100, "timeAgo": "string"}],
      "riskDimensions": {"dimension_name": number 0-100},
      "requestedAction": {"type": "string", "target": "string", "fallback": "string"}
    }
  ]
}

Make each decision unique, realistic, and industry-appropriate. Include diverse risk levels and action types. Use real regulation names and realistic agent scenarios.`
          },
          {
            role: "user",
            content: `Generate ${Math.min(count, 5)} realistic pending oversight decisions for the ${industry || "financial_services"} industry. Make them diverse in risk level and action type. Return ONLY valid JSON.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });
      const parsed = JSON.parse(content);
      const createdDecisions = [];
      for (const d of (parsed.decisions || [])) {
        const decision = await storage.createOversightDecision({
          agentName: d.agentName,
          actionType: d.actionType,
          actionDescription: d.actionDescription,
          industry: industry || "financial_services",
          status: "pending",
          priority: d.priority || "medium",
          compositeRiskScore: d.compositeRiskScore || 50,
          confidence: d.confidence || 0.5,
          reasoningChain: d.reasoningChain || [],
          industryContext: d.industryContext || {},
          regulatoryPolicies: d.regulatoryPolicies || [],
          ontologyRefs: d.ontologyRefs || [],
          similarDecisions: d.similarDecisions || [],
          riskDimensions: d.riskDimensions || {},
          requestedAction: d.requestedAction || {},
        } as any);
        createdDecisions.push(decision);
      }
      res.json({ decisions: createdDecisions, count: createdDecisions.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/ai/oversight-context", async (req, res) => {
    try {
      const { decision, industry } = req.body;
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI governance expert providing decision context for human oversight of AI agents. Given a pending agent decision, provide rich context including similar historical decisions, risk analysis, and regulatory implications.

Return JSON with this structure:
{
  "riskAnalysis": {
    "compositeScore": number 0-100,
    "dimensions": [{ "name": "string", "score": number 0-100, "explanation": "string" }],
    "overallRisk": "low|medium|high|critical"
  },
  "similarDecisions": [
    {
      "description": "string - what the similar decision was",
      "outcome": "approved|rejected|modified",
      "result": "string - what happened after the decision",
      "similarity": number 0-100,
      "timeAgo": "string - when it happened"
    }
  ],
  "regulatoryContext": [
    {
      "regulation": "string - regulation name",
      "relevance": "string - why it applies",
      "requirement": "string - what it requires",
      "complianceRisk": "low|medium|high"
    }
  ],
  "recommendation": {
    "action": "approve|reject|escalate|modify",
    "confidence": number 0-1,
    "reasoning": "string - why this action is recommended"
  }
}`
          },
          {
            role: "user",
            content: `Provide decision context for this pending AI agent action in the ${industry || "financial_services"} industry.

Decision Details: ${JSON.stringify(decision || {})}

Analyze risk dimensions, find similar past decisions, identify applicable regulations, and provide a recommendation. Return ONLY valid JSON.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });
      res.json(JSON.parse(content));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // AI Autonomy Learning Recommendations
  router.post("/api/ai/generate-autonomy-profile", async (req, res) => {
    try {
      const { industry, profileName, description } = req.body;
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI governance expert specializing in adaptive autonomy calibration. Generate a complete autonomy profile with industry-specific risk dimensions and calibrated autonomy levels.

Return JSON with this structure:
{
  "riskDimensions": [
    {
      "id": "string - snake_case identifier",
      "name": "string - human readable name",
      "description": "string - what this dimension measures",
      "category": "string - category like Financial, Regulatory, Clinical, Safety, etc.",
      "weight": number 0-100,
      "thresholds": { "low": number, "medium": number, "high": number, "critical": number },
      "oversightLevel": "string - full_auto|log_only|notify_after|confirm_before|expert_approval"
    }
  ],
  "autonomyLevels": [
    {
      "actionType": "string - snake_case action id",
      "actionName": "string - human readable name",
      "category": "string - category like Data Operations, Analytics, etc.",
      "level": number 0-4,
      "levelName": "string - Full Auto|Log Only|Notify After|Confirm Before|Expert Approval",
      "baseLevel": number 0-4,
      "riskAdjusted": boolean
    }
  ],
  "overrideRules": [
    {
      "id": "string - snake_case id",
      "name": "string - rule name",
      "description": "string - when and why this override applies",
      "startDate": "string - YYYY-MM-DD",
      "endDate": "string - YYYY-MM-DD",
      "condition": "string - trigger condition",
      "overrideLevel": "string - autonomy level during override",
      "affectedActions": ["string - action type ids"],
      "active": boolean
    }
  ],
  "summary": "string - brief summary of the generated profile"
}

Generate 6-8 risk dimensions specific to the industry, 8-12 action types with appropriate autonomy levels, and 2-3 reasonable override rules for common business periods. Levels 0=Full Auto, 1=Log Only, 2=Notify After, 3=Confirm Before, 4=Expert Approval.`
          },
          {
            role: "user",
            content: `Generate a complete autonomy profile for the "${industry || "financial_services"}" industry.
Profile name: "${profileName || "Auto-Generated Profile"}"
Description: "${description || "AI-generated autonomy configuration"}"

Consider industry-specific regulations, risk tolerances, and common business patterns. Generate realistic risk dimensions, well-calibrated autonomy levels for typical agent actions, and sensible override rules.

Return ONLY valid JSON.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });
      res.json(JSON.parse(content));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/ai/enhance-autonomy-profile", async (req, res) => {
    try {
      const { industry, riskDimensions, autonomyLevels, overrideRules } = req.body;
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI governance expert specializing in adaptive autonomy optimization. Analyze an existing autonomy profile and suggest enhancements to improve its effectiveness, coverage, and risk calibration.

Return JSON with this structure:
{
  "enhancedRiskDimensions": [same structure as input but with improved weights, thresholds, oversight levels, and optionally added/modified dimensions],
  "enhancedAutonomyLevels": [same structure as input but with optimized levels based on risk analysis],
  "enhancedOverrideRules": [same structure as input but with improved or additional override rules],
  "improvements": [
    {
      "area": "string - risk_dimensions|autonomy_levels|override_rules",
      "change": "string - what was changed",
      "reasoning": "string - why this improvement was made",
      "impact": "high|medium|low"
    }
  ],
  "coverageScore": { "before": number 0-100, "after": number 0-100 },
  "riskScore": { "before": number 0-100, "after": number 0-100 },
  "summary": "string - overall enhancement summary"
}

Analyze gaps in risk coverage, identify miscalibrated autonomy levels, suggest missing override rules, and optimize weights. Preserve the overall structure but enhance it with better calibration.`
          },
          {
            role: "user",
            content: `Enhance this autonomy profile for the "${industry || "financial_services"}" industry.

Current Risk Dimensions: ${JSON.stringify(riskDimensions || [])}
Current Autonomy Levels: ${JSON.stringify(autonomyLevels || [])}
Current Override Rules: ${JSON.stringify(overrideRules || [])}

Analyze the current configuration and suggest specific enhancements. Identify gaps in risk coverage, miscalibrated autonomy levels, and missing override rules. Provide before/after scores.

Return ONLY valid JSON.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });
      res.json(JSON.parse(content));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/ai/autonomy-recommendations", async (req, res) => {
    try {
      const { industry, riskDimensions, autonomyLevels, approvalHistory } = req.body;
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI governance expert specializing in adaptive autonomy calibration for AI agent platforms. Analyze approval patterns and risk dimensions to recommend autonomy adjustments.

Return JSON with this structure:
{
  "recommendations": [
    {
      "actionType": "string - the action type being analyzed",
      "currentLevel": "string - current autonomy level (full_auto|log_only|notify_after|confirm_before|expert_approval)",
      "recommendedLevel": "string - recommended autonomy level",
      "direction": "string - increase|decrease|maintain",
      "confidence": number 0-1,
      "reasoning": "string - why this change is recommended",
      "approvalRate": number 0-100,
      "sampleSize": number,
      "riskFactors": ["string - relevant risk factors"]
    }
  ],
  "overallAssessment": "string - summary of the autonomy posture",
  "riskAlerts": [
    {
      "severity": "high|medium|low",
      "message": "string - risk alert description",
      "affectedActions": ["string"]
    }
  ],
  "efficiencyGains": {
    "estimatedTimesSaved": "string - estimated time savings",
    "reducedApprovals": number,
    "currentBottlenecks": ["string - current bottleneck descriptions"]
  }
}`
          },
          {
            role: "user",
            content: `Analyze these autonomy settings and recommend adjustments for the ${industry || "general"} industry.

Current Risk Dimensions: ${JSON.stringify(riskDimensions || [])}
Current Autonomy Levels: ${JSON.stringify(autonomyLevels || [])}
Recent Approval History: ${JSON.stringify(approvalHistory || { totalDecisions: 250, approvedRate: 87, avgReviewTime: "4.2 hours", topActions: ["data_enrichment", "entity_resolution", "report_generation", "model_retraining", "alert_escalation"] })}

Provide specific, actionable recommendations for calibrating autonomy levels based on the approval patterns and risk dimensions. Consider industry-specific regulations and risk tolerances.

Return ONLY valid JSON.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });
      res.json(JSON.parse(content));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ===== Adaptive Autonomy Calibration Engine (IP #5) =====

  const AUTONOMY_LEVEL_HIERARCHY = ["expert_approval", "confirm_before", "notify_after", "log_only", "full_auto"];

  function getNextExpandedLevel(current: string): string | null {
    const idx = AUTONOMY_LEVEL_HIERARCHY.indexOf(current);
    if (idx < 0 || idx >= AUTONOMY_LEVEL_HIERARCHY.length - 1) return null;
    return AUTONOMY_LEVEL_HIERARCHY[idx + 1];
  }

  function getNextTightenedLevel(current: string): string | null {
    const idx = AUTONOMY_LEVEL_HIERARCHY.indexOf(current);
    if (idx <= 0) return null;
    return AUTONOMY_LEVEL_HIERARCHY[idx - 1];
  }

  async function recalculateQualityProfile(agentId: string, decisionType: string, riskDimension: string | null, industry: string) {
    const allDecisions = await storage.getAutonomyDecisions({ agentId, decisionType, industry });
    const relevant = allDecisions.filter((d: any) => !riskDimension || d.riskDimension === riskDimension);
    const correct = relevant.filter((d: any) => d.outcome === "validated_correct" || d.outcome === "escalation_avoided").length;
    const incorrect = relevant.filter((d: any) => d.outcome === "validated_incorrect" || d.outcome === "escalation_needed").length;
    const pending = relevant.filter((d: any) => d.outcome === "pending").length;
    const total = relevant.length;
    const resolved = correct + incorrect;
    const accuracyRate = resolved > 0 ? correct / resolved : 0;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const recent30 = relevant.filter((d: any) => d.outcomeAt && new Date(d.outcomeAt) >= thirtyDaysAgo && d.outcome !== "pending");
    const prev30 = relevant.filter((d: any) => d.outcomeAt && new Date(d.outcomeAt) >= sixtyDaysAgo && new Date(d.outcomeAt) < thirtyDaysAgo && d.outcome !== "pending");
    const recentAcc = recent30.length > 0 ? recent30.filter((d: any) => d.outcome === "validated_correct" || d.outcome === "escalation_avoided").length / recent30.length : 0;
    const prevAcc = prev30.length > 0 ? prev30.filter((d: any) => d.outcome === "validated_correct" || d.outcome === "escalation_avoided").length / prev30.length : 0;
    let trendDirection = "stable";
    if (recent30.length >= 5 && prev30.length >= 5) {
      if (recentAcc - prevAcc > 0.05) trendDirection = "improving";
      else if (prevAcc - recentAcc > 0.05) trendDirection = "degrading";
    }

    const existingProfiles = await storage.getDecisionQualityProfiles({ agentId, decisionType });
    const matchingProfile = existingProfiles.find((p: any) => (p.riskDimension || null) === (riskDimension || null));

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const profileData: any = {
      totalDecisions: total,
      correctDecisions: correct,
      incorrectDecisions: incorrect,
      pendingDecisions: pending,
      accuracyRate: Math.round(accuracyRate * 10000) / 10000,
      trendDirection,
      updatedAt: now,
    };

    if (matchingProfile) {
      const existingTrend = Array.isArray(matchingProfile.trendData) ? matchingProfile.trendData as any[] : [];
      const updatedTrend = existingTrend.filter((t: any) => t.month !== monthKey);
      updatedTrend.push({ month: monthKey, accuracy: Math.round(accuracyRate * 10000) / 10000, sampleSize: resolved });
      if (updatedTrend.length > 12) updatedTrend.splice(0, updatedTrend.length - 12);
      profileData.trendData = updatedTrend;
      return storage.updateDecisionQualityProfile(matchingProfile.id, profileData);
    } else {
      return storage.createDecisionQualityProfile({
        agentId,
        industry,
        decisionType,
        riskDimension: riskDimension || undefined,
        ...profileData,
        trendData: [{ month: monthKey, accuracy: Math.round(accuracyRate * 10000) / 10000, sampleSize: resolved }],
      });
    }
  }

  router.post("/api/autonomy/decisions", async (req, res) => {
    try {
      const decision = await storage.createAutonomyDecision(req.body);
      res.json(decision);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy/decisions", async (req, res) => {
    try {
      const { agentId, decisionType, industry, outcome } = req.query;
      const decisions = await storage.getAutonomyDecisions({
        agentId: agentId as string,
        decisionType: decisionType as string,
        industry: industry as string,
        outcome: outcome as string,
      });
      res.json(decisions);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy/decisions/:id", async (req, res) => {
    try {
      const decision = await storage.getAutonomyDecision(req.params.id);
      if (!decision) return res.status(404).json({ message: "Decision not found" });
      res.json(decision);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/autonomy/decisions/:id/validate", async (req, res) => {
    try {
      const { outcome, outcomeSource, outcomeDetails } = req.body;
      if (!outcome || !outcomeSource) {
        return res.status(400).json({ message: "outcome and outcomeSource are required" });
      }
      const validOutcomes = ["validated_correct", "validated_incorrect", "escalation_avoided", "escalation_needed"];
      if (!validOutcomes.includes(outcome)) {
        return res.status(400).json({ message: `outcome must be one of: ${validOutcomes.join(", ")}` });
      }

      const decision = await storage.getAutonomyDecision(req.params.id);
      if (!decision) return res.status(404).json({ message: "Decision not found" });

      const updated = await storage.updateAutonomyDecision(req.params.id, {
        outcome,
        outcomeSource,
        outcomeDetails: outcomeDetails || null,
        outcomeAt: new Date(),
      });

      await recalculateQualityProfile(decision.agentId, decision.decisionType, decision.riskDimension, decision.industry);

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "calibration_engine",
        action: "autonomy_decision_validated",
        objectType: "autonomy_decision",
        objectId: decision.id,
        details: JSON.stringify({ outcome, outcomeSource, agentId: decision.agentId, decisionType: decision.decisionType }),
      });

      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy/quality-profiles", async (req, res) => {
    try {
      const { agentId, industry, decisionType } = req.query;
      const profiles = await storage.getDecisionQualityProfiles({
        agentId: agentId as string,
        industry: industry as string,
        decisionType: decisionType as string,
      });
      res.json(profiles);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/autonomy/calibrate", async (req, res) => {
    try {
      const { agentId } = req.body;
      const profileFilters: any = {};
      if (agentId) profileFilters.agentId = agentId;
      const allProfiles = await storage.getDecisionQualityProfiles(profileFilters);

      const proposals: any[] = [];
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      for (const profile of allProfiles) {
        const resolved = profile.correctDecisions + profile.incorrectDecisions;
        if (resolved < 10) continue;

        const recentDecisions = await storage.getAutonomyDecisions({
          agentId: profile.agentId,
          decisionType: profile.decisionType,
        });
        const recentIncorrect = recentDecisions.filter((d: any) =>
          (d.outcome === "validated_incorrect" || d.outcome === "escalation_needed") &&
          d.outcomeAt && new Date(d.outcomeAt) >= sevenDaysAgo
        );
        const recentIncidents = recentDecisions.filter((d: any) =>
          (d.outcome === "validated_incorrect" || d.outcome === "escalation_needed") &&
          d.outcomeAt && new Date(d.outcomeAt) >= thirtyDaysAgo
        );

        const currentLevel = profile.currentAutonomyLevel || "confirm_before";

        if (profile.accuracyRate >= 0.95 && resolved >= 50 &&
            (profile.trendDirection === "improving" || profile.trendDirection === "stable") &&
            recentIncidents.length === 0) {
          const nextLevel = getNextExpandedLevel(currentLevel);
          if (nextLevel) {
            const confidenceScore = Math.min(0.99, profile.accuracyRate * (resolved / (resolved + 50)));
            const existingPending = await storage.getAutonomyBoundaryProposals({
              status: "pending", agentId: profile.agentId,
            });
            const alreadyProposed = existingPending.find((p: any) =>
              p.decisionType === profile.decisionType && p.riskDimension === (profile.riskDimension || null)
            );
            if (!alreadyProposed) {
              const proposal = await storage.createAutonomyBoundaryProposal({
                agentId: profile.agentId,
                profileId: profile.id,
                industry: profile.industry,
                decisionType: profile.decisionType,
                riskDimension: profile.riskDimension || undefined,
                currentLevel,
                proposedLevel: nextLevel,
                direction: "expand",
                evidence: {
                  accuracyRate: profile.accuracyRate,
                  totalDecisions: resolved,
                  trendDirection: profile.trendDirection,
                  recentIncidents: 0,
                  trendData: profile.trendData,
                  sampleDecisions: recentDecisions.slice(0, 5).map((d: any) => ({
                    id: d.id, outcome: d.outcome, confidence: d.confidence, createdAt: d.createdAt,
                  })),
                },
                confidenceScore,
                status: "pending",
              });
              proposals.push(proposal);
            }
          }
        }

        if (profile.accuracyRate < 0.80 || recentIncorrect.length > 0) {
          const nextLevel = getNextTightenedLevel(currentLevel);
          if (nextLevel) {
            const existingPending = await storage.getAutonomyBoundaryProposals({
              status: "pending", agentId: profile.agentId,
            });
            const alreadyProposed = existingPending.find((p: any) =>
              p.decisionType === profile.decisionType && p.direction === "tighten"
            );
            if (!alreadyProposed) {
              const proposal = await storage.createAutonomyBoundaryProposal({
                agentId: profile.agentId,
                profileId: profile.id,
                industry: profile.industry,
                decisionType: profile.decisionType,
                riskDimension: profile.riskDimension || undefined,
                currentLevel,
                proposedLevel: nextLevel,
                direction: "tighten",
                evidence: {
                  accuracyRate: profile.accuracyRate,
                  totalDecisions: resolved,
                  trendDirection: profile.trendDirection,
                  recentIncorrectCount: recentIncorrect.length,
                  recentIncorrect: recentIncorrect.slice(0, 5).map((d: any) => ({
                    id: d.id, decisionType: d.decisionType, outcomeDetails: d.outcomeDetails, createdAt: d.createdAt,
                  })),
                },
                confidenceScore: 0.9,
                status: "pending",
              });
              proposals.push(proposal);
            }
          }
        }

        await storage.updateDecisionQualityProfile(profile.id, {
          currentAutonomyLevel: currentLevel,
          recommendedAutonomyLevel: proposals.find((p: any) => p.agentId === profile.agentId && p.decisionType === profile.decisionType)?.proposedLevel || currentLevel,
          lastCalibrationAt: now,
        });
      }

      res.json({
        calibratedProfiles: allProfiles.length,
        proposalsGenerated: proposals.length,
        proposals,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy/calibration-proposals", async (req, res) => {
    try {
      const { status, agentId, industry } = req.query;
      const proposals = await storage.getAutonomyBoundaryProposals({
        status: status as string,
        agentId: agentId as string,
        industry: industry as string,
      });
      res.json(proposals);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/autonomy/calibration-proposals/:id/review", async (req, res) => {
    try {
      const { decision, reviewNote, reviewedBy } = req.body;
      if (!decision || !["approved", "rejected"].includes(decision)) {
        return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
      }

      const proposal = await storage.getAutonomyBoundaryProposal(req.params.id);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.status !== "pending") {
        return res.status(400).json({ message: "Proposal already reviewed" });
      }

      const updateData: any = {
        status: decision,
        reviewedBy: reviewedBy || "admin",
        reviewNote: reviewNote || "",
        reviewedAt: new Date(),
      };

      if (decision === "approved") {
        updateData.appliedAt = new Date();

        if (proposal.profileId) {
          const autonomyProfile = await storage.getAutonomyProfile(proposal.profileId);
          if (autonomyProfile) {
            const levels = Array.isArray(autonomyProfile.autonomyLevels) ? [...autonomyProfile.autonomyLevels as any[]] : [];
            const existingIdx = levels.findIndex((l: any) => l.actionType === proposal.decisionType);
            if (existingIdx >= 0) {
              levels[existingIdx] = { ...levels[existingIdx], level: proposal.proposedLevel, calibratedAt: new Date().toISOString() };
            } else {
              levels.push({ actionType: proposal.decisionType, level: proposal.proposedLevel, calibratedAt: new Date().toISOString() });
            }

            const existingLearning = (autonomyProfile.learningData || {}) as Record<string, any>;
            const history = existingLearning.boundaryChanges || [];
            history.push({
              decisionType: proposal.decisionType,
              from: proposal.currentLevel,
              to: proposal.proposedLevel,
              direction: proposal.direction,
              accuracyRate: (proposal.evidence as any)?.accuracyRate,
              appliedAt: new Date().toISOString(),
            });

            await storage.updateAutonomyProfile(autonomyProfile.id, {
              autonomyLevels: levels,
              learningData: { ...existingLearning, boundaryChanges: history, lastCalibration: new Date().toISOString() },
            });
          }
        }

        const qualityProfiles = await storage.getDecisionQualityProfiles({ agentId: proposal.agentId, decisionType: proposal.decisionType });
        for (const qp of qualityProfiles) {
          await storage.updateDecisionQualityProfile(qp.id, {
            currentAutonomyLevel: proposal.proposedLevel,
          });
        }

        await storage.createAuditEvent({
          actorType: "expert",
          actorId: reviewedBy || "admin",
          action: "autonomy_boundary_changed",
          objectType: "autonomy_profile",
          objectId: proposal.profileId || proposal.agentId,
          details: JSON.stringify({
            proposalId: proposal.id,
            decisionType: proposal.decisionType,
            from: proposal.currentLevel,
            to: proposal.proposedLevel,
            direction: proposal.direction,
            evidence: proposal.evidence,
          }),
        });
      }

      const updated = await storage.updateAutonomyBoundaryProposal(req.params.id, updateData);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/autonomy/calibration-proposals/:id/auto-apply", async (req, res) => {
    try {
      const proposal = await storage.getAutonomyBoundaryProposal(req.params.id);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.status !== "pending") return res.status(400).json({ message: "Proposal already reviewed" });

      const evidence = proposal.evidence as any;
      if (proposal.direction !== "expand" || evidence?.accuracyRate < 0.98 || evidence?.totalDecisions < 100 || evidence?.trendDirection === "degrading") {
        return res.status(400).json({
          message: "Auto-apply requires: expand direction, ≥0.98 accuracy, ≥100 decisions, non-degrading trend",
          currentValues: {
            direction: proposal.direction,
            accuracyRate: evidence?.accuracyRate,
            totalDecisions: evidence?.totalDecisions,
            trendDirection: evidence?.trendDirection,
          },
        });
      }

      const reviewReq = { body: { decision: "approved", reviewNote: "Auto-applied: meets confidence threshold", reviewedBy: "calibration_engine" }, params: req.params } as any;
      const reviewRes = { json: (d: any) => res.json({ ...d, autoApplied: true }), status: (s: number) => ({ json: (d: any) => res.status(s).json(d) }) } as any;

      if (proposal.profileId) {
        const autonomyProfile = await storage.getAutonomyProfile(proposal.profileId);
        if (autonomyProfile) {
          const levels = Array.isArray(autonomyProfile.autonomyLevels) ? [...autonomyProfile.autonomyLevels as any[]] : [];
          const existingIdx = levels.findIndex((l: any) => l.actionType === proposal.decisionType);
          if (existingIdx >= 0) {
            levels[existingIdx] = { ...levels[existingIdx], level: proposal.proposedLevel, calibratedAt: new Date().toISOString(), autoApplied: true };
          } else {
            levels.push({ actionType: proposal.decisionType, level: proposal.proposedLevel, calibratedAt: new Date().toISOString(), autoApplied: true });
          }
          await storage.updateAutonomyProfile(autonomyProfile.id, {
            autonomyLevels: levels,
            learningData: {
              ...(autonomyProfile.learningData as any || {}),
              boundaryChanges: [...((autonomyProfile.learningData as any)?.boundaryChanges || []), {
                decisionType: proposal.decisionType, from: proposal.currentLevel, to: proposal.proposedLevel,
                direction: "expand", autoApplied: true, appliedAt: new Date().toISOString(),
              }],
              lastCalibration: new Date().toISOString(),
            },
          });
        }
      }

      const updated = await storage.updateAutonomyBoundaryProposal(proposal.id, {
        status: "auto_applied",
        reviewedBy: "calibration_engine",
        reviewNote: "Auto-applied: meets confidence threshold (≥0.98 accuracy, ≥100 decisions, stable trend)",
        reviewedAt: new Date(),
        appliedAt: new Date(),
      });

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "calibration_engine",
        action: "autonomy_boundary_auto_applied",
        objectType: "autonomy_profile",
        objectId: proposal.profileId || proposal.agentId,
        details: JSON.stringify({
          proposalId: proposal.id, decisionType: proposal.decisionType,
          from: proposal.currentLevel, to: proposal.proposedLevel, direction: "expand",
          accuracyRate: evidence?.accuracyRate, totalDecisions: evidence?.totalDecisions,
        }),
      });

      res.json({ ...updated, autoApplied: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/autonomy/compute-maturity", async (req, res) => {
    try {
      const { agentId } = req.body;
      const targetAgents = agentId ? [await storage.getAgent(agentId)].filter(Boolean) : await storage.getAgents();
      const results: any[] = [];

      for (const agent of targetAgents) {
        if (!agent) continue;
        const decisions = await storage.getAutonomyDecisions({ agentId: agent.id });
        const validated = decisions.filter((d: any) => d.outcome !== "pending");
        const correct = validated.filter((d: any) => d.outcome === "validated_correct" || d.outcome === "escalation_avoided");
        const avgAccuracy = validated.length > 0 ? correct.length / validated.length : 0;

        const autonomyLevelCounts: Record<string, number> = {};
        decisions.forEach((d: any) => {
          autonomyLevelCounts[d.autonomyLevelUsed] = (autonomyLevelCounts[d.autonomyLevelUsed] || 0) + 1;
        });
        const totalLevelDecisions = decisions.length || 1;
        const autonomyScore = Object.entries(autonomyLevelCounts).reduce((score, [level, count]) => {
          const idx = AUTONOMY_LEVEL_HIERARCHY.indexOf(level);
          return score + (idx >= 0 ? idx / (AUTONOMY_LEVEL_HIERARCHY.length - 1) : 0) * (count / totalLevelDecisions);
        }, 0);

        const createdAt = agent.createdAt ? new Date(agent.createdAt).getTime() : Date.now();
        const daysInProduction = Math.max(1, (Date.now() - createdAt) / (24 * 60 * 60 * 1000));
        const timeScore = Math.min(1, daysInProduction / 180);

        const decisionVolumeScore = Math.min(1, validated.length / 200);

        const maturityScore = Math.round(
          (avgAccuracy * 0.4 + autonomyScore * 0.25 + timeScore * 0.15 + decisionVolumeScore * 0.2) * 100
        ) / 100;

        const factors = {
          avgAccuracy: Math.round(avgAccuracy * 10000) / 10000,
          autonomyScore: Math.round(autonomyScore * 10000) / 10000,
          timeScore: Math.round(timeScore * 10000) / 10000,
          decisionVolumeScore: Math.round(decisionVolumeScore * 10000) / 10000,
          totalDecisions: decisions.length,
          validatedDecisions: validated.length,
          correctDecisions: correct.length,
          daysInProduction: Math.round(daysInProduction),
          autonomyLevelDistribution: autonomyLevelCounts,
        };

        await storage.updateAgent(agent.id, { maturityScore, maturityFactors: factors });
        results.push({ agentId: agent.id, agentName: agent.name, maturityScore, factors });
      }

      res.json({ agentsUpdated: results.length, results });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy/industry-baselines", async (req, res) => {
    try {
      const allProfiles = await storage.getDecisionQualityProfiles();
      const byIndustryType: Record<string, any[]> = {};

      for (const p of allProfiles) {
        const key = `${p.industry}::${p.decisionType}`;
        if (!byIndustryType[key]) byIndustryType[key] = [];
        byIndustryType[key].push(p);
      }

      const baselines = Object.entries(byIndustryType).map(([key, profiles]) => {
        const [industry, decisionType] = key.split("::");
        const totalSample = profiles.reduce((s, p) => s + (p.correctDecisions + p.incorrectDecisions), 0);
        const totalCorrect = profiles.reduce((s, p) => s + p.correctDecisions, 0);
        const avgAccuracy = totalSample > 0 ? totalCorrect / totalSample : 0;

        let recommendedLevel = "confirm_before";
        if (avgAccuracy >= 0.98 && totalSample >= 200) recommendedLevel = "full_auto";
        else if (avgAccuracy >= 0.95 && totalSample >= 100) recommendedLevel = "log_only";
        else if (avgAccuracy >= 0.90 && totalSample >= 50) recommendedLevel = "notify_after";
        else if (avgAccuracy < 0.80) recommendedLevel = "expert_approval";

        const agentAccuracies = profiles.map(p => p.accuracyRate).sort();
        const stdDev = agentAccuracies.length > 1 ? Math.sqrt(agentAccuracies.reduce((s, a) => s + Math.pow(a - avgAccuracy, 2), 0) / agentAccuracies.length) : 0;

        return {
          industry,
          decisionType,
          sampleSize: totalSample,
          agentCount: profiles.length,
          averageAccuracy: Math.round(avgAccuracy * 10000) / 10000,
          recommendedLevel,
          confidenceInterval: {
            lower: Math.max(0, Math.round((avgAccuracy - 1.96 * stdDev) * 10000) / 10000),
            upper: Math.min(1, Math.round((avgAccuracy + 1.96 * stdDev) * 10000) / 10000),
          },
          topPerformingAgents: profiles
            .filter(p => p.accuracyRate >= avgAccuracy)
            .sort((a, b) => b.accuracyRate - a.accuracyRate)
            .slice(0, 3)
            .map(p => ({ agentId: p.agentId, accuracy: p.accuracyRate, decisions: p.correctDecisions + p.incorrectDecisions })),
        };
      });

      res.json(baselines);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy/industry-baselines/:industry/benchmarks", async (req, res) => {
    try {
      const { industry } = req.params;
      const { agentId } = req.query;
      const industryProfiles = await storage.getDecisionQualityProfiles({ industry });

      const byDecisionType: Record<string, any[]> = {};
      for (const p of industryProfiles) {
        if (!byDecisionType[p.decisionType]) byDecisionType[p.decisionType] = [];
        byDecisionType[p.decisionType].push(p);
      }

      const benchmarks = Object.entries(byDecisionType).map(([decisionType, profiles]) => {
        const totalSample = profiles.reduce((s, p) => s + (p.correctDecisions + p.incorrectDecisions), 0);
        const totalCorrect = profiles.reduce((s, p) => s + p.correctDecisions, 0);
        const industryAvg = totalSample > 0 ? totalCorrect / totalSample : 0;

        const agentProfile = agentId ? profiles.find((p: any) => p.agentId === agentId) : null;
        const agentAccuracy = agentProfile?.accuracyRate || null;
        const delta = agentAccuracy !== null ? agentAccuracy - industryAvg : null;

        return {
          decisionType,
          industryAverage: Math.round(industryAvg * 10000) / 10000,
          industrySampleSize: totalSample,
          agentAccuracy: agentAccuracy !== null ? Math.round(agentAccuracy * 10000) / 10000 : null,
          deltaVsIndustry: delta !== null ? Math.round(delta * 10000) / 10000 : null,
          performance: delta === null ? "no_data" : delta >= 0.05 ? "above_average" : delta <= -0.05 ? "below_average" : "at_average",
        };
      });

      res.json({ industry, agentId: agentId || null, benchmarks });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/autonomy/apply-industry-baseline", async (req, res) => {
    try {
      const { agentId, industry } = req.body;
      if (!agentId || !industry) {
        return res.status(400).json({ message: "agentId and industry are required" });
      }

      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const allIndustryProfiles = await storage.getDecisionQualityProfiles({ industry });
      const agentProfiles = allIndustryProfiles.filter((p: any) => p.agentId === agentId);
      const otherProfiles = allIndustryProfiles.filter((p: any) => p.agentId !== agentId);

      const byDecisionType: Record<string, any[]> = {};
      for (const p of otherProfiles) {
        if (!byDecisionType[p.decisionType]) byDecisionType[p.decisionType] = [];
        byDecisionType[p.decisionType].push(p);
      }

      const applied: any[] = [];
      for (const [decisionType, profiles] of Object.entries(byDecisionType)) {
        const agentProfile = agentProfiles.find((p: any) => p.decisionType === decisionType);
        const agentDecisions = agentProfile ? (agentProfile.correctDecisions + agentProfile.incorrectDecisions) : 0;
        if (agentDecisions >= 20) continue;

        const totalSample = profiles.reduce((s: number, p: any) => s + (p.correctDecisions + p.incorrectDecisions), 0);
        const totalCorrect = profiles.reduce((s: number, p: any) => s + p.correctDecisions, 0);
        const avgAccuracy = totalSample > 0 ? totalCorrect / totalSample : 0;

        let recommendedLevel = "confirm_before";
        if (avgAccuracy >= 0.98 && totalSample >= 200) recommendedLevel = "log_only";
        else if (avgAccuracy >= 0.95 && totalSample >= 100) recommendedLevel = "notify_after";
        else if (avgAccuracy < 0.80) recommendedLevel = "expert_approval";

        applied.push({ decisionType, recommendedLevel, industryAccuracy: Math.round(avgAccuracy * 10000) / 10000, industrySample: totalSample });
      }

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "calibration_engine",
        action: "industry_baseline_applied",
        objectType: "agent",
        objectId: agentId,
        details: JSON.stringify({ industry, appliedBaselines: applied }),
      });

      res.json({ agentId, industry, appliedBaselines: applied });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/autonomy/calibration-summary", async (req, res) => {
    try {
      const allDecisions = await storage.getAutonomyDecisions();
      const allProfiles = await storage.getDecisionQualityProfiles();
      const pendingProposals = await storage.getAutonomyBoundaryProposals({ status: "pending" });
      const allProposals = await storage.getAutonomyBoundaryProposals();
      const allAgents = await storage.getAgents();

      const totalDecisions = allDecisions.length;
      const validatedDecisions = allDecisions.filter((d: any) => d.outcome !== "pending");
      const correctDecisions = validatedDecisions.filter((d: any) => d.outcome === "validated_correct" || d.outcome === "escalation_avoided");
      const avgAccuracy = validatedDecisions.length > 0 ? correctDecisions.length / validatedDecisions.length : 0;

      const approvedProposals = allProposals.filter((p: any) => p.status === "approved" || p.status === "auto_applied");
      const expandedAgents = new Set(approvedProposals.filter((p: any) => p.direction === "expand").map((p: any) => p.agentId));

      const agentsByMaturity = allAgents
        .filter((a: any) => (a.maturityScore || 0) > 0)
        .sort((a: any, b: any) => (b.maturityScore || 0) - (a.maturityScore || 0))
        .slice(0, 10)
        .map((a: any) => ({ agentId: a.id, name: a.name, maturityScore: a.maturityScore, maturityFactors: a.maturityFactors }));

      const decisionsByIndustry: Record<string, number> = {};
      allDecisions.forEach((d: any) => { decisionsByIndustry[d.industry] = (decisionsByIndustry[d.industry] || 0) + 1; });

      const qualityHeatmap = allProfiles.map((p: any) => {
        const agent = allAgents.find((a: any) => a.id === p.agentId);
        return {
          agentId: p.agentId,
          agentName: agent?.name || "Unknown",
          decisionType: p.decisionType,
          accuracyRate: p.accuracyRate,
          totalDecisions: p.totalDecisions,
          trendDirection: p.trendDirection,
          currentLevel: p.currentAutonomyLevel,
          recommendedLevel: p.recommendedAutonomyLevel,
        };
      });

      res.json({
        totalDecisions,
        validatedDecisions: validatedDecisions.length,
        avgAccuracy: Math.round(avgAccuracy * 10000) / 10000,
        pendingProposals: pendingProposals.length,
        approvedProposals: approvedProposals.length,
        agentsWithExpandedAutonomy: expandedAgents.size,
        decisionsByIndustry,
        agentMaturityLeaderboard: agentsByMaturity,
        qualityHeatmap,
        boundaryEvolution: approvedProposals.map((p: any) => ({
          agentId: p.agentId,
          decisionType: p.decisionType,
          from: p.currentLevel,
          to: p.proposedLevel,
          direction: p.direction,
          appliedAt: p.appliedAt,
        })),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Shadow Replay Studio routes
export default router;