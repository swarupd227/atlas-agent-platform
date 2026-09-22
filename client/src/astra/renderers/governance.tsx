import { Link } from "wouter";
import { CircleAlert, CircleCheck, Download, ShieldCheck } from "lucide-react";
import { Label, human } from "./parts";

const ENFORCEMENT: Record<string, string> = {
  hard: "text-[hsl(var(--astra-fail))]",
  strict: "text-[hsl(var(--astra-fail))]",
  block: "text-[hsl(var(--astra-fail))]",
  monitor: "text-muted-foreground",
};

function PolicyRows({ policies }: { policies: any[] }) {
  return (
    <ul className="divide-y divide-border">
      {policies.map((p) => (
        <li key={`${p.id}-${p.scope}`} className="flex items-baseline gap-2 py-2 text-sm">
          {/* Each row opens that policy in Governance. */}
          <Link href={`~/governance?policy=${encodeURIComponent(p.id)}`} className="min-w-0 flex-1 truncate hover:underline" data-testid={`astra-policy-${p.id}`}>
            {p.name}
          </Link>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{human(p.domain)}</span>
          <span className={`shrink-0 font-mono text-[10px] uppercase tracking-wider ${ENFORCEMENT[String(p.enforcement).toLowerCase()] ?? "text-muted-foreground"}`}>{p.enforcement}</span>
        </li>
      ))}
    </ul>
  );
}

function ToolChips({ tools, tone }: { tools: string[]; tone: "block" | "monitor" }) {
  if (!tools.length) return <p className="text-xs text-muted-foreground">None.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((t) => (
        <span key={t} className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${tone === "block" ? "border-[hsl(var(--astra-fail)/0.4)] text-[hsl(var(--astra-fail))]" : "border-border text-muted-foreground"}`}>
          {t}
        </span>
      ))}
    </div>
  );
}

/** A policy list, or the policies that apply to one agent grouped by scope. */
export function Policies({ props }: { props: Record<string, any> }) {
  if (props.mode === "agent") {
    const applied: any[] = props.applied ?? [];
    const scopes = Array.from(new Set(applied.map((p) => p.scope)));
    return (
      <div className="space-y-5">
        {applied.length === 0 && <p className="text-sm text-muted-foreground">No policies apply to this agent.</p>}
        {scopes.map((scope) => (
          <div key={scope}>
            <Label>From {scope === "org" ? "the organization" : human(scope)}</Label>
            <PolicyRows policies={applied.filter((p) => p.scope === scope)} />
          </div>
        ))}
        <div>
          <Label>Blocked at run time</Label>
          <ToolChips tools={props.blockedTools ?? []} tone="block" />
        </div>
        <div>
          <Label>Monitored (logged, still allowed)</Label>
          <ToolChips tools={props.monitoredTools ?? []} tone="monitor" />
        </div>
        {props.toolAllowlist?.length > 0 && (
          <div>
            <Label>Only these tools allowed</Label>
            <ToolChips tools={props.toolAllowlist} tone="monitor" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <Label>{props.total} {props.total === 1 ? "policy" : "policies"}</Label>
      <PolicyRows policies={props.policies ?? []} />
    </div>
  );
}

/** Industry requirements against the agent's policies; "nothing checked" is shown as such. */
export function Readiness({ props }: { props: Record<string, any> }) {
  if (!props.checked) {
    return <p className="text-sm text-muted-foreground">{props.message ?? "Nothing was checked."}</p>;
  }
  const reqs: any[] = props.requirements ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {props.passed ? <CircleCheck className="h-4 w-4 text-[hsl(var(--astra-ok))]" aria-hidden /> : <CircleAlert className="h-4 w-4 text-[hsl(var(--astra-warn))]" aria-hidden />}
        <span>
          {reqs.filter((r) => r.status === "satisfied").length} of {reqs.length} requirements covered · {human(props.industryId)}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {reqs.map((r, i) => (
          <li key={i} className="py-2 text-sm">
            <div className="flex items-baseline gap-2">
              <span className={`shrink-0 font-mono text-[10px] uppercase tracking-wider ${r.status === "satisfied" ? "text-[hsl(var(--astra-ok))]" : "text-[hsl(var(--astra-fail))]"}`}>{r.status}</span>
              <span className="min-w-0 flex-1">{r.regulation}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{human(r.domain)}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{r.matchingPolicy ? `Covered by ${r.matchingPolicy}` : r.description}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuditChain({ props }: { props: Record<string, any> }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        {props.intact ? <ShieldCheck className="h-5 w-5 text-[hsl(var(--astra-ok))]" aria-hidden /> : <CircleAlert className="h-5 w-5 text-[hsl(var(--astra-fail))]" aria-hidden />}
        <span className="font-medium">{props.intact ? "Chain intact" : "Chain broken"}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
        <dt className="text-muted-foreground">Events checked</dt>
        <dd>{props.verifiedEvents}</dd>
        <dt className="text-muted-foreground">Signed</dt>
        <dd>{props.signedEvents ?? 0}</dd>
        <dt className="text-muted-foreground">Unsigned (before signing)</dt>
        <dd>{props.unsignedEvents ?? 0}</dd>
        {props.brokenAt != null && (
          <>
            <dt className="text-muted-foreground">Linkage breaks at</dt>
            <dd>event #{props.brokenAt}</dd>
          </>
        )}
        {props.signatureBrokenAt != null && (
          <>
            <dt className="text-muted-foreground">Signature fails at</dt>
            <dd>event #{props.signatureBrokenAt}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function ExamPackage({ props }: { props: Record<string, any> }) {
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
        <dt className="text-muted-foreground">Period</dt>
        <dd>{props.days} days</dd>
        <dt className="text-muted-foreground">Logged decisions</dt>
        <dd>{props.decisionLogEvents}</dd>
        <dt className="text-muted-foreground">Human overrides</dt>
        <dd>{props.humanOverrides}</dd>
        <dt className="text-muted-foreground">Red-team runs</dt>
        <dd>{props.redTeamRuns}</dd>
        <dt className="text-muted-foreground">Policies applied</dt>
        <dd>{props.appliedPolicies}</dd>
      </dl>
      {props.redTeamRuns === 0 && (
        <p className="text-xs text-muted-foreground">No red-team probes ran in this period, so the package's bias and security scores are defaults, not measurements.</p>
      )}
      <a
        href={props.downloadHref}
        className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs hover:border-primary/60"
        data-testid="astra-exam-package-download"
      >
        <Download className="h-3.5 w-3.5" aria-hidden /> Download the signed package
      </a>
    </div>
  );
}
