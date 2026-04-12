import { useState } from "react";
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
} from "lucide-react";
import type { HealingPipeline } from "@shared/schema";

// ─── Scenario Config ──────────────────────────────────────────────────────────

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

// ─── Stage Definitions ────────────────────────────────────────────────────────

const STAGES = [
  { key: "detect",     label: "Detect",     icon: Activity,    step: 1 },
  { key: "diagnose",   label: "Diagnose",   icon: Brain,       step: 2 },
  { key: "hypothesize",label: "Hypothesize",icon: Cpu,         step: 3 },
  { key: "remediate",  label: "Remediate",  icon: Wrench,      step: 4 },
  { key: "validate",   label: "Validate",   icon: Shield,      step: 5 },
] as const;

type StageKey = typeof STAGES[number]["key"];

// ─── Utility ──────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  high:     "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  medium:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  low:      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide ${color || "bg-muted text-muted-foreground border-border"}`}>
      {label}
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

// ─── Stage Progress Bar ───────────────────────────────────────────────────────

function StageProgress({ activeIdx, onStage }: { activeIdx: number; onStage: (idx: number) => void }) {
  return (
    <div className="flex items-center w-full gap-0">
      {STAGES.map((s, idx) => {
        const Icon = s.icon;
        const done = idx < activeIdx;
        const active = idx === activeIdx;
        return (
          <div key={s.key} className="flex items-center flex-1 min-w-0">
            <button
              data-testid={`stage-${s.key}`}
              onClick={() => onStage(idx)}
              className={`flex items-center gap-1.5 flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer min-w-0 ${
                done   ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40" :
                active ? "bg-primary/10 text-primary ring-1 ring-primary/30" :
                         "bg-muted/40 text-muted-foreground hover:bg-muted/70"
              }`}
            >
              <span className="shrink-0">
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="truncate hidden sm:inline capitalize">{s.label}</span>
              <span className="sm:hidden text-[10px]">{s.step}</span>
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

// ─── Platform Intelligence Panel ─────────────────────────────────────────────

function PlatformIntelligencePanel({ pipeline }: { pipeline: HealingPipeline }) {
  const diagnosis = (pipeline.diagnosisDetails as Record<string, unknown>) || {};
  const guardrails = (pipeline.industryGuardrails as Array<Record<string, string>>) || [];
  const skills: Array<{ skillName: string; finding: string; duration?: string }> = [
    ...((diagnosis.skillsInvoked || []) as Array<{ skillName: string; finding: string; duration?: string }>),
    ...((diagnosis.atlasSkillsInvoked || []) as Array<{ skillName: string; finding: string; duration?: string }>),
  ];

  return (
    <Section title="Platform Intelligence in Action" icon={Zap}>
      {skills.length > 0 ? (
        <div className="space-y-2">
          {skills.map((sk, i) => (
            <div key={i} className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 truncate">{sk.skillName}</span>
                {sk.duration && <span className="ml-auto text-[10px] text-amber-600/70 dark:text-amber-400/70 shrink-0">{sk.duration}</span>}
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">{sk.finding}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Skills analysis available after diagnosis phase.</p>
      )}

      {guardrails.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Regulatory Guardrails</p>
          {guardrails.map((g, i) => (
            <div key={i} className="rounded-lg bg-muted/40 p-2 flex items-start gap-2">
              <Shield className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold">{g.framework}</p>
                <p className="text-[11px] text-muted-foreground">{g.constraint}</p>
                <Chip label={g.status || "active"} color="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Business Impact Panel ────────────────────────────────────────────────────

function BusinessImpactPanel({ pipeline }: { pipeline: HealingPipeline }) {
  const impact = (pipeline.businessImpact as Record<string, string>) || {};
  const withAtlas = impact.withAtlas || "";
  const withoutAtlas = impact.withoutAtlas || "";

  if (!withAtlas && !withoutAtlas) return null;

  return (
    <Section title="Business Impact" icon={TrendingUp}>
      <div className="grid grid-cols-1 gap-2">
        {withAtlas && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="text-[11px] font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">With Atlas</span>
            </div>
            <p className="text-xs text-green-800 dark:text-green-200 leading-relaxed">{withAtlas}</p>
          </div>
        )}
        {withoutAtlas && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span className="text-[11px] font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">Without Atlas</span>
            </div>
            <p className="text-xs text-red-800 dark:text-red-200 leading-relaxed">{withoutAtlas}</p>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Stage Content Panels ─────────────────────────────────────────────────────

function StageDetect({ pipeline }: { pipeline: HealingPipeline }) {
  return (
    <div className="space-y-4">
      <Section title="Incident Detected" icon={AlertTriangle}>
        <div className="grid grid-cols-2 gap-3">
          <KV label="Severity" value={
            <Chip label={pipeline.severity} color={SEVERITY_STYLES[pipeline.severity] || SEVERITY_STYLES.medium} />
          } />
          <KV label="Issue Type" value={pipeline.issueType} />
          <KV label="Industry" value={pipeline.industry} />
          <KV label="Agent" value={<span className="font-mono">{pipeline.agentName}</span>} />
        </div>
        {pipeline.issueDescription && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-foreground leading-relaxed">{pipeline.issueDescription}</p>
          </div>
        )}
      </Section>

      <Section title="Detection Context" icon={Clock}>
        <div className="grid grid-cols-2 gap-3">
          <KV label="Status" value={<Chip label={pipeline.status} />} />
          <KV label="Priority" value={<Chip label={pipeline.priority} />} />
          {pipeline.triggerSource && <KV label="Trigger Source" value={pipeline.triggerSource} />}
          {pipeline.detectedAt && (
            <KV label="Detected At" value={new Date(pipeline.detectedAt).toLocaleString()} />
          )}
        </div>
      </Section>
    </div>
  );
}

function StageDiagnose({ pipeline }: { pipeline: HealingPipeline }) {
  const details = (pipeline.diagnosisDetails as Record<string, unknown>) || {};
  const rootCause = details.rootCause as string | undefined;

  return (
    <div className="space-y-4">
      <Section title="Root Cause Analysis" icon={Brain}>
        {rootCause ? (
          <>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Root Cause</p>
            <p className="text-sm leading-relaxed">{rootCause}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Diagnosis analysis will appear here after the detection phase.</p>
        )}
      </Section>

      {Object.keys(details).filter(k => !["rootCause", "skillsInvoked", "atlasSkillsInvoked"].includes(k)).length > 0 && (
        <Section title="Diagnosis Details" icon={FileText}>
          <div className="space-y-2">
            {Object.entries(details)
              .filter(([k]) => !["rootCause", "skillsInvoked", "atlasSkillsInvoked"].includes(k))
              .map(([key, val]) => (
                <KV key={key} label={key.replace(/([A-Z])/g, " $1").trim()} value={
                  typeof val === "string" || typeof val === "number"
                    ? String(val)
                    : <span className="text-xs text-muted-foreground font-mono">{JSON.stringify(val)}</span>
                } />
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StageHypothesize({ pipeline }: { pipeline: HealingPipeline }) {
  const hyp = (pipeline.hypothesis as Record<string, unknown>) || {};
  const primary = hyp.primaryHypothesis as string | undefined;
  const confidence = hyp.confidence as number | undefined;
  const candidates = (hyp.runbookCandidates as Array<Record<string, string>>) || [];

  return (
    <div className="space-y-4">
      <Section title="Primary Hypothesis" icon={Cpu}>
        {primary ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed">{primary}</p>
            {confidence !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Confidence</span>
                <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
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
      </Section>

      {candidates.length > 0 && (
        <Section title="Runbook Candidates" icon={FileText}>
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-semibold mb-1">{c.runbookName}</p>
                {c.triggerCondition && <p className="text-[11px] text-muted-foreground mb-1"><strong>Trigger:</strong> {c.triggerCondition}</p>}
                {c.expectedOutcome && <p className="text-[11px] text-muted-foreground"><strong>Outcome:</strong> {c.expectedOutcome}</p>}
                {c.estimatedDuration && <p className="text-[10px] text-muted-foreground mt-1">Est. {c.estimatedDuration}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StageRemediate({ pipeline }: { pipeline: HealingPipeline }) {
  const rem = (pipeline.remediation as Record<string, unknown>) || {};
  const status = rem.status as string | undefined;
  const runbooks = (rem.runbooksTriggered as Array<Record<string, string>>) || [];
  const policies = (rem.policiesEnforced as Array<Record<string, string>>) || [];

  return (
    <div className="space-y-4">
      <Section title="Remediation Status" icon={Wrench}>
        {status ? (
          <div className="flex items-center gap-2">
            <Chip label={status} color="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Remediation will activate after hypothesis is confirmed.</p>
        )}
      </Section>

      {runbooks.length > 0 && (
        <Section title="Runbooks Triggered" icon={FileText}>
          <div className="space-y-2">
            {runbooks.map((rb, i) => (
              <div key={i} className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-2.5">
                <p className="text-xs font-semibold text-purple-800 dark:text-purple-200 mb-0.5">{rb.runbookName}</p>
                <p className="text-[11px] text-purple-700 dark:text-purple-300">{rb.status}</p>
                {rb.result && <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1">{rb.result}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {policies.length > 0 && (
        <Section title="Policies Enforced" icon={Shield}>
          <div className="space-y-2">
            {policies.map((p, i) => (
              <div key={i} className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-2.5">
                <p className="text-xs font-semibold text-green-800 dark:text-green-200 mb-0.5">{p.policyName}</p>
                {p.rule && <p className="text-[11px] text-green-700 dark:text-green-300">{p.rule}</p>}
                <p className="text-[11px] font-medium text-green-600 dark:text-green-400 mt-0.5">{p.decision} — {p.outcome}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StageValidate({ pipeline }: { pipeline: HealingPipeline }) {
  const res = (pipeline.resolution as Record<string, unknown>) || {};
  const atlasActions = (res.atlasAutonomousActions as string[]) || [];
  const humanActions = (res.requiresHumanAction as string[]) || [];
  const withoutAtlas = res.withoutAtlas as string | undefined;

  return (
    <div className="space-y-4">
      {atlasActions.length > 0 && (
        <Section title="Atlas Autonomous Actions" icon={Zap}>
          <ul className="space-y-1.5">
            {atlasActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {humanActions.length > 0 && (
        <Section title="Human Actions Required" icon={FileText}>
          <ul className="space-y-1.5">
            {humanActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {withoutAtlas && (
        <Section title="Without Atlas — Counterfactual" icon={TrendingDown}>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-800 dark:text-red-200 leading-relaxed">{withoutAtlas}</p>
          </div>
        </Section>
      )}

      {atlasActions.length === 0 && humanActions.length === 0 && !withoutAtlas && (
        <Section title="Validation" icon={Shield}>
          <p className="text-sm text-muted-foreground">Resolution data will be available after remediation completes.</p>
        </Section>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ config }: { config: SHScenarioConfig }) {
  return (
    <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Activity className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No Healing Pipeline Data</h2>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
        The self-healing pipeline for <strong>{config.title}</strong> has not been initialized yet.
        Atlas will automatically create and populate this pipeline when an incident is detected in the{" "}
        <strong>{config.domain}</strong> environment.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
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
  const [activeStageIdx, setActiveStageIdx] = useState(0);

  const { data: pipeline, isLoading, isError } = useQuery<HealingPipeline>({
    queryKey: ["/api/healing-pipelines", config.pipelineId],
    enabled: !!config.pipelineId,
    retry: 1,
  });

  const { data: agent } = useQuery<{ name: string; agentType: string; industry: string }>({
    queryKey: ["/api/agents", config.agentId],
    enabled: !!config.agentId,
    retry: 1,
  });

  const stageCount = STAGES.length;
  const canPrev = activeStageIdx > 0;
  const canNext = activeStageIdx < stageCount - 1;

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
              <Badge variant="outline" className="text-[10px] shrink-0 border-primary/40 text-primary">Self-Healing</Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">{config.domain}</Badge>
              <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">{config.agentCode}</span>
            </div>
          </div>
          {agent && (
            <div className="shrink-0 hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              <span>{agent.name || config.title}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !pipeline ? (
          <EmptyState config={config} />
        ) : (
          <div className="space-y-5">
            {/* Incident summary bar */}
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-center gap-4">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-900 dark:text-red-100 truncate">{pipeline.title}</p>
                <p className="text-xs text-red-700 dark:text-red-300">{pipeline.issueType} · {pipeline.industry}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Chip label={pipeline.severity} color={SEVERITY_STYLES[pipeline.severity] || SEVERITY_STYLES.medium} />
                <Chip label={pipeline.stage} />
              </div>
            </div>

            {/* Stage progress */}
            <StageProgress activeIdx={activeStageIdx} onStage={setActiveStageIdx} />

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: stage content */}
              <div className="lg:col-span-2 space-y-4">
                {activeStageIdx === 0 && <StageDetect pipeline={pipeline} />}
                {activeStageIdx === 1 && <StageDiagnose pipeline={pipeline} />}
                {activeStageIdx === 2 && <StageHypothesize pipeline={pipeline} />}
                {activeStageIdx === 3 && <StageRemediate pipeline={pipeline} />}
                {activeStageIdx === 4 && <StageValidate pipeline={pipeline} />}

                {/* Stage navigation */}
                <div className="flex items-center gap-3">
                  <Button
                    data-testid="button-prev-stage"
                    variant="outline"
                    size="sm"
                    disabled={!canPrev}
                    onClick={() => setActiveStageIdx(i => i - 1)}
                    className="flex-1 sm:flex-none"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground flex-1 text-center">
                    Stage {activeStageIdx + 1} of {stageCount}: <strong>{STAGES[activeStageIdx].label}</strong>
                  </span>
                  <Button
                    data-testid="button-next-stage"
                    variant={canNext ? "default" : "outline"}
                    size="sm"
                    disabled={!canNext}
                    onClick={() => setActiveStageIdx(i => i + 1)}
                    className="flex-1 sm:flex-none"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Right: intelligence panels */}
              <div className="space-y-4">
                <PlatformIntelligencePanel pipeline={pipeline} />
                <BusinessImpactPanel pipeline={pipeline} />

                {/* Compliance */}
                <Section title="Compliance Frameworks" icon={Shield}>
                  <div className="flex flex-wrap gap-1.5">
                    {config.complianceFrameworks.map(fw => (
                      <Badge key={fw} variant="outline" className="text-[10px] font-medium">{fw}</Badge>
                    ))}
                  </div>
                </Section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
