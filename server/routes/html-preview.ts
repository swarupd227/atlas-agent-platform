import { Router } from "express";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { extractHtmlDocument } from "@shared/html-document";

const router = Router();

// The document's own policy, replacing the app's: no scripts, no forms, no access to
// the app (sandbox without allow-same-origin gives it an opaque origin), while the
// images, fonts and styles an email or page needs can load from anywhere over https.
const PREVIEW_CSP = [
  "sandbox allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "img-src https: data:",
  "style-src 'unsafe-inline' https:",
  "font-src https: data:",
  "media-src https:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * GET /api/dag-execution-runs/:id/html-preview?node=<nodeId>&wave=<n>&revision=<n>
 *
 * Serves the HTML document a step of a team run produced (an email, a landing page)
 * as a page, so it can be reviewed as it will look. Scoped to the caller's
 * organisation through the run's team agent.
 */
router.get("/api/dag-execution-runs/:id/html-preview", async (req, res) => {
  try {
    const run = await storage.getDagExecutionRun(String(req.params.id));
    const team = run?.teamAgentId ? await storage.getAgent(run.teamAgentId, getOrgId(req) ?? undefined) : null;
    if (!run || !team) return res.status(404).type("text/plain").send("Run not found");

    const nodeId = String(req.query.node || "");
    const wave = req.query.wave !== undefined ? Number(req.query.wave) : undefined;
    const revision = Number(req.query.revision || 0);
    const results = ((run.waveResults as any[]) || []).flatMap((w) =>
      (w.nodes || []).filter((n: any) => n.nodeId === nodeId).map((n: any) => ({ wave: w.waveNumber, revision: w.revisionRound ?? 0, node: n })),
    );
    // The exact occurrence asked for (a revision re-runs a step), else the latest one.
    const hit = results.find((r) => r.wave === wave && r.revision === revision) ?? results[results.length - 1];
    const text = hit
      ? Object.values(hit.node.output || {}).filter((v): v is string => typeof v === "string").join("\n\n")
      : "";
    const html = text ? extractHtmlDocument(text) : null;
    if (!html) return res.status(404).type("text/plain").send("This step produced no HTML document");

    res.setHeader("Content-Security-Policy", PREVIEW_CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "private, no-store");
    res.type("text/html").send(html);
  } catch (e: any) {
    res.status(500).type("text/plain").send(e?.message || "Preview failed");
  }
});

export default router;
