import { Link } from "wouter";
import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import type { ArtifactRef } from "./types";

function StatusDot({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  const tone =
    s === "active" || s === "deployed" || s === "completed" || s === "connected"
      ? "bg-[hsl(var(--astra-ok))]"
      : s === "failed" || s === "error"
        ? "bg-[hsl(var(--astra-fail))]"
        : s === "awaiting_approval" || s === "running"
          ? "bg-primary"
          : "bg-muted-foreground/50";
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{children}</div>;
}

function AgentList({ props }: { props: Record<string, any> }) {
  const agents: any[] = props.agents ?? [];
  return (
    <div>
      <Label>
        {agents.length} of {props.total ?? agents.length}
      </Label>
      <ul className="divide-y divide-border">
        {agents.map((a) => (
          <li key={a.id} className="py-2.5">
            <Link href={`~/agents/${a.id}`} className="group block">
              <div className="flex items-center gap-2">
                <StatusDot status={a.status} />
                <span className="truncate font-medium group-hover:underline">{a.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{a.status ?? "—"}</span>
              </div>
              {a.description && <div className="mt-0.5 pl-3.5 text-xs text-muted-foreground line-clamp-2">{a.description}</div>}
              <div className="mt-1 flex flex-wrap gap-x-3 pl-3.5 font-mono text-[11px] text-muted-foreground">
                {a.agentType && <span>{a.agentType}</span>}
                {a.riskTier && <span>risk {a.riskTier}</span>}
                {a.autonomyMode && <span>{a.autonomyMode}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentDetail({ props }: { props: Record<string, any> }) {
  if (props.attach) {
    const a = props.attach;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Agent</dt>
        <dd>{a.agent?.name}</dd>
        <dt className="text-muted-foreground">Connector</dt>
        <dd>{a.connector?.name}</dd>
        <dt className="text-muted-foreground">Access</dt>
        <dd>{a.readOnly ? `Read-only · ${a.blockedTools?.length ?? 0} write tools blocked` : "Full"}</dd>
        <dt className="text-muted-foreground">Warnings</dt>
        <dd className="tabular-nums">{a.warningsAcknowledged} acknowledged</dd>
      </dl>
    );
  }
  const agent = props.agent ?? {};
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <StatusDot status={agent.status} />
        <span className="font-mono text-xs text-muted-foreground">
          {[agent.status, agent.agentType, agent.riskTier && `risk ${agent.riskTier}`, agent.autonomyMode].filter(Boolean).join(" · ")}
        </span>
      </div>
      {agent.description && <p className="text-muted-foreground">{agent.description}</p>}
      <div>
        <Label>Connectors</Label>
        {agent.connectors?.length ? (
          <ul className="space-y-1">
            {agent.connectors.map((c: any) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{c.riskTier}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None attached.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Policies bound</Label>
          <div className="tabular-nums">{agent.policiesBound ?? 0}</div>
        </div>
        <div>
          <Label>Model</Label>
          <div className="truncate font-mono text-xs">{agent.modelName ?? "—"}</div>
        </div>
      </div>
      {agent.industryConcepts?.length > 0 && (
        <div>
          <Label>Industry concepts</Label>
          <div className="flex flex-wrap gap-1.5">
            {agent.industryConcepts.map((c: string) => (
              <span key={c} className="rounded border border-border px-1.5 py-0.5 text-xs">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectorList({ props }: { props: Record<string, any> }) {
  const rows: any[] = props.connectors ?? [];
  return (
    <div>
      <Label>
        {rows.length} of {props.total ?? rows.length}
      </Label>
      <ul className="divide-y divide-border">
        {rows.map((c) => (
          <li key={c.id} className="py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <StatusDot status={c.connected === false ? "disconnected" : c.connected ? "connected" : c.status} />
              <span className="truncate font-medium">{c.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {c.toolCount} tools · {c.writeToolCount} write
              </span>
            </div>
            <div className="mt-0.5 pl-3.5 font-mono text-[11px] text-muted-foreground">
              {[c.integrationId, c.connected === null ? null : c.connected ? "connected" : "not connected", c.riskTier && `risk ${c.riskTier}`].filter(Boolean).join(" · ")}
            </div>
            {props.includeLinkedAgents && (
              <div className="mt-1 pl-3.5 text-xs text-muted-foreground">
                {c.linkedAgents?.length ? `Used by ${c.linkedAgents.map((a: any) => a.name).join(", ")}` : "Not used by any agent"}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Run({ props }: { props: Record<string, any> }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <StatusDot status={props.status} />
        <span className="font-mono text-xs text-muted-foreground">
          {[props.status?.replace(/_/g, " "), typeof props.costUsd === "number" && `$${props.costUsd.toFixed(4)}`].filter(Boolean).join(" · ")}
        </span>
      </div>
      {props.request && (
        <div>
          <Label>Asked</Label>
          <p className="text-muted-foreground">{props.request}</p>
        </div>
      )}
      {props.output && (
        <div>
          <Label>Answer</Label>
          <Markdown text={props.output} className="astra-md" />
        </div>
      )}
      {props.steps?.length > 0 && (
        <div>
          <Label>Steps</Label>
          <ol className="space-y-1 font-mono text-xs">
            {props.steps.map((s: any, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <StatusDot status={s.status} />
                <span className="truncate">{s.name}</span>
                {s.outcome && <span className="ml-auto shrink-0 text-muted-foreground">{s.outcome}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Fallback({ props }: { props: Record<string, any> }) {
  return <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs">{JSON.stringify(props, null, 2)}</pre>;
}

const RENDERERS: Record<string, (p: { props: Record<string, any> }) => JSX.Element> = {
  agentList: AgentList,
  agent: AgentDetail,
  connectorList: ConnectorList,
  run: Run,
};

export function ArtifactPane({ artifact, onClose }: { artifact: ArtifactRef; onClose: () => void }) {
  const Render = RENDERERS[artifact.kind] ?? Fallback;
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-card" aria-label={artifact.title} data-testid="astra-artifact-pane">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold [font-family:var(--astra-display)]">{artifact.title}</h2>
        {artifact.fullViewHref && (
          <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
            <Link href={`~${artifact.fullViewHref}`}>
              Open <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Render props={artifact.props} />
      </div>
    </aside>
  );
}
