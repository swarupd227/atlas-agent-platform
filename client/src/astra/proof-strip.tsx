import { ShieldCheck, Layers, Factory } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProofEnvelope, ProofSegment } from "./types";

const SEGMENTS = [
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
  { key: "context", label: "Context", icon: Layers },
  { key: "industry", label: "Industry", icon: Factory },
] as const;

function Segment({ label, icon: Icon, segment }: { label: string; icon: typeof ShieldCheck; segment: ProofSegment }) {
  const measured = segment.status === "measured";
  const text = measured ? segment.summary : "not measured";
  const why = measured ? segment.summary : segment.reason ?? "Nothing recorded this yet.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={`inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 outline-none focus-visible:ring-1 focus-visible:ring-ring ${
            measured ? "text-foreground/80" : "text-muted-foreground/70"
          }`}
          data-testid={`proof-${label.toLowerCase()}`}
        >
          <Icon className={`h-3 w-3 shrink-0 ${measured ? "text-[hsl(var(--astra-ok))]" : ""}`} aria-hidden />
          <span className="shrink-0 font-medium">{label}</span>
          <span className={`truncate ${measured ? "" : "italic"}`}>{text}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <span className="font-medium">{label}: </span>
        {why}
      </TooltipContent>
    </Tooltip>
  );
}

/** Every answer proves itself three ways, and says so when it can't. */
export function ProofStrip({ proof }: { proof: ProofEnvelope }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-2 font-mono text-[11px]" aria-label="Proof">
      {SEGMENTS.map((s) => (
        <Segment key={s.key} label={s.label} icon={s.icon} segment={proof[s.key]} />
      ))}
    </div>
  );
}
