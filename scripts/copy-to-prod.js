#!/usr/bin/env node
/**
 * scripts/copy-to-prod.js
 *
 * Copies Kinective Agent Templates and Member Services Skills
 * from the dev environment to production via REST APIs.
 *
 * Usage:
 *   node scripts/copy-to-prod.js                          # dry run — shows what will be copied
 *   node scripts/copy-to-prod.js --apply                  # actually copies to prod
 *   node scripts/copy-to-prod.js --apply --templates-only # skip skills
 *   node scripts/copy-to-prod.js --apply --skills-only    # skip templates
 *
 * Environment overrides:
 *   DEV_URL=http://localhost:5000 node scripts/copy-to-prod.js
 *   PROD_URL=https://your-custom.replit.app node scripts/copy-to-prod.js --apply
 *
 * Filters applied:
 *   Agent Templates — name or tags contain "kinective" (case-insensitive)
 *   Skills          — industry = "financial_services" AND domain contains "member" (case-insensitive)
 */

const DEV_URL   = process.env.DEV_URL  || "http://localhost:5000";
const PROD_URL  = process.env.PROD_URL || "https://agent-lifecycle-management-platform.replit.app";
const DRY_RUN   = !process.argv.includes("--apply");
const SKIP_TEMPLATES = process.argv.includes("--skills-only");
const SKIP_SKILLS    = process.argv.includes("--templates-only");

// ── Colours ────────────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  red:    "\x1b[31m",
  blue:   "\x1b[34m",
};
const ok  = (s) => `${C.green}✓${C.reset} ${s}`;
const err = (s) => `${C.red}✗${C.reset} ${s}`;
const inf = (s) => `${C.cyan}→${C.reset} ${s}`;
const dim = (s) => `${C.dim}${s}${C.reset}`;

// ── Helpers ────────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 200)}`);
  }
  return resp.json();
}

function stripMeta(obj, extraKeys = []) {
  const drop = new Set(["id", "createdAt", "updatedAt", ...extraKeys]);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !drop.has(k)));
}

// ── Filters ────────────────────────────────────────────────────────────────────
function isKinectiveTemplate(t) {
  const nameMatch = t.name?.toLowerCase().includes("kinective");
  const tagMatch  = Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes("kinective"));
  const catMatch  = t.category?.toLowerCase().includes("kinective");
  const indMatch  = t.industry?.toLowerCase().includes("kinective");
  return nameMatch || tagMatch || catMatch || indMatch;
}

function isMemberServicesSkill(s) {
  const inFinancial    = s.industry?.toLowerCase() === "financial_services";
  const inMemberDomain = s.domain?.toLowerCase().includes("member");
  return inFinancial && inMemberDomain;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}ATLAS — Copy Dev → Prod${C.reset}`);
  console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);
  console.log(inf(`Dev:  ${DEV_URL}`));
  console.log(inf(`Prod: ${PROD_URL}`));
  console.log(DRY_RUN
    ? `\n${C.yellow}${C.bold}DRY RUN — no changes will be made. Pass --apply to commit.${C.reset}\n`
    : `\n${C.green}${C.bold}APPLY MODE — changes will be written to prod.${C.reset}\n`);

  // ── 1. Fetch current prod state (for duplicate detection) ───────────────────
  console.log(`${C.bold}Fetching current prod state…${C.reset}`);
  const [prodTemplates, prodSkills] = await Promise.all([
    apiFetch(`${PROD_URL}/api/agent-templates`),
    apiFetch(`${PROD_URL}/api/skills`),
  ]);
  const prodTemplateNames = new Set(prodTemplates.map(t => t.name));
  const prodSkillNames    = new Set(prodSkills.map(s => s.name));
  console.log(dim(`  prod has ${prodTemplates.length} templates, ${prodSkills.length} skills`));

  // ── 2. Fetch dev state ──────────────────────────────────────────────────────
  console.log(`${C.bold}Fetching dev state…${C.reset}`);
  const [devTemplates, devSkills] = await Promise.all([
    apiFetch(`${DEV_URL}/api/agent-templates`),
    apiFetch(`${DEV_URL}/api/skills`),
  ]);
  console.log(dim(`  dev has ${devTemplates.length} templates, ${devSkills.length} skills`));

  // ── 3. Apply filters ────────────────────────────────────────────────────────
  const kinectiveTemplates = devTemplates.filter(isKinectiveTemplate);
  const memberSkills       = devSkills.filter(isMemberServicesSkill);

  console.log(`\n${C.bold}Kinective Agent Templates found in dev:${C.reset} ${kinectiveTemplates.length}`);
  for (const t of kinectiveTemplates) {
    const dupe = prodTemplateNames.has(t.name);
    console.log(`  ${dupe ? "~" : "+"} ${t.name}${dupe ? dim("  (already exists in prod — will skip)") : ""}`);
  }

  console.log(`\n${C.bold}Member Services Skills found in dev:${C.reset} ${memberSkills.length}`);
  for (const s of memberSkills) {
    const dupe = prodSkillNames.has(s.name);
    console.log(`  ${dupe ? "~" : "+"} ${s.name}${dim(`  [${s.domain}]`)}${dupe ? dim("  (already exists in prod — will skip)") : ""}`);
  }

  // ── 4. Warn if nothing matched ──────────────────────────────────────────────
  if (kinectiveTemplates.length === 0 && !SKIP_TEMPLATES) {
    console.log(`\n${C.yellow}No Kinective templates found in dev. Check the template names or tags.${C.reset}`);
    console.log(dim(`Available template names (first 10): ${devTemplates.slice(0, 10).map(t => t.name).join(", ")}`));
  }
  if (memberSkills.length === 0 && !SKIP_SKILLS) {
    console.log(`\n${C.yellow}No Member Services skills found. Check industry/domain fields.${C.reset}`);
    const sample = devSkills.slice(0, 5).map(s => `${s.name} (industry=${s.industry}, domain=${s.domain})`);
    console.log(dim(`Sample skills: ${sample.join(" | ")}`));
  }

  if (DRY_RUN) {
    console.log(`\n${C.yellow}Run with --apply to copy the items above to prod.${C.reset}\n`);
    return;
  }

  // ── 5. Copy templates ───────────────────────────────────────────────────────
  if (!SKIP_TEMPLATES && kinectiveTemplates.length > 0) {
    console.log(`\n${C.bold}Copying Agent Templates…${C.reset}`);
    for (const t of kinectiveTemplates) {
      if (prodTemplateNames.has(t.name)) {
        console.log(dim(`  ~ skipped (exists): ${t.name}`));
        continue;
      }
      const payload = stripMeta(t, ["usageCount", "deploymentCount", "avgKpiDelivery"]);
      try {
        const created = await apiFetch(`${PROD_URL}/api/agent-templates`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        console.log(ok(`  Created: ${t.name} → id ${created.id}`));
      } catch (e) {
        console.log(err(`  Failed: ${t.name} — ${e.message}`));
      }
    }
  }

  // ── 6. Copy skills ──────────────────────────────────────────────────────────
  if (!SKIP_SKILLS && memberSkills.length > 0) {
    console.log(`\n${C.bold}Copying Skills…${C.reset}`);
    for (const s of memberSkills) {
      if (prodSkillNames.has(s.name)) {
        console.log(dim(`  ~ skipped (exists): ${s.name}`));
        continue;
      }
      const payload = stripMeta(s, ["activationCount", "performanceScore", "lastEvalPassRate", "lastEvalAt", "descriptionQualityScore"]);
      try {
        const created = await apiFetch(`${PROD_URL}/api/skills`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        console.log(ok(`  Created: ${s.name} → id ${created.id}`));
      } catch (e) {
        console.log(err(`  Failed: ${s.name} — ${e.message}`));
      }
    }
  }

  console.log(`\n${C.green}${C.bold}Done.${C.reset}\n`);
}

main().catch(e => {
  console.error(`\n${C.red}Fatal: ${e.message}${C.reset}\n`);
  process.exit(1);
});
