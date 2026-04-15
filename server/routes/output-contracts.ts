import { Router } from "express";
import { storage } from "../storage";
import { outputContractEnforcer } from "../services/output-contract-enforcer";
import { insertOutputContractSchema } from "../../shared/schema";
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

// POST /api/output-contracts/:id/dry-run
const dryRunSchema = z.object({ sampleJson: z.string().min(1) });

router.post("/api/output-contracts/:id/dry-run", async (req, res) => {
  try {
    const contract = await storage.getOutputContract(req.params.id);
    if (!contract) return res.status(404).json({ error: "Not found" });

    const body = dryRunSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const result = outputContractEnforcer.dryRun(contract, body.data.sampleJson);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
