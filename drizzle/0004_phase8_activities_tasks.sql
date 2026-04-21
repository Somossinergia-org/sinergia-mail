-- Phase 8: Commercial Activities + Tasks
-- Actividad comercial real + tareas operativas

-- ── Commercial Activities ──
CREATE TABLE IF NOT EXISTS commercial_activities (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL, -- llamada | email | whatsapp | visita | nota | seguimiento | cambio_estado | tarea_completada | renovacion | propuesta_enviada
  summary TEXT NOT NULL,
  outcome TEXT,
  next_step TEXT,
  due_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activities_company_idx ON commercial_activities(company_id);
CREATE INDEX IF NOT EXISTS activities_user_idx ON commercial_activities(user_id);
CREATE INDEX IF NOT EXISTS activities_opportunity_idx ON commercial_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS activities_type_idx ON commercial_activities(type);
CREATE INDEX IF NOT EXISTS activities_due_idx ON commercial_activities(due_at);
CREATE INDEX IF NOT EXISTS activities_created_idx ON commercial_activities(created_at);

-- ── Commercial Tasks ──
CREATE TABLE IF NOT EXISTS commercial_tasks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority VARCHAR(10) NOT NULL DEFAULT 'media', -- alta | media | baja
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- pendiente | en_progreso | completada | cancelada
  due_at TIMESTAMP,
  source VARCHAR(20) NOT NULL DEFAULT 'manual', -- manual | suggested | followup | renewal | case
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_user_idx ON commercial_tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_company_idx ON commercial_tasks(company_id);
CREATE INDEX IF NOT EXISTS tasks_opportunity_idx ON commercial_tasks(opportunity_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON commercial_tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON commercial_tasks(due_at);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON commercial_tasks(priority);
