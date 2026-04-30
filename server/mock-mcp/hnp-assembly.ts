import { Router, type Request, type Response } from "express";

const router = Router();

// ─── Static Assembly corpus dataset ───────────────────────────────────────────
// Hurricane Mara context: 47 Houston/Harris County government meetings, past 90 days

type Speaker = { name: string; role: string; affiliation: string };
type Excerpt = { timestampSec: number; speaker: string; text: string; topic: string };
type Transcript = {
  meetingId: string;
  jurisdiction: string;
  body: string;
  meetingType: string;
  date: string;
  durationMinutes: number;
  attendees: Speaker[];
  keywordTags: string[];
  excerpts: Excerpt[];
};

const COUNCIL_SPEAKERS: Speaker[] = [
  { name: "John Whitmire",        role: "Mayor",                 affiliation: "City of Houston" },
  { name: "Abbie Kamin",          role: "Council Member, Dist C", affiliation: "City of Houston" },
  { name: "Edward Pollard",       role: "Council Member, Dist J", affiliation: "City of Houston" },
  { name: "Tarsha Jackson",       role: "Council Member, Dist B", affiliation: "City of Houston" },
  { name: "Mary Nan Huffman",     role: "Council Member, Dist G", affiliation: "City of Houston" },
  { name: "Letitia Plummer",      role: "Council Member At-Large, Pos 4", affiliation: "City of Houston" },
];

const HARRIS_SPEAKERS: Speaker[] = [
  { name: "Lina Hidalgo",         role: "County Judge",          affiliation: "Harris County" },
  { name: "Rodney Ellis",         role: "Commissioner, Pct 1",   affiliation: "Harris County" },
  { name: "Adrian Garcia",        role: "Commissioner, Pct 2",   affiliation: "Harris County" },
  { name: "Tom Ramsey",           role: "Commissioner, Pct 3",   affiliation: "Harris County" },
  { name: "Lesley Briones",       role: "Commissioner, Pct 4",   affiliation: "Harris County" },
  { name: "Tina Petersen",        role: "Director",              affiliation: "Harris County Flood Control District" },
];

const COMMITMENT_LINES = [
  "We are committing $340 million from the 2023 bond proceeds to drainage improvements in Districts B, D, and J — every project must be under construction by Q3 2024.",
  "I want it on the record: HCFCD will deliver the Brays Bayou North Channel widening before next hurricane season — if we miss that deadline I will personally answer for it.",
  "Council, we owe the residents of Kashmere Gardens an answer about the Hunting Bayou pump stations. Staff has assured me they will be operational by July of this year.",
  "The Sims Bayou drainage package — $87 million, 14 projects — these were promised in the 2023 vote. As of this meeting only four are at substantial completion.",
  "We awarded the West Houston detention pond contract to Allied Hydro Construction in May 2024. The project is now 11 months behind schedule.",
  "Our risk model — and I want this entered into the record — predicts a Category 3 storm making landfall along the Bolivar Peninsula will cause 12 to 18 inches of street flooding across the Memorial corridor.",
  "I voted against the infrastructure bond package because the contractor selection process lacked transparency. I stand by that vote today.",
  "The contributions disclosed in my campaign filings are public record. Allied Hydro is one of many supporters — there is nothing improper here.",
  "Mayor, our flood gauges in Harris County have not been calibrated since 2022. Funding for the recalibration was approved but the work has not been awarded.",
  "Tropical Storm Imelda taught us that we cannot rely on neighborhood-scale detention alone. The regional system has to be funded — and right now it is underfunded by roughly $410 million over the five-year horizon.",
];

const RESPONSE_LINES = [
  "Mayor, I share the Council Member's frustration. We will provide a project-by-project status update at the next meeting.",
  "I will direct the City Attorney to release the contractor performance data by end of week.",
  "Madam Judge, with respect, the contractor was selected through the standard procurement process. The campaign contributions are unrelated.",
  "We need to be honest with the public: the 2023 bond money was approved on a five-year delivery horizon. We are at the eighteen-month mark and we are behind.",
  "I move that we direct the Public Works Director to deliver a written report on the status of every drainage project in the 2023 bond by the next regular meeting.",
  "I second the motion. And I would add that the report should specify, for each project, the contractor, the original delivery date, the current delivery date, and the reason for any slippage.",
];

const TOPIC_TAGS = [
  ["flood_control", "drainage", "infrastructure", "bond_program"],
  ["emergency_preparedness", "evacuation", "shelter", "disaster_response"],
  ["contractor_oversight", "procurement", "campaign_contributions"],
  ["budget", "appropriations", "capital_improvement_plan"],
  ["public_works", "permitting", "stormwater"],
];

// Deterministic seeded number generator
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

const TODAY = new Date("2026-04-30T00:00:00Z");

function buildCorpus(): Transcript[] {
  const corpus: Transcript[] = [];

  // 47 meetings spread across the past 90 days
  for (let i = 0; i < 47; i++) {
    const rng = seededRng(1009 + i * 137);
    const isHarris = i % 3 === 0;
    const speakers = isHarris ? HARRIS_SPEAKERS : COUNCIL_SPEAKERS;
    const daysBack = Math.floor((i / 47) * 90);
    const meetingDate = new Date(TODAY.getTime() - daysBack * 86400000);
    const meetingType = isHarris
      ? pick(["Commissioners Court", "HCFCD Quarterly Briefing", "Emergency Preparedness Committee"], rng)
      : pick(["Regular Council Meeting", "Public Safety Committee", "Capital Improvement Plan Workshop", "Budget Committee"], rng);

    const tagSet = pick(TOPIC_TAGS, rng);
    const numExcerpts = 6 + Math.floor(rng() * 5);
    const excerpts: Excerpt[] = [];
    let lastTs = 120;
    for (let e = 0; e < numExcerpts; e++) {
      lastTs += 90 + Math.floor(rng() * 600);
      const isCommitment = rng() < 0.55;
      const speaker = pick(speakers, rng);
      excerpts.push({
        timestampSec: lastTs,
        speaker:      speaker.name,
        text:         isCommitment ? pick(COMMITMENT_LINES, rng) : pick(RESPONSE_LINES, rng),
        topic:        pick(tagSet, rng),
      });
    }

    corpus.push({
      meetingId:        `${isHarris ? "HC" : "HOU"}-${meetingDate.toISOString().split("T")[0]}-${String(i).padStart(3, "0")}`,
      jurisdiction:     isHarris ? "Harris County" : "City of Houston",
      body:             isHarris ? "Harris County Commissioners Court / HCFCD" : "Houston City Council",
      meetingType,
      date:             meetingDate.toISOString().split("T")[0],
      durationMinutes:  60 + Math.floor(rng() * 180),
      attendees:        speakers,
      keywordTags:      tagSet,
      excerpts,
    });
  }
  return corpus;
}

const CORPUS: Transcript[] = buildCorpus();

// ─── Tools ────────────────────────────────────────────────────────────────────

router.get("/get-transcripts", (req: Request, res: Response) => {
  const { jurisdiction, limit, lookback_days } = req.query;
  const limitN = Math.min(parseInt(limit as string) || 50, 100);
  const lookback = parseInt(lookback_days as string) || 90;
  const cutoff = new Date(TODAY.getTime() - lookback * 86400000);

  let results = CORPUS.filter(t => new Date(t.date) >= cutoff);
  if (jurisdiction) {
    const j = (jurisdiction as string).toLowerCase();
    results = results.filter(t => t.jurisdiction.toLowerCase().includes(j));
  }
  results = results.slice(0, limitN);

  const totalHours = results.reduce((acc, t) => acc + t.durationMinutes / 60, 0);
  res.json({
    success:        true,
    corpus:         "HNP Assembly Corpus",
    jurisdictionFilter: jurisdiction || "all",
    transcriptCount: results.length,
    totalHours:     Math.round(totalHours * 10) / 10,
    transcripts:    results.map(t => ({
      meetingId:       t.meetingId,
      jurisdiction:    t.jurisdiction,
      body:            t.body,
      meetingType:     t.meetingType,
      date:            t.date,
      durationMinutes: t.durationMinutes,
      attendeeCount:   t.attendees.length,
      keywordTags:     t.keywordTags,
      excerptCount:    t.excerpts.length,
    })),
  });
});

router.get("/search-transcript-corpus", (req: Request, res: Response) => {
  const { query, jurisdiction, limit } = req.query;
  const q = ((query as string) || "").toLowerCase();
  const limitN = Math.min(parseInt(limit as string) || 25, 100);

  const matches: Array<{
    meetingId: string; jurisdiction: string; date: string; meetingType: string;
    timestampSec: number; speaker: string; text: string; topic: string;
  }> = [];

  for (const t of CORPUS) {
    if (jurisdiction) {
      const j = (jurisdiction as string).toLowerCase();
      if (!t.jurisdiction.toLowerCase().includes(j)) continue;
    }
    for (const ex of t.excerpts) {
      if (!q || ex.text.toLowerCase().includes(q) || ex.topic.includes(q)) {
        matches.push({
          meetingId:    t.meetingId,
          jurisdiction: t.jurisdiction,
          date:         t.date,
          meetingType:  t.meetingType,
          timestampSec: ex.timestampSec,
          speaker:      ex.speaker,
          text:         ex.text,
          topic:        ex.topic,
        });
        if (matches.length >= limitN) break;
      }
    }
    if (matches.length >= limitN) break;
  }

  res.json({
    success:    true,
    query:      query || "(unfiltered)",
    matchCount: matches.length,
    matches,
  });
});

router.get("/get-transcript-by-meeting", (req: Request, res: Response) => {
  const { meeting_id } = req.query;
  if (!meeting_id) {
    return res.status(400).json({ success: false, error: "meeting_id is required" });
  }
  const t = CORPUS.find(x => x.meetingId === meeting_id);
  if (!t) {
    return res.status(404).json({ success: false, error: "transcript not found" });
  }
  res.json({ success: true, transcript: t });
});

router.get("/get-keyword-alerts", (req: Request, res: Response) => {
  const { keyword, lookback_days } = req.query;
  const kws = keyword
    ? [(keyword as string).toLowerCase()]
    : ["flood", "drainage", "contractor", "bond", "evacuation", "preparedness"];
  const lookback = parseInt(lookback_days as string) || 90;
  const cutoff = new Date(TODAY.getTime() - lookback * 86400000);

  const alerts: Array<{
    keyword: string; meetingId: string; date: string; speaker: string; snippet: string; timestampSec: number;
  }> = [];

  for (const t of CORPUS) {
    if (new Date(t.date) < cutoff) continue;
    for (const ex of t.excerpts) {
      const lower = ex.text.toLowerCase();
      const hit = kws.find(k => lower.includes(k));
      if (hit) {
        alerts.push({
          keyword:      hit,
          meetingId:    t.meetingId,
          date:         t.date,
          speaker:      ex.speaker,
          snippet:      ex.text.slice(0, 240),
          timestampSec: ex.timestampSec,
        });
      }
    }
  }

  res.json({
    success:        true,
    lookbackDays:   lookback,
    keywordsTracked: kws,
    alertCount:     alerts.length,
    alerts:         alerts.slice(0, 100),
  });
});

export default router;
