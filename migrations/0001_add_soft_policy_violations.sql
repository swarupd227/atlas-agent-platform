-- Migration: add soft_policy_violations column to run_traces
-- Task: #100 — Post-execution soft policy semantic validator
-- Applied: 2026-03-30 (dev), apply to prod before deploying soft-policy validator
--
-- SAFE: uses IF NOT EXISTS — idempotent, can be run multiple times.
-- DO NOT use db:push for this — known schema drift on knowledge_chunks.embedding
-- would cause the embedding column to be dropped.

ALTER TABLE run_traces
  ADD COLUMN IF NOT EXISTS soft_policy_violations jsonb;
