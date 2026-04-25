-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0009: outbound_messages table
-- ═══════════════════════════════════════════════════════════════════════════
-- Esta tabla estaba definida en src/db/schema.ts pero nunca se generó archivo
-- de migración → la DB de producción no la tenía → el cron
-- /api/cron/process-outbound (corre cada 5 min) lleva fallando con
-- "relation outbound_messages does not exist".
--
-- Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "outbound_messages" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" varchar(10) NOT NULL,
  "destination" text NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "status" varchar(15) DEFAULT 'QUEUED',
  "event_type" varchar(50) NOT NULL,
  "source_type" varchar(30),
  "source_id" text,
  "attempts" integer DEFAULT 0,
  "max_attempts" integer DEFAULT 3,
  "last_error" text,
  "next_attempt_at" timestamp,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "outbound_user_idx"          ON "outbound_messages" ("user_id");
CREATE INDEX IF NOT EXISTS "outbound_status_idx"        ON "outbound_messages" ("status");
CREATE INDEX IF NOT EXISTS "outbound_next_attempt_idx"  ON "outbound_messages" ("next_attempt_at");
