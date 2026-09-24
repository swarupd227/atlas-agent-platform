/**
 * Mock ServiceNow, CMDB first: the estate the control-tower journeys read, and
 * the only way they are allowed to change it.
 *
 * Reads mirror the real ServiceNow connector's shapes (Table API rows, CMDB
 * relationships, incident and change history) so a journey built here moves to
 * the live instance by pointing at the other connector, not by rewriting the
 * agents.
 *
 * Writes are deliberately narrow, because an agent editing a CMDB is exactly
 * where a demo stops being harmless:
 *
 *   - every write needs an approvalRef, the id of a decision a person made;
 *   - every write records the field's previous value and returns an undo id,
 *     so it can be put back exactly as it was;
 *   - an approval covers the records the decision covered, but the same field on the same
 *     record cannot be written twice under it, so a retry can't double-write;
 *   - retiring a CI that other CIs still depend on is refused, with the
 *     dependants listed, rather than quietly orphaning them.
 *
 * State lives in memory on top of the generated estate and resets on restart.
 */
import { Router, type Request, type Response } from "express";
import { CIS, RELS, INCIDENTS, CHANGES, PEOPLE, SUMMARY, type Ci } from "./servicenow-cmdb-data";

const router = Router();
const now = () => new Date().toISOString();

/** Overlays on the generated estate: nothing here mutates the seed itself. */
const edits = new Map<string, Partial<Ci>>();
/** One entry per (approval, record, fields) already applied: a batch writes once, a retry not at all. */
const appliedWrites = new Set<string>();
const writeKey = (approvalRef: string, table: string, sysId: string, fields: string[]) =>
  `${approvalRef}|${table}|${sysId}|${[...fields].sort().join(",")}`;
interface UndoEntry {
  undoId: string;
  table: string;
  sys_id: string;
  before: Record<string, string>;
  after: Record<string, string>;
  approvalRef: string;
  at: string;
  undone: boolean;
}
const undoLog: UndoEntry[] = [];
const tasks: Array<Record<string, string>> = [];
const workNotes: Array<Record<string, string>> = [];
const addedRels: typeof RELS = [];

const liveCi = (ci: Ci): Ci => ({ ...ci, ...(edits.get(ci.sys_id) ?? {}) });
const allCis = () => CIS.map(liveCi);
const allRels = () => [...RELS, ...addedRels];
const findCi = (ref: string): Ci | undefined => {
  const needle = String(ref || "").trim().toLowerCase();
  if (!needle) return undefined;
  const all = allCis();
  return all.find((c) => c.sys_id === ref) ?? all.find((c) => c.name.toLowerCase() === needle) ?? all.find((c) => c.name.toLowerCase().includes(needle));
};

const DAY = 86400000;
const ageDays = (stamp: string) => (stamp ? Math.round((Date.now() - Date.parse(stamp.replace(" ", "T") + "Z")) / DAY) : 9999);

/** The tables a caller may read. Anything else is refused by name. */
const READABLE: Record<string, () => unknown[]> = {
  cmdb_ci: allCis,
  cmdb_rel_ci: allRels,
  incident: () => INCIDENTS,
  change_request: () => CHANGES,
  sys_user: () => PEOPLE,
  task: () => tasks,
};

/** A small subset of ServiceNow's encoded query: field=value, field!=value, fieldISEMPTY, fieldISNOTEMPTY, LIKE, joined by ^. */
function matches(row: Record<string, unknown>, query: string): boolean {
  if (!query) return true;
  return query.split("^").every((clause) => {
    const c = clause.trim();
    if (!c) return true;
    let m = c.match(/^(\w+)ISNOTEMPTY$/i);
    if (m) return String(row[m[1]] ?? "") !== "";
    m = c.match(/^(\w+)ISEMPTY$/i);
    if (m) return String(row[m[1]] ?? "") === "";
    m = c.match(/^(\w+)LIKE(.*)$/i);
    if (m) return String(row[m[1]] ?? "").toLowerCase().includes(m[2].toLowerCase());
    m = c.match(/^(\w+)!=(.*)$/);
    if (m) return String(row[m[1]] ?? "") !== m[2];
    m = c.match(/^(\w+)=(.*)$/);
    if (m) return String(row[m[1]] ?? "") === m[2];
    return true;
  });
}

const project = (rows: Record<string, unknown>[], fields?: string) => {
  if (!fields) return rows;
  const keep = fields.split(",").map((f) => f.trim()).filter(Boolean);
  return rows.map((r) => Object.fromEntries(keep.map((k) => [k, r[k] ?? ""])));
};

// ── reads ────────────────────────────────────────────────────────────────────

router.get("/table", (req: Request, res: Response) => {
  const table = String(req.query.table || "");
  const source = READABLE[table];
  if (!source) {
    res.status(400).json({ error: `Table "${table}" is not readable here.`, readable: Object.keys(READABLE) });
    return;
  }
  const rows = (source() as Record<string, unknown>[]).filter((r) => matches(r, String(req.query.query || "")));
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  res.json({
    table,
    count: rows.length,
    returned: Math.min(rows.length, limit),
    rows: project(rows.slice(0, limit), req.query.fields ? String(req.query.fields) : undefined),
    guidance: rows.length > limit ? `${rows.length} rows match; ${limit} returned. Narrow the query rather than paging through everything.` : undefined,
  });
});

router.get("/ci", (req: Request, res: Response) => {
  const ci = findCi(String(req.query.ci || ""));
  if (!ci) {
    res.status(404).json({ error: `No configuration item matches "${req.query.ci}".` });
    return;
  }
  const rels = allRels();
  const incidents = INCIDENTS.filter((i) => i.cmdb_ci === ci.sys_id);
  res.json({
    ci,
    signals: {
      owner_missing: !ci.assigned_to,
      support_group_missing: !ci.support_group,
      tier_missing: !ci.business_criticality,
      days_since_discovered: ageDays(ci.last_discovered),
      dependants: rels.filter((r) => r.child === ci.sys_id).length,
      depends_on: rels.filter((r) => r.parent === ci.sys_id).length,
      incidents_total: incidents.length,
      incidents_last_90_days: incidents.filter((i) => ageDays(i.opened_at) <= 90).length,
      critical_incidents: incidents.filter((i) => i.priority.startsWith("1")).length,
    },
    retrievedAt: now(),
  });
});

router.get("/search", (req: Request, res: Response) => {
  const q = String(req.query.q || "").toLowerCase();
  const ciClass = String(req.query.class || "");
  const unownedOnly = String(req.query.unowned || "") === "true";
  const untieredOnly = String(req.query.untiered || "") === "true";
  const staleDays = Number(req.query.stale_days) || 0;
  const rels = allRels();
  let rows = allCis();
  if (q) rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.short_description.toLowerCase().includes(q));
  if (ciClass) rows = rows.filter((c) => c.sys_class_name === ciClass);
  if (unownedOnly) rows = rows.filter((c) => !c.assigned_to || !c.support_group);
  if (untieredOnly) rows = rows.filter((c) => !c.business_criticality);
  if (staleDays) rows = rows.filter((c) => ageDays(c.last_discovered) >= staleDays);
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  res.json({
    count: rows.length,
    returned: Math.min(rows.length, limit),
    cis: rows.slice(0, limit).map((c) => ({
      sys_id: c.sys_id,
      name: c.name,
      sys_class_name: c.sys_class_name,
      assigned_to: c.assigned_to,
      support_group: c.support_group,
      business_criticality: c.business_criticality,
      discovery_source: c.discovery_source,
      days_since_discovered: ageDays(c.last_discovered),
      dependants: rels.filter((r) => r.child === c.sys_id).length,
      environment: c.environment,
    })),
  });
});

router.get("/relationships", (req: Request, res: Response) => {
  const ci = findCi(String(req.query.ci || ""));
  if (!ci) {
    res.status(404).json({ error: `No configuration item matches "${req.query.ci}".` });
    return;
  }
  const direction = String(req.query.direction || "both");
  const depth = Math.min(Number(req.query.depth) || 2, 4);
  const rels = allRels();
  const byId = new Map(allCis().map((c) => [c.sys_id, c]));
  const walk = (dir: "up" | "down") => {
    const seen = new Map<string, { ci: Ci; depth: number; via: string }>();
    let frontier = [ci.sys_id];
    for (let d = 1; d <= depth && frontier.length; d++) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        // "up" = who depends on this; "down" = what this depends on.
        for (const r of rels.filter((x) => (dir === "up" ? x.child === nodeId : x.parent === nodeId))) {
          const otherId = dir === "up" ? r.parent : r.child;
          if (otherId === ci.sys_id || seen.has(otherId)) continue;
          const other = byId.get(otherId);
          if (!other) continue;
          seen.set(otherId, { ci: other, depth: d, via: r.type });
          next.push(otherId);
        }
      }
      frontier = next;
    }
    return Array.from(seen.values()).map((e) => ({
      sys_id: e.ci.sys_id,
      name: e.ci.name,
      sys_class_name: e.ci.sys_class_name,
      business_criticality: e.ci.business_criticality,
      assigned_to: e.ci.assigned_to,
      support_group: e.ci.support_group,
      depth: e.depth,
      relationship: e.via,
    }));
  };
  const upstream = direction === "down" ? [] : walk("up");
  const downstream = direction === "up" ? [] : walk("down");
  res.json({
    ci: { sys_id: ci.sys_id, name: ci.name, sys_class_name: ci.sys_class_name, business_criticality: ci.business_criticality },
    depth,
    dependants: upstream,
    depends_on: downstream,
    tier1_dependants: upstream.filter((u) => u.business_criticality === "Tier 1").map((u) => u.name),
    owners_to_notify: Array.from(new Set(upstream.map((u) => u.assigned_to).filter(Boolean))),
    guidance: "dependants are what breaks if this item fails; depends_on is what this item needs to work.",
  });
});

router.get("/history", (req: Request, res: Response) => {
  const ci = findCi(String(req.query.ci || ""));
  if (!ci) {
    res.status(404).json({ error: `No configuration item matches "${req.query.ci}".` });
    return;
  }
  const incidents = INCIDENTS.filter((i) => i.cmdb_ci === ci.sys_id);
  const changes = CHANGES.filter((c) => c.cmdb_ci === ci.sys_id);
  const tally = (names: string[]) => {
    const counts = new Map<string, number>();
    for (const n of names.filter(Boolean)) counts.set(n, (counts.get(n) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  res.json({
    ci: { sys_id: ci.sys_id, name: ci.name },
    incidents: incidents.map((i) => ({ number: i.number, short_description: i.short_description, priority: i.priority, opened_at: i.opened_at, assigned_to: i.assigned_to, assignment_group: i.assignment_group })),
    changes: changes.map((c) => ({ number: c.number, short_description: c.short_description, risk: c.risk, state: c.state, start_date: c.start_date, assigned_to: c.assigned_to, assignment_group: c.assignment_group })),
    who_touches_it: {
      people: tally([...incidents.map((i) => i.assigned_to), ...changes.map((c) => c.assigned_to)]),
      groups: tally([...incidents.map((i) => i.assignment_group), ...changes.map((c) => c.assignment_group)]),
    },
    incident_rate_90d: incidents.filter((i) => ageDays(i.opened_at) <= 90).length,
  });
});

/** Candidate duplicates: the same serial or the same address under two records. */
router.get("/duplicates", (_req: Request, res: Response) => {
  const rels = allRels();
  const groups = new Map<string, Ci[]>();
  for (const ci of allCis()) {
    for (const key of [ci.serial_number && `serial:${ci.serial_number}`, ci.ip_address && `ip:${ci.ip_address}`]) {
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), ci]);
    }
  }
  const pairs = Array.from(groups.entries())
    .filter(([, cis]) => cis.length > 1)
    .map(([key, cis]) => ({
      matched_on: key.split(":")[0],
      value: key.split(":")[1],
      records: cis.map((c) => ({
        sys_id: c.sys_id,
        name: c.name,
        discovery_source: c.discovery_source,
        days_since_discovered: ageDays(c.last_discovered),
        dependants: rels.filter((r) => r.child === c.sys_id).length,
        assigned_to: c.assigned_to,
      })),
    }));
  res.json({ count: pairs.length, candidates: pairs, guidance: "Keep the record with dependants and the most recent discovery; retire the other once a person approves." });
});

/** Items nothing points at and nothing has seen lately. */
router.get("/orphans", (req: Request, res: Response) => {
  const staleDays = Number(req.query.stale_days) || 90;
  const rels = allRels();
  const related = new Set([...rels.map((r) => r.parent), ...rels.map((r) => r.child)]);
  const rows = allCis().filter((c) => !related.has(c.sys_id) && ageDays(c.last_discovered) >= staleDays);
  res.json({
    count: rows.length,
    stale_days: staleDays,
    cis: rows.map((c) => ({ sys_id: c.sys_id, name: c.name, sys_class_name: c.sys_class_name, discovery_source: c.discovery_source, days_since_discovered: ageDays(c.last_discovered), environment: c.environment })),
  });
});

router.get("/estate", (_req: Request, res: Response) => {
  const cis = allCis();
  const rels = allRels();
  const related = new Set([...rels.map((r) => r.parent), ...rels.map((r) => r.child)]);
  res.json({
    ...SUMMARY,
    cis: cis.length,
    unowned: cis.filter((c) => !c.assigned_to).length,
    no_support_group: cis.filter((c) => !c.support_group).length,
    untiered_services: cis.filter((c) => c.sys_class_name === "cmdb_ci_service" && !c.business_criticality).length,
    stale_over_90_days: cis.filter((c) => ageDays(c.last_discovered) >= 90).length,
    unrelated: cis.filter((c) => !related.has(c.sys_id)).length,
    by_class: Object.fromEntries(Object.entries(cis.reduce((acc: Record<string, number>, c) => ({ ...acc, [c.sys_class_name]: (acc[c.sys_class_name] ?? 0) + 1 }), {})).sort((a, b) => (b[1] as number) - (a[1] as number))),
    writes_so_far: undoLog.filter((u) => !u.undone).length,
  });
});

// ── writes: gated, recorded, reversible ──────────────────────────────────────

const WRITABLE_FIELDS = new Set(["assigned_to", "support_group", "business_criticality", "install_status", "operational_status", "environment", "short_description"]);

/**
 * An approval is the decision a person made, and a decision usually covers several records:
 * eighteen tiers, nine retirements. So the approval may be used for each record it covers --
 * what is refused is writing the same fields on the same record twice under it, which is what
 * a retry or a confused second pass would do.
 */
function gate(req: Request, res: Response, table: string, sysId: string, fields: string[]): string | null {
  const approvalRef = String((req.body || {}).approvalRef || "").trim();
  if (!approvalRef) {
    res.status(422).json({
      written: false,
      error: "This write needs an approvalRef: the id of the approval a person gave for it.",
      guidance: "Take the decision to the approval step first, then pass its id here. Nothing is written without one.",
    });
    return null;
  }
  if (appliedWrites.has(writeKey(approvalRef, table, sysId, fields))) {
    res.status(409).json({
      written: false,
      error: `Approval ${approvalRef} has already written ${fields.join(", ")} on this record.`,
      guidance: "That record is done. Move on to the next one the approval covers rather than writing it again.",
    });
    return null;
  }
  return approvalRef;
}

router.post("/ci/update", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const ci = findCi(String(b.ci || ""));
  if (!ci) {
    res.status(404).json({ written: false, error: `No configuration item matches "${b.ci}".` });
    return;
  }
  const changes = (b.fields ?? {}) as Record<string, string>;
  const bad = Object.keys(changes).filter((f) => !WRITABLE_FIELDS.has(f));
  if (!Object.keys(changes).length || bad.length) {
    res.status(422).json({
      written: false,
      error: bad.length ? `These fields cannot be written here: ${bad.join(", ")}.` : "No fields given to write.",
      writable: Array.from(WRITABLE_FIELDS),
    });
    return;
  }
  const approvalRef = gate(req, res, "cmdb_ci", ci.sys_id, Object.keys(changes));
  if (!approvalRef) return;

  // Retiring something other items still depend on breaks them: refuse and name them.
  if (changes.install_status === "7") {
    const dependants = allRels().filter((r) => r.child === ci.sys_id).map((r) => allCis().find((c) => c.sys_id === r.parent)?.name).filter(Boolean);
    if (dependants.length) {
      res.status(409).json({
        written: false,
        error: `${ci.name} cannot be retired: ${dependants.length} item(s) still depend on it.`,
        dependants,
        guidance: "Re-point or retire the dependants first, or keep this record and retire the duplicate instead.",
      });
      return;
    }
  }

  const before: Record<string, string> = {};
  for (const f of Object.keys(changes)) before[f] = String((liveCi(ci) as any)[f] ?? "");
  edits.set(ci.sys_id, { ...(edits.get(ci.sys_id) ?? {}), ...changes, sys_updated_on: now().replace("T", " ").slice(0, 19) });
  appliedWrites.add(writeKey(approvalRef, "cmdb_ci", ci.sys_id, Object.keys(changes)));
  const entry: UndoEntry = { undoId: `UNDO-${String(undoLog.length + 1).padStart(4, "0")}`, table: "cmdb_ci", sys_id: ci.sys_id, before, after: changes, approvalRef, at: now(), undone: false };
  undoLog.push(entry);

  res.status(201).json({
    written: true,
    ci: { sys_id: ci.sys_id, name: ci.name },
    changed: Object.entries(changes).map(([field, to]) => ({ field, from: before[field], to })),
    undoId: entry.undoId,
    approvalRef,
    guidance: `Recorded. Pass ${entry.undoId} to the rollback tool to put every field back as it was.`,
  });
});

router.post("/ci/rollback", (req: Request, res: Response) => {
  const undoId = String((req.body || {}).undoId || "").trim();
  const entry = undoLog.find((u) => u.undoId === undoId);
  if (!entry) {
    res.status(404).json({ rolledBack: false, error: `No write with id ${undoId}.`, available: undoLog.filter((u) => !u.undone).map((u) => u.undoId) });
    return;
  }
  if (entry.undone) {
    res.status(409).json({ rolledBack: false, error: `${undoId} was already rolled back.` });
    return;
  }
  edits.set(entry.sys_id, { ...(edits.get(entry.sys_id) ?? {}), ...entry.before });
  entry.undone = true;
  res.json({ rolledBack: true, undoId, restored: entry.before, guidance: "The record reads as it did before the write." });
});

router.post("/relationship", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const parent = findCi(String(b.parent || ""));
  const child = findCi(String(b.child || ""));
  if (!parent || !child) {
    res.status(404).json({ written: false, error: `Both ends must exist: ${!parent ? b.parent : b.child} not found.` });
    return;
  }
  if (parent.sys_id === child.sys_id) {
    res.status(422).json({ written: false, error: "A configuration item cannot depend on itself." });
    return;
  }
  const approvalRef = gate(req, res, "cmdb_rel_ci", `${parent.sys_id}->${child.sys_id}`, ["relationship"]);
  if (!approvalRef) return;
  if (allRels().some((r) => r.parent === parent.sys_id && r.child === child.sys_id)) {
    res.status(409).json({ written: false, error: `${parent.name} already depends on ${child.name}.` });
    return;
  }
  const rel = { sys_id: `rel-added-${addedRels.length + 1}`, parent: parent.sys_id, child: child.sys_id, type: String(b.type || "Depends on::Used by") };
  addedRels.push(rel);
  appliedWrites.add(writeKey(approvalRef, "cmdb_rel_ci", `${parent.sys_id}->${child.sys_id}`, ["relationship"]));
  res.status(201).json({ written: true, relationship: { parent: parent.name, child: child.name, type: rel.type }, approvalRef, guidance: "The dependency graph now carries this edge; blast radius will include it." });
});

router.post("/task", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const ci = b.ci ? findCi(String(b.ci)) : undefined;
  if (b.ci && !ci) {
    res.status(404).json({ created: false, error: `No configuration item matches "${b.ci}".` });
    return;
  }
  const number = `TASK00${11000 + tasks.length + 1}`;
  const task = {
    sys_id: `task-${tasks.length + 1}`,
    number,
    short_description: String(b.short_description || "Attest configuration item ownership"),
    description: String(b.description || ""),
    assigned_to: String(b.assigned_to || ""),
    assignment_group: String(b.assignment_group || ""),
    cmdb_ci: ci?.sys_id ?? "",
    cmdb_ci_name: ci?.name ?? "",
    due_date: String(b.due_date || ""),
    state: "1 - Open",
    opened_at: now(),
  };
  tasks.push(task);
  res.status(201).json({ created: true, task, guidance: "The owner sees this in their queue; attestation is their confirmation, not ours." });
});

router.post("/worknote", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const table = String(b.table || "change_request");
  const number = String(b.number || "").trim();
  const record = table === "change_request" ? CHANGES.find((c) => c.number === number) : INCIDENTS.find((i) => i.number === number);
  if (!record) {
    res.status(404).json({ added: false, error: `No ${table} with number ${number}.` });
    return;
  }
  const note = { sys_id: `wn-${workNotes.length + 1}`, table, number, note: String(b.note || ""), added_by: String(b.added_by || "Astra Agents"), at: now() };
  workNotes.push(note);
  res.status(201).json({ added: true, record: { number, short_description: (record as any).short_description }, note: note.note, at: note.at, guidance: "The assessment now sits on the record itself, where the approver reads it." });
});

router.get("/audit", (_req: Request, res: Response) => {
  res.json({
    writes: undoLog.map((u) => ({ undoId: u.undoId, sys_id: u.sys_id, name: allCis().find((c) => c.sys_id === u.sys_id)?.name, before: u.before, after: u.after, approvalRef: u.approvalRef, at: u.at, undone: u.undone })),
    tasks,
    workNotes,
    relationshipsAdded: addedRels.length,
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  edits.clear();
  appliedWrites.clear();
  undoLog.length = 0;
  tasks.length = 0;
  workNotes.length = 0;
  addedRels.length = 0;
  res.json({ reset: true, estate: SUMMARY, resetAt: now() });
});

export default router;
