import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FlaskConical,
  FileText,
  GitCompare,
  ScrollText,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Shield,
} from "lucide-react";
import { DiffViewer, type DiffViewerProps } from "@/components/diff-viewer";
import { formatDate } from "@/components/shared-utils";

type EvidenceType = "eval" | "trace" | "policy-diff" | "audit" | "custom";

interface EvalResultData {
  suiteName: string;
  suiteId?: string;
  passRate: number;
  totalTests: number;
  passed: number;
  failed: number;
  environment?: string;
  runDate?: string;
  cases?: Array<{
    name: string;
    status: "pass" | "fail" | "skip";
    score?: number;
    detail?: string;
  }>;
}

interface TraceExcerptData {
  traceId: string;
  agentName?: string;
  input: string;
  output: string;
  latencyMs?: number;
  tokenCount?: number;
  timestamp?: string;
  steps?: Array<{
    tool: string;
    input?: string;
    output?: string;
    durationMs?: number;
  }>;
}

interface AuditRecordData {
  eventId: string;
  eventType: string;
  actor: string;
  timestamp: string;
  severity?: string;
  description?: string;
  metadata?: Record<string, any>;
  hashChain?: string;
}

interface EvidencePayload {
  type: EvidenceType;
  title: string;
  subtitle?: string;
  eval?: EvalResultData;
  trace?: TraceExcerptData;
  diff?: DiffViewerProps;
  audit?: AuditRecordData;
  customContent?: ReactNode;
}

interface EvidenceDrawerContextValue {
  open: (payload: EvidencePayload) => void;
  close: () => void;
  isOpen: boolean;
}

const EvidenceDrawerContext = createContext<EvidenceDrawerContextValue>({
  open: () => {},
  close: () => {},
  isOpen: false,
});

export function useEvidenceDrawer() {
  return useContext(EvidenceDrawerContext);
}

function EvalResultView({ data }: { data: EvalResultData }) {
  const passPercent = data.passRate ?? (data.totalTests > 0 ? (data.passed / data.totalTests) * 100 : 0);
  const isGood = passPercent >= 80;

  return (
    <div className="flex flex-col gap-4" data-testid="evidence-eval-result">
      <div className="flex items-center gap-3 flex-wrap">
        <FlaskConical className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">{data.suiteName}</span>
        {data.environment && (
          <Badge variant="outline" className="text-[11px]">{data.environment}</Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3 flex flex-col items-center">
          <span className="text-2xl font-bold">{passPercent.toFixed(1)}%</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pass Rate</span>
        </div>
        <div className="rounded-md border p-3 flex flex-col items-center">
          <span className="text-2xl font-bold text-green-600 dark:text-green-400">{data.passed}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Passed</span>
        </div>
        <div className="rounded-md border p-3 flex flex-col items-center">
          <span className="text-2xl font-bold text-red-600 dark:text-red-400">{data.failed}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</span>
        </div>
      </div>

      {data.runDate && (
        <span className="text-xs text-muted-foreground">Run: {formatDate(data.runDate)}</span>
      )}

      {data.cases && data.cases.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Test Cases</span>
          <div className="flex flex-col gap-1 max-h-60 overflow-auto">
            {data.cases.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border p-2"
                data-testid={`evidence-eval-case-${i}`}
              >
                {c.status === "pass" ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : c.status === "fail" ? (
                  <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-medium flex-1">{c.name}</span>
                {c.score !== undefined && (
                  <span className="text-xs text-muted-foreground">{(c.score * 100).toFixed(0)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TraceExcerptView({ data }: { data: TraceExcerptData }) {
  return (
    <div className="flex flex-col gap-4" data-testid="evidence-trace-excerpt">
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-mono text-muted-foreground">{data.traceId}</span>
        {data.agentName && (
          <Badge variant="outline" className="text-[11px]">{data.agentName}</Badge>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
        {data.timestamp && <span>{formatDate(data.timestamp)}</span>}
        {data.latencyMs !== undefined && <span>{data.latencyMs}ms</span>}
        {data.tokenCount !== undefined && <span>{data.tokenCount} tokens</span>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="rounded-md border p-3">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Input</span>
          <pre className="text-xs mt-1 whitespace-pre-wrap break-all font-mono max-h-32 overflow-auto">
            {data.input}
          </pre>
        </div>
        <div className="rounded-md border p-3">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Output</span>
          <pre className="text-xs mt-1 whitespace-pre-wrap break-all font-mono max-h-32 overflow-auto">
            {data.output}
          </pre>
        </div>
      </div>

      {data.steps && data.steps.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tool Calls</span>
          <div className="flex flex-col gap-1 max-h-48 overflow-auto">
            {data.steps.map((step, i) => (
              <div
                key={i}
                className="rounded-md border p-2 flex flex-col gap-1"
                data-testid={`evidence-trace-step-${i}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[11px]">{step.tool}</Badge>
                  {step.durationMs !== undefined && (
                    <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>
                  )}
                </div>
                {step.input && (
                  <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-16 overflow-auto">
                    {step.input}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditRecordView({ data }: { data: AuditRecordData }) {
  return (
    <div className="flex flex-col gap-4" data-testid="evidence-audit-record">
      <div className="flex items-center gap-2 flex-wrap">
        <ScrollText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">{data.eventType.replace(/_/g, " ")}</span>
        {data.severity && (
          <Badge
            variant="outline"
            className={`text-[11px] ${
              data.severity === "critical"
                ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                : data.severity === "high"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : ""
            }`}
          >
            {data.severity}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border p-3 flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Actor</span>
          <span className="text-sm">{data.actor}</span>
        </div>
        <div className="rounded-md border p-3 flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Timestamp</span>
          <span className="text-sm">{formatDate(data.timestamp)}</span>
        </div>
      </div>

      {data.description && (
        <div className="rounded-md border p-3 flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Description</span>
          <p className="text-sm">{data.description}</p>
        </div>
      )}

      {data.hashChain && (
        <div className="rounded-md border p-3 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-green-500 shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate flex-1">{data.hashChain}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => navigator.clipboard?.writeText(data.hashChain!)}
            data-testid="button-copy-hash"
          >
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      )}

      {data.metadata && Object.keys(data.metadata).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Metadata</span>
          <div className="rounded-md border p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
              {JSON.stringify(data.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyDiffView({ diff }: { diff: DiffViewerProps }) {
  return (
    <div className="flex flex-col gap-3" data-testid="evidence-policy-diff">
      <div className="flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Configuration Changes</span>
      </div>
      <DiffViewer {...diff} />
    </div>
  );
}

const typeIcons: Record<EvidenceType, typeof FlaskConical> = {
  eval: FlaskConical,
  trace: FileText,
  "policy-diff": GitCompare,
  audit: ScrollText,
  custom: ExternalLink,
};

export function EvidenceDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [payload, setPayload] = useState<EvidencePayload | null>(null);

  const open = useCallback((p: EvidencePayload) => {
    setPayload(p);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const Icon = payload ? typeIcons[payload.type] : FileText;

  return (
    <EvidenceDrawerContext.Provider value={{ open, close, isOpen }}>
      {children}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
          data-testid="panel-evidence-drawer"
        >
          {payload && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <SheetTitle className="text-base">{payload.title}</SheetTitle>
                </div>
                {payload.subtitle && (
                  <SheetDescription>{payload.subtitle}</SheetDescription>
                )}
              </SheetHeader>

              <div className="mt-6 flex flex-col gap-4">
                {payload.type === "eval" && payload.eval && (
                  <EvalResultView data={payload.eval} />
                )}
                {payload.type === "trace" && payload.trace && (
                  <TraceExcerptView data={payload.trace} />
                )}
                {payload.type === "policy-diff" && payload.diff && (
                  <PolicyDiffView diff={payload.diff} />
                )}
                {payload.type === "audit" && payload.audit && (
                  <AuditRecordView data={payload.audit} />
                )}
                {payload.type === "custom" && payload.customContent}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </EvidenceDrawerContext.Provider>
  );
}

export type { EvidencePayload, EvidenceType, EvalResultData, TraceExcerptData, AuditRecordData };
