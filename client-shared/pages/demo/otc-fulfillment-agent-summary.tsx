import { useState } from "react";
import { Braces, Clipboard, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { parseAgentJson } from "./otc-fulfillment-constants";

function JsonValue({ value }: { value: unknown }) {
  if (typeof value === "number") return <span className="text-emerald-400">{value}</span>;
  if (typeof value === "boolean") return <span className="text-amber-400">{String(value)}</span>;
  if (typeof value === "string") return <span className="text-sky-300">"{value}"</span>;
  if (value === null) return <span className="text-slate-400">null</span>;
  if (typeof value === "object") return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
  return <span className="text-foreground">{String(value)}</span>;
}

export function AgentJsonSummaryPanel({ agentCode, summary, label }: { agentCode: string; summary: string; label: string }) {
  const json = parseAgentJson(summary);
  const entries = json ? Object.entries(json) : null;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = json ? JSON.stringify(json, null, 2) : (summary || "");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="rounded-lg border border-emerald-500/25 bg-black/70 p-4"
      data-testid={`json-summary-${agentCode.toLowerCase().replace(/-/g, "")}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Braces className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] font-mono font-semibold text-emerald-400">{agentCode}</span>
        <span className="text-[10px] text-muted-foreground">— {label}</span>
        <Badge variant="outline" className="ml-auto text-[9px] border-emerald-500/30 text-emerald-400">JSON Summary</Badge>
        <button
          onClick={handleCopy}
          data-testid={`copy-json-${agentCode.toLowerCase().replace(/-/g, "")}`}
          className="ml-1 p-1 rounded hover:bg-emerald-500/10 transition-colors"
          title="Copy JSON"
        >
          {copied
            ? <Check className="w-3 h-3 text-emerald-400" />
            : <Clipboard className="w-3 h-3 text-emerald-400/60 hover:text-emerald-400" />
          }
        </button>
      </div>
      {entries ? (
        <div className="font-mono text-[11px] leading-relaxed">
          <span className="text-muted-foreground/60">{"{"}</span>
          <div className="pl-4 flex flex-col gap-0.5">
            {entries.map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-violet-400">"{key}"</span>
                <span className="text-muted-foreground/50">:</span>
                <JsonValue value={val} />
                <span className="text-muted-foreground/40">,</span>
              </div>
            ))}
          </div>
          <span className="text-muted-foreground/60">{"}"}</span>
        </div>
      ) : (
        <div className="font-mono text-[11px] text-muted-foreground/60 italic line-clamp-5 whitespace-pre-wrap">
          {summary || "No summary available"}
        </div>
      )}
    </div>
  );
}
