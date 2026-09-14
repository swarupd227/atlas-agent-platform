import { Label } from "./parts";

const URGENCY: Record<string, string> = {
  urgent: "bg-[hsl(var(--astra-fail))]",
  today: "bg-primary",
  this_week: "bg-muted-foreground/50",
};

function Items({ items }: { items: any[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((i) => (
        <li key={i.id} className="py-2.5 text-sm">
          <div className="flex items-start gap-2">
            <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${URGENCY[i.urgency] ?? URGENCY.this_week}`} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{i.title}</div>
              {i.context && <div className="mt-0.5 text-xs text-muted-foreground">{i.context}</div>}
              <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
                <span>{String(i.urgency).replace(/_/g, " ")}</span>
                {i.businessImpact && <span>{i.businessImpact}</span>}
                {i.canDecideHere && <span className="text-foreground">can decide here</span>}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function NeedsMe({ props }: { props: Record<string, any> }) {
  const decide: any[] = props.needsDecision ?? [];
  const fyi: any[] = props.fyi ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Needs a decision", props.needsDecisionCount],
          ["To know", props.fyiCount],
          ["Decided today", props.completedTodayCount],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded border border-border px-2 py-2">
            <div className="text-lg font-semibold tabular-nums">{n ?? 0}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div>
        <Label>Needs a decision</Label>
        {decide.length ? <Items items={decide} /> : <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>}
      </div>
      {fyi.length > 0 && (
        <div>
          <Label>Good to know</Label>
          <Items items={fyi} />
        </div>
      )}
    </div>
  );
}
