import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execFileSync } from "child_process";

/**
 * The commit this bundle was built from, or "unknown".
 *
 * Never fails the build: a deploy from an exported archive has no git at all,
 * and a missing stamp is a smaller problem than a deploy that will not run.
 */
function buildCommit(): string {
  const fromEnv = process.env.BUILD_COMMIT || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      // Stamped into the bundle so a deployment can say which commit it is
      // serving. Answering "is my fix live?" otherwise means comparing response
      // wording against the source — which on 2026-09-29 took two model calls
      // and a forensic diff to establish that two of four commits were live.
      "process.env.BUILD_COMMIT": JSON.stringify(buildCommit()),
      "process.env.BUILD_TIME": JSON.stringify(new Date().toISOString()),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
