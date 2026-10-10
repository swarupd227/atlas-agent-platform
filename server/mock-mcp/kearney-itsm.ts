/**
 * Kearney's ITSM records, served the way ServiceNow serves them, over the real
 * extracts in Attachment C.3 "Volumes" (28,028 incidents, 63,349 requests, 49
 * problem records, 3,195 service tasks).
 *
 * Two rules shape every endpoint here.
 *
 * **Aggregates, not payloads.** A journey asking "how bad is the categorisation"
 * must not pull 28,028 rows through a prompt to find out. Every count endpoint
 * computes over the whole extract and returns numbers; every row endpoint is
 * capped and says how many matched beyond what it returned. A tool that can
 * only answer by handing back the table is a tool that cannot answer.
 *
 * **The extract has no update timestamp.** It carries `sys_created_on` and
 * nothing else temporal, so `createdSince` means created, not touched. Polling
 * built on it detects NEW incidents, and cannot detect an existing one being
 * re-categorised -- said plainly here and in the tool descriptions rather than
 * implied by a parameter named as if it watched updates.
 *
 * Reads never mutate the seed. Writes land in an overlay keyed by number, need
 * the id of an approval a person actually gave, record what the field held
 * before, and return an undo id.
 */
import { Router, type Request, type Response } from "express";
import {
  INCIDENTS, CATEGORIES, SUB_CATEGORIES, CONTACT_TYPES, STATES, PRIORITIES, ASSIGNMENT_GROUPS,
} from "./kearney-incidents-data";
import { PROBLEMS, SERVICE_TASKS } from "./kearney-problems-data";
import {
  REQUESTS, REQUEST_DESCRIPTIONS, REQUEST_STATES, REQUEST_PRIORITIES, REQUEST_LOCATIONS, REQUEST_GROUPS,
} from "./kearney-requests-data";

const router = Router();
const nowIso = () => new Date().toISOString();

/** One incident, with the interned columns resolved back to their values. */
export interface Incident {
  number: string;
  short_description: string;
  category: string;
  subcategory: string;
  contact_type: string;
  state: string;
  priority: string;
  assignment_group: string;
  sys_created_on: string;
}

const pick = <T extends readonly string[]>(table: T, i: number): string => table[i] ?? "";

// Decoded once at load. 28k + 63k rows is a few hundred milliseconds and the
// alternative -- decoding per request -- would put the cost on every tool call.
const incidents: Incident[] = INCIDENTS.map((r) => ({
  number: r[0],
  short_description: r[1],
  category: pick(CATEGORIES, r[2]),
  subcategory: pick(SUB_CATEGORIES, r[3]),
  contact_type: pick(CONTACT_TYPES, r[4]),
  state: pick(STATES, r[5]),
  priority: pick(PRIORITIES, r[6]),
  assignment_group: pick(ASSIGNMENT_GROUPS, r[7]),
  sys_created_on: r[8],
}));

const byNumber = new Map(incidents.map((i) => [i.number.toUpperCase(), i]));
// Ascending by creation, so a cursor-bound read replays the extract in the
// order it happened. The poller's cursor only advances to the last row it was
// given, so a capped page walks forward instead of skipping the remainder.
const chronological = [...incidents].sort((a, b) => a.sys_created_on.localeCompare(b.sys_created_on));

const requests = REQUESTS.map((r) => ({
  number: r[0],
  short_description: pick(REQUEST_DESCRIPTIONS, r[1]),
  state: pick(REQUEST_STATES, r[2]),
  priority: pick(REQUEST_PRIORITIES, r[3]),
  opened_location: pick(REQUEST_LOCATIONS, r[4]),
  assignment_group: pick(REQUEST_GROUPS, r[5]),
  opened_at: r[6],
}));

const problems = PROBLEMS.map((r) => ({
  number: r[0],
  first_reported_by_task: r[1],
  state: r[2],
  short_description: r[3],
  opened_at: r[4],
  assignment_group: r[6],
  related_incidents: Number(r[7]) || 0,
  category: r[8],
  subcategory: r[9],
}));

const tasks = SERVICE_TASKS.map((r) => ({
  number: r[0],
  short_description: r[1],
  state: r[3],
  priority: r[4],
  request_item: r[5],
  location: r[6],
  assignment_group: r[7],
  reassignment_count: Number(r[8]) || 0,
  catalogue_item: r[9],
}));

// ── writes ────────────────────────────────────────────────────────────────────
/** Fields a journey may correct on an incident. Priority and categorisation are
 *  the two the extract gets wrong at scale; the rest of the record is read-only
 *  here because nothing in B.3 or B.4 asks an agent to rewrite it. */
const WRITABLE_FIELDS = new Set(["category", "subcategory", "priority", "assignment_group"]);

interface Write {
  undoId: string;
  table: "incident" | "problem";
  key: string;
  before: Record<string, string>;
  after: Record<string, string>;
  approvalRef: string;
  at: string;
  undone: boolean;
}
const overlay = new Map<string, Partial<Incident>>();
const createdProblems: Array<Record<string, unknown>> = [];
const writes: Write[] = [];
const notes: Array<{ number: string; note: string; at: string; by: string }> = [];

const current = (i: Incident): Incident => ({ ...i, ...(overlay.get(i.number.toUpperCase()) ?? {}) });

/** Every write names the approval that authorised it. Without one the connector
 *  refuses rather than recording an unattributable change -- the audit trail is
 *  the deliverable Schedule O section (k) asks for, and an anonymous row in it
 *  is worth nothing. */
function requireApproval(body: Record<string, any>, res: Response): string | null {
  const ref = String(body.approvalRef ?? "").trim();
  if (!ref) {
    res.status(422).json({
      written: false,
      error: "approvalRef is required: the id of the approval a person gave for this change.",
      guidance: "Writes here are gated on purpose. Take the approval id from the gate that approved this step and pass it.",
    });
    return null;
  }
  return ref;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const lower = (v: unknown): string => str(v).toLowerCase();
const clamp = (v: unknown, dflt: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : dflt;
};

interface Filters {
  category?: string;
  subcategory?: string;
  priority?: string;
  state?: string;
  assignmentGroup?: string;
  contactType?: string;
  textContains?: string;
  createdSince?: string;
  createdBefore?: string;
}

function readFilters(q: Record<string, any>): Filters {
  return {
    category: str(q.category) || undefined,
    subcategory: str(q.subcategory) || undefined,
    priority: str(q.priority) || undefined,
    state: str(q.state) || undefined,
    assignmentGroup: str(q.assignmentGroup ?? q.assignment_group) || undefined,
    contactType: str(q.contactType ?? q.contact_type) || undefined,
    textContains: str(q.textContains ?? q.text) || undefined,
    createdSince: str(q.createdSince ?? q.updatedSince) || undefined,
    createdBefore: str(q.createdBefore) || undefined,
  };
}

/**
 * Category matching is case-SENSITIVE on purpose.
 *
 * "Software" and "software" are two different values in this extract, 7,168 and
 * 915 rows, and collapsing them inside the connector would hide the very defect
 * the data-quality journey reports. A caller that wants both asks for both.
 */
function matches(i: Incident, f: Filters): boolean {
  if (f.category !== undefined && i.category !== f.category) return false;
  if (f.subcategory !== undefined && i.subcategory !== f.subcategory) return false;
  if (f.priority !== undefined && lower(i.priority) !== lower(f.priority)) return false;
  if (f.state !== undefined && lower(i.state) !== lower(f.state)) return false;
  if (f.assignmentGroup !== undefined && lower(i.assignment_group) !== lower(f.assignmentGroup)) return false;
  if (f.contactType !== undefined && lower(i.contact_type) !== lower(f.contactType)) return false;
  if (f.textContains !== undefined && !lower(i.short_description).includes(lower(f.textContains))) return false;
  if (f.createdSince !== undefined && !(i.sys_created_on >= f.createdSince)) return false;
  if (f.createdBefore !== undefined && !(i.sys_created_on < f.createdBefore)) return false;
  return true;
}

const GROUPABLE = {
  category: (i: Incident) => i.category || "(blank)",
  subcategory: (i: Incident) => i.subcategory || "(blank)",
  priority: (i: Incident) => i.priority || "(blank)",
  state: (i: Incident) => i.state || "(blank)",
  assignment_group: (i: Incident) => i.assignment_group || "(blank)",
  contact_type: (i: Incident) => i.contact_type || "(blank)",
  month: (i: Incident) => i.sys_created_on.slice(0, 7) || "(blank)",
} as const;

function tally(rows: Incident[], key: keyof typeof GROUPABLE) {
  const of = GROUPABLE[key];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(of(r), (counts.get(of(r)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count, share: Number(((count / rows.length) * 100).toFixed(2)) }));
}

// ── reads ─────────────────────────────────────────────────────────────────────

/** The headline shape of the record set, so a journey can size a problem in one call. */
router.get("/summary", (_req: Request, res: Response) => {
  const planning = incidents.filter((i) => i.priority === "5 - Planning").length;
  const caseVariants = new Map<string, Set<string>>();
  for (const i of incidents) {
    if (!i.category) continue;
    const k = i.category.toLowerCase();
    if (!caseVariants.has(k)) caseVariants.set(k, new Set());
    caseVariants.get(k)!.add(i.category);
  }
  const collisions = [...caseVariants.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([k, set]) => ({ normalised: k, variants: [...set].map((v) => ({ value: v, count: incidents.filter((i) => i.category === v).length })) }));
  const problemLinked = problems.reduce((n, p) => n + p.related_incidents, 0);
  res.json({
    window: { from: chronological[0]?.sys_created_on ?? null, to: chronological[chronological.length - 1]?.sys_created_on ?? null },
    incidents: incidents.length,
    requests: requests.length,
    problems: problems.length,
    service_tasks: tasks.length,
    priority_hygiene: {
      at_planning: planning,
      share: Number(((planning / incidents.length) * 100).toFixed(2)),
      note: "Priority is effectively unset on most of this record set, so the criticality-banded service levels in Attachment D.1 cannot be measured from it as it stands.",
    },
    categorisation_hygiene: {
      uncategorised: incidents.filter((i) => !i.category).length,
      case_collisions: collisions,
    },
    problem_coverage: {
      problem_records: problems.length,
      incidents_linked: problemLinked,
      share_of_incidents: Number(((problemLinked / incidents.length) * 100).toFixed(2)),
      note: "Everything outside that share recurred without a problem record explaining it.",
    },
    uncounted: "Counts cover the whole extract, not a sample.",
  });
});

/** Exact counts by one field, over everything that matches the filters. */
router.get("/volume", (req: Request, res: Response) => {
  const key = str(req.query.groupBy) as keyof typeof GROUPABLE;
  if (!GROUPABLE[key]) {
    res.status(422).json({ error: `groupBy must be one of: ${Object.keys(GROUPABLE).join(", ")}`, got: key || "(missing)" });
    return;
  }
  const f = readFilters(req.query as Record<string, any>);
  const rows = incidents.filter((i) => matches(current(i), f));
  res.json({ groupBy: key, matched: rows.length, of: incidents.length, filters: f, groups: tally(rows.map(current), key) });
});

/**
 * Incident rows, capped, oldest first when a cursor is given.
 *
 * `createdSince` (also accepted as `updatedSince`, which is what a poll trigger
 * sends) narrows to incidents raised after that moment and sorts ascending, so a
 * capped page followed by a cursor advance walks the extract forward rather than
 * jumping over the rows that did not fit.
 */
router.get("/incidents", (req: Request, res: Response) => {
  const f = readFilters(req.query as Record<string, any>);
  const limit = clamp(req.query.limit, 25, 200);
  const all = (f.createdSince ? chronological : incidents).map(current).filter((i) => matches(i, f));
  res.json({
    matched: all.length,
    returned: Math.min(limit, all.length),
    withheld: Math.max(0, all.length - limit),
    ordered_by: f.createdSince ? "sys_created_on ascending" : "extract order",
    incidents: all.slice(0, limit),
    guidance: all.length > limit
      ? `${all.length - limit} more match. Narrow the filters, or call /volume for exact counts instead of pulling rows.`
      : undefined,
  });
});

router.get("/incident", (req: Request, res: Response) => {
  const found = byNumber.get(str(req.query.number).toUpperCase());
  if (!found) {
    res.status(404).json({ error: `No incident numbered "${str(req.query.number)}" in this record set.` });
    return;
  }
  const record = current(found);
  const edit = overlay.get(found.number.toUpperCase());
  res.json({
    incident: record,
    corrected_fields: edit ? Object.keys(edit) : [],
    work_notes: notes.filter((n) => n.number.toUpperCase() === found.number.toUpperCase()),
  });
});

/**
 * Sub-categories that recur often and have no problem record explaining them.
 *
 * This is the problem-management gap expressed as work rather than as a
 * percentage: each row is a candidate, with the volume behind it and whether a
 * problem record already covers that category and sub-category.
 */
router.get("/recurrence", (req: Request, res: Response) => {
  const threshold = clamp(req.query.minIncidents, 50, 100000);
  const limit = clamp(req.query.limit, 20, 200);
  const f = readFilters(req.query as Record<string, any>);
  const rows = incidents.map(current).filter((i) => matches(i, f));
  const groups = new Map<string, { category: string; subcategory: string; count: number; examples: string[] }>();
  for (const i of rows) {
    const key = `${i.category}\u0000${i.subcategory}`;
    const g = groups.get(key) ?? { category: i.category, subcategory: i.subcategory, count: 0, examples: [] };
    g.count++;
    if (g.examples.length < 3) g.examples.push(i.number);
    groups.set(key, g);
  }
  const covered = (c: string, s: string) =>
    problems.filter((p) => lower(p.category) === lower(c) && (!s || lower(p.subcategory) === lower(s))).map((p) => p.number);
  const candidates = [...groups.values()]
    .filter((g) => g.count >= threshold)
    .sort((a, b) => b.count - a.count)
    .map((g) => ({ ...g, existing_problems: covered(g.category, g.subcategory) }))
    .map((g) => ({ ...g, is_candidate: g.existing_problems.length === 0 }));
  res.json({
    minIncidents: threshold,
    groups_over_threshold: candidates.length,
    without_a_problem_record: candidates.filter((c) => c.is_candidate).length,
    returned: Math.min(limit, candidates.length),
    candidates: candidates.slice(0, limit),
  });
});

router.get("/problems", (req: Request, res: Response) => {
  const category = str(req.query.category);
  const rows = problems.filter((p) => !category || lower(p.category) === lower(category));
  res.json({ matched: rows.length, of: problems.length, problems: rows, created_this_session: createdProblems });
});

router.get("/problem", (req: Request, res: Response) => {
  const number = str(req.query.number).toUpperCase();
  const found = problems.find((p) => p.number.toUpperCase() === number)
    ?? (createdProblems.find((p) => String(p.number).toUpperCase() === number) as any);
  if (!found) {
    res.status(404).json({ error: `No problem record numbered "${str(req.query.number)}".` });
    return;
  }
  res.json({ problem: found });
});

/**
 * Service tasks, and how often they were handed on.
 *
 * reassignment_count is the routing-quality signal in this extract: a task
 * passed between groups several times is one the original routing got wrong.
 */
router.get("/tasks", (req: Request, res: Response) => {
  const limit = clamp(req.query.limit, 25, 200);
  const minReassignments = Number(req.query.minReassignments) || 0;
  const rows = tasks.filter((t) => t.reassignment_count >= minReassignments);
  const counts = new Map<number, number>();
  for (const t of tasks) counts.set(t.reassignment_count, (counts.get(t.reassignment_count) ?? 0) + 1);
  res.json({
    matched: rows.length,
    of: tasks.length,
    reassignment_distribution: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([reassignments, count]) => ({ reassignments, count })),
    mean_reassignments: Number((tasks.reduce((s, t) => s + t.reassignment_count, 0) / tasks.length).toFixed(2)),
    returned: Math.min(limit, rows.length),
    tasks: rows.slice(0, limit),
  });
});

/** The request stream. Out of B.3/B.4 scope as a service line, in scope as context:
 *  requests and incidents land on the same applications and the same groups. */
router.get("/requests", (req: Request, res: Response) => {
  const limit = clamp(req.query.limit, 25, 200);
  const text = lower(req.query.textContains ?? req.query.text);
  const group = str(req.query.assignmentGroup);
  const rows = requests.filter((r) =>
    (!text || lower(r.short_description).includes(text)) && (!group || lower(r.assignment_group) === lower(group)));
  res.json({ matched: rows.length, of: requests.length, returned: Math.min(limit, rows.length), requests: rows.slice(0, limit) });
});

/**
 * Request descriptions that differ only by case or spacing.
 *
 * "Duo activation", "Duo Activation" and "DUO Activation" are three values for
 * one request type. Reported rather than silently folded, because the folding is
 * the remediation a data-quality journey proposes and a person approves.
 */
router.get("/request-variants", (req: Request, res: Response) => {
  const limit = clamp(req.query.limit, 20, 200);
  const groups = new Map<string, Map<string, number>>();
  for (const r of requests) {
    const key = r.short_description.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const inner = groups.get(key)!;
    inner.set(r.short_description, (inner.get(r.short_description) ?? 0) + 1);
  }
  const collisions = [...groups.entries()]
    .filter(([, variants]) => variants.size > 1)
    .map(([normalised, variants]) => ({
      normalised,
      total: [...variants.values()].reduce((a, b) => a + b, 0),
      variants: [...variants.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })),
    }))
    .sort((a, b) => b.total - a.total);
  res.json({
    colliding_descriptions: collisions.length,
    requests_affected: collisions.reduce((n, c) => n + c.total, 0),
    returned: Math.min(limit, collisions.length),
    collisions: collisions.slice(0, limit),
  });
});

// ── writes ────────────────────────────────────────────────────────────────────

router.post("/incident/update", (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, any>;
  const found = byNumber.get(str(body.number).toUpperCase());
  if (!found) {
    res.status(404).json({ written: false, error: `No incident numbered "${str(body.number)}".` });
    return;
  }
  const fields = (body.fields ?? {}) as Record<string, string>;
  const names = Object.keys(fields);
  const rejected = names.filter((f) => !WRITABLE_FIELDS.has(f));
  if (!names.length || rejected.length) {
    res.status(422).json({
      written: false,
      error: rejected.length ? `These fields cannot be written here: ${rejected.join(", ")}.` : "No fields given to write.",
      writable: [...WRITABLE_FIELDS],
    });
    return;
  }
  const approvalRef = requireApproval(body, res);
  if (!approvalRef) return;

  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const record = current(found);
  for (const f of names) {
    before[f] = (record as any)[f] ?? "";
    after[f] = str(fields[f]);
  }
  overlay.set(found.number.toUpperCase(), { ...(overlay.get(found.number.toUpperCase()) ?? {}), ...(after as Partial<Incident>) });
  const write: Write = { undoId: `undo-${writes.length + 1}`, table: "incident", key: found.number, before, after, approvalRef, at: nowIso(), undone: false };
  writes.push(write);
  res.json({
    written: true,
    number: found.number,
    before,
    after,
    undoId: write.undoId,
    approvalRef,
    guidance: `Recorded against approval ${approvalRef}. Pass ${write.undoId} to /rollback to put every field back as it was.`,
  });
});

router.post("/problem/create", (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, any>;
  const description = str(body.shortDescription);
  const category = str(body.category);
  if (!description || !category) {
    res.status(422).json({ written: false, error: "shortDescription and category are both required to open a problem record." });
    return;
  }
  const relatedIncidents: string[] = Array.isArray(body.relatedIncidents) ? body.relatedIncidents.map(str).filter(Boolean) : [];
  const unknown = relatedIncidents.filter((n) => !byNumber.has(n.toUpperCase()));
  if (unknown.length) {
    // A problem record pointing at incidents that do not exist is worse than no
    // record: it looks like evidence and cites nothing.
    res.status(422).json({ written: false, error: `These incident numbers are not in this record set: ${unknown.join(", ")}.` });
    return;
  }
  const approvalRef = requireApproval(body, res);
  if (!approvalRef) return;

  const number = `PRB9${String(createdProblems.length + 1).padStart(5, "0")}`;
  const problem = {
    number,
    state: "New",
    short_description: description,
    category,
    subcategory: str(body.subcategory),
    assignment_group: str(body.assignmentGroup),
    related_incidents: relatedIncidents.length,
    related_incident_numbers: relatedIncidents,
    opened_at: nowIso(),
    approvalRef,
  };
  createdProblems.push(problem);
  const write: Write = { undoId: `undo-${writes.length + 1}`, table: "problem", key: number, before: {}, after: { number, short_description: description }, approvalRef, at: nowIso(), undone: false };
  writes.push(write);
  res.json({ written: true, problem, undoId: write.undoId, guidance: `Opened ${number} against approval ${approvalRef}.` });
});

router.post("/worknote", (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, any>;
  const found = byNumber.get(str(body.number).toUpperCase());
  if (!found) {
    res.status(404).json({ written: false, error: `No incident numbered "${str(body.number)}".` });
    return;
  }
  const note = str(body.note);
  if (!note) {
    res.status(422).json({ written: false, error: "note is required." });
    return;
  }
  const entry = { number: found.number, note, at: nowIso(), by: str(body.by) || "agent" };
  notes.push(entry);
  res.json({ written: true, note: entry });
});

router.post("/rollback", (req: Request, res: Response) => {
  const undoId = str((req.body || {}).undoId);
  const write = writes.find((w) => w.undoId === undoId);
  if (!write) {
    res.status(404).json({ undone: false, error: `No write with undo id "${undoId}".`, known: writes.map((w) => w.undoId) });
    return;
  }
  if (write.undone) {
    res.status(409).json({ undone: false, error: `${undoId} has already been rolled back.` });
    return;
  }
  if (write.table === "incident") {
    const key = write.key.toUpperCase();
    const edit = { ...(overlay.get(key) ?? {}) } as Record<string, string>;
    for (const [field, value] of Object.entries(write.before)) {
      if (value === "") delete edit[field];
      else edit[field] = value;
    }
    if (Object.keys(edit).length) overlay.set(key, edit as Partial<Incident>);
    else overlay.delete(key);
  } else {
    const i = createdProblems.findIndex((p) => p.number === write.key);
    if (i >= 0) createdProblems.splice(i, 1);
  }
  write.undone = true;
  res.json({ undone: true, undoId, restored: write.before, table: write.table, key: write.key });
});

/** Every write this connector has accepted, with the approval behind each one. */
router.get("/audit", (_req: Request, res: Response) => {
  res.json({
    writes: writes.map((w) => ({ undoId: w.undoId, table: w.table, key: w.key, before: w.before, after: w.after, approvalRef: w.approvalRef, at: w.at, undone: w.undone })),
    work_notes: notes,
    note: "Reads are not listed here. The platform's own tool audit records those; this is the record of changes this connector made.",
  });
});

/** Drops everything written since the process started. The seed is untouched by
 *  writes, so this restores the extract exactly rather than approximately. */
router.post("/reset", (_req: Request, res: Response) => {
  const dropped = { writes: writes.length, problems: createdProblems.length, notes: notes.length };
  overlay.clear();
  createdProblems.length = 0;
  writes.length = 0;
  notes.length = 0;
  res.json({ reset: true, dropped });
});

export default router;
