/**
 * The three one-page screens share a list-and-detail layout. Radix ScrollArea
 * wraps its content in display:table, which grows to fit the widest row, so a
 * long agent or policy name pushed the row past its 320px panel and clipped
 * the environment/status on the right (seen live on Deployments: rows 404px
 * wide in a 320px panel). Each list forces block layout on that wrapper.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const FIX = '<ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">';

describe("list panels keep rows to the panel width", () => {
  it.each(["deployments-overview.tsx", "governance-overview.tsx", "eval-studio-home.tsx"])("%s", (file) => {
    const src = readFileSync(join(__dirname, "..", "client", "src", "pages", file), "utf8");
    expect(src).toContain(FIX);
    expect(src).not.toContain('<ScrollArea className="flex-1">');
  });
});
