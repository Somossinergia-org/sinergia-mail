-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0013: añadir columnas faltantes en `contacts` (temperature, score)
-- ═══════════════════════════════════════════════════════════════════════════
-- Auditoría 2026-04-26 detectó que business_dashboard fallaba con
-- "column temperature does not exist" — el schema.ts (línea 245) define
-- contacts.temperature pero la BD de producción no lo tenía.
--
-- También añadimos `score` por si falta (causaba error en migración 0012
-- al intentar crear índice contacts_score_idx).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "temperature" varchar(10);

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "score" integer DEFAULT 50;

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "category" varchar(30);

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "company" text;

CREATE INDEX IF NOT EXISTS "contacts_temperature_idx" ON "contacts" ("temperature");

CREATE INDEX IF NOT EXISTS "contacts_score_idx" ON "contacts" ("score");

CREATE INDEX IF NOT EXISTS "contacts_category_idx" ON "contacts" ("category");
