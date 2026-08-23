/** Renders a sample .pptx/.pdf from server/document-renderer.ts, to eyeball output quality. */
import fs from "node:fs";
import path from "node:path";
import { renderPptx, renderPdf, documentSpecSchema } from "../server/document-renderer";

const spec = documentSpecSchema.parse({
  title: "Q3 Marketing Campaign",
  subtitle: "Performance summary and recommended next steps",
  author: "Astra Agents Platform",
  sections: [
    {
      heading: "Results",
      body: "Q3 delivered the strongest quarter of the year across every primary channel.",
      bullets: ["Revenue +18% QoQ, ahead of the +12% plan", "Qualified pipeline +22%", "Blended CAC down 8% to $412"],
      notes: "Lead with revenue, then move quickly to CAC.",
    },
    {
      heading: "Key Learnings",
      bullets: [
        "Paid social outperformed paid search on both CAC and conversion",
        "Long-form content drove the highest lead quality",
        "Retargeting saturated after roughly nine impressions",
      ],
    },
    {
      heading: "Next Steps",
      body: "Reallocate spend toward the channels that proved out in Q3.",
      bullets: ["Shift 20% of search budget to paid social", "Commission two long-form pieces per month", "Cap retargeting frequency at eight"],
    },
  ],
});

const outDir = process.argv[2] || process.cwd();
fs.writeFileSync(path.join(outDir, "q3-campaign-sample.pptx"), await renderPptx(spec));
fs.writeFileSync(path.join(outDir, "q3-campaign-sample.pdf"), await renderPdf(spec));
console.log(`wrote q3-campaign-sample.pptx and q3-campaign-sample.pdf to ${outDir}`);
