-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0010: contracts table for legal-rgpd agent
-- ═══════════════════════════════════════════════════════════════════════════
-- Stores analyzed contracts (clients, suppliers, NDAs, DPAs, etc.) with
-- the latest legal_analyze_contract result + workflow status.
--
-- FKs declared inline (CREATE TABLE ... REFERENCES) to avoid the splitter
-- in /api/admin/migrate-all choking on multi-statement DO blocks.
--
-- Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "contracts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_id" integer REFERENCES "companies"("id") ON DELETE SET NULL,
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "type" varchar(30),
  "reference" text,
  "original_text" text,
  "original_filename" text,
  "original_url" text,
  "parties" jsonb,
  "start_date" timestamp,
  "end_date" timestamp,
  "duration" text,
  "auto_renewal" boolean,
  "notice_days" integer,
  "value" real,
  "currency" varchar(3) DEFAULT 'EUR',
  "payment_terms" text,
  "jurisdiction" text,
  "applicable_law" text DEFAULT 'espanol',
  "analysis" jsonb,
  "risk_score" integer,
  "ready_to_sign" boolean,
  "red_flags" jsonb,
  "missing_clauses" jsonb,
  "summary" text,
  "analyzed_by" varchar(50),
  "analyzed_at" timestamp,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "signed_date" timestamp,
  "notes" text,
  "created_by" varchar(50),
  "created_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "contracts_user_idx" ON "contracts" ("user_id");
CREATE INDEX IF NOT EXISTS "contracts_company_idx" ON "contracts" ("company_id");
CREATE INDEX IF NOT EXISTS "contracts_status_idx" ON "contracts" ("status");
CREATE INDEX IF NOT EXISTS "contracts_end_date_idx" ON "contracts" ("end_date");
CREATE INDEX IF NOT EXISTS "contracts_type_idx" ON "contracts" ("type");
