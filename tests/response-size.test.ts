/**
 * Two reasons pages were slow. Nothing was compressed, and the approvals list
 * carried the evidence of every request ever decided: 3.3 MB, 47s to arrive,
 * fetched by the notification centre on every page. Responses are now
 * compressed (never a stream), and the list carries evidence only for open
 * requests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { shouldCompress } from "../server/compression";

const res = (type?: string) => ({ getHeader: (name: string) => (name.toLowerCase() === "content-type" ? type : undefined) }) as any;
const req = (accept = "application/json") => ({ headers: { accept, "accept-encoding": "gzip" } }) as any;
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("compression", () => {
  it("compresses JSON and HTML", () => {
    expect(shouldCompress(req(), res("application/json; charset=utf-8"))).toBe(true);
    expect(shouldCompress(req("text/html"), res("text/html"))).toBe(true);
  });

  it("never touches an event stream, whichever side says so", () => {
    expect(shouldCompress(req("text/event-stream"), res("application/json"))).toBe(false);
    expect(shouldCompress(req(), res("text/event-stream"))).toBe(false);
    expect(shouldCompress(req(), res("application/x-ndjson"))).toBe(false);
  });

  it("is mounted before the routes", () => {
    const index = read("server", "index.ts");
    expect(index).toContain("app.use(compressResponses);");
    expect(index.indexOf("app.use(compressResponses);")).toBeLessThan(index.indexOf('app.use("/api", authMiddleware);'));
  });
});

describe("the approvals list", () => {
  const route = read("server", "routes", "governance.ts");
  const storage = read("server", "storage.ts");

  it("carries evidence only for open requests, unless asked for everything", () => {
    expect(route).toContain('req.query.full === "1" ? await storage.getApprovals(getOrgId(req)) : await storage.getApprovalSummaries(getOrgId(req))');
    expect(storage).toContain("case when ${approvals.status} in ('pending', 'changes_requested') then ${approvals.evidenceJson} else null end");
  });

  it("cuts the description down in the list, where only a line of it is shown", () => {
    // 682 rows carried 1.9 MB of description; the detail route still has the whole thing.
    expect(storage).toContain("left(${approvals.description}, 400)");
  });

  it("a single approval looks up what it concerns by id and reads its history narrowly", () => {
    const at = route.indexOf('router.get("/api/approvals/:id", async');
    const body = route.slice(at, at + 1500);
    expect(body).not.toContain("storage.getAuditEvents(");
    expect(body).not.toContain("storage.getAgents(");
    expect(body).toContain("approvalHistory(");
  });

  it("the Approvals page loads a decided request's evidence when it's opened", () => {
    expect(read("client", "src", "pages", "approvals-home.tsx")).toContain('useQuery<Approval>({ queryKey: ["/api/approvals", row.id], enabled: !isOpen(row.status) && row.evidenceJson == null })');
  });
});
