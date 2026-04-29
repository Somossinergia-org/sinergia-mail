-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0016: Security hardening + índices compuestos faltantes
-- ═══════════════════════════════════════════════════════════════════════════
-- Auditoría 2026-04-29 (5 agentes paralelos: CEO/Backend/Frontend/Security/DevOps).
--
-- 1. UNIQUE en email_accounts(user_id, email) — el oauth-callback dependía
--    de no-duplicados sin enforcer. Race condition explotable en login
--    concurrente del mismo usuario.
-- 2. Índices compuestos para queries con ORDER BY frecuentes:
--    - companies(user_id, updated_at DESC)
--    - opportunities(user_id, updated_at DESC)
--    - operational_notifications(user_id, status, created_at DESC)
--    - commercial_tasks(user_id, status, due_at)
-- 3. Índice parcial contacts WHERE company_id IS NULL (listUnlinkedContacts).
--
-- Idempotente con IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. UNIQUE email_accounts ──
-- Antes de añadir UNIQUE: dedup. Si hay duplicados (user_id, email) deja el
-- más reciente y borra los demás. Esto solo elimina filas duplicadas que
-- no deberían existir nunca.
DELETE FROM "email_accounts"
WHERE id NOT IN (
  SELECT MAX(id) FROM "email_accounts" GROUP BY user_id, email
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_accounts_user_email_unique"
  ON "email_accounts" ("user_id", "email");

-- ── 2. Índices compuestos ──
CREATE INDEX IF NOT EXISTS "companies_user_updated_idx"
  ON "companies" ("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "opportunities_user_updated_idx"
  ON "opportunities" ("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "operational_notifications_user_status_created_idx"
  ON "operational_notifications" ("user_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "commercial_tasks_user_status_due_idx"
  ON "commercial_tasks" ("user_id", "status", "due_at");

-- ── 3. Índice parcial: contactos sin empresa ──
CREATE INDEX IF NOT EXISTS "contacts_unlinked_idx"
  ON "contacts" ("user_id")
  WHERE "company_id" IS NULL;
