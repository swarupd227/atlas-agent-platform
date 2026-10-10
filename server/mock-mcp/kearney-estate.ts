/**
 * Kearney's application and infrastructure estate, served as a CMDB would serve
 * it, over Attachment C.4 "Application Inventory" and Attachment C.3 sheets A, E
 * and F: 79 applications, 508 servers, 65 databases, 9,815 end-user devices.
 *
 * This connector exists because the incident records are thin. A ticket in this
 * engagement carries nine fields and no application reference, so a triage step
 * cannot learn from the ticket alone whether it is looking at a Tier-1 platform
 * used by 7,000 people or a moderate tool used by five. That join is what is
 * here.
 *
 * Three things it deliberately does NOT do.
 *
 * **It does not claim which application an incident is about.** Tickets name
 * applications only in free text, so /resolve-application returns ranked
 * CANDIDATES with the term each one matched on, and says when the only match is
 * a short or common word. A match is a suggestion for a person or a gate to
 * confirm, never a fact the record contains.
 *
 * **It has no integration or dependency map, because the extracts have none.**
 * Attachment B.3 requires the supplier to maintain "key integrations" in the
 * CMDB, and the inventory the client supplied carries hosting model, tier,
 * functional area and user counts but no relationships between applications.
 * /gaps reports that as a gap instead of this file inventing edges, which would
 * make a release-impact answer look grounded when nothing underneath it is.
 *
 * **It does not reconcile the two incident counts for you.** C.4 states an
 * annual incident count per application; the ticket extract is the separate
 * record of what actually arrived. /application-incidents puts both side by
 * side and labels the second as attributed by text match, because that is what
 * it is.
 */
import { Router, type Request, type Response } from "express";
import { APPLICATIONS, SERVERS, DATABASES, END_USER_HARDWARE } from "./kearney-estate-data";
import { INCIDENTS, CATEGORIES, SUB_CATEGORIES } from "./kearney-incidents-data";

const router = Router();
const nowIso = () => new Date().toISOString();

export interface Application {
  name: string;
  description: string;
  system_type: string;
  tier: string;
  declared_annual_incidents: string;
  hosting: string;
  users: string;
  functional_area: string;
  criticality: string;
  notes: string;
  inventory: string;
}

const applications: Application[] = APPLICATIONS.map((r) => ({
  name: r[0],
  description: r[1],
  system_type: r[2],
  tier: r[3],
  declared_annual_incidents: r[4],
  hosting: r[5],
  users: r[6],
  functional_area: r[7],
  criticality: r[8],
  notes: r[9],
  inventory: r[10],
}));

const servers = SERVERS.map((r) => ({
  host_name: r[0], location: r[1], location_type: r[2], server_type: r[3], virtualised: r[4],
  criticality: r[5], os_detail: r[6], os: r[7], os_version: r[8], high_availability: r[9],
  cpus: r[10], memory_gb: r[11], disk_gb: r[12],
}));

const databases = DATABASES.map((r) => ({
  reference: r[0], product: r[1], platform: r[2], instances: r[3], size: r[4], criticality: r[5], notes: r[6],
}));

const devices = END_USER_HARDWARE.map((r) => ({
  model_category: r[0], serial_number: r[1], asset_tag: r[2], model: r[3], state: r[4],
  location: r[5], configuration_item: r[6], owned: r[7], display_name: r[8], os: r[9],
}));

const pickCat = (i: number): string => CATEGORIES[i] ?? "";
const pickSub = (i: number): string => SUB_CATEGORIES[i] ?? "";

const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const lower = (v: unknown): string => str(v).toLowerCase();
const clamp = (v: unknown, dflt: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : dflt;
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── matching free text to an application ──────────────────────────────────────
/**
 * Terms too common to identify an application on their own.
 *
 * "LINK" really is an application here, and "link" is also an ordinary English
 * word that appears throughout the ticket text; the same is true of Model,
 * Office, Client, Secure and Data. Rather than drop these applications from
 * matching or pretend the matches are sound, a hit on one of these is returned
 * flagged, so a reader can see the match is weak and a gate can insist on
 * confirmation.
 */
const WEAK_TERMS = new Set([
  "link", "model", "office", "client", "secure", "data", "cloud", "azure", "microsoft",
  "windows", "enterprise", "advanced", "search", "card", "service", "mobile", "web", "print",
]);
const STOP = new Set(["the", "and", "for", "with", "inc", "ltd", "e3", "365", "plus", "pro"]);

interface Term { term: string; appIndex: number; weak: boolean; re: RegExp }

/** One matchable term per application name plus its significant words. */
const terms: Term[] = (() => {
  const out: Term[] = [];
  applications.forEach((app, appIndex) => {
    const seen = new Set<string>();
    const add = (raw: string) => {
      const t = raw.trim();
      if (t.length < 3) return;
      const key = t.toLowerCase();
      if (seen.has(key) || STOP.has(key)) return;
      seen.add(key);
      // Short is not the same as unlucky: "Duo" and "ePO" each belong to exactly one
      // application, and the shared-term pass below already demotes anything several
      // applications share. Only a one- or two-character token is too short to mean
      // anything on its own.
      out.push({ term: t, appIndex, weak: WEAK_TERMS.has(key) || t.length < 3, re: new RegExp(`\\b${escapeRe(t)}\\b`, "i") });
    };
    add(app.name.replace(/\s*\([^)]*\)\s*/g, " ").trim());
    for (const word of app.name.split(/[\s/()\-,]+/)) add(word);
  });
  // A term that occurs in more than one application's name cannot identify one
  // of them. "Cisco" is in four entries here, "M365" in two, "SAP" in three --
  // so a ticket whose sub-category reads "Cisco AMP for Endpoints" names a
  // vendor family, not an application, and saying otherwise would be inventing
  // precision the record does not have. Derived from the inventory rather than
  // from a hand-written list, so it stays true when the inventory changes.
  const appsPerTerm = new Map<string, Set<number>>();
  for (const t of out) {
    const key = t.term.toLowerCase();
    if (!appsPerTerm.has(key)) appsPerTerm.set(key, new Set());
    appsPerTerm.get(key)!.add(t.appIndex);
  }
  for (const t of out) {
    if ((appsPerTerm.get(t.term.toLowerCase())?.size ?? 1) > 1) t.weak = true;
  }
  // Longest first: a hit on "SAP S/4 HANA" should outrank a hit on "SAP".
  return out.sort((a, b) => b.term.length - a.term.length);
})();

/** Terms the inventory itself shows are shared by several applications. */
export function sharedAcrossApplications(): string[] {
  const counts = new Map<string, Set<number>>();
  for (const t of terms) {
    const key = t.term.toLowerCase();
    if (!counts.has(key)) counts.set(key, new Set());
    counts.get(key)!.add(t.appIndex);
  }
  return [...counts.entries()].filter(([, s]) => s.size > 1).map(([k]) => k).sort();
}

export interface Candidate {
  application: string;
  criticality: string;
  tier: string;
  hosting: string;
  users: string;
  functional_area: string;
  matched_on: string;
  /** Which field the term was found in; a controlled field outranks free text. */
  matched_in: MatchSource;
  weak_match: boolean;
}

/**
 * Where a match came from, which decides how much it is worth.
 *
 * Sub-category is a controlled field with 311 values in this extract -- "M365 -
 * OneDrive", "Cisco Secure Client", "Duo SSO" -- chosen from a list by whoever
 * handled the ticket. A short description is whatever the caller typed. A hit on
 * the first is evidence; a hit on the second is corroboration, and on its own it
 * is a hint. Keeping them apart is the difference between a resolver that can be
 * trusted at a gate and one that cannot.
 */
export type MatchSource = "subcategory" | "category" | "description";

interface Hit { term: Term; source: MatchSource }

function resolveFrom(fields: { description?: string; subcategory?: string; category?: string }, limit: number): Candidate[] {
  const sources: Array<[MatchSource, string]> = [
    ["subcategory", str(fields.subcategory)],
    ["category", str(fields.category)],
    ["description", str(fields.description)],
  ];
  const best = new Map<number, Hit>();
  const rank: Record<MatchSource, number> = { subcategory: 3, category: 2, description: 1 };
  for (const [source, haystack] of sources) {
    if (!haystack) continue;
    for (const t of terms) {
      if (!t.re.test(haystack)) continue;
      const existing = best.get(t.appIndex);
      const better = !existing
        || rank[source] > rank[existing.source]
        || (rank[source] === rank[existing.source] && t.term.length > existing.term.term.length);
      if (better) best.set(t.appIndex, { term: t, source });
    }
  }
  return [...best.values()]
    .sort((a, b) =>
      Number(a.term.weak) - Number(b.term.weak)
      || rank[b.source] - rank[a.source]
      || b.term.term.length - a.term.term.length)
    .slice(0, limit)
    .map((h) => {
      const app = applications[h.term.appIndex];
      return {
        application: app.name,
        criticality: app.criticality,
        tier: app.tier,
        hosting: app.hosting,
        users: app.users,
        functional_area: app.functional_area,
        matched_on: h.term.term,
        matched_in: h.source,
        weak_match: h.term.weak,
      };
    });
}

/** Free text only, for callers that have nothing but a sentence. */
function resolve(text: string, limit: number): Candidate[] {
  return resolveFrom({ description: text }, limit);
}

/**
 * Incidents attributed to each application by text, computed once on first use.
 *
 * Deliberately conservative: an incident counts towards an application only
 * when exactly one application matched and the match was not a weak term. The
 * incidents that match nothing, or match several, are reported as their own
 * figures rather than distributed — "we could attribute this many by text
 * alone" is a usable statement, and spreading the rest would not be.
 *
 * Lazy because it is a few million regex tests and a connector nobody calls
 * should not pay for it at boot.
 */
let attribution: { byApp: Map<string, number>; unmatched: number; ambiguous: number; weakOnly: number; bySource: Map<MatchSource, number> } | null = null;
function attributions() {
  if (attribution) return attribution;
  const byApp = new Map<string, number>();
  const bySource = new Map<MatchSource, number>();
  let unmatched = 0, ambiguous = 0, weakOnly = 0;
  for (const row of INCIDENTS) {
    const hits = resolveFrom({ description: row[1], subcategory: pickSub(row[3]), category: pickCat(row[2]) }, 5);
    const strong = hits.filter((h) => !h.weak_match);
    if (strong.length === 1) {
      byApp.set(strong[0].application, (byApp.get(strong[0].application) ?? 0) + 1);
      bySource.set(strong[0].matched_in, (bySource.get(strong[0].matched_in) ?? 0) + 1);
    } else if (strong.length > 1) ambiguous++;
    else if (hits.length > 0) weakOnly++;
    else unmatched++;
  }
  attribution = { byApp, unmatched, ambiguous, weakOnly, bySource };
  return attribution;
}

// ── writes ────────────────────────────────────────────────────────────────────
const ANNOTATABLE = new Set(["criticality", "tier", "functional_area", "notes"]);
interface Write { undoId: string; application: string; before: Record<string, string>; after: Record<string, string>; approvalRef: string; at: string; undone: boolean }
const overlay = new Map<string, Partial<Application>>();
const writes: Write[] = [];
const current = (a: Application): Application => ({ ...a, ...(overlay.get(a.name.toLowerCase()) ?? {}) });
const findApp = (name: string) => applications.find((a) => a.name.toLowerCase() === lower(name))
  ?? applications.find((a) => a.name.toLowerCase().includes(lower(name)) && lower(name).length >= 3);

// ── reads ─────────────────────────────────────────────────────────────────────

router.get("/summary", (_req: Request, res: Response) => {
  const by = (key: keyof Application) => {
    const counts = new Map<string, number>();
    for (const a of applications.map(current)) counts.set(a[key] || "(blank)", (counts.get(a[key] || "(blank)") ?? 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([value, count]) => ({ value, count }));
  };
  res.json({
    applications: applications.length,
    servers: servers.length,
    databases: databases.length,
    end_user_devices: devices.length,
    applications_by_criticality: by("criticality"),
    applications_by_hosting: by("hosting"),
    applications_by_functional_area: by("functional_area"),
    not_in_this_inventory: [
      "No integration or dependency relationships between applications: the supplied inventory carries none, so impact across applications cannot be derived here.",
      "No named application owner or support group: functional area is as close as the inventory gets.",
      "No release calendar: the vendor release cadence an application follows is not recorded.",
    ],
  });
});

router.get("/applications", (req: Request, res: Response) => {
  const q = req.query as Record<string, any>;
  const limit = clamp(q.limit, 25, 200);
  const text = lower(q.textContains ?? q.text);
  const rows = applications.map(current).filter((a) =>
    (!q.criticality || lower(a.criticality) === lower(q.criticality)) &&
    (!q.hosting || lower(a.hosting).includes(lower(q.hosting))) &&
    (!q.functionalArea || lower(a.functional_area) === lower(q.functionalArea)) &&
    (!q.systemType || lower(a.system_type).includes(lower(q.systemType))) &&
    (!text || lower(a.name).includes(text) || lower(a.description).includes(text)));
  res.json({ matched: rows.length, of: applications.length, returned: Math.min(limit, rows.length), applications: rows.slice(0, limit) });
});

router.get("/application", (req: Request, res: Response) => {
  const app = findApp(str(req.query.name));
  if (!app) {
    res.status(404).json({ error: `No application named "${str(req.query.name)}" in this inventory.`, guidance: "Call /resolve-application with the ticket text to get candidate names." });
    return;
  }
  const record = current(app);
  const observed = attributions().byApp.get(app.name) ?? 0;
  res.json({
    application: record,
    annotations: overlay.has(app.name.toLowerCase()) ? Object.keys(overlay.get(app.name.toLowerCase())!) : [],
    incidents: {
      declared_in_inventory: record.declared_annual_incidents,
      attributed_from_ticket_text: observed,
      note: "The first figure is what the client stated in Attachment C.4. The second is incidents whose short description names this application unambiguously -- a text attribution, not a field in the record. They are not expected to agree.",
    },
  });
});

/**
 * Candidate applications for a piece of ticket text.
 *
 * This is the join a triage step needs and the one the records cannot make for
 * it. Every candidate carries the term it matched on so the reasoning is
 * inspectable, and weak matches are marked rather than hidden.
 */
router.get("/resolve-application", (req: Request, res: Response) => {
  const text = str(req.query.text ?? req.query.shortDescription);
  const subcategory = str(req.query.subcategory);
  const category = str(req.query.category);
  if (!text && !subcategory && !category) {
    res.status(422).json({ error: "Give at least one of text, subcategory or category. Pass the incident's subcategory wherever you have it: it is a controlled field and resolves far more reliably than the description." });
    return;
  }
  const candidates = resolveFrom({ description: text, subcategory, category }, clamp(req.query.limit, 5, 20));
  const strong = candidates.filter((c) => !c.weak_match);
  res.json({
    text: text || null,
    subcategory: subcategory || null,
    category: category || null,
    candidates,
    confident: strong.length === 1 ? strong[0].application : null,
    guidance: candidates.length === 0
      ? "No application name appears in this text. The ticket may concern a platform not in the inventory, or be worded without naming the application -- treat the application as unknown rather than guessing one."
      : strong.length > 1
        ? "Several applications match on specific terms. This needs a person or an upstream fact to choose between them."
        : strong.length === 0
          ? "Only weak matches: the terms are ordinary words as well as application names, so this is a hint, not an identification."
          : "One application matches on a specific term.",
  });
});

/** Declared against attributed, for every application, plus what could not be attributed. */
router.get("/application-incidents", (req: Request, res: Response) => {
  const limit = clamp(req.query.limit, 30, 200);
  const a = attributions();
  const rows = applications.map(current).map((app) => {
    const declared = Number(app.declared_annual_incidents);
    const observed = a.byApp.get(app.name) ?? 0;
    return {
      application: app.name,
      criticality: app.criticality,
      declared_in_inventory: Number.isFinite(declared) ? declared : app.declared_annual_incidents,
      attributed_from_ticket_text: observed,
      difference: Number.isFinite(declared) ? observed - declared : null,
    };
  }).sort((x, y) => (y.attributed_from_ticket_text) - (x.attributed_from_ticket_text));
  res.json({
    incidents_considered: INCIDENTS.length,
    attributed_to_one_application: [...a.byApp.values()].reduce((s, n) => s + n, 0),
    matched_several_applications: a.ambiguous,
    matched_only_a_common_word: a.weakOnly,
    named_no_application: a.unmatched,
    attributed_by_field: Object.fromEntries(a.bySource),
    method: "An incident is attributed only where exactly one application matched on a term specific enough to identify it, searching the sub-category and category before the free-text description. Nothing is distributed across the rest.",
    returned: Math.min(limit, rows.length),
    applications: rows.slice(0, limit),
  });
});

router.get("/servers", (req: Request, res: Response) => {
  const q = req.query as Record<string, any>;
  const limit = clamp(q.limit, 25, 200);
  const rows = servers.filter((s) =>
    (!q.location || lower(s.location) === lower(q.location)) &&
    (!q.criticality || lower(s.criticality) === lower(q.criticality)) &&
    (!q.os || lower(s.os).includes(lower(q.os))) &&
    (!q.serverType || lower(s.server_type).includes(lower(q.serverType))));
  res.json({ matched: rows.length, of: servers.length, returned: Math.min(limit, rows.length), servers: rows.slice(0, limit) });
});

router.get("/databases", (req: Request, res: Response) => {
  const q = req.query as Record<string, any>;
  const rows = databases.filter((d) =>
    (!q.platform || lower(d.platform).includes(lower(q.platform))) &&
    (!q.criticality || lower(d.criticality) === lower(q.criticality)) &&
    (!q.product || lower(d.product).includes(lower(q.product))));
  res.json({ matched: rows.length, of: databases.length, databases: rows });
});

router.get("/devices", (req: Request, res: Response) => {
  const q = req.query as Record<string, any>;
  const limit = clamp(q.limit, 25, 200);
  const rows = devices.filter((d) =>
    (!q.location || lower(d.location) === lower(q.location)) &&
    (!q.state || lower(d.state) === lower(q.state)) &&
    (!q.os || lower(d.os).includes(lower(q.os))));
  const states = new Map<string, number>();
  for (const d of devices) states.set(d.state || "(blank)", (states.get(d.state || "(blank)") ?? 0) + 1);
  res.json({
    matched: rows.length,
    of: devices.length,
    by_state: [...states.entries()].sort((a, b) => b[1] - a[1]).map(([state, count]) => ({ state, count })),
    returned: Math.min(limit, rows.length),
    devices: rows.slice(0, limit),
    note: "End-user hardware belongs to Digital Workplace in Attachment B.1, not to the service lines this engagement bids for. It is here because an application incident sometimes turns out to be a device.",
  });
});

/**
 * What this CMDB cannot answer, with the counts.
 *
 * Attachment B.3 makes the supplier responsible for keeping application
 * inventory and interface information current. Reporting the gaps is the
 * starting position for that, and the gaps are real: no relationships at all,
 * and blank fields across the inventory.
 */
router.get("/gaps", (_req: Request, res: Response) => {
  const rows = applications.map(current);
  const blank = (key: keyof Application) => rows.filter((a) => !str(a[key])).map((a) => a.name);
  const nonNumericDeclared = rows.filter((a) => !Number.isFinite(Number(a.declared_annual_incidents)));
  res.json({
    applications: rows.length,
    tier_column_unused: {
      count: blank("tier").length,
      note: "The inventory's Tier column is empty for every application. Criticality carries the banding instead, so this is a column the client does not use rather than data that went missing -- worth confirming before any service level is written against \"tier\".",
    },
    missing_criticality: { count: blank("criticality").length, applications: blank("criticality") },
    missing_functional_area: { count: blank("functional_area").length, applications: blank("functional_area") },
    declared_incident_count_not_a_number: {
      count: nonNumericDeclared.length,
      examples: nonNumericDeclared.slice(0, 10).map((a) => ({ application: a.name, value: a.declared_annual_incidents })),
      note: "Values such as \"NR\" cannot be compared against an observed count without someone deciding what they mean.",
    },
    structural: [
      { gap: "No application-to-application integration or dependency records", consequence: "Release and change impact cannot be derived from this inventory; it has to be asked of a person or built." },
      { gap: "No named owner or support group per application", consequence: "Routing and escalation cannot be resolved from the inventory alone." },
      { gap: "No vendor release calendar per application", consequence: "Regression readiness ahead of a SaaS release has no dated trigger in the data." },
    ],
  });
});

// ── writes ────────────────────────────────────────────────────────────────────

/**
 * Record a correction to an application's reference data.
 *
 * Inventory accuracy is a supplier responsibility under B.3, so a journey that
 * finds a wrong tier should be able to act on it -- with an approval behind the
 * change and the previous value kept, because reference data that quietly
 * changes is worse than reference data that is wrong in a known way.
 */
router.post("/application/annotate", (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, any>;
  const app = findApp(str(body.name));
  if (!app) {
    res.status(404).json({ written: false, error: `No application named "${str(body.name)}".` });
    return;
  }
  const fields = (body.fields ?? {}) as Record<string, string>;
  const names = Object.keys(fields);
  const rejected = names.filter((f) => !ANNOTATABLE.has(f));
  if (!names.length || rejected.length) {
    res.status(422).json({
      written: false,
      error: rejected.length ? `These fields cannot be written here: ${rejected.join(", ")}.` : "No fields given to write.",
      writable: [...ANNOTATABLE],
    });
    return;
  }
  const approvalRef = str(body.approvalRef);
  if (!approvalRef) {
    res.status(422).json({ written: false, error: "approvalRef is required: the id of the approval a person gave for this change." });
    return;
  }
  const record = current(app);
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const f of names) {
    before[f] = (record as any)[f] ?? "";
    after[f] = str(fields[f]);
  }
  overlay.set(app.name.toLowerCase(), { ...(overlay.get(app.name.toLowerCase()) ?? {}), ...(after as Partial<Application>) });
  const write: Write = { undoId: `undo-${writes.length + 1}`, application: app.name, before, after, approvalRef, at: nowIso(), undone: false };
  writes.push(write);
  res.json({ written: true, application: app.name, before, after, undoId: write.undoId, approvalRef });
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
  const key = write.application.toLowerCase();
  const edit = { ...(overlay.get(key) ?? {}) } as Record<string, string>;
  for (const [field, value] of Object.entries(write.before)) {
    if (value === "") delete edit[field];
    else edit[field] = value;
  }
  if (Object.keys(edit).length) overlay.set(key, edit as Partial<Application>);
  else overlay.delete(key);
  write.undone = true;
  res.json({ undone: true, undoId, restored: write.before, application: write.application });
});

router.get("/audit", (_req: Request, res: Response) => {
  res.json({ writes: writes.map((w) => ({ ...w })) });
});

router.post("/reset", (_req: Request, res: Response) => {
  const dropped = writes.length;
  overlay.clear();
  writes.length = 0;
  res.json({ reset: true, dropped });
});

export default router;
