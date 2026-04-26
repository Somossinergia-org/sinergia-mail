-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0011: dsr_requests table for legal-rgpd agent
-- ═══════════════════════════════════════════════════════════════════════════
-- Solicitudes de derechos del titular (Data Subject Rights) RGPD arts. 15-22.
-- Plazo legal: 1 mes desde recepción (ampliable a 3 si complejo).
--
-- Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "dsr_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_id" integer REFERENCES "companies"("id") ON DELETE SET NULL,
  "requester_name" text NOT NULL,
  "requester_email" text NOT NULL,
  "requester_id" varchar(20),
  "requester_phone" text,
  "right_type" varchar(30) NOT NULL,
  "description" text NOT NULL,
  "channel" varchar(20),
  "status" varchar(30) DEFAULT 'received' NOT NULL,
  "received_at" timestamp DEFAULT NOW() NOT NULL,
  "deadline_at" timestamp NOT NULL,
  "extended_deadline_at" timestamp,
  "response_at" timestamp,
  "response_summary" text,
  "rejection_reason" text,
  "evidence_url" text,
  "notes" text,
  "assigned_to" varchar(50),
  "created_by" varchar(50),
  "created_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "dsr_user_idx" ON "dsr_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "dsr_status_idx" ON "dsr_requests" ("status");
CREATE INDEX IF NOT EXISTS "dsr_deadline_idx" ON "dsr_requests" ("deadline_at");
CREATE INDEX IF NOT EXISTS "dsr_email_idx" ON "dsr_requests" ("requester_email");
