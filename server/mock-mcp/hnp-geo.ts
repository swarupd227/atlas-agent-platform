import { Router, type Request, type Response } from "express";

const router = Router();

// ─── HNP Geo MCP — storm impact geographic data for Houston / Harris County ───

type ZipProfile = {
  zipCode:          string;
  neighbourhood:    string;
  jurisdiction:     string;
  stormImpact:      "severe" | "moderate" | "minor" | "none";
  floodZone:        "AE" | "X500" | "X" | "none";
  inundationRiskFt: number;   // expected water depth, Category 3 storm
  evacuationZone:   string;   // "A", "B", "C", "D" or "none"
  historicalHarvey: boolean;  // was flooded during Harvey 2017
  subscriberCount:  number;   // Houston Chronicle subscribers in this zip
};

const ZIP_DATA: Record<string, ZipProfile> = {
  "77085": {
    zipCode: "77085", neighbourhood: "Meyerland / Braeburn", jurisdiction: "City of Houston",
    stormImpact: "severe", floodZone: "AE", inundationRiskFt: 3.2,
    evacuationZone: "B", historicalHarvey: true, subscriberCount: 4800,
  },
  "77089": {
    zipCode: "77089", neighbourhood: "Southeast Houston / Friendswood", jurisdiction: "City of Houston",
    stormImpact: "severe", floodZone: "AE", inundationRiskFt: 2.8,
    evacuationZone: "B", historicalHarvey: true, subscriberCount: 3200,
  },
  "77069": {
    zipCode: "77069", neighbourhood: "Champions / Willowbrook", jurisdiction: "Harris County (unincorporated)",
    stormImpact: "moderate", floodZone: "X500", inundationRiskFt: 1.4,
    evacuationZone: "C", historicalHarvey: true, subscriberCount: 5100,
  },
  "77059": {
    zipCode: "77059", neighbourhood: "Clear Lake / Bay Area", jurisdiction: "City of Houston",
    stormImpact: "moderate", floodZone: "X500", inundationRiskFt: 1.1,
    evacuationZone: "C", historicalHarvey: false, subscriberCount: 4200,
  },
  "77033": {
    zipCode: "77033", neighbourhood: "Third Ward / Sunnyside", jurisdiction: "City of Houston",
    stormImpact: "moderate", floodZone: "AE", inundationRiskFt: 1.9,
    evacuationZone: "B", historicalHarvey: true, subscriberCount: 2100,
  },
  "77051": {
    zipCode: "77051", neighbourhood: "South Park / South Acres", jurisdiction: "City of Houston",
    stormImpact: "minor", floodZone: "X", inundationRiskFt: 0.4,
    evacuationZone: "D", historicalHarvey: false, subscriberCount: 1800,
  },
  "77004": {
    zipCode: "77004", neighbourhood: "Midtown / Museum District", jurisdiction: "City of Houston",
    stormImpact: "none", floodZone: "X", inundationRiskFt: 0.0,
    evacuationZone: "none", historicalHarvey: false, subscriberCount: 6200,
  },
  "77002": {
    zipCode: "77002", neighbourhood: "Downtown Houston", jurisdiction: "City of Houston",
    stormImpact: "none", floodZone: "X", inundationRiskFt: 0.0,
    evacuationZone: "none", historicalHarvey: false, subscriberCount: 3400,
  },
};

// County resources keyed by zip
const COUNTY_RESOURCES: Record<string, string[]> = {
  "77085": [
    "Harris County Flood Control District emergency shelter: Westside Tennis Club (19115 Shadowwood Dr) — capacity 400",
    "FEMA Disaster Assistance: 1-800-621-FEMA (3362) — zip 77085 declared disaster area",
    "Harris County Precinct 2 emergency distribution: 8200 Market St — water, food, ice",
    "Houston Public Works Meyerland flood pump station status: www.publicworks.houstontx.gov/status",
  ],
  "77089": [
    "Harris County Southeast shelter: South Belt Community Center (11101 Scarsdale Blvd) — capacity 600",
    "FEMA Disaster Assistance: 1-800-621-FEMA (3362) — zip 77089 declared disaster area",
    "Texas Division of Emergency Management: www.tdem.texas.gov/hurricane-mara",
    "Harris County Judge Lina Hidalgo disaster hotline: 713-274-1111",
  ],
  "77069": [
    "Harris County Pct 4 emergency info: www.pct4.hctx.net/emergencies",
    "Houston Flood Warning System alerts: floodwarning.com",
    "FEMA: Apply for individual assistance at www.disasterassistance.gov",
    "Red Cross Houston shelter locator: 713-526-8300",
  ],
  "77059": [
    "City of Houston Office of Emergency Management: 832-394-1600",
    "NASA JSC (Clear Lake) emergency public advisory: www.nasa.gov/emergency",
    "Harris County Flood Control District: 713-684-4000",
  ],
  "77033": [
    "Houston Volunteer Fire Department Third Ward: 713-921-9600",
    "Harris County Precinct 1 emergency services: 281-427-6200",
    "Fifth Ward Multi-Service Center (shelter): 4014 Market St",
    "FEMA Disaster Assistance: 1-800-621-FEMA",
  ],
};

// ─── Tools ────────────────────────────────────────────────────────────────────

// GET /classify-zip-by-storm-impact?zip_code=77085
router.get("/classify-zip-by-storm-impact", (req: Request, res: Response) => {
  const zip = String(req.query.zip_code ?? "").replace(/\s/g, "");
  const profile = ZIP_DATA[zip];
  if (!profile) {
    return res.json({
      success: true,
      zipCode: zip,
      stormImpact: "unknown",
      note: `No impact data available for zip ${zip}. Treating as unaffected.`,
    });
  }
  return res.json({ success: true, ...profile });
});

// GET /get-flood-zone-data?zip_codes=77085,77089
router.get("/get-flood-zone-data", (req: Request, res: Response) => {
  const raw   = String(req.query.zip_codes ?? "");
  const zips  = raw ? raw.split(",").map(z => z.trim()) : Object.keys(ZIP_DATA);
  const results = zips.map(zip => {
    const p = ZIP_DATA[zip];
    if (!p) return { zipCode: zip, found: false };
    return {
      zipCode:          p.zipCode,
      neighbourhood:    p.neighbourhood,
      floodZone:        p.floodZone,
      inundationRiskFt: p.inundationRiskFt,
      evacuationZone:   p.evacuationZone,
      historicalHarvey: p.historicalHarvey,
      stormImpact:      p.stormImpact,
      found: true,
    };
  });
  const affectedZips = results.filter(r => (r as any).stormImpact === "severe" || (r as any).stormImpact === "moderate");
  return res.json({
    success: true,
    requestedCount: zips.length,
    results,
    affectedZipsCount: affectedZips.length,
    totalSubscribersInAffectedZips: affectedZips.reduce((s, r) => s + (ZIP_DATA[(r as any).zipCode]?.subscriberCount ?? 0), 0),
  });
});

// GET /get-neighbourhood-profile?zip_code=77085
router.get("/get-neighbourhood-profile", (req: Request, res: Response) => {
  const zip = String(req.query.zip_code ?? "").replace(/\s/g, "");
  const profile = ZIP_DATA[zip];
  if (!profile) {
    return res.json({ success: false, error: `No neighbourhood profile for zip ${zip}` });
  }
  const resources = COUNTY_RESOURCES[zip] ?? [];
  return res.json({
    success: true,
    ...profile,
    countyEmergencyResources: resources,
    resourceCount: resources.length,
    notes: resources.length > 0
      ? "Harris County has published flood assistance resources for this neighbourhood — relevant for storm-affected subscriber outreach."
      : "No specific county resources mapped for this neighbourhood.",
  });
});

export default router;
