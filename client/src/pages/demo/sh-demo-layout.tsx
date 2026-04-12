import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Brain,
  Cpu,
  FileText,
  Loader2,
  Shield,
  Wrench,
  Zap,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Lock,
} from "lucide-react";
import type { HealingPipeline } from "@shared/schema";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SHScenarioConfig {
  scenario: string;
  title: string;
  subtitle: string;
  domain: string;
  agentCode: string;
  pipelineId: string;
  agentId: string;
  accentColor: string;
  complianceFrameworks: string[];
}

// ─── Stage map ────────────────────────────────────────────────────────────────

const STAGES = [
  { dbKey: "detected",    label: "Detect",      icon: Activity  },
  { dbKey: "diagnosed",   label: "Diagnose",    icon: Brain     },
  { dbKey: "hypothesis",  label: "Hypothesize", icon: Cpu       },
  { dbKey: "remediation", label: "Remediate",   icon: Wrench    },
  { dbKey: "resolved",    label: "Validate",    icon: Shield    },
] as const;

function stageIndex(dbKey: string): number {
  const idx = STAGES.findIndex(s => s.dbKey === dbKey);
  return idx >= 0 ? idx : 0;
}

// ─── JSONB field helpers (type-safe, no `any`) ────────────────────────────────

function asRecord(val: unknown): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
  return {};
}

function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string");
  return [];
}

function asRecordArray(val: unknown): Record<string, string>[] {
  if (Array.isArray(val)) return val.filter((v): v is Record<string, string> => v !== null && typeof v === "object" && !Array.isArray(v));
  return [];
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  high:     "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  medium:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  low:      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide ${color ?? "bg-muted text-muted-foreground border-border"}`}>
      {label}
    </span>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {(title || Icon) && (
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

// ─── Stage Progress Bar ───────────────────────────────────────────────────────

function StageProgress({
  pipeline,
  activeIdx,
  onStage,
}: {
  pipeline: HealingPipeline;
  activeIdx: number;
  onStage: (idx: number) => void;
}) {
  const liveIdx = stageIndex(pipeline.stage);
  return (
    <div className="flex items-center w-full gap-0">
      {STAGES.map((s, idx) => {
        const Icon      = s.icon;
        const isDone    = idx < liveIdx;
        const isLive    = idx === liveIdx;
        const isViewing = idx === activeIdx;
        return (
          <div key={s.dbKey} className="flex items-center flex-1 min-w-0">
            <button
              data-testid={`stage-${s.dbKey}`}
              onClick={() => onStage(idx)}
              title={s.label}
              className={`flex items-center gap-1.5 flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer min-w-0 ${
                isViewing && isDone ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 ring-1 ring-green-400" :
                isViewing && isLive ? "bg-primary/10 text-primary ring-1 ring-primary/30" :
                isViewing           ? "bg-muted text-foreground ring-1 ring-border" :
                isDone              ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-200" :
                isLive              ? "bg-primary/5 text-primary hover:bg-primary/10" :
                                      "bg-muted/40 text-muted-foreground hover:bg-muted/70"
              }`}
            >
              <span className="shrink-0">
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="truncate hidden sm:inline">{s.label}</span>
              {isLive && (
                <span className="ml-auto shrink-0 hidden sm:flex">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                </span>
              )}
            </button>
            {idx < STAGES.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Persistent Issue Summary Card ───────────────────────────────────────────

function IssueSummaryCard({ pipeline, config }: { pipeline: HealingPipeline; config: SHScenarioConfig }) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Chip label={pipeline.severity} color={SEVERITY_STYLES[pipeline.severity] || SEVERITY_STYLES.medium} />
            <Chip label={pipeline.stage} />
            <span className="text-[10px] text-muted-foreground font-mono">{config.agentCode}</span>
          </div>
          <h2 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-0.5">{pipeline.title}</h2>
          <p className="text-xs text-red-700 dark:text-red-300 mb-1">{config.subtitle}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span><strong className="text-foreground">Type:</strong> {pipeline.issueType}</span>
            <span><strong className="text-foreground">Industry:</strong> {pipeline.industry}</span>
            <span><strong className="text-foreground">Priority:</strong> {pipeline.priority}</span>
          </div>
          {pipeline.issueDescription && (
            <p className="text-xs text-red-800 dark:text-red-200 mt-2 leading-relaxed">{pipeline.issueDescription}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stage Content Panels ─────────────────────────────────────────────────────

function StageDetect({ pipeline }: { pipeline: HealingPipeline }) {
  return (
    <Panel title="Detection Metadata" icon={Clock}>
      <div className="grid grid-cols-2 gap-3">
        <KV label="Status" value={<Chip label={pipeline.status} />} />
        {pipeline.triggerSource && <KV label="Trigger Source" value={pipeline.triggerSource} />}
        {pipeline.detectedAt && (
          <KV label="Detected At" value={new Date(pipeline.detectedAt).toLocaleString()} />
        )}
      </div>
    </Panel>
  );
}

function StageDiagnose({ pipeline }: { pipeline: HealingPipeline }) {
  const details  = asRecord(pipeline.diagnosisDetails);
  const rootCause = typeof details.rootCause === "string" ? details.rootCause : null;
  const extra = Object.entries(details).filter(([k]) => !["rootCause", "skillsInvoked", "atlasSkillsInvoked"].includes(k));

  return (
    <Panel title="Root Cause Analysis" icon={Brain}>
      {rootCause ? (
        <p className="text-sm leading-relaxed">{rootCause}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Root cause analysis pending — diagnosis in progress.</p>
      )}
      {extra.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          {extra.map(([k, v]) => (
            <KV
              key={k}
              label={k.replace(/([A-Z])/g, " $1").trim()}
              value={typeof v === "string" || typeof v === "number"
                ? String(v)
                : <span className="text-xs font-mono text-muted-foreground">{JSON.stringify(v)}</span>
              }
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function StageHypothesize({ pipeline }: { pipeline: HealingPipeline }) {
  const hyp        = asRecord(pipeline.hypothesis);
  const primary    = typeof hyp.primaryHypothesis === "string" ? hyp.primaryHypothesis : null;
  const confidence = typeof hyp.confidence === "number" ? hyp.confidence : null;
  const candidates = asRecordArray(hyp.runbookCandidates);

  return (
    <div className="space-y-4">
      <Panel title="Primary Hypothesis" icon={Cpu}>
        {primary ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed">{primary}</p>
            {confidence !== null && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Confidence</span>
                <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, confidence * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold">{Math.round(confidence * 100)}%</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Hypothesis formation pending diagnosis completion.</p>
        )}
      </Panel>

      {candidates.length > 0 && (
        <Panel title="Runbook Candidates" icon={FileText}>
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-semibold mb-1">{c.runbookName}</p>
                {c.triggerCondition && <p className="text-[11px] text-muted-foreground mb-0.5"><strong>Trigger:</strong> {c.triggerCondition}</p>}
                {c.expectedOutcome  && <p className="text-[11px] text-muted-foreground"><strong>Outcome:</strong> {c.expectedOutcome}</p>}
                {c.estimatedDuration && <p className="text-[10px] text-muted-foreground mt-1">Est. {c.estimatedDuration}</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function StageRemediate({ pipeline }: { pipeline: HealingPipeline }) {
  const rem    = asRecord(pipeline.remediation);
  const status = typeof rem.status === "string" ? rem.status : null;

  return (
    <Panel title="Remediation Status" icon={Wrench}>
      {status ? (
        <div className="space-y-1">
          <Chip label={status} color="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" />
          <p className="text-xs text-muted-foreground">Autonomous actions executing — see Platform Intelligence panel for details.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Remediation activates after hypothesis is confirmed.</p>
      )}
    </Panel>
  );
}

function StageValidate({ pipeline }: { pipeline: HealingPipeline }) {
  const res           = asRecord(pipeline.resolution);
  const atlasActions  = asStringArray(res.atlasAutonomousActions);
  const humanActions  = asStringArray(res.requiresHumanAction);

  return (
    <Panel title="Resolution Timeline" icon={Clock}>
      {atlasActions.length > 0 ? (
        <ul className="space-y-2">
          {atlasActions.map((action, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              <span>{action}</span>
            </li>
          ))}
          {humanActions.map((action, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Resolution data available after remediation completes.</p>
      )}
      {pipeline.resolvedAt && (
        <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
          Resolved {new Date(pipeline.resolvedAt).toLocaleString()}
        </p>
      )}
    </Panel>
  );
}

// ─── Platform Intelligence Panel — 3 tabs, stage-aware ───────────────────────

type PITab = "skills" | "runbooks" | "policies";

const PI_TAB_DEFAULTS: Record<number, PITab> = {
  0: "skills", 1: "skills", 2: "runbooks", 3: "runbooks", 4: "policies",
};

function PlatformIntelligencePanel({ pipeline, activeIdx }: { pipeline: HealingPipeline; activeIdx: number }) {
  const [tab, setTab] = useState<PITab>(PI_TAB_DEFAULTS[activeIdx] || "skills");

  useEffect(() => {
    setTab(PI_TAB_DEFAULTS[activeIdx] || "skills");
  }, [activeIdx]);

  const diagnosis   = asRecord(pipeline.diagnosisDetails);
  const remediation = asRecord(pipeline.remediation);
  const guardrails  = asRecordArray(pipeline.industryGuardrails);

  const skills = [
    ...asRecordArray(diagnosis.skillsInvoked),
    ...asRecordArray(diagnosis.atlasSkillsInvoked),
  ] as Array<{ skillName: string; finding: string; duration?: string }>;

  const runbooks = asRecordArray(remediation.runbooksTriggered) as Array<{
    runbookName: string; status?: string; result?: string;
  }>;

  const policies = [
    ...(asRecordArray(remediation.policiesEnforced) as Array<{
      policyName?: string; rule?: string; decision?: string; outcome?: string;
    }>),
    ...guardrails.map(g => ({
      policyName: g.framework, rule: g.constraint, decision: g.status, outcome: "",
    })),
  ];

  const TABS: { key: PITab; label: string; count: number; icon: React.ElementType }[] = [
    { key: "skills",   label: "Skills",   count: skills.length,   icon: Zap      },
    { key: "runbooks", label: "Runbooks", count: runbooks.length, icon: BookOpen },
    { key: "policies", label: "Policies", count: policies.length, icon: Lock     },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold">Platform Intelligence in Action</span>
      </div>
      <div className="flex border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            data-testid={`pi-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-primary text-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
            }`}
          >
            <t.icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{t.label}</span>
            {t.count > 0 && (
              <span className="ml-0.5 bg-muted rounded-full px-1 text-[9px] font-bold">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
        {tab === "skills" && (
          skills.length > 0 ? skills.map((sk, i) => (
            <div key={i} className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 truncate">{sk.skillName}</span>
                {sk.duration && <span className="ml-auto text-[10px] text-amber-600/70 shrink-0">{sk.duration}</span>}
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">{sk.finding}</p>
            </div>
          )) : <p className="text-xs text-muted-foreground py-1">Skills analysis populates after detection.</p>
        )}

        {tab === "runbooks" && (
          runbooks.length > 0 ? runbooks.map((rb, i) => (
            <div key={i} className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <BookOpen className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 truncate">{rb.runbookName}</span>
              </div>
              {rb.status && <p className="text-[11px] text-purple-600 dark:text-purple-400">{rb.status}</p>}
              {rb.result && <p className="text-[11px] text-purple-800 dark:text-purple-200 mt-1">{rb.result}</p>}
            </div>
          )) : <p className="text-xs text-muted-foreground py-1">Runbooks trigger during remediation.</p>
        )}

        {tab === "policies" && (
          policies.length > 0 ? policies.map((p, i) => {
            const isOk = typeof p.decision === "string" && (p.decision.toLowerCase().includes("compliant") || p.decision.toLowerCase().includes("pass"));
            return (
              <div key={i} className={`rounded-lg border p-2.5 ${isOk ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-muted/40 border-border"}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Lock className={`h-3 w-3 shrink-0 ${isOk ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
                  <span className={`text-[11px] font-semibold truncate ${isOk ? "text-green-700 dark:text-green-300" : "text-foreground"}`}>{p.policyName}</span>
                </div>
                {p.rule && <p className="text-[11px] text-muted-foreground">{p.rule}</p>}
                {(p.decision || p.outcome) && (
                  <p className={`text-[11px] mt-0.5 font-medium ${isOk ? "text-green-700 dark:text-green-300" : "text-foreground"}`}>
                    {[p.decision, p.outcome].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>
            );
          }) : <p className="text-xs text-muted-foreground py-1">Policy enforcement runs alongside remediation.</p>
        )}
      </div>
    </div>
  );
}

// ─── Business Impact Panel ────────────────────────────────────────────────────

function BusinessImpactPanel({ pipeline }: { pipeline: HealingPipeline }) {
  const impact = asRecord(pipeline.businessImpact);
  const entries = Object.entries(impact).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;

  return (
    <Panel title="Business Impact" icon={TrendingUp}>
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <KV
            key={k}
            label={k.replace(/([A-Z])/g, " $1").trim()}
            value={typeof v === "string" ? v : JSON.stringify(v)}
          />
        ))}
      </div>
    </Panel>
  );
}

// ─── With Atlas vs Without Atlas Card ────────────────────────────────────────

function AtlasComparisonCard({ pipeline }: { pipeline: HealingPipeline }) {
  const impact       = asRecord(pipeline.businessImpact);
  const res          = asRecord(pipeline.resolution);
  const withAtlas    = typeof impact.withAtlas === "string" ? impact.withAtlas : "";
  const withoutAtlas = typeof impact.withoutAtlas === "string"
    ? impact.withoutAtlas
    : typeof res.withoutAtlas === "string"
      ? res.withoutAtlas
      : "";

  if (!withAtlas && !withoutAtlas) return null;

  return (
    <Panel title="With Atlas vs Without Atlas" icon={Activity}>
      <div className="space-y-2">
        {withAtlas && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="text-[11px] font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">With Atlas</span>
            </div>
            <p className="text-xs text-green-800 dark:text-green-200 leading-relaxed">{withAtlas}</p>
          </div>
        )}
        {withoutAtlas && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span className="text-[11px] font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">Without Atlas</span>
            </div>
            <p className="text-xs text-red-800 dark:text-red-200 leading-relaxed">{withoutAtlas}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── Industry Guardrails Panel ────────────────────────────────────────────────

function IndustryGuardrailsPanel({ pipeline }: { pipeline: HealingPipeline }) {
  const guardrails = asRecordArray(pipeline.industryGuardrails);
  if (guardrails.length === 0) return null;

  return (
    <Panel title="Industry Guardrails" icon={Shield}>
      <div className="space-y-2">
        {guardrails.map((g, i) => (
          <div key={i} className="rounded-lg bg-muted/40 p-2.5 flex items-start gap-2.5">
            <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-semibold">{g.framework}</p>
              <p className="text-[11px] text-muted-foreground">{g.constraint}</p>
              {g.status && (
                <Chip
                  label={g.status}
                  color="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ config }: { config: SHScenarioConfig }) {
  return (
    <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Activity className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No Healing Pipeline Data</h2>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
        No active healing pipeline found for <strong>{config.title}</strong>.
        Atlas will automatically create and populate this pipeline when an incident is detected in the{" "}
        <strong>{config.domain}</strong> environment.
      </p>
      <div className="flex justify-center pt-2">
        <Link href="/demo">
          <Button data-testid="button-back-to-demos" variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Demo Center
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function SHDemoLayout({ config }: { config: SHScenarioConfig }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Step 1: search agents by agentCode
  const { data: agentSearchResult = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: [`/api/agents?search=${encodeURIComponent(config.agentCode)}`],
    retry: 1,
  });
  const resolvedAgentId = agentSearchResult.find(a => a.name === config.title)?.id;

  // Step 2: fetch all healing pipelines; filter by resolved agentId
  const { data: allPipelines, isLoading } = useQuery<HealingPipeline[]>({
    queryKey: ["/api/healing-pipelines"],
    retry: 1,
  });
  const pipeline = allPipelines?.find(p => resolvedAgentId ? p.agentId === resolvedAgentId : p.agentId === config.agentId) ?? null;

  // Bind active stage to pipeline.stage on first load; manual override afterward
  useEffect(() => {
    if (pipeline && activeIdx === null) {
      setActiveIdx(stageIndex(pipeline.stage));
    }
  }, [pipeline, activeIdx]);

  const currentIdx = activeIdx ?? 0;
  const stageCount = STAGES.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/demo">
            <Button data-testid="button-back" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Demo Center
            </Button>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold truncate">{config.title}</span>
              <Badge variant="outline" className="text-[10px] shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                Self-Healing
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">{config.domain}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">{config.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !pipeline ? (
          <EmptyState config={config} />
        ) : (
          <div className="space-y-5">
            {/* Persistent issue summary — always visible */}
            <IssueSummaryCard pipeline={pipeline} config={config} />

            {/* Stage progress bar */}
            <StageProgress pipeline={pipeline} activeIdx={currentIdx} onStage={setActiveIdx} />

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left (2/3): stage content */}
              <div className="lg:col-span-2 space-y-4">
                {currentIdx === 0 && <StageDetect pipeline={pipeline} />}
                {currentIdx === 1 && <StageDiagnose pipeline={pipeline} />}
                {currentIdx === 2 && <StageHypothesize pipeline={pipeline} />}
                {currentIdx === 3 && <StageRemediate pipeline={pipeline} />}
                {currentIdx === 4 && <StageValidate pipeline={pipeline} />}

                {/* Navigation */}
                <div className="flex items-center gap-3">
                  <Button
                    data-testid="button-prev-stage"
                    variant="outline"
                    size="sm"
                    disabled={currentIdx === 0}
                    onClick={() => setActiveIdx(i => Math.max(0, (i ?? 0) - 1))}
                    className="flex-1 sm:flex-none"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground flex-1 text-center">
                    Stage {currentIdx + 1} of {stageCount} — <strong>{STAGES[currentIdx].label}</strong>
                  </span>
                  <Button
                    data-testid="button-next-stage"
                    variant={currentIdx < stageCount - 1 ? "default" : "outline"}
                    size="sm"
                    disabled={currentIdx === stageCount - 1}
                    onClick={() => setActiveIdx(i => Math.min(stageCount - 1, (i ?? 0) + 1))}
                    className="flex-1 sm:flex-none"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Right (1/3): persistent intelligence panels */}
              <div className="space-y-4">
                <PlatformIntelligencePanel pipeline={pipeline} activeIdx={currentIdx} />
                <BusinessImpactPanel pipeline={pipeline} />
                <AtlasComparisonCard pipeline={pipeline} />
                <IndustryGuardrailsPanel pipeline={pipeline} />
                <Panel title="Compliance" icon={Shield}>
                  <div className="flex flex-wrap gap-1.5">
                    {config.complianceFrameworks.map(fw => (
                      <Badge key={fw} variant="outline" className="text-[10px] font-medium">{fw}</Badge>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
