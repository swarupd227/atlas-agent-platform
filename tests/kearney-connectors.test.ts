/**
 * The two connectors a managed-services engagement's journeys read from, and the
 * three properties that make them usable rather than merely present.
 *
 * **Aggregates across the set, full depth on one record.** A question about
 * 28,028 incidents is answered with counts and never by returning rows; a
 * question about one incident returns all of it. A capped read says how many it
 * withheld, because a count mistaken for the whole answer is how a journey comes
 * to a confident wrong conclusion.
 *
 * **The records keep their defects.** Most incidents sit at a priority nobody
 * set and the category column holds "Software" and "software" as separate
 * values. The connector must not tidy either away: they are what two of the
 * journeys exist to address, and folding them here would hide the finding while
 * appearing to help.
 *
 * **A match is never an assertion.** Tickets carry no application reference, so
 * resolution returns candidates with the term each matched on, and a term that
 * several applications share identifies none of them.
 *
 * The figures asserted below are the client extract's own, so this file also
 * fixes the seed: regenerate it wrongly and these fail rather than the numbers
 * quietly changing underneath a bid.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import itsmRouter from "../server/mock-mcp/kearney-itsm";
import estateRouter from "../server/mock-mcp/kearney-estate";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/itsm", itsmRouter);
  app.use("/estate", estateRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const get = async (path: string) => (await fetch(base + path)).json();
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

describe("the ITSM connector answers across the set with counts", () => {
  it("counts every incident, not a sample, and returns no rows to do it", async () => {
    const res = await get("/itsm/volume?groupBy=priority");
    expect(res.matched).toBe(28028);
    expect(res.of).toBe(28028);
    expect(res).not.toHaveProperty("incidents");
    const planning = res.groups.find((g: any) => g.value === "5 - Planning");
    expect(planning.count).toBe(26249);
    expect(planning.share).toBeCloseTo(93.65, 1);
  });

  it("keeps the two cases of the category apart instead of folding them", async () => {
    const res = await get("/itsm/volume?groupBy=category");
    const upper = res.groups.find((g: any) => g.value === "Software");
    const lower = res.groups.find((g: any) => g.value === "software");
    expect(upper.count).toBe(7168);
    expect(lower.count).toBe(915);
  });

  it("filters case-sensitively, so a caller asking for one variant does not silently get both", async () => {
    const upper = await get("/itsm/incidents?category=Software&limit=1");
    const lower = await get("/itsm/incidents?category=software&limit=1");
    expect(upper.matched).toBe(7168);
    expect(lower.matched).toBe(915);
  });

  it("says how many rows it withheld, so a capped page is not read as the whole answer", async () => {
    const res = await get("/itsm/incidents?category=Applications&limit=3");
    expect(res.returned).toBe(3);
    expect(res.matched).toBe(2286);
    expect(res.withheld).toBe(2283);
    expect(res.guidance).toMatch(/more match/);
  });

  it("returns one incident in full, because that is what a triage step reads", async () => {
    const res = await get("/itsm/incident?number=INC0143139");
    expect(res.incident).toMatchObject({
      number: "INC0143139",
      category: "Security",
      subcategory: "Duo SSO",
      priority: "5 - Planning",
      assignment_group: "WW_SRVCNOW_AG_GSCGHD_GG",
    });
    expect(res.incident.short_description.length).toBeGreaterThan(0);
  });

  it("refuses an incident it does not hold rather than returning an empty shell", async () => {
    const r = await fetch(base + "/itsm/incident?number=INC9999999");
    expect(r.status).toBe(404);
  });

  it("reports the problem-management gap as work: groups over a threshold with no problem record", async () => {
    const res = await get("/itsm/recurrence?minIncidents=600&limit=20");
    expect(res.groups_over_threshold).toBeGreaterThan(0);
    const lockout = res.candidates.find((c: any) => c.subcategory === "Account Lock-Out");
    expect(lockout.count).toBe(2484);
    expect(lockout.existing_problems).toEqual([]);
    expect(lockout.is_candidate).toBe(true);
  });

  it("summarises the priority and coverage findings without being asked for rows", async () => {
    const res = await get("/itsm/summary");
    expect(res.incidents).toBe(28028);
    expect(res.problems).toBe(49);
    expect(res.priority_hygiene.at_planning).toBe(26249);
    // 49 records explaining 750 incidents: absence is the normal case here.
    expect(res.problem_coverage.incidents_linked).toBe(750);
    expect(res.categorisation_hygiene.case_collisions.length).toBeGreaterThan(0);
  });
});

describe("the ITSM connector will not write without an approval", () => {
  it("refuses a correction that carries no approval id", async () => {
    const res = await post("/itsm/incident/update", { number: "INC0143139", fields: { priority: "2 - High" } });
    expect(res.status).toBe(422);
    expect(res.body.written).toBe(false);
    expect(res.body.error).toMatch(/approvalRef is required/);
  });

  it("refuses a field it does not own, naming it", async () => {
    const res = await post("/itsm/incident/update", { number: "INC0143139", fields: { state: "Closed" }, approvalRef: "APR-1" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/state/);
    expect(res.body.writable).toContain("priority");
  });

  it("records what the field held before, and puts it back on rollback", async () => {
    const before = (await get("/itsm/incident?number=INC0119015")).incident.priority;
    const write = await post("/itsm/incident/update", { number: "INC0119015", fields: { priority: "2 - High" }, approvalRef: "APR-7742" });
    expect(write.status).toBe(200);
    expect(write.body.before.priority).toBe(before);
    expect(write.body.after.priority).toBe("2 - High");
    expect((await get("/itsm/incident?number=INC0119015")).incident.priority).toBe("2 - High");

    const audit = await get("/itsm/audit");
    const entry = audit.writes.find((w: any) => w.undoId === write.body.undoId);
    expect(entry.approvalRef).toBe("APR-7742");

    const undo = await post("/itsm/rollback", { undoId: write.body.undoId });
    expect(undo.body.undone).toBe(true);
    expect((await get("/itsm/incident?number=INC0119015")).incident.priority).toBe(before);
    // Rolling the same write back twice is a mistake worth reporting, not a no-op.
    expect((await post("/itsm/rollback", { undoId: write.body.undoId })).status).toBe(409);
  });

  it("refuses a problem record that cites incidents which do not exist", async () => {
    const res = await post("/itsm/problem/create", {
      shortDescription: "Account lock-outs recurring after SSO change",
      category: "Security",
      relatedIncidents: ["INC0143139", "INC0000001"],
      approvalRef: "APR-7743",
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/INC0000001/);
  });

  it("opens a problem record when every incident it cites is real", async () => {
    const res = await post("/itsm/problem/create", {
      shortDescription: "Account lock-outs recurring after SSO change",
      category: "Security",
      subcategory: "Account Lock-Out",
      relatedIncidents: ["INC0143139"],
      approvalRef: "APR-7744",
    });
    expect(res.status).toBe(200);
    expect(res.body.problem.related_incidents).toBe(1);
    expect(res.body.problem.approvalRef).toBe("APR-7744");
    await post("/itsm/reset", {});
  });
});

describe("the estate connector offers candidates, never an identification", () => {
  it("resolves a distinctive name from the controlled sub-category", async () => {
    const res = await get("/estate/resolve-application?subcategory=Duo%20SSO&category=Security");
    expect(res.confident).toBe("Cisco Duo");
    const hit = res.candidates.find((c: any) => c.application === "Cisco Duo");
    expect(hit.matched_in).toBe("subcategory");
    expect(hit.weak_match).toBe(false);
    expect(hit.criticality).toBeTruthy();
  });

  it("declines to choose when the term is a vendor family several applications share", async () => {
    const res = await get("/estate/resolve-application?subcategory=Cisco%20AMP%20for%20Endpoints");
    expect(res.confident).toBeNull();
    expect(res.candidates.length).toBeGreaterThan(1);
    // Every candidate matched only on "Cisco", which identifies none of them.
    expect(res.candidates.every((c: any) => c.weak_match)).toBe(true);
    expect(res.guidance).toMatch(/weak matches|ordinary words/);
  });

  it("says the application is unknown rather than guessing one", async () => {
    const res = await get("/estate/resolve-application?text=Printer%20installation&category=Printing");
    expect(res.candidates).toEqual([]);
    expect(res.confident).toBeNull();
    expect(res.guidance).toMatch(/treat the application as unknown/);
  });

  it("requires something to match against", async () => {
    const r = await fetch(base + "/estate/resolve-application");
    expect(r.status).toBe(422);
  });

  it("keeps the client's declared incident count and the attributed one apart", async () => {
    const res = await get("/estate/application?name=Cisco%20Duo");
    expect(res.incidents.declared_in_inventory).toBeTruthy();
    expect(res.incidents.attributed_from_ticket_text).toBeGreaterThan(0);
    expect(res.incidents.note).toMatch(/not expected to agree/);
  });

  it("holds the whole estate, including the towers this engagement does not bid for", async () => {
    const res = await get("/estate/summary");
    expect(res.applications).toBe(79);
    expect(res.servers).toBe(508);
    expect(res.databases).toBe(65);
    expect(res.end_user_devices).toBe(9815);
    expect(res.not_in_this_inventory.join(" ")).toMatch(/integration or dependency/);
  });

  it("reports the gaps in the inventory rather than inventing what is missing", async () => {
    const res = await get("/estate/gaps");
    expect(res.structural.map((g: any) => g.gap).join(" ")).toMatch(/integration or dependency records/);
    // Tier is empty for every application; criticality carries the banding, so
    // this is a column the client does not use rather than data that went missing.
    expect(res.tier_column_unused.count).toBe(79);
    expect(res.missing_criticality.count).toBe(0);
  });

  it("will not change reference data without an approval, and puts it back on rollback", async () => {
    const refused = await post("/estate/application/annotate", { name: "Anaplan", fields: { criticality: "1-Critical" } });
    expect(refused.status).toBe(422);

    const write = await post("/estate/application/annotate", { name: "Anaplan", fields: { criticality: "1-Critical" }, approvalRef: "APR-8801" });
    expect(write.body.before.criticality).toBe("2-High");
    expect((await get("/estate/application?name=Anaplan")).application.criticality).toBe("1-Critical");
    await post("/estate/rollback", { undoId: write.body.undoId });
    expect((await get("/estate/application?name=Anaplan")).application.criticality).toBe("2-High");
    await post("/estate/reset", {});
  });
});
