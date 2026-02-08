import { ArrowRight, GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface ConfigChange {
  field: string;
  from: unknown;
  to: unknown;
  category?: string;
}

export interface ConfigDiffVersion {
  from: number | string;
  to: number | string;
}

interface ConfigDiffProps {
  changes: ConfigChange[];
  version?: ConfigDiffVersion | null;
  summary?: string | null;
  testIdPrefix?: string;
}

export function ConfigDiff({ changes, version, summary, testIdPrefix = "diff" }: ConfigDiffProps) {
  return (
    <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-config-diff`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <GitCompare className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Config Changes</span>
        </div>
        {version && (
          <Badge variant="outline" className="text-[10px]" data-testid={`${testIdPrefix}-version-badge`}>
            v{String(version.from)} &rarr; v{String(version.to)}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {changes.map((change, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/20 flex-wrap"
            data-testid={`${testIdPrefix}-row-${idx}`}
          >
            {change.category && (
              <Badge variant="outline" className="text-[9px]">{change.category}</Badge>
            )}
            <span className="text-[11px] font-medium font-mono">{change.field}</span>
            <span className="text-[11px] text-red-500 dark:text-red-400 line-through">{String(change.from)}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{String(change.to)}</span>
          </div>
        ))}
      </div>
      {summary && (
        <span className="text-[10px] text-muted-foreground">{summary}</span>
      )}
    </div>
  );
}

interface InlineDiffProps {
  diffs: Array<{ field: string; from: unknown; to: unknown }>;
  testIdPrefix?: string;
}

export function InlineDiff({ diffs, testIdPrefix = "inline-diff" }: InlineDiffProps) {
  return (
    <div className="flex flex-col gap-1 mt-1">
      {diffs.map((d, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 text-[11px] flex-wrap"
          data-testid={`${testIdPrefix}-${idx}`}
        >
          <span className="font-mono text-muted-foreground">{d.field}:</span>
          <span className="text-red-500 dark:text-red-400 line-through">{String(d.from)}</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-emerald-600 dark:text-emerald-400">{String(d.to)}</span>
        </div>
      ))}
    </div>
  );
}
