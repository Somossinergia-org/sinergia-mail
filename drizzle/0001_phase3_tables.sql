-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3 Migration: cases + audit_events + swarm_working_memory
-- ═══════════════════════════════════════════════════════════════════════════
-- Apply: npx drizzle-kit push (preferred)
-- Or manual: psql $CLOUDSQL_URL -f drizzle/0001_phase3_tables.sql
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── CASES ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cases" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "client_identifier" text NOT NULL,
  "visible_owner_id" varchar(40),
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "subject" text,
  "channel" varchar(30),
  "metadata" jsonb,
  "interaction_count" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "closed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "cases_user_idx" ON "cases" ("user_id");
CREATE INDEX IF NOT EXISTS "cases_client_idx" ON "cases" ("client_identifier");
CREATE INDEX IF NOT EXISTS "cases_user_client_idx" ON "cases" ("user_id", "client_identifier");
CREATE INDEX IF NOT EXISTS "cases_status_idx" ON "cases" ("status");
CREATE INDEX IF NOT EXISTS "cases_owner_idx" ON "cases" ("visible_owner_id");
CREATE INDEX IF NOT EXISTS "cases_contact_idx" ON "cases" ("contact_id");

-- ─── AUDIT EVENTS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" serial PRIMARY KEY,
  "event_id" text NOT NULL,
  "case_id" text,
  "user_id" text NOT NULL,
  "agent_id" varchar(40) NOT NULL,
  "agent_layer" varchar(30),
  "event_type" varchar(50) NOT NULL,
  "result" varchar(20) NOT NULL,
  "tool_name" varchar(60),
  "visible_owner_id" varchar(40),
  "target_agent_id" varchar(40),
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_events_case_idx" ON "audit_events" ("case_id");
CREATE INDEX IF NOT EXISTS "audit_events_user_idx" ON "audit_events" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_events_agent_idx" ON "audit_events" ("agent_id");
CREATE INDEX IF NOT EXISTS "audit_events_type_idx" ON "audit_events" ("event_type");
CREATE INDEX IF NOT EXISTS "audit_events_date_idx" ON "audit_events" ("created_at");
CREATE INDEX IF NOT EXISTS "audit_events_result_idx" ON "audit_events" ("result");

-- ─── SWARM WORKING MEMORY ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "swarm_working_memory" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "current_task" text,
  "active_agent_id" varchar(40),
  "pending_delegations" jsonb DEFAULT '[]',
  "context_summary" text,
  "started_at" timestamp,
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "swarm_wm_user_idx" ON "swarm_working_memory" ("user_id");

-- ═══════════════════════════════════════════════════════════════════════════
-- Done. Tables are ready for DualAuditStore, CaseService, and memory-engine.
-- ═══════════════════════════════════════════════════════════════════════════
