import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  BookOpen, CheckCircle2, AlertTriangle, Clock, ExternalLink,
  Package, ShieldCheck, ShieldAlert, ShieldOff, ArrowUpCircle, Info,
  XCircle, ChevronRight,
} from "lucide-react";

const MCG_COLOR  = "#003087";
const MCG_RED    = "#E31837";
const DEMO_TITLE = "Knowledge Base Onboarding";
const CLIENT     = "MCG Health";
const PIPELINE   = "MCG-HEALTH-KB-INGEST";

type ScenarioKey = "happy" | "prohibited-term" | "missing-hash";
type AgentState  = "idle" | "running" | "ok" | "fail";

interface LiveEvent {
  id:        number;
  type:      string;
  agentName: string;
  message:   string;
  timestamp: Date;
}

interface AgentRun {
  externalId:   string;
  name:         string;
  agentId?:     string;
  deploymentId?: string;
  state:        AgentState;
  toolCalls:    number;
  summary?:     any;
  startedAt?:   number;
  finishedAt?:  number;
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { message: s }; }
}

const TOOL_LABELS: Record<string, string> = {
  extract_brand_policy:    "Extracting brand policy",
  extract_language_policy: "Extracting language policy",
  extract_segment_lexicon: "Extracting segment lexicon",
  extract_naming_aliases:  "Extracting naming aliases",
  extract_dictionary_index:"Extracting dictionary index",
  extract_theme_tokens:    "Extracting theme tokens",
  derive_qa_rules:         "Deriving QA rules",
  produce_bundle:          "Producing knowledge bundle",
  run_qa_check:            "Running QA validation",
  promote_bundle:          "Promoting bundle to ACTIVE",
};
const SERVER_LABELS: Record<string, string> = {
  "mcg-knowledge-base": "MCG Knowledge Base",
  "mcg-bundle-store":   "Atlas Bundle Store",
};
function labelTool(t?: string)   { return t ? (TOOL_LABELS[t]   ?? t) : ""; }
function labelServer(s?: string) { return s ? (SERVER_LABELS[s] ?? s) : ""; }

const EXTRACTION_NODES = [
  "extract_brand_policy",
  "extract_language_policy",
  "extract_segment_lexicon",
  "extract_naming_aliases",
  "extract_dictionary_index",
  "extract_theme_tokens",
  "derive_qa_rules",
  "produce_bundle",
];

// Artifact definitions with display labels and source mapping
const ARTIFACT_DEFS: { key: string; label: string; source: string | null; description: string }[] = [
  { key: "brand_policy",      label: "Brand Policy",      source: "/api/mock/mcg-knowledge-base/extract-brand-policy",    description: "Naming rules, prohibited terms, formatting, tone" },
  { key: "language_policy",   label: "Language Policy",   source: "/api/mock/mcg-knowledge-base/extract-language-policy", description: "Tense, POV, grammatical preferences, prohibited phrases" },
  { key: "segment_lexicon",   label: "Segment Lexicon",   source: "/api/mock/mcg-knowledge-base/extract-segment-lexicon", description: "Health plan, hospital, employer messaging frames" },
  { key: "naming_alias_map",  label: "Naming Alias Map",  source: "/api/mock/mcg-knowledge-base/extract-naming-aliases",  description: "Canonical names, shortforms, prohibited legacy names" },
  { key: "dictionary_index",  label: "Dictionary Index",  source: "/api/mock/mcg-knowledge-base/extract-dictionary-index",description: "2,847 clinical & payer terms across 5 categories" },
  { key: "theme_tokens",      label: "Theme Tokens",      source: "/api/mock/mcg-knowledge-base/extract-theme-tokens",    description: "Color palette, typography, proposal layout rules" },
  { key: "qa_rules",          label: "QA Rules",          source: "/api/mock/mcg-knowledge-base/derive-qa-rules",         description: "Hard-block and soft-warning validation rules" },
  { key: "source_provenance", label: "Source Provenance", source: null, description: "Source document metadata and SHA-256 hashes" },
  { key: "token_usage",       label: "Token Usage",       source: null, description: "LLM token consumption across all extraction calls" },
  { key: "passed_qa",         label: "QA Pass Status",    source: null, description: "Boolean QA gate result for this bundle" },
  { key: "qa_score",          label: "QA Score",          source: null, description: "Numeric QA score out of 100" },
  { key: "schema_version",    label: "Schema Version",    source: null, description: "Bundle schema and versioning metadata" },
];

const SCENARIOS: { key: ScenarioKey; label: string; badge?: string; description: string }[] = [
  {
    key:         "happy",
    label:       "Happy Path — Full KB Ingestion",
    description: "MCG Brand Style Guide + Clinical Dictionary ingested across 7 extraction nodes. Bundle produces all 12 artifacts. QA passes at 97.4/100. 1 soft warning (missing SHA-256). Human Promote gate appears.",
  },
  {
    key:         "prohibited-term",
    label:       "Exception: Prohibited Term Detected",
    badge:       "Exception",
    description: "Brand guide content contains 'Milliman Care Guidelines' used as an approved alias. QA check detects this as a hard-block violation. Bundle is QA_BLOCKED — cannot be promoted until corrected.",
  },
  {
    key:         "missing-hash",
    label:       "Exception: Missing Source Hash",
    badge:       "Exception",
    description: "Source documents ingested without SHA-256 hashes. QA passes with score 71.2 and 2 warnings. Human must acknowledge the reduced reproducibility guarantee before promotion.",
  },
];

function formatEvent(eventName: string, d: any): string {
  if (!d || typeof d !== "object") return String(d ?? "");
  switch (eventName) {
    case "run_start":
      return `Pipeline ${d.pipeline ?? ""} starting · scenario: ${d.scenario ?? ""} · ${d.extraction_nodes ?? 7} extraction nodes · ${d.bundle_artifacts ?? 12} bundle artifacts`;
    case "setup":
      return d.message ?? "Setup complete";
    case "agent_start":
      return `Agent ${d.externalId ?? ""} starting${d.model ? ` (${d.model})` : ""}`;
    case "agent_event": {
      const sub = d.data ?? {};
      const tool   = labelTool(sub.tool);
      const server = labelServer(sub.server);
      const iter   = sub.iteration != null ? ` · turn ${sub.iteration}` : "";
      if (d.type === "tool_call") return `→ ${tool || "Tool call"}${server ? ` (${server})` : ""}${iter}`;
      if (d.type === "tool_call_result") {
        const ok  = sub.success === false ? " · FAILED" : "";
        const err = sub.error ? ` — ${String(sub.error).slice(0, 160)}` : "";
        return `← ${tool || "Tool result"}${server ? ` (${server})` : ""}${ok}${err}${iter}`;
      }
      if (d.type === "llm_response") {
        const tc = sub.toolsCalled != null ? ` · ${sub.toolsCalled} tool call${sub.toolsCalled === 1 ? "" : "s"}` : "";
        return `Claude reasoning${iter}${tc}`;
      }
      return d.message ?? d.type ?? JSON.stringify(d).slice(0, 200);
    }
    case "agent_complete":
      return `Agent ${d.externalId ?? ""} complete · ${d.toolCalls ?? 0} tool calls${d.success === false ? " · FAILED" : ""}`;
    case "qa_gate":
      return `QA Gate · status: ${d.status ?? ""} · score: ${d.qa_score ?? "?"} · hard violations: ${d.hard_violations_count ?? 0} · warnings: ${d.soft_warnings_count ?? 0}`;
    case "promotion_gate":
      return `Promotion Gate · bundle: ${d.bundle_id ?? ""} · awaiting human reviewer (${d.reviewer ?? ""})`;
    case "phase_start":
      return `Phase ${d.phase ?? ""} → ${d.agent ?? ""}`;
    case "audit_trail":
      return d.message ?? "Audit trail captured";
    case "run_complete":
      return d.message ?? `Run complete · scenario: ${d.scenario ?? ""}`;
    case "error":
      return `ERROR: ${d.message ?? "unknown"}`;
    default:
      return d.message ?? JSON.stringify(d).slice(0, 200);
  }
}

const EVENT_COLORS: Record<string, string> = {
  run_start:       "text-blue-400",
  setup:           "text-white/40",
  agent_start:     "text-emerald-400",
  agent_event:     "text-purple-400",
  agent_complete:  "text-emerald-300",
  qa_gate:         "text-amber-400",
  promotion_gate:  "text-cyan-300",
  phase_start:     "text-blue-300",
  audit_trail:     "text-cyan-400",
  run_complete:    "text-emerald-400",
  error:           "text-red-400",
};

function extractionNodeFromTool(tool?: string): string | null {
  if (!tool) return null;
  if (EXTRACTION_NODES.includes(tool)) return tool;
  return null;
}

// ─── Artifact detail renderers ─────────────────────────────────────────────────

function ArtifactDetailBrandPolicy({ data }: { data: any }) {
  const d = data?.data ?? {};
  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Naming Rules</div>
        <div className="grid grid-cols-1 gap-1">
          <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Primary name</span><span className="font-medium">{d.naming_rules?.primary_name}</span></div>
          <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">First reference</span><span>{d.naming_rules?.first_reference}</span></div>
          <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Capitalization</span><span>{d.naming_rules?.capitalization}</span></div>
          <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Product names</span><span>{(d.naming_rules?.product_names ?? []).join(", ")}</span></div>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-red-400 font-medium mb-2">Prohibited Terms ({(d.prohibited_terms ?? []).length})</div>
        <div className="flex flex-wrap gap-1.5">
          {(d.prohibited_terms ?? []).map((t: string) => (
            <span key={t} className="px-2 py-0.5 rounded bg-red-950/30 border border-red-500/30 text-red-300 font-mono">{t}</span>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Formatting & Colors</div>
        <div className="flex flex-wrap gap-2">
          {d.formatting?.color_primary && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border border-white/20" style={{ background: d.formatting.color_primary }} />
              <span className="font-mono text-muted-foreground">{d.formatting.color_primary}</span>
              <span className="text-muted-foreground">Primary</span>
            </div>
          )}
          {d.formatting?.color_secondary && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border border-white/20" style={{ background: d.formatting.color_secondary }} />
              <span className="font-mono text-muted-foreground">{d.formatting.color_secondary}</span>
              <span className="text-muted-foreground">Secondary</span>
            </div>
          )}
        </div>
        <div className="mt-2 text-muted-foreground">
          Font: <span className="text-foreground">{d.formatting?.font_primary}</span> · Logo: <span className="text-foreground">{d.formatting?.logo_lockup}</span>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Tone of Voice</div>
        <div className="text-muted-foreground">Voice: <span className="text-foreground">{d.tone?.voice}</span></div>
        <div className="text-muted-foreground mt-0.5">Avoid: {(d.tone?.avoid ?? []).join(", ")}</div>
      </div>
    </div>
  );
}

function ArtifactDetailLanguagePolicy({ data }: { data: any }) {
  const d = data?.data ?? {};
  const gp = d.grammatical_preferences ?? {};
  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <div><span className="text-muted-foreground">Tense: </span>{d.tense}</div>
        <div><span className="text-muted-foreground">POV: </span>{d.point_of_view}</div>
        <div><span className="text-muted-foreground">Voice: </span>{d.active_voice}</div>
        <div><span className="text-muted-foreground">Oxford comma: </span>{gp.oxford_comma ? "Required" : "Optional"}</div>
        <div><span className="text-muted-foreground">Numbers: </span>{gp.spell_out_numbers}</div>
        <div><span className="text-muted-foreground">Readability: </span>{d.readability_target}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-amber-400 font-medium mb-2">Prohibited Phrases ({(d.prohibited_phrases ?? []).length})</div>
        <div className="flex flex-wrap gap-1.5">
          {(d.prohibited_phrases ?? []).map((p: string) => (
            <span key={p} className="px-2 py-0.5 rounded bg-amber-950/20 border border-amber-500/25 text-amber-300 font-mono">{p}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArtifactDetailSegmentLexicon({ data }: { data: any }) {
  const segments = data?.data?.segments ?? [];
  const [active, setActive] = useState(0);
  const seg = segments[active];
  return (
    <div className="space-y-3 text-xs">
      <div className="flex gap-1.5">
        {segments.map((s: any, i: number) => (
          <button key={s.id} onClick={() => setActive(i)}
            className={`px-3 py-1 rounded-full border text-[11px] transition-colors ${
              active === i ? "border-current text-foreground font-medium" : "border-border text-muted-foreground hover:border-muted-foreground/50"
            }`}
            style={active === i ? { borderColor: MCG_COLOR, color: MCG_COLOR } : {}}
          >{s.label}</button>
        ))}
      </div>
      {seg && (
        <div className="space-y-3 pt-1">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Messaging Frame</div>
            <p className="text-foreground/80 leading-relaxed">{seg.messaging_frame}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-emerald-400 font-medium mb-1">Value Drivers</div>
              <ul className="space-y-0.5 text-muted-foreground">
                {(seg.value_drivers ?? []).map((v: string) => <li key={v} className="flex gap-1"><ChevronRight className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />{v}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-red-400 font-medium mb-1">Pain Points</div>
              <ul className="space-y-0.5 text-muted-foreground">
                {(seg.pain_points ?? []).map((p: string) => <li key={p} className="flex gap-1"><ChevronRight className="w-3 h-3 mt-0.5 text-red-500 shrink-0" />{p}</li>)}
              </ul>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Decision Makers</div>
            <div className="flex flex-wrap gap-1.5">
              {(seg.decision_makers ?? []).map((m: string) => <span key={m} className="px-2 py-0.5 rounded border border-border text-muted-foreground">{m}</span>)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-red-400/70 font-medium mb-1">Forbidden Phrases</div>
            <div className="flex flex-wrap gap-1.5">
              {(seg.forbidden_phrases ?? []).map((f: string) => <span key={f} className="px-2 py-0.5 rounded bg-red-950/20 border border-red-500/20 text-red-400 font-mono">{f}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArtifactDetailNamingAliases({ data }: { data: any }) {
  const aliases = data?.data?.aliases ?? [];
  return (
    <div className="text-xs space-y-2">
      <div className="text-muted-foreground mb-2">
        {aliases.filter((a: any) => a.approved !== false).length} approved · <span className="text-red-400">{aliases.filter((a: any) => a.approved === false).length} prohibited</span>
      </div>
      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-3 py-1.5 text-muted-foreground font-medium w-4">✓</th>
              <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Alias</th>
              <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Canonical</th>
              <th className="text-left px-3 py-1.5 text-muted-foreground font-medium hidden md:table-cell">Context</th>
            </tr>
          </thead>
          <tbody>
            {aliases.map((a: any, i: number) => (
              <tr key={i} className={`border-b border-border/50 last:border-0 ${a.approved === false ? "bg-red-950/10" : ""}`}>
                <td className="px-3 py-1.5">
                  {a.approved === false
                    ? <XCircle className="w-3.5 h-3.5 text-red-400" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </td>
                <td className={`px-3 py-1.5 font-mono ${a.approved === false ? "text-red-300" : "text-foreground"}`}>{a.alias}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{a.canonical ?? <span className="text-red-400">PROHIBITED</span>}</td>
                <td className="px-3 py-1.5 text-muted-foreground hidden md:table-cell leading-relaxed">{a.context}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArtifactDetailDictionaryIndex({ data }: { data: any }) {
  const d = data?.data ?? {};
  const cats = d.categories ?? {};
  const terms = d.high_frequency_terms ?? [];
  const total = d.total_entries ?? 0;
  return (
    <div className="text-xs space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
          {total.toLocaleString()} Total Entries · {d.index_version}
        </div>
        <div className="space-y-1.5">
          {Object.entries(cats).map(([cat, count]: [string, any]) => {
            const pct = Math.round((count / total) * 100);
            return (
              <div key={cat}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
                  <span className="tabular-nums font-medium">{count.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: MCG_COLOR }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">High-Frequency Terms</div>
        <div className="space-y-1.5">
          {terms.map((t: any) => (
            <div key={t.term} className="flex gap-2">
              <span className="font-medium text-foreground w-44 shrink-0 truncate">{t.term}</span>
              <span className="text-muted-foreground leading-relaxed">{t.definition}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArtifactDetailThemeTokens({ data }: { data: any }) {
  const d = data?.data ?? {};
  const palette = d.color_palette ?? {};
  const typo = d.typography ?? {};
  const layout = d.proposal_layout ?? {};
  return (
    <div className="text-xs space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Color Palette</div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(palette).map(([key, tok]: [string, any]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded border border-white/10" style={{ background: tok.hex }} />
              <div>
                <div className="font-medium">{tok.name}</div>
                <div className="text-muted-foreground font-mono">{tok.hex}</div>
                <div className="text-muted-foreground">{tok.usage}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Typography</div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>Heading: <span className="text-foreground">{typo.heading_font}</span></div>
            <div>Body: <span className="text-foreground">{typo.body_font}</span></div>
            <div>Fallback: <span className="text-foreground">{typo.fallback}</span></div>
            <div>Body size: <span className="text-foreground">{typo.body_size}</span></div>
            <div>Line spacing: <span className="text-foreground">{typo.line_spacing}</span></div>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Proposal Layout</div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>Margins: <span className="text-foreground">{layout.margins}</span></div>
            <div className="leading-relaxed">Header: <span className="text-foreground">{layout.header}</span></div>
            <div className="leading-relaxed">Footer: <span className="text-foreground">{layout.footer}</span></div>
            <div className="leading-relaxed">Cover page: <span className="text-foreground">{layout.cover_page}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtifactDetailQaRules({ data }: { data: any }) {
  const d = data?.data ?? {};
  const hard = d.hard_block_rules ?? [];
  const soft = d.soft_warning_rules ?? [];
  const weights = d.qa_score_weights ?? {};
  return (
    <div className="text-xs space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-red-400 font-medium mb-2">Hard Block Rules ({hard.length})</div>
        <div className="space-y-2">
          {hard.map((r: any) => (
            <div key={r.rule_id} className="flex gap-3 p-2 rounded bg-red-950/15 border border-red-500/20">
              <span className="font-mono text-red-400 shrink-0">{r.rule_id}</span>
              <div>
                <div className="font-medium text-foreground">{r.name?.replace(/_/g, " ")}</div>
                <div className="text-muted-foreground leading-relaxed mt-0.5">{r.description}</div>
                <div className="text-red-400/70 mt-0.5">Auto-remediation: {r.auto_remediation ? "Yes" : "No"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-amber-400 font-medium mb-2">Soft Warning Rules ({soft.length})</div>
        <div className="space-y-2">
          {soft.map((r: any) => (
            <div key={r.rule_id} className="flex gap-3 p-2 rounded bg-amber-950/10 border border-amber-500/20">
              <span className="font-mono text-amber-400 shrink-0">{r.rule_id}</span>
              <div>
                <div className="font-medium text-foreground">{r.name?.replace(/_/g, " ")}</div>
                <div className="text-muted-foreground leading-relaxed mt-0.5">{r.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">QA Score Weights</div>
        <div className="space-y-1">
          {Object.entries(weights).map(([k, v]: [string, any]) => (
            <div key={k} className="flex justify-between">
              <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
              <span className="font-medium tabular-nums">{v} pts</span>
            </div>
          ))}
          <div className="pt-1 border-t border-border flex justify-between">
            <span className="text-muted-foreground">Passing threshold</span>
            <span className="font-medium text-emerald-400">{d.passing_threshold}/100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtifactDetailMeta({ artifactKey, summary }: { artifactKey: string; summary: any }) {
  if (artifactKey === "source_provenance") {
    const sources = [
      { filename: "MCG_Brand_Style_Guide_2024.pdf", pages: 48, sha256: summary?.sha256_present ? "a3f4b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0" : null },
      { filename: "MCG_Clinical_Dictionary_2024.pdf", pages: 312, sha256: summary?.sha256_present ? "b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8" : null },
    ];
    return (
      <div className="text-xs space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Source Documents</div>
        {sources.map(s => (
          <div key={s.filename} className="p-3 rounded border border-border bg-muted/10 space-y-1.5">
            <div className="font-medium">{s.filename}</div>
            <div className="text-muted-foreground">{s.pages} pages</div>
            {s.sha256
              ? <div className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="w-3 h-3" /><span className="font-mono text-[10px] text-muted-foreground">{s.sha256}</span></div>
              : <div className="flex items-center gap-1.5 text-amber-400"><AlertTriangle className="w-3 h-3" />SHA-256 not captured — reduced reproducibility guarantee</div>
            }
          </div>
        ))}
      </div>
    );
  }
  if (artifactKey === "token_usage") {
    return (
      <div className="text-xs space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">LLM Token Consumption</div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Tool calls executed</span><span className="font-medium tabular-nums">{summary?.toolCalls ?? 10}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-medium">claude-haiku-4-5</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Max iterations</span><span className="font-medium tabular-nums">12</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Extraction nodes</span><span className="font-medium tabular-nums">7</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Bundle ops</span><span className="font-medium tabular-nums">2 (produce + qa_check)</span></div>
        </div>
      </div>
    );
  }
  if (artifactKey === "passed_qa") {
    const passed = summary?.passed_qa ?? true;
    return (
      <div className="text-xs space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">QA Gate Result</div>
        <div className={`flex items-center gap-3 p-4 rounded border ${passed ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          {passed ? <ShieldCheck className="w-8 h-8 text-emerald-400" /> : <ShieldOff className="w-8 h-8 text-red-400" />}
          <div>
            <div className={`text-lg font-bold ${passed ? "text-emerald-400" : "text-red-400"}`}>{passed ? "PASSED" : "BLOCKED"}</div>
            <div className="text-muted-foreground mt-0.5">{passed ? "Bundle is eligible for human promotion." : "Hard violations must be resolved before promotion."}</div>
          </div>
        </div>
        <div className="text-muted-foreground">Hard violations: <span className={summary?.hard_violations_count > 0 ? "text-red-400 font-medium" : "text-emerald-400 font-medium"}>{summary?.hard_violations_count ?? 0}</span></div>
        <div className="text-muted-foreground">Soft warnings: <span className={summary?.soft_warnings_count > 0 ? "text-amber-400 font-medium" : "text-muted-foreground"}>{summary?.soft_warnings_count ?? 0}</span></div>
      </div>
    );
  }
  if (artifactKey === "qa_score") {
    const score = summary?.qa_score ?? 97.4;
    const color = score >= 90 ? "text-emerald-400" : score >= 70 ? "text-amber-400" : "text-red-400";
    const barColor = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
    return (
      <div className="text-xs space-y-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Numeric QA Score</div>
        <div className="flex items-end gap-3">
          <span className={`text-5xl font-bold tabular-nums ${color}`}>{score}</span>
          <span className="text-muted-foreground mb-2">/ 100</span>
        </div>
        <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: barColor }} />
        </div>
        <div className="space-y-1 text-muted-foreground">
          <div className="flex justify-between"><span>Passing threshold</span><span className="text-foreground">≥ 90</span></div>
          <div className="flex justify-between"><span>Status</span><span className={color}>{score >= 90 ? "PASSED" : score >= 70 ? "WARN" : "BLOCKED"}</span></div>
        </div>
      </div>
    );
  }
  if (artifactKey === "schema_version") {
    return (
      <div className="text-xs space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Bundle Schema & Versioning</div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Bundle ID</span><span className="font-mono">{summary?.bundle_id ?? "MCG-KB-BUNDLE-0001"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-medium">1.0.0</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Schema</span><span className="font-mono">mcg-kb-bundle/v1</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Artifact count</span><span className="font-medium">12 / 12 required</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={summary?.passed_qa ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>{summary?.passed_qa ? "QA PASSED" : "QA BLOCKED"}</span></div>
        </div>
      </div>
    );
  }
  return null;
}

function ArtifactDetail({
  artifactKey, artifactData, summary
}: { artifactKey: string; artifactData: Record<string, any>; summary: any }) {
  const raw = artifactData[artifactKey];

  if (artifactKey === "brand_policy")     return <ArtifactDetailBrandPolicy data={raw} />;
  if (artifactKey === "language_policy")  return <ArtifactDetailLanguagePolicy data={raw} />;
  if (artifactKey === "segment_lexicon")  return <ArtifactDetailSegmentLexicon data={raw} />;
  if (artifactKey === "naming_alias_map") return <ArtifactDetailNamingAliases data={raw} />;
  if (artifactKey === "dictionary_index") return <ArtifactDetailDictionaryIndex data={raw} />;
  if (artifactKey === "theme_tokens")     return <ArtifactDetailThemeTokens data={raw} />;
  if (artifactKey === "qa_rules")         return <ArtifactDetailQaRules data={raw} />;
  return <ArtifactDetailMeta artifactKey={artifactKey} summary={summary} />;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function McgKbDemo() {
  const [scenario, setScenario] = useState<ScenarioKey>("happy");
  const [running, setRunning]   = useState(false);
  const [logOpen, setLogOpen]   = useState(true);
  const [events, setEvents]     = useState<LiveEvent[]>([]);
  const [evtCounter, setEvtCounter] = useState(0);
  const [agentRun, setAgentRun] = useState<AgentRun>({
    externalId: "MCG-KB-INGEST-001",
    name:       "Knowledge Base Ingestion Agent",
    state:      "idle",
    toolCalls:  0,
  });
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [qaResult, setQaResult]             = useState<any>(null);
  const [promotionGate, setPromotionGate]   = useState<any>(null);
  const [runComplete, setRunComplete]        = useState<any>(null);
  const [promoting, setPromoting]           = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [artifactData, setArtifactData]         = useState<Record<string, any>>({});
  const [artifactLoadingKey, setArtifactLoadingKey] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  const esRef      = useRef<EventSource | null>(null);
  const logEndRef  = useRef<HTMLDivElement | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const KB_ENDPOINTS: Record<string, string> = {
    brand_policy:     "/api/mock/mcg-knowledge-base/extract-brand-policy",
    language_policy:  "/api/mock/mcg-knowledge-base/extract-language-policy",
    segment_lexicon:  "/api/mock/mcg-knowledge-base/extract-segment-lexicon",
    naming_alias_map: "/api/mock/mcg-knowledge-base/extract-naming-aliases",
    dictionary_index: "/api/mock/mcg-knowledge-base/extract-dictionary-index",
    theme_tokens:     "/api/mock/mcg-knowledge-base/extract-theme-tokens",
    qa_rules:         "/api/mock/mcg-knowledge-base/derive-qa-rules",
  };

  // Lazy-fetch per artifact click; cache results so subsequent clicks are instant
  const handleArtifactClick = useCallback((key: string) => {
    setSelectedArtifact(prev => {
      if (prev === key) return null; // toggle off
      return key;
    });

    // If we already have the data, just select; otherwise fetch
    if (artifactData[key] !== undefined || !KB_ENDPOINTS[key]) {
      // data already cached or it's a meta-artifact — nothing to fetch
      setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      return;
    }

    setArtifactLoadingKey(key);
    fetch(KB_ENDPOINTS[key])
      .then(r => r.json())
      .then(data => setArtifactData(prev => ({ ...prev, [key]: data })))
      .catch(() => setArtifactData(prev => ({ ...prev, [key]: null })))
      .finally(() => {
        setArtifactLoadingKey(null);
        setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      });
  }, [artifactData]);

  const addEvent = useCallback((type: string, d: any) => {
    counterRef.current += 1;
    const id = counterRef.current;
    setEvtCounter(id);
    const message = formatEvent(type, d);
    setEvents(prev => [...prev, { id, type, agentName: d.agentName ?? d.externalId ?? "", message, timestamp: new Date() }]);
  }, []);

  const handleRun = useCallback(() => {
    if (running) return;
    esRef.current?.close();

    setRunning(true);
    setEvents([]);
    setCompletedNodes(new Set());
    setQaResult(null);
    setPromotionGate(null);
    setRunComplete(null);
    setSelectedArtifact(null);
    setArtifactData({});
    setArtifactLoadingKey(null);
    counterRef.current = 0;
    setAgentRun(prev => ({ ...prev, state: "idle", toolCalls: 0, summary: undefined, startedAt: undefined, finishedAt: undefined }));

    const es = new EventSource(`/demo-api/mcg-kb/live-run?scenario=${scenario}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const d = safeParse(e.data);
      addEvent("message", d);
    };

    const handle = (name: string) => {
      es.addEventListener(name, (e: any) => {
        const d = safeParse(e.data);
        addEvent(name, d);

        if (name === "agent_start") {
          setAgentRun(prev => ({
            ...prev,
            state: "running",
            agentId: d.agentId,
            deploymentId: d.deploymentId,
            startedAt: Date.now(),
          }));
        }
        if (name === "agent_event") {
          if (d.type === "tool_call_result" && d.data?.success !== false) {
            const node = extractionNodeFromTool(d.data?.tool);
            if (node) setCompletedNodes(prev => new Set([...prev, node]));
          }
          if (d.type === "tool_call_result") {
            setAgentRun(prev => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
          }
        }
        if (name === "agent_complete") {
          setAgentRun(prev => ({
            ...prev,
            state: d.success === false ? "fail" : "ok",
            finishedAt: Date.now(),
            summary: d.resultSummary,
          }));
        }
        if (name === "qa_gate") setQaResult(d);
        if (name === "promotion_gate") setPromotionGate(d);
        if (name === "run_complete") {
          setRunComplete(d);
          setRunning(false);
          es.close();
        }
        if (name === "error") {
          setRunning(false);
          es.close();
        }
      });
    };

    ["run_start", "setup", "agent_start", "agent_event", "agent_complete",
     "qa_gate", "promotion_gate", "phase_start", "audit_trail", "run_complete", "error",
    ].forEach(handle);

    es.onerror = () => { setRunning(false); es.close(); };
  }, [running, scenario, addEvent]);

  const handleReset = useCallback(async () => {
    esRef.current?.close();
    setRunning(false);
    setEvents([]);
    setCompletedNodes(new Set());
    setQaResult(null);
    setPromotionGate(null);
    setRunComplete(null);
    setSelectedArtifact(null);
    setArtifactData({});
    setArtifactLoadingKey(null);
    setAgentRun({ externalId: "MCG-KB-INGEST-001", name: "Knowledge Base Ingestion Agent", state: "idle", toolCalls: 0 });
    await fetch("/demo-api/mcg-kb/reset", { method: "POST" }).catch(() => {});
  }, []);

  const handlePromote = useCallback(async () => {
    if (!promotionGate?.bundle_id || promoting) return;
    setPromoting(true);
    try {
      const res = await fetch("/api/mock/mcg-bundle-store/promote-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_id: promotionGate.bundle_id, promoted_by: "Knowledge Management Lead", acknowledgement: "Reviewer acknowledges QA warnings and approves bundle for production use." }),
      });
      const data = await res.json();
      addEvent("promote_action", { message: `Bundle ${data.bundle_id} promoted to ACTIVE by ${data.promoted_by}. ${data.downstream_agents_notified?.length ?? 0} downstream agents notified.` });
      setPromotionGate(null);
    } catch {
      addEvent("error", { message: "Promotion request failed." });
    } finally {
      setPromoting(false);
    }
  }, [promotionGate, promoting, addEvent]);

  const { data: agentRunsData } = useQuery({
    queryKey: ["/demo-api/mcg-kb/agent-runs"],
    refetchInterval: running ? 3000 : false,
  });

  const agentRegistryId = (agentRunsData as any)?.[0]?.agentId ?? agentRun.agentId;
  const scenarioDef = SCENARIOS.find(s => s.key === scenario)!;
  const elapsedSec  = agentRun.startedAt && agentRun.finishedAt
    ? ((agentRun.finishedAt - agentRun.startedAt) / 1000).toFixed(1)
    : null;

  const qaStatusColor = !qaResult ? "" :
    qaResult.status === "QA_BLOCKED" ? "text-red-400" :
    qaResult.status === "QA_WARN"    ? "text-amber-400" :
    "text-emerald-400";

  const qaStatusIcon = !qaResult ? null :
    qaResult.status === "QA_BLOCKED" ? <ShieldOff   className="w-4 h-4 text-red-400" /> :
    qaResult.status === "QA_WARN"    ? <ShieldAlert  className="w-4 h-4 text-amber-400" /> :
    <ShieldCheck className="w-4 h-4 text-emerald-400" />;

  const selectedDef = ARTIFACT_DEFS.find(a => a.key === selectedArtifact);

  // Derive per-artifact status from QA results so the grid is scenario-aware
  const flaggedArtifacts = useMemo<Set<string>>(() => {
    const violations: any[] = agentRun.summary?.hard_violations ?? [];
    const s = new Set<string>();
    for (const v of violations) {
      // Primary: location field like "brand_policy.naming_rules.legacy_alias"
      const loc: string = v.location ?? v.artifact ?? "";
      const locKey = loc.split(".")[0].split("[")[0];
      if (locKey) { s.add(locKey); continue; }
      // Fallback: derive affected artifacts from known rule IDs
      const rule: string = (v.rule ?? v.rule_id ?? "").toLowerCase();
      if (rule.includes("prohibited_term")) {
        s.add("brand_policy");
        s.add("naming_alias_map");
      } else if (rule.includes("trademark")) {
        s.add("brand_policy");
      }
    }
    // If QA is blocked but Claude didn't include violation details, flag by count
    if (s.size === 0 && agentRun.summary?.status === "QA_BLOCKED" && (agentRun.summary?.hard_violations_count ?? 0) > 0) {
      s.add("brand_policy");
      s.add("naming_alias_map");
    }
    return s;
  }, [agentRun.summary]);

  const warnedArtifacts = useMemo<Set<string>>(() => {
    const warnings: any[] = agentRun.summary?.soft_warnings ?? [];
    const s = new Set<string>();
    for (const w of warnings) {
      // Primary: location field
      const loc: string = w.location ?? w.artifact ?? "";
      const locKey = loc.split(".")[0].split("[")[0];
      if (locKey) { s.add(locKey); continue; }
      // Fallback: derive from known rule names
      const rule: string = (w.rule ?? w.rule_id ?? "").toLowerCase();
      if (rule.includes("source_hash") || rule.includes("hash_required")) {
        s.add("source_provenance");
      }
    }
    // If QA passed with warnings but no location, flag source_provenance by default
    if (s.size === 0 && agentRun.summary?.status === "QA_WARN" && (agentRun.summary?.soft_warnings_count ?? 0) > 0) {
      s.add("source_provenance");
    }
    return s;
  }, [agentRun.summary]);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: MCG_COLOR }}>
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">{CLIENT}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs font-mono text-muted-foreground">{PIPELINE}</span>
              </div>
              <h1 className="text-lg font-bold leading-tight">{DEMO_TITLE}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border hover:bg-muted/40 disabled:opacity-40 transition-colors"
              data-testid="button-reset"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded text-white disabled:opacity-50 transition-opacity"
              style={{ background: running ? "#6b7280" : MCG_COLOR }}
              data-testid="button-run"
            >
              {running
                ? <><Activity className="w-4 h-4 animate-pulse" /> Running…</>
                : <><Play className="w-4 h-4" /> Run Demo</>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Description ──────────────────────────────────────────────────────── */}
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Live agent ingests MCG Brand Style Guide + Clinical Dictionary. Runs 7 structured extraction nodes,
          produces a 12-artifact typed JSON bundle, validates via QA check, and surfaces a human promotion gate.
          Manual review required before any proposal agent can be bound to the bundle.
        </p>

        {/* ── Scenario selector ─────────────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Scenario</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SCENARIOS.map(s => (
              <button
                key={s.key}
                onClick={() => !running && setScenario(s.key)}
                disabled={running}
                data-testid={`scenario-${s.key}`}
                className={`text-left rounded-lg border p-4 transition-all ${
                  scenario === s.key
                    ? "border-2 bg-muted/20"
                    : "border-border hover:border-muted-foreground/40"
                } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                style={scenario === s.key ? { borderColor: MCG_COLOR } : {}}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold">{s.label}</span>
                  {s.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide"
                          style={{ background: MCG_RED + "22", color: MCG_RED }}>
                      {s.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Pipeline header ───────────────────────────────────────────────────── */}
        <div className="border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
            {PIPELINE} · Active Scenario: {scenarioDef.label}
          </div>
          <div className="flex items-center gap-4">
            {/* Agent card */}
            <div className={`flex-1 rounded-lg border p-4 transition-colors ${
              agentRun.state === "running" ? "border-blue-500/50 bg-blue-500/5" :
              agentRun.state === "ok"      ? "border-emerald-500/50 bg-emerald-500/5" :
              agentRun.state === "fail"    ? "border-red-500/50 bg-red-500/5" :
              "border-border"
            }`} data-testid="agent-card-MCG-KB-INGEST-001">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" style={{ color: MCG_COLOR }} />
                  <span className="text-[10px] font-mono text-muted-foreground">MCG-KB-INGEST-001</span>
                </div>
                {agentRegistryId && (
                  <Link href={`/agents/${agentRegistryId}`}>
                    <span className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">
                      <ExternalLink className="w-3 h-3" /> Registry
                    </span>
                  </Link>
                )}
              </div>
              <div className="text-sm font-medium mb-1">Knowledge Base Ingestion Agent</div>
              {agentRun.state === "running" && (
                <div className="flex items-center gap-1.5 text-xs text-blue-400">
                  <Activity className="w-3 h-3 animate-pulse" />
                  Running on Claude…
                  {agentRun.toolCalls > 0 && <span className="text-muted-foreground">· {agentRun.toolCalls} tool calls</span>}
                </div>
              )}
              {agentRun.state === "ok" && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Complete · {agentRun.toolCalls} tool calls{elapsedSec ? ` · ${elapsedSec}s` : ""}
                </div>
              )}
              {agentRun.state === "fail" && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertTriangle className="w-3 h-3" /> Failed
                </div>
              )}
              {agentRun.state === "idle" && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Idle
                </div>
              )}
            </div>

            {/* Extraction node progress */}
            <div className="w-80 shrink-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">
                Extraction Nodes ({completedNodes.size}/8)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {EXTRACTION_NODES.map(node => {
                  const done = completedNodes.has(node);
                  const shortLabel = node.replace(/^(extract_|derive_|produce_)/, "").replace(/_/g, " ");
                  return (
                    <div key={node}
                      className={`text-[10px] px-2 py-1 rounded font-mono truncate transition-colors ${
                        done
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-muted/20 text-muted-foreground border border-transparent"
                      }`}
                      data-testid={`node-${node}`}
                    >
                      {done ? "✓ " : "· "}{shortLabel}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── QA Gate result ────────────────────────────────────────────────────── */}
        {qaResult && (
          <div className={`border rounded-lg p-5 ${
            qaResult.status === "QA_BLOCKED" ? "border-red-500/50 bg-red-500/5" :
            qaResult.status === "QA_WARN"    ? "border-amber-500/50 bg-amber-500/5" :
            "border-emerald-500/50 bg-emerald-500/5"
          }`} data-testid="qa-result-panel">
            <div className="flex items-center gap-3 mb-4">
              {qaStatusIcon}
              <span className={`font-semibold text-sm ${qaStatusColor}`}>
                QA {qaResult.status?.replace("_", " ") ?? ""}
              </span>
              {qaResult.qa_score != null && (
                <span className={`text-2xl font-bold tabular-nums ${qaStatusColor}`}>
                  {qaResult.qa_score}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </span>
              )}
              {qaResult.bundle_id && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  Bundle: {qaResult.bundle_id}
                </span>
              )}
            </div>

            {qaResult.hard_violations_count > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-red-400 font-medium mb-1">
                  Hard Violations ({qaResult.hard_violations_count})
                </div>
                <div className="text-xs text-red-300 bg-red-950/20 border border-red-500/20 rounded p-3">
                  {agentRun.summary?.hard_violations?.map((v: any, i: number) => (
                    <div key={i} className="mb-1 last:mb-0">
                      <span className="font-mono">[{v.rule_id ?? v.rule}]</span> {v.detail ?? v.description}
                    </div>
                  )) ?? <span className="text-red-300">{qaResult.hard_violations_count} hard violation(s) detected — bundle cannot be promoted.</span>}
                </div>
              </div>
            )}

            {qaResult.soft_warnings_count > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-amber-400 font-medium mb-1">
                  Warnings ({qaResult.soft_warnings_count})
                </div>
                <div className="text-xs text-amber-300/80 bg-amber-950/10 border border-amber-500/20 rounded p-3">
                  {agentRun.summary?.soft_warnings?.map((w: any, i: number) => (
                    <div key={i} className="mb-1 last:mb-0">
                      <span className="font-mono">[{w.rule_id ?? w.rule}]</span> {w.detail ?? w.description}
                    </div>
                  )) ?? <span>{qaResult.narrative}</span>}
                </div>
              </div>
            )}

            {qaResult.hard_violations_count === 0 && qaResult.soft_warnings_count === 0 && (
              <p className="text-xs text-emerald-300/80">{qaResult.narrative}</p>
            )}
          </div>
        )}

        {/* ── Bundle artifacts grid ─────────────────────────────────────────────── */}
        {agentRun.state === "ok" && agentRun.summary && (
          <div className="border rounded-lg overflow-hidden" data-testid="bundle-artifacts">
            <div className="flex items-center gap-2 px-5 pt-5 pb-3">
              <Package className="w-4 h-4" style={{ color: MCG_COLOR }} />
              <span className="font-semibold text-sm">Bundle Artifacts</span>
              <span className="text-xs text-muted-foreground">
                {agentRun.summary.artifacts_in_bundle ?? 12} / 12 required
              </span>
              {agentRun.summary.bundle_id && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {agentRun.summary.bundle_id} · v1.0.0
                </span>
              )}
            </div>

            {/* ── QA status banner (scenario-aware) ── */}
            {qaResult && (
              <div className={`mx-5 mb-3 px-3 py-2 rounded border flex items-start gap-2 text-xs ${
                qaResult.status === "QA_BLOCKED"
                  ? "bg-red-950/20 border-red-500/30 text-red-300"
                  : qaResult.status === "QA_WARN"
                  ? "bg-amber-950/20 border-amber-500/30 text-amber-300"
                  : "bg-emerald-950/20 border-emerald-500/20 text-emerald-300"
              }`} data-testid="qa-status-banner">
                <span className="mt-0.5 shrink-0">{qaStatusIcon}</span>
                <div>
                  <span className="font-semibold">
                    {qaResult.status === "QA_BLOCKED" ? "QA Blocked" :
                     qaResult.status === "QA_WARN"    ? "QA Passed with Warnings" :
                     "QA Passed"}
                  </span>
                  {qaResult.status !== "QA_BLOCKED" && (
                    <span className="ml-1.5 font-mono opacity-80">Score: {qaResult.qa_score} / 100</span>
                  )}
                  {qaResult.status === "QA_BLOCKED" && (
                    <span className="ml-1.5 opacity-80">
                      {qaResult.hard_violations_count} hard violation{qaResult.hard_violations_count !== 1 ? "s" : ""} detected — bundle cannot be promoted until resolved.
                    </span>
                  )}
                  {qaResult.status === "QA_WARN" && (
                    <span className="ml-1.5 opacity-80">
                      {qaResult.soft_warnings_count} warning{qaResult.soft_warnings_count !== 1 ? "s" : ""} — human acknowledgement required before promotion.
                    </span>
                  )}
                  {flaggedArtifacts.size > 0 && (
                    <div className="mt-1 opacity-70">
                      Affected artifacts: {[...flaggedArtifacts].join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 px-5 pb-4">
              {ARTIFACT_DEFS.map(def => {
                const isSelected = selectedArtifact === def.key;
                const isLoading  = artifactLoadingKey === def.key;
                const isFlagged  = flaggedArtifacts.has(def.key);
                const isWarned   = !isFlagged && warnedArtifacts.has(def.key);

                const baseStyle = isSelected
                  ? {}
                  : isFlagged
                  ? {}
                  : isWarned
                  ? {}
                  : {};

                const cardClass = isSelected
                  ? "border-current bg-background shadow-sm"
                  : isFlagged
                  ? "border-red-500/50 bg-red-950/15 hover:border-red-500/70"
                  : isWarned
                  ? "border-amber-500/40 bg-amber-950/10 hover:border-amber-500/60"
                  : "border-emerald-500/25 bg-emerald-500/8 hover:border-emerald-500/50 hover:bg-emerald-500/12";

                const cardStyle = isSelected
                  ? { borderColor: MCG_COLOR, color: MCG_COLOR }
                  : {};

                return (
                  <button
                    key={def.key}
                    onClick={() => handleArtifactClick(def.key)}
                    data-testid={`artifact-${def.key}`}
                    className={`text-left flex items-start gap-1.5 text-[11px] px-2.5 py-2 rounded border transition-all ${cardClass}`}
                    style={cardStyle}
                  >
                    {isLoading ? (
                      <Activity className="w-3 h-3 mt-0.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : isFlagged ? (
                      <XCircle className="w-3 h-3 mt-0.5 shrink-0 text-red-400" />
                    ) : isWarned ? (
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                    ) : (
                      <CheckCircle2
                        className={`w-3 h-3 mt-0.5 shrink-0 ${isSelected ? "" : "text-emerald-400"}`}
                        style={isSelected ? { color: MCG_COLOR } : {}}
                      />
                    )}
                    <div>
                      <div className={`font-medium leading-tight ${
                        isFlagged ? "text-red-300" : isWarned ? "text-amber-300" : isSelected ? "" : "text-foreground/80"
                      }`}>{def.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{def.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Artifact detail panel ── */}
            {selectedArtifact && selectedDef && (
              <div ref={detailPanelRef} className="border-t border-border mx-0">
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{selectedDef.label}</span>
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{selectedArtifact}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{selectedDef.description}</div>
                    </div>
                    <button
                      onClick={() => setSelectedArtifact(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-close-artifact-detail"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Loading skeleton while fetching */}
                  {artifactLoadingKey === selectedArtifact ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-3 bg-muted/40 rounded w-2/3" />
                      <div className="h-3 bg-muted/30 rounded w-full" />
                      <div className="h-3 bg-muted/30 rounded w-5/6" />
                      <div className="h-3 bg-muted/20 rounded w-3/4 mt-2" />
                      <div className="h-3 bg-muted/20 rounded w-full" />
                    </div>
                  ) : (
                    <ArtifactDetail
                      artifactKey={selectedArtifact}
                      artifactData={artifactData}
                      summary={agentRun.summary}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Human Promotion Gate ──────────────────────────────────────────────── */}
        {promotionGate && (
          <div className="border border-cyan-500/50 bg-cyan-500/5 rounded-lg p-5" data-testid="promotion-gate">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-sm text-cyan-300">Human Bundle Promotion Gate</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Bundle <span className="font-mono text-foreground">{promotionGate.bundle_id}</span> has passed QA
              {promotionGate.qa_score != null && ` (score: ${promotionGate.qa_score}/100)`} and is awaiting
              promotion by <strong>{promotionGate.reviewer}</strong>. Until promoted, no proposal agent can
              be bound to this bundle. Promotion is immutably recorded in the audit trail.
            </p>
            {promotionGate.requires_acknowledgement && (
              <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/20 border border-amber-500/20 rounded p-3 mb-4">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>This bundle has QA warnings (missing source hashes). By promoting, you acknowledge the reduced reproducibility guarantee.</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePromote}
                disabled={promoting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-50 transition-opacity"
                style={{ background: MCG_COLOR }}
                data-testid="button-promote"
              >
                {promoting
                  ? <><Activity className="w-4 h-4 animate-pulse" /> Promoting…</>
                  : <><ArrowUpCircle className="w-4 h-4" /> Promote Bundle to ACTIVE</>}
              </button>
              <span className="text-xs text-muted-foreground">Requires: {promotionGate.policy_ref}</span>
            </div>
          </div>
        )}

        {/* ── SSE Trace Log ─────────────────────────────────────────────────────── */}
        <div className="border rounded-lg overflow-hidden" data-testid="sse-trace-log">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
            onClick={() => setLogOpen(o => !o)}
            data-testid="button-toggle-log"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-mono font-medium uppercase tracking-wide text-muted-foreground">
                Agent SSE Trace Log
              </span>
              {events.length > 0 && (
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">
                  {events.length}
                </span>
              )}
            </div>
            {logOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {logOpen && (
            <div className="bg-black/90 font-mono text-xs p-4 h-72 overflow-y-auto">
              {events.length === 0 && (
                <div className="text-white/20 italic">Run the demo to see live agent SSE trace…</div>
              )}
              {events.map(ev => (
                <div key={ev.id} className="flex gap-2 mb-0.5 leading-relaxed">
                  <span className="text-white/25 shrink-0 tabular-nums">
                    {ev.timestamp.toTimeString().slice(0, 8)}
                  </span>
                  <span className={`shrink-0 font-semibold ${EVENT_COLORS[ev.type] ?? "text-white/60"}`}>
                    [{ev.type}]
                  </span>
                  <span className="text-white/80 break-all">{ev.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
