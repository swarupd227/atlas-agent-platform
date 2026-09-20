import { Router } from "express";
import { storage } from "../storage";
import { outputContractEnforcer } from "../services/output-contract-enforcer";
import { checkStrictModeCompatible, checkSchemaComplexity } from "../services/json-schema-strict-compat";
import { insertOutputContractSchema } from "../../shared/schema";
import { getOrgId } from "../auth";
import { z } from "zod";

const router = Router();

// GET /api/output-contracts?agentId=xxx
router.get("/api/output-contracts", async (req, res) => {
  try {
    const agentId = req.query.agentId as string | undefined;
    const contracts = await storage.getOutputContracts(agentId);
    res.json(contracts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/output-contracts/:id
router.get("/api/output-contracts/:id", async (req, res) => {
  try {
    const contract = await storage.getOutputContract(req.params.id);
    if (!contract) return res.status(404).json({ error: "Not found" });
    res.json(contract);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/output-contracts/generate-from-ontology
// Builds (does not save) the enum schema + alias normalizer that pins an output field to the
// ontology's own vocabulary, so "use the ontology" is enforced rather than advisory.
//   Concept-label vocabulary: { industryId, subVertical?, category?, conceptIds?, fieldName }
//   Property-value vocabulary: { industryId, conceptId, propertyName, fieldName }
router.post("/api/output-contracts/generate-from-ontology", async (req, res) => {
  try {
    const body = z.object({
      industryId: z.string().min(1),
      subVertical: z.string().optional(),
      category: z.string().optional(),
      conceptIds: z.array(z.string()).optional(),
      conceptId: z.string().optional(),
      propertyName: z.string().optional(),
      fieldName: z.string().min(1),
      includeSynonyms: z.boolean().optional(),
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const b = body.data;
    const concepts = await storage.getOntologyConcepts(b.industryId, b.subVertical);

    const values: string[] = [];
    const aliases: Record<string, string> = {};
    const addAlias = (alias: string, canonical: string) => {
      const k = alias.toLowerCase().trim();
      if (k) aliases[k] = canonical;
    };

    if (b.conceptId && b.propertyName) {
      const concept = concepts.find(c => c.id === b.conceptId);
      if (!concept) return res.status(404).json({ error: `Concept ${b.conceptId} not found` });
      const prop = ((concept.properties as Array<Record<string, unknown>> | null) ?? []).find(p => p.name === b.propertyName);
      if (!prop) return res.status(404).json({ error: `Property ${b.propertyName} not found on ${b.conceptId}` });
      let list: string[] = Array.isArray(prop.values) ? (prop.values as unknown[]).map(String) : [];
      if (list.length === 0 && typeof prop.description === "string") {
        const m = prop.description.match(/Allowed values:\s*(.+?)\.?\s*$/i);
        if (m) list = m[1].split(",").map(s => s.trim()).filter(Boolean);
      }
      if (list.length === 0) return res.status(400).json({ error: `Property ${b.propertyName} does not define an enumerated value set` });
      for (const v of list) { values.push(v); addAlias(v, v); }
    } else {
      const picked = concepts.filter(c =>
        (!b.category || c.category === b.category) &&
        (!b.conceptIds || b.conceptIds.includes(c.id)));
      if (picked.length === 0) return res.status(404).json({ error: "No ontology concepts match the selection" });
      for (const c of picked) {
        values.push(c.label);
        addAlias(c.label, c.label);
        if (b.includeSynonyms !== false) for (const s of c.synonyms ?? []) addAlias(s, c.label);
      }
    }

    res.json({
      schemaDefinition: {
        type: "object",
        properties: { [b.fieldName]: { type: "string", enum: values } },
        required: [b.fieldName],
      },
      normalizers: [{ field: b.fieldName, type: "map_aliases", aliases }],
      values,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/output-contracts
router.post("/api/output-contracts", async (req, res) => {
  try {
    const parsed = insertOutputContractSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const contract = await storage.createOutputContract(parsed.data);
    res.status(201).json(contract);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/output-contracts/:id
router.patch("/api/output-contracts/:id", async (req, res) => {
  try {
    const partial = insertOutputContractSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: partial.error.flatten() });
    const updated = await storage.updateOutputContract(req.params.id, partial.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/output-contracts/:id
router.delete("/api/output-contracts/:id", async (req, res) => {
  try {
    const deleted = await storage.deleteOutputContract(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/output-contracts/check-strict-compat — live preview for the editor's
// Strict Decoding toggle: does this schema draft (not yet saved) actually get
// OpenAI's json_schema strict mode, or will it silently fall back to legacy
// json_object mode? Anthropic has no equivalent structural restriction, so any
// non-openai agent is always reported compatible.
const strictCompatSchema = z.object({
  agentId: z.string(),
  schemaDefinition: z.record(z.any()),
});

router.post("/api/output-contracts/check-strict-compat", async (req, res) => {
  try {
    const body = strictCompatSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const agent = await storage.getAgent(body.data.agentId, getOrgId(req));
    const provider = agent?.modelProvider || "openai";
    // Complexity is advisory and provider-independent -- large/deep schemas
    // strain constrained decoding on any provider that actually honors the
    // schema (Anthropic's forced tool_choice has no hard cap like OpenAI's
    // structural rules do), so it's computed regardless of the compatibility
    // verdict below.
    const complexity = checkSchemaComplexity(body.data.schemaDefinition);
    if (provider !== "openai") {
      return res.json({ compatible: true, provider, complexity });
    }
    res.json({ ...checkStrictModeCompatible(body.data.schemaDefinition), provider, complexity });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/output-contracts/:id/validate  (also support legacy /dry-run)
const validateSchema = z.object({ sampleJson: z.string().min(1) });

router.post("/api/output-contracts/:id/validate", async (req, res) => {
  try {
    const contract = await storage.getOutputContract(req.params.id);
    if (!contract) return res.status(404).json({ error: "Not found" });

    const body = validateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const result = outputContractEnforcer.dryRun(contract, body.data.sampleJson);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/api/output-contracts/:id/dry-run", async (req, res) => {
  try {
    const contract = await storage.getOutputContract(req.params.id);
    if (!contract) return res.status(404).json({ error: "Not found" });

    const body = validateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const result = outputContractEnforcer.dryRun(contract, body.data.sampleJson);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
