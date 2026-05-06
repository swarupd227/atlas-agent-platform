// =============================================================================
// MCG Health — Knowledge Base Onboarding (SCN-MCG-1) — Shared Definitions
//
// Consumed by:
//   • server/mcg-kb-live-run.ts        (live SSE pipeline runner)
//   • provision_mcg_kb_dev.sh          (dev provisioning)
//   • migrate_mcg_kb_to_prod.sh        (production migration)
//
// Agent names here MUST match what the provisioning script POSTs to /api/agents.
// =============================================================================

export const MCG_KB_AGENT_NAME = "MCG-KB-INGEST-001 Knowledge Base Ingestion Agent";

export const MCG_KB_MCP_SERVER_NAMES = {
  knowledgeBase: "MCG Knowledge Base MCP",
  bundleStore:   "Atlas Bundle Store MCP",
} as const;

// ─── MCP server definitions ──────────────────────────────────────────────────

export type McgToolDef = {
  name:        string;
  description: string;
  endpoint:    string;
  method:      "GET" | "POST";
  inputSchema: any;
};

export type McgMcpServerDef = {
  name:        string;
  description: string;
  url:         string;
  vendor:      string;
  tools:       McgToolDef[];
};

export function makeMcgKbMcpServerDefs(baseUrl: string): McgMcpServerDef[] {
  return [
    {
      name:        MCG_KB_MCP_SERVER_NAMES.knowledgeBase,
      description: "MCG source document access — structured extraction of brand policy, language rules, segment profiles, naming aliases, dictionary index, theme tokens, and QA rules from the MCG Brand Style Guide and Clinical Dictionary.",
      url:         `${baseUrl}/api/mock/mcg-knowledge-base`,
      vendor:      "MCG Health / Knowledge Management",
      tools: [
        {
          name:        "extract_brand_policy",
          description: "Extract structured brand naming rules, capitalization requirements, forbidden terms, formatting standards, and tone guidelines from the MCG Brand Style Guide.",
          endpoint:    "extract-brand-policy",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "extract_language_policy",
          description: "Extract language and editorial policy from the MCG Brand Style Guide: tense, POV, grammatical preferences, prohibited phrases, and readability targets.",
          endpoint:    "extract-language-policy",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "extract_segment_lexicon",
          description: "Extract segment-specific terminology, value drivers, messaging frames, decision-maker profiles, and pain points for each MCG customer segment (health plan, hospital system, employer).",
          endpoint:    "extract-segment-lexicon",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "extract_naming_aliases",
          description: "Extract the complete naming alias map: canonical names, approved shortforms, prohibited legacy names (Milliman variants), and trademark usage rules.",
          endpoint:    "extract-naming-aliases",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "extract_dictionary_index",
          description: "Extract the structured index of the MCG Clinical Dictionary: entry count by category, high-frequency clinical and payer terms with definitions.",
          endpoint:    "extract-dictionary-index",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "extract_theme_tokens",
          description: "Extract visual and content theme tokens: color palette (hex values and usage), typography specifications, and proposal layout rules.",
          endpoint:    "extract-theme-tokens",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "derive_qa_rules",
          description: "Derive the full set of QA validation rules from all extracted content: hard-block rules (prohibited terms, uncited claims), soft warning rules (missing hashes, passive voice), QA score weights, and the passing threshold (90).",
          endpoint:    "derive-qa-rules",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    },
    {
      name:        MCG_KB_MCP_SERVER_NAMES.bundleStore,
      description: "Atlas Bundle Store — governed KB bundle creation, semantic versioning, QA validation, and human promotion workflow. All bundles are in DRAFT status until promoted by an authorized human reviewer.",
      url:         `${baseUrl}/api/mock/mcg-bundle-store`,
      vendor:      "Atlas Platform / Bundle Store",
      tools: [
        {
          name:        "produce_bundle",
          description: "Create a typed JSON knowledge bundle in DRAFT status. Accepts all 12 required artifacts (brand_policy, language_policy, segment_lexicon, naming_alias_map, dictionary_index, theme_tokens, qa_rules, source_provenance, token_usage, passed_qa, qa_score, schema_version). Returns bundle_id for subsequent QA and promotion.",
          endpoint:    "produce-bundle",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["name", "artifacts"],
            properties: {
              name:           { type: "string" },
              artifacts:      { type: "object" },
              schema_version: { type: "string" },
              source_agent:   { type: "string" },
            },
          },
        },
        {
          name:        "run_qa_check",
          description: "Run the full QA validation pipeline on a DRAFT bundle. Checks for prohibited terms (HARD_BLOCK), missing source hashes (WARN), artifact completeness, and segment lexicon coverage. Returns qa_score (0–100), passed_qa, hard_violations, and soft_warnings.",
          endpoint:    "run-qa-check",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["bundle_id"],
            properties: {
              bundle_id: { type: "string" },
            },
          },
        },
        {
          name:        "promote_bundle",
          description: "Promote a QA-passed bundle from DRAFT to ACTIVE status. Requires human action — the platform records the promoter identity and timestamp in the immutable audit trail. Once ACTIVE, all bound proposal agents will enforce the bundle's policies automatically.",
          endpoint:    "promote-bundle",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["bundle_id", "promoted_by"],
            properties: {
              bundle_id:        { type: "string" },
              promoted_by:      { type: "string" },
              acknowledgement:  { type: "string" },
            },
          },
        },
      ],
    },
  ];
}

// ─── Agent definition ─────────────────────────────────────────────────────────

export type McgAgentDef = {
  externalId:        string;
  name:              string;
  description:       string;
  modelProvider:     string;
  modelName:         string;
  mcpServerNames:    string[];
  maxToolIterations: number;
  riskTier:          "LOW" | "MEDIUM" | "HIGH";
  department:        string;
};

export const MCG_KB_AGENT_DEF: McgAgentDef = {
  externalId:        "MCG-KB-INGEST-001",
  name:              MCG_KB_AGENT_NAME,
  description:       "Ingests the MCG Brand Style Guide and MCG Clinical Dictionary into a governed, versioned knowledge bundle. Runs 7 structured extraction nodes in sequence, produces a 12-artifact typed JSON bundle, then validates via QA check and surfaces the result for human promotion.",
  modelProvider:     "anthropic",
  modelName:         "claude-haiku-4-5",
  mcpServerNames:    [MCG_KB_MCP_SERVER_NAMES.knowledgeBase, MCG_KB_MCP_SERVER_NAMES.bundleStore],
  maxToolIterations: 12,
  riskTier:          "MEDIUM",
  department:        "Knowledge Management",
};

// ─── Scenario prompts ─────────────────────────────────────────────────────────

export type McgScenarioKey = "happy" | "prohibited-term" | "missing-hash";

export const MCG_KB_SCENARIO_PROMPTS: Record<
  McgScenarioKey,
  { label: string; badge?: string; description: string; prompt: string; completeMsg: string }
> = {
  happy: {
    label:       "Happy Path — Full KB Ingestion",
    description: "MCG Brand Style Guide + Clinical Dictionary ingested across 7 extraction nodes. Bundle produces all 12 artifacts. QA passes at 97.4. 1 soft warning (missing SHA-256 on 2 source docs). Human Promote gate appears.",
    completeMsg: "MCG KB bundle ingested successfully. QA score: 97.4 / 100. Bundle ready for human promotion.",
    prompt: `You are MCG-KB-INGEST-001, the Knowledge Base Ingestion Agent for the MCG Health Atlas platform.

Your task is to ingest the MCG Brand Style Guide and MCG Clinical Dictionary into a governed, versioned knowledge bundle.

MANDATORY EXTRACTION SEQUENCE — call each tool in order, one at a time:
1. extract_brand_policy — extract brand naming rules, capitalization, formatting, prohibited terms
2. extract_language_policy — extract tense, POV, grammatical preferences, prohibited phrases
3. extract_segment_lexicon — extract segment terminology and messaging frames (health plan, hospital, employer)
4. extract_naming_aliases — extract the full naming alias map including prohibited legacy names
5. extract_dictionary_index — extract clinical dictionary index structure and high-frequency terms
6. extract_theme_tokens — extract color palette, typography, and layout rules
7. derive_qa_rules — derive the QA validation ruleset from all extracted content

After all 7 extractions complete, call produce_bundle with:
- name: "MCG Brand & Language Intelligence Bundle"
- schema_version: "1.0.0"
- source_agent: "MCG-KB-INGEST-001"
- artifacts: include all 7 extracted artifacts as keys: brand_policy, language_policy, segment_lexicon, naming_alias_map, dictionary_index, theme_tokens, qa_rules. Also include passed_qa: false (pre-QA), qa_score: 0, schema_version: "1.0.0"

Then call run_qa_check with the bundle_id returned by produce_bundle.

End your response with a JSON block containing:
{
  "bundle_id": "<from produce_bundle>",
  "extraction_nodes_completed": 7,
  "artifacts_in_bundle": 12,
  "qa_score": <from run_qa_check>,
  "passed_qa": <from run_qa_check>,
  "hard_violations_count": 0,
  "soft_warnings_count": <count>,
  "status": "<from run_qa_check>",
  "promotable": true,
  "summary": "MCG Brand & Language Intelligence Bundle successfully ingested. 7 extraction nodes completed. QA score: 97.4/100. Bundle ready for human promotion."
}`,
  },

  "prohibited-term": {
    label:       "Exception: Prohibited Term Detected",
    badge:       "Exception",
    description: "Brand guide content contains 'Milliman Care Guidelines' used as an approved naming alias. The QA check detects this as a hard-block violation. Bundle is flagged QA_BLOCKED and cannot be promoted until corrected.",
    completeMsg: "QA BLOCKED — prohibited term 'Milliman Care Guidelines' detected. Bundle cannot be promoted until all hard violations are resolved.",
    prompt: `You are MCG-KB-INGEST-001, the Knowledge Base Ingestion Agent for the MCG Health Atlas platform.

Your task is to ingest the MCG Brand Style Guide and MCG Clinical Dictionary. NOTE: You have been flagged that the source content may contain legacy brand naming that could conflict with current brand policy.

MANDATORY EXTRACTION SEQUENCE — call each tool in order:
1. extract_brand_policy
2. extract_language_policy
3. extract_segment_lexicon
4. extract_naming_aliases — NOTE: carefully inspect all aliases for prohibited terms
5. extract_dictionary_index
6. extract_theme_tokens
7. derive_qa_rules

After all 7 extractions, call produce_bundle with all extracted artifacts.
Then IMMEDIATELY call run_qa_check on the bundle.

If run_qa_check returns passed_qa: false with hard_violations, do NOT attempt to promote. Document the violations clearly.

End your response with a JSON block containing:
{
  "bundle_id": "<from produce_bundle>",
  "extraction_nodes_completed": 7,
  "artifacts_in_bundle": 12,
  "qa_score": 0,
  "passed_qa": false,
  "hard_violations_count": <count from run_qa_check>,
  "hard_violations": [<list violation details>],
  "soft_warnings_count": 0,
  "status": "QA_BLOCKED",
  "promotable": false,
  "summary": "QA BLOCKED: Prohibited term 'Milliman Care Guidelines' detected in brand_policy and naming_alias_map artifacts. Bundle cannot be promoted until all hard violations are resolved. Remediation: remove all Milliman variants from approved aliases."
}`,
  },

  "missing-hash": {
    label:       "Exception: Missing Source Hash",
    badge:       "Exception",
    description: "Both source documents (Brand Style Guide, Clinical Dictionary) are ingested without SHA-256 hashes. QA passes with a score of 71.2 and 2 warnings. Human must acknowledge the reduced reproducibility guarantee before promotion.",
    completeMsg: "QA passed with warnings (score: 71.2). Missing SHA-256 hashes on 2 source documents. Human acknowledgement required before promotion.",
    prompt: `You are MCG-KB-INGEST-001, the Knowledge Base Ingestion Agent for the MCG Health Atlas platform.

Your task is to ingest the MCG Brand Style Guide and MCG Clinical Dictionary. NOTE: The source documents were received without SHA-256 hash metadata.

MANDATORY EXTRACTION SEQUENCE — call each tool in order:
1. extract_brand_policy
2. extract_language_policy
3. extract_segment_lexicon
4. extract_naming_aliases
5. extract_dictionary_index
6. extract_theme_tokens
7. derive_qa_rules

After all 7 extractions, call produce_bundle with all extracted artifacts.
Then call run_qa_check on the bundle.

If run_qa_check returns passed_qa: true with soft_warnings, document the warnings. The bundle is promotable but human acknowledgement of the warnings is required.

End your response with a JSON block containing:
{
  "bundle_id": "<from produce_bundle>",
  "extraction_nodes_completed": 7,
  "artifacts_in_bundle": 12,
  "qa_score": <from run_qa_check>,
  "passed_qa": true,
  "hard_violations_count": 0,
  "soft_warnings_count": <count>,
  "soft_warnings": [<list warning details>],
  "status": "QA_WARN",
  "promotable": true,
  "promotion_requires_acknowledgement": true,
  "summary": "QA passed with warnings (score: 71.2/100). 2 source documents are missing SHA-256 hashes, reducing bundle reproducibility guarantees. Human must acknowledge before promotion."
}`,
  },
};
