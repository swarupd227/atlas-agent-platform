import { Router, type Request, type Response } from "express";

/**
 * Simulated sanctions / terrorism watchlist screening service.
 *
 * Screening is a generic capability -- any industry that onboards a customer,
 * counterparty or supplier has to run it -- so this connector is deliberately
 * vendor-neutral and carries no account/journey specifics.
 *
 * Results are deterministic: the same party name always returns the same
 * verdict, so demos, evals and golden datasets are repeatable. A small set of
 * seeded parties produce the cases that actually matter (a true match, a
 * plausible false positive, a pending referral); everything else is derived
 * from a stable hash of the name.
 *
 * Every response carries the lists checked and their versions plus the
 * screening timestamp, because a clean screen against a stale list is not
 * evidence of compliance -- the agent is expected to report those alongside
 * the verdict.
 */

const router = Router();

const WATCHLISTS = [
  { listId: "OFAC_SDN", name: "OFAC Specially Designated Nationals", authority: "US Treasury OFAC", version: "2026.09.08", lastUpdated: "2026-09-08" },
  { listId: "OFAC_CONS", name: "OFAC Consolidated Sanctions", authority: "US Treasury OFAC", version: "2026.09.08", lastUpdated: "2026-09-08" },
  { listId: "UN_CONS", name: "UN Security Council Consolidated List", authority: "United Nations", version: "2026.09.05", lastUpdated: "2026-09-05" },
  { listId: "EU_FSF", name: "EU Consolidated Financial Sanctions", authority: "European Union", version: "2026.09.02", lastUpdated: "2026-09-02" },
  { listId: "UK_HMT", name: "UK HM Treasury Sanctions List", authority: "UK HM Treasury", version: "2026.09.04", lastUpdated: "2026-09-04" },
  { listId: "FBI_TERROR", name: "FBI Most Wanted Terrorists", authority: "US FBI", version: "2026.08.28", lastUpdated: "2026-08-28" },
];

interface ListEntry {
  entryId: string;
  listId: string;
  name: string;
  aliases: string[];
  entityType: "individual" | "organization";
  dateOfBirth?: string;
  placeOfBirth?: string;
  country: string;
  addresses: string[];
  identifiers: Record<string, string>;
  designatedOn: string;
  programs: string[];
  remarks: string;
}

const LIST_ENTRIES: ListEntry[] = [
  {
    entryId: "SDN-24871",
    listId: "OFAC_SDN",
    name: "Vostok Maritime Trading LLC",
    aliases: ["Vostok Maritime", "VMT Shipping"],
    entityType: "organization",
    country: "RU",
    addresses: ["12 Naberezhnaya Street, Novorossiysk, Russia"],
    identifiers: { registrationNumber: "RU-7743210985", taxId: "7743210985" },
    designatedOn: "2024-03-14",
    programs: ["UKRAINE-EO14024"],
    remarks: "Vessel operator designated for sanctions evasion via ship-to-ship transfers.",
  },
  {
    entryId: "SDN-19042",
    listId: "OFAC_SDN",
    name: "Hassan Karim Mansour",
    aliases: ["H. K. Mansour", "Hasan Mansur"],
    entityType: "individual",
    dateOfBirth: "1971-06-02",
    placeOfBirth: "Beirut, Lebanon",
    country: "LB",
    addresses: ["Rue Verdun 44, Beirut, Lebanon"],
    identifiers: { passport: "LB4471902" },
    designatedOn: "2019-11-20",
    programs: ["SDGT"],
    remarks: "Designated under counter-terrorism authorities for financial facilitation.",
  },
  {
    entryId: "UN-7731",
    listId: "UN_CONS",
    name: "Meridian Freight Holdings",
    aliases: ["Meridian Freight"],
    entityType: "organization",
    country: "AE",
    addresses: ["Jebel Ali Free Zone, Dubai, United Arab Emirates"],
    identifiers: { registrationNumber: "AE-JAFZA-88213" },
    designatedOn: "2023-07-06",
    programs: ["DPRK"],
    remarks: "Front company used to procure dual-use goods.",
  },
];

/** Seeded parties whose verdict is fixed regardless of the hash. */
const SEEDED: Record<string, "match" | "potential_match" | "pending"> = {
  "vostok maritime trading llc": "match",
  "hassan karim mansour": "match",
  "meridian freight holdings": "match",
  "h k mansour": "potential_match",
  "hasan mansur": "potential_match",
  "meridian freight services inc": "potential_match",
  "northgate industrial supply": "pending",
};

function normalise(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[.,'"()]/g, "")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|limited|ltd|llc|llp|plc|gmbh|sa|nv|bv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Deterministic verdict: seeded first, otherwise a stable hash bucket. */
function verdictFor(name: string): "clear" | "potential_match" | "match" | "pending" {
  const key = normalise(name);
  if (SEEDED[key]) return SEEDED[key];
  const bucket = hash(key) % 20;
  if (bucket === 0) return "match";
  if (bucket === 1 || bucket === 2) return "potential_match";
  if (bucket === 3) return "pending";
  return "clear";
}

function bestEntryFor(name: string): ListEntry {
  const key = normalise(name);
  const direct = LIST_ENTRIES.find((e) => normalise(e.name) === key || e.aliases.some((a) => normalise(a) === key));
  if (direct) return direct;
  const token = key.split(" ")[0] || "";
  const byToken = LIST_ENTRIES.find((e) => normalise(e.name).includes(token) && token.length > 3);
  return byToken || LIST_ENTRIES[hash(key) % LIST_ENTRIES.length];
}

interface ScreeningRecord {
  screeningId: string;
  status: string;
  party: Record<string, unknown>;
  matches: unknown[];
  listsChecked: unknown[];
  screenedAt: string;
  requiresComplianceEscalation: boolean;
  guidance: string;
}

const screenings = new Map<string, ScreeningRecord>();

function screeningId(name: string): string {
  return `SCR-${(hash(normalise(name)) % 900000 + 100000).toString()}`;
}

function listsChecked(scope?: string) {
  const wanted = typeof scope === "string" && scope.trim()
    ? scope.split(",").map((s) => s.trim().toUpperCase())
    : null;
  const lists = wanted ? WATCHLISTS.filter((l) => wanted.includes(l.listId)) : WATCHLISTS;
  return (lists.length ? lists : WATCHLISTS).map((l) => ({
    listId: l.listId, name: l.name, authority: l.authority, version: l.version, lastUpdated: l.lastUpdated,
  }));
}

router.post("/screen-party", (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, any>;
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!fullName) {
    res.status(400).json({ error: "fullName is required" });
    return;
  }

  const entityType = body.entityType === "organization" ? "organization" : body.entityType === "individual" ? "individual" : "organization";
  const verdict = verdictFor(fullName);
  const screenedAt = new Date().toISOString();
  const id = screeningId(fullName);
  const checked = listsChecked(body.listScope);

  const party = {
    fullName,
    entityType,
    dateOfBirth: body.dateOfBirth ?? null,
    country: body.country ?? null,
    address: body.address ?? null,
    identifiers: body.identifiers ?? null,
  };

  let record: ScreeningRecord;

  if (verdict === "clear") {
    record = {
      screeningId: id,
      status: "clear",
      party,
      matches: [],
      listsChecked: checked,
      screenedAt,
      requiresComplianceEscalation: false,
      guidance: "No watchlist match. Report the screening date and the list versions checked alongside this result; a clean screen against a stale list is not evidence of compliance.",
    };
  } else if (verdict === "pending") {
    record = {
      screeningId: id,
      status: "pending",
      party,
      matches: [],
      listsChecked: checked.slice(0, 3),
      screenedAt,
      requiresComplianceEscalation: false,
      guidance: "Screening incomplete -- one or more list providers did not respond. This is NOT a clear result: business may not be issued on a pending screen. Re-screen before proceeding.",
    };
  } else {
    const entry = bestEntryFor(fullName);
    const strong = verdict === "match";
    const dobGiven = typeof body.dateOfBirth === "string" && body.dateOfBirth.trim().length > 0;
    const countryGiven = typeof body.country === "string" && body.country.trim().length > 0;

    const matchedFields = ["name"];
    const unmatchedFields: string[] = [];
    if (entry.entityType === "individual" && dobGiven) {
      (strong && body.dateOfBirth === entry.dateOfBirth ? matchedFields : unmatchedFields).push("dateOfBirth");
    } else if (entry.entityType === "individual") {
      unmatchedFields.push("dateOfBirth (not supplied)");
    }
    if (countryGiven) {
      (strong && String(body.country).toUpperCase() === entry.country ? matchedFields : unmatchedFields).push("country");
    } else {
      unmatchedFields.push("country (not supplied)");
    }
    if (body.identifiers && typeof body.identifiers === "object") {
      const supplied = Object.values(body.identifiers as Record<string, unknown>).map((v) => String(v).toLowerCase());
      const known = Object.values(entry.identifiers).map((v) => String(v).toLowerCase());
      (supplied.some((s) => known.includes(s)) ? matchedFields : unmatchedFields).push("identifiers");
    } else {
      unmatchedFields.push("identifiers (not supplied)");
    }

    record = {
      screeningId: id,
      status: strong ? "match" : "potential_match",
      party,
      matches: [
        {
          entryId: entry.entryId,
          listId: entry.listId,
          listName: WATCHLISTS.find((l) => l.listId === entry.listId)?.name ?? entry.listId,
          listVersion: WATCHLISTS.find((l) => l.listId === entry.listId)?.version ?? "unknown",
          matchScore: strong ? 0.97 : 0.72,
          matchedName: entry.name,
          aliases: entry.aliases,
          entityType: entry.entityType,
          dateOfBirth: entry.dateOfBirth ?? null,
          country: entry.country,
          addresses: entry.addresses,
          identifiers: entry.identifiers,
          programs: entry.programs,
          designatedOn: entry.designatedOn,
          remarks: entry.remarks,
          matchedFields,
          unmatchedFields,
        },
      ],
      listsChecked: checked,
      screenedAt,
      requiresComplianceEscalation: true,
      guidance: strong
        ? "Positive watchlist match. This is a legal prohibition on transacting, not a risk-appetite judgement and not a pricing factor: stop quoting and issuance and escalate to compliance. No business user may clear, override or authorise past this result."
        : "Possible match requiring human adjudication. Compare the matched and unmatched identifiers before concluding; the determination belongs to compliance, not to a business approver. Do not proceed while unresolved.",
    };
  }

  screenings.set(record.screeningId, record);
  res.json(record);
});

router.get("/screening-result", (req: Request, res: Response) => {
  const id = String(req.query.screeningId || "").trim();
  const record = id ? screenings.get(id) : undefined;
  if (!record) {
    res.status(404).json({ error: `No screening found for screeningId "${id}". Screen the party first, or check the id.` });
    return;
  }
  res.json(record);
});

router.get("/watchlists", (_req: Request, res: Response) => {
  res.json({
    lists: WATCHLISTS,
    retrievedAt: new Date().toISOString(),
    note: "Record these list versions with any screening result. Screening against an out-of-date list does not demonstrate compliance.",
  });
});

router.get("/list-entry", (req: Request, res: Response) => {
  const entryId = String(req.query.entryId || "").trim();
  const entry = LIST_ENTRIES.find((e) => e.entryId === entryId);
  if (!entry) {
    res.status(404).json({ error: `No list entry "${entryId}".` });
    return;
  }
  res.json({
    ...entry,
    list: WATCHLISTS.find((l) => l.listId === entry.listId) ?? null,
    retrievedAt: new Date().toISOString(),
  });
});

export default router;
