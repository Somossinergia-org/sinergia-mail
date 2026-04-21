-- Phase 9: Operational Notifications
-- Notificaciones operativas internas: vencimientos, seguimientos, renovaciones, cross-sell, inactividad

CREATE TABLE IF NOT EXISTS operational_notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES commercial_tasks(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  type VARCHAR(40) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'info',
  status VARCHAR(15) NOT NULL DEFAULT 'new',
  source VARCHAR(15) NOT NULL DEFAULT 'system',
  dedup_key VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  seen_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS notif_user_idx ON operational_notifications(user_id);
CREATE INDEX IF NOT EXISTS notif_status_idx ON operational_notifications(status);
CREATE INDEX IF NOT EXISTS notif_type_idx ON operational_notifications(type);
CREATE INDEX IF NOT EXISTS notif_severity_idx ON operational_notifications(severity);
CREATE INDEX IF NOT EXISTS notif_company_idx ON operational_notifications(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS notif_dedup_idx ON operational_notifications(user_id, dedup_key);
CREATE INDEX IF NOT EXISTS notif_created_idx ON operational_notifications(created_at);
