/**
 * The notification bell sits in the header of every page, so what it asks for is paid on every page load.
 * It used to download the entire audit log (11,738 events, 11 MB, over 20 seconds on production, and growing
 * with every event) and the full approvals list (1 MB), which queued every other request behind them: a
 * 3 KB eval-trace lookup waited 6 seconds. The audit log fed only an "Incidents Triggered" section that
 * filters on eventType === "incident_created" with a severity and a timestamp, and audit events have none of
 * those fields, so it could never show anything. These pin:
 *   - that premise, so adding such columns later forces a rethink instead of leaving the section dropped;
 *   - that the bell no longer asks for the audit log or the full approvals list;
 *   - that it asks for pending approvals under the sidebar's key, so the two share one request and an
 *     approvals invalidation still refreshes it;
 *   - and that what it does show (approvals, drift, violations, invoices, exceptions) is still there.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { auditEvents } from "../shared/schema";

const bell = readFileSync(new URL("../client/src/components/notification-center.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../client/src/components/app-sidebar.tsx", import.meta.url), "utf8");

describe("why the bell does not need the audit log", () => {
  it("audit events have no incident-style fields, so the old filter could never match", () => {
    const cols = Object.keys(getTableColumns(auditEvents));
    for (const field of ["eventType", "severity", "timestamp", "objectName"]) expect(cols).not.toContain(field);
    expect(cols).toEqual(expect.arrayContaining(["action", "objectType", "details", "createdAt"]));
  });
});

describe("what the bell asks for", () => {
  it("never downloads the audit log", () => {
    expect(bell).not.toContain("/api/audit-events");
    expect(bell).not.toMatch(/AuditEvent\b/);
    expect(bell).not.toMatch(/recentIncidents|Incidents Triggered|incident_created/);
  });

  it("asks for pending approvals only, not the whole list", () => {
    expect(bell).not.toMatch(/queryKey: \["\/api\/approvals"\]/);
    expect(bell).toContain('queryKey: ["/api/approvals", "pending"]');
    expect(bell).toContain("/api/approvals?status=pending");
  });

  it("uses the sidebar's key for it, so one request serves both and invalidating approvals refreshes both", () => {
    expect(sidebar).toContain('queryKey: ["/api/approvals", "pending"]');
    expect(sidebar).toContain("/api/approvals?status=pending");
  });

  it("still shows approvals, drift, policy violations, invoices and expiring exceptions, and counts them", () => {
    for (const section of ["Approvals Needed", "Drift Detected", "Policy Violations", "Invoices Ready", "Exceptions Expiring"]) {
      expect(bell).toContain(section);
    }
    expect(bell).toMatch(/const totalCount = pendingApprovals\.length \+ criticalDrift\.length \+ readyInvoices\.length \+ expiringExceptions\.length \+ activeCriticalViolations\.length;/);
  });
});
