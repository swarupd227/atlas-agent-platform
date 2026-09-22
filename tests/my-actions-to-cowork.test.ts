/**
 * My Actions is folded into Astra Cowork. Every kind of item it decides is
 * now decided in Cowork's Needs you, by the same code and with the same audit
 * record, so with Cowork on /my-actions and /actions open Cowork. The page
 * stays at /my-actions/classic, and is the page when Cowork is off.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("My Actions opens Cowork", () => {
  const app = read("client", "src", "App.tsx");

  it("/my-actions and /actions go to Cowork when it's on and the role may open it", () => {
    expect(app).toContain('<Route path="/my-actions" component={MyActionsRoute} />');
    expect(app).toContain('<Route path="/actions" component={MyActionsRoute} />');
    expect(app).toContain('const toCowork = !isLoading && enabled && isRouteAllowed("/astra");');
  });

  it("the page stays reachable as classic, before the redirecting route", () => {
    expect(app).toContain('<Route path="/my-actions/classic" component={MyActions} />');
    expect(app.indexOf('path="/my-actions/classic"')).toBeLessThan(app.indexOf('path="/my-actions" '));
  });

  it("the business sidebar shows Cowork with the count, and My Actions only when Cowork is off", () => {
    const sidebar = read("client", "src", "components", "app-sidebar.tsx");
    expect(sidebar).toContain('{ title: "Astra Cowork", url: "/astra", icon: MessageSquareText, badge: pendingActions > 0 ? pendingActions : undefined }');
    expect(sidebar).toContain('...(astraEnabled ? [] : [{ title: "My Actions"');
  });
});

describe("inside Cowork, nothing points back to My Actions", () => {
  it("the rail's 'see all' asks Astra", () => {
    const rail = read("client", "src", "astra", "rail.tsx");
    expect(rail).toContain('onAskAbout("Show me everything that needs my decision.")');
    expect(rail).not.toContain('href="~/my-actions"');
  });

  it("the Needs you card's full view is Approvals, and an item a role can't decide links to the classic page", () => {
    expect(read("server", "astra", "tools", "list-needs-me.ts")).toContain('fullViewHref: "/approvals"');
    const route = read("server", "astra", "needs-you.ts");
    expect(route).toContain('href: "/my-actions/classic"');
    expect(route).not.toContain('href: "/my-actions",');
  });
});
