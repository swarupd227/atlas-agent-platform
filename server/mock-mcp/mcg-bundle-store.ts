import { Router } from "express";

// ─── Scenario state (set by live-run handler before each demo run) ─────────────
let _currentScenario = "happy";
export function setMcgBundleStoreScenario(s: string) { _currentScenario = s; }

// ─── In-memory bundle store ───────────────────────────────────────────────────
const _bundles: Record<string, any> = {};
let _bundleSeq = 1;

const router = Router();

// ─── TOOL: produce_bundle ─────────────────────────────────────────────────────
router.post("/produce-bundle", (req, res) => {
  const {
    name,
    artifacts,
    schema_version,
    source_agent,
  } = req.body ?? {};

  const bundleId = `MCG-KB-BUNDLE-${String(_bundleSeq++).padStart(4, "0")}`;
  const now = new Date().toISOString();

  const artifactKeys = [
    "brand_policy", "language_policy", "segment_lexicon", "naming_alias_map",
    "dictionary_index", "theme_tokens", "qa_rules", "source_provenance",
    "token_usage", "passed_qa", "qa_score", "schema_version",
  ];
  const completeness: Record<string, boolean> = {};
  const incoming = artifacts ?? {};
  for (const k of artifactKeys) {
    completeness[k] = k in incoming || ["passed_qa", "qa_score", "schema_version", "token_usage", "source_provenance"].includes(k);
  }

  const bundle = {
    bundle_id: bundleId,
    name: name ?? "MCG Brand & Language Intelligence Bundle",
    schema_version: schema_version ?? "1.0.0",
    status: "DRAFT",
    artifacts: {
      ...incoming,
      source_provenance: {
        sources: [
          { filename: "MCG_Brand_Style_Guide_2024.pdf", ingested_at: now },
          { filename: "MCG_Clinical_Dictionary_2024.pdf", ingested_at: now },
        ],
        ingestion_agent: source_agent ?? "MCG-KB-INGEST-001",
        pipeline: "MCG-HEALTH-KB-INGEST",
      },
      token_usage: { extraction_tokens: 14872, bundle_tokens: 3241, total: 18113 },
      schema_version: schema_version ?? "1.0.0",
    },
    artifact_completeness: completeness,
    artifact_count: artifactKeys.length,
    created_at: now,
    semantic_version: "1.0.0",
    pipeline: "MCG-HEALTH-KB-INGEST",
  };

  _bundles[bundleId] = bundle;

  res.json({
    bundle_id: bundleId,
    status: "DRAFT",
    version: bundle.semantic_version,
    artifact_count: bundle.artifact_count,
    created_at: now,
    message: "Bundle created in DRAFT state. Call run_qa_check to validate before promotion.",
  });
});

// ─── TOOL: run_qa_check ───────────────────────────────────────────────────────
router.post("/run-qa-check", (req, res) => {
  const scenario = _currentScenario;
  const { bundle_id } = req.body ?? {};
  const bundle = _bundles[bundle_id];

  if (scenario === "prohibited-term") {
    res.json({
      bundle_id,
      passed_qa: false,
      qa_score: 0,
      status: "QA_BLOCKED",
      hard_violations: [
        {
          rule_id: "QB-001",
          rule: "prohibited_term_detection",
          severity: "HARD_BLOCK",
          detail: "Prohibited term detected in brand_policy artifact: 'Milliman Care Guidelines' appears in naming_rules as an approved alias. This term is explicitly prohibited by MCG Brand Policy §2.1.",
          location: "brand_policy.naming_rules.legacy_alias",
          prohibited_term: "Milliman Care Guidelines",
          remediation: "Remove prohibited term. Replace with approved terminology: 'MCG' or 'MCG Health'. Reference naming_alias_map.aliases where approved=false for the full prohibited list.",
        },
        {
          rule_id: "QB-001b",
          rule: "prohibited_term_detection",
          severity: "HARD_BLOCK",
          detail: "Prohibited term detected in naming_alias_map artifact: 'Milliman Care Guidelines' listed as approved=true. This contradicts Brand Policy §2.1.",
          location: "naming_alias_map.aliases[5].approved",
          prohibited_term: "Milliman Care Guidelines",
          remediation: "Set approved=false on all Milliman variants in naming_alias_map. These must remain in the map as prohibited entries only.",
        },
      ],
      soft_warnings: [],
      artifacts_checked: 12,
      message: "QA FAILED — HARD BLOCK. Bundle cannot be promoted. 2 hard violations detected. Correct all hard violations and re-run QA before promotion is possible.",
      promotable: false,
    });
    return;
  }

  if (scenario === "missing-hash") {
    res.json({
      bundle_id,
      passed_qa: true,
      qa_score: 71.2,
      status: "QA_WARN",
      hard_violations: [],
      soft_warnings: [
        {
          rule_id: "QW-001a",
          rule: "source_hash_required",
          severity: "WARN",
          detail: "MCG_Brand_Style_Guide_2024.pdf: SHA-256 hash absent from source_metadata. Bundle reproducibility cannot be guaranteed — if the source document is updated, there is no provenance anchor for this ingestion.",
          source: "mcg-knowledge-base-mcp",
          remediation: "Re-ingest with source documents that include SHA-256 hashes, or manually add hash to source_provenance artifact.",
        },
        {
          rule_id: "QW-001b",
          rule: "source_hash_required",
          severity: "WARN",
          detail: "MCG_Clinical_Dictionary_2024.pdf: SHA-256 hash absent from source_metadata.",
          source: "mcg-knowledge-base-mcp",
          remediation: "Re-ingest with source documents that include SHA-256 hashes.",
        },
      ],
      artifacts_checked: 12,
      completeness: {
        brand_policy: true, language_policy: true, segment_lexicon: true,
        naming_alias_map: true, dictionary_index: true, theme_tokens: true,
        qa_rules: true, source_provenance: true, token_usage: true,
        passed_qa: true, qa_score: true, schema_version: true,
      },
      message: "QA passed with warnings. Score: 71.2 / 100. 2 soft warnings (missing SHA-256 on 2 source documents). Human acknowledgement required before promotion.",
      promotable: true,
      promotion_requires_acknowledgement: true,
    });
    return;
  }

  // ── Happy path ──────────────────────────────────────────────────────────────
  res.json({
    bundle_id,
    passed_qa: true,
    qa_score: 97.4,
    status: "QA_PASSED",
    hard_violations: [],
    soft_warnings: [
      {
        rule_id: "QW-001",
        rule: "source_hash_optional_enhancement",
        severity: "SOFT",
        detail: "2 source documents (MCG_Brand_Style_Guide_2024.pdf, MCG_Clinical_Dictionary_2024.pdf) are missing SHA-256 hashes. Bundle is fully promotable but adding hashes is recommended for complete immutable provenance.",
        source: "mcg-knowledge-base-mcp",
      },
    ],
    artifacts_checked: 12,
    completeness: {
      brand_policy: true, language_policy: true, segment_lexicon: true,
      naming_alias_map: true, dictionary_index: true, theme_tokens: true,
      qa_rules: true, source_provenance: true, token_usage: true,
      passed_qa: true, qa_score: true, schema_version: true,
    },
    message: "QA passed. Score: 97.4 / 100. Bundle is ready for human promotion. 1 soft warning (missing SHA-256 on 2 source documents — does not block promotion).",
    promotable: true,
    promotion_requires_acknowledgement: false,
  });
});

// ─── TOOL: promote_bundle ─────────────────────────────────────────────────────
router.post("/promote-bundle", (req, res) => {
  const { bundle_id, promoted_by, acknowledgement } = req.body ?? {};
  const bundle = _bundles[bundle_id];
  if (bundle) bundle.status = "ACTIVE";

  res.json({
    bundle_id,
    status: "ACTIVE",
    semantic_version: "1.0.0",
    promoted_by: promoted_by ?? "human-reviewer",
    acknowledgement: acknowledgement ?? null,
    promoted_at: new Date().toISOString(),
    message: "Bundle promoted to ACTIVE. All proposal agents bound to this bundle will enforce the updated brand, language, and segment intelligence automatically.",
    downstream_agents_notified: ["MCG-PROPOSAL-WRITER-001", "MCG-PROPOSAL-WRITER-002", "MCG-QA-VALIDATOR-001"],
    audit_entry: {
      event: "bundle.promoted",
      bundle_id,
      version: "1.0.0",
      actor_type: "human",
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
