import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, GitCompare, Layers, ArrowLeftRight } from "lucide-react";

type DiffMode = "blueprint" | "policy" | "release" | "generic";

interface DiffLine {
  type: "added" | "removed" | "unchanged" | "header";
  content: string;
  lineNumber?: number;
}

interface BlueprintNodeDiff {
  nodeId: string;
  name: string;
  status: "added" | "removed" | "modified" | "unchanged";
  changes?: string[];
  before?: Record<string, any>;
  after?: Record<string, any>;
}

interface PolicyRuleDiff {
  ruleId: string;
  name: string;
  status: "added" | "removed" | "modified" | "unchanged";
  field?: string;
  before?: string;
  after?: string;
}

interface ReleaseConfigDiff {
  field: string;
  label: string;
  before: string | number;
  after: string | number;
  category?: "routing" | "canary" | "rollback" | "general";
}

interface DiffViewerProps {
  mode: DiffMode;
  title?: string;
  versionA?: string;
  versionB?: string;
  blueprintNodes?: BlueprintNodeDiff[];
  rawJsonA?: Record<string, any>;
  rawJsonB?: Record<string, any>;
  policyRules?: PolicyRuleDiff[];
  releaseConfig?: ReleaseConfigDiff[];
  lines?: DiffLine[];
  configDiff?: string[];
}

function classForStatus(status: string) {
  switch (status) {
    case "added":
      return "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20";
    case "removed":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
    case "modified":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const bg =
    line.type === "added"
      ? "bg-green-500/10 text-green-700 dark:text-green-400"
      : line.type === "removed"
        ? "bg-red-500/10 text-red-700 dark:text-red-400"
        : line.type === "header"
          ? "bg-muted/50 text-muted-foreground font-medium"
          : "text-foreground/80";

  const prefix =
    line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

  return (
    <div className={`flex font-mono text-xs leading-relaxed ${bg}`}>
      {line.lineNumber !== undefined && (
        <span className="w-8 text-right pr-2 text-muted-foreground/50 select-none shrink-0">
          {line.lineNumber}
        </span>
      )}
      <span className="w-4 text-center shrink-0 select-none opacity-60">
        {prefix}
      </span>
      <span className="flex-1 px-2 whitespace-pre-wrap break-all">
        {line.content}
      </span>
    </div>
  );
}

function BlueprintDiffView({
  nodes,
  rawJsonA,
  rawJsonB,
}: {
  nodes: BlueprintNodeDiff[];
  rawJsonA?: Record<string, any>;
  rawJsonB?: Record<string, any>;
}) {
  const [view, setView] = useState<"nodes" | "json">("nodes");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant={view === "nodes" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("nodes")}
          data-testid="button-diff-nodes-view"
        >
          <Layers className="w-3.5 h-3.5 mr-1.5" />
          Node View
        </Button>
        <Button
          variant={view === "json" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("json")}
          disabled={!rawJsonA && !rawJsonB}
          data-testid="button-diff-json-view"
        >
          <Code className="w-3.5 h-3.5 mr-1.5" />
          Raw JSON
        </Button>
      </div>

      {view === "nodes" ? (
        <div className="flex flex-col gap-2">
          {nodes.map((node) => (
            <div
              key={node.nodeId}
              className="rounded-md border p-3 flex flex-col gap-1.5"
              data-testid={`diff-node-${node.nodeId}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{node.name}</span>
                <Badge
                  variant="outline"
                  className={`text-[11px] ${classForStatus(node.status)}`}
                >
                  {node.status}
                </Badge>
              </div>
              {node.changes && node.changes.length > 0 && (
                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {node.changes.map((c, i) => (
                    <span key={i}>{c}</span>
                  ))}
                </div>
              )}
              {node.status === "modified" && node.before && node.after && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="rounded-md bg-red-500/5 p-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Before</span>
                    <pre className="text-xs mt-1 whitespace-pre-wrap break-all font-mono">
                      {JSON.stringify(node.before, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-md bg-green-500/5 p-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">After</span>
                    <pre className="text-xs mt-1 whitespace-pre-wrap break-all font-mono">
                      {JSON.stringify(node.after, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border p-3">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Version A</span>
            <pre className="text-xs mt-2 whitespace-pre-wrap break-all font-mono max-h-80 overflow-auto">
              {rawJsonA ? JSON.stringify(rawJsonA, null, 2) : "Not available"}
            </pre>
          </div>
          <div className="rounded-md border p-3">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Version B</span>
            <pre className="text-xs mt-2 whitespace-pre-wrap break-all font-mono max-h-80 overflow-auto">
              {rawJsonB ? JSON.stringify(rawJsonB, null, 2) : "Not available"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyRuleDiffView({ rules }: { rules: PolicyRuleDiff[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rules.map((rule) => (
        <div
          key={rule.ruleId}
          className="rounded-md border p-3 flex flex-col gap-1.5"
          data-testid={`diff-rule-${rule.ruleId}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{rule.name}</span>
            <Badge
              variant="outline"
              className={`text-[11px] ${classForStatus(rule.status)}`}
            >
              {rule.status}
            </Badge>
            {rule.field && (
              <span className="text-xs text-muted-foreground">
                Field: {rule.field}
              </span>
            )}
          </div>
          {rule.status === "modified" && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="rounded-md bg-red-500/5 p-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Before</span>
                <p className="text-xs mt-1 font-mono whitespace-pre-wrap break-all">{rule.before ?? "—"}</p>
              </div>
              <div className="rounded-md bg-green-500/5 p-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">After</span>
                <p className="text-xs mt-1 font-mono whitespace-pre-wrap break-all">{rule.after ?? "—"}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const categoryLabels: Record<string, string> = {
  routing: "Routing",
  canary: "Canary Settings",
  rollback: "Rollback Triggers",
  general: "General",
};

function ReleaseConfigDiffView({ configs }: { configs: ReleaseConfigDiff[] }) {
  const grouped = configs.reduce<Record<string, ReleaseConfigDiff[]>>((acc, c) => {
    const cat = c.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="flex flex-col gap-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {categoryLabels[category] || category}
          </span>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <div
                key={item.field}
                className="rounded-md border p-3 flex items-center gap-3 flex-wrap"
                data-testid={`diff-config-${item.field}`}
              >
                <span className="text-sm font-medium min-w-[120px]">{item.label}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono rounded-md bg-red-500/10 px-2 py-0.5 text-red-600 dark:text-red-400">
                    {String(item.before)}
                  </span>
                  <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-mono rounded-md bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400">
                    {String(item.after)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GenericDiffView({ lines, configDiff }: { lines?: DiffLine[]; configDiff?: string[] }) {
  const diffLines: DiffLine[] = lines || (configDiff || []).map((text, i) => {
    const isAdded = text.startsWith("+");
    const isRemoved = text.startsWith("-");
    const isHeader = text.startsWith("@@");
    return {
      type: isAdded ? "added" : isRemoved ? "removed" : isHeader ? "header" : "unchanged",
      content: text,
      lineNumber: i + 1,
    };
  });

  if (diffLines.length === 0) {
    return <p className="text-xs text-muted-foreground">No diff data available</p>;
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex flex-col">
        {diffLines.map((line, i) => (
          <DiffLineRow key={i} line={line} />
        ))}
      </div>
    </div>
  );
}

export function DiffViewer({
  mode,
  title,
  versionA,
  versionB,
  blueprintNodes,
  rawJsonA,
  rawJsonB,
  policyRules,
  releaseConfig,
  lines,
  configDiff,
}: DiffViewerProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="panel-diff-viewer">
      {(title || versionA || versionB) && (
        <div className="flex items-center gap-2 flex-wrap">
          {title && (
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{title}</span>
            </div>
          )}
          {versionA && versionB && (
            <div className="flex items-center gap-1.5 ml-auto">
              <Badge variant="outline" className="text-[11px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                {versionA}
              </Badge>
              <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
              <Badge variant="outline" className="text-[11px] bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                {versionB}
              </Badge>
            </div>
          )}
        </div>
      )}

      {mode === "blueprint" && blueprintNodes && (
        <BlueprintDiffView nodes={blueprintNodes} rawJsonA={rawJsonA} rawJsonB={rawJsonB} />
      )}
      {mode === "policy" && policyRules && (
        <PolicyRuleDiffView rules={policyRules} />
      )}
      {mode === "release" && releaseConfig && (
        <ReleaseConfigDiffView configs={releaseConfig} />
      )}
      {mode === "generic" && (
        <GenericDiffView lines={lines} configDiff={configDiff} />
      )}
    </div>
  );
}

export type { DiffViewerProps, DiffLine, BlueprintNodeDiff, PolicyRuleDiff, ReleaseConfigDiff, DiffMode };
