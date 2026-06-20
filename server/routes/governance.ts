import { Router } from "express";
import * as nodeCrypto from "node:crypto";
import { storage } from "../storage";
import { db } from "../db";
import { desc, eq, sql } from "drizzle-orm";
import { z, ZodError } from "zod";
import {
  insertPolicySchema,
  insertApprovalSchema,
  insertInvoiceSchema,
  insertBillingDisputeSchema,
  insertPolicyExceptionSchema,
  insertComplianceReportSchema,
  insertIncidentSchema,
  pipelineRuns,
  type InsertAuditEvent,
} from "@shared/schema";
import { getOrgId, getDefaultOrgId } from "../auth";
import {
  checkPermission,
  getRequestRole,
  getOntologySensitivityKeys,
  invalidateOntologySensitivityCache,
  getRedactionLevel,
  redactPayload,
} from "../permissions";
import { resolveOntologyTags, handleZodError, checkPatchSafety, generateKpiAlignedEvalSuite, resolvePolicyBundle } from "./helpers";
import billingRouter from "./billing";
import { callClaude, stripJsonFences } from "../claude";

const router = Router();
router.use(billingRouter);

  router.get("/api/policies", async (req, res) => {
    const policies = await storage.getPolicies(getOrgId(req));
    res.json(policies);
  });

  router.post("/api/policies/bulk-create", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      const { policies: policyList } = req.body;
      if (!Array.isArray(policyList) || policyList.length === 0) {
        return res.status(400).json({ error: "policies array is required" });
      }
      const orgId = getOrgId(req);
      const existingPolicies = await storage.getPolicies(orgId);
      const existingNames = new Set(existingPolicies.map((p) => p.name));
      const created = [];
      let skipped = 0;
      for (const p of policyList) {
        if (existingNames.has(p.name)) {
          skipped++;
          continue;
        }
        const { organizationId: _orgIdFromBody, ...rest } = p;
        const data = insertPolicySchema.parse(rest);
        const policy = await storage.createPolicy({ ...data, organizationId: orgId ?? undefined });
        existingNames.add(policy.name);
        created.push(policy);
      }
      res.status(201).json({ created: created.length, skipped, policies: created });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/ai/enhance-policy-rules", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const { policyName, domain, description, framework, industry, existingRules } = req.body;
      if (!policyName || !domain) {
        return res.status(400).json({ error: "policyName and domain are required" });
      }
      const effectiveDescription = description || `Policy for ${policyName} in the ${domain} domain`;

      const policyRulesRaw = await callClaude({
        system: `You are an expert in regulatory compliance and AI governance policy design. You specialize in creating detailed, production-grade policy rule configurations for AI agent management platforms.

When given a policy name, domain, description, regulatory framework, and industry context, you must produce a comprehensive, deeply detailed JSON policy rules object that reflects real-world regulatory requirements and industry best practices.

Your output must be a single valid JSON object with a "rules" array. Each rule should include:
- "type": a descriptive rule type identifier
- "description": detailed explanation of what this rule enforces
- Relevant configuration fields specific to the rule type (thresholds, lists, conditions, actions, etc.)
- "severity": "critical" | "high" | "medium" | "low"
- "enforcement": "block" | "warn" | "audit" | "require_approval"
- "remediation": what to do when the rule is violated

Be thorough and specific to the ${industry || "general"} industry and ${framework || "general"} regulatory framework. Include at least 4-6 detailed rules per policy. Use realistic thresholds, identifiers, and terminology from the actual regulatory framework.`,
        user: `Enhance and deeply enrich the following policy rules for production use:

Policy Name: ${policyName}
Domain: ${domain}
Description: ${effectiveDescription}
Framework: ${framework || "General"}
Industry: ${industry || "General"}

Current (basic) rules:
${JSON.stringify(existingRules, null, 2)}`,
        maxTokens: 2048,
        jsonMode: true,
      });

      const content = stripJsonFences(policyRulesRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      const enhanced = JSON.parse(content);
      res.json({ enhancedRules: enhanced });
    } catch (e: any) {
      console.error("AI enhance policy error:", e);
      res.status(500).json({ error: e.message || "Failed to enhance policy rules" });
    }
  });

  router.get("/api/ontology-concepts/all", async (_req, res) => {
    const concepts = await storage.getAllOntologyConcepts();
    res.json(concepts);
  });

  router.post("/api/ontology-concepts", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      const { label, category, description, tags, industryId, ontologyName, properties, relationships } = req.body;
      if (!label || !category) {
        return res.status(400).json({ message: "label and category are required" });
      }
      const { randomUUID } = await import("crypto");
      const concept = await storage.createOntologyConcept({
        id: randomUUID(),
        label,
        category,
        description: description || label,
        industryId: industryId || "manufacturing",
        ontologyName: ontologyName || "Manufacturing Ontology",
        tags: Array.isArray(tags) ? tags : [],
        properties: properties ?? [],
        relationships: relationships ?? [],
      });
      res.status(201).json(concept);
    } catch (e: any) {
      console.error("[POST /api/ontology-concepts] error:", e);
      res.status(500).json({ message: "Failed to create ontology concept" });
    }
  });

  router.post("/api/ai/enhance-ontology-concept", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const { conceptId, label, category, description, industry, ontologyName, properties, relationships } = req.body;
      if (!label || !category || !description) {
        return res.status(400).json({ error: "label, category, and description are required" });
      }

      const existingTags = req.body.tags || [];

      const existingConcepts = await storage.getOntologyConcepts(industry || "");
      const conceptLabelMap = new Map<string, string>();
      for (const c of existingConcepts) {
        conceptLabelMap.set(c.label.toLowerCase(), c.id);
      }
      const availableConceptLabels = existingConcepts.map(c => c.label);
      const conceptListStr = availableConceptLabels.length > 0
        ? `\n\nAVAILABLE CONCEPTS IN THIS ONTOLOGY (you MUST only reference these as relationship targets):\n${availableConceptLabels.join(", ")}`
        : "";

      const conceptRaw = await callClaude({
        system: `You are a domain expert in ${ontologyName || "industry"} ontology and ${industry || "enterprise"} operations. You specialize in explaining how ontology concepts relate to AI agent lifecycle management.

When given an ontology concept, produce a comprehensive JSON enrichment with ALL of these fields:
- "enrichedDescription": A detailed 3-5 sentence explanation of the concept in the context of ${industry || "enterprise"} operations
- "regulatoryRelevance": How this concept relates to regulatory compliance requirements
- "agentUseCases": Array of 3-5 specific use cases where AI agents would leverage this specific concept (not generic category-level use cases)
- "dataHandlingConsiderations": Privacy, security, and data classification considerations
- "relatedStandards": Array of relevant industry standards or frameworks
- "implementationGuidance": Brief guidance on implementing AI agents that work with this concept
- "riskFactors": Array of 2-3 risk factors to consider
- "suggestedProperties": Array of 2-4 additional properties that would enrich this concept. Each object must have: {"name": "camelCaseName", "type": "string|decimal|date|enum|boolean|integer", "description": "Brief description"}. Only suggest properties NOT already present.
- "suggestedRelationships": Array of 1-3 additional relationships this concept should have. Each object must have: {"type": "related|parent|child|depends_on", "targetId": "The EXACT concept name from the available concepts list", "label": "Human-readable relationship description"}. CRITICAL: The targetId MUST be the exact name of a concept that exists in the available concepts list. Do NOT invent or suggest concepts that are not in the list. If no suitable existing concept exists for a relationship, omit that relationship.
- "suggestedTags": Array of 3-5 additional classification tags for this concept. Only suggest tags NOT already present in the existing tags.
- "agentSkills": Array of 3-5 specific skills an AI agent would need to work with THIS concept (e.g., "Trade Lifecycle Tracking", "Counterparty Exposure Calculation"). Be concept-specific, not generic.
- "agentTypes": Array of 2-4 specific AI agent types that would directly operate on THIS concept (e.g., "Derivatives Pricing Agent", "Settlement Reconciliation Agent"). Be concept-specific, not generic.`,
        user: `Enrich the following ${ontologyName || "ontology"} concept for ${industry || "enterprise"} AI agent operations:

Concept: ${label}
Category: ${category}
Description: ${description}
Properties: ${JSON.stringify(properties || [])}
Relationships: ${JSON.stringify(relationships || [])}
Existing Tags: ${JSON.stringify(existingTags)}${conceptListStr}`,
        maxTokens: 3000,
        jsonMode: true,
      });

      const content = stripJsonFences(conceptRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      const enriched = JSON.parse(content);

      if (enriched.suggestedRelationships && Array.isArray(enriched.suggestedRelationships)) {
        const validated: any[] = [];
        const unmatched: any[] = [];
        for (const rel of enriched.suggestedRelationships) {
          const targetName = (rel.targetId || "").toLowerCase();
          const matchedId = conceptLabelMap.get(targetName);
          if (matchedId) {
            validated.push({ ...rel, resolvedTargetId: matchedId, exists: true });
          } else {
            const fuzzyMatch = availableConceptLabels.find(l =>
              l.toLowerCase().includes(targetName) || targetName.includes(l.toLowerCase())
            );
            if (fuzzyMatch) {
              validated.push({ ...rel, targetId: fuzzyMatch, resolvedTargetId: conceptLabelMap.get(fuzzyMatch.toLowerCase()), exists: true });
            } else {
              unmatched.push({ ...rel, exists: false });
            }
          }
        }
        enriched.suggestedRelationships = [...validated, ...unmatched];
      }

      res.json({ enriched });
    } catch (e: any) {
      console.error("AI enhance ontology concept error:", e);
      res.status(500).json({ error: e.message || "Failed to enhance concept" });
    }
  });

  router.post("/api/ai/generate-ontology", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const generateSchema = z.object({
        industryId: z.string().min(1),
        industryName: z.string().min(1),
        ontologyName: z.string().optional(),
      });
      const parseResult = generateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "industryId and industryName are required", details: parseResult.error.issues });
      }
      const { industryId, industryName, ontologyName } = parseResult.data;

      const existing = await storage.getOntologyConcepts(industryId);
      if (existing.length > 0) {
        return res.status(409).json({ error: "Ontology concepts already exist for this industry. Delete existing concepts before regenerating." });
      }

      const ontologyRaw = await callClaude({
        system: `You are a domain ontology expert specializing in ${ontologyName || industryName} knowledge models for enterprise AI agent lifecycle management.

Generate a ${industryName} ontology with 6 categories, each containing 3 concepts. Keep descriptions concise.

Return a JSON object with a "categories" array. Each category has:
- "name": Category name
- "concepts": Array of concept objects with:
  - "label": Concept name
  - "description": 1-2 sentence description
  - "properties": Array of 2 property objects with {"name": "camelCase", "type": "string|decimal|date|enum|boolean|integer", "description": "brief"}
  - "relationships": Array of 1 relationship object with {"type": "related|parent|child|depends_on", "targetLabel": "Another concept label from this ontology", "label": "Brief description"}
  - "tags": Array of 3 classification tags
  - "industryRelevance": One sentence

Use real ${industryName} terminology and standards (${ontologyName || "industry frameworks"}).`,
        user: `Generate a ${ontologyName || industryName} ontology for ${industryName}.`,
        maxTokens: 8000,
        jsonMode: true,
      });

      const content = stripJsonFences(ontologyRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        console.error("AI ontology JSON parse error, raw length:", content.length);
        return res.status(500).json({ error: "AI returned malformed response. Please try again." });
      }
      const categories = parsed.categories || [];

      const createdConcepts = [];
      const conceptLabelToId: Record<string, string> = {};

      for (const cat of categories) {
        for (const concept of cat.concepts || []) {
          const id = `${industryId}-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${concept.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          conceptLabelToId[concept.label] = id;
        }
      }

      for (const cat of categories) {
        for (const concept of cat.concepts || []) {
          const id = conceptLabelToId[concept.label];
          const relationships = (concept.relationships || []).map((r: any) => ({
            type: r.type,
            targetId: conceptLabelToId[r.targetLabel] || r.targetLabel,
            label: r.label,
          }));

          const created = await storage.createOntologyConcept({
            id,
            industryId,
            ontologyName: ontologyName || industryName,
            label: concept.label,
            category: cat.name,
            description: concept.description,
            properties: concept.properties || [],
            relationships,
            tags: concept.tags || [],
            industryRelevance: concept.industryRelevance || null,
          });
          createdConcepts.push(created);
        }
      }

      res.json({ concepts: createdConcepts, count: createdConcepts.length });
    } catch (e: any) {
      console.error("AI generate ontology error:", e);
      res.status(500).json({ error: e.message || "Failed to generate ontology" });
    }
  });

  router.post("/api/ai/generate-subdomain-ontology", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const generateSchema = z.object({
        industryId: z.string().min(1),
        industryName: z.string().min(1),
        ontologyName: z.string().optional(),
        subdomain: z.string().min(1),
        companyContext: z.string().optional(),
      });
      const parseResult = generateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "industryId, industryName, and subdomain are required", details: parseResult.error.issues });
      }
      const { industryId, industryName, ontologyName, subdomain, companyContext } = parseResult.data;

      const existing = await storage.getOntologyConcepts(industryId);
      const existingLabels = existing.map(c => c.label.toLowerCase());

      const companyHint = companyContext
        ? `\n\nThe user is building this for a company context like: ${companyContext}. Tailor concepts to this type of organization.`
        : "";

      const subdomainRaw = await callClaude({
        system: `You are a domain ontology expert specializing in ${subdomain} within ${industryName}. You are building a knowledge graph ontology for an AI agent lifecycle management platform.${companyHint}

Generate a comprehensive ${subdomain} ontology with 5-7 categories, each containing 3-5 concepts (20-30 total). These concepts should be specific to the ${subdomain} sub-domain, not general ${industryName} concepts.

The following concepts already exist in the ${industryName} ontology and MUST NOT be duplicated: ${existingLabels.slice(0, 50).join(", ")}

Return a JSON object with a "categories" array. Each category has:
- "name": Category name specific to ${subdomain}
- "concepts": Array of concept objects with:
  - "label": Concept name (specific ${subdomain} terminology)
  - "description": 2-3 sentence description explaining the concept in ${subdomain} context
  - "properties": Array of 2-3 property objects with {"name": "camelCase", "type": "string|decimal|date|enum|boolean|integer", "description": "brief"}
  - "relationships": Array of 1-2 relationship objects with {"type": "related|parent|child|depends_on", "targetLabel": "Another concept label from THIS ontology or existing ontology", "label": "Brief description of relationship"}
  - "tags": Array of 3-4 classification tags
  - "synonyms": Array of 1-3 alternative names or abbreviations
  - "industryRelevance": One sentence on why this matters for ${subdomain}

Use real ${subdomain} terminology, standards, and frameworks. For credit rating domains, include concepts like rating scales, methodologies, committees, rating actions, issuer types, credit events, etc.`,
        user: `Generate a comprehensive ${subdomain} knowledge graph ontology for ${industryName}.`,
        maxTokens: 12000,
        jsonMode: true,
      });

      const content = stripJsonFences(subdomainRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        console.error("AI subdomain ontology JSON parse error, raw length:", content.length);
        return res.status(500).json({ error: "AI returned malformed response. Please try again." });
      }

      const categories = parsed.categories || [];
      const previewConcepts: any[] = [];
      const conceptLabelToId: Record<string, string> = {};

      for (const cat of categories) {
        for (const concept of cat.concepts || []) {
          const slug = `${industryId}-${subdomain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${concept.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          conceptLabelToId[concept.label] = slug;
        }
      }

      for (const cat of categories) {
        for (const concept of cat.concepts || []) {
          const id = conceptLabelToId[concept.label];
          const relationships = (concept.relationships || []).map((r: any) => ({
            type: r.type,
            targetId: conceptLabelToId[r.targetLabel] || r.targetLabel,
            label: r.label,
          }));

          const isDuplicate = existingLabels.includes(concept.label.toLowerCase());

          previewConcepts.push({
            id,
            industryId,
            ontologyName: ontologyName || `${subdomain} Ontology`,
            label: concept.label,
            category: cat.name,
            description: concept.description,
            properties: concept.properties || [],
            relationships,
            tags: concept.tags || [],
            synonyms: concept.synonyms || [],
            industryRelevance: concept.industryRelevance || null,
            source: "ai-subdomain",
            isDuplicate,
          });
        }
      }

      res.json({
        subdomain,
        industryId,
        concepts: previewConcepts,
        count: previewConcepts.length,
        duplicates: previewConcepts.filter(c => c.isDuplicate).length,
      });
    } catch (e: any) {
      console.error("AI generate subdomain ontology error:", e);
      res.status(500).json({ error: e.message || "Failed to generate subdomain ontology" });
    }
  });

  router.post("/api/ai/enhance-regulation", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const { regulationName, industry, jurisdictions, requirements } = req.body;
      if (!regulationName || !industry) {
        return res.status(400).json({ error: "regulationName and industry are required" });
      }

      const regulationRaw = await callClaude({
        system: `You are a regulatory compliance expert specializing in ${industry} industry regulations. You help organizations understand and implement regulatory requirements for AI agent operations.

When given a regulation, produce a comprehensive JSON enrichment with these fields:
- "overview": A detailed 3-5 sentence overview of the regulation and its purpose
- "keyRequirements": Array of objects with { "id", "title", "description", "severity": "critical"|"high"|"medium"|"low", "implementationSteps": string[] }
- "aiAgentImplications": Array of specific implications for AI agent deployment and operations
- "complianceChecklist": Array of { "item", "category", "priority": "must"|"should"|"may" }
- "penaltiesAndRisks": Brief description of non-compliance risks
- "relatedRegulations": Array of related regulatory frameworks
- "automationOpportunities": Array of compliance tasks that can be automated by AI agents`,
        user: `Provide detailed regulatory enrichment for:

Regulation: ${regulationName}
Industry: ${industry}
Jurisdictions: ${JSON.stringify(jurisdictions || [])}
Known Requirements: ${JSON.stringify(requirements || [])}`,
        maxTokens: 3000,
        jsonMode: true,
      });

      const content = stripJsonFences(regulationRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      const enriched = JSON.parse(content);
      res.json({ enriched });
    } catch (e: any) {
      console.error("AI enhance regulation error:", e);
      res.status(500).json({ error: e.message || "Failed to enhance regulation" });
    }
  });

  router.post("/api/ai/enhance-policy-pack", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const { packName, framework, description, industry, riskLevel, existingPolicies } = req.body;
      if (!packName || !framework) {
        return res.status(400).json({ error: "packName and framework are required" });
      }

      const policyPackRaw = await callClaude({
        system: `You are a regulatory compliance expert specializing in AI agent governance. Given a policy pack definition, generate enhanced policy suggestions.

Return a JSON object with:
- "enhancedDescription": An improved 2-4 sentence description of the policy pack
- "suggestedPolicies": Array of 3-5 policy objects, each with:
  - "name": Policy name (concise, actionable)
  - "domain": One of "data_handling", "tool_permissions", "allowed_actions", "content_boundaries", "logging"
  - "description": Detailed description of what the policy enforces
- "complianceNotes": Brief text about regulatory alignment
- "riskConsiderations": Brief text about risk factors to consider`,
        user: `Enhance this policy pack:

Pack Name: ${packName}
Framework: ${framework}
Industry: ${industry || "cross_industry"}
Risk Level: ${riskLevel || "high"}
Description: ${description || "No description provided"}
Existing Policies: ${JSON.stringify(existingPolicies || [])}`,
        maxTokens: 3000,
        jsonMode: true,
      });

      const content = stripJsonFences(policyPackRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      const enhanced = JSON.parse(content);
      res.json(enhanced);
    } catch (e: any) {
      console.error("AI enhance policy pack error:", e);
      res.status(500).json({ error: e.message || "Failed to enhance policy pack" });
    }
  });

  router.post("/api/ai/generate-regulation-policies", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const { regulationName, industry, requirements, jurisdictions } = req.body;
      if (!regulationName || !industry) {
        return res.status(400).json({ error: "regulationName and industry are required" });
      }

      const regPoliciesRaw = await callClaude({
        system: `You are an expert in AI governance policy design for ${industry} organizations. You create production-grade policy configurations that implement regulatory requirements.

When given a regulation, generate a JSON object with a "policies" array. Each policy should have:
- "name": descriptive policy name
- "domain": one of "data_handling", "tool_access", "audit_compliance", "model_governance", "deployment_safety", "access_control"
- "description": what this policy enforces
- "policyJson": a detailed rules object with a "rules" array, each rule having:
  - "type": rule type identifier
  - "description": what this rule enforces
  - "severity": "critical"|"high"|"medium"|"low"
  - "enforcement": "block"|"warn"|"audit"|"require_approval"
  - Relevant configuration fields (thresholds, lists, conditions)

Generate 3-5 comprehensive policies per regulation. Use realistic regulatory identifiers and terminology.`,
        user: `Generate compliance policies for:

Regulation: ${regulationName}
Industry: ${industry}
Jurisdictions: ${JSON.stringify(jurisdictions || [])}
Key Requirements: ${JSON.stringify(requirements || [])}`,
        maxTokens: 4000,
        jsonMode: true,
      });

      const content = stripJsonFences(regPoliciesRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      const result = JSON.parse(content);
      res.json(result);
    } catch (e: any) {
      console.error("AI generate regulation policies error:", e);
      res.status(500).json({ error: e.message || "Failed to generate policies" });
    }
  });

  router.post("/api/ai/suggest-ontology-tags", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      const { agentName, agentDescription, agentSkills, industry, ontologyName } = req.body;
      if (!agentName || !agentDescription || !industry) {
        return res.status(400).json({ error: "agentName, agentDescription, and industry are required" });
      }

      const tagsRaw = await callClaude({
        system: `You are a domain expert in ${ontologyName || "industry"} ontology for ${industry} operations. Given an AI agent's description and skills, suggest relevant ontology concepts to tag it with.

Return a JSON object with:
- "suggestedTags": Array of objects with { "conceptId": string, "conceptLabel": string, "relevanceScore": number (0-1), "reasoning": string }
- "enrichedSkills": Array of objects with { "originalSkill": string, "enrichedDescription": string, "ontologyConcepts": string[] }

Suggest 5-8 relevant ontology tags and enrich 3-5 skills with domain terminology.`,
        user: `Suggest ontology tags for this AI agent:

Agent Name: ${agentName}
Description: ${agentDescription}
Skills: ${JSON.stringify(agentSkills || [])}
Industry: ${industry}
Ontology: ${ontologyName || "industry standard"}`,
        maxTokens: 1500,
        jsonMode: true,
      });

      const content = stripJsonFences(tagsRaw);
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      const result = JSON.parse(content);
      res.json(result);
    } catch (e: any) {
      console.error("AI suggest ontology tags error:", e);
      res.status(500).json({ error: e.message || "Failed to suggest ontology tags" });
    }
  });

  router.post("/api/policies/validate-skill", checkPermission("view_agents"), async (req, res) => {
    try {
      const { name, description, allowedTools, requiredMcpServers, requiredDataClassifications, markdownBody, industry, domain } = req.body;
      if (!name) return res.status(400).json({ error: "Skill name is required" });

      const allPolicies = await storage.getPolicies(getOrgId(req));
      const activePolicies = allPolicies.filter(p => p.status === "active");

      const toolsList: string[] = Array.isArray(allowedTools) ? allowedTools : [];
      const mcpServers: string[] = Array.isArray(requiredMcpServers) ? requiredMcpServers : [];
      const dataClassifications: string[] = Array.isArray(requiredDataClassifications) ? requiredDataClassifications : [];
      const bodyText = (markdownBody || "").toLowerCase();
      const descText = (description || "").toLowerCase();
      const allToolsLower = toolsList.map(t => t.toLowerCase());

      interface Violation {
        policyId: string;
        policyName: string;
        ruleName: string;
        severity: "critical" | "warning" | "info";
        message: string;
        suggestion: string;
      }
      const violations: Violation[] = [];

      for (const policy of activePolicies) {
        const pj = policy.policyJson as any;
        if (!pj) continue;
        const rules = Array.isArray(pj.rules) ? pj.rules : [];

        for (const rule of rules) {
          const ruleType = rule.type || "";
          const ruleField = (rule.field || "").toLowerCase();
          const ruleValue = String(rule.value || "").toLowerCase();
          const ruleName = rule.name || rule.description || ruleType || "Unnamed rule";
          const ruleAction = (rule.action || "warn").toLowerCase();
          const severity: "critical" | "warning" = ruleAction === "block" || ruleAction === "hard_block" ? "critical" : "warning";

          if (ruleType === "tool_scope" || ruleField.includes("tool") || ruleField.includes("allowed_tools")) {
            const blockedTools = rule.blocked_tools || rule.blocklist || [];
            if (Array.isArray(blockedTools)) {
              for (const blocked of blockedTools) {
                const blockedLower = String(blocked).toLowerCase();
                if (allToolsLower.some(t => t.includes(blockedLower))) {
                  violations.push({
                    policyId: policy.id,
                    policyName: policy.name,
                    ruleName,
                    severity,
                    message: `Skill uses blocked tool "${blocked}"`,
                    suggestion: `Remove "${blocked}" from allowed tools or request a policy exception`,
                  });
                }
              }
            }
            const requiredTools = rule.required_tools || rule.requires || [];
            if (Array.isArray(requiredTools)) {
              for (const required of requiredTools) {
                const reqLower = String(required).toLowerCase();
                if (!allToolsLower.some(t => t.includes(reqLower)) && !bodyText.includes(reqLower)) {
                  violations.push({
                    policyId: policy.id,
                    policyName: policy.name,
                    ruleName,
                    severity,
                    message: `Policy requires tool "${required}" but skill does not include it`,
                    suggestion: `Add "${required}" to allowed tools or include it in skill instructions`,
                  });
                }
              }
            }
          }

          if (ruleType === "pre_action_check" || ruleField.includes("pre_action") || ruleField.includes("prerequisite")) {
            const trigger = (rule.trigger || rule.when || "").toLowerCase();
            const requiredCheck = (rule.required_check || rule.check || rule.requires || "").toLowerCase();
            if (trigger && requiredCheck) {
              const triggerMatch = allToolsLower.some(t => t.includes(trigger)) || bodyText.includes(trigger);
              const checkPresent = allToolsLower.some(t => t.includes(requiredCheck)) || bodyText.includes(requiredCheck) || descText.includes(requiredCheck);
              if (triggerMatch && !checkPresent) {
                violations.push({
                  policyId: policy.id,
                  policyName: policy.name,
                  ruleName,
                  severity,
                  message: `Skill uses "${trigger}" which requires "${requiredCheck}" check first`,
                  suggestion: `Add "${requiredCheck}" to skill tools or instructions before using "${trigger}"`,
                });
              }
            }
          }

          if (ruleType === "data_class_restriction" || ruleField.includes("data_class") || ruleField.includes("classification")) {
            const restrictedClasses = rule.restricted_classes || rule.classifications || [];
            if (Array.isArray(restrictedClasses)) {
              for (const restricted of restrictedClasses) {
                const restrictedLower = String(restricted).toLowerCase();
                if (dataClassifications.some(dc => dc.toLowerCase().includes(restrictedLower))) {
                  const hasHandling = bodyText.includes("redact") || bodyText.includes("mask") || bodyText.includes("encrypt") || allToolsLower.some(t => t.includes("redact") || t.includes("mask"));
                  if (!hasHandling) {
                    violations.push({
                      policyId: policy.id,
                      policyName: policy.name,
                      ruleName,
                      severity,
                      message: `Skill accesses "${restricted}" data without proper handling`,
                      suggestion: `Add data redaction/masking in skill instructions or tools for "${restricted}" data`,
                    });
                  }
                }
              }
            }
          }

          if (ruleType === "audit_requirement" || ruleField.includes("audit") || ruleField.includes("logging")) {
            const auditRequired = rule.required !== false;
            if (auditRequired) {
              const hasAudit = allToolsLower.some(t => t.includes("audit") || t.includes("log") || t.includes("compliance_audit")) || bodyText.includes("audit") || bodyText.includes("compliance log");
              if (!hasAudit) {
                violations.push({
                  policyId: policy.id,
                  policyName: policy.name,
                  ruleName,
                  severity: "warning",
                  message: `Policy requires audit logging but skill does not include audit calls`,
                  suggestion: `Add compliance audit tool call or audit logging step in skill instructions`,
                });
              }
            }
          }

          if (ruleType === "human_in_loop" || ruleField.includes("human") || ruleField.includes("approval")) {
            const threshold = rule.threshold || rule.risk_threshold;
            if (threshold) {
              const hasHumanCheck = bodyText.includes("human") || bodyText.includes("approval") || bodyText.includes("escalat") || bodyText.includes("review");
              if (!hasHumanCheck) {
                violations.push({
                  policyId: policy.id,
                  policyName: policy.name,
                  ruleName,
                  severity: "warning",
                  message: `Policy requires human-in-the-loop for high-risk operations but skill lacks escalation path`,
                  suggestion: `Add human approval or escalation step in skill instructions`,
                });
              }
            }
          }

          if (ruleField && ruleValue && !ruleType) {
            if (ruleField === "name" || ruleField === "value") continue;
            const ruleOp = (rule.operator || "contains").toLowerCase();
            const skillFieldValue = (() => {
              if (ruleField.includes("tool")) return allToolsLower.join(" ");
              if (ruleField.includes("data")) return dataClassifications.join(" ").toLowerCase();
              if (ruleField.includes("mcp") || ruleField.includes("server")) return mcpServers.join(" ").toLowerCase();
              return bodyText + " " + descText;
            })();

            let violated = false;
            if (ruleOp === "contains" && !skillFieldValue.includes(ruleValue)) violated = true;
            if (ruleOp === "not_contains" && skillFieldValue.includes(ruleValue)) violated = true;
            if (ruleOp === "equals" && skillFieldValue !== ruleValue) violated = true;

            if (violated) {
              violations.push({
                policyId: policy.id,
                policyName: policy.name,
                ruleName,
                severity,
                message: `Rule "${ruleName}": field "${ruleField}" ${ruleOp} "${ruleValue}" — not satisfied`,
                suggestion: `Review skill definition to satisfy policy requirement`,
              });
            }
          }
        }

        const ontologyRefs = Array.isArray((policy as any).ontologyRefs) ? (policy as any).ontologyRefs : [];
        if (ontologyRefs.length > 0 && policy.domain === "tool_permissions") {
          const allConcepts = await storage.getAllOntologyConcepts();
          const referencedConcepts = allConcepts.filter(c => ontologyRefs.includes(c.id));
          for (const concept of referencedConcepts) {
            const conceptLabel = concept.label.toLowerCase().replace(/\s+/g, "_");
            const mentionedInSkill = bodyText.includes(conceptLabel) || descText.includes(conceptLabel) || allToolsLower.some(t => t.includes(conceptLabel));
            if (!mentionedInSkill && concept.category?.toLowerCase().includes("compliance")) {
              violations.push({
                policyId: policy.id,
                policyName: policy.name,
                ruleName: `Ontology compliance: ${concept.label}`,
                severity: "warning",
                message: `Policy references compliance concept "${concept.label}" but skill does not address it`,
                suggestion: `Consider adding "${concept.label}" handling in skill instructions or tools`,
              });
            }
          }
        }
      }

      const critical = violations.filter(v => v.severity === "critical");
      const warnings = violations.filter(v => v.severity === "warning");
      const infos = violations.filter(v => v.severity === "info");

      res.json({
        valid: critical.length === 0,
        canSave: critical.length === 0,
        violations,
        summary: {
          total: violations.length,
          critical: critical.length,
          warnings: warnings.length,
          info: infos.length,
          policiesChecked: activePolicies.length,
        },
      });
    } catch (e: any) {
      console.error("Policy validate-skill error:", e);
      res.status(500).json({ error: e.message || "Failed to validate skill against policies" });
    }
  });

  router.post("/api/policies", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      const data = insertPolicySchema.omit({ organizationId: true }).parse(req.body);
      const policy = await storage.createPolicy({ ...data, organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined });
      res.status(201).json(policy);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/policies/:id", async (req, res) => {
    const policy = await storage.getPolicy(req.params.id as string, getOrgId(req));
    if (!policy) return res.status(404).json({ error: "Policy not found" });
    res.json(policy);
  });

  router.patch("/api/policies/:id", checkPermission("create_modify_policies"), async (req, res) => {
    const policy = await storage.getPolicy(req.params.id as string, getOrgId(req));
    if (!policy) return res.status(404).json({ error: "Policy not found" });

    const { policyJson, description, name, status, scopeId, scopeType } = req.body;
    const updateData: Record<string, any> = {};
    if (policyJson !== undefined) updateData.policyJson = policyJson;
    if (description !== undefined) updateData.description = description;
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (scopeId !== undefined) updateData.scopeId = scopeId;
    if (scopeType !== undefined) updateData.scopeType = scopeType;

    if (policyJson !== undefined) {
      const newVersion = (policy.version || 1) + 1;
      updateData.version = newVersion;
      const historyEntry = {
        version: policy.version || 1,
        changedBy: req.body.changedBy || "system",
        changedAt: new Date().toISOString(),
        summary: req.body.changeSummary || "Rules updated",
        previousRules: policy.policyJson,
      };
      const existingHistory = Array.isArray(policy.versionHistory) ? policy.versionHistory : [];
      updateData.versionHistory = [...(existingHistory as any[]), historyEntry];
    }

    const updated = await storage.updatePolicy(req.params.id as string, updateData, getOrgId(req));
    if (!updated) return res.status(500).json({ error: "Failed to update policy" });

    await storage.createAuditEvent({
      actorType: "user",
      actorId: req.body.changedBy || "system",
      action: "policy_updated",
      objectType: "policy",
      objectId: policy.id,
      details: `Policy "${policy.name}" updated${policyJson !== undefined ? " (rules changed, v" + updateData.version + ")" : ""}`,
    });

    res.json(updated);
  });

  // Additive outcome binding: associates a policy with an outcome without destructively re-scoping it.
  // If the policy is already outcome-scoped → update the scopeId in-place.
  // If the policy is scoped to any other scope type (e.g. "org", "agent") → clone it with outcome
  // scope so the original binding is preserved (no implicit unbind of the source scope).
  router.post("/api/policies/:id/bind-outcome", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      const policy = await storage.getPolicy(req.params.id as string, getOrgId(req));
      if (!policy) return res.status(404).json({ error: "Policy not found" });
      const { outcomeId } = req.body as { outcomeId?: string };
      if (!outcomeId) return res.status(400).json({ error: "outcomeId is required" });

      if (policy.scopeType === "outcome") {
        // Same scope type — safe to update scopeId in-place
        const updated = await storage.updatePolicy(policy.id, { scopeId: outcomeId }, getOrgId(req));
        await storage.createAuditEvent({
          actorType: "user", actorId: "system", action: "policy_bound",
          objectType: "policy", objectId: policy.id,
          details: `Policy "${policy.name}" re-bound to outcome ${outcomeId}`,
        });
        return res.json(updated);
      }

      // Policy is scoped elsewhere — clone with outcome scope to preserve original binding
      const cloneData: any = {
        name: `${policy.name} (Outcome: ${outcomeId})`,
        description: policy.description,
        domain: policy.domain,
        status: policy.status,
        policyJson: policy.policyJson,
        scopeType: "outcome",
        scopeId: outcomeId,
        organizationId: policy.organizationId,
        version: 1,
      };
      const clone = await storage.createPolicy(cloneData);
      await storage.createAuditEvent({
        actorType: "user", actorId: "system", action: "policy_bound",
        objectType: "policy", objectId: clone.id,
        details: `Policy "${policy.name}" cloned to outcome ${outcomeId} (original scope "${policy.scopeType}:${policy.scopeId}" preserved)`,
      });
      return res.status(201).json(clone);
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Failed to bind policy" });
    }
  });

  router.delete("/api/policies/:id", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      const policy = await storage.getPolicy(req.params.id as string, getOrgId(req));
      if (!policy) return res.status(404).json({ error: "Policy not found" });
      const deleted = await storage.deletePolicy(req.params.id as string, getOrgId(req));
      if (!deleted) return res.status(500).json({ error: "Failed to delete policy" });
      await storage.createAuditEvent({
        action: "policy_deleted",
        actorId: "system",
        objectType: "policy",
        objectId: policy.id,
        details: `Policy "${policy.name}" deleted`,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/policies/:id/test-cases", async (req, res) => {
    const testCases = await storage.getPolicyTestCases(req.params.id);
    res.json(testCases);
  });

  router.post("/api/policies/:id/test-cases", async (req, res) => {
    const testCase = await storage.createPolicyTestCase({
      ...req.body,
      policyId: req.params.id,
    });
    res.json(testCase);
  });

  router.post("/api/policies/:id/test-cases/:testId/run", async (req, res) => {
    const testCases = await storage.getPolicyTestCases(req.params.id);
    const testCase = testCases.find(tc => tc.id === req.params.testId);
    if (!testCase) return res.status(404).json({ error: "Test case not found" });

    const policy = await storage.getPolicy(req.params.id, getOrgId(req));
    if (!policy) return res.status(404).json({ error: "Policy not found" });

    const rules = (policy.policyJson as any)?.rules || [];
    const scenario = testCase.inputScenario as any;
    let wouldBlock = false;
    const ruleResults: any[] = [];

    for (const rule of rules) {
      const field = rule.field || rule.check;
      const op = rule.operator || rule.op || "equals";
      const threshold = rule.value ?? rule.threshold;
      const scenarioValue = scenario?.[field];

      let triggered = false;
      if (scenarioValue !== undefined && threshold !== undefined) {
        if (op === "greater_than" || op === "gt") triggered = Number(scenarioValue) > Number(threshold);
        else if (op === "less_than" || op === "lt") triggered = Number(scenarioValue) < Number(threshold);
        else if (op === "equals" || op === "eq") triggered = String(scenarioValue) === String(threshold);
        else if (op === "contains") triggered = String(scenarioValue).includes(String(threshold));
        else if (op === "not_contains") triggered = !String(scenarioValue).includes(String(threshold));
      }

      ruleResults.push({
        rule: rule.name || field || "unnamed",
        field,
        operator: op,
        threshold,
        scenarioValue,
        triggered,
      });

      if (triggered && (rule.action === "block" || rule.action === "hard_block")) {
        wouldBlock = true;
      }
    }

    const passed = testCase.expectedOutcome === "block" ? wouldBlock : !wouldBlock;
    const status = passed ? "passed" : "failed";

    res.json({
      testCaseId: testCase.id,
      status,
      wouldBlock,
      expectedOutcome: testCase.expectedOutcome,
      ruleResults,
      runAt: new Date().toISOString(),
    });
  });

  router.post("/api/policies/:id/simulate-traces", async (req, res) => {
    const policy = await storage.getPolicy(req.params.id, getOrgId(req));
    if (!policy) return res.status(404).json({ error: "Policy not found" });

    const { traceIds, agentId, limit: traceLimit } = req.body;
    let traces = await storage.getTraces(getOrgId(req));

    if (traceIds && Array.isArray(traceIds) && traceIds.length > 0) {
      traces = traces.filter(t => traceIds.includes(t.id));
    } else if (agentId) {
      traces = traces.filter(t => t.agentId === agentId);
    }

    const maxTraces = traceLimit || 100;
    traces = traces.slice(0, maxTraces);

    const rules = (policy.policyJson as any)?.rules || [];
    const results: any[] = [];
    let blockedCount = 0;

    for (const trace of traces) {
      const traceData: Record<string, any> = {
        latencyMs: trace.latencyMs,
        status: trace.status,
        costUsd: trace.costUsd,
        ...(typeof (trace as any).metadata === "object" && (trace as any).metadata !== null ? (trace as any).metadata : {}),
      };

      let wouldBlock = false;
      const triggeredRules: string[] = [];

      for (const rule of rules) {
        const field = rule.field || rule.check;
        const op = rule.operator || rule.op || "equals";
        const threshold = rule.value ?? rule.threshold;
        const val = traceData[field];

        let triggered = false;
        if (val !== undefined && threshold !== undefined) {
          if (op === "greater_than" || op === "gt") triggered = Number(val) > Number(threshold);
          else if (op === "less_than" || op === "lt") triggered = Number(val) < Number(threshold);
          else if (op === "equals" || op === "eq") triggered = String(val) === String(threshold);
          else if (op === "contains") triggered = String(val).includes(String(threshold));
        }

        if (triggered) {
          triggeredRules.push(rule.name || field || "unnamed");
          if (rule.action === "block" || rule.action === "hard_block") wouldBlock = true;
        }
      }

      if (wouldBlock) blockedCount++;
      results.push({
        traceId: trace.id,
        agentId: trace.agentId,
        status: trace.status,
        wouldBlock,
        triggeredRules,
        latencyMs: trace.latencyMs,
        costUsd: trace.costUsd,
      });
    }

    res.json({
      policyId: policy.id,
      policyName: policy.name,
      totalTraces: traces.length,
      blockedCount,
      passCount: traces.length - blockedCount,
      blockRate: traces.length > 0 ? ((blockedCount / traces.length) * 100).toFixed(1) : "0",
      results,
    });
  });

  router.get("/api/approvals", async (req, res) => {
    const approvals = await storage.getApprovals(getOrgId(req));
    const statusFilter = req.query.status as string | undefined;
    if (statusFilter) {
      return res.json(approvals.filter((a: any) => a.status === statusFilter));
    }
    res.json(approvals);
  });

  router.get("/api/approvals/:id", async (req, res) => {
    const approval = await storage.getApproval(req.params.id as string, getOrgId(req));
    if (!approval) return res.status(404).json({ message: "Approval not found" });

    const orgId = getOrgId(req);
    const agents = await storage.getAgents(orgId);
    const outcomes = await storage.getOutcomes(orgId);
    const evalSuites = await storage.getEvalSuites();
    const policies = await storage.getPolicies(orgId);
    const auditEvents = await storage.getAuditEvents(orgId);

    const agent = approval.agentId ? agents.find(a => a.id === approval.agentId) : agents.find(a => a.id === approval.objectId);
    const outcome = approval.outcomeId ? outcomes.find(o => o.id === approval.outcomeId) : null;
    const agentSuites = agent ? evalSuites.filter(s => s.agentId === agent.id) : [];
    const relatedAudit = auditEvents.filter(e => e.objectId === approval.id || e.objectId === approval.objectId).slice(0, 20);
    const effectivePolicies = policies.filter(p => {
      if (!agent) return false;
      const scope = (p as any).scope;
      return scope === "global" || scope === agent.riskTier?.toLowerCase();
    });

    res.json({
      ...approval,
      agent,
      outcome,
      evalSuites: agentSuites,
      effectivePolicies: effectivePolicies,
      auditTrail: relatedAudit,
    });
  });

  router.post("/api/approvals", async (req, res) => {
    try {
      const data = insertApprovalSchema.omit({ organizationId: true }).parse(req.body);
      const approval = await storage.createApproval({ ...data, organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined });
      res.status(201).json(approval);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/approvals/:id", checkPermission("approve_changes"), async (req, res) => {
    const approval = await storage.getApproval(req.params.id as string, getOrgId(req));
    if (!approval) return res.status(404).json({ message: "Approval not found" });

    const { status, decidedBy, constraintsJson, followUpTask } = req.body;
    const updateData: any = { decidedAt: new Date() };
    if (status) updateData.status = status;
    if (decidedBy) updateData.decidedBy = decidedBy;
    if (constraintsJson) updateData.constraintsJson = constraintsJson;

    if (status === "rejected" && followUpTask) {
      const followUp = await storage.createApproval({
        type: "follow_up_task",
        objectType: approval.objectType,
        objectId: approval.objectId,
        objectName: `Follow-up: ${approval.objectName || approval.type}`,
        status: "pending",
        requestedBy: decidedBy || "Expert Validator",
        description: followUpTask.description || `Follow-up from rejected ${approval.type}`,
        riskScore: approval.riskScore,
        agentId: approval.agentId,
        outcomeId: approval.outcomeId,
        environment: approval.environment,
        evidenceJson: { parentApprovalId: approval.id, reason: followUpTask.reason },
      });
      updateData.followUpTaskId = followUp.id;
    }

    const updated = await storage.updateApproval(req.params.id as string, updateData, getOrgId(req));

    await storage.createAuditEvent({
      organizationId: getOrgId(req) ?? undefined,
      actorType: "expert_validator",
      actorId: decidedBy || "system",
      action: `approval_${status || "updated"}`,
      objectType: "approval",
      objectId: approval.id,
      details: `Approval "${approval.objectName || approval.type}" ${status || "updated"} by ${decidedBy || "system"}${constraintsJson ? " with constraints" : ""}`,
    });

    if (status === "approved" && approval.objectType === "patch" && approval.objectId) {
      const allPatches = await storage.getPatches();
      const patch = allPatches.find(p => p.id === approval.objectId);
      if (patch && (patch.status === "pending_approval" || patch.status === "proposed")) {
        await storage.updatePatch(patch.id, { status: "approved" });

        const rolloutPlan = patch.rolloutPlan as any;
        const strategy = rolloutPlan?.strategy || "canary";
        const startPercent = rolloutPlan?.startPercent || 10;
        const stepPercent = rolloutPlan?.stepPercent || 10;
        const maxErrorRate = rolloutPlan?.maxErrorRate || 5;
        const successThreshold = rolloutPlan?.successThreshold || 95;

        const deployment = await storage.createDeployment({
          agentId: patch.agentId,
          agentName: (await storage.getAgent(patch.agentId, getOrgId(req)))?.name || "agent",
          environment: "pilot",
          version: `patch-${patch.id.slice(0, 8)}`,
          status: "pending",
          rolloutStrategy: strategy,
          shadowEnabled: strategy === "shadow",
          patchId: patch.id,
          incidentId: patch.incidentId || undefined,
          canaryConfig: {
            startPercent,
            stepPercent,
            maxErrorRate,
            successThreshold,
          },
          rollbackConfig: {
            errorRateThreshold: maxErrorRate * 2,
            autoRollback: true,
          },
          autopromoteConfig: {
            enabled: true,
            stepPercent,
            rollbackOnFailure: true,
          },
        });

        if (patch.incidentId) {
          await storage.updateIncident(patch.incidentId, {
            deploymentId: deployment.id,
            status: "deploying",
          }, getOrgId(req));
        }

        const depStrategy = deployment.rolloutStrategy || "canary";
        const depUpdate: Record<string, unknown> = {
          approvedBy: decidedBy || "Expert Validator",
        };

        if (depStrategy === "shadow") {
          depUpdate.shadowEnabled = true;
          depUpdate.status = "shadow";
        } else if (depStrategy === "canary") {
          depUpdate.canaryPercent = startPercent;
          depUpdate.status = "canary";
          depUpdate.deployedAt = new Date();
        } else {
          depUpdate.canaryPercent = 100;
          depUpdate.status = "active";
          depUpdate.deployedAt = new Date();
          depUpdate.completedAt = new Date();
        }

        if (constraintsJson) {
          try {
            const constraints = typeof constraintsJson === "string" ? JSON.parse(constraintsJson) : constraintsJson;
            if (constraints.maxCanaryPercent) {
              depUpdate.canaryPercent = Math.min(depUpdate.canaryPercent as number || 10, constraints.maxCanaryPercent);
            }
            if (constraints.shadowOnly) {
              depUpdate.shadowEnabled = true;
              depUpdate.status = "shadow";
              depUpdate.canaryPercent = 0;
            }
          } catch {}
        }

        await storage.updateDeployment(deployment.id, depUpdate, getOrgId(req));

        await storage.createAuditEvent({
          actorType: "system",
          actorId: "self_healing_service",
          action: "patch_deployment_created",
          objectType: "deployment",
          objectId: deployment.id,
          details: `Patch ${patch.title} approved → deployment created (${depUpdate.status}, canary: ${depUpdate.canaryPercent || 0}%)${patch.incidentId ? ` for incident ${patch.incidentId}` : ""}`,
        });
      }
    }

    if (status === "approved" && approval.objectType === "deployment" && approval.objectId) {
      const deployment = await storage.getDeployment(approval.objectId, getOrgId(req));
      if (deployment && (deployment.status === "pending" || deployment.status === "awaiting_approval")) {
        const strategy = deployment.rolloutStrategy || "canary";
        const deployUpdate: Record<string, unknown> = {
          approvedBy: decidedBy || "Expert Validator",
        };

        if (strategy === "shadow" || deployment.shadowEnabled) {
          deployUpdate.shadowEnabled = true;
          deployUpdate.status = "shadow";
        } else if (strategy === "canary") {
          const startPercent = (deployment.canaryConfig as any)?.startPercent || 10;
          deployUpdate.canaryPercent = startPercent;
          deployUpdate.status = "canary";
          deployUpdate.deployedAt = new Date();
        } else {
          deployUpdate.canaryPercent = 100;
          deployUpdate.status = "active";
          deployUpdate.deployedAt = new Date();
          deployUpdate.completedAt = new Date();
        }

        if (constraintsJson) {
          try {
            const constraints = typeof constraintsJson === "string" ? JSON.parse(constraintsJson) : constraintsJson;
            if (constraints.maxCanaryPercent) {
              deployUpdate.canaryPercent = Math.min(deployUpdate.canaryPercent as number || 10, constraints.maxCanaryPercent);
            }
            if (constraints.shadowOnly) {
              deployUpdate.shadowEnabled = true;
              deployUpdate.status = "shadow";
              deployUpdate.canaryPercent = 0;
            }
          } catch {
          }
        }

        await storage.updateDeployment(deployment.id, deployUpdate, getOrgId(req));

        await storage.createAuditEvent({
          actorType: "system",
          actorId: "release_service",
          action: "deployment_activated",
          objectType: "deployment",
          objectId: deployment.id,
          details: `Deployment ${deployment.agentName || "agent"} activated after approval. Status: ${deployUpdate.status}, canary: ${deployUpdate.canaryPercent || 0}%, shadow: ${deployUpdate.shadowEnabled || false}`,
        });
      }
    }

    res.json(updated);
  });

  router.get("/api/approvals/:id/requirements", async (req, res) => {
    const approval = await storage.getApproval(req.params.id as string);
    if (!approval) return res.status(404).json({ message: "Not found" });

    const requirements: Array<{ rule: string; met: boolean; detail: string }> = [];

    const riskScore = approval.riskScore || 0;
    if (riskScore > 7) {
      requirements.push({ rule: "High-risk outcome tier", met: false, detail: "Requires senior expert approval for risk score > 7" });
    }
    if (approval.toolPermissionClass === "CRITICAL" || approval.toolPermissionClass === "RESTRICTED") {
      requirements.push({ rule: "Restricted tool access", met: false, detail: `Tool permission class "${approval.toolPermissionClass}" requires security review` });
    }
    if (approval.environment === "production" || approval.environment === "pilot") {
      requirements.push({ rule: "Production/pilot environment", met: false, detail: `Changes to ${approval.environment} require additional validation` });
    }
    const highRiskChangeTypes = ["model_change", "tool_change", "policy_change"];
    if (approval.changeType && highRiskChangeTypes.includes(approval.changeType)) {
      requirements.push({ rule: "High-risk change type", met: false, detail: `${approval.changeType.replace(/_/g, " ")} changes require expert review` });
    }
    if (requirements.length === 0) {
      requirements.push({ rule: "Standard review", met: true, detail: "Standard approval process applies" });
    }

    res.json({ approvalId: approval.id, requirements });
  });

  router.get("/api/redaction-profiles", async (req, res) => {
    const role = getRequestRole(req);
    const level = getRedactionLevel(role);
    res.json({
      currentRole: role,
      redactionLevel: level,
      profiles: {
        R0: { label: "Full Access", description: "No redaction. All PII, PHI, PCI, financial data visible.", roles: ["admin", "compliance_security"] },
        R1: { label: "PII/PHI/PCI Redacted", description: "Identity fields and PII patterns redacted. Financial and operational data visible.", roles: ["agent_engineer", "ops_sre", "expert_validator"] },
        R2: { label: "Highly Redacted", description: "PII, financial data, and sensitive payloads all redacted.", roles: ["outcome_owner", "finance"] },
      },
    });
  });

  router.get("/api/audit-events", async (req, res) => {
    const role = getRequestRole(req);
    const level = getRedactionLevel(role);
    const events = await storage.getAuditEvents(getOrgId(req));

    const entityType = req.query.entity_type as string | undefined;
    const regulation = req.query.regulation as string | undefined;
    const system = req.query.system as string | undefined;
    const domain = req.query.domain as string | undefined;
    const actionCategory = req.query.action_category as string | undefined;

    let filtered = events;
    if (entityType || regulation || system || domain || actionCategory) {
      filtered = events.filter(e => {
        const tags = (e.ontologyTags || {}) as Record<string, string>;
        if (entityType && !(tags.entity_type || "").toLowerCase().includes(entityType.toLowerCase())) return false;
        if (regulation && (tags.regulation || "").toLowerCase() !== regulation.toLowerCase()) return false;
        if (system && (tags.system || "").toLowerCase() !== system.toLowerCase()) return false;
        if (domain && (tags.domain || "").toLowerCase() !== domain.toLowerCase()) return false;
        if (actionCategory && (tags.action_category || "").toLowerCase() !== actionCategory.toLowerCase()) return false;
        return true;
      });
    }

    res.json(filtered.map(e => redactPayload(e, level)));
  });

  // Verify hash chain integrity
  router.get("/api/audit-events/verify-chain", async (req, res) => {
    try {
      const crypto = await import("crypto");
      const events = await storage.getAuditEvents(getOrgId(req));
      const sorted = events
        .filter(e => e.sequenceNum !== null && e.sequenceNum !== undefined)
        .sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));

      if (sorted.length === 0) {
        return res.json({
          valid: true,
          totalEvents: events.length,
          chainedEvents: 0,
          unchainedEvents: events.length,
          message: "No chained events found yet",
        });
      }

      let valid = true;
      const breaks: Array<{ sequenceNum: number; eventId: string; reason: string }> = [];

      for (let i = 0; i < sorted.length; i++) {
        const event = sorted[i];
        const expectedPrevHash = i === 0 ? "GENESIS" : sorted[i - 1].eventHash;

        if (event.previousHash !== expectedPrevHash) {
          valid = false;
          breaks.push({
            sequenceNum: event.sequenceNum!,
            eventId: event.id,
            reason: `previousHash mismatch: expected "${expectedPrevHash?.slice(0, 16)}...", got "${event.previousHash?.slice(0, 16)}..."`,
          });
          continue;
        }

        const canonicalObj: Record<string, unknown> = {
          action: event.action,
          actorId: event.actorId,
          actorType: event.actorType,
          details: event.details,
          objectId: event.objectId,
          objectType: event.objectType,
          sequenceNum: event.sequenceNum,
        };
        const canonicalPayload = JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
        const computedHash = nodeCrypto.createHash("sha256")
          .update((event.previousHash || "GENESIS") + canonicalPayload)
          .digest("hex");

        if (computedHash !== event.eventHash) {
          valid = false;
          breaks.push({
            sequenceNum: event.sequenceNum!,
            eventId: event.id,
            reason: `eventHash mismatch: computed "${computedHash.slice(0, 16)}...", stored "${event.eventHash?.slice(0, 16)}..."`,
          });
        }

        // Gap/duplicate detection
        if (i > 0) {
          const prevSeq = sorted[i - 1].sequenceNum || 0;
          const curSeq = event.sequenceNum || 0;
          if (curSeq === prevSeq) {
            valid = false;
            breaks.push({
              sequenceNum: curSeq,
              eventId: event.id,
              reason: `Duplicate sequenceNum ${curSeq} detected`,
            });
          } else if (curSeq !== prevSeq + 1) {
            valid = false;
            breaks.push({
              sequenceNum: curSeq,
              eventId: event.id,
              reason: `Sequence gap: expected ${prevSeq + 1}, got ${curSeq}`,
            });
          }
        }
      }

      res.json({
        valid,
        totalEvents: events.length,
        chainedEvents: sorted.length,
        unchainedEvents: events.length - sorted.length,
        firstSequence: sorted[0]?.sequenceNum,
        lastSequence: sorted[sorted.length - 1]?.sequenceNum,
        breaks: breaks.length > 0 ? breaks : undefined,
        message: valid
          ? `Chain verified: ${sorted.length} events, sequence ${sorted[0]?.sequenceNum} to ${sorted[sorted.length - 1]?.sequenceNum}`
          : `Chain BROKEN: ${breaks.length} break(s) detected`,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Chain verification failed" });
    }
  });

  router.get("/api/audit-events/export-bundle", async (req, res) => {
    const { type, startDate, endDate, includeHashes, objectFilter, redaction } = req.query;
    const validTypes = ["all_events", "runs", "approvals", "policy_changes"];
    const exportType = validTypes.includes(type as string) ? (type as string) : "all_events";
    const orgId = getOrgId(req);
    let data: any[] = [];
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (exportType === "runs") {
      const allRuns = await storage.getTraces(orgId);
      data = allRuns.filter(r => {
        if (!r.startedAt) return false;
        const d = new Date(r.startedAt);
        return d >= start && d <= end;
      });
    } else if (exportType === "approvals") {
      const allApprovals = await storage.getApprovals(orgId);
      data = allApprovals.filter(a => {
        if (!a.createdAt) return false;
        const d = new Date(a.createdAt);
        return d >= start && d <= end;
      });
    } else if (exportType === "policy_changes") {
      const allEvents = await storage.getAuditEvents(orgId);
      data = allEvents.filter(e => {
        if (!e.createdAt) return false;
        const d = new Date(e.createdAt);
        const isPolicy = e.objectType === "policy" || e.action.includes("policy");
        return isPolicy && d >= start && d <= end;
      });
    } else {
      const allEvents = await storage.getAuditEvents(orgId);
      data = allEvents.filter(e => {
        if (!e.createdAt) return false;
        const d = new Date(e.createdAt);
        return d >= start && d <= end;
      });
    }

    if (objectFilter && objectFilter !== "all") {
      const objType = (objectFilter as string).toLowerCase();
      data = data.filter((item: any) => {
        const itemType = (item.objectType || "").toLowerCase();
        const itemAction = (item.action || "").toLowerCase();
        return itemType === objType || itemAction.includes(objType);
      });
    }

    const redactionProfile = (redaction as string) || "none";
    const applyRedaction = (record: any): any => {
      if (redactionProfile === "none") return record;
      const redacted = { ...record };
      if (redactionProfile === "pii" || redactionProfile === "full") {
        if (redacted.actorId) redacted.actorId = "[REDACTED]";
        if (redacted.requestedBy) redacted.requestedBy = "[REDACTED]";
        if (redacted.decidedBy) redacted.decidedBy = "[REDACTED]";
        if (redacted.approvedBy) redacted.approvedBy = "[REDACTED]";
        if (redacted.owner) redacted.owner = "[REDACTED]";
        if (redacted.details && typeof redacted.details === "string") {
          redacted.details = redacted.details.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]");
        }
      }
      if (redactionProfile === "financial" || redactionProfile === "full") {
        if (redacted.costUsd !== undefined) redacted.costUsd = "[REDACTED]";
        if (redacted.amount !== undefined) redacted.amount = "[REDACTED]";
        if (redacted.revenue !== undefined) redacted.revenue = "[REDACTED]";
        if (redacted.revenueExposure !== undefined) redacted.revenueExposure = "[REDACTED]";
      }
      if (redactionProfile === "full") {
        if (redacted.evidenceJson) redacted.evidenceJson = "[REDACTED]";
        if (redacted.constraintsJson) redacted.constraintsJson = "[REDACTED]";
      }
      return redacted;
    };

    const redactedData = data.map(applyRedaction);

    const csvHeaders = ["Date", "Action", "ActorType", "ActorID", "ObjectType", "ObjectID", "Details"];
    const csvRows = redactedData.map((r: any) => [
      r.createdAt || r.startedAt || "",
      r.action || r.status || "",
      r.actorType || "",
      r.actorId || "",
      r.objectType || "",
      r.objectId || r.id || "",
      ((r.details || "").toString()).replace(/"/g, '""'),
    ]);

    const bundle: any = {
      exportType,
      exportedAt: new Date().toISOString(),
      timeWindow: { start: start.toISOString(), end: end.toISOString() },
      objectFilter: objectFilter || "all",
      redactionProfile,
      totalRecords: redactedData.length,
      records: redactedData,
      csvHeaders,
      csvRows,
    };

    if (includeHashes === "true") {
      const allEvents = await storage.getAuditEvents(getOrgId(req));
      const lastEvent = allEvents[allEvents.length - 1];
      bundle.integrityInfo = {
        chainLength: allEvents.length,
        lastHash: lastEvent?.eventHash || null,
        lastSequence: lastEvent?.sequenceNum || 0,
        verified: true,
      };
    }

    res.json(bundle);
  });

  router.get("/api/audit-events/verify-integrity", async (_req, res) => {
    const startedAt = Date.now();
    const result = await storage.verifyAuditChainIntegrity();
    const durationMs = Date.now() - startedAt;
    let persistenceWarning: string | undefined;
    try {
      await storage.persistAuditChainCheckResult(result, durationMs, "manual");
    } catch (err: any) {
      persistenceWarning = `Health check result could not be persisted: ${err.message}`;
      console.error("[verify-integrity] Failed to persist health check or incident:", err.message);
    }
    res.json({ ...result, ...(persistenceWarning ? { persistenceWarning } : {}) });
  });

  router.get("/api/audit-chain/health", async (_req, res) => {
    try {
      const history = await storage.getAuditChainHealthChecks(20);
      const latest = history[0] ?? null;
      res.json({ latest, history });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/policy-exceptions", async (_req, res) => {
    const exceptions = await storage.getPolicyExceptions();
    res.json(exceptions);
  });

  router.get("/api/policy-exceptions/agent/:agentId", async (req, res) => {
    const exceptions = await storage.getPolicyExceptionsByAgent(req.params.agentId);
    res.json(exceptions);
  });

  router.post("/api/policy-exceptions", async (req, res) => {
    try {
      const data = insertPolicyExceptionSchema.parse(req.body);
      const exception = await storage.createPolicyException(data);
      res.status(201).json(exception);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/policy-exceptions/:id", async (req, res) => {
    const updated = await storage.updatePolicyException(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  router.get("/api/compliance-reports", async (_req, res) => {
    const reports = await storage.getComplianceReports();
    res.json(reports);
  });

  router.post("/api/compliance-reports", async (req, res) => {
    try {
      const data = insertComplianceReportSchema.parse(req.body);
      const report = await storage.createComplianceReport(data);
      res.status(201).json(report);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/invoices", async (req, res) => {
    const invoices = await storage.getInvoices(getOrgId(req));
    res.json(invoices);
  });

  router.post("/api/invoices", checkPermission("billing_invoices"), async (req, res) => {
    try {
      const { organizationId: _orgIdFromBody, ...invoiceBody } = req.body;
      const data = insertInvoiceSchema.parse(invoiceBody);
      const invoice = await storage.createInvoice({ ...data, organizationId: getOrgId(req) ?? undefined });

      const flywheelSyncResults: any[] = [];
      if (invoice.outcomeId) {
        const outcomeIds = [invoice.outcomeId];
        for (const oid of outcomeIds) {
          try {
            const outcome = await storage.getOutcome(oid, getOrgId(req));
            if (!outcome) continue;

            const allEvents = await storage.getOutcomeEventsByOutcome(oid, getOrgId(req));
            const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const recentEvents = allEvents.filter(e => e.createdAt && new Date(e.createdAt) >= cutoffDate);

            const rejectedEvents = recentEvents.filter(e => !e.billable && e.excludeReason);
            const acceptedEvents = recentEvents
              .filter(e => e.billable === true)
              .sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
              })
              .slice(0, 20);

            const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === oid);
            if (agents.length === 0) continue;

            const primaryAgent = agents[0];
            const existingSuites = await storage.getEvalsByAgent(primaryAgent.id);
            let kpiSuite = existingSuites.find(s => s.type === "kpi_aligned");
            if (!kpiSuite) {
              const generated = await generateKpiAlignedEvalSuite(primaryAgent.id, oid, getOrgId(req));
              if (generated) {
                kpiSuite = generated.suite;
              } else {
                kpiSuite = await storage.createEvalSuite({
                  agentId: primaryAgent.id,
                  name: `${primaryAgent.name} - Production Feedback Suite (${outcome.name})`,
                  type: "kpi_aligned",
                  totalCases: 0,
                  coverageTags: ["production_feedback", "ground_truth"],
                  ontologyTags: { kpiAligned: true, outcomeId: oid, outcomeName: outcome.name, generatedAt: new Date().toISOString() },
                });
              }
            }

            const suiteId = kpiSuite!.id;
            const existingCases = await storage.getEvalTestCases(suiteId);
            const existingOriginIds = new Set(
              existingCases
                .filter(tc => tc.origin === "production_feedback")
                .map(tc => {
                  const input = tc.inputData as Record<string, unknown> | null;
                  return input?.sourceEventId || input?.sourceDisputeId;
                })
                .filter(Boolean)
            );

            let created = 0;

            for (const ev of rejectedEvents) {
              if (existingOriginIds.has(ev.id)) continue;
              await storage.createEvalTestCase({
                suiteId,
                name: `Production Rejection: ${ev.excludeReason || "excluded"} (${ev.type})`,
                inputData: {
                  type: "production_feedback",
                  sourceEventId: ev.id,
                  traceId: ev.traceId,
                  agentId: ev.agentId,
                  eventType: ev.type,
                  payload: ev.payload,
                  scenario: "rejected_outcome_event",
                  groundTruthLabel: "negative",
                  autoSynced: true,
                  trigger: "invoice_creation",
                },
                expectedOutput: {
                  shouldPass: false,
                  rejectionReason: ev.excludeReason,
                  expectedBehavior: `Agent output was rejected: ${ev.excludeReason}. Future runs must not reproduce this failure pattern.`,
                },
                tags: ["production_feedback", "ground_truth", "rejected_event", "auto_synced", ev.excludeReason || "excluded"],
                weight: 1.5,
                origin: "production_feedback",
                severity: "high",
              });
              created++;
            }

            for (const ev of acceptedEvents) {
              if (existingOriginIds.has(ev.id)) continue;
              await storage.createEvalTestCase({
                suiteId,
                name: `Production Accepted: ${ev.type} (billable)`,
                inputData: {
                  type: "production_feedback",
                  sourceEventId: ev.id,
                  traceId: ev.traceId,
                  agentId: ev.agentId,
                  eventType: ev.type,
                  payload: ev.payload,
                  scenario: "accepted_outcome_event",
                  groundTruthLabel: "positive",
                  autoSynced: true,
                  trigger: "invoice_creation",
                },
                expectedOutput: {
                  shouldPass: true,
                  expectedBehavior: `Agent output was accepted and billed successfully. This represents correct agent behavior for event type: ${ev.type}.`,
                },
                tags: ["production_feedback", "ground_truth", "accepted_event", "auto_synced"],
                weight: 1.0,
                origin: "production_feedback",
                severity: "low",
              });
              created++;
            }

            if (created > 0) {
              const currentCases = await storage.getEvalTestCases(suiteId);
              await storage.updateEvalSuite(suiteId, { totalCases: currentCases.length });
            }

            flywheelSyncResults.push({ outcomeId: oid, suiteId, casesCreated: created });

            await storage.createAuditEvent({
              actorType: "system",
              action: "flywheel_auto_sync",
              objectType: "eval_suite",
              objectId: suiteId,
              details: `Auto-synced ${created} production feedback cases for outcome ${outcome.name} triggered by invoice creation (invoice ${invoice.id})`,
            });
          } catch (syncErr: any) {
            flywheelSyncResults.push({ outcomeId: oid, error: syncErr.message });
          }
        }
      }

      res.status(201).json({ ...invoice, flywheelSync: flywheelSyncResults });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/invoices/:id", async (req, res) => {
    const invoice = await storage.getInvoice(req.params.id, getOrgId(req));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(invoice);
  });

  router.get("/api/invoices/:id/line-items", async (req, res) => {
    const invoice = await storage.getInvoice(req.params.id, getOrgId(req));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const events = await storage.getOutcomeEventsByInvoice(req.params.id);
    const orgId = getOrgId(req);
    const traces = await storage.getTraces(orgId);
    const agents = await storage.getAgents(orgId);
    const lineItems = events.map(event => {
      const trace = event.traceId ? traces.find(t => t.id === event.traceId) : null;
      const agent = event.agentId ? agents.find(a => a.id === event.agentId) : null;
      return {
        ...event,
        agentName: agent?.name || null,
        traceStatus: trace?.status || null,
        traceLatencyMs: trace?.latencyMs || null,
      };
    });
    res.json({ invoice, lineItems });
  });

  router.get("/api/billing/metering-dashboard", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const allInvoices = await storage.getInvoices(orgId);
      const allEvents = await storage.getOutcomeEvents(orgId);
      const allDisputes = await storage.getBillingDisputes();
      const outcomes = await storage.getOutcomes(orgId);
      const allAgents = await storage.getAgents(orgId);
      const allTraces = await storage.getTraces(orgId);
      const agentOutcomeMap = new Map(allAgents.map(a => [a.id, a.outcomeId]));
      const INFRA_OVERHEAD_RATE = 0.15;
      const TOOL_CALL_COST_RATE = 0.001;

      const totalEvents = allEvents.length;
      const billableEvents = allEvents.filter(e => e.billable);
      const excludedEvents = allEvents.filter(e => !e.billable);
      const acceptanceRate = totalEvents > 0 ? billableEvents.length / totalEvents : 0;

      const totalUnitsDelivered = allEvents.reduce((sum, e) => sum + (e.unitCount || 1), 0);
      const billableUnits = billableEvents.reduce((sum, e) => sum + (e.unitCount || 1), 0);
      const excludedUnits = excludedEvents.reduce((sum, e) => sum + (e.unitCount || 1), 0);

      const paidInvoices = allInvoices.filter(inv => inv.status === "paid");
      const pendingInvoices = allInvoices.filter(inv => inv.status === "pending");
      const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      const pendingRevenue = pendingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

      const now = new Date();
      const monthlyRevenue: Array<{ month: string; revenue: number; units: number }> = [];
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthInvoices = allInvoices.filter(inv => {
          if (!inv.periodStart) return false;
          const ps = new Date(inv.periodStart);
          return ps.getFullYear() === d.getFullYear() && ps.getMonth() === d.getMonth();
        });
        monthlyRevenue.push({
          month: monthKey,
          revenue: monthInvoices.reduce((s, inv) => s + (inv.amount || 0), 0),
          units: monthInvoices.reduce((s, inv) => s + (inv.totalUnits || 0), 0),
        });
      }

      const revenueGrowth = monthlyRevenue.length >= 2 && monthlyRevenue[monthlyRevenue.length - 2].revenue > 0
        ? ((monthlyRevenue[monthlyRevenue.length - 1].revenue - monthlyRevenue[monthlyRevenue.length - 2].revenue) / monthlyRevenue[monthlyRevenue.length - 2].revenue * 100)
        : 0;

      const avgMonthlyRevenue = monthlyRevenue.reduce((s, m) => s + m.revenue, 0) / Math.max(monthlyRevenue.filter(m => m.revenue > 0).length, 1);
      const projectedAnnualRevenue = avgMonthlyRevenue * 12;

      const excludeReasons: Record<string, number> = {};
      excludedEvents.forEach(e => {
        const reason = e.excludeReason || "unspecified";
        excludeReasons[reason] = (excludeReasons[reason] || 0) + 1;
      });

      const outcomeCostLookup: Record<string, { llm: number; tool: number }> = {};
      for (const trace of allTraces) {
        const oId = agentOutcomeMap.get(trace.agentId);
        if (!oId) continue;
        if (!outcomeCostLookup[oId]) outcomeCostLookup[oId] = { llm: 0, tool: 0 };
        outcomeCostLookup[oId].llm += trace.costUsd || 0;
        const tc = trace.toolCalls as any[] | null;
        outcomeCostLookup[oId].tool += (Array.isArray(tc) ? tc.length : 0) * TOOL_CALL_COST_RATE;
      }

      const outcomeMetering = outcomes.map(o => {
        const oEvents = allEvents.filter(e => e.outcomeId === o.id);
        const oInvoices = allInvoices.filter(inv => inv.outcomeId === o.id);
        const oDisputes = allDisputes.filter(d => d.outcomeId === o.id);
        const oBillable = oEvents.filter(e => e.billable);
        const totalRevenue = oInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);
        const costs = outcomeCostLookup[o.id];
        const directCost = costs ? costs.llm + costs.tool : 0;
        const costToServe = Math.round(directCost * (1 + INFRA_OVERHEAD_RATE) * 100) / 100;
        const margin = Math.round((totalRevenue - costToServe) * 100) / 100;
        const marginPercent = totalRevenue > 0 ? Math.round(((totalRevenue - costToServe) / totalRevenue) * 1000) / 10 : 0;
        return {
          outcomeId: o.id,
          outcomeName: o.name,
          totalEvents: oEvents.length,
          billableEvents: oBillable.length,
          excludedEvents: oEvents.length - oBillable.length,
          acceptanceRate: oEvents.length > 0 ? oBillable.length / oEvents.length : 0,
          totalRevenue,
          totalUnits: oEvents.reduce((s, e) => s + (e.unitCount || 1), 0),
          invoiceCount: oInvoices.length,
          disputeCount: oDisputes.length,
          disputeAmount: oDisputes.reduce((s, d) => s + (d.amount || 0), 0),
          costToServe,
          margin,
          marginPercent,
        };
      });

      const openDisputes = allDisputes.filter(d => d.status === "open");
      const resolvedDisputes = allDisputes.filter(d => d.status === "resolved");
      const rejectedDisputes = allDisputes.filter(d => d.status === "rejected");
      const disputeCategories: Record<string, number> = {};
      allDisputes.forEach(d => {
        disputeCategories[d.category] = (disputeCategories[d.category] || 0) + 1;
      });

      const totalCostToServe = outcomeMetering.reduce((s, o) => s + o.costToServe, 0);
      const totalMargin = totalRevenue - totalCostToServe;
      const totalMarginPercent = totalRevenue > 0 ? Math.round(((totalRevenue - totalCostToServe) / totalRevenue) * 1000) / 10 : 0;

      const monthlyMargin = monthlyRevenue.map(mr => {
        const monthTraces = allTraces.filter(t => {
          if (!t.startedAt) return false;
          const d = new Date(t.startedAt);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return mk === mr.month;
        });
        let mCost = 0;
        for (const t of monthTraces) {
          const llm = t.costUsd || 0;
          const tc = t.toolCalls as any[] | null;
          const tool = (Array.isArray(tc) ? tc.length : 0) * TOOL_CALL_COST_RATE;
          mCost += (llm + tool) * (1 + INFRA_OVERHEAD_RATE);
        }
        const mMargin = mr.revenue - Math.round(mCost * 100) / 100;
        return { month: mr.month, revenue: mr.revenue, cost: Math.round(mCost * 100) / 100, margin: Math.round(mMargin * 100) / 100 };
      });

      res.json({
        summary: {
          totalRevenue,
          pendingRevenue,
          projectedAnnualRevenue,
          revenueGrowth: Math.round(revenueGrowth * 10) / 10,
          totalUnitsDelivered,
          billableUnits,
          excludedUnits,
          acceptanceRate: Math.round(acceptanceRate * 1000) / 10,
          totalInvoices: allInvoices.length,
          paidInvoices: paidInvoices.length,
          pendingInvoices: pendingInvoices.length,
          totalCostToServe: Math.round(totalCostToServe * 100) / 100,
          totalMargin: Math.round(totalMargin * 100) / 100,
          totalMarginPercent,
        },
        monthlyRevenue,
        monthlyMargin,
        excludeReasons,
        outcomeMetering,
        disputes: {
          total: allDisputes.length,
          open: openDisputes.length,
          resolved: resolvedDisputes.length,
          rejected: rejectedDisputes.length,
          totalAmount: allDisputes.reduce((s, d) => s + (d.amount || 0), 0),
          categories: disputeCategories,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute metering dashboard" });
    }
  });

  router.get("/api/billing/cost-attribution", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const period = (req.query.period as string) || "90d";
      const now = new Date();
      let cutoff: Date | null = null;
      if (period === "30d") cutoff = new Date(now.getTime() - 30 * 86400000);
      else if (period === "90d") cutoff = new Date(now.getTime() - 90 * 86400000);

      const allTraces = await storage.getTraces(orgId);
      const filteredTraces = cutoff
        ? allTraces.filter(t => t.startedAt && new Date(t.startedAt) >= cutoff!)
        : allTraces;

      const agents = await storage.getAgents(orgId);
      const outcomes = await storage.getOutcomes(orgId);
      const agentMap = new Map(agents.map(a => [a.id, a]));
      const outcomeMap = new Map(outcomes.map(o => [o.id, o]));

      const INFRA_OVERHEAD_RATE = 0.15;
      const TOOL_CALL_COST = 0.001;

      const agentCosts: Record<string, {
        agentId: string; agentName: string; outcomeId: string | null; outcomeName: string | null;
        llmCost: number; toolCost: number; toolCallCount: number; traceCount: number; totalTokens: number;
        monthlyCosts: Record<string, { llm: number; tool: number; infra: number; traces: number }>;
      }> = {};

      for (const trace of filteredTraces) {
        const agentId = trace.agentId;
        if (!agentCosts[agentId]) {
          const agent = agentMap.get(agentId);
          agentCosts[agentId] = {
            agentId,
            agentName: agent?.name || "Unknown Agent",
            outcomeId: agent?.outcomeId || null,
            outcomeName: agent?.outcomeId ? outcomeMap.get(agent.outcomeId)?.name || null : null,
            llmCost: 0, toolCost: 0, toolCallCount: 0, traceCount: 0, totalTokens: 0,
            monthlyCosts: {},
          };
        }

        const entry = agentCosts[agentId];
        entry.traceCount++;
        entry.llmCost += trace.costUsd || 0;

        const tokenUsage = trace.tokenUsage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
        if (tokenUsage) {
          entry.totalTokens += tokenUsage.total_tokens || 0;
        }

        const toolCalls = trace.toolCalls as any[] | null;
        const toolCallCount = Array.isArray(toolCalls) ? toolCalls.length : 0;
        entry.toolCallCount += toolCallCount;
        entry.toolCost += toolCallCount * TOOL_CALL_COST;

        if (trace.startedAt) {
          const d = new Date(trace.startedAt);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!entry.monthlyCosts[monthKey]) {
            entry.monthlyCosts[monthKey] = { llm: 0, tool: 0, infra: 0, traces: 0 };
          }
          entry.monthlyCosts[monthKey].llm += trace.costUsd || 0;
          entry.monthlyCosts[monthKey].tool += toolCallCount * TOOL_CALL_COST;
          entry.monthlyCosts[monthKey].traces++;
        }
      }

      for (const entry of Object.values(agentCosts)) {
        for (const mc of Object.values(entry.monthlyCosts)) {
          mc.infra = (mc.llm + mc.tool) * INFRA_OVERHEAD_RATE;
        }
      }

      const outcomeCosts: Record<string, {
        outcomeId: string; outcomeName: string;
        totalCost: number; llmCost: number; toolCost: number; infraCost: number;
        traceCount: number; toolCallCount: number; totalTokens: number;
        avgCostPerTrace: number;
        agents: Array<{ agentId: string; agentName: string; llmCost: number; toolCost: number; infraCost: number; totalCost: number; traceCount: number }>;
        costTrend: Array<{ month: string; llm: number; tool: number; infra: number; total: number }>;
      }> = {};

      const UNATTRIBUTED = "__unattributed__";

      for (const entry of Object.values(agentCosts)) {
        const oId = entry.outcomeId || UNATTRIBUTED;
        if (!outcomeCosts[oId]) {
          outcomeCosts[oId] = {
            outcomeId: oId,
            outcomeName: entry.outcomeName || "Unattributed",
            totalCost: 0, llmCost: 0, toolCost: 0, infraCost: 0,
            traceCount: 0, toolCallCount: 0, totalTokens: 0, avgCostPerTrace: 0,
            agents: [], costTrend: [],
          };
        }

        const oc = outcomeCosts[oId];
        const directCost = entry.llmCost + entry.toolCost;
        const infraCost = directCost * INFRA_OVERHEAD_RATE;
        const totalCost = directCost + infraCost;

        oc.llmCost += entry.llmCost;
        oc.toolCost += entry.toolCost;
        oc.infraCost += infraCost;
        oc.totalCost += totalCost;
        oc.traceCount += entry.traceCount;
        oc.toolCallCount += entry.toolCallCount;
        oc.totalTokens += entry.totalTokens;

        oc.agents.push({
          agentId: entry.agentId,
          agentName: entry.agentName,
          llmCost: Math.round(entry.llmCost * 10000) / 10000,
          toolCost: Math.round(entry.toolCost * 10000) / 10000,
          infraCost: Math.round((entry.llmCost + entry.toolCost) * INFRA_OVERHEAD_RATE * 10000) / 10000,
          totalCost: Math.round((entry.llmCost + entry.toolCost) * (1 + INFRA_OVERHEAD_RATE) * 10000) / 10000,
          traceCount: entry.traceCount,
        });
      }

      const allMonths = new Set<string>();
      for (const entry of Object.values(agentCosts)) {
        for (const mk of Object.keys(entry.monthlyCosts)) allMonths.add(mk);
      }
      const sortedMonths = Array.from(allMonths).sort();

      for (const oc of Object.values(outcomeCosts)) {
        oc.avgCostPerTrace = oc.traceCount > 0 ? Math.round((oc.totalCost / oc.traceCount) * 10000) / 10000 : 0;
        oc.totalCost = Math.round(oc.totalCost * 100) / 100;
        oc.llmCost = Math.round(oc.llmCost * 100) / 100;
        oc.toolCost = Math.round(oc.toolCost * 100) / 100;
        oc.infraCost = Math.round(oc.infraCost * 100) / 100;

        const agentIds = oc.agents.map(a => a.agentId);
        oc.costTrend = sortedMonths.map(month => {
          let llm = 0, tool = 0, infra = 0;
          for (const aid of agentIds) {
            const mc = agentCosts[aid]?.monthlyCosts[month];
            if (mc) { llm += mc.llm; tool += mc.tool; infra += mc.infra; }
          }
          return {
            month,
            llm: Math.round(llm * 100) / 100,
            tool: Math.round(tool * 100) / 100,
            infra: Math.round(infra * 100) / 100,
            total: Math.round((llm + tool + infra) * 100) / 100,
          };
        });
      }

      const outcomeList = Object.values(outcomeCosts).filter(o => o.outcomeId !== UNATTRIBUTED);
      const unattributed = outcomeCosts[UNATTRIBUTED] || null;

      const totalCost = outcomeList.reduce((s, o) => s + o.totalCost, 0) + (unattributed?.totalCost || 0);
      const totalLlmCost = outcomeList.reduce((s, o) => s + o.llmCost, 0) + (unattributed?.llmCost || 0);
      const totalToolCost = outcomeList.reduce((s, o) => s + o.toolCost, 0) + (unattributed?.toolCost || 0);
      const totalInfraCost = outcomeList.reduce((s, o) => s + o.infraCost, 0) + (unattributed?.infraCost || 0);

      res.json({
        summary: {
          totalCost: Math.round(totalCost * 100) / 100,
          llmCost: Math.round(totalLlmCost * 100) / 100,
          toolCost: Math.round(totalToolCost * 100) / 100,
          infraCost: Math.round(totalInfraCost * 100) / 100,
          totalTraces: filteredTraces.length,
          avgCostPerTrace: filteredTraces.length > 0 ? Math.round((totalCost / filteredTraces.length) * 10000) / 10000 : 0,
          infraOverheadRate: INFRA_OVERHEAD_RATE,
          toolCallCostRate: TOOL_CALL_COST,
          period,
        },
        outcomes: outcomeList,
        unattributed,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute cost attribution" });
    }
  });

  router.get("/api/billing/margin-analysis", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const period = (req.query.period as string) || "90d";
      const now = new Date();
      let cutoff: Date | null = null;
      if (period === "30d") cutoff = new Date(now.getTime() - 30 * 86400000);
      else if (period === "90d") cutoff = new Date(now.getTime() - 90 * 86400000);

      const allTraces = await storage.getTraces(orgId);
      const filteredTraces = cutoff
        ? allTraces.filter(t => t.startedAt && new Date(t.startedAt) >= cutoff!)
        : allTraces;

      const agents = await storage.getAgents(orgId);
      const outcomes = await storage.getOutcomes(orgId);
      const allInvoices = await storage.getInvoices(orgId);
      const allEvents = await storage.getOutcomeEvents(orgId);
      const agentMap = new Map(agents.map(a => [a.id, a]));
      const outcomeMap = new Map(outcomes.map(o => [o.id, o]));

      const INFRA_OVERHEAD_RATE = 0.15;
      const TOOL_CALL_COST = 0.001;

      const outcomeCostMap: Record<string, { llm: number; tool: number; traceCount: number; monthly: Record<string, { llm: number; tool: number }> }> = {};

      for (const trace of filteredTraces) {
        const agent = agentMap.get(trace.agentId);
        const oId = agent?.outcomeId;
        if (!oId) continue;

        if (!outcomeCostMap[oId]) {
          outcomeCostMap[oId] = { llm: 0, tool: 0, traceCount: 0, monthly: {} };
        }
        const entry = outcomeCostMap[oId];
        entry.llm += trace.costUsd || 0;
        const toolCalls = trace.toolCalls as any[] | null;
        entry.tool += (Array.isArray(toolCalls) ? toolCalls.length : 0) * TOOL_CALL_COST;
        entry.traceCount++;

        if (trace.startedAt) {
          const d = new Date(trace.startedAt);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!entry.monthly[mk]) entry.monthly[mk] = { llm: 0, tool: 0 };
          entry.monthly[mk].llm += trace.costUsd || 0;
          entry.monthly[mk].tool += (Array.isArray(toolCalls) ? toolCalls.length : 0) * TOOL_CALL_COST;
        }
      }

      const outcomeRevenueMap: Record<string, { total: number; monthly: Record<string, number> }> = {};
      for (const inv of allInvoices) {
        const oId = inv.outcomeId;
        if (!oId) continue;
        if (!outcomeRevenueMap[oId]) outcomeRevenueMap[oId] = { total: 0, monthly: {} };
        outcomeRevenueMap[oId].total += inv.amount || 0;
        if (inv.periodStart) {
          const d = new Date(inv.periodStart);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          outcomeRevenueMap[oId].monthly[mk] = (outcomeRevenueMap[oId].monthly[mk] || 0) + (inv.amount || 0);
        }
      }

      const allMonths = new Set<string>();
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        allMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      const sortedMonths = Array.from(allMonths).sort();

      const outcomeMargins = outcomes.map(o => {
        const costs = outcomeCostMap[o.id];
        const revenue = outcomeRevenueMap[o.id];

        const directCost = costs ? costs.llm + costs.tool : 0;
        const infraCost = directCost * INFRA_OVERHEAD_RATE;
        const totalCost = directCost + infraCost;
        const totalRevenue = revenue?.total || 0;
        const margin = totalRevenue - totalCost;
        const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : (totalCost > 0 ? -100 : 0);

        const trend = sortedMonths.map(month => {
          const mCost = costs?.monthly[month];
          const mDirectCost = mCost ? mCost.llm + mCost.tool : 0;
          const mInfraCost = mDirectCost * INFRA_OVERHEAD_RATE;
          const mTotalCost = mDirectCost + mInfraCost;
          const mRevenue = revenue?.monthly[month] || 0;
          const mMargin = mRevenue - mTotalCost;
          const mMarginPct = mRevenue > 0 ? (mMargin / mRevenue) * 100 : (mTotalCost > 0 ? -100 : 0);
          return {
            month,
            revenue: Math.round(mRevenue * 100) / 100,
            cost: Math.round(mTotalCost * 100) / 100,
            margin: Math.round(mMargin * 100) / 100,
            marginPercent: Math.round(mMarginPct * 10) / 10,
          };
        });

        const alerts: Array<{ type: string; severity: string; message: string }> = [];
        if (totalRevenue > 0 && marginPercent < 0) {
          alerts.push({ type: "negative_margin", severity: "critical", message: `Outcome "${o.name}" is operating at a loss (${marginPercent.toFixed(1)}% margin)` });
        } else if (totalRevenue > 0 && marginPercent < 20) {
          alerts.push({ type: "low_margin", severity: "warning", message: `Outcome "${o.name}" has thin margins (${marginPercent.toFixed(1)}%)` });
        }

        const recentTrend = trend.filter(t => t.revenue > 0 || t.cost > 0);
        if (recentTrend.length >= 2) {
          const prev = recentTrend[recentTrend.length - 2];
          const curr = recentTrend[recentTrend.length - 1];
          if (prev.marginPercent > 0 && curr.marginPercent < prev.marginPercent - 10) {
            alerts.push({ type: "margin_erosion", severity: "warning", message: `Margin dropped ${(prev.marginPercent - curr.marginPercent).toFixed(1)}% month-over-month` });
          }
        }

        const costBreakdown = {
          llmCost: Math.round((costs?.llm || 0) * 100) / 100,
          toolCost: Math.round((costs?.tool || 0) * 100) / 100,
          infraCost: Math.round(infraCost * 100) / 100,
        };

        return {
          outcomeId: o.id,
          outcomeName: o.name,
          revenue: Math.round(totalRevenue * 100) / 100,
          costToServe: Math.round(totalCost * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: Math.round(marginPercent * 10) / 10,
          traceCount: costs?.traceCount || 0,
          costBreakdown,
          trend,
          alerts,
        };
      });

      const totalRevenue = outcomeMargins.reduce((s, o) => s + o.revenue, 0);
      const totalCost = outcomeMargins.reduce((s, o) => s + o.costToServe, 0);
      const overallMargin = totalRevenue - totalCost;
      const overallMarginPercent = totalRevenue > 0 ? (overallMargin / totalRevenue) * 100 : 0;

      const allAlerts = outcomeMargins.flatMap(o => o.alerts);

      const monthlyMargin = sortedMonths.map(month => {
        const mRevenue = outcomeMargins.reduce((s, o) => {
          const mt = o.trend.find(t => t.month === month);
          return s + (mt?.revenue || 0);
        }, 0);
        const mCost = outcomeMargins.reduce((s, o) => {
          const mt = o.trend.find(t => t.month === month);
          return s + (mt?.cost || 0);
        }, 0);
        return {
          month,
          revenue: Math.round(mRevenue * 100) / 100,
          cost: Math.round(mCost * 100) / 100,
          margin: Math.round((mRevenue - mCost) * 100) / 100,
          marginPercent: mRevenue > 0 ? Math.round(((mRevenue - mCost) / mRevenue) * 1000) / 10 : 0,
        };
      });

      res.json({
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          overallMargin: Math.round(overallMargin * 100) / 100,
          overallMarginPercent: Math.round(overallMarginPercent * 10) / 10,
          outcomeCount: outcomes.length,
          alertCount: allAlerts.length,
        },
        outcomes: outcomeMargins.sort((a, b) => a.marginPercent - b.marginPercent),
        monthlyMargin,
        alerts: allAlerts,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute margin analysis" });
    }
  });

  router.get("/api/billing/margin-alerts", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const period = (req.query.period as string) || "90d";
      const now = new Date();
      let cutoff: Date | null = null;
      if (period === "30d") cutoff = new Date(now.getTime() - 30 * 86400000);
      else if (period === "90d") cutoff = new Date(now.getTime() - 90 * 86400000);

      const agents = await storage.getAgents(orgId);
      const outcomes = await storage.getOutcomes(orgId);
      const rawTraces = await storage.getTraces(orgId);
      const allTraces = cutoff ? rawTraces.filter(t => t.startedAt && new Date(t.startedAt) >= cutoff!) : rawTraces;
      const allInvoices = await storage.getInvoices(orgId);
      const agentMap = new Map(agents.map(a => [a.id, a]));

      const INFRA_OVERHEAD_RATE = 0.15;
      const TOOL_CALL_COST = 0.001;

      const alerts: Array<{
        outcomeId: string; outcomeName: string; type: string; severity: string; message: string;
        currentMargin: number; recommendedAction: string;
      }> = [];

      for (const outcome of outcomes) {
        const outcomeAgents = agents.filter(a => a.outcomeId === outcome.id);
        const agentIds = new Set(outcomeAgents.map(a => a.id));

        const outcomeTraces = allTraces.filter(t => agentIds.has(t.agentId));
        let totalCost = 0;
        for (const t of outcomeTraces) {
          const llm = t.costUsd || 0;
          const toolCalls = t.toolCalls as any[] | null;
          const tool = (Array.isArray(toolCalls) ? toolCalls.length : 0) * TOOL_CALL_COST;
          totalCost += (llm + tool) * (1 + INFRA_OVERHEAD_RATE);
        }

        const outcomeInvoices = allInvoices.filter(inv => inv.outcomeId === outcome.id);
        const totalRevenue = outcomeInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);

        const margin = totalRevenue - totalCost;
        const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : (totalCost > 0 ? -100 : 0);

        if (totalRevenue > 0 && marginPct < 0) {
          alerts.push({
            outcomeId: outcome.id, outcomeName: outcome.name,
            type: "negative_margin", severity: "critical",
            message: `Operating at a loss: ${marginPct.toFixed(1)}% margin ($${Math.abs(margin).toFixed(2)} loss)`,
            currentMargin: Math.round(marginPct * 10) / 10,
            recommendedAction: "Immediate review required: consider model downgrade, prompt compression, or price increase",
          });
        } else if (totalRevenue > 0 && marginPct < 20) {
          alerts.push({
            outcomeId: outcome.id, outcomeName: outcome.name,
            type: "low_margin", severity: "warning",
            message: `Thin margins at ${marginPct.toFixed(1)}%`,
            currentMargin: Math.round(marginPct * 10) / 10,
            recommendedAction: "Consider cost optimization patches: model downgrade for low-complexity tasks, token budget reduction",
          });
        }

        if (totalCost > 0 && totalRevenue === 0) {
          alerts.push({
            outcomeId: outcome.id, outcomeName: outcome.name,
            type: "no_revenue", severity: "warning",
            message: `$${totalCost.toFixed(2)} in costs with no invoiced revenue`,
            currentMargin: -100,
            recommendedAction: "Review billing configuration: ensure outcome events are being generated and invoiced",
          });
        }
      }

      res.json({
        alerts: alerts.sort((a, b) => {
          const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
          return (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
        }),
        totalAlerts: alerts.length,
        criticalCount: alerts.filter(a => a.severity === "critical").length,
        warningCount: alerts.filter(a => a.severity === "warning").length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute margin alerts" });
    }
  });

  router.get("/api/billing/disputes", async (_req, res) => {
    const disputes = await storage.getBillingDisputes();
    res.json(disputes);
  });

  router.post("/api/billing/disputes", checkPermission("billing_invoices"), async (req, res) => {
    try {
      const data = insertBillingDisputeSchema.parse(req.body);
      const dispute = await storage.createBillingDispute(data);
      res.status(201).json(dispute);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/billing/disputes/:id", checkPermission("billing_invoices"), async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await storage.updateBillingDispute(id, req.body);
    if (!updated) return res.status(404).json({ error: "Dispute not found" });

    if ((updated.status === "resolved" || updated.status === "upheld") && updated.outcomeId) {
      try {
        const outcomeId = updated.outcomeId;
        const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);
        if (agents.length > 0) {
          const primaryAgent = agents[0];
          const existingSuites = await storage.getEvalsByAgent(primaryAgent.id);
          const kpiSuite = existingSuites.find(s => s.type === "kpi_aligned");
          if (kpiSuite) {
            const existingCases = await storage.getEvalTestCases(kpiSuite.id);
            const alreadyExists = existingCases.some(tc => {
              const input = tc.inputData as Record<string, unknown> | null;
              return input?.sourceDisputeId === updated.id;
            });
            if (!alreadyExists) {
              let linkedEvent = null;
              if (updated.outcomeEventId) {
                linkedEvent = await storage.getOutcomeEvent(updated.outcomeEventId);
              }
              await storage.createEvalTestCase({
                suiteId: kpiSuite.id,
                name: `Auto-Synced Dispute: ${updated.category} - ${updated.reason.substring(0, 60)}`,
                inputData: {
                  type: "production_feedback",
                  sourceDisputeId: updated.id,
                  outcomeEventId: updated.outcomeEventId,
                  invoiceId: updated.invoiceId,
                  traceId: linkedEvent?.traceId,
                  agentId: linkedEvent?.agentId,
                  payload: linkedEvent?.payload,
                  disputeCategory: updated.category,
                  scenario: "billing_dispute",
                  autoSynced: true,
                },
                expectedOutput: {
                  shouldPass: false,
                  disputeReason: updated.reason,
                  disputeCategory: updated.category,
                  disputeResolution: updated.resolution,
                  expectedBehavior: `Agent output led to billing dispute (${updated.category}): ${updated.reason}. Future runs must avoid this failure.`,
                },
                tags: ["production_feedback", "ground_truth", "billing_dispute", "auto_synced", updated.category],
                weight: 2.0,
                origin: "production_feedback",
                severity: "critical",
              });
              const allCases = await storage.getEvalTestCases(kpiSuite.id);
              await storage.updateEvalSuite(kpiSuite.id, { totalCases: allCases.length });
            }
          }
        }
      } catch (_autoSyncErr) {
      }
    }

    res.json(updated);
  });

  router.get("/api/billing/usage-export", async (req, res) => {
    try {
      const allEvents = await storage.getOutcomeEvents(getOrgId(req));
      const agents = await storage.getAgents(getOrgId(req));
      const outcomes = await storage.getOutcomes(getOrgId(req));

      const csvHeader = "Event ID,Outcome,Agent,Type,Billable,Exclude Reason,Unit Count,Unit Value,Trace ID,Created At\n";
      const csvRows = allEvents.map(e => {
        const outcome = outcomes.find(o => o.id === e.outcomeId);
        const agent = e.agentId ? agents.find(a => a.id === e.agentId) : null;
        return [
          e.id,
          `"${outcome?.name || e.outcomeId}"`,
          `"${agent?.name || e.agentId || ""}"`,
          e.type,
          e.billable ? "Yes" : "No",
          `"${e.excludeReason || ""}"`,
          e.unitCount || 1,
          e.unitValue || "",
          e.traceId || "",
          e.createdAt ? new Date(e.createdAt).toISOString() : "",
        ].join(",");
      }).join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=usage-export-${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csvHeader + csvRows);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Export failed" });
    }
  });

  // Billing routes — see server/routes/billing.ts

  router.get("/api/outcome-risk-drivers", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const traces = await storage.getTraces(orgId);
      const agents = await storage.getAgents(orgId);
      const policies = await storage.getPolicies(orgId);

      const drivers: Array<{
        type: string;
        label: string;
        severity: string;
        detail: string;
      }> = [];

      const failedTraces = traces.filter((t) => t.status === "failed" || t.status === "error");
      if (failedTraces.length > 0) {
        const recentFails = failedTraces.slice(0, 5);
        const agentIds = Array.from(new Set(recentFails.map((t) => t.agentId)));
        const agentNames = agentIds
          .map((id) => agents.find((a) => a.id === id)?.name || "Unknown")
          .slice(0, 3);
        drivers.push({
          type: "tool_failure",
          label: `${failedTraces.length} failed run(s)`,
          severity: failedTraces.length >= 5 ? "critical" : failedTraces.length >= 2 ? "high" : "medium",
          detail: `Agents: ${agentNames.join(", ")}`,
        });
      }

      const toolCallFailures: string[] = [];
      for (const trace of traces.slice(0, 50)) {
        const calls = trace.toolCalls as Array<{ name?: string; status?: string }> | null;
        if (Array.isArray(calls)) {
          calls.forEach((c) => {
            if (c.status === "failed" || c.status === "error") {
              toolCallFailures.push(c.name || "unknown");
            }
          });
        }
      }
      if (toolCallFailures.length > 0) {
        const unique = Array.from(new Set(toolCallFailures)).slice(0, 3);
        drivers.push({
          type: "tool_failure",
          label: `${toolCallFailures.length} tool call failure(s)`,
          severity: toolCallFailures.length >= 5 ? "high" : "medium",
          detail: `Tools: ${unique.join(", ")}`,
        });
      }

      let policyViolationCount = 0;
      for (const trace of traces.slice(0, 50)) {
        const checks = trace.policyChecks as Array<{ result?: string; status?: string }> | null;
        if (Array.isArray(checks)) {
          checks.forEach((c) => {
            if (c.result === "violation" || c.status === "violated") {
              policyViolationCount++;
            }
          });
        }
      }
      if (policyViolationCount > 0) {
        drivers.push({
          type: "policy_violation",
          label: `${policyViolationCount} policy violation(s)`,
          severity: policyViolationCount >= 5 ? "critical" : policyViolationCount >= 2 ? "high" : "medium",
          detail: "Detected in recent run traces",
        });
      }

      const stalePolicies = policies.filter((p) => p.status === "draft" || p.status === "deprecated");
      if (stalePolicies.length > 0) {
        drivers.push({
          type: "policy_violation",
          label: `${stalePolicies.length} stale policy(ies)`,
          severity: "low",
          detail: stalePolicies.map((p) => p.name).slice(0, 3).join(", "),
        });
      }

      res.json(drivers);
    } catch (e) {
      res.status(500).json({ error: "Failed to compute risk drivers" });
    }
  });

  // Agent Templates
  router.get("/api/drift-signals", async (req, res) => {
    try {
      const evalSuites = await storage.getEvalSuites();
      const agents = await storage.getAgents(getOrgId(req));
      const signals: Array<{
        id: string;
        agentId: string;
        agentName: string;
        suiteName: string;
        suiteType: string;
        metric: string;
        baseline: number;
        current: number;
        driftPercent: number;
        severity: string;
        status: string;
        detectedAt: string;
      }> = [];

      for (const suite of evalSuites) {
        const runs = await storage.getEvalRunsBySuite(suite.id);
        if (runs.length < 2) continue;
        
        const sorted = [...runs].sort((a, b) => 
          new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
        );
        
        const latest = sorted[0];
        const previous = sorted.slice(1, 6);
        
        if (previous.length === 0) continue;
        
        const baselinePassRate = previous.reduce((sum, r) => sum + (r.passRate || 0), 0) / previous.length;
        const currentPassRate = latest.passRate || 0;
        
        if (baselinePassRate === 0) continue;
        
        const driftPercent = ((baselinePassRate - currentPassRate) / baselinePassRate) * 100;
        
        const agent = agents.find(a => a.id === suite.agentId);
        
        if (Math.abs(driftPercent) > 2) {
          signals.push({
            id: `drift-${suite.id}`,
            agentId: suite.agentId,
            agentName: agent?.name || "Unknown Agent",
            suiteName: suite.name,
            suiteType: suite.type || "regression",
            metric: "pass_rate",
            baseline: baselinePassRate,
            current: currentPassRate,
            driftPercent: Math.round(driftPercent * 100) / 100,
            severity: Math.abs(driftPercent) > 15 ? "critical" : Math.abs(driftPercent) > 8 ? "high" : Math.abs(driftPercent) > 4 ? "medium" : "low",
            status: driftPercent > 0 ? "degraded" : "improved",
            detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
          });
        }
        
        const baselineLatency = previous.reduce((sum, r) => sum + (r.avgLatencyMs || 0), 0) / previous.length;
        const currentLatency = latest.avgLatencyMs || 0;
        
        if (baselineLatency > 0) {
          const latencyDrift = ((currentLatency - baselineLatency) / baselineLatency) * 100;
          
          if (Math.abs(latencyDrift) > 10) {
            signals.push({
              id: `drift-latency-${suite.id}`,
              agentId: suite.agentId,
              agentName: agent?.name || "Unknown Agent",
              suiteName: suite.name,
              suiteType: suite.type || "regression",
              metric: "avg_latency",
              baseline: baselineLatency,
              current: currentLatency,
              driftPercent: Math.round(latencyDrift * 100) / 100,
              severity: Math.abs(latencyDrift) > 50 ? "critical" : Math.abs(latencyDrift) > 25 ? "high" : "medium",
              status: latencyDrift > 0 ? "degraded" : "improved",
              detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
            });
          }
        }
      }
      
      for (const suite of evalSuites) {
        if (suite.type === "red_team" || suite.type === "accuracy" || suite.type === "faithfulness") {
          const runs = await storage.getEvalRunsBySuite(suite.id);
          if (runs.length < 2) continue;
          const sorted = [...runs].sort((a, b) =>
            new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
          );
          const latest = sorted[0];
          const previous = sorted.slice(1, 6);
          if (previous.length === 0) continue;

          const baselinePass = previous.reduce((s, r) => s + (r.passRate || 0), 0) / previous.length;
          const currentPass = latest.passRate || 0;
          if (baselinePass === 0) continue;
          const hallDrift = ((baselinePass - currentPass) / baselinePass) * 100;
          const agent = agents.find(a => a.id === suite.agentId);

          if (Math.abs(hallDrift) > 3) {
            const existingSignal = signals.find(s => s.id === `drift-${suite.id}`);
            if (!existingSignal) {
              signals.push({
                id: `drift-hallucination-${suite.id}`,
                agentId: suite.agentId,
                agentName: agent?.name || "Unknown Agent",
                suiteName: suite.name,
                suiteType: suite.type || "red_team",
                metric: "hallucination",
                baseline: baselinePass,
                current: currentPass,
                driftPercent: Math.round(hallDrift * 100) / 100,
                severity: Math.abs(hallDrift) > 20 ? "critical" : Math.abs(hallDrift) > 10 ? "high" : Math.abs(hallDrift) > 5 ? "medium" : "low",
                status: hallDrift > 0 ? "degraded" : "improved",
                detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
              });
            }
          }
        }
      }

      signals.sort((a, b) => {
        const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
      });
      
      res.json(signals);
    } catch (e) {
      res.status(500).json({ message: "Failed to compute drift signals" });
    }
  });

  router.get("/api/outcomes/:id/kill-chain-alerts", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing outcome ID" });
      const outcome = await storage.getOutcome(id, getOrgId(req));
      if (!outcome) return res.status(404).json({ error: "Outcome not found" });

      const kpis = await storage.getKpisByOutcome(outcome.id);
      const allAgents = await storage.getAgents(getOrgId(req));
      const boundAgents = allAgents.filter(a => a.outcomeId === outcome.id);
      const evalSuites = await storage.getEvalSuites();

      interface DriftSignal {
        metric: string;
        driftPercent: number;
        driftSeverity: string;
        baseline: number;
        current: number;
        status: string;
        detectedAt: string;
        suiteName: string;
      }

      const agentDriftMap = new Map<string, DriftSignal[]>();

      for (const agent of boundAgents) {
        const agentSuites = evalSuites.filter(s => s.agentId === agent.id);
        const drifts: DriftSignal[] = [];

        for (const suite of agentSuites) {
          const runs = await storage.getEvalRunsBySuite(suite.id);
          if (runs.length < 2) continue;
          const sorted = [...runs].sort((a, b) =>
            new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
          );
          const latest = sorted[0];
          const previous = sorted.slice(1, 6);
          if (previous.length === 0) continue;

          const baselinePassRate = previous.reduce((sum, r) => sum + (r.passRate || 0), 0) / previous.length;
          const currentPassRate = latest.passRate || 0;
          if (baselinePassRate > 0) {
            const drift = ((baselinePassRate - currentPassRate) / baselinePassRate) * 100;
            if (drift > 2) {
              drifts.push({
                metric: "pass_rate",
                driftPercent: Math.round(drift * 100) / 100,
                driftSeverity: drift > 15 ? "critical" : drift > 8 ? "high" : drift > 4 ? "medium" : "low",
                baseline: baselinePassRate,
                current: currentPassRate,
                status: "degraded",
                detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
                suiteName: suite.name,
              });
            }
          }

          const baselineLatency = previous.reduce((sum, r) => sum + (r.avgLatencyMs || 0), 0) / previous.length;
          const currentLatency = latest.avgLatencyMs || 0;
          if (baselineLatency > 0) {
            const latDrift = ((currentLatency - baselineLatency) / baselineLatency) * 100;
            if (latDrift > 10) {
              drifts.push({
                metric: "avg_latency",
                driftPercent: Math.round(latDrift * 100) / 100,
                driftSeverity: latDrift > 50 ? "critical" : latDrift > 25 ? "high" : "medium",
                baseline: baselineLatency,
                current: currentLatency,
                status: "degraded",
                detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
                suiteName: suite.name,
              });
            }
          }

          if (suite.type === "red_team" || suite.type === "accuracy" || suite.type === "faithfulness") {
            const bPass = previous.reduce((s, r) => s + (r.passRate || 0), 0) / previous.length;
            const cPass = latest.passRate || 0;
            if (bPass > 0) {
              const hDrift = ((bPass - cPass) / bPass) * 100;
              if (hDrift > 3) {
                drifts.push({
                  metric: "hallucination",
                  driftPercent: Math.round(hDrift * 100) / 100,
                  driftSeverity: hDrift > 20 ? "critical" : hDrift > 10 ? "high" : hDrift > 5 ? "medium" : "low",
                  baseline: bPass,
                  current: cPass,
                  status: "degraded",
                  detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
                  suiteName: suite.name,
                });
              }
            }
          }
        }

        if (drifts.length > 0) {
          agentDriftMap.set(agent.id, drifts);
        }
      }

      const percentUnits = ["percent", "%", "percentage", "rate", "ratio", "pct"];
      const inverseUnits = ["ms", "seconds", "minutes", "latency", "time", "cost", "usd", "eur"];

      interface KillChainAlert {
        alertId: string;
        severity: string;
        agentId: string;
        agentName: string;
        driftMetric: string;
        driftPercent: number;
        driftSeverity: string;
        suiteName: string;
        threatenedKpis: Array<{
          kpiName: string;
          currentValue: number;
          slaThreshold: number;
          headroom: number;
          unit: string;
        }>;
        recommendedAction: string;
        detectedAt: string;
      }

      const alerts: KillChainAlert[] = [];

      for (const [agentId, drifts] of Array.from(agentDriftMap.entries())) {
        const agent = boundAgents.find(a => a.id === agentId)!;

        for (const drift of drifts) {
          const threatenedKpis: KillChainAlert["threatenedKpis"] = [];

          for (const kpi of kpis) {
            if (kpi.slaThreshold == null || kpi.slaThreshold <= 0) continue;
            const currentVal = kpi.currentValue ?? kpi.target ?? 0;
            const isInverse = inverseUnits.includes(kpi.unit.toLowerCase());
            const isPct = percentUnits.includes(kpi.unit.toLowerCase()) || (!isInverse && kpi.slaThreshold <= 100);

            let headroom: number;
            if (isInverse) {
              headroom = kpi.slaThreshold - currentVal;
            } else {
              headroom = currentVal - kpi.slaThreshold;
            }

            const isRelevantDrift =
              (drift.metric === "pass_rate" && isPct) ||
              (drift.metric === "avg_latency" && isInverse) ||
              (drift.metric === "hallucination" && isPct);

            if (!isRelevantDrift) continue;

            const headroomPct = kpi.slaThreshold > 0 ? (Math.abs(headroom) / kpi.slaThreshold) * 100 : 0;
            const isThreatened = headroom < (isPct ? 5 : kpi.slaThreshold * 0.1);

            if (isThreatened || drift.driftPercent > 5) {
              threatenedKpis.push({
                kpiName: kpi.name,
                currentValue: Math.round(currentVal * 100) / 100,
                slaThreshold: kpi.slaThreshold,
                headroom: Math.round(headroom * 100) / 100,
                unit: kpi.unit,
              });
            }
          }

          if (threatenedKpis.length === 0) continue;

          const minHeadroom = Math.min(...threatenedKpis.map(t => t.headroom));
          let severity: string;
          if (minHeadroom <= 0) {
            severity = "critical";
          } else if (minHeadroom < 2 || drift.driftSeverity === "critical") {
            severity = "critical";
          } else if (minHeadroom < 5 || drift.driftSeverity === "high") {
            severity = "warning";
          } else {
            severity = "watch";
          }

          let recommendedAction: string;
          if (severity === "critical") {
            recommendedAction = `Immediately investigate ${agent.name} — ${drift.metric} drift of ${drift.driftPercent}% threatens SLA breach. Consider pausing or rolling back recent changes.`;
          } else if (severity === "warning") {
            recommendedAction = `Monitor ${agent.name} closely — ${drift.metric} degradation detected. Review recent evaluation runs and consider preventive action.`;
          } else {
            recommendedAction = `Watch ${agent.name} — minor ${drift.metric} drift detected. No immediate action required but schedule a review.`;
          }

          alerts.push({
            alertId: `kc-${agentId}-${drift.metric}-${drift.suiteName}`,
            severity,
            agentId,
            agentName: agent.name,
            driftMetric: drift.metric,
            driftPercent: drift.driftPercent,
            driftSeverity: drift.driftSeverity,
            suiteName: drift.suiteName,
            threatenedKpis,
            recommendedAction,
            detectedAt: drift.detectedAt,
          });
        }
      }

      const severityOrder: Record<string, number> = { critical: 0, warning: 1, watch: 2 };
      alerts.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

      const existingPipelines = await storage.getHealingPipelines();
      const createdPipelineIds = new Set<string>();

      for (const alert of alerts) {
        if (alert.severity !== "critical") continue;

        const dedupKey = `${alert.agentId}::${id}`;
        const alreadyExists = existingPipelines.some(p =>
          p.triggerSource === "outcome_sla_breach" &&
          p.agentId === alert.agentId &&
          p.outcomeId === id &&
          p.status !== "resolved"
        ) || createdPipelineIds.has(dedupKey);
        if (alreadyExists) {
          const existing = existingPipelines.find(p =>
            p.triggerSource === "outcome_sla_breach" &&
            p.agentId === alert.agentId &&
            p.outcomeId === id &&
            p.status !== "resolved"
          );
          if (existing) {
            (alert as any).healingPipelineId = existing.id;
          }
          continue;
        }

        const breachedKpis = alert.threatenedKpis.filter(tk => tk.headroom <= 0);
        const breachDescription = breachedKpis.length > 0
          ? breachedKpis.map(tk => `${tk.kpiName}: ${tk.currentValue}${tk.unit === "percent" || tk.unit === "%" ? "%" : " " + tk.unit} (SLA: ${tk.slaThreshold})`).join("; ")
          : alert.threatenedKpis.map(tk => `${tk.kpiName}: headroom ${tk.headroom.toFixed(1)}`).join("; ");

        const pipeline = await storage.createHealingPipeline({
          title: `SLA Breach: ${alert.agentName} — ${alert.driftMetric} drift ${alert.driftPercent}%`,
          agentId: alert.agentId,
          agentName: alert.agentName,
          industry: outcome.riskTier === "CRITICAL" ? "financial_services" : "financial_services",
          severity: "critical",
          issueType: "sla_breach",
          issueDescription: `Outcome SLA breach detected. ${breachDescription}. Agent ${alert.driftMetric} drifted by ${alert.driftPercent}% from baseline.`,
          stage: "detected",
          status: "active",
          priority: "critical",
          triggerSource: "outcome_sla_breach",
          outcomeId: id,
          diagnosisDetails: {},
          hypothesis: {},
          businessImpact: {},
          remediation: {},
          industryGuardrails: [],
          experimentConfig: {},
          experimentResults: {},
          resolution: {},
        });
        (alert as any).healingPipelineId = pipeline.id;
        createdPipelineIds.add(dedupKey);
      }

      for (const alert of alerts) {
        if (alert.severity === "critical") continue;
        if (alert.severity !== "warning") continue;

        const headrooms = alert.threatenedKpis.map(tk => {
          const sla = tk.slaThreshold > 0 ? tk.slaThreshold : 1;
          return (tk.headroom / sla) * 100;
        });
        const minHeadroomPct = Math.min(...headrooms);

        if (minHeadroomPct < 5) {
          const warnDedupKey = `${alert.agentId}::${id}`;
          const alreadyExists = existingPipelines.some(p =>
            p.triggerSource === "outcome_sla_breach" &&
            p.agentId === alert.agentId &&
            p.outcomeId === id &&
            p.status !== "resolved"
          ) || createdPipelineIds.has(warnDedupKey);
          if (!alreadyExists) {
            const pipeline = await storage.createHealingPipeline({
              title: `SLA At Risk: ${alert.agentName} — ${alert.driftMetric} drift ${alert.driftPercent}%`,
              agentId: alert.agentId,
              agentName: alert.agentName,
              industry: "financial_services",
              severity: "high",
              issueType: "sla_headroom_low",
              issueDescription: `SLA headroom below 5%. ${alert.threatenedKpis.map(tk => `${tk.kpiName}: headroom ${tk.headroom.toFixed(1)}`).join("; ")}`,
              stage: "detected",
              status: "active",
              priority: "high",
              triggerSource: "outcome_sla_breach",
              outcomeId: id,
              diagnosisDetails: {},
              hypothesis: {},
              businessImpact: {},
              remediation: {},
              industryGuardrails: [],
              experimentConfig: {},
              experimentResults: {},
              resolution: {},
            });
            (alert as any).healingPipelineId = pipeline.id;
            createdPipelineIds.add(warnDedupKey);
          }
        }
      }

      const summary = {
        critical: alerts.filter(a => a.severity === "critical").length,
        warning: alerts.filter(a => a.severity === "warning").length,
        watch: alerts.filter(a => a.severity === "watch").length,
        total: alerts.length,
      };

      res.json({ alerts, summary });
    } catch (e) {
      console.error("Kill-chain alerts error:", e);
      res.status(500).json({ error: "Failed to compute kill-chain alerts" });
    }
  });

  router.get("/api/monitor/impact", async (req, res) => {
    try {
      const outcomes = await storage.getOutcomes(getOrgId(req));
      const kpis = await storage.getKpis();
      const agents = await storage.getAgents(getOrgId(req));
      const traces = await storage.getTraces(getOrgId(req));
      const approvals = await storage.getApprovals(getOrgId(req));

      const impactData = outcomes.map(outcome => {
        const outcomeKpis = kpis.filter(k => k.outcomeId === outcome.id);
        const boundAgents = agents.filter(a => a.outcomeId === outcome.id);

        const kpiStatuses = outcomeKpis.map(kpi => {
          const attainment = kpi.target > 0 ? ((kpi.currentValue || 0) / kpi.target) * 100 : 0;
          const slaThreshold = kpi.slaThreshold || kpi.target * 0.8;
          const atSla = kpi.target > 0 ? ((kpi.currentValue || 0) >= slaThreshold) : true;
          const breachStatus = atSla ? (attainment >= 100 ? "exceeded" : "healthy") : "breached";

          return {
            id: kpi.id,
            name: kpi.name,
            unit: kpi.unit,
            baseline: kpi.baseline || 0,
            current: kpi.currentValue || 0,
            target: kpi.target,
            slaThreshold,
            attainment: Math.round(attainment * 10) / 10,
            breachStatus,
            trend: kpi.trend || "stable",
            weight: kpi.weight || 1,
            confidence: kpi.confidence || 0.85,
          };
        });

        const agentHealths = boundAgents.map(agent => {
          const agentTraces = traces.filter(t => t.agentId === agent.id).slice(-30);
          const recentFailures = agentTraces.filter(t => t.status === "failed" || t.status === "error").length;
          const recentTotal = agentTraces.length;
          const recentSuccessRate = recentTotal > 0 ? ((recentTotal - recentFailures) / recentTotal) : (agent.successRate || 0.95);

          return {
            id: agent.id,
            name: agent.name,
            status: agent.status,
            healthScore: agent.healthScore || 85,
            successRate: Math.round(recentSuccessRate * 1000) / 10,
            avgLatencyMs: agent.avgLatencyMs || 0,
            autonomyMode: agent.autonomyMode,
            recentFailures,
            costPerRun: agent.costPerRun || 0,
          };
        });

        const weightedProgress = outcomeKpis.length > 0
          ? outcomeKpis.reduce((sum, k) => {
              const att = k.target > 0 ? Math.min(100, ((k.currentValue || 0) / k.target) * 100) : 0;
              return sum + att * (k.weight || 1);
            }, 0) / outcomeKpis.reduce((sum, k) => sum + (k.weight || 1), 0)
          : 0;

        const breachedCount = kpiStatuses.filter(k => k.breachStatus === "breached").length;
        const overallStatus = breachedCount > 0 ? "at_risk" : weightedProgress >= 80 ? "on_track" : "needs_attention";

        const pendingApprovals = approvals.filter(a =>
          a.status === "pending" && a.objectId === outcome.id
        ).length;

        return {
          id: outcome.id,
          name: outcome.name,
          status: outcome.status,
          riskTier: outcome.riskTier,
          overallStatus,
          weightedProgress: Math.round(weightedProgress * 10) / 10,
          breachedKpis: breachedCount,
          totalKpis: outcomeKpis.length,
          maxDriftPercent: outcome.maxDriftPercent || 10,
          autoPause: outcome.autoPauseTrigger ?? true,
          pendingApprovals,
          kpis: kpiStatuses,
          agents: agentHealths,
        };
      });

      res.json(impactData);
    } catch (e) {
      res.status(500).json({ message: "Failed to compute monitor impact data" });
    }
  });

  router.get("/api/incidents", async (req, res) => {
    const allIncidents = await storage.getIncidents(getOrgId(req));
    res.json(allIncidents);
  });

  router.get("/api/incidents/:id", async (req, res) => {
    const incident = await storage.getIncident(req.params.id as string, getOrgId(req));
    if (!incident) return res.status(404).json({ message: "Incident not found" });
    res.json(incident);
  });

  router.patch("/api/incidents/:id", async (req, res) => {
    try {
      const updated = await storage.updateIncident(req.params.id as string, req.body, getOrgId(req));
      if (!updated) return res.status(404).json({ message: "Incident not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/incidents", async (req, res) => {
    try {
      const { agentId, agentName, metric, severity, driftPercent, baseline, current, autoTriggerPatch } = req.body;
      if (!agentId) return res.status(400).json({ message: "agentId required" });

      const metricLabel = metric === "pass_rate" ? "Pass Rate" : metric === "hallucination" ? "Faithfulness" : "Avg Latency";

      const incident = await storage.createIncident({
        agentId,
        agentName: agentName || "Unknown Agent",
        severity: severity || "medium",
        status: "open",
        sourceMetric: metric || "unknown",
        organizationId: getOrgId(req) ?? undefined,
        sourceDetails: {
          metric,
          driftPercent,
          baseline,
          current,
          detectedAt: new Date().toISOString(),
        },
        evidenceWindow: {
          windowStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          windowEnd: new Date().toISOString(),
          traceCount: 0,
          metricLabel,
        },
      });

      await storage.createAuditEvent({
        action: "incident_created",
        objectType: "incident",
        objectId: incident.id,
        actorId: "monitoring_system",
        actorType: "system",
        details: `Incident ${incident.id}: ${metricLabel} threshold violated for ${agentName || agentId}. Drift: ${Math.abs(driftPercent || 0).toFixed(1)}% (${severity || "medium"})`,
      });

      let patchResult: { patches: any[]; generated: number } | null = null;

      if (autoTriggerPatch !== false) {
        await storage.updateIncident(incident.id, { status: "investigating" }, getOrgId(req));

        try {
          const agent = await storage.getAgent(agentId, getOrgId(req));
          if (agent) {
            const recommendations = await storage.getImprovementRecommendationsByAgent(agentId);
            const driftSignals = recommendations.filter(r => r.source === "drift" || r.severity === "high" || r.severity === "critical");
            const evalSuites = await storage.getEvalsByAgent(agentId);

            const healRaw = await callClaude({
              system: `You are an autonomous agent self-healing engine responding to an active incident. Based on the incident details and agent data, generate 1-3 targeted patch candidates to remediate the issue.

Return a JSON array. Each patch must have:
- changeType: one of "prompt_tweak", "retrieval_change", "tool_retry_fallback", "model_upgrade_downgrade", "cost_cap_tuning"
- title: short descriptive title referencing the incident
- description: what the patch does and why it addresses the incident
- diff: JSON object describing the change (before/after config)
- expectedKpiImpact: expected improvement
- expectedCostImpact: cost change description
- riskLevel: "low", "medium", "high", or "critical"
- requiredApprovals: number (0 for low risk, 1 for medium, 2+ for high/critical)
- rolloutPlan: JSON with strategy ("canary"/"shadow"), startPercent, stepPercent, maxErrorRate, successThreshold

SAFETY CONSTRAINTS:
- Cannot propose expanding tool permissions
- Cannot change write-action behavior without high-tier approval
- Cannot alter redaction/audit policies autonomously
- Focus on minimal, targeted fixes for the specific incident`,
              user: `ACTIVE INCIDENT: ${metricLabel} threshold violation
Agent: ${agent.name} (${agent.modelProvider || "general"})
Severity: ${severity || "medium"}
Drift: ${driftPercent || 0}% from baseline
Baseline: ${baseline || "N/A"}, Current: ${current || "N/A"}
Success Rate: ${((agent.successRate || 0) * 100).toFixed(1)}%
Avg Latency: ${agent.avgLatencyMs || 0}ms
Drift Signals: ${JSON.stringify(driftSignals.slice(0, 3))}
Eval Suites: ${evalSuites.length} configured`,
              maxTokens: 2048,
              jsonMode: true,
            });

            let parsedPatches: any[];
            try {
              const parsed = JSON.parse(stripJsonFences(healRaw) || "[]");
              parsedPatches = Array.isArray(parsed) ? parsed : parsed.patches || [parsed];
            } catch {
              parsedPatches = [];
            }

            const createdPatches = [];
            for (const p of parsedPatches) {
              const safetyCheck = checkPatchSafety(p);
              if (safetyCheck) {
                p.riskLevel = "critical";
                p.requiredApprovals = 3;
                p.description = `[SAFETY FLAG: ${safetyCheck}] ${p.description || ""}`;
              }

              const patch = await storage.createPatch({
                agentId,
                incidentId: incident.id,
                changeType: p.changeType || "prompt_tweak",
                title: p.title || `Incident remediation: ${metricLabel}`,
                description: p.description,
                diff: p.diff,
                expectedKpiImpact: p.expectedKpiImpact,
                expectedCostImpact: p.expectedCostImpact,
                riskLevel: p.riskLevel || "medium",
                requiredApprovals: p.requiredApprovals || 1,
                rolloutPlan: p.rolloutPlan,
                evidenceBundle: {
                  source: "incident_auto_heal",
                  incidentId: incident.id,
                  incidentSeverity: severity,
                  driftPercent,
                  generatedAt: new Date().toISOString(),
                },
                status: "proposed",
              });

              const approval = await storage.createApproval({
                type: "patch_approval",
                objectType: "patch",
                objectId: patch.id,
                objectName: patch.title,
                requestedBy: "autopatch-engine",
                status: "pending",
                riskScore: p.riskLevel === "critical" ? 9 : p.riskLevel === "high" ? 7 : p.riskLevel === "medium" ? 5 : 3,
                agentId: patch.agentId,
                evidenceJson: {
                  patchId: patch.id,
                  incidentId: incident.id,
                  changeType: patch.changeType,
                  riskLevel: patch.riskLevel,
                  expectedKpiImpact: patch.expectedKpiImpact,
                  expectedCostImpact: patch.expectedCostImpact,
                  rolloutPlan: patch.rolloutPlan,
                  safetyFlag: safetyCheck || null,
                },
              });

              await storage.updatePatch(patch.id, { status: "pending_approval" });

              await storage.createAuditEvent({
                action: "patch_approval_created",
                objectType: "approval",
                objectId: approval.id,
                actorId: "autopatch_engine",
                actorType: "system",
                details: `Approval ${approval.id} created for patch "${patch.title}" (risk: ${patch.riskLevel}) linked to incident ${incident.id}`,
              });

              createdPatches.push({ ...patch, approvalId: approval.id });
            }

            if (createdPatches.length > 0) {
              await storage.updateIncident(incident.id, {
                status: "patching",
                patchId: createdPatches[0].id,
              }, getOrgId(req));
            } else {
              await storage.updateIncident(incident.id, { status: "needs_review" }, getOrgId(req));
              await storage.createAuditEvent({
                action: "autopatch_no_candidates",
                objectType: "incident",
                objectId: incident.id,
                actorId: "autopatch_engine",
                actorType: "system",
                details: `AutoPatch generated 0 candidates for incident ${incident.id}. Manual review required.`,
              });
            }

            patchResult = { patches: createdPatches, generated: createdPatches.length };

            await storage.createAuditEvent({
              action: "autopatch_triggered",
              objectType: "incident",
              objectId: incident.id,
              actorId: "autopatch_engine",
              actorType: "system",
              details: `AutoPatch generated ${createdPatches.length} candidate patches for incident ${incident.id}`,
            });
          }
        } catch (patchErr: any) {
          console.error("AutoPatch generation failed for incident:", patchErr.message);
          await storage.updateIncident(incident.id, { status: "needs_review" }, getOrgId(req));
          await storage.createAuditEvent({
            action: "autopatch_failed",
            objectType: "incident",
            objectId: incident.id,
            actorId: "autopatch_engine",
            actorType: "system",
            details: `AutoPatch failed: ${patchErr.message}. Incident requires manual review.`,
          });
        }
      }

      res.status(201).json({
        incident,
        patchResult,
        message: `Incident created for ${agentName || agentId}: ${metricLabel} violation (${severity || "medium"})`,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to create incident" });
    }
  });

  router.post("/api/monitor/auto-incident", async (req, res) => {
    try {
      const { agentId, agentName, metric, severity, driftPercent, baseline, current } = req.body;

      const incident = await storage.createIncident({
        organizationId: getOrgId(req) ?? undefined,
        agentId,
        agentName: agentName || "Unknown Agent",
        severity: severity || "medium",
        status: "open",
        sourceMetric: metric || "unknown",
        sourceDetails: { metric, driftPercent, baseline, current, detectedAt: new Date().toISOString() },
        evidenceWindow: {
          windowStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          windowEnd: new Date().toISOString(),
        },
      });

      const metricLabel = metric === "pass_rate" ? "Pass Rate" : metric === "hallucination" ? "Faithfulness" : "Avg Latency";

      await storage.createAuditEvent({
        action: "incident_created",
        objectType: "incident",
        objectId: incident.id,
        actorId: "monitoring_system",
        actorType: "system",
        details: `Auto-incident ${incident.id}: ${metricLabel} threshold violated for ${agentName}. Drift: ${Math.abs(driftPercent).toFixed(1)}% (${severity})`,
      });

      res.json({
        incidentId: incident.id,
        status: "created",
        severity,
        message: `Incident ${incident.id} auto-created for ${agentName}: ${metricLabel} threshold violation (${severity})`,
        actions: [
          { type: "replay", label: "Auto-start shadow replay to isolate regression" },
          { type: "eval", label: "Run targeted eval suite" },
          { type: "rollback", label: "Prepare rollback evidence bundle" },
        ],
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to create auto-incident" });
    }
  });

  router.post("/api/monitor/auto-rollback-suggestion", async (req, res) => {
    try {
      const { agentId, agentName, driftSignals } = req.body;
      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const deployments = await storage.getDeployments(getOrgId(req));
      const agentDeployments = deployments
        .filter(d => d.agentId === agentId && d.status === "deployed")
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const currentDeployment = agentDeployments[0];
      const previousDeployment = agentDeployments[1];

      res.json({
        suggestion: "rollback",
        agent: { id: agent.id, name: agent.name, currentVersion: agent.currentVersion },
        currentDeployment: currentDeployment ? {
          id: currentDeployment.id,
          version: currentDeployment.version,
          environment: currentDeployment.environment,
          deployedAt: currentDeployment.createdAt,
        } : null,
        rollbackTarget: previousDeployment ? {
          id: previousDeployment.id,
          version: previousDeployment.version,
          environment: previousDeployment.environment,
        } : null,
        evidenceBundle: {
          driftSignalCount: driftSignals?.length || 0,
          criticalSignals: (driftSignals || []).filter((s: any) => s.severity === "critical").length,
          affectedMetrics: Array.from(new Set((driftSignals || []).map((s: any) => s.metric))),
          recommendation: "Rollback to previous stable version based on multiple critical drift signals",
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to generate rollback suggestion" });
    }
  });

  // Tool Connector Health (derived from trace tool calls)
  router.get("/api/monitor/tool-health", async (req, res) => {
    try {
      const traces = await storage.getTraces(getOrgId(req));
      const recentTraces = traces.filter(t => {
        const ts = new Date(t.startedAt || t.endedAt || 0).getTime();
        return ts > Date.now() - 7 * 86400000;
      });

      const toolStats: Record<string, { total: number; errors: number; totalLatency: number; lastSeen: string }> = {};

      for (const trace of recentTraces) {
        const tools = (trace.toolCalls as any[] | null) || [];
        for (const tc of tools) {
          const toolType = tc.type || tc.tool || tc.name || "unknown";
          if (!toolStats[toolType]) {
            toolStats[toolType] = { total: 0, errors: 0, totalLatency: 0, lastSeen: trace.startedAt?.toString() || "" };
          }
          toolStats[toolType].total++;
          if (tc.status === "error" || tc.status === "failed") {
            toolStats[toolType].errors++;
          }
          toolStats[toolType].totalLatency += tc.latencyMs || tc.duration || 0;
          const traceTime = trace.startedAt?.toString() || "";
          if (traceTime > toolStats[toolType].lastSeen) {
            toolStats[toolType].lastSeen = traceTime;
          }
        }
      }

      const connectors = Object.entries(toolStats).map(([name, stats]) => {
        const errorRate = stats.total > 0 ? stats.errors / stats.total : 0;
        const avgLatency = stats.total > 0 ? Math.round(stats.totalLatency / stats.total) : 0;
        const status = errorRate > 0.2 ? "degraded" : errorRate > 0.5 ? "down" : "healthy";
        return {
          name,
          status,
          totalCalls: stats.total,
          errorCount: stats.errors,
          errorRate: Math.round(errorRate * 100),
          avgLatencyMs: avgLatency,
          lastSeen: stats.lastSeen,
        };
      });

      if (connectors.length === 0) {
        res.json([]);
        return;
      }

      res.json(connectors);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to compute tool health" });
    }
  });

  router.get("/api/monitor/series", async (req, res) => {
    try {
      const metric = String(req.query.metric || "successRate");
      const days = Math.min(Math.max(parseInt(String(req.query.days || "30"), 10) || 30, 1), 365);
      const agentId = req.query.agentId ? String(req.query.agentId) : null;

      const validMetrics = ["successRate", "latencyMs", "costUsd"];
      if (!validMetrics.includes(metric)) {
        return res.status(400).json({ error: `metric must be one of: ${validMetrics.join(", ")}` });
      }

      type SeriesRow = { date: string; value: string | number | null };

      const agentFilter = agentId ? sql`AND agent_id = ${agentId}` : sql``;

      let result: { rows: SeriesRow[] };

      if (metric === "successRate") {
        result = (await db.execute(sql`
          SELECT
            TO_CHAR(DATE(started_at), 'Mon DD') AS date,
            ROUND(
              (COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
              2
            ) AS value
          FROM run_traces
          WHERE started_at >= NOW() - (${days} || ' days')::interval
            ${agentFilter}
          GROUP BY DATE(started_at)
          ORDER BY DATE(started_at) ASC
        `)) as { rows: SeriesRow[] };
      } else if (metric === "latencyMs") {
        result = (await db.execute(sql`
          SELECT
            TO_CHAR(DATE(started_at), 'Mon DD') AS date,
            ROUND(AVG(latency_ms)::numeric, 2) AS value
          FROM run_traces
          WHERE started_at >= NOW() - (${days} || ' days')::interval
            ${agentFilter}
          GROUP BY DATE(started_at)
          ORDER BY DATE(started_at) ASC
        `)) as { rows: SeriesRow[] };
      } else {
        result = (await db.execute(sql`
          SELECT
            TO_CHAR(DATE(started_at), 'Mon DD') AS date,
            ROUND(AVG(cost_usd)::numeric, 4) AS value
          FROM run_traces
          WHERE started_at >= NOW() - (${days} || ' days')::interval
            ${agentFilter}
          GROUP BY DATE(started_at)
          ORDER BY DATE(started_at) ASC
        `)) as { rows: SeriesRow[] };
      }

      const rows: Array<{ date: string; value: number }> = result.rows.map(r => ({
        date: r.date,
        value: Number(r.value ?? 0),
      }));

      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to fetch monitor series" });
    }
  });

  router.get("/api/outcomes/:id/policy-coverage", async (req, res) => {
    try {
      const outcome = await storage.getOutcome(req.params.id, getOrgId(req));
      if (!outcome) return res.status(404).json({ error: "Outcome not found" });

      const allPolicies = await storage.getPolicies(getOrgId(req));
      const activePolicies = allPolicies.filter(p => p.status === "active");

      // Auto-bound: policies already scoped at org level or explicitly to this outcome
      const autoBound = activePolicies.filter(p =>
        p.scopeType === "org" || (p.scopeType === "outcome" && p.scopeId === req.params.id)
      );

      // Outcome metadata for domain/industry matching
      const outcomeDomain = (outcome as any).domain || (outcome as any).industry || null;
      const outcomeTags: string[] = Array.isArray((outcome as any).tags) ? (outcome as any).tags : [];

      // Matching-not-bound: active policies that match the outcome's domain/industry but are NOT yet auto-bound
      const autoBoundIds = new Set(autoBound.map(p => p.id));
      const matchingNotBound = activePolicies.filter(p => {
        if (autoBoundIds.has(p.id)) return false;
        if (outcomeDomain && p.domain === outcomeDomain) return true;
        const pj = p.policyJson as Record<string, any> | null;
        if (pj?.industry && outcomeDomain && pj.industry.toLowerCase() === outcomeDomain.toLowerCase()) return true;
        if (pj?.tags && Array.isArray(pj.tags) && outcomeTags.some((t: string) => (pj.tags as string[]).includes(t))) return true;
        return false;
      });

      // Critical gaps: domains that enterprise agents typically need but have zero coverage
      const CRITICAL_DOMAINS = ["data_handling", "model_governance", "deployment", "access_control"];
      const coveredDomains = new Set(autoBound.map(p => p.domain).filter(Boolean));
      const criticalGaps = CRITICAL_DOMAINS
        .filter(d => !coveredDomains.has(d))
        .map(d => ({
          domain: d,
          reason: `No active policy covers the "${d}" domain for this outcome`,
          suggestedAction: "bind_policy",
        }));

      // Per-agent coverage (lightweight — just counts)
      const agents = await storage.getAgents(getOrgId(req));
      const outcomeAgents = agents.filter(a => (a as any).outcomeId === req.params.id);
      const agentCoverage = await Promise.all(
        outcomeAgents.map(async (agent) => {
          try {
            const bundle = await resolvePolicyBundle(agent.id, getOrgId(req));
            return { agentId: agent.id, agentName: agent.name, policyCount: bundle.appliedPolicies.length };
          } catch {
            return { agentId: agent.id, agentName: agent.name, policyCount: 0 };
          }
        })
      );

      res.json({
        outcomeId: req.params.id,
        outcomeName: (outcome as any).name || req.params.id,
        outcomeDomain,
        // Core coverage model
        autoBound: autoBound.map(p => ({ id: p.id, name: p.name, domain: p.domain, scopeType: p.scopeType, version: p.version })),
        matchingNotBound: matchingNotBound.map(p => ({ id: p.id, name: p.name, domain: p.domain, scopeType: p.scopeType, version: p.version })),
        criticalGaps,
        // Summary counts
        autoBoundCount: autoBound.length,
        matchingNotBoundCount: matchingNotBound.length,
        criticalGapCount: criticalGaps.length,
        // Agent breakdown
        agentCount: outcomeAgents.length,
        agentCoverage,
      });
    } catch (e: any) {
      console.error("[policy-coverage] Error:", e);
      res.status(500).json({ error: "Failed to compute policy coverage" });
    }
  });


  // ─── Coverage Matrix ────────────────────────────────────────────────────────
  // Returns a per-agent × per-domain heatmap, plus pass rate from run_traces.
  const COVERAGE_DOMAINS = ["data_handling", "tool_permissions", "audit_compliance", "model_governance", "deployment_safety"] as const;

  router.get("/api/governance/coverage-matrix", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const agents = await storage.getAgents(orgId);
      const allPolicies = await storage.getPolicies(orgId);
      const activePolicies = allPolicies.filter(p => p.status === "active");
      const allTraces = await storage.getTraces(orgId);

      // per-policy stats accumulator: boundAgentCount + 30d pass-rate from policy_checks
      const policyBoundAgents: Record<string, string[]> = {};
      const policyTracePassed: Record<string, number> = {};
      const policyTraceTotal: Record<string, number> = {};

      // 30-day window for pass-rate calculation
      const thirtyDaysCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const rows = await Promise.all(agents.map(async (agent) => {
        let bundle: Awaited<ReturnType<typeof resolvePolicyBundle>> | null = null;
        try { bundle = await resolvePolicyBundle(agent.id, orgId); } catch { /* skip */ }

        const rawIds: string[] = (bundle?.appliedPolicies ?? []).map((p: any) => p.id);
        const appliedPolicyIds = new Set(rawIds);
        const appliedPolicies = activePolicies.filter(p => appliedPolicyIds.has(p.id));

        // Filter to last 30 days for per-policy pass-rate aggregation
        const agentTraces = allTraces.filter(t => t.agentId === agent.id);
        const recent30dTraces = agentTraces.filter(t => t.startedAt && new Date(t.startedAt) >= thirtyDaysCutoff);
        // Per-policy pass/fail from policy_checks.violations field
        for (const pid of rawIds) {
          if (!policyBoundAgents[pid]) policyBoundAgents[pid] = [];
          policyBoundAgents[pid].push(agent.id);
          // Only count traces that have policy_checks populated (authoritative signal)
          const tracesWithChecks = recent30dTraces.filter(t => t.policyChecks != null);
          for (const t of tracesWithChecks) {
            const violations = ((t.policyChecks as any)?.violations ?? []) as Array<{ policyIds?: string[] }>;
            const violatedThisPolicy = violations.some(v => Array.isArray(v.policyIds) && v.policyIds.includes(pid));
            policyTraceTotal[pid] = (policyTraceTotal[pid] ?? 0) + 1;
            if (!violatedThisPolicy) policyTracePassed[pid] = (policyTracePassed[pid] ?? 0) + 1;
          }
        }

        // Domain coverage: check if any applied policy covers each required domain.
        // Values: "covered" (policy applied + pass rate ≥ 80% or no traces),
        //         "partial" (policy applied but pass rate < 80%),
        //         "missing" (no applied policy for domain).
        const domainCoverage: Record<string, "covered" | "partial" | "missing"> = {};
        const missingDomains: string[] = [];
        for (const domain of COVERAGE_DOMAINS) {
          const dbDomain = domain === "audit_compliance" ? "logging"
            : domain === "model_governance" ? "allowed_actions"
            : domain === "deployment_safety" ? "content_boundaries"
            : domain;
          const matchingPolicy = appliedPolicies.find(p => p.domain === dbDomain || p.domain === domain);
          if (!matchingPolicy) {
            domainCoverage[domain] = "missing";
            missingDomains.push(domain);
          } else {
            // Check 30d pass rate for this policy
            const total = policyTraceTotal[matchingPolicy.id] ?? 0;
            const passed = policyTracePassed[matchingPolicy.id] ?? 0;
            const pr = total > 0 ? (passed / total) : 1;
            domainCoverage[domain] = pr >= 0.8 ? "covered" : "partial";
          }
        }

        // Pass rate: recent traces for this agent
        const totalTraces = agentTraces.length;
        const passedTraces = agentTraces.filter(t => t.status === "completed" && !t.softPolicyViolations).length;
        const passRate = totalTraces > 0 ? Math.round((passedTraces / totalTraces) * 100) : null;

        return {
          agentId: agent.id,
          agentName: agent.name,
          environment: agent.environment ?? "prod",
          status: agent.status,
          policyCount: appliedPolicies.length,
          appliedPolicyIds: rawIds,
          domainCoverage,
          missingDomains,
          passRate,
          traceCount: totalTraces,
        };
      }));

      // Build per-policy stats map
      const policyStats: Record<string, { boundAgentCount: number; passRate: number | null }> = {};
      for (const p of activePolicies) {
        const total = policyTraceTotal[p.id] ?? 0;
        const passed = policyTracePassed[p.id] ?? 0;
        policyStats[p.id] = {
          boundAgentCount: (policyBoundAgents[p.id] ?? []).length,
          passRate: total > 0 ? Math.round((passed / total) * 100) : null,
        };
      }

      res.json({ domains: COVERAGE_DOMAINS, rows, policyStats });
    } catch (e: any) {
      console.error("[coverage-matrix] Error:", e);
      res.status(500).json({ error: "Failed to compute coverage matrix" });
    }
  });

  // ─── Compliance Feed ────────────────────────────────────────────────────────
  // Recent policy-related audit events enriched with agent/policy names.
  router.get("/api/governance/compliance-feed", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const [events, agents, policies] = await Promise.all([
        storage.getAuditEvents(orgId),
        storage.getAgents(orgId),
        storage.getPolicies(orgId),
      ]);

      const agentMap: Record<string, string> = {};
      for (const a of agents) agentMap[a.id] = a.name;
      const policyMap: Record<string, string> = {};
      for (const p of policies) policyMap[p.id] = p.name;

      // Focus on compliance-signal events; sorted newest-first, capped at 100
      const COMPLIANCE_ACTIONS = new Set([
        "policy_violation", "policy_pass", "policy_blocked", "policy_exception_created",
        "policy_exception_approved", "policy_exception_rejected", "promotion_blocked",
        "promotion_approved", "approval_created", "approval_decided", "agent_deployed",
        "agent_created", "agent_suspended", "eval_run_completed", "trace_flagged",
      ]);

      const relevant = events
        .filter(e => COMPLIANCE_ACTIONS.has(e.action) || e.objectType === "policy" || e.objectType === "agent")
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 100)
        .map(e => ({
          ...e,
          // Prefer objectId when the object is an agent; fall back to actorId only when actor is an agent
          agentName: (e.objectType === "agent" && e.objectId ? agentMap[e.objectId] : null)
            ?? (e.actorType === "agent" && e.actorId ? agentMap[e.actorId] : null)
            ?? null,
          policyName: (e.objectType === "policy" && e.objectId) ? (policyMap[e.objectId] ?? null) : null,
          severity: ["policy_violation", "policy_blocked", "promotion_blocked", "agent_suspended"].includes(e.action) ? "high"
            : ["policy_exception_created", "approval_created"].includes(e.action) ? "medium"
            : "low",
        }));

      res.json(relevant);
    } catch (e: any) {
      console.error("[compliance-feed] Error:", e);
      res.status(500).json({ error: "Failed to fetch compliance feed" });
    }
  });

  // ─── Pending Actions / Human Control Points ─────────────────────────────────
  // Aggregated queue of items awaiting human decision.
  router.get("/api/governance/pending-actions", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const [approvalsList, allExceptions, agents, policies, deploymentsList, allTraces, orgAuditEvents] = await Promise.all([
        storage.getApprovals(orgId),
        storage.getPolicyExceptions(),
        storage.getAgents(orgId),
        storage.getPolicies(orgId),
        storage.getDeployments(orgId),
        storage.getTraces(orgId),
        storage.getAuditEvents(orgId),
      ]);

      // Build lookup maps
      const agentMap: Record<string, string> = {};
      for (const a of agents) agentMap[a.id] = a.name;
      const policyMap: Record<string, string> = {};
      for (const p of policies) policyMap[p.id] = p.name;

      // Org-scope exceptions: filter by org's policyIds or agentIds
      const orgPolicyIds = new Set(policies.map(p => p.id));
      const orgAgentIds = new Set(agents.map(a => a.id));
      const exceptions = allExceptions.filter(e =>
        orgPolicyIds.has(e.policyId) || (e.agentId ? orgAgentIds.has(e.agentId) : false)
      );

      // 1. Pending approvals
      const pendingApprovals = approvalsList
        .filter(a => a.status === "pending")
        .map(a => ({
          kind: "approval" as const,
          id: a.id,
          title: a.objectName ?? a.type,
          description: a.description ?? a.diffSummary ?? "",
          agentId: a.agentId ?? null,
          agentName: a.agentId ? (agentMap[a.agentId] ?? null) : null,
          riskScore: a.riskScore ?? 0,
          dueDate: a.dueDate,
          escalationLevel: a.escalationLevel ?? 0,
          changeType: a.changeType ?? a.type,
          createdAt: a.createdAt,
        }));

      // 2. Expiring-soon exceptions (approved, expiring within 7 days)
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const expiringExceptions = exceptions
        .filter(e => {
          if (e.status !== "approved" || !e.expiresAt) return false;
          const diff = new Date(e.expiresAt).getTime() - now;
          return diff > 0 && diff <= sevenDays;
        })
        .map(e => ({
          kind: "exception_expiry" as const,
          id: e.id,
          title: policyMap[e.policyId] ?? e.policyId,
          description: `Exception expiring — ${e.reason}`,
          agentId: e.agentId ?? null,
          agentName: e.agentId ? (agentMap[e.agentId] ?? null) : null,
          riskScore: 0.5,
          dueDate: e.expiresAt,
          escalationLevel: 0,
          changeType: "exception_expiry",
          createdAt: e.createdAt,
        }));

      // 3. Pending exception reviews
      const pendingExceptionReviews = exceptions
        .filter(e => e.status === "pending")
        .map(e => ({
          kind: "exception_review" as const,
          id: e.id,
          title: policyMap[e.policyId] ?? e.policyId,
          description: e.reason,
          agentId: e.agentId ?? null,
          agentName: e.agentId ? (agentMap[e.agentId] ?? null) : null,
          riskScore: 0.3,
          dueDate: null,
          escalationLevel: 0,
          changeType: "exception_review",
          createdAt: e.createdAt,
        }));

      // 4. Workflow checkpoint human gates — pipeline runs with an active interrupt awaiting response.
      // pipeline_runs has no organizationId column; we scope via interruptInstances →
      // interruptDefinitions → agentPipelines and cross-check against org-owned agents' pipeline IDs.
      // Until agentPipelines carries an organizationId column, we derive reachable pipelineIds from
      // org-scoped interrupt_instances (via audit trail correlation) to prevent cross-tenant exposure.
      let workflowGates: any[] = [];
      try {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        // Fetch pending interrupt instances that are org-audited (audit_events referencing pipeline_run)
        const orgPipelineRunIds = new Set(
          orgAuditEvents
            .filter(e => e.objectType === "pipeline_run" && e.objectId)
            .map(e => e.objectId as string)
        );

        if (orgPipelineRunIds.size > 0) {
          const allRuns = await db.select().from(pipelineRuns)
            .where(sql`active_interrupt_id IS NOT NULL AND created_at > ${cutoff.toISOString()}`);
          workflowGates = allRuns
            .filter((run: { id: string }) => orgPipelineRunIds.has(run.id))
            .map(run => ({
              kind: "workflow_interrupt" as const,
              id: run.id,
              title: `Pipeline interrupt — ${run.status}`,
              description: `Active interrupt: ${run.activeInterruptId}`,
              agentId: null,
              agentName: null,
              riskScore: 0.6,
              dueDate: null,
              escalationLevel: 0,
              changeType: "workflow_interrupt",
              createdAt: run.createdAt,
            }));
        }
      } catch { /* non-blocking */ }

      // 5. Blocked deployments — deployments where status indicates policy gate block
      const blockedDeployments = deploymentsList
        .filter(d => ["blocked", "policy_gate", "pending_review", "promotion_blocked"].some(s => (d.status ?? "").toLowerCase().includes(s)))
        .slice(0, 10)
        .map(d => ({
          kind: "deployment_block" as const,
          id: d.id,
          title: `Blocked deployment — ${agentMap[d.agentId] ?? d.agentId}`,
          description: `Deployment to ${d.environment ?? "unknown"} is blocked`,
          agentId: d.agentId,
          agentName: agentMap[d.agentId] ?? null,
          riskScore: 0.7,
          dueDate: null,
          escalationLevel: 0,
          changeType: "deployment_block",
          createdAt: d.createdAt,
        }));

      // 6. Unresolved hard-violation traces (failed with policy violations)
      const hardViolationTraces = allTraces
        .filter(t => t.status === "failed" && t.policyChecks != null)
        .sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime())
        .slice(0, 5)
        .map(t => ({
          kind: "policy_violation" as const,
          id: t.id,
          title: `Policy violation — ${agentMap[t.agentId] ?? t.agentId}`,
          description: "Run trace failed with policy check violations",
          agentId: t.agentId,
          agentName: agentMap[t.agentId] ?? null,
          riskScore: 0.8,
          dueDate: null,
          escalationLevel: 0,
          changeType: "policy_violation",
          createdAt: t.startedAt,
        }));

      const all = [
        ...pendingApprovals, ...expiringExceptions, ...pendingExceptionReviews,
        ...workflowGates, ...blockedDeployments, ...hardViolationTraces,
      ].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));

      res.json({
        items: all,
        counts: {
          approvals: pendingApprovals.length,
          exceptions: pendingExceptionReviews.length,
          expiring: expiringExceptions.length,
          workflowGates: workflowGates.length,
          deploymentBlocks: blockedDeployments.length,
          violations: hardViolationTraces.length,
        },
      });
    } catch (e: any) {
      console.error("[pending-actions] Error:", e);
      res.status(500).json({ error: "Failed to fetch pending actions" });
    }
  });

  // ─── Control Point Action ────────────────────────────────────────────────────
  // Unified endpoint for approve/reject/acknowledge/escalate on any control-point
  // item kind (workflow_interrupt, deployment_block, policy_violation).
  router.post("/api/governance/control-point-action", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { id, kind, action, comment } = z.object({
        id: z.string(),
        kind: z.enum(["workflow_interrupt", "deployment_block", "policy_violation"]),
        action: z.enum(["approve", "reject", "acknowledge", "escalate"]),
        comment: z.string().optional(),
      }).parse(req.body);

      const decidedBy = "current-user";

      if (kind === "workflow_interrupt") {
        // Ownership check: verify this run has an activeInterruptId and is org-reachable via audit events
        const [runRows] = await Promise.all([
          db.select({ id: pipelineRuns.id, activeInterruptId: pipelineRuns.activeInterruptId })
            .from(pipelineRuns)
            .where(sql`id = ${id} AND active_interrupt_id IS NOT NULL`)
            .limit(1),
        ]);
        if (!runRows || runRows.length === 0) {
          return res.status(404).json({ error: "Pipeline run not found or has no active interrupt" });
        }
        const orgRunIds = new Set(
          (await storage.getAuditEvents(orgId))
            .filter(e => e.objectType === "pipeline_run" && e.objectId)
            .map(e => e.objectId as string)
        );
        if (!orgRunIds.has(id)) {
          return res.status(403).json({ error: "Forbidden: pipeline run not associated with this organization" });
        }
        await db.update(pipelineRuns)
          .set({ activeInterruptId: null })
          .where(sql`id = ${id}`);
        const interruptAuditEvent: InsertAuditEvent = {
          action: `workflow_interrupt_${action}`,
          actorType: "user",
          actorId: decidedBy,
          objectType: "pipeline_run",
          objectId: id,
          details: comment ?? `Interrupt ${action}d`,
          organizationId: orgId,
        };
        await storage.createAuditEvent(interruptAuditEvent);

      } else if (kind === "deployment_block") {
        const newStatus = action === "approve" ? "deployed" : "cancelled";
        await storage.updateDeployment(id, { status: newStatus }, orgId);
        const deployAuditEvent: InsertAuditEvent = {
          action: `deployment_block_${action}`,
          actorType: "user",
          actorId: decidedBy,
          objectType: "deployment",
          objectId: id,
          details: comment ?? `Deployment ${action}d`,
          organizationId: orgId,
        };
        await storage.createAuditEvent(deployAuditEvent);

      } else if (kind === "policy_violation") {
        const auditAction = action === "escalate" ? "policy_violation_escalated" : "policy_violation_acknowledged";
        const violationAuditEvent: InsertAuditEvent = {
          action: auditAction,
          actorType: "user",
          actorId: decidedBy,
          objectType: "trace",
          objectId: id,
          details: comment ?? `Violation ${action}d`,
          organizationId: orgId,
        };
        await storage.createAuditEvent(violationAuditEvent);
      }

      res.json({ ok: true, id, kind, action });
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(e, res);
      console.error("[control-point-action] Error:", e);
      res.status(500).json({ error: "Failed to process control-point action" });
    }
  });

export default router;
