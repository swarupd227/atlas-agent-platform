-- ============================================================
-- PREFLIGHT: Insert missing organization record
-- Run this BEFORE dump_2_data_core_clean.sql
-- ============================================================

INSERT INTO "organizations" ("id", "name", "slug", "plan", "status", "created_at")
VALUES ('cf5754b1-ee80-4b51-8bf6-7be263c97527', 'Default Organization', 'default', 'enterprise', 'active', '2026-03-29T06:31:49.109118')
ON CONFLICT DO NOTHING;
