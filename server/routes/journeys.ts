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

export default router;
