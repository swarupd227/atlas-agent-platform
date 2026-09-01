import { Router } from "express";
import { storage } from "../storage";
import { checkPermission } from "../permissions";
import { getOrgId } from "../auth";

const router = Router();

/**
 * Journey Library (ontology roadmap Phase 3): a browsing surface for curated,
 * pre-built Insurance journeys generated via propose-agents ->
 * create-team-from-proposals (see server/routes/improvements.ts). Before this,
 * those Teams were indistinguishable from the other ~50 teams in the org --
 * findable only by name-search in the flat Agent Registry.
 */
router.get("/api/journeys", async (req, res) => {
  try {
    const industryId = req.query.industryId as string | undefined;
    const subVertical = req.query.subVertical as string | undefined;

    const orchestrators = (await storage.getCuratedJourneys(getOrgId(req)))
      .filter((a) => !industryId || a.journeyIndustryId === industryId)
      .filter((a) => !subVertical || a.journeySubVertical === subVertical);

    const journeys = await Promise.all(
      orchestrators.map(async (orchestrator) => {
        const members = await storage.getAgentTeamMembers(orchestrator.id);
        const workerIds = members.map((m) => m.memberAgentId);
        const workers = (
          await Promise.all(workerIds.map((id) => storage.getAgent(id, getOrgId(req))))
        ).filter((a): a is NonNullable<typeof a> => !!a);

        const allTags = [orchestrator, ...workers].flatMap((a) =>
          Array.isArray(a.ontologyTags) ? (a.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [],
        );
        const ontologyConcepts = Array.from(new Map(allTags.map((t) => [t.conceptId, t])).values());

        return {
          teamAgentId: orchestrator.id,
          name: orchestrator.name,
          description: orchestrator.description,
          industryId: orchestrator.journeyIndustryId,
          subVertical: orchestrator.journeySubVertical,
          status: orchestrator.status,
          blueprintId: orchestrator.blueprintId,
          orchestrator: { id: orchestrator.id, name: orchestrator.name },
          workers: workers.map((w) => ({ id: w.id, name: w.name, description: w.description })),
          ontologyConcepts,
          createdAt: orchestrator.createdAt,
        };
      }),
    );

    res.json(journeys);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Clones a curated journey's whole real Team -- orchestrator, every worker,
 * the blueprint, and the real team_blueprint_nodes/edges graph -- into a
 * fresh, independent (not curated) Team the requester can freely edit without
 * touching the canonical library entry. Mirrors the materialization pattern
 * in create-team-from-proposals, just sourcing from an existing Team instead
 * of a fresh LLM proposal.
 */
router.post("/api/journeys/:id/clone", checkPermission("create_modify_blueprints"), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const source = await storage.getAgent(req.params.id as string, orgId);
    if (!source || !source.isCuratedJourney) {
      return res.status(404).json({ error: "Curated journey not found" });
    }
    if (!source.blueprintId) {
      return res.status(400).json({ error: "Journey has no blueprint to clone" });
    }
    const sourceBlueprint = await storage.getBlueprint(source.blueprintId);
    if (!sourceBlueprint) return res.status(404).json({ error: "Journey blueprint not found" });

    const members = await storage.getAgentTeamMembers(source.id);
    const sourceWorkers = (
      await Promise.all(members.map((m) => storage.getAgent(m.memberAgentId, orgId)))
    ).filter((a): a is NonNullable<typeof a> => !!a);

    const cloneAgentFields = (a: NonNullable<typeof source>) => ({
      name: `${a.name} (Clone)`,
      description: a.description,
      owner: a.owner,
      agentType: a.agentType,
      riskTier: a.riskTier,
      autonomyMode: a.autonomyMode,
      modelProvider: a.modelProvider,
      modelName: a.modelName,
      toolsConfig: a.toolsConfig,
      systemPrompt: a.systemPrompt,
      complianceTags: a.complianceTags,
      ontologyTags: a.ontologyTags,
      policyBindings: a.policyBindings,
      preloadedSkills: a.preloadedSkills,
      runtimeConfig: a.runtimeConfig,
      // Deliberately NOT copied: isCuratedJourney/journeyIndustryId/journeySubVertical
      // (a clone is a working copy, not another library entry) and blueprintId
      // (set below once the new blueprint exists).
    });

    const newOrchestrator = await storage.createAgent(cloneAgentFields(source) as any);

    const workerIdMap = new Map<string, string>(); // old worker agent id -> new worker agent id
    for (const w of sourceWorkers) {
      const newWorker = await storage.createAgent(cloneAgentFields(w) as any);
      workerIdMap.set(w.id, newWorker.id);
      await storage.createAgentTeamMember({ teamAgentId: newOrchestrator.id, memberAgentId: newWorker.id, role: "member" });
    }

    const newBlueprint = await storage.createBlueprint({
      name: `${sourceBlueprint.name} (Clone)`,
      description: sourceBlueprint.description,
      agentId: newOrchestrator.id,
      status: "draft",
      blueprintJson: sourceBlueprint.blueprintJson as any,
    });

    const sourceNodes = await storage.getTeamBlueprintNodes(source.blueprintId);
    const sourceEdges = await storage.getTeamBlueprintEdges(source.blueprintId);
    const nodeIdMap = new Map<string, string>(); // old node id -> new node id

    for (const node of sourceNodes) {
      const newRefAgentId =
        node.refAgentId === source.id ? newOrchestrator.id : node.refAgentId ? workerIdMap.get(node.refAgentId) ?? null : null;
      const newNode = await storage.createTeamBlueprintNode({
        blueprintId: newBlueprint.id,
        nodeType: node.nodeType,
        label: node.label,
        positionX: node.positionX,
        positionY: node.positionY,
        refAgentId: newRefAgentId,
        refRemoteAgentId: node.refRemoteAgentId,
        refToolIds: node.refToolIds,
        refPolicyId: node.refPolicyId,
        gateType: node.gateType,
        config: node.config,
        stateKey: node.stateKey,
        outputSchema: node.outputSchema,
        fallbackOutput: node.fallbackOutput,
        timeoutMs: node.timeoutMs,
        retryPolicy: node.retryPolicy,
        outputContractId: node.outputContractId,
        refSkillId: node.refSkillId,
        refKnowledgeBaseId: node.refKnowledgeBaseId,
      } as any);
      nodeIdMap.set(node.id, newNode.id);
    }

    for (const edge of sourceEdges) {
      const newSource = nodeIdMap.get(edge.sourceNodeId);
      const newTarget = nodeIdMap.get(edge.targetNodeId);
      if (!newSource || !newTarget) continue; // orphaned edge on the source graph -- skip rather than fail the whole clone
      await storage.createTeamBlueprintEdge({
        blueprintId: newBlueprint.id,
        sourceNodeId: newSource,
        targetNodeId: newTarget,
        label: edge.label,
        contentPartTypes: edge.contentPartTypes,
        allowedMetadata: edge.allowedMetadata,
        slaTimeoutMs: edge.slaTimeoutMs,
        failureMode: edge.failureMode,
        retryPolicy: edge.retryPolicy,
        condition: edge.condition,
        config: edge.config,
        evaluationMode: edge.evaluationMode,
        rule: edge.rule,
      } as any);
    }

    const sourceRuntimeConfig = (source.runtimeConfig as Record<string, any>) || {};
    const updatedOrchestrator = await storage.updateAgent(newOrchestrator.id, {
      blueprintId: newBlueprint.id,
      runtimeConfig: {
        ...sourceRuntimeConfig,
        orchestration: {
          ...(sourceRuntimeConfig.orchestration || {}),
          workerIds: Array.from(workerIdMap.values()),
          blueprintId: newBlueprint.id,
        },
      },
    });

    res.status(201).json({
      teamAgent: updatedOrchestrator,
      workers: Array.from(workerIdMap.values()),
      blueprint: newBlueprint,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Ontology roadmap Phase 4 ("close the loop"): real per-journey signal for
 * curation decisions, instead of a one-time audit. Two real sources, both
 * read-only and already used elsewhere for the same purpose:
 *  - run history from the orchestrator's own trace records (the same source
 *    the Agent Detail "Runs & Traces" tab reads -- team pipeline executions
 *    are recorded under the orchestrator's agentId, see shadow-canary.ts)
 *  - ontology alignment scores from mcp_parameter_matches, the same real
 *    50%-threshold computation that actually gates runtime start in
 *    agent-runtime.ts's resolveBlueprint, recomputed here read-only per MCP
 *    server this journey's agents reference.
 * With zero runs so far (true for a freshly generated journey) this reports
 * "not_yet_run" rather than a fabricated "healthy" -- the whole point is to
 * only ever say what's actually known.
 */
router.get("/api/journeys/:id/health", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const orchestrator = await storage.getAgent(req.params.id as string, orgId);
    if (!orchestrator || !orchestrator.isCuratedJourney) {
      return res.status(404).json({ error: "Curated journey not found" });
    }

    const members = await storage.getAgentTeamMembers(orchestrator.id);
    const workers = (
      await Promise.all(members.map((m) => storage.getAgent(m.memberAgentId, orgId)))
    ).filter((a): a is NonNullable<typeof a> => !!a);
    const allAgents = [orchestrator, ...workers];

    const traces = await storage.getTracesByAgent(orchestrator.id, orgId);
    const runCount = traces.length;
    const completedCount = traces.filter((t) => t.status === "completed").length;
    const successRate = runCount > 0 ? completedCount / runCount : null;
    const lastRunAt = traces[0]?.startedAt || null; // getTracesByAgent orders desc by startedAt

    const allServers = await storage.getMcpServers();
    const serverNames = new Set<string>();
    for (const a of allAgents) {
      const rtConfig = (a.runtimeConfig as any) || {};
      for (const b of rtConfig.mcpToolBindings || []) {
        if (b?.server) serverNames.add(b.server);
      }
    }
    const alignment: Array<{ server: string; connected: boolean; score: number | null; matched: number; total: number }> = [];
    for (const name of Array.from(serverNames)) {
      const server = allServers.find((s) => s.name === name);
      if (!server) {
        alignment.push({ server: name, connected: false, score: null, matched: 0, total: 0 });
        continue;
      }
      const matches = await storage.getMcpParameterMatches(server.id);
      const matched = matches.filter((m) => m.matchStatus === "matched" || m.matchStatus === "partial").length;
      const total = matches.length;
      alignment.push({ server: name, connected: true, score: total > 0 ? matched / total : null, matched, total });
    }

    const lowAlignment = alignment.filter((a) => a.score !== null && a.score < 0.5);
    const flagReasons: string[] = [];
    if (runCount > 0 && successRate !== null && successRate < 0.5) {
      flagReasons.push(`Only ${Math.round(successRate * 100)}% of ${runCount} run(s) completed successfully`);
    }
    if (lowAlignment.length > 0) {
      flagReasons.push(`${lowAlignment.length} MCP server(s) below 50% ontology alignment: ${lowAlignment.map((a) => a.server).join(", ")}`);
    }

    res.json({
      teamAgentId: orchestrator.id,
      runCount,
      successRate,
      lastRunAt,
      alignment,
      flagged: flagReasons.length > 0,
      flagReasons,
      status: runCount === 0 ? "not_yet_run" : flagReasons.length > 0 ? "needs_attention" : "healthy",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
