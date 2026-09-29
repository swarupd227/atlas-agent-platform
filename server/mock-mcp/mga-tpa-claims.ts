import { Router, type Request, type Response } from "express";
import { BINDER_TERMS, PERIODS, isPeriod, now, money, sum, risksFor, type PeriodId } from "./mga-close-seed";

/**
 * Simulated third-party claims administrator: the movements that belong in the
 * period's claims bordereau.
 *
 * Claims are delegated to a TPA under a separate authority, so this is the one
 * leg of the close the MGA does not control. It is also where referential
 * integrity actually breaks in practice: a TPA reports a movement against a
 * policy number the MGA's book has never held, usually a transposition or a
 * policy written under a different binder. February seeds exactly that -- two
 * orphan rows -- because a validator that only checks a file against itself
 * would pass them.
 */
const router = Router();

const badPeriod = (res: Response, got: unknown) =>
  res.status(422).json({ error: `Unknown reporting period "${String(got)}".`, availablePeriods: Object.keys(PERIODS) });

interface ClaimRow {
  claimId: string;
  policyNumber: string;
  lossDate: string;
  reportedDate: string;
  cause: string;
  paidMovement: number;
  reserveMovement: number;
  recoveries: number;
  status: "open" | "closed" | "reopened";
  /** Set only where a period seeds a defect. */
  defect?: string;
}

const CAUSES = ["Named windstorm", "Water damage - non weather", "Fire", "Theft", "Hail", "Business interruption"];

function claimsFor(periodId: PeriodId): ClaimRow[] {
  const risks = risksFor(periodId);
  const rows: ClaimRow[] = [];
  // Roughly one claim per six risks, deterministic by position.
  for (let i = 0; i < risks.length; i += 6) {
    const r = risks[i];
    const n = rows.length;
    rows.push({
      claimId: `CLM-${periodId.replace("-", "")}-${String(n + 1).padStart(3, "0")}`,
      policyNumber: r.policyNumber,
      lossDate: `${periodId}-${String(5 + (n % 20)).padStart(2, "0")}`,
      reportedDate: `${periodId}-${String(9 + (n % 18)).padStart(2, "0")}`,
      cause: CAUSES[n % CAUSES.length],
      paidMovement: money(4_000 + n * 1_850),
      reserveMovement: money(12_000 - n * 400),
      recoveries: n % 4 === 0 ? money(1_200 + n * 90) : 0,
      status: n % 5 === 0 ? "closed" : "open",
    });
  }
  if (periodId === "2026-02") {
    // Two movements against policy numbers this binder has never held. The
    // shape a real TPA feed breaks in: plausible, adjacent, and wrong.
    rows.push({
      claimId: "CLM-202602-901", policyNumber: "POL-2026-9287-CP", lossDate: "2026-02-11", reportedDate: "2026-02-14",
      cause: "Named windstorm", paidMovement: 18_400, reserveMovement: 22_000, recoveries: 0, status: "open",
      defect: "policy number not in this binder's book",
    });
    rows.push({
      claimId: "CLM-202602-902", policyNumber: "POL-2026-9311-CP", lossDate: "2026-02-19", reportedDate: "2026-02-23",
      cause: "Hail", paidMovement: 6_750, reserveMovement: 9_500, recoveries: 0, status: "open",
      defect: "policy number not in this binder's book",
    });
  }
  return rows;
}

router.get("/claims-movements", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const rows = claimsFor(periodId);
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  // 100 for the same reason as the transaction pull: a claims bordereau
  // assembled from a truncated page is a bordereau that is quietly wrong.
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25) || 25));
  const page = rows.slice(offset, offset + limit);
  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    totalMatching: rows.length,
    offset,
    limit,
    returned: page.length,
    movements: page.map(({ defect, ...r }) => r),
    totals: {
      paidMovement: sum(rows.map((r) => r.paidMovement)),
      reserveMovement: sum(rows.map((r) => r.reserveMovement)),
      recoveries: sum(rows.map((r) => r.recoveries)),
      incurred: sum(rows.map((r) => r.paidMovement + r.reserveMovement - r.recoveries)),
    },
    retrievedAt: now(),
    guidance:
      "These movements come from the TPA, not from the MGA's own systems. Check every policy number against the period's bound transactions before the claims bordereau is assembled: a movement against a policy this binder never wrote is a referential break, and reporting it to the carrier as if it were ours is worse than holding the file back.",
  });
});

/** Incurred by binder, which the loss ratio and profit commission read. */
router.get("/incurred-summary", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const rows = claimsFor(periodId);
  const known = new Set(risksFor(periodId).map((r) => r.policyNumber));
  const matched = rows.filter((r) => known.has(r.policyNumber));
  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    movementCount: rows.length,
    matchedToBinderBook: matched.length,
    unmatched: rows.length - matched.length,
    incurredAllMovements: sum(rows.map((r) => r.paidMovement + r.reserveMovement - r.recoveries)),
    incurredMatchedOnly: sum(matched.map((r) => r.paidMovement + r.reserveMovement - r.recoveries)),
    retrievedAt: now(),
    guidance:
      "Use incurredMatchedOnly for the loss ratio: an unmatched movement is not this binder's loss until somebody establishes that it is. The difference between the two figures is exactly what the referential check is for.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  res.json({ reset: true, periods: Object.keys(PERIODS).length, resetAt: now() });
});

export default router;
