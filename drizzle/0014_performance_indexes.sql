-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0014: Índices compuestos para performance (auditoría 2026-04-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- Auditoría detectó queries lentas por falta de índices en columnas
-- frecuentemente filtradas juntas:
--
-- 1. opportunities (userId, status, temperature) — usado en /api/crm/executive
--    para get_pipeline_status. Sin índice = full scan en cada llamada.
-- 2. services (companyId, type, status) — usado en getVerticalMetrics.
--    JOIN frecuente sin índice compuesto = O(n²) con cientos de servicios.
-- 3. emails (userId, isRead, priority) — usado en business_dashboard counter.
-- 4. invoices (userId, dueDate) — usado en get_overdue_invoices + dashboards.
-- 5. issued_invoices (userId, issueDate) — usado en fiscal_calculate_modelo_303.
-- 6. contacts (userId, temperature) — frecuentes filtros CRM.
-- 7. agent_logs (userId, createdAt) — observabilidad.
-- 8. audit_events (userId, createdAt) — timeline reconstruction.
--
-- Idempotente con IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "opportunities_user_status_temp_idx"
  ON "opportunities" ("user_id", "status", "temperature");

CREATE INDEX IF NOT EXISTS "services_company_type_status_idx"
  ON "services" ("company_id", "type", "status");

CREATE INDEX IF NOT EXISTS "emails_user_read_priority_idx"
  ON "emails" ("user_id", "is_read", "priority");

CREATE INDEX IF NOT EXISTS "invoices_user_due_date_idx"
  ON "invoices" ("user_id", "due_date");

CREATE INDEX IF NOT EXISTS "issued_invoices_user_issue_date_idx"
  ON "issued_invoices" ("user_id", "issue_date");

CREATE INDEX IF NOT EXISTS "contacts_user_temperature_idx"
  ON "contacts" ("user_id", "temperature");

CREATE INDEX IF NOT EXISTS "agent_logs_user_created_idx"
  ON "agent_logs" ("user_id", "created_at" DESC);

-- Email recent — cubre listado de bandeja ordenado por fecha
CREATE INDEX IF NOT EXISTS "emails_user_date_desc_idx"
  ON "emails" ("user_id", "date" DESC);

-- Sequence enrollments con nextSendAt — cron process-sequences
CREATE INDEX IF NOT EXISTS "sequence_enrollments_status_next_idx"
  ON "sequence_enrollments" ("status", "next_send_at")
  WHERE "status" = 'active';
