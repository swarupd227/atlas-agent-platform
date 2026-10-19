# Hilti MarCom AWS Monorepo Migration Implementation Plan

> **For implementers:** Execute each task in order and keep production writes behind the explicit confirmation guard.

**Goal:** Fix model-label handling centrally, migrate the validated Hilti team to AWS Production monorepo, verify it, and push the repository branch.

**Architecture:** A small canonicalization helper sits at the existing LLM provider boundary. A separate operational script reads one approved team snapshot from the source database and reconciles it through target APIs with dry-run planning and post-write verification.

**Tech Stack:** TypeScript, Vitest, Express APIs, PostgreSQL read-only source access.

### Task 1: Canonicalize model labels centrally

**Files:** `server/llm-provider.ts`, `tests/llm-resilience.test.ts`

1. Add failing coverage for provider display labels, punctuation, canonical IDs, and unknown IDs.
2. Implement catalog-first canonicalization with a future-compatible Claude family/version fallback.
3. Apply canonicalization only at the provider call boundary and confirm routing behavior is unchanged.
4. Run the focused resilience tests.

### Task 2: Add the guarded migration utility

**Files:** `scripts/hilti-campaign-migration.ts`, `tests/hilti-campaign-migration.test.ts`, `.github/workflows/ci.yml`

1. Add tests for normalized matching, ambiguity refusal, graph remapping, and write guards.
2. Read the approved source team and dependencies with a read-only database client.
3. Build a deterministic dry-run plan and apply it through authenticated target APIs only.
4. Verify the exact six-node/six-edge target graph, bindings, source counts, and canonical model IDs.
5. Add the focused test to the CI test list.

### Task 3: Apply and hand off

1. Run focused tests, typecheck for touched files, build, and `git diff --check`.
2. Dry-run against AWS Production monorepo, inspect the plan, then apply with the confirmation guard.
3. Re-run verification and perform one Hilti team smoke run if the environment permits it.
4. Commit and push `codex/hilti-marcom-aws-monorepo-20261019`.
