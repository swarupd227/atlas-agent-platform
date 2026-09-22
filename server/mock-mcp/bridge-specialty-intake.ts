import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";

/**
 * Simulated wholesale broker submission intake -- the system an MGA receives
 * E&S property business through.
 *
 * A submission is not one document: it is an ACORD application, a statement
 * of values with a location schedule, and loss runs, each extracted with its
 * own confidence. Without a system holding those, an underwriting journey has
 * nothing to read and an agent will happily describe a schedule it never saw.
 *
 * Two design rules make this usable by a team of agents:
 *
 *   - A submission returns AGGREGATES, not its location rows. A 120-location
 *     schedule is ~40k tokens; passing it between steps is what made earlier
 *     journeys slow and lossy. The aggregates (total TIV, largest single
 *     location, Tier-1 coastal exposure, values by state) are exactly what a
 *     treaty rule evaluates, and the rows stay one paginated call away for
 *     the steps that genuinely need them (bordereau, spot validation).
 *   - Extraction confidence is reported per COPE field, never hidden. A
 *     missing roof year is a flag to raise, not a value to invent.
 *
 * Deterministic: the seeded book below always returns the same submissions,
 * and generated locations derive from a hash of the submission id, so demo
 * and eval runs see identical numbers. State lives in memory and resets on
 * restart; that is fine for a simulator.
 */

const router = Router();

type CoastalTier = 0 | 1 | 2;

interface SovLocation {
  locationId: string;
  address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  coastalTier: CoastalTier;
  distanceToCoastMiles: number;
  femaFloodZone: "X" | "AE" | "VE";
  isoConstructionClass: number;
  constructionType: string;
  occupancy: string;
  yearBuilt: number;
  /** null when the document did not state it -- the extractor must flag, not guess. */
  roofYear: number | null;
  sprinklered: boolean | null;
  buildingValue: number;
  contentsValue: number;
  businessInterruptionValue: number;
  tiv: number;
}

interface SubmissionDocument {
  documentId: string;
  type: "ACORD_125" | "ACORD_140" | "SOV" | "LOSS_RUN";
  filename: string;
  receivedAt: string;
  pages: number | null;
  rows: number | null;
  extractionConfidence: number;
}

interface LossRunYear {
  year: number;
  claimCount: number;
  incurred: number;
  largestClaim: number;
  predominantCause: string;
}

interface Submission {
  submissionId: string;
  insuredName: string;
  broker: { name: string; brokerCode: string; contact: string };
  lineOfBusiness: string;
  effectiveDate: string;
  expiryDate: string;
  status: "new" | "in_underwriting" | "referred" | "bound" | "declined";
  requestedLimits: { perOccurrence: number; windstormDeductiblePct: number; aopDeductible: number };
  documents: SubmissionDocument[];
  locations: SovLocation[];
  lossRuns: LossRunYear[];
  /** Per-COPE-field extraction confidence, and what the documents did not state. */
  extraction: {
    overallConfidence: number;
    fields: Record<string, number>;
    missingFields: Array<{ field: string; locationIds: string[]; note: string }>;
  };
  receivedAt: string;
}

const ISO_CLASSES: Array<{ cls: number; label: string }> = [
  { cls: 1, label: "Frame" },
  { cls: 2, label: "Joisted Masonry" },
  { cls: 3, label: "Non-Combustible" },
  { cls: 4, label: "Masonry Non-Combustible" },
  { cls: 5, label: "Modified Fire Resistive" },
  { cls: 6, label: "Fire Resistive" },
];

const COASTAL_PLACES = [
  { city: "Panama City Beach", county: "Bay", state: "FL", zip: "32413" },
  { city: "Pensacola Beach", county: "Escambia", state: "FL", zip: "32561" },
  { city: "Fort Myers Beach", county: "Lee", state: "FL", zip: "33931" },
  { city: "Clearwater Beach", county: "Pinellas", state: "FL", zip: "33767" },
  { city: "Galveston", county: "Galveston", state: "TX", zip: "77550" },
  { city: "Corpus Christi", county: "Nueces", state: "TX", zip: "78401" },
  { city: "Gulf Shores", county: "Baldwin", state: "AL", zip: "36542" },
  { city: "Dauphin Island", county: "Mobile", state: "AL", zip: "36528" },
  { city: "Grand Isle", county: "Jefferson", state: "LA", zip: "70358" },
  { city: "Houma", county: "Terrebonne", state: "LA", zip: "70360" },
];

const INLAND_PLACES = [
  { city: "Tallahassee", county: "Leon", state: "FL", zip: "32301" },
  { city: "Ocala", county: "Marion", state: "FL", zip: "34470" },
  { city: "San Antonio", county: "Bexar", state: "TX", zip: "78205" },
  { city: "Lubbock", county: "Lubbock", state: "TX", zip: "79401" },
  { city: "Montgomery", county: "Montgomery", state: "AL", zip: "36104" },
  { city: "Huntsville", county: "Madison", state: "AL", zip: "35801" },
  { city: "Shreveport", county: "Caddo", state: "LA", zip: "71101" },
  { city: "Alexandria", county: "Rapides", state: "LA", zip: "71301" },
];

const OCCUPANCIES = [
  "Hotel - Limited Service", "Hotel - Full Service", "Restaurant", "Retail - Strip Center",
  "Warehouse - General", "Office - Low Rise", "Self Storage", "Apartments - Garden",
];

/** Deterministic 0..1 stream derived from a seed, so a submission's schedule never changes. */
function seededRandom(seed: string): () => number {
  let block = createHash("sha256").update(seed).digest();
  let offset = 0;
  return () => {
    if (offset > block.length - 4) {
      block = createHash("sha256").update(block).digest();
      offset = 0;
    }
    const value = block.readUInt32BE(offset);
    offset += 4;
    return value / 0xffffffff;
  };
}

const pad = (n: number) => String(n).padStart(3, "0");
const round = (n: number) => Math.round(n);

/**
 * The 14 Tier-1 coastal locations of SUB-2026-8891, pinned rather than
 * generated: their values are the point of the scenario (aggregate 72.4M
 * against a 50M treaty limit, largest single risk 18.5M against 25M).
 */
const GULF_COASTAL_TIVS = [
  18_500_000, 9_800_000, 7_200_000, 6_400_000, 5_600_000, 4_900_000, 4_200_000,
  3_800_000, 3_300_000, 2_900_000, 2_400_000, 1_900_000, 1_000_000, 500_000,
];

function coastalLocation(index: number, tiv: number, rand: () => number): SovLocation {
  const place = COASTAL_PLACES[index % COASTAL_PLACES.length];
  const iso = ISO_CLASSES[2 + Math.floor(rand() * 4)];
  const building = round(tiv * 0.68);
  const contents = round(tiv * 0.21);
  return {
    locationId: pad(index + 1),
    address: `${100 + Math.floor(rand() * 8900)} ${["Gulf Blvd", "Beachfront Dr", "Harbor Way", "Seawall Blvd"][Math.floor(rand() * 4)]}`,
    city: place.city,
    county: place.county,
    state: place.state,
    zip: place.zip,
    coastalTier: 1,
    distanceToCoastMiles: Math.round(rand() * 8 * 10) / 10,
    femaFloodZone: rand() > 0.45 ? "VE" : "AE",
    isoConstructionClass: iso.cls,
    constructionType: iso.label,
    occupancy: OCCUPANCIES[Math.floor(rand() * 4)],
    yearBuilt: 1978 + Math.floor(rand() * 44),
    roofYear: 2009 + Math.floor(rand() * 16),
    sprinklered: rand() > 0.25,
    buildingValue: building,
    contentsValue: contents,
    businessInterruptionValue: tiv - building - contents,
    tiv,
  };
}

function inlandLocation(index: number, rand: () => number): SovLocation {
  const place = INLAND_PLACES[Math.floor(rand() * INLAND_PLACES.length)];
  const iso = ISO_CLASSES[Math.floor(rand() * ISO_CLASSES.length)];
  const tiv = round((600_000 + rand() * 4_900_000) / 1000) * 1000;
  const building = round(tiv * 0.72);
  const contents = round(tiv * 0.2);
  return {
    locationId: pad(index + 1),
    address: `${100 + Math.floor(rand() * 8900)} ${["Commerce Dr", "Industrial Pkwy", "Main St", "Airport Rd"][Math.floor(rand() * 4)]}`,
    city: place.city,
    county: place.county,
    state: place.state,
    zip: place.zip,
    coastalTier: rand() > 0.88 ? 2 : 0,
    distanceToCoastMiles: Math.round((30 + rand() * 260) * 10) / 10,
    femaFloodZone: rand() > 0.9 ? "AE" : "X",
    isoConstructionClass: iso.cls,
    constructionType: iso.label,
    occupancy: OCCUPANCIES[Math.floor(rand() * OCCUPANCIES.length)],
    yearBuilt: 1965 + Math.floor(rand() * 58),
    roofYear: 2005 + Math.floor(rand() * 20),
    sprinklered: rand() > 0.3,
    buildingValue: building,
    contentsValue: contents,
    businessInterruptionValue: tiv - building - contents,
    tiv,
  };
}

function gulfCoastSchedule(): SovLocation[] {
  const rand = seededRandom("SUB-2026-8891/schedule");
  const locations: SovLocation[] = [];
  GULF_COASTAL_TIVS.forEach((tiv, i) => locations.push(coastalLocation(i, tiv, rand)));
  for (let i = GULF_COASTAL_TIVS.length; i < 120; i++) locations.push(inlandLocation(i, rand));
  return locations;
}

function midlandSchedule(): SovLocation[] {
  const rand = seededRandom("SUB-2026-8902/schedule");
  const fixed = [6_200_000, 4_100_000, 2_500_000];
  return fixed.map((tiv, i) => {
    const base = inlandLocation(i, rand);
    const building = round(tiv * 0.74);
    const contents = round(tiv * 0.19);
    return {
      ...base,
      coastalTier: 0 as CoastalTier,
      femaFloodZone: "X" as const,
      occupancy: "Warehouse - General",
      sprinklered: true,
      buildingValue: building,
      contentsValue: contents,
      businessInterruptionValue: tiv - building - contents,
      tiv,
    };
  });
}

/** Beacon Street: the schedule a broker sent with holes in it. */
function beaconSchedule(): SovLocation[] {
  const rand = seededRandom("SUB-2026-8915/schedule");
  const tivs = [3_400_000, 2_800_000, 2_200_000, 1_900_000, 1_500_000, 1_200_000, 900_000, 700_000];
  const places = [
    { city: "New Bedford", county: "Bristol", state: "MA", zip: "02740" },
    { city: "Quincy", county: "Norfolk", state: "MA", zip: "02169" },
    { city: "Newport", county: "Newport", state: "RI", zip: "02840" },
    { city: "Fall River", county: "Bristol", state: "MA", zip: "02720" },
  ];
  return tivs.map((tiv, i) => {
    const base = inlandLocation(i, rand);
    const place = places[i % places.length];
    const building = round(tiv * 0.7);
    const contents = round(tiv * 0.22);
    return {
      ...base,
      city: place.city,
      county: place.county,
      state: place.state,
      zip: place.zip,
      coastalTier: (i < 3 ? 2 : 0) as CoastalTier,
      distanceToCoastMiles: i < 3 ? 2.4 : 41.8,
      occupancy: "Apartments - Garden",
      // The document did not state these: three roof years and two sprinkler flags.
      roofYear: i < 3 ? null : base.roofYear,
      sprinklered: i === 3 || i === 4 ? null : base.sprinklered,
      buildingValue: building,
      contentsValue: contents,
      businessInterruptionValue: tiv - building - contents,
      tiv,
    };
  });
}

function seedSubmissions(): Submission[] {
  return [
    {
      submissionId: "SUB-2026-8891",
      insuredName: "Gulf Coast Hospitality Group LLC",
      broker: { name: "Bridge Specialty", brokerCode: "BSG-4471", contact: "M. Alvarez" },
      lineOfBusiness: "Commercial Property (E&S)",
      effectiveDate: "2026-11-01",
      expiryDate: "2027-11-01",
      status: "new",
      requestedLimits: { perOccurrence: 25_000_000, windstormDeductiblePct: 5, aopDeductible: 25_000 },
      documents: [
        { documentId: "DOC-8891-A125", type: "ACORD_125", filename: "ACORD_125_GulfCoastHospitality.pdf", receivedAt: "2026-09-14T09:12:00Z", pages: 4, rows: null, extractionConfidence: 0.97 },
        { documentId: "DOC-8891-A140", type: "ACORD_140", filename: "ACORD_140_PropertySection.pdf", receivedAt: "2026-09-14T09:12:00Z", pages: 3, rows: null, extractionConfidence: 0.95 },
        { documentId: "DOC-8891-SOV", type: "SOV", filename: "GCHG_SOV_2026_120_locations.xlsx", receivedAt: "2026-09-14T09:13:00Z", pages: null, rows: 120, extractionConfidence: 0.93 },
        { documentId: "DOC-8891-LR", type: "LOSS_RUN", filename: "GCHG_LossRuns_5yr.pdf", receivedAt: "2026-09-14T09:13:00Z", pages: 11, rows: null, extractionConfidence: 0.91 },
      ],
      locations: gulfCoastSchedule(),
      lossRuns: [
        { year: 2025, claimCount: 3, incurred: 412_000, largestClaim: 264_000, predominantCause: "Wind/Hail" },
        { year: 2024, claimCount: 2, incurred: 96_500, largestClaim: 71_000, predominantCause: "Water Damage" },
        { year: 2023, claimCount: 5, incurred: 878_000, largestClaim: 610_000, predominantCause: "Named Storm" },
        { year: 2022, claimCount: 1, incurred: 24_000, largestClaim: 24_000, predominantCause: "Theft" },
        { year: 2021, claimCount: 2, incurred: 143_000, largestClaim: 102_000, predominantCause: "Wind/Hail" },
      ],
      extraction: {
        overallConfidence: 0.93,
        fields: { construction: 0.95, occupancy: 0.94, protection: 0.89, exposure: 0.93, values: 0.97, lossHistory: 0.91 },
        missingFields: [],
      },
      receivedAt: "2026-09-14T09:13:00Z",
    },
    {
      submissionId: "SUB-2026-8902",
      insuredName: "Midland Logistics Warehousing Inc",
      broker: { name: "Bridge Specialty", brokerCode: "BSG-4471", contact: "D. Okafor" },
      lineOfBusiness: "Commercial Property (E&S)",
      effectiveDate: "2026-10-15",
      expiryDate: "2027-10-15",
      status: "new",
      requestedLimits: { perOccurrence: 15_000_000, windstormDeductiblePct: 2, aopDeductible: 10_000 },
      documents: [
        { documentId: "DOC-8902-A125", type: "ACORD_125", filename: "ACORD_125_MidlandLogistics.pdf", receivedAt: "2026-09-15T14:02:00Z", pages: 4, rows: null, extractionConfidence: 0.98 },
        { documentId: "DOC-8902-SOV", type: "SOV", filename: "Midland_SOV_3_locations.xlsx", receivedAt: "2026-09-15T14:02:00Z", pages: null, rows: 3, extractionConfidence: 0.96 },
        { documentId: "DOC-8902-LR", type: "LOSS_RUN", filename: "Midland_LossRuns_5yr.pdf", receivedAt: "2026-09-15T14:03:00Z", pages: 3, rows: null, extractionConfidence: 0.95 },
      ],
      locations: midlandSchedule(),
      lossRuns: [
        { year: 2025, claimCount: 0, incurred: 0, largestClaim: 0, predominantCause: "None" },
        { year: 2024, claimCount: 1, incurred: 38_000, largestClaim: 38_000, predominantCause: "Water Damage" },
        { year: 2023, claimCount: 0, incurred: 0, largestClaim: 0, predominantCause: "None" },
      ],
      extraction: {
        overallConfidence: 0.96,
        fields: { construction: 0.97, occupancy: 0.98, protection: 0.94, exposure: 0.96, values: 0.98, lossHistory: 0.95 },
        missingFields: [],
      },
      receivedAt: "2026-09-15T14:03:00Z",
    },
    {
      submissionId: "SUB-2026-8915",
      insuredName: "Beacon Street Properties LLC",
      broker: { name: "Bridge Specialty", brokerCode: "BSG-4471", contact: "M. Alvarez" },
      lineOfBusiness: "Commercial Property (E&S)",
      effectiveDate: "2026-12-01",
      expiryDate: "2027-12-01",
      status: "new",
      requestedLimits: { perOccurrence: 10_000_000, windstormDeductiblePct: 3, aopDeductible: 10_000 },
      documents: [
        { documentId: "DOC-8915-A125", type: "ACORD_125", filename: "ACORD_125_BeaconStreet.pdf", receivedAt: "2026-09-16T11:40:00Z", pages: 4, rows: null, extractionConfidence: 0.88 },
        { documentId: "DOC-8915-SOV", type: "SOV", filename: "BeaconStreet_SOV_scan.pdf", receivedAt: "2026-09-16T11:41:00Z", pages: null, rows: 8, extractionConfidence: 0.64 },
      ],
      locations: beaconSchedule(),
      lossRuns: [
        { year: 2025, claimCount: 2, incurred: 187_000, largestClaim: 121_000, predominantCause: "Water Damage" },
        { year: 2024, claimCount: 1, incurred: 45_000, largestClaim: 45_000, predominantCause: "Wind/Hail" },
      ],
      extraction: {
        overallConfidence: 0.71,
        fields: { construction: 0.82, occupancy: 0.86, protection: 0.52, exposure: 0.74, values: 0.79, lossHistory: 0.9 },
        missingFields: [
          { field: "roofYear", locationIds: ["001", "002", "003"], note: "Roof replacement year not stated on the scanned schedule." },
          { field: "sprinklered", locationIds: ["004", "005"], note: "Sprinkler/protection column blank; not inferable from the document." },
        ],
      },
      receivedAt: "2026-09-16T11:41:00Z",
    },
  ];
}

const submissions = new Map<string, Submission>(seedSubmissions().map((s) => [s.submissionId, structuredClone(s)]));

function now() { return new Date().toISOString(); }

/**
 * What a treaty rule and a rating call actually need from a 120-row schedule.
 * Computed here, in the system that holds the rows, so no step has to carry
 * the schedule through the pipeline to work it out.
 */
function scheduleSummary(s: Submission) {
  const locs = s.locations;
  const tivOf = (subset: SovLocation[]) => subset.reduce((sum, l) => sum + l.tiv, 0);
  const largest = locs.reduce((max, l) => (l.tiv > max.tiv ? l : max), locs[0]);
  const tier1 = locs.filter((l) => l.coastalTier === 1);
  const byState: Record<string, { locationCount: number; tiv: number }> = {};
  for (const l of locs) {
    byState[l.state] = byState[l.state] || { locationCount: 0, tiv: 0 };
    byState[l.state].locationCount++;
    byState[l.state].tiv += l.tiv;
  }
  const classCounts: Record<number, number> = {};
  for (const l of locs) classCounts[l.isoConstructionClass] = (classCounts[l.isoConstructionClass] || 0) + 1;
  const predominantIsoClass = Number(Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0][0]);
  return {
    locationCount: locs.length,
    totalTiv: tivOf(locs),
    largestSingleLocation: { locationId: largest.locationId, tiv: largest.tiv, city: largest.city, state: largest.state, coastalTier: largest.coastalTier },
    coastalTier1: { locationCount: tier1.length, aggregateTiv: tivOf(tier1), states: Array.from(new Set(tier1.map((l) => l.state))).sort() },
    coastalTier2: { locationCount: locs.filter((l) => l.coastalTier === 2).length, aggregateTiv: tivOf(locs.filter((l) => l.coastalTier === 2)) },
    femaHighHazard: { locationCount: locs.filter((l) => l.femaFloodZone === "VE" || l.femaFloodZone === "AE").length, zones: Array.from(new Set(locs.map((l) => l.femaFloodZone))).sort() },
    byState,
    predominantIsoClass,
    sprinkleredPct: Math.round((locs.filter((l) => l.sprinklered === true).length / locs.length) * 100),
    unknownProtectionCount: locs.filter((l) => l.sprinklered === null).length,
    unknownRoofYearCount: locs.filter((l) => l.roofYear === null).length,
  };
}

function header(s: Submission) {
  return {
    submissionId: s.submissionId,
    insuredName: s.insuredName,
    broker: s.broker,
    lineOfBusiness: s.lineOfBusiness,
    effectiveDate: s.effectiveDate,
    expiryDate: s.expiryDate,
    status: s.status,
    receivedAt: s.receivedAt,
  };
}

router.get("/submissions", (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
  const results = Array.from(submissions.values())
    .filter((s) => !status || s.status === status)
    .map((s) => ({
      ...header(s),
      locationCount: s.locations.length,
      totalTiv: s.locations.reduce((sum, l) => sum + l.tiv, 0),
      extractionConfidence: s.extraction.overallConfidence,
      documentCount: s.documents.length,
    }));
  res.json({ query: { status: status ?? null }, results, retrievedAt: now() });
});

router.get("/submission", (req: Request, res: Response) => {
  const id = String(req.query.submissionId || "").trim();
  const s = submissions.get(id);
  if (!s) {
    res.status(404).json({ error: `No submission "${id}" found.`, availableSubmissions: Array.from(submissions.keys()) });
    return;
  }
  res.json({
    ...header(s),
    requestedLimits: s.requestedLimits,
    documents: s.documents,
    scheduleSummary: scheduleSummary(s),
    lossRuns: s.lossRuns,
    extraction: s.extraction,
    retrievedAt: now(),
    guidance:
      "scheduleSummary is computed from the full location schedule held here: use it for treaty limits and rating rather than carrying the rows through the pipeline. Call get_sov_locations only when a step needs individual rows (bordereau assembly, spot validation). Where extraction.missingFields names a field, the document did not state it -- raise it, never infer a value.",
  });
});

router.get("/sov-locations", (req: Request, res: Response) => {
  const id = String(req.query.submissionId || "").trim();
  const s = submissions.get(id);
  if (!s) {
    res.status(404).json({ error: `No submission "${id}" found.` });
    return;
  }
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
  const tierFilter = req.query.coastalTier !== undefined ? Number(req.query.coastalTier) : undefined;
  const filtered = tierFilter === undefined ? s.locations : s.locations.filter((l) => l.coastalTier === tierFilter);
  const page = filtered.slice(offset, offset + limit);
  res.json({
    submissionId: s.submissionId,
    filter: { coastalTier: tierFilter ?? null },
    totalMatching: filtered.length,
    offset,
    limit,
    returned: page.length,
    hasMore: offset + page.length < filtered.length,
    locations: page,
    retrievedAt: now(),
  });
});

router.get("/document", (req: Request, res: Response) => {
  const id = String(req.query.documentId || "").trim();
  for (const s of Array.from(submissions.values())) {
    const doc = s.documents.find((d) => d.documentId === id);
    if (!doc) continue;
    const missing = s.extraction.missingFields.filter((m) => doc.type === "SOV");
    res.json({
      ...doc,
      submissionId: s.submissionId,
      insuredName: s.insuredName,
      extractedFields: doc.type === "SOV"
        ? { rows: doc.rows, columnsDetected: ["locationId", "address", "city", "state", "zip", "construction", "occupancy", "yearBuilt", "roofYear", "sprinklered", "buildingValue", "contentsValue", "biValue"] }
        : { pages: doc.pages },
      unreadableFields: missing,
      retrievedAt: now(),
      guidance: doc.extractionConfidence < 0.85
        ? "Extraction confidence for this document is below the 0.85 review floor: its values must be confirmed by a human before they are underwritten on."
        : "Extraction confidence is at or above the 0.85 review floor.",
    });
    return;
  }
  res.status(404).json({ error: `No document "${id}" found.` });
});

/** Marks where a submission has reached, so a second run does not re-bind it. */
router.post("/submission-status", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const id = String(b.submissionId || "").trim();
  const status = String(b.status || "").trim() as Submission["status"];
  const s = submissions.get(id);
  if (!s) {
    res.status(404).json({ error: `No submission "${id}" found.` });
    return;
  }
  if (!["new", "in_underwriting", "referred", "bound", "declined"].includes(status)) {
    res.status(422).json({ error: `Unknown status "${status}".`, allowed: ["new", "in_underwriting", "referred", "bound", "declined"] });
    return;
  }
  s.status = status;
  res.json({ updated: true, submissionId: id, status, updatedAt: now() });
});

router.post("/reset", (_req: Request, res: Response) => {
  submissions.clear();
  for (const s of seedSubmissions()) submissions.set(s.submissionId, structuredClone(s));
  res.json({ reset: true, submissions: submissions.size, resetAt: now() });
});

export default router;
