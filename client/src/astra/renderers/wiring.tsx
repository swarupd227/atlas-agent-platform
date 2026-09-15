import { AlertTriangle, CircleCheck, Hand, OctagonX } from "lucide-react";
import { Label } from "./parts";

const ICON: Record<string, JSX.Element> = {
  blocker: <OctagonX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--astra-fail))]" aria-hidden />,
  warning: <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--astra-warn))]" aria-hidden />,
  info: <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />,
};

export function Wiring({ props }: { props: Record<string, any> }) {
  const report = props.report ?? { issues: [] };
  const groups: Array<[string, string]> = [
    ["blocker", "Blocks a run"],
    ["warning", "Worth fixing"],
    ["info", "Good to know"],
  ];
  return (
    <div className="space-y-5 text-sm">
      <div className={`flex items-start gap-2 rounded border p-3 ${report.ready ? "border-[hsl(var(--astra-ok)/0.4)]" : "border-[hsl(var(--astra-fail)/0.4)]"}`}>
        {report.ready ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--astra-ok))]" aria-hidden /> : <OctagonX className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--astra-fail))]" aria-hidden />}
        <div>
          <div className="font-medium">{report.ready ? "Ready to run" : "Not ready to run"}</div>
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {report.agentsChecked} agents · {report.blockers} blockers · {report.warnings} warnings · {report.gates} approval gates
          </div>
        </div>
      </div>

      {props.steps?.length > 0 && (
        <div>
          <Label>Run order</Label>
          <ol className="space-y-1">
            {props.steps.map((s: string, i: number) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {groups.map(([sev, title]) => {
        const items = report.issues.filter((i: any) => i.severity === sev);
        if (!items.length) return null;
        return (
          <div key={sev}>
            <Label>{title}</Label>
            <ul className="space-y-1.5">
              {items.map((i: any, n: number) => (
                <li key={n} className="flex gap-2">
                  {ICON[sev]}
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
