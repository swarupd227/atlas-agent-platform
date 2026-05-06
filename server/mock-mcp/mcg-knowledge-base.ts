import { Router } from "express";

// ─── Scenario state (set by live-run handler before each demo run) ─────────────
let _currentScenario = "happy";
export function setMcgKbScenario(s: string) { _currentScenario = s; }

const router = Router();

// ─── TOOL: extract_brand_policy ───────────────────────────────────────────────
router.get("/extract-brand-policy", (_req, res) => {
  const scenario = _currentScenario;

  const naming_rules: any = {
    primary_name: "MCG Health",
    first_reference: "MCG Health (full name on first reference in all external documents)",
    capitalization: "Always capitalize 'MCG Health' — never 'mcg health' or 'MCG HEALTH'",
    product_names: ["MCG Clinical Guidance", "MCG Care Guidelines", "Indicia"],
    abbreviation_rules: "Use 'MCG' only after first-reference full name has appeared in the document.",
  };

  // Prohibited-term scenario: inject disallowed legacy name into naming rules
  if (scenario === "prohibited-term") {
    naming_rules.legacy_alias = "Milliman Care Guidelines (legacy brand name used in legacy contracts — still referenced in some partner-facing materials)";
    naming_rules.abbreviation_rules = "Milliman Care Guidelines or MCG (both acceptable in partner-facing contexts after first reference).";
  }

  res.json({
    extraction_node: "extract_brand_policy",
    status: "extracted",
    artifact: "brand_policy",
    data: {
      naming_rules,
      prohibited_terms: [
        "Milliman",
        "Milliman Care Guidelines",
        "MCG™",
        "MCG care (lowercase)",
        "MCG guidelines (lowercase)",
      ],
      formatting: {
        headline_style: "Title Case for all proposal headlines",
        body_text: "Sentence case for body copy",
        font_primary: "Calibri",
        font_fallback: "Arial",
        color_primary: "#003087",
        color_secondary: "#E31837",
        logo_lockup: "MCG Health wordmark with registered mark ® — never ™",
      },
      tone: {
        voice: "authoritative, evidence-based, accessible",
        avoid: ["jargon-heavy", "overly clinical in non-clinical contexts", "first-person plural unless quoting leadership"],
      },
    },
    source_metadata: {
      filename: "MCG_Brand_Style_Guide_2024.pdf",
      section: "Brand Identity",
      pages: "1–18",
      last_updated: "2024-01-15",
      sha256: scenario === "missing-hash" ? null : "a3f4b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0",
    },
  });
});

// ─── TOOL: extract_language_policy ────────────────────────────────────────────
router.get("/extract-language-policy", (_req, res) => {
  res.json({
    extraction_node: "extract_language_policy",
    status: "extracted",
    artifact: "language_policy",
    data: {
      tense: "present tense for product capabilities, past tense for case studies and outcomes",
      point_of_view: "second person ('you', 'your organization') for proposal body; third person for executive summaries",
      active_voice: "required — passive voice flagged by QA",
      grammatical_preferences: {
        oxford_comma: true,
        spell_out_numbers: "numbers one through nine; numerals for 10 and above",
        percent_symbol: "use % with numerals (e.g. 34%), spell out 'percent' in text without a numeral",
        em_dash_usage: "permitted for emphasis — use sparingly",
      },
      prohibited_phrases: [
        "paradigm shift",
        "cutting-edge",
        "best-in-class (unless benchmarked)",
        "leverage (as a verb)",
        "utilize (use 'use' instead)",
        "synergy",
        "robust (overused — be specific)",
      ],
      sentence_length: "target 20 words average; flag sentences exceeding 35 words",
      readability_target: "Flesch-Kincaid Grade 11–13 for executive content",
    },
    source_metadata: {
      filename: "MCG_Brand_Style_Guide_2024.pdf",
      section: "Language & Editorial",
      pages: "19–31",
      last_updated: "2024-01-15",
      sha256: "a3f4b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0",
    },
  });
});

// ─── TOOL: extract_segment_lexicon ────────────────────────────────────────────
router.get("/extract-segment-lexicon", (_req, res) => {
  res.json({
    extraction_node: "extract_segment_lexicon",
    status: "extracted",
    artifact: "segment_lexicon",
    data: {
      segments: [
        {
          id: "health_plan",
          label: "Health Plan",
          preferred_terms: ["medical cost ratio reduction", "administrative efficiency", "NCQA compliance", "population health management", "prior authorization automation"],
          value_drivers: ["administrative efficiency", "NCQA compliance", "medical cost ratio (MCR) reduction", "stars rating improvement", "prior authorization volume reduction"],
          messaging_frame: "Operational efficiency, regulatory compliance, and risk management. Emphasize ROI through automation and reduced administrative overhead. Lead with payer-specific metrics.",
          decision_makers: ["CMO", "VP Medical Management", "Director of Utilization Management", "Chief Medical Officer"],
          pain_points: ["high medical costs", "regulatory burden", "prior authorization volume", "provider abrasion", "NCQA re-accreditation"],
          forbidden_phrases: ["hospital-centric", "inpatient-first", "fee-for-service optimization"],
        },
        {
          id: "hospital_system",
          label: "Hospital / Health System",
          preferred_terms: ["length-of-stay optimization", "denials management", "clinical decision support", "readmission reduction"],
          value_drivers: ["length-of-stay (LOS) optimization", "denials management", "readmission reduction", "throughput improvement", "documentation completeness"],
          messaging_frame: "Clinical quality, patient throughput, and revenue cycle protection. Emphasize evidence-based guidelines and reducing unnecessary variation in clinical practice.",
          decision_makers: ["CMO", "CFO", "VP Revenue Cycle", "Director of Case Management", "Chief Nursing Officer"],
          pain_points: ["payer denials", "LOS variability", "readmission penalties", "documentation gaps", "concurrent review burden"],
          forbidden_phrases: ["payer-centric", "cost-only framing", "one-size-fits-all"],
        },
        {
          id: "employer",
          label: "Employer / Self-Insured",
          preferred_terms: ["total cost of care", "employee productivity", "workforce health", "absence management"],
          value_drivers: ["total cost of care reduction", "employee productivity", "absence management", "benefits optimization", "vendor consolidation"],
          messaging_frame: "Workforce productivity, total cost of care, and employee experience. Measurable ROI and absence reduction are the primary proof points.",
          decision_makers: ["VP Benefits", "CHRO", "CFO", "Benefits Manager", "Director of Total Rewards"],
          pain_points: ["rising healthcare costs", "employee absenteeism", "benefits complexity", "vendor proliferation", "dependent audit exposure"],
          forbidden_phrases: ["clinical-only framing", "hospital-first", "payer-centric"],
        },
      ],
    },
    source_metadata: {
      filename: "MCG_Segment_Profiles_2024.json",
      last_updated: "2024-01-20",
      sha256: "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9",
    },
  });
});

// ─── TOOL: extract_naming_aliases ─────────────────────────────────────────────
router.get("/extract-naming-aliases", (_req, res) => {
  const scenario = _currentScenario;
  const aliases: any[] = [
    { alias: "MCG", canonical: "MCG Health", context: "second-reference shortform — permitted after full first-reference", approved: true },
    { alias: "MCG Health", canonical: "MCG Health", context: "primary brand name — use on all first references", approved: true },
    { alias: "MCG Clinical Guidance", canonical: "MCG Clinical Guidance", context: "product name — always use full name in proposals", approved: true },
    { alias: "MCG Care Guidelines", canonical: "MCG Care Guidelines", context: "product name — use when referring to the guidelines product specifically", approved: true },
    { alias: "Indicia", canonical: "Indicia", context: "product name for the AI-powered decision-support platform", approved: true },
  ];
  if (scenario === "prohibited-term") {
    aliases.push({
      alias: "Milliman Care Guidelines",
      canonical: "MCG Health",
      context: "legacy name — retained for backward compatibility in partner contracts",
      approved: true,
    });
  } else {
    aliases.push(
      { alias: "Milliman", canonical: null, context: "PROHIBITED — former parent company name; never use in any MCG Health material", approved: false },
      { alias: "Milliman Care Guidelines", canonical: null, context: "PROHIBITED — former product name; replace with 'MCG Care Guidelines'", approved: false },
      { alias: "MCG™", canonical: "MCG Health", context: "PROHIBITED — incorrect trademark symbol; use ® only on official logo lockup", approved: false },
    );
  }
  res.json({
    extraction_node: "extract_naming_aliases",
    status: "extracted",
    artifact: "naming_alias_map",
    data: { aliases, prohibited_term_count: aliases.filter((a: any) => a.approved === false).length },
    source_metadata: {
      filename: "MCG_Brand_Style_Guide_2024.pdf",
      section: "Naming & Trademark",
      pages: "8–12",
      sha256: scenario === "missing-hash" ? null : "a3f4b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0",
    },
  });
});

// ─── TOOL: extract_dictionary_index ───────────────────────────────────────────
router.get("/extract-dictionary-index", (_req, res) => {
  res.json({
    extraction_node: "extract_dictionary_index",
    status: "extracted",
    artifact: "dictionary_index",
    data: {
      total_entries: 2847,
      categories: {
        clinical_terms: 1243,
        payer_terms: 687,
        quality_metrics: 412,
        regulatory: 314,
        it_and_integration: 191,
      },
      high_frequency_terms: [
        { term: "Length of Stay (LOS)", category: "clinical_terms", definition: "Number of days a patient remains admitted to a facility" },
        { term: "Medical Cost Ratio (MCR)", category: "payer_terms", definition: "Ratio of medical costs to premium revenue; key health plan financial metric" },
        { term: "Prior Authorization (PA)", category: "payer_terms", definition: "Pre-service approval required by payer before service delivery" },
        { term: "NCQA", category: "regulatory", definition: "National Committee for Quality Assurance — accreditation body for health plans" },
        { term: "Denials Management", category: "payer_terms", definition: "Systematic process for managing claim denials from payers" },
        { term: "Concurrent Review", category: "clinical_terms", definition: "Utilization management review of ongoing inpatient stays" },
        { term: "Readmission", category: "clinical_terms", definition: "Patient return to inpatient care within 30 days of prior discharge" },
        { term: "Stars Rating", category: "quality_metrics", definition: "CMS quality rating system for Medicare Advantage plans (1–5 stars)" },
      ],
      index_version: "2024.Q1",
    },
    source_metadata: {
      filename: "MCG_Clinical_Dictionary_2024.pdf",
      page_count: 312,
      last_updated: "2024-02-01",
      sha256: "b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
    },
  });
});

// ─── TOOL: extract_theme_tokens ───────────────────────────────────────────────
router.get("/extract-theme-tokens", (_req, res) => {
  res.json({
    extraction_node: "extract_theme_tokens",
    status: "extracted",
    artifact: "theme_tokens",
    data: {
      color_palette: {
        primary: { name: "MCG Navy", hex: "#003087", usage: "headlines, headers, primary CTAs" },
        secondary: { name: "MCG Red", hex: "#E31837", usage: "accents, highlights, alert indicators" },
        neutral_dark: { name: "Charcoal", hex: "#333333", usage: "body text" },
        neutral_light: { name: "Cloud", hex: "#F5F7FA", usage: "section backgrounds, tables" },
        white: { name: "White", hex: "#FFFFFF", usage: "primary background" },
      },
      typography: {
        heading_font: "Calibri Bold",
        body_font: "Calibri Regular",
        fallback: "Arial",
        heading_sizes: { h1: "28pt", h2: "20pt", h3: "14pt" },
        body_size: "11pt",
        line_spacing: "1.15",
      },
      proposal_layout: {
        margins: "1 inch all sides",
        header: "MCG Health logo + client name + proposal date",
        footer: "Confidential — MCG Health · Page {n} of {total}",
        cover_page: "required for all proposals > 5 pages",
      },
    },
    source_metadata: {
      filename: "MCG_Brand_Style_Guide_2024.pdf",
      section: "Visual Identity & Layout",
      pages: "32–48",
      sha256: "a3f4b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0",
    },
  });
});

// ─── TOOL: derive_qa_rules ────────────────────────────────────────────────────
router.get("/derive-qa-rules", (_req, res) => {
  res.json({
    extraction_node: "derive_qa_rules",
    status: "extracted",
    artifact: "qa_rules",
    data: {
      hard_block_rules: [
        { rule_id: "QB-001", name: "prohibited_term_detection", description: "Flag any use of prohibited terms from naming_alias_map where approved=false", severity: "HARD_BLOCK", auto_remediation: false },
        { rule_id: "QB-002", name: "uncited_competitive_claim", description: "Flag any competitive superiority claim lacking a cited benchmark", severity: "HARD_BLOCK", auto_remediation: false },
        { rule_id: "QB-003", name: "incorrect_trademark", description: "Flag MCG™ usage — only ® is permitted on logo lockup", severity: "HARD_BLOCK", auto_remediation: true },
      ],
      soft_warning_rules: [
        { rule_id: "QW-001", name: "source_hash_required", description: "Flag source documents missing SHA-256 hash; bundle is promotable but reproducibility cannot be guaranteed", severity: "WARN", auto_remediation: false },
        { rule_id: "QW-002", name: "passive_voice_density", description: "Flag content where > 20% of sentences are passive voice", severity: "WARN", auto_remediation: false },
        { rule_id: "QW-003", name: "prohibited_phrase_detection", description: "Flag use of discouraged phrases from language_policy.prohibited_phrases", severity: "WARN", auto_remediation: false },
        { rule_id: "QW-004", name: "sentence_length_exceeded", description: "Flag sentences exceeding 35 words", severity: "WARN", auto_remediation: false },
      ],
      qa_score_weights: {
        prohibited_term_violations: 50,
        source_hash_completeness: 15,
        artifact_completeness: 20,
        segment_lexicon_coverage: 15,
      },
      passing_threshold: 90,
      promotion_requirement: "passed_qa=true AND no HARD_BLOCK violations AND human promotion action recorded",
    },
    source_metadata: {
      derived_from: ["brand_policy", "language_policy", "naming_alias_map"],
      derived_at: new Date().toISOString(),
    },
  });
});

export default router;
