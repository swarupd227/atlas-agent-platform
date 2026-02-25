import { Router, type Request, type Response } from "express";
import { getWebAnalytics, getSegments } from "../mock-data/marketing-leads";

const router = Router();

router.post("/api/2.0/reports", (req: Request, res: Response) => {
  const { rsid, globalFilters, metricContainer, dimension, settings } = req.body || {};

  const analytics = getWebAnalytics();

  const dimensionName = dimension || "variables/page";
  const dateRange = globalFilters?.find((f: any) => f.type === "dateRange")?.dateRange;
  const segmentId = globalFilters?.find((f: any) => f.type === "segment")?.segmentId;

  let rows: any[];

  if (dimensionName.includes("page") || dimensionName.includes("evar1")) {
    rows = analytics.pages.map((p, i) => ({
      itemId: String(i + 1),
      value: p.url,
      data: [p.pageViews, p.uniqueVisitors, p.avgTimeOnPage, p.bounceRate],
    }));
  } else if (dimensionName.includes("referrer") || dimensionName.includes("marketingchannel")) {
    rows = analytics.referralSources.map((r, i) => ({
      itemId: String(i + 1),
      value: `${r.source} / ${r.medium}`,
      data: [r.sessions, Math.floor(r.sessions * 0.72), Math.floor(r.sessions * 0.15)],
    }));
  } else if (dimensionName.includes("event") || dimensionName.includes("funnel")) {
    rows = analytics.conversionFunnel.map((step, i) => ({
      itemId: String(i + 1),
      value: step.step,
      data: [step.count, step.rate],
    }));
  } else {
    rows = analytics.pages.map((p, i) => ({
      itemId: String(i + 1),
      value: p.title,
      data: [p.pageViews, p.uniqueVisitors],
    }));
  }

  if (segmentId) {
    const segIndex = parseInt(segmentId.replace(/\D/g, ""), 10) || 0;
    const factor = 0.3 + (segIndex % 5) * 0.15;
    rows = rows.map((r) => ({
      ...r,
      data: r.data.map((d: number) => Math.floor(d * factor)),
    }));
  }

  const metricIds = metricContainer?.metrics?.map((m: any) => m.id) || [
    "metrics/pageviews",
    "metrics/uniquevisitors",
    "metrics/timespent",
    "metrics/bouncerate",
  ];

  res.json({
    totalPages: 1,
    firstPage: true,
    lastPage: true,
    numberOfElements: rows.length,
    number: 0,
    totalElements: rows.length,
    columns: {
      dimension: {
        id: dimensionName,
        type: "string",
      },
      columnIds: metricIds,
    },
    rows,
    summaryData: {
      totals: rows.length > 0
        ? rows[0].data.map((_: any, colIdx: number) =>
            rows.reduce((sum, r) => sum + (r.data[colIdx] || 0), 0)
          )
        : [],
    },
    reportId: `report-${Date.now()}`,
  });
});

router.get("/api/2.0/segments", (_req: Request, res: Response) => {
  const segments = getSegments();

  res.json({
    content: segments.map((seg) => ({
      id: seg.id,
      name: seg.name,
      description: seg.description,
      rsid: "fitch-ratings-prod",
      owner: {
        id: 100001,
        name: "Analytics Admin",
        login: "admin@analytics.example.com",
      },
      definition: seg.definition,
      compatibility: { valid: true, message: "Compatible" },
      reportSuiteName: "Fitch Ratings Production",
      modified: new Date().toISOString(),
    })),
    totalPages: 1,
    totalElements: segments.length,
    number: 0,
    numberOfElements: segments.length,
    firstPage: true,
    lastPage: true,
  });
});

export default router;
