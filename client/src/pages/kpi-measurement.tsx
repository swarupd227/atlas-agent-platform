/**
 * What measures a KPI, and the first place in the product where a person can
 * record what they actually measured.
 *
 * Until now a KPI's value was inferred by matching its name against run
 * statistics, and there was no way to say "we measured 62% last Tuesday". So
 * this shows, for one KPI: what measures it, what the person who authored the
 * outcome said should measure it, a suggestion when nothing does (a guess from
 * the name, labelled as one), a way to record a reading, and every reading so
 * far.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_WINDOW_DAYS,
  RUN_STATISTICS,
  STATISTIC_LABEL,
  describeSource,
  type MeasurementSource,
  type RunStatistic,
} from "@shared/kpi-measurement";
import type { KpiDefinition } from "@shared/schema";

interface Reading {
  id: string;
  value: number;
  takenAt: string;
  source: string;
  statistic: string | null;
  windowDays: number | null;
  note: string | null;
  recordedByName: string | null;
}

interface MeasurementView {
  kpiId: string;
  source: MeasurementSource | null;
  describes: string;
  authorNote: string | null;
  suggestion: { source: MeasurementSource; because: string } | null;
  readings: Reading[];
}

/** The date an <input type="date"> wants, from a Date. */
export function dateInputValue(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().split("T")[0];
}

/** A reading, as one line: what it read, when, and who says so. */
export function readingLine(r: Pick<Reading, "value" | "takenAt" | "source" | "statistic" | "recordedByName">, unit: string | null | undefined): string {
  const when = formatDateTime(r.takenAt);
  const who = r.source === "manual" ? r.recordedByName || "a person" : `agent runs${r.statistic ? ` (${r.statistic.replace(/_/g, " ")})` : ""}`;
  return `${r.value}${unit ? ` ${unit}` : ""} · ${when} · ${who}`;
}

/** What a KPI can be measured by, in the order the picker offers it. */
export const MEASURED_BY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "manual", label: "Recorded by a person" },
  ...RUN_STATISTICS.map((s) => ({ value: s, label: STATISTIC_LABEL[s] })),
];

/** The declaration a picker value stands for. */
export function sourceFromChoice(choice: string, windowDays = DEFAULT_WINDOW_DAYS): MeasurementSource | null {
  if (choice === "manual") return { kind: "manual" };
  if (choice === "none") return null;
  if ((RUN_STATISTICS as string[]).includes(choice)) return { kind: "agent_runs", statistic: choice as RunStatistic, windowDays };
  return null;
}

/** Which picker value a stored declaration corresponds to. */
export function choiceFromSource(source: MeasurementSource | null): string {
  if (!source) return "none";
  return source.kind === "manual" ? "manual" : source.statistic;
}

export function KpiMeasurement({ kpi }: { kpi: KpiDefinition }) {
  const key = [`/api/kpis/${kpi.id}/measurement`];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const view = useQuery<MeasurementView>({ queryKey: key });

  const [recording, setRecording] = useState(false);
  const [value, setValue] = useState("");
  const [takenAt, setTakenAt] = useState(() => dateInputValue(new Date()));
  const [note, setNote] = useState("");

  const source = view.data?.source ?? null;
  const choice = useMemo(() => choiceFromSource(source), [source]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
  };

  const declare = useMutation({
    mutationFn: async (next: MeasurementSource | null) => {
      const res = await apiRequest("PUT", `/api/kpis/${kpi.id}/measurement`, { source: next });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "That could not be saved.");
      return res.json();
    },
    onSuccess: (data: { describes?: string }) => {
      refresh();
      toast({ title: "What measures it", description: data?.describes ?? "Saved." });
    },
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });

  const record = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/kpis/${kpi.id}/readings`, {
        value: Number(value),
        takenAt: new Date(`${takenAt}T12:00:00`).toISOString(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "That reading could not be recorded.");
      return res.json();
    },
    onSuccess: (data: { breached?: boolean; appliedAsCurrent?: boolean }) => {
      refresh();
      setRecording(false);
      setValue("");
      setNote("");
      toast({
        title: "Measurement recorded",
        description: [
          data?.appliedAsCurrent ? "It is now what this KPI reads." : "An earlier reading was kept as history.",
          data?.breached ? "It is past the KPI's threshold." : null,
        ].filter(Boolean).join(" "),
      });
    },
    onError: (e: Error) => toast({ title: "Not recorded", description: e.message, variant: "destructive" }),
  });

  if (view.isLoading) return <p className="text-xs text-muted-foreground">Loading what measures it…</p>;

  const readings = view.data?.readings ?? [];
  const canRecord = !source || source.kind === "manual";
  const numeric = value.trim() !== "" && Number.isFinite(Number(value));

  return (
    <div className="mt-2 flex flex-col gap-2 border-t pt-2" data-testid={`kpi-measurement-${kpi.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Measured by</span>
        <Select value={choice} onValueChange={(next) => declare.mutate(sourceFromChoice(next))} disabled={declare.isPending}>
          <SelectTrigger className="h-7 w-[280px] text-xs" data-testid={`kpi-source-${kpi.id}`}>
            <SelectValue placeholder="Nothing measures this yet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nothing measures this yet</SelectItem>
            {MEASURED_BY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {source?.kind === "agent_runs" && (
          <span className="text-[11px] text-muted-foreground">over the last {source.windowDays} days · a proxy</span>
        )}
      </div>

      {view.data?.authorNote && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium">How it was meant to be measured: </span>
          {view.data.authorNote}
        </p>
      )}

      {view.data?.suggestion && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-dashed px-2 py-1.5" data-testid={`kpi-suggestion-${kpi.id}`}>
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{view.data.suggestion.because}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px]"
            onClick={() => declare.mutate(view.data!.suggestion!.source)}
            disabled={declare.isPending}
            data-testid={`kpi-accept-suggestion-${kpi.id}`}
          >
            <Check className="mr-1 h-3 w-3" />Use {describeSource(view.data.suggestion.source).split(",")[0].toLowerCase()}
          </Button>
        </div>
      )}

      {canRecord && !recording && (
        <Button size="sm" variant="outline" className="h-7 w-fit text-xs" onClick={() => setRecording(true)} data-testid={`kpi-record-open-${kpi.id}`}>
          <Plus className="mr-1 h-3 w-3" />Record a measurement
        </Button>
      )}

      {canRecord && recording && (
        <form
          className="flex flex-wrap items-end gap-2 rounded border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (numeric) record.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Value{kpi.unit ? ` (${kpi.unit})` : ""}
            <Input className="h-7 w-28 text-xs" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus data-testid={`kpi-value-${kpi.id}`} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Taken
            <Input type="date" className="h-7 w-36 text-xs" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} max={dateInputValue(new Date())} data-testid={`kpi-taken-${kpi.id}`} />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            How you know (optional)
            <Input className="h-7 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where the number came from" data-testid={`kpi-note-${kpi.id}`} />
          </label>
          <div className="flex gap-1">
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={!numeric || record.isPending} data-testid={`kpi-record-${kpi.id}`}>
              {record.isPending ? "Recording…" : "Record"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRecording(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {!canRecord && (
        <p className="text-[11px] text-muted-foreground">
          Agent runs keep this up to date, so a recorded value would be overwritten. Change what measures it to record one by hand.
        </p>
      )}

      {readings.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-testid={`kpi-readings-${kpi.id}`}>
          {readings.slice(0, 5).map((r) => (
            <li key={r.id} className="text-[11px] text-muted-foreground">
              {readingLine(r, kpi.unit)}
              {r.note && <span className="italic"> — {r.note}</span>}
            </li>
          ))}
          {readings.length > 5 && <li className="text-[11px] text-muted-foreground">and {readings.length - 5} earlier</li>}
        </ul>
      )}
    </div>
  );
}
