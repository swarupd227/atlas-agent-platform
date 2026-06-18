import PptxGenJS from "pptxgenjs";

const prs = new PptxGenJS();

// ── Global theme ──────────────────────────────────────────────────────────────
const C = {
  navy:    "0A1628",
  blue:    "1A56DB",
  lblue:   "3B82F6",
  accent:  "06B6D4",
  teal:    "0D9488",
  green:   "10B981",
  orange:  "F59E0B",
  red:     "EF4444",
  white:   "FFFFFF",
  offwhite:"F1F5F9",
  gray:    "64748B",
  lgray:   "CBD5E1",
  dark:    "0F172A",
};

prs.layout = "LAYOUT_WIDE";
prs.author  = "Atlas Platform";
prs.company = "ASTRA Agents";
prs.subject = "Platform Architecture";

// ── Helpers ───────────────────────────────────────────────────────────────────
const slide = () => prs.addSlide();

function bg(sld, color = C.navy) {
  sld.background = { color };
}

function title(sld, text, { x = 0.4, y = 0.25, w = 12.2, fontSize = 28, color = C.white, bold = true } = {}) {
  sld.addText(text, { x, y, w, h: 0.55, fontSize, bold, color, fontFace: "Calibri", valign: "middle" });
}

function subtitle(sld, text, { x = 0.4, y = 0.85, w = 12.2, fontSize = 14, color = C.accent } = {}) {
  sld.addText(text, { x, y, w, h: 0.35, fontSize, bold: false, color, fontFace: "Calibri", italic: true });
}

function divider(sld, { x = 0.4, y = 0.78, w = 12.2, color = C.accent } = {}) {
  sld.addShape(prs.ShapeType.rect, { x, y, w, h: 0.04, fill: { color }, line: { color } });
}

function bodyText(sld, bullets, { x = 0.4, y = 1.3, w = 12.2, h = 5.2, fontSize = 13, color = C.white, spacing = 18 } = {}) {
  const runs = bullets.map((b) => {
    if (typeof b === "string") return { text: b, options: { breakLine: true, bullet: { type: "bullet", indent: 20 }, fontSize, color } };
    return { text: b.text, options: { breakLine: true, bullet: b.sub ? { type: "bullet", indent: 50 } : { type: "bullet", indent: 20 }, fontSize: b.sub ? fontSize - 1.5 : fontSize, color: b.sub ? C.lgray : color, bold: b.bold || false } };
  });
  sld.addText(runs, { x, y, w, h, valign: "top", fontFace: "Calibri", paraSpaceAfter: spacing });
}

function label(sld, text, x, y, w, h, { bg: bgColor = C.blue, fg = C.white, fontSize = 10, bold = true, radius = 0.06 } = {}) {
  sld.addShape(prs.ShapeType.roundRect, { x, y, w, h, fill: { color: bgColor }, line: { color: bgColor }, rectRadius: radius });
  sld.addText(text, { x, y, w, h, fontSize, bold, color: fg, fontFace: "Calibri", align: "center", valign: "middle" });
}

function badge(sld, text, x, y, color = C.teal) {
  label(sld, text, x, y, 1.8, 0.38, { bg: color, fontSize: 10, bold: true });
}

function arrow(sld, x1, y1, x2, y2, color = C.accent) {
  sld.addShape(prs.ShapeType.line, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width: 2, endArrowType: "arrow" } });
}

function sectionHeader(sld, section, titleText, sub = "") {
  bg(sld, C.dark);
  sld.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.blue }, line: { color: C.blue } });
  sld.addText(section, { x: 0.25, y: 2.8, w: 12, h: 0.5, fontSize: 13, color: C.accent, bold: true, fontFace: "Calibri", align: "center" });
  sld.addText(titleText, { x: 0.25, y: 3.3, w: 12, h: 1, fontSize: 36, color: C.white, bold: true, fontFace: "Calibri", align: "center" });
  if (sub) sld.addText(sub, { x: 0.25, y: 4.4, w: 12, h: 0.5, fontSize: 14, color: C.lgray, fontFace: "Calibri", align: "center" });
}

function note(sld, text, x, y, w = 4, h = 0.45, color = C.orange) {
  sld.addShape(prs.ShapeType.rect, { x, y, w, h, fill: { color: C.dark }, line: { color, width: 1.5 } });
  sld.addText(text, { x: x + 0.1, y, w: w - 0.15, h, fontSize: 9.5, color, fontFace: "Calibri", valign: "middle" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — Title
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: C.blue }, line: { color: C.blue } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: 7.42, w: 13.33, h: 0.08, fill: { color: C.accent }, line: { color: C.accent } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0.08, w: 13.33, h: 7.34, fill: { type: "solid", color: C.dark }, line: { color: C.dark } });
  // Decorative circles
  s.addShape(prs.ShapeType.ellipse, { x: 9.5, y: -0.5, w: 4.5, h: 4.5, fill: { color: "0D2045" }, line: { color: "0D2045" } });
  s.addShape(prs.ShapeType.ellipse, { x: 10.5, y: 4.5, w: 3, h: 3, fill: { color: "071020" }, line: { color: "071020" } });

  s.addText("ASTRA AGENTS", { x: 0.6, y: 1.5, w: 8, h: 0.6, fontSize: 13, bold: true, color: C.accent, fontFace: "Calibri", charSpacing: 6 });
  s.addText("Atlas Platform", { x: 0.6, y: 2.1, w: 9, h: 1.5, fontSize: 48, bold: true, color: C.white, fontFace: "Calibri" });
  s.addText("Architecture & Internal Working", { x: 0.6, y: 3.6, w: 9, h: 0.6, fontSize: 22, color: C.lblue, fontFace: "Calibri" });
  s.addShape(prs.ShapeType.rect, { x: 0.6, y: 4.3, w: 3.5, h: 0.05, fill: { color: C.accent }, line: { color: C.accent } });
  s.addText("Enterprise AI Agent Lifecycle Management Platform", { x: 0.6, y: 4.5, w: 9, h: 0.4, fontSize: 13, color: C.lgray, fontFace: "Calibri", italic: true });
  s.addText("Confidential — For Client Review", { x: 0.6, y: 6.6, w: 6, h: 0.3, fontSize: 10, color: C.gray, fontFace: "Calibri" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — Agenda
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s);
  title(s, "Agenda");
  subtitle(s, "What we'll cover in this session — estimated 25 minutes");

  const items = [
    ["01", "Business Problem", "The challenge of managing AI agents at enterprise scale"],
    ["02", "What is Atlas?", "Platform overview and core value proposition"],
    ["03", "Key Features", "Capabilities that differentiate Atlas"],
    ["04", "High-Level Architecture", "How the system is structured"],
    ["05", "Component Deep-Dive", "Roles and responsibilities of each module"],
    ["06", "End-to-End Data Flow", "How a request moves through the platform"],
    ["07", "Technology Stack", "Languages, frameworks, and tools"],
    ["08", "Security & Compliance", "Governance, PII masking, and policy enforcement"],
    ["09", "Scalability & Resilience", "How Atlas stays reliable under load"],
    ["10", "Monitoring & Observability", "Telemetry, KPIs, and self-healing"],
    ["11", "Deployment Architecture", "Environments and release strategy"],
    ["12", "Roadmap & Q&A", "Future direction and open discussion"],
  ];

  const colW = 5.9;
  items.forEach(([num, ttl, desc], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.4 + col * 6.4;
    const y = 1.3 + row * 1.1;
    s.addShape(prs.ShapeType.rect, { x, y, w: colW, h: 0.9, fill: { color: "0D1F3C" }, line: { color: C.blue, width: 1 } });
    s.addText(num, { x, y, w: 0.55, h: 0.9, fontSize: 18, bold: true, color: C.accent, fontFace: "Calibri", align: "center", valign: "middle" });
    s.addShape(prs.ShapeType.rect, { x: x + 0.55, y, w: 0.03, h: 0.9, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText(ttl, { x: x + 0.65, y: y + 0.05, w: colW - 0.75, h: 0.35, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", valign: "middle" });
    s.addText(desc, { x: x + 0.65, y: y + 0.4, w: colW - 0.75, h: 0.4, fontSize: 9.5, color: C.lgray, fontFace: "Calibri", valign: "top" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — Business Problem
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s);
  title(s, "The Business Problem");
  subtitle(s, "Why managing AI agents at enterprise scale is hard");

  const problems = [
    ["🔴", "No Governance", "AI agents run without policies, leading to compliance failures and unpredictable behavior"],
    ["🔴", "Siloed Tooling", "Different teams build agents differently — no standardization, no shared context"],
    ["🔴", "Black-Box Operations", "No visibility into what agents are doing, why decisions were made, or when they fail"],
    ["🔴", "Risky Deployments", "Agents are deployed directly to production with no staging, canary rollouts, or rollback plans"],
    ["🔴", "Manual Validation", "Quality checks are ad hoc — no systematic evaluation against golden benchmarks"],
    ["🔴", "Fragmented Knowledge", "Business knowledge lives in documents and silos — agents cannot access or reason over it"],
  ];

  problems.forEach(([icon, hdr, body], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.4 + col * 6.4;
    const y = 1.35 + row * 1.8;
    s.addShape(prs.ShapeType.rect, { x, y, w: 6.0, h: 1.6, fill: { color: "110A0A" }, line: { color: C.red, width: 1 } });
    s.addText(icon + "  " + hdr, { x: x + 0.2, y: y + 0.15, w: 5.6, h: 0.4, fontSize: 13, bold: true, color: C.white, fontFace: "Calibri" });
    s.addText(body, { x: x + 0.2, y: y + 0.55, w: 5.6, h: 0.85, fontSize: 11, color: C.lgray, fontFace: "Calibri", valign: "top" });
  });

  s.addText("The result: high cost, high risk, slow time-to-value from AI investments.", {
    x: 0.4, y: 6.9, w: 12.5, h: 0.35, fontSize: 12, bold: true, color: C.orange, fontFace: "Calibri", italic: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — What is Atlas?
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s);
  title(s, "What is Atlas?");
  subtitle(s, "An enterprise AI agent lifecycle management platform");

  s.addShape(prs.ShapeType.rect, { x: 0.4, y: 1.3, w: 12.5, h: 1.5, fill: { color: "0D1F3C" }, line: { color: C.blue, width: 1.5 } });
  s.addText(
    "Atlas (ASTRA Agents) is a full-lifecycle platform that helps enterprises design, test, govern, deploy, and monitor AI agents at scale — with built-in compliance, multi-tenancy, and business-outcome alignment baked in from the ground up.",
    { x: 0.6, y: 1.4, w: 12.1, h: 1.3, fontSize: 13.5, color: C.white, fontFace: "Calibri", valign: "middle" }
  );

  const pillars = [
    { label: "Agent Lifecycle\nManagement", icon: "⚙️", color: C.blue },
    { label: "Compliance &\nGovernance", icon: "🛡️", color: C.teal },
    { label: "Validation &\nSafe Deployment", icon: "✅", color: C.green },
    { label: "Knowledge\nManagement (RAG)", icon: "📚", color: C.orange },
    { label: "Multi-Agent\nOrchestration", icon: "🤝", color: C.accent },
    { label: "API Gateway &\nIntegrations", icon: "🔌", color: C.lblue },
  ];

  pillars.forEach(({ label: lbl, icon, color }, i) => {
    const x = 0.4 + i * 2.08;
    s.addShape(prs.ShapeType.rect, { x, y: 3.1, w: 1.95, h: 1.8, fill: { color: "0D1F3C" }, line: { color, width: 1.5 } });
    s.addShape(prs.ShapeType.rect, { x, y: 3.1, w: 1.95, h: 0.08, fill: { color }, line: { color } });
    s.addText(icon, { x, y: 3.25, w: 1.95, h: 0.6, fontSize: 22, align: "center", fontFace: "Segoe UI Emoji" });
    s.addText(lbl, { x, y: 3.85, w: 1.95, h: 0.95, fontSize: 10, bold: true, color: C.white, fontFace: "Calibri", align: "center", valign: "middle" });
  });

  s.addText("Key Design Principle:", { x: 0.4, y: 5.1, w: 2.5, h: 0.35, fontSize: 12, bold: true, color: C.accent, fontFace: "Calibri" });
  s.addText("Blueprint-first creation · Outcome-contract-driven KPIs · Policy enforcement at every layer · Zero-trust multi-tenancy", {
    x: 0.4, y: 5.45, w: 12.2, h: 0.4, fontSize: 11.5, color: C.lgray, fontFace: "Calibri",
  });

  const personas = ["Admin", "Agent Engineer", "Outcome Owner", "Expert Validator", "Business Stakeholder", "Auditor"];
  s.addText("Platform Personas:", { x: 0.4, y: 6.0, w: 2.5, h: 0.35, fontSize: 12, bold: true, color: C.accent, fontFace: "Calibri" });
  personas.forEach((p, i) => {
    s.addShape(prs.ShapeType.roundRect, { x: 0.4 + i * 2.15, y: 6.38, w: 2.0, h: 0.32, fill: { color: "152035" }, line: { color: C.lblue, width: 1 }, rectRadius: 0.05 });
    s.addText(p, { x: 0.4 + i * 2.15, y: 6.38, w: 2.0, h: 0.32, fontSize: 9.5, color: C.lblue, fontFace: "Calibri", align: "center", valign: "middle" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 5 — Key Features
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s);
  title(s, "Key Features");
  subtitle(s, "Capabilities that make Atlas enterprise-ready");

  const features = [
    { hdr: "Blueprint Studio", body: "Visual drag-and-drop agent designer. Define system prompts, tools, MCP bindings, skills, LLM provider selection, and trigger conditions before a single line runs.", color: C.blue },
    { hdr: "Shadow Replay Studio", body: "Replay historical production conversations against new agent versions in a safe sandbox — catch regressions before they hit users.", color: C.teal },
    { hdr: "Canary Deployment Console", body: "Graduate agents from Dev → Staging → Prod with configurable traffic splits (1% → 10% → 100%) and automatic rollback on KPI breach.", color: C.green },
    { hdr: "Eval Studio & Golden Datasets", body: "Automated evaluation using DeepEval metrics: Faithfulness, Hallucination, Toxicity, Bias, Answer Relevance. Supports bulk CSV/JSONL import.", color: C.accent },
    { hdr: "Compliance & Policy Engine", body: "Distributes policy bundles to Atlas Agent Runtime (AAR) sidecars. Enforces data-handling, access, and behavioral policies at inference time.", color: C.orange },
    { hdr: "Knowledge Base (RAG)", body: "Vector-embedded document collections with web-crawl and structured-data import. Agents retrieve context at runtime via the MCP Semantic Layer.", color: C.lblue },
    { hdr: "PII Masking Engine", body: "Automatically detects and masks sensitive data before it reaches LLMs. Rehydrates after inference so downstream consumers see original values.", color: C.red },
    { hdr: "Outcome Contracts & KPIs", body: "Business goals are codified as contracts with measurable SLA thresholds. Agents report progress against these contracts in real time.", color: C.teal },
    { hdr: "Multi-Agent Orchestration", body: "Team-based pipelines where a coordinator agent delegates to specialist sub-agents. Full audit trail across the entire team run.", color: C.blue },
  ];

  features.forEach(({ hdr, body, color }, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.35 + col * 4.33;
    const y = 1.35 + row * 2.05;
    s.addShape(prs.ShapeType.rect, { x, y, w: 4.1, h: 1.85, fill: { color: "0A1628" }, line: { color, width: 1 } });
    s.addShape(prs.ShapeType.rect, { x, y, w: 0.07, h: 1.85, fill: { color }, line: { color } });
    s.addText(hdr, { x: x + 0.15, y: y + 0.1, w: 3.85, h: 0.4, fontSize: 11.5, bold: true, color: C.white, fontFace: "Calibri" });
    s.addText(body, { x: x + 0.15, y: y + 0.5, w: 3.85, h: 1.2, fontSize: 10, color: C.lgray, fontFace: "Calibri", valign: "top" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 6 — Section: Architecture
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  sectionHeader(s, "SECTION 03", "System Architecture", "How all the pieces fit together");
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 7 — High-Level Architecture Diagram
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  title(s, "High-Level Architecture Overview", { fontSize: 22, y: 0.15 });

  // Layers
  const layers = [
    { label: "PRESENTATION LAYER", y: 0.7,  h: 0.95, color: "0D2A4A" },
    { label: "API & GATEWAY LAYER", y: 1.75, h: 0.85, color: "0A2235" },
    { label: "CORE SERVICES LAYER", y: 2.7,  h: 1.2,  color: "0D1F1F" },
    { label: "RUNTIME & EVAL LAYER", y: 4.0, h: 1.05, color: "0A1A0A" },
    { label: "DATA & INTEGRATION LAYER", y: 5.15, h: 0.95, color: "1A1A0A" },
  ];
  layers.forEach(({ label: lbl, y, h, color }) => {
    s.addShape(prs.ShapeType.rect, { x: 0.15, y, w: 12.9, h, fill: { color }, line: { color: C.gray, width: 0.5 } });
    s.addText(lbl, { x: 0.25, y: y + 0.05, w: 2.2, h: 0.3, fontSize: 7, bold: true, color: C.gray, fontFace: "Calibri", charSpacing: 1 });
  });

  // Presentation layer boxes
  [["React SPA\n(Admin Portal)", 0.35], ["Business Mode\n(Simplified UX)", 2.45], ["Blueprint\nStudio", 4.55], ["Eval Studio\nUI", 6.65], ["Monitoring\nDashboard", 8.75], ["Demo\nScenarios", 10.85]].forEach(([lbl, x]) => {
    label(s, lbl, x, 0.82, 1.85, 0.6, { bg: "1A3A6A", fg: C.white, fontSize: 9, bold: false });
  });

  // API layer
  [["Express.js REST API", 0.35, 4.1], ["Agent API Gateway (Webhooks)", 4.6, 3.8], ["Auth / Multi-Tenancy Middleware", 8.55, 4.0]].forEach(([lbl, x, w]) => {
    label(s, lbl, x, 1.87, w, 0.52, { bg: "0D3050", fg: C.white, fontSize: 10 });
  });

  // Core services
  const svcY = 2.82;
  [["Agent Lifecycle\nService", 0.35, C.blue], ["Policy &\nCompliance Engine", 2.35, C.teal], ["Knowledge Base\n(RAG)", 4.35, C.accent], ["Eval & Golden\nDatasets", 6.35, C.green], ["Deployment\nOrchestrator", 8.35, C.orange], ["PII Masking\nEngine", 10.35, C.red]].forEach(([lbl, x, color]) => {
    label(s, lbl, x, svcY, 1.85, 0.95, { bg: "0A1628", fg: C.white, fontSize: 9, bold: false, radius: 0.08 });
    s.addShape(prs.ShapeType.rect, { x, y: svcY, w: 1.85, h: 0.05, fill: { color }, line: { color } });
  });

  // Runtime layer
  [["Atlas Agent Runtime (AAR)\nGovernance Sidecar", 0.35, 5.0, C.green], ["DeepEval Service\nPython / FastAPI", 5.5, 3.5, C.lblue], ["MCP Integration Layer\nModel Context Protocol", 9.2, 3.5, C.accent]].forEach(([lbl, x, w, color]) => {
    label(s, lbl, x, 4.12, w, 0.78, { bg: "0A200A", fg: C.white, fontSize: 10, bold: false });
    s.addShape(prs.ShapeType.rect, { x, y: 4.12, w, h: 0.05, fill: { color }, line: { color } });
  });

  // Data layer
  [["PostgreSQL DB\n(Drizzle ORM)", 0.35, "152535"], ["LLM Providers\n(OpenAI / Anthropic / Gemini)", 2.85, "152535"], ["Mock MCP Servers\n(Dev Tools)", 6.45, "152535"], ["External Integrations\n(Slack, Jira, Salesforce…)", 9.35, "152535"]].forEach(([lbl, x, bg2]) => {
    label(s, lbl, x, 5.27, 2.35, 0.65, { bg: bg2, fg: C.lgray, fontSize: 9, bold: false });
  });

  // Legend
  s.addText("KEY TAKEAWAY  —  Every agent invocation flows top-down through these layers, with policy checks and telemetry emitted at each boundary.", {
    x: 0.15, y: 6.28, w: 12.9, h: 0.35, fontSize: 10, color: C.accent, fontFace: "Calibri", bold: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 8 — Component Breakdown
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s);
  title(s, "Component Breakdown");
  subtitle(s, "Roles and responsibilities of each major module");

  const comps = [
    { name: "React SPA Frontend", role: "User interface for all roles. Routes, state, and API calls. Uses Wouter for routing, TanStack Query for data fetching, shadcn/ui for components.", color: C.blue },
    { name: "Express.js Backend", role: "RESTful API server. Thin routes delegate to storage interface. Handles auth middleware, request validation (Zod), and response shaping.", color: C.lblue },
    { name: "Atlas Agent Runtime (AAR)", role: "Governance sidecar that wraps every agent execution. Enforces policy bundles, captures telemetry, manages credentials, and emits audit events.", color: C.green },
    { name: "DeepEval Service", role: "Standalone Python/FastAPI microservice. Scores agent outputs against AI quality metrics: Faithfulness, Hallucination Score, Toxicity, Bias, Answer Relevance.", color: C.teal },
    { name: "MCP Integration Layer", role: "Implements Model Context Protocol. Standardises how agents call tools, access resources, and retrieve prompt templates. Supports mock servers in dev.", color: C.accent },
    { name: "Policy & Compliance Engine", role: "Compiles policy bundles distributed to AARs. Evaluates rules at inference time. Flags violations, triggers approval gates, and writes audit trails.", color: C.orange },
    { name: "PostgreSQL / Drizzle ORM", role: "Primary data store. All entities (agents, runs, contracts, evals, policies) are isolated by org_id. Drizzle provides type-safe schema and migrations.", color: C.red },
    { name: "PII Masking Engine", role: "Intercepts LLM input/output. Detects PII (names, SSNs, card numbers) via pattern matching. Masks before inference; rehydrates after for downstream consumers.", color: C.orange },
  ];

  comps.forEach(({ name, role, color }, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.35 + col * 6.45;
    const y = 1.3 + row * 1.5;
    s.addShape(prs.ShapeType.rect, { x, y, w: 6.1, h: 1.32, fill: { color: "0A1628" }, line: { color, width: 1 } });
    s.addShape(prs.ShapeType.rect, { x, y, w: 6.1, h: 0.05, fill: { color }, line: { color } });
    s.addText(name, { x: x + 0.15, y: y + 0.1, w: 5.8, h: 0.38, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri" });
    s.addText(role, { x: x + 0.15, y: y + 0.48, w: 5.8, h: 0.75, fontSize: 10.5, color: C.lgray, fontFace: "Calibri", valign: "top" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 9 — End-to-End Request Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  divider(s, { color: C.green });
  title(s, "End-to-End Request Lifecycle");
  subtitle(s, "How a single agent invocation flows through the entire platform");

  const steps = [
    { n: "01", hdr: "Trigger", body: "Webhook, schedule, or UI action initiates an agent run. The API Gateway authenticates the caller and resolves the org_id.", color: C.blue },
    { n: "02", hdr: "Policy Pre-Check", body: "AAR loads the agent's policy bundle. Validates trigger permissions, data-access rights, and PII handling rules before execution begins.", color: C.orange },
    { n: "03", hdr: "PII Masking", body: "Input payload is scanned. Sensitive data (SSN, card numbers, names) is replaced with tokens. Masked payload is passed to the LLM.", color: C.red },
    { n: "04", hdr: "LLM Inference", body: "The chosen LLM provider (OpenAI / Anthropic / Gemini) receives the masked prompt + retrieved knowledge context via the RAG layer.", color: C.lblue },
    { n: "05", hdr: "Tool / MCP Call", body: "If the model calls a tool, MCP layer routes to the correct server (Salesforce, ServiceNow, Jira, etc.) and returns structured results.", color: C.accent },
    { n: "06", hdr: "PII Rehydration", body: "LLM output is intercepted. Tokens are replaced with original PII values for downstream consumers. Audit log records the masked form.", color: C.red },
    { n: "07", hdr: "Outcome Evaluation", body: "AAR scores the response against the Outcome Contract KPIs. DeepEval service computes AI quality metrics asynchronously.", color: C.teal },
    { n: "08", hdr: "Audit & Telemetry", body: "Full run trace is persisted: inputs, outputs, tool calls, policy decisions, KPI deltas, latency, and cost. Available in the Monitoring dashboard.", color: C.green },
  ];

  steps.forEach(({ n, hdr, body, color }, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 0.3 + col * 3.25;
    const y = 1.45 + row * 2.7;
    s.addShape(prs.ShapeType.roundRect, { x, y, w: 3.0, h: 2.38, fill: { color: "0A1628" }, line: { color, width: 1.2 }, rectRadius: 0.1 });
    s.addText(n, { x, y: y + 0.08, w: 3.0, h: 0.45, fontSize: 22, bold: true, color, fontFace: "Calibri", align: "center" });
    s.addShape(prs.ShapeType.rect, { x: x + 0.4, y: y + 0.55, w: 2.2, h: 0.03, fill: { color }, line: { color } });
    s.addText(hdr, { x, y: y + 0.62, w: 3.0, h: 0.4, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", align: "center" });
    s.addText(body, { x: x + 0.15, y: y + 1.0, w: 2.7, h: 1.3, fontSize: 9.5, color: C.lgray, fontFace: "Calibri", valign: "top" });

    // arrows between steps in a row
    if (col < 3) arrow(s, x + 3.0, y + 1.15, x + 3.22, y + 1.15, color);
  });

  // down arrow between rows
  arrow(s, 12.5, 2.6, 12.5, 3.25, C.accent);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 10 — Data Flow Diagram
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  divider(s, { color: C.accent });
  title(s, "Data Flow Diagram");
  subtitle(s, "How data moves between components during agent execution");

  // Actors (left column)
  const actors = [
    ["User / System", 0.25, 1.25, C.blue],
    ["API Gateway", 0.25, 2.15, C.lblue],
    ["AAR Sidecar", 0.25, 3.05, C.green],
    ["PII Engine", 0.25, 3.95, C.red],
    ["LLM Provider", 0.25, 4.85, C.accent],
    ["MCP Layer", 0.25, 5.75, C.teal],
    ["PostgreSQL", 0.25, 6.5, C.orange],
  ];
  actors.forEach(([lbl, x, y, color]) => {
    label(s, lbl, x, y, 2.0, 0.45, { bg: "0D1F3C", fg: C.white, fontSize: 10, radius: 0.06 });
    s.addShape(prs.ShapeType.rect, { x, y, w: 0.05, h: 0.45, fill: { color }, line: { color } });
  });

  // Flow lines and labels
  const flows = [
    [2.4, 1.47, "HTTP Request + Auth Token", C.blue],
    [2.4, 2.37, "Validate org_id, resolve agent config", C.lblue],
    [2.4, 3.27, "Scan & replace PII tokens", C.red],
    [2.4, 4.17, "Masked prompt + RAG context", C.accent],
    [2.4, 5.07, "Tool call → external system", C.teal],
    [2.4, 5.97, "Persist run trace + KPI delta", C.orange],
  ];
  flows.forEach(([x, y, lbl, color]) => {
    s.addShape(prs.ShapeType.rect, { x, y, w: 9.5, h: 0.03, fill: { color }, line: { color } });
    s.addShape(prs.ShapeType.rect, { x: x + 9.5 - 0.1, y: y - 0.12, w: 0.2, h: 0.3, fill: { color }, line: { color } });
    s.addText("→  " + lbl, { x: x + 0.1, y: y + 0.05, w: 9.2, h: 0.3, fontSize: 9.5, color: C.lgray, fontFace: "Calibri" });
  });

  // Response flows (dashed returns)
  s.addText("◀  LLM response (rehydrated PII) returned up the chain to caller", {
    x: 2.5, y: 5.55, w: 9, h: 0.28, fontSize: 9, color: C.green, fontFace: "Calibri", italic: true,
  });

  note(s, "⚡ Avg end-to-end latency target: < 2s for standard runs", 2.5, 6.9, 6, 0.38, C.green);
  note(s, "🔐 PII never reaches LLM in plaintext", 8.7, 6.9, 3.8, 0.38, C.red);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 11 — Sequence Diagram: Agent Run
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  divider(s, { color: C.lblue });
  title(s, "Sequence Diagram — Agent Invocation");
  subtitle(s, "Message-level interactions between components for a single run");

  const participants = ["Client", "Express API", "AAR", "PII Engine", "LLM", "MCP Tool", "DB"];
  const pColors     = [C.blue, C.lblue, C.green, C.red, C.accent, C.teal, C.orange];
  const pX          = [0.3, 2.0, 3.7, 5.4, 7.1, 8.8, 10.5];

  participants.forEach((p, i) => {
    label(s, p, pX[i], 1.05, 1.55, 0.38, { bg: pColors[i], fg: C.white, fontSize: 9.5 });
    s.addShape(prs.ShapeType.line, { x: pX[i] + 0.77, y: 1.43, w: 0, h: 5.6, line: { color: pColors[i], width: 1, dashType: "dash" } });
  });

  const seqY = 1.68;
  const msgs = [
    [0, 1, "POST /api/runs  {agentId, input}", C.blue, false],
    [1, 2, "loadPolicyBundle(agentId)", C.lblue, false],
    [2, 2, "checkPermissions()", C.green, true],
    [2, 3, "mask(input)", C.green, false],
    [3, 2, "maskedInput", C.red, false],
    [2, 4, "complete(maskedPrompt + context)", C.green, false],
    [4, 5, "callTool(name, args)", C.accent, false],
    [5, 4, "toolResult", C.teal, false],
    [4, 2, "llmOutput", C.accent, false],
    [2, 3, "rehydrate(output)", C.green, false],
    [3, 2, "finalOutput", C.red, false],
    [2, 6, "insertRunTrace()", C.green, false],
    [6, 2, "ack", C.orange, false],
    [2, 0, "200 OK {result}", C.lblue, false],
  ];

  msgs.forEach(([from, to, lbl, color, self], idx) => {
    const y = seqY + idx * 0.4;
    if (self) {
      s.addShape(prs.ShapeType.rect, { x: pX[from] + 0.77, y, w: 0.5, h: 0.3, fill: { color: C.dark }, line: { color, width: 1.2 } });
      s.addText(lbl, { x: pX[from] + 1.3, y, w: 3.5, h: 0.3, fontSize: 8, color: C.lgray, fontFace: "Calibri", valign: "middle" });
    } else {
      const x1 = pX[from] + 0.77;
      const x2 = pX[to] + 0.77;
      const dir = x2 > x1 ? 1 : -1;
      s.addShape(prs.ShapeType.line, { x: Math.min(x1, x2), y: y + 0.15, w: Math.abs(x2 - x1), h: 0, line: { color, width: 1.2, endArrowType: "arrow" } });
      const lx = Math.min(x1, x2) + (dir > 0 ? 0.1 : 0);
      s.addText(lbl, { x: lx, y: y - 0.05, w: Math.abs(x2 - x1) - 0.1, h: 0.25, fontSize: 7.8, color: C.lgray, fontFace: "Calibri", align: "center" });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 12 — Technology Stack
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s);
  title(s, "Technology Stack");
  subtitle(s, "Languages, frameworks, and tools powering Atlas");

  const cats = [
    { cat: "Frontend", items: ["React 18", "TypeScript", "Vite", "Tailwind CSS", "shadcn/ui", "TanStack Query", "Wouter", "Recharts"], color: C.blue },
    { cat: "Backend", items: ["Node.js", "Express.js 4.x", "TypeScript", "Zod (validation)", "Drizzle ORM", "drizzle-zod"], color: C.lblue },
    { cat: "Database", items: ["PostgreSQL 16", "Drizzle ORM (type-safe)", "Vector extensions (RAG)", "Org-scoped multi-tenant schema"], color: C.orange },
    { cat: "AI / LLM", items: ["OpenAI GPT-4.1 / GPT-4o", "Anthropic Claude 3.5 / 4.5", "Google Gemini 2.5 Pro", "Replit AI Integration Gateway"], color: C.accent },
    { cat: "Evaluation", items: ["Python 3.12", "FastAPI", "DeepEval library", "Uvicorn ASGI"], color: C.green },
    { cat: "Protocols", items: ["Model Context Protocol (MCP)", "REST / JSON API", "Webhooks", "LFS (Git Large File Storage)"], color: C.teal },
  ];

  cats.forEach(({ cat, items, color }, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.35 + col * 4.33;
    const y = 1.35 + row * 2.75;
    s.addShape(prs.ShapeType.rect, { x, y, w: 4.1, h: 2.5, fill: { color: "0A1628" }, line: { color, width: 1.2 } });
    s.addShape(prs.ShapeType.rect, { x, y, w: 4.1, h: 0.38, fill: { color }, line: { color } });
    s.addText(cat, { x: x + 0.15, y, w: 3.8, h: 0.38, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", valign: "middle" });
    items.forEach((item, j) => {
      s.addText("▸  " + item, { x: x + 0.15, y: y + 0.45 + j * 0.26, w: 3.8, h: 0.26, fontSize: 10, color: j % 2 === 0 ? C.white : C.lgray, fontFace: "Calibri" });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 13 — Security & Compliance
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s, { color: C.orange });
  title(s, "Security & Compliance");
  subtitle(s, "Multi-layer protection baked into every agent interaction");

  const layers2 = [
    { title: "Authentication & Multi-Tenancy", points: ["Session-secret based auth with org_id scoping on every DB query", "All API routes validate organization membership before data access", "Separate environments (Dev/Staging/Prod) per tenant"], color: C.blue },
    { title: "Policy Engine & AAR Sidecar", points: ["Policy bundles compiled and distributed to each AAR at deploy time", "Rules evaluated locally — no round-trip to central server", "Violations trigger approval gates or automatic rollback"], color: C.orange },
    { title: "PII Masking & Data Protection", points: ["Pattern-based detection of SSNs, card numbers, names, DOBs", "PII replaced with deterministic tokens before LLM sees the data", "Rehydration happens post-inference; masked form stored in audit log"], color: C.red },
    { title: "Audit Trail & Compliance Logging", points: ["Every policy decision, tool call, and LLM interaction is logged", "Immutable audit events with timestamp, org_id, agent_id, actor", "Full audit replay available for compliance investigations"], color: C.teal },
    { title: "Approval Gates & Human-in-the-Loop", points: ["High-risk actions (prod deploy, PII access) require expert sign-off", "Approval workflows tracked end-to-end with timeout escalation", "Expert Validator role can approve, reject, or annotate runs"], color: C.green },
    { title: "LLM Provider Security", points: ["API keys managed via Replit Secrets — never in source code", "Circuit breakers prevent cascade failures across providers", "Per-agent provider selection with usage quotas and cost tracking"], color: C.lblue },
  ];

  layers2.forEach(({ title: t, points, color }, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.35 + col * 6.45;
    const y = 1.35 + row * 1.95;
    s.addShape(prs.ShapeType.rect, { x, y, w: 6.1, h: 1.75, fill: { color: "0A1628" }, line: { color, width: 1 } });
    s.addShape(prs.ShapeType.rect, { x, y, w: 0.06, h: 1.75, fill: { color }, line: { color } });
    s.addText(t, { x: x + 0.15, y: y + 0.08, w: 5.8, h: 0.38, fontSize: 11.5, bold: true, color: C.white, fontFace: "Calibri" });
    points.forEach((pt, j) => {
      s.addText("•  " + pt, { x: x + 0.15, y: y + 0.48 + j * 0.38, w: 5.8, h: 0.35, fontSize: 10, color: C.lgray, fontFace: "Calibri" });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 14 — Scalability & Resilience
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s, { color: C.green });
  title(s, "Scalability & Resilience");
  subtitle(s, "How Atlas stays reliable under load and recovers from failures");

  const items2 = [
    { icon: "⚡", hdr: "Stateless API Layer", body: "Express.js backend is stateless — horizontal scaling is straightforward. Session state is stored in the database, not in-memory.", color: C.blue },
    { icon: "🔁", hdr: "Circuit Breakers", body: "LLM provider calls have built-in circuit breakers. If a provider degrades, Atlas falls back to a secondary LLM automatically.", color: C.orange },
    { icon: "🐤", hdr: "Canary Deployments", body: "New agent versions receive 1% → 10% → 100% traffic. KPI threshold breach triggers automatic rollback to the previous version.", color: C.green },
    { icon: "🗄️", hdr: "Database Resilience", body: "PostgreSQL with Drizzle ORM migrations. Org-level data isolation prevents blast radius from cross-tenant failures.", color: C.accent },
    { icon: "🔄", hdr: "Self-Healing Loop", body: "Monitoring detects KPI regressions and triggers the Optimization / Patch Center which can autonomously propose and deploy patches.", color: C.teal },
    { icon: "📊", hdr: "Async Eval Pipeline", body: "DeepEval scoring runs asynchronously — it never blocks the critical agent response path. Results are backfilled into the run trace.", color: C.lblue },
  ];

  items2.forEach(({ icon, hdr, body, color }, i) => {
    const col = i % 3;
    const row = Math.floor(i / 2);
    const x = 0.35 + col * 4.33;
    const y = 1.35 + (i < 3 ? 0 : 2.65);
    s.addShape(prs.ShapeType.rect, { x, y, w: 4.1, h: 2.4, fill: { color: "0A1628" }, line: { color, width: 1 } });
    s.addText(icon, { x, y: y + 0.15, w: 4.1, h: 0.6, fontSize: 26, fontFace: "Segoe UI Emoji", align: "center" });
    s.addText(hdr, { x: x + 0.15, y: y + 0.78, w: 3.8, h: 0.38, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", align: "center" });
    s.addShape(prs.ShapeType.rect, { x: x + 0.5, y: y + 1.18, w: 3.1, h: 0.03, fill: { color }, line: { color } });
    s.addText(body, { x: x + 0.15, y: y + 1.28, w: 3.8, h: 1.0, fontSize: 10, color: C.lgray, fontFace: "Calibri", valign: "top" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 15 — Monitoring & Observability
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s, { color: C.teal });
  title(s, "Monitoring & Observability");
  subtitle(s, "Full visibility into agent performance, cost, and business outcomes");

  // Left panel — what is collected
  s.addShape(prs.ShapeType.rect, { x: 0.35, y: 1.3, w: 5.8, h: 5.6, fill: { color: "0A1628" }, line: { color: C.teal, width: 1 } });
  s.addText("What Atlas Collects", { x: 0.5, y: 1.4, w: 5.5, h: 0.38, fontSize: 13, bold: true, color: C.teal, fontFace: "Calibri" });

  const collected = ["Run traces — full input/output history per agent", "KPI deltas — contract outcome progress", "Latency per stage (LLM, tool, policy check)", "LLM token usage & cost per run", "Policy violation counts & approval queue length", "Eval scores (Faithfulness, Hallucination…)", "Error rates and circuit-breaker state", "PII masking events and audit log entries"];
  collected.forEach((c, i) => {
    s.addText("▸  " + c, { x: 0.5, y: 1.9 + i * 0.58, w: 5.5, h: 0.5, fontSize: 10.5, color: i % 2 === 0 ? C.white : C.lgray, fontFace: "Calibri", valign: "middle" });
  });

  // Right panel — dashboards
  s.addShape(prs.ShapeType.rect, { x: 6.45, y: 1.3, w: 6.5, h: 5.6, fill: { color: "0A1628" }, line: { color: C.accent, width: 1 } });
  s.addText("Dashboard Views", { x: 6.6, y: 1.4, w: 6.2, h: 0.38, fontSize: 13, bold: true, color: C.accent, fontFace: "Calibri" });

  const dashboards = [
    ["Agent Monitoring Dashboard", "Real-time KPI progress, run health, error rates, and regression alerts for all deployed agents", C.blue],
    ["Eval Studio Home", "Golden dataset pass/fail rates, eval cost sparklines, and regression trend over time", C.green],
    ["Trace Viewer", "Span-level drill-down into every step of an agent run — LLM calls, tool calls, policy decisions", C.accent],
    ["Compliance Audit Log", "Filterable audit trail of all policy violations, approval decisions, and PII masking events", C.orange],
    ["Cost & Usage Analytics", "Per-agent token consumption, cost-per-run trend, and provider comparison", C.teal],
  ];

  dashboards.forEach(([ttl, body, color], i) => {
    const y = 1.9 + i * 1.0;
    s.addShape(prs.ShapeType.rect, { x: 6.6, y, w: 0.05, h: 0.8, fill: { color }, line: { color } });
    s.addText(ttl, { x: 6.75, y: y + 0.03, w: 6.0, h: 0.32, fontSize: 11, bold: true, color: C.white, fontFace: "Calibri" });
    s.addText(body, { x: 6.75, y: y + 0.35, w: 6.0, h: 0.42, fontSize: 9.5, color: C.lgray, fontFace: "Calibri" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 16 — Deployment Architecture
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  divider(s, { color: C.blue });
  title(s, "Deployment Architecture");
  subtitle(s, "Environments, release pipeline, and infrastructure topology");

  // Three environment boxes
  const envs = [
    { name: "DEVELOPMENT", sub: "Feature branches, mock MCP servers, seed data", color: C.teal, x: 0.35 },
    { name: "STAGING", sub: "Integration tests, Shadow Replay, canary baseline", color: C.orange, x: 4.65 },
    { name: "PRODUCTION", sub: "Live traffic, canary rollout, real integrations", color: C.green, x: 8.95 },
  ];
  envs.forEach(({ name, sub, color, x }) => {
    s.addShape(prs.ShapeType.rect, { x, y: 1.35, w: 4.05, h: 2.8, fill: { color: "0A1628" }, line: { color, width: 1.5 } });
    s.addShape(prs.ShapeType.rect, { x, y: 1.35, w: 4.05, h: 0.42, fill: { color }, line: { color } });
    s.addText(name, { x, y: 1.35, w: 4.05, h: 0.42, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", align: "center", valign: "middle" });
    s.addText(sub, { x: x + 0.15, y: 1.82, w: 3.75, h: 0.5, fontSize: 9.5, color: C.lgray, fontFace: "Calibri", valign: "top" });

    const services = ["Express API", "Vite Frontend", "DeepEval Service", "PostgreSQL DB"];
    services.forEach((svc, j) => {
      label(s, svc, x + 0.2, 2.38 + j * 0.42, 3.65, 0.34, { bg: "152035", fg: C.lgray, fontSize: 9, bold: false });
    });
  });

  // Pipeline arrows
  arrow(s, 4.4, 2.75, 4.62, 2.75, C.accent);
  s.addText("Deploy\n& Test", { x: 4.25, y: 2.82, w: 0.55, h: 0.5, fontSize: 7, color: C.accent, fontFace: "Calibri", align: "center" });
  arrow(s, 8.7, 2.75, 8.92, 2.75, C.accent);
  s.addText("Canary\nRollout", { x: 8.55, y: 2.82, w: 0.55, h: 0.5, fontSize: 7, color: C.accent, fontFace: "Calibri", align: "center" });

  // Traffic split
  s.addText("Canary Traffic Split Strategy", { x: 6.45, y: 4.3, w: 4.0, h: 0.35, fontSize: 12, bold: true, color: C.green, fontFace: "Calibri" });
  const splits = [["1%", C.blue], ["10%", C.accent], ["25%", C.orange], ["100%", C.green]];
  splits.forEach(([pct, color], i) => {
    label(s, pct, 6.45 + i * 1.05, 4.7, 0.9, 0.5, { bg: "0A1628", fg: color, fontSize: 14, bold: true });
  });
  s.addText("↳  Auto-rollback triggered if KPI drops below contract threshold at any stage", {
    x: 6.45, y: 5.3, w: 5.7, h: 0.35, fontSize: 9.5, color: C.lgray, fontFace: "Calibri", italic: true,
  });

  // Infrastructure note
  s.addShape(prs.ShapeType.rect, { x: 0.35, y: 4.3, w: 5.8, h: 2.35, fill: { color: "0A1628" }, line: { color: C.lblue, width: 1 } });
  s.addText("Infrastructure", { x: 0.5, y: 4.4, w: 5.5, h: 0.35, fontSize: 12, bold: true, color: C.lblue, fontFace: "Calibri" });
  const infra = ["Replit-native hosting with auto-provisioned PostgreSQL", "LFS-backed binary asset storage (278 MB+)", "Environment secrets (never in source code)", "Git branch strategy: replit-changes → main", "Automated checkpoint commits on every deploy", "External integrations via Replit Connector system"];
  infra.forEach((line, i) => {
    s.addText("▸  " + line, { x: 0.5, y: 4.82 + i * 0.3, w: 5.5, h: 0.28, fontSize: 9.5, color: i % 2 === 0 ? C.white : C.lgray, fontFace: "Calibri" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 17 — External Integrations
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s, { color: C.accent });
  title(s, "External Integrations");
  subtitle(s, "How Atlas connects to third-party systems via MCP and REST");

  // Atlas box (center)
  label(s, "Atlas\nPlatform", 5.5, 3.1, 2.33, 1.1, { bg: C.blue, fg: C.white, fontSize: 14, bold: true });

  const integrations = [
    { name: "Salesforce", cat: "CRM", x: 0.4, y: 1.3, color: C.blue },
    { name: "ServiceNow", cat: "ITSM", x: 0.4, y: 2.55, color: C.lblue },
    { name: "HubSpot", cat: "Marketing", x: 0.4, y: 3.8, color: C.orange },
    { name: "Jira", cat: "Project Mgmt", x: 0.4, y: 5.05, color: C.accent },
    { name: "Slack", cat: "Messaging", x: 10.5, y: 1.3, color: C.teal },
    { name: "Snowflake", cat: "Data Warehouse", x: 10.5, y: 2.55, color: C.blue },
    { name: "MS Graph", cat: "Microsoft 365", x: 10.5, y: 3.8, color: C.lblue },
    { name: "SAP", cat: "ERP", x: 10.5, y: 5.05, color: C.orange },
  ];

  integrations.forEach(({ name, cat, x, y, color }) => {
    label(s, name + "\n" + cat, x, y, 2.2, 0.75, { bg: "0A1628", fg: C.white, fontSize: 10, bold: false });
    s.addShape(prs.ShapeType.rect, { x, y, w: 0.06, h: 0.75, fill: { color }, line: { color } });
    // arrow to/from center
    const cx = x < 5 ? x + 2.2 : x;
    const ex = x < 5 ? 5.5 : 5.5 + 2.33;
    s.addShape(prs.ShapeType.line, { x: Math.min(cx, ex), y: y + 0.38, w: Math.abs(ex - cx), h: 0, line: { color: C.gray, width: 1, dashType: "dash" } });
  });

  // LLM Providers
  s.addShape(prs.ShapeType.rect, { x: 3.5, y: 5.8, w: 6.33, h: 1.25, fill: { color: "0A1628" }, line: { color: C.accent, width: 1 } });
  s.addText("LLM Providers — Managed via Provider Registry", { x: 3.65, y: 5.9, w: 6.0, h: 0.35, fontSize: 11, bold: true, color: C.accent, fontFace: "Calibri", align: "center" });
  ["OpenAI GPT-4.1 / 4o", "Anthropic Claude 3.5 / 4.5", "Google Gemini 2.5 Pro"].forEach((p, i) => {
    label(s, p, 3.65 + i * 2.1, 6.3, 1.95, 0.42, { bg: "152035", fg: C.lgray, fontSize: 9.5, bold: false });
  });
  arrow(s, 6.66, 5.8, 6.66, 4.2, C.accent);

  note(s, "🔌 All integrations route through MCP Layer — standardised tool schema", 0.35, 6.9, 7.5, 0.38, C.teal);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 18 — Sample User Journey: Change of Address Agent
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  divider(s, { color: C.teal });
  title(s, "User Journey — Change of Address Agent");
  subtitle(s, "Real-world example: A credit union member updates their address via an AI agent");

  const steps2 = [
    { actor: "Member", action: "Submits new address via credit union web portal", color: C.blue },
    { actor: "Atlas API", action: "Trigger received → agent 'COA-CreditUnion' resolved → run initiated", color: C.lblue },
    { actor: "AAR", action: "Policy check: address-change requires identity verification + BSA watchlist screening", color: C.green },
    { actor: "PII Engine", action: "SSN and DOB in payload masked before passing to LLM", color: C.red },
    { actor: "LLM", action: "Address extraction agent parses and normalises the new address from member input", color: C.accent },
    { actor: "MCP Tool", action: "USPS Address Validation API called → address confirmed deliverable", color: C.teal },
    { actor: "Skill: BSA", action: "BSA Watchlist Screening skill invoked — member cleared", color: C.orange },
    { actor: "Skill: Velocity", action: "Velocity Risk Assessment checks for unusual address-change frequency — pass", color: C.orange },
    { actor: "Core System", action: "Address updated in member record. Notification sent via Notification Manager skill", color: C.green },
    { actor: "Audit", action: "Full trace persisted: policy decisions, tool calls, PII events, KPI: ✅ Address Validated", color: C.lgray },
  ];

  steps2.forEach(({ actor, action, color }, i) => {
    const y = 1.38 + i * 0.55;
    s.addShape(prs.ShapeType.roundRect, { x: 0.35, y, w: 1.8, h: 0.42, fill: { color: "0A1628" }, line: { color, width: 1 }, rectRadius: 0.05 });
    s.addText(actor, { x: 0.35, y, w: 1.8, h: 0.42, fontSize: 9.5, bold: true, color, fontFace: "Calibri", align: "center", valign: "middle" });
    if (i < steps2.length - 1) s.addShape(prs.ShapeType.line, { x: 1.25, y: y + 0.42, w: 0, h: 0.13, line: { color: C.gray, width: 1, dashType: "dash" } });
    s.addShape(prs.ShapeType.line, { x: 2.15, y: y + 0.21, w: 0.25, h: 0, line: { color, width: 1.2, endArrowType: "arrow" } });
    s.addShape(prs.ShapeType.rect, { x: 2.45, y, w: 10.2, h: 0.42, fill: { color: "0A1A0A" }, line: { color: "1A2A1A", width: 1 } });
    s.addText(action, { x: 2.6, y, w: 10.0, h: 0.42, fontSize: 10, color: C.lgray, fontFace: "Calibri", valign: "middle" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 19 — Roadmap
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.navy);
  divider(s);
  title(s, "Future Enhancements & Roadmap");
  subtitle(s, "Where Atlas is heading next");

  const horizons = [
    {
      phase: "Now — Q3 2026",
      color: C.green,
      items: ["Eval Studio span-level trace drill-down", "Dataset version diff overlay", "Golden synthesizer from Knowledge Base docs", "Pre-computed eval metrics in Conversation Simulator", "Regression alerts in monitoring dashboard"],
    },
    {
      phase: "Q4 2026",
      color: C.accent,
      items: ["Full multi-agent DAG visual editor", "Inline cost sparklines on Eval Studio Home", "Policy conflict warnings in deployment dialog", "Manual ontology concept editing UI", "Connect eval gate pass/fail to deployment blocking"],
    },
    {
      phase: "2027 & Beyond",
      color: C.orange,
      items: ["GPT-5 / Claude 4 provider upgrades", "Autonomous self-healing loop (Patch Center v2)", "Enterprise SSO & RBAC overhaul", "Federated multi-cluster deployment", "Real-time collaboration on Blueprint Studio"],
    },
  ];

  horizons.forEach(({ phase, color, items }, i) => {
    const x = 0.35 + i * 4.33;
    s.addShape(prs.ShapeType.rect, { x, y: 1.3, w: 4.1, h: 5.6, fill: { color: "0A1628" }, line: { color, width: 1.2 } });
    s.addShape(prs.ShapeType.rect, { x, y: 1.3, w: 4.1, h: 0.5, fill: { color }, line: { color } });
    s.addText(phase, { x, y: 1.3, w: 4.1, h: 0.5, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", align: "center", valign: "middle" });
    items.forEach((item, j) => {
      s.addShape(prs.ShapeType.roundRect, { x: x + 0.15, y: 1.95 + j * 0.9, w: 3.8, h: 0.75, fill: { color: "0D1F3C" }, line: { color: "1A3050", width: 1 }, rectRadius: 0.06 });
      s.addText(item, { x: x + 0.25, y: 1.95 + j * 0.9, w: 3.6, h: 0.75, fontSize: 10, color: C.lgray, fontFace: "Calibri", valign: "middle" });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 20 — Summary
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.1, h: 7.5, fill: { color: C.blue }, line: { color: C.blue } });

  s.addText("Summary", { x: 0.4, y: 0.25, w: 12.5, h: 0.55, fontSize: 30, bold: true, color: C.white, fontFace: "Calibri" });
  s.addShape(prs.ShapeType.rect, { x: 0.4, y: 0.82, w: 6, h: 0.04, fill: { color: C.accent }, line: { color: C.accent } });

  const takeaways = [
    ["🎯", "Business-Outcome Aligned", "Every agent is tied to a measurable Outcome Contract — not just functionality, but real KPIs."],
    ["🛡️", "Governance First", "Policy enforcement, PII masking, and audit trails are not add-ons — they're foundational."],
    ["🔬", "Safe by Design", "Shadow Replay, canary deployments, and automated rollback mean agents are validated before users see them."],
    ["📈", "Full Observability", "Every token, tool call, policy decision, and KPI delta is captured and visualised in real time."],
    ["🔌", "Enterprise-Ready", "Pre-built connectors for Salesforce, ServiceNow, Jira, Slack, Snowflake, and more — plug in, not build from scratch."],
    ["🚀", "Multi-LLM & Extensible", "Switch between OpenAI, Anthropic, and Gemini per agent. Extend via MCP without touching platform code."],
  ];

  takeaways.forEach(([icon, hdr, body], i) => {
    const y = 1.0 + i * 1.05;
    s.addText(icon, { x: 0.35, y, w: 0.6, h: 0.9, fontSize: 20, fontFace: "Segoe UI Emoji", valign: "middle" });
    s.addText(hdr, { x: 1.0, y: y + 0.05, w: 4.5, h: 0.38, fontSize: 12.5, bold: true, color: C.white, fontFace: "Calibri" });
    s.addText(body, { x: 1.0, y: y + 0.43, w: 11.5, h: 0.45, fontSize: 10.5, color: C.lgray, fontFace: "Calibri" });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 21 — Q&A
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = slide();
  bg(s, C.dark);
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: C.blue }, line: { color: C.blue } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: 7.42, w: 13.33, h: 0.08, fill: { color: C.accent }, line: { color: C.accent } });
  s.addShape(prs.ShapeType.ellipse, { x: 8.5, y: 2.5, w: 5, h: 5, fill: { color: "0D2045" }, line: { color: "0D2045" } });

  s.addText("Q & A", { x: 0.6, y: 2.0, w: 8, h: 1.5, fontSize: 72, bold: true, color: C.white, fontFace: "Calibri" });
  s.addText("Thank you for your time.", { x: 0.6, y: 3.6, w: 8, h: 0.55, fontSize: 20, color: C.accent, fontFace: "Calibri" });
  s.addShape(prs.ShapeType.rect, { x: 0.6, y: 4.25, w: 3.5, h: 0.05, fill: { color: C.blue }, line: { color: C.blue } });
  s.addText("We're happy to deep-dive into any component.", { x: 0.6, y: 4.4, w: 9, h: 0.45, fontSize: 14, color: C.lgray, fontFace: "Calibri", italic: true });

  const contacts = ["Platform: ASTRA Agents — Atlas", "GitHub: github.com/swarupd227/Astra-Agents", "Deployed: atlas-agent-platform.replit.app"];
  contacts.forEach((c, i) => {
    s.addText("▸  " + c, { x: 0.6, y: 5.3 + i * 0.42, w: 8, h: 0.38, fontSize: 11, color: C.gray, fontFace: "Calibri" });
  });
}

// ── Write file ─────────────────────────────────────────────────────────────
await prs.writeFile({ fileName: "/home/runner/workspace/ASTRA_Agents_Architecture_Deck.pptx" });
console.log("✅  Presentation written successfully.");
