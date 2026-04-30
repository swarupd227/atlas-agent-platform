import { Router, type Request, type Response } from "express";

const router = Router();

// ─── Public Records / FOIA portal mock state ──────────────────────────────────

type FoiaRequest = {
  requestId:    string;
  filedAt:      string;
  agency:       string;
  requester:    string;
  subject:      string;
  recordsSought: string[];
  status:       "submitted" | "acknowledged" | "in_review" | "partial_response" | "delivered" | "denied";
  trackingUrl:  string;
  expectedResponseBy: string;
  notes?:       string;
};

const PRIOR_REQUESTS: FoiaRequest[] = [
  {
    requestId:    "PIA-HOU-2026-00821",
    filedAt:      "2026-02-14T15:42:00Z",
    agency:       "Houston Public Works Department",
    requester:    "Houston Chronicle / Investigations Desk",
    subject:      "2023 Drainage Bond — project status by contract",
    recordsSought: [
      "Project status records for all projects funded by 2023 Drainage Infrastructure Bond Package",
      "Contractor performance reports for Allied Hydro Construction (2024-01 through 2026-02)",
    ],
    status:       "delivered",
    trackingUrl:  "https://houstontx.govqa.us/WEBAPP/_rs/(S(...))/RequestArchiveDetails.aspx?rid=PIA-HOU-2026-00821",
    expectedResponseBy: "2026-02-28",
    notes:        "187 pages delivered as PDF; redactions cited §552.103 (litigation exception) on 14 pages.",
  },
  {
    requestId:    "PIA-HC-2026-00405",
    filedAt:      "2026-03-02T19:11:00Z",
    agency:       "Harris County Flood Control District",
    requester:    "Houston Chronicle / Investigations Desk",
    subject:      "HCFCD risk modeling outputs — Hurricane scenarios 2024-2026",
    recordsSought: [
      "Internal hurricane scenario model outputs for Category 2-4 landfall events along the Texas coast (2024-01 through 2026-03)",
    ],
    status:       "in_review",
    trackingUrl:  "https://www.hcfcd.org/About/Public-Information/Records-Request/PIA-HC-2026-00405",
    expectedResponseBy: "2026-03-16",
  },
];

const PORTAL_AGENCIES: Record<string, { officer: string; portalUrl: string; responseDays: number }> = {
  "City of Houston":                                { officer: "Anna L. Russell, City Secretary",                portalUrl: "https://houstontx.govqa.us/WEBAPP/", responseDays: 10 },
  "Houston Public Works Department":                { officer: "Public Works Records Officer",                  portalUrl: "https://houstontx.govqa.us/WEBAPP/", responseDays: 10 },
  "Harris County":                                  { officer: "Teneshia Hudspeth, Harris County Clerk",        portalUrl: "https://www.cclerk.hctx.net/openrecords/", responseDays: 10 },
  "Harris County Flood Control District":           { officer: "HCFCD Public Information Officer",              portalUrl: "https://www.hcfcd.org/About/Public-Information/Records-Request", responseDays: 10 },
  "Texas Commission on Environmental Quality":      { officer: "TCEQ Public Information Coordinator",           portalUrl: "https://www14.tceq.texas.gov/epic/eFiling", responseDays: 10 },
  "Texas Department of Transportation":             { officer: "TxDOT Open Records Officer",                    portalUrl: "https://www.txdot.gov/about/customer-service/public-information.html", responseDays: 10 },
};

// In-memory store for newly submitted FOIA requests during the demo
const NEW_REQUESTS: FoiaRequest[] = [];

// ─── Tools ────────────────────────────────────────────────────────────────────

router.post("/submit-foia-request", (req: Request, res: Response) => {
  const body = req.body || {};
  const agency = (body.agency as string) || "";
  if (!agency) {
    return res.status(400).json({ success: false, error: "agency is required" });
  }

  const portal = PORTAL_AGENCIES[agency];
  if (!portal) {
    return res.status(404).json({
      success:         false,
      error:           "Unknown agency — cannot route FOIA request automatically. Specify a known agency or escalate to records desk.",
      knownAgencies:   Object.keys(PORTAL_AGENCIES),
    });
  }

  const requestId = `PIA-${agency.replace(/[^A-Z]/gi, "").slice(0, 6).toUpperCase()}-${new Date().getFullYear()}-${String(NEW_REQUESTS.length + 8221).padStart(5, "0")}`;
  const filedAt = new Date().toISOString();
  const expectedBy = new Date(Date.now() + portal.responseDays * 86400000).toISOString().split("T")[0];

  const created: FoiaRequest = {
    requestId,
    filedAt,
    agency,
    requester:    (body.requester as string) || "Hearst Newspapers / Investigations Desk",
    subject:      (body.subject as string) || "Public records request",
    recordsSought: Array.isArray(body.records_sought) ? body.records_sought : (body.records_sought ? [String(body.records_sought)] : []),
    status:       "submitted",
    trackingUrl:  `${portal.portalUrl}#${requestId}`,
    expectedResponseBy: expectedBy,
  };
  NEW_REQUESTS.unshift(created);
  res.json({ success: true, ...created, recordsOfficer: portal.officer, statute: "Texas Public Information Act, Tex. Gov't Code Ch. 552" });
});

router.get("/get-foia-status", (req: Request, res: Response) => {
  const { request_id } = req.query;
  if (!request_id) {
    return res.status(400).json({ success: false, error: "request_id is required" });
  }
  const found = [...PRIOR_REQUESTS, ...NEW_REQUESTS].find(r => r.requestId === request_id);
  if (!found) {
    return res.status(404).json({ success: false, error: "request not found" });
  }
  res.json({ success: true, ...found });
});

router.get("/search-prior-requests", (req: Request, res: Response) => {
  const { query, agency, limit } = req.query;
  const q = ((query as string) || "").toLowerCase();
  const limitN = Math.min(parseInt(limit as string) || 25, 100);
  let results = [...PRIOR_REQUESTS, ...NEW_REQUESTS];
  if (agency) {
    const a = (agency as string).toLowerCase();
    results = results.filter(r => r.agency.toLowerCase().includes(a));
  }
  if (q) {
    results = results.filter(r =>
      r.subject.toLowerCase().includes(q) ||
      r.recordsSought.some(s => s.toLowerCase().includes(q))
    );
  }
  res.json({ success: true, count: Math.min(results.length, limitN), requests: results.slice(0, limitN) });
});

router.get("/get-agency-officer", (req: Request, res: Response) => {
  const { agency } = req.query;
  if (!agency) {
    return res.status(400).json({ success: false, error: "agency is required" });
  }
  const portal = PORTAL_AGENCIES[agency as string];
  if (!portal) {
    return res.status(404).json({
      success:       false,
      error:         "Unknown agency",
      knownAgencies: Object.keys(PORTAL_AGENCIES),
    });
  }
  res.json({ success: true, agency, ...portal, statute: "Texas Public Information Act, Tex. Gov't Code Ch. 552" });
});

export default router;
