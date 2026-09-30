/**
 * Classifiers: named, reusable questions for the decision seam (Phase 3).
 *
 * A classifier is one question an organization asks in more than one flow --
 * what kind of thing this is (a choice among labels), how much of it there is
 * (a level on a ladder), or whether it is so (yes or no) -- defined once here
 * and bound to decision steps in the studio and the team-graph editor. A bound
 * step takes the classifier's question, options or levels and threshold at
 * build and sync time, and the decision audit reports the classifier's
 * agreement as one line across every flow that uses it.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, GitBranch, Plus, Pencil, Trash2, ListOrdered, ToggleLeft, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermission } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ClassifierKind = "choice" | "score" | "noul";
interface ClassifierRow {
  id: string;
  name: string;
  kind: ClassifierKind;
  question: string;
  options?: Array<{ label: string; description?: string } | string> | null;
  levels?: string[] | null;
  criteria?: { true: string; false: string } | null;
  threshold?: number | null;
  description?: string | null;
  status: string;
  version: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const KIND_META: Record<ClassifierKind, { label: string; icon: typeof GitBranch; what: string }> = {
  choice: { label: "Choice", icon: GitBranch, what: "picks one label from a list" },
  score: { label: "Score", icon: ListOrdered, what: "places it on a ladder of levels" },
  noul: { label: "Yes / no", icon: ToggleLeft, what: "answers whether it is so" },
};

const optionLabel = (o: { label: string; description?: string } | string) => (typeof o === "string" ? o : o.label);

/** "label: description" per line, the way the editors read it back. */
function parseOptions(text: string): Array<{ label: string; description?: string }> {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? { label: l.slice(0, i).trim(), description: l.slice(i + 1).trim() || undefined } : { label: l };
  });
}
function optionsText(options: ClassifierRow["options"]): string {
  return (options ?? []).map((o) => (typeof o === "string" ? o : o.description ? `${o.label}: ${o.description}` : o.label)).join("\n");
}

interface Draft { name: string; kind: ClassifierKind; question: string; optionsText: string; levelsText: string; trueText: string; falseText: string; threshold: string; description: string }
const emptyDraft = (): Draft => ({ name: "", kind: "choice", question: "", optionsText: "", levelsText: "", trueText: "", falseText: "", threshold: "", description: "" });
const draftOf = (c: ClassifierRow): Draft => ({
  name: c.name, kind: c.kind, question: c.question, optionsText: optionsText(c.options), levelsText: (c.levels ?? []).join("\n"),
  trueText: c.criteria?.true ?? "", falseText: c.criteria?.false ?? "", threshold: c.threshold != null ? String(c.threshold) : "", description: c.description ?? "",
});

export default function ClassifiersPage() {
  const { toast } = useToast();
  const canEdit = usePermission("create_modify_blueprints").allowed;
  const q = useQuery<ClassifierRow[]>({ queryKey: ["/api/classifiers"] });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClassifierRow | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const rows = useMemo(() => {
    const all = q.data ?? [];
    const s = search.trim().toLowerCase();
    return (s ? all.filter((c) => `${c.name} ${c.question} ${c.description ?? ""}`.toLowerCase().includes(s)) : all)
      .slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data, search]);

  const open = (target: ClassifierRow | "new") => { setDraft(target === "new" ? emptyDraft() : draftOf(target)); setEditing(target); };

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: draft.name.trim(), kind: draft.kind, question: draft.question.trim(),
        description: draft.description.trim() || null,
        threshold: draft.threshold.trim() === "" ? null : Number(draft.threshold),
        options: draft.kind === "choice" ? parseOptions(draft.optionsText) : [],
        levels: draft.kind === "score" ? draft.levelsText.split("\n").map((l) => l.trim()).filter(Boolean) : [],
        ...(draft.kind === "noul" ? { criteria: { true: draft.trueText.trim(), false: draft.falseText.trim() } } : {}),
      };
      const res = editing === "new" || !editing
        ? await apiRequest("POST", "/api/classifiers", body)
        : await apiRequest("PATCH", `/api/classifiers/${editing.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classifiers"] });
      toast({ title: editing === "new" ? "Classifier created" : "Classifier updated", description: editing === "new" ? undefined : "Steps bound to it take the change on their next build or sync." });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Couldn't save the classifier", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/classifiers/${id}`)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/classifiers"] }); toast({ title: "Classifier deleted", description: "Steps bound to it keep the copy they took." }); },
    onError: (e: any) => toast({ title: "Couldn't delete the classifier", description: e?.message, variant: "destructive" }),
  });

  const draftProblem = draft.name.trim() === "" ? "Give it a name." : draft.question.trim() === "" ? "Write the question."
    : draft.kind === "choice" && parseOptions(draft.optionsText).length < 2 ? "A choice needs at least two labels."
    : draft.kind === "score" && (draft.levelsText.split("\n").filter((l) => l.trim()).length < 2 || draft.levelsText.split("\n").filter((l) => l.trim()).length > 10) ? "A ladder needs two to ten levels."
    : draft.kind === "noul" && (!draft.trueText.trim() || !draft.falseText.trim()) ? "Say what yes and no mean."
    : draft.threshold.trim() !== "" && !(Number(draft.threshold) >= 0 && Number(draft.threshold) <= 1) ? "Confidence is between 0 and 1."
    : null;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6" data-testid="page-classifiers">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/governance" className="inline-flex items-center gap-1 hover:text-foreground" data-testid="link-back-governance"><ArrowLeft className="h-3.5 w-3.5" /> Governance</Link>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Classifiers</h1>
          <p className="text-sm text-muted-foreground">Questions your flows ask more than once, defined once. Bind one to a decision step and its agreement is measured as one line across every flow.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-9 w-48 pl-7 text-sm" data-testid="input-search-classifiers" />
          </div>
          <Button size="sm" disabled={!canEdit} onClick={() => open("new")} data-testid="button-create-classifier"><Plus className="mr-1 h-3.5 w-3.5" /> New classifier</Button>
        </div>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center" data-testid="empty-classifiers">
          <p className="text-sm font-medium">No classifiers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one here, then bind it to a decision step in the Process Flow Studio or the team-graph editor.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const meta = KIND_META[c.kind] ?? KIND_META.choice;
            const Icon = meta.icon;
            const answers = c.kind === "choice" ? (c.options ?? []).map(optionLabel) : c.kind === "score" ? (c.levels ?? []) : ["yes", "no"];
            return (
              <div key={c.id} className={`flex flex-col gap-2.5 rounded-xl border bg-card p-4 ${c.status === "archived" ? "opacity-60" : ""}`} data-testid={`card-classifier-${c.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-sky-600" />
                    <span className="font-medium" data-testid={`text-classifier-name-${c.id}`}>{c.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                    <Badge variant="secondary" className="text-[10px]">v{c.version ?? 1}</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{c.question}</p>
                <div className="flex flex-wrap gap-1">
                  {answers.slice(0, 8).map((a, i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">{c.kind === "score" ? `${i} · ${a}` : a}</span>)}
                  {answers.length > 8 && <span className="text-[10.5px] text-muted-foreground">+{answers.length - 8} more</span>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
                  <span>{meta.what}{c.threshold != null ? ` · acts at ${Math.round(c.threshold * 100)}%` : ""}</span>
                  {canEdit && (
                    <span className="flex items-center gap-0.5">
                      <button type="button" onClick={() => open(c)} className="rounded p-1 hover:bg-muted hover:text-foreground" aria-label="Edit" data-testid={`button-edit-classifier-${c.id}`}><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => { if (window.confirm(`Delete "${c.name}"? Steps bound to it keep the copy they took.`)) remove.mutate(c.id); }} className="rounded p-1 hover:bg-muted hover:text-destructive" aria-label="Delete" data-testid={`button-delete-classifier-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New classifier" : "Edit classifier"}</DialogTitle>
            <DialogDescription>One question, asked the same way wherever a step is bound to it.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!draftProblem) save.mutate(); }}>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Risk tier" data-testid="input-classifier-name" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Answers with</label>
                <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ClassifierKind })} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="select-classifier-kind">
                  <option value="choice">A label</option>
                  <option value="score">A level</option>
                  <option value="noul">Yes or no</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Question</label>
              <Textarea value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} rows={2} placeholder="How risky is this submission?" data-testid="input-classifier-question" />
            </div>
            {draft.kind === "choice" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Labels, one per line, with an optional description after a colon</label>
                <Textarea value={draft.optionsText} onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })} rows={4} placeholder={"low: nothing unusual\nhigh: coastal, large TIV or prior losses"} className="font-mono text-xs" data-testid="input-classifier-options" />
              </div>
            )}
            {draft.kind === "score" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Ladder, one level per line, low to high (two to ten)</label>
                <Textarea value={draft.levelsText} onChange={(e) => setDraft({ ...draft, levelsText: e.target.value })} rows={4} placeholder={"clean: nothing to fix\nminor issues\nserious issues"} className="font-mono text-xs" data-testid="input-classifier-levels" />
              </div>
            )}
            {draft.kind === "noul" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Yes means</label>
                  <Input value={draft.trueText} onChange={(e) => setDraft({ ...draft, trueText: e.target.value })} data-testid="input-classifier-true" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">No means</label>
                  <Input value={draft.falseText} onChange={(e) => setDraft({ ...draft, falseText: e.target.value })} data-testid="input-classifier-false" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Confidence to act</label>
                <Input type="number" min={0} max={1} step={0.05} value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} placeholder="default" data-testid="input-classifier-threshold" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Where it is used and why" data-testid="input-classifier-description" />
              </div>
            </div>
            {draftProblem && <p className="text-xs text-amber-600" data-testid="text-classifier-problem">{draftProblem}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={!!draftProblem || save.isPending} data-testid="button-save-classifier">{editing === "new" ? "Create" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
