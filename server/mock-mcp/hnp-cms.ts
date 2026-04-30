import { Router, type Request, type Response } from "express";

const router = Router();

// ─── HNP CMS mock — story drafts written by HNP-GOVT-03 land here ─────────────

type StoryDraft = {
  draftId:       string;
  newspaper:     string;
  desk:          string;
  workingTitle:  string;
  status:        "draft" | "in_review" | "scheduled" | "published";
  watermark:     string;
  authorAgent:   string;
  assignedReporter?: string;
  tags:          string[];
  seoFields?:    {
    metaTitle?:       string;
    metaDescription?: string;
    canonicalSlug?:   string;
  };
  body:          string;
  citations:     Array<{ claim: string; source: string; timestamp?: number; speaker?: string }>;
  createdAt:     string;
  updatedAt:     string;
};

const STORE: StoryDraft[] = [];

const REPORTERS_BY_DESK: Record<string, string[]> = {
  "Investigations":      ["Clara Mendez", "Marcus Tanaka", "Yvette Park"],
  "City Hall":           ["David Lin", "Priya Shah"],
  "Harris County":       ["Jamal Watkins", "Hannah Brewster"],
  "Environment & Climate": ["Sofia Reyes", "Ethan Chu"],
};

// ─── Tools ────────────────────────────────────────────────────────────────────

router.post("/create-story-draft", (req: Request, res: Response) => {
  const body = req.body || {};
  if (!body.working_title) {
    return res.status(400).json({ success: false, error: "working_title is required" });
  }

  // Source-attribution gate — every claim in citations must reference a transcript / public record
  const citations: any[] = Array.isArray(body.citations) ? body.citations : [];
  const uncited = citations.filter((c: any) => !c.source || c.source === "");
  if (citations.length === 0) {
    return res.status(422).json({
      success: false,
      error:   "BLOCKED: source-attribution gate — at least one citation is required (every claim must trace to a transcript timestamp, contract, or public-record FOIA response)",
      policy:  "HNP Source Attribution Requirement",
    });
  }
  if (uncited.length > 0) {
    return res.status(422).json({
      success: false,
      error:   `BLOCKED: source-attribution gate — ${uncited.length} citation(s) missing source field`,
      policy:  "HNP Source Attribution Requirement",
      uncitedClaims: uncited.map((c: any) => c.claim || "(unspecified claim)"),
    });
  }

  const draft: StoryDraft = {
    draftId:      `DRAFT-${Date.now().toString(36).toUpperCase()}-${STORE.length + 1}`,
    newspaper:    (body.newspaper as string) || "Houston Chronicle",
    desk:         (body.desk as string)      || "Investigations",
    workingTitle: body.working_title,
    status:       "draft",
    watermark:    "DRAFT — NOT FOR PUBLICATION",
    authorAgent:  (body.author_agent as string) || "HNP-GOVT-03 Story Draft Agent",
    tags:         Array.isArray(body.tags) ? body.tags : [],
    body:         (body.body as string) || "",
    citations,
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
  STORE.unshift(draft);

  res.json({
    success:           true,
    draft,
    publicationGuard:  "Watermark DRAFT — NOT FOR PUBLICATION applied per HNP Publication Boundary policy. Removal requires editorial sign-off through normal CMS workflow.",
  });
});

router.post("/assign-to-reporter", (req: Request, res: Response) => {
  const { draft_id, reporter, desk } = req.body || {};
  if (!draft_id) {
    return res.status(400).json({ success: false, error: "draft_id is required" });
  }
  const draft = STORE.find(d => d.draftId === draft_id);
  if (!draft) {
    return res.status(404).json({ success: false, error: "draft not found" });
  }

  let assignedReporter = reporter as string | undefined;
  if (!assignedReporter) {
    const deskKey = (desk as string) || draft.desk;
    const pool = REPORTERS_BY_DESK[deskKey] || REPORTERS_BY_DESK["Investigations"];
    assignedReporter = pool[0];
  }

  draft.assignedReporter = assignedReporter;
  draft.updatedAt = new Date().toISOString();
  res.json({ success: true, draftId: draft.draftId, assignedReporter, status: draft.status, watermark: draft.watermark });
});

router.post("/set-story-tags", (req: Request, res: Response) => {
  const { draft_id, tags } = req.body || {};
  const draft = STORE.find(d => d.draftId === draft_id);
  if (!draft) {
    return res.status(404).json({ success: false, error: "draft not found" });
  }
  draft.tags = Array.isArray(tags) ? tags : [];
  draft.updatedAt = new Date().toISOString();
  res.json({ success: true, draftId: draft.draftId, tags: draft.tags });
});

router.post("/set-seo-fields", (req: Request, res: Response) => {
  const { draft_id, meta_title, meta_description, canonical_slug } = req.body || {};
  const draft = STORE.find(d => d.draftId === draft_id);
  if (!draft) {
    return res.status(404).json({ success: false, error: "draft not found" });
  }
  draft.seoFields = {
    metaTitle:       meta_title,
    metaDescription: meta_description,
    canonicalSlug:   canonical_slug,
  };
  draft.updatedAt = new Date().toISOString();
  res.json({ success: true, draftId: draft.draftId, seoFields: draft.seoFields });
});

router.get("/list-drafts", (_req: Request, res: Response) => {
  res.json({ success: true, count: STORE.length, drafts: STORE.slice(0, 25) });
});

export default router;
