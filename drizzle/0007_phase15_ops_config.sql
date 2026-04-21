-- Phase 15: Base Operativa Editable — 6 tablas de configuración operacional
-- Catálogo de servicios, documentación, checklists, reglas email, partners, agentes

-- 1. Catálogo de servicios
CREATE TABLE IF NOT EXISTS service_catalog (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  vertical VARCHAR(30) NOT NULL,
  subtype VARCHAR(50),
  active BOOLEAN NOT NULL DEFAULT true,
  client_type VARCHAR(30) NOT NULL,
  economic_model VARCHAR(15) NOT NULL,
  price_setup REAL,
  price_monthly REAL,
  partner_id INTEGER,
  commission_fixed REAL,
  commission_recurring REAL,
  agent_owner VARCHAR(30),
  agent_support VARCHAR(30),
  requires_docs BOOLEAN DEFAULT false,
  commercial_description TEXT,
  internal_notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sc_user_idx ON service_catalog (user_id);
CREATE INDEX IF NOT EXISTS sc_vertical_idx ON service_catalog (vertical);
CREATE INDEX IF NOT EXISTS sc_active_idx ON service_catalog (active);

-- 2. Documentación requerida por servicio
CREATE TABLE IF NOT EXISTS service_documents (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  mandatory BOOLEAN NOT NULL DEFAULT true,
  applies_to_client VARCHAR(30),
  requested_by VARCHAR(30),
  reviewed_by VARCHAR(30),
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sd_service_idx ON service_documents (service_id);

-- 3. Tareas / checklist por servicio
CREATE TABLE IF NOT EXISTS service_checklists (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  mandatory BOOLEAN NOT NULL DEFAULT true,
  agent_responsible VARCHAR(30),
  flow_moment VARCHAR(30),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scl_service_idx ON service_checklists (service_id);

-- 4. Reglas de correo editables
CREATE TABLE IF NOT EXISTS email_rules (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  email_type VARCHAR(30) NOT NULL,
  sender_pattern TEXT,
  subject_pattern TEXT,
  category VARCHAR(30),
  routing VARCHAR(20),
  create_task BOOLEAN DEFAULT false,
  create_alert BOOLEAN DEFAULT false,
  create_case BOOLEAN DEFAULT false,
  extract_pdf BOOLEAN DEFAULT false,
  extract_excel BOOLEAN DEFAULT false,
  save_documentation BOOLEAN DEFAULT false,
  require_confirmation BOOLEAN DEFAULT false,
  agent_responsible VARCHAR(30),
  priority VARCHAR(10) DEFAULT 'media',
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS er_user_idx ON email_rules (user_id);
CREATE INDEX IF NOT EXISTS er_type_idx ON email_rules (email_type);
CREATE INDEX IF NOT EXISTS er_active_idx ON email_rules (active);

-- 5. Partners y comisiones
CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  vertical VARCHAR(30) NOT NULL,
  product TEXT,
  commission_fixed REAL,
  commission_recurring REAL,
  conditions TEXT,
  clawback TEXT,
  required_documentation TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p_user_idx ON partners (user_id);
CREATE INDEX IF NOT EXISTS p_vertical_idx ON partners (vertical);

-- 6. Roles operativos de agentes (distinto de agent_config que es config IA usuario)
CREATE TABLE IF NOT EXISTS ops_agent_roles (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  agent_slug VARCHAR(30) NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  verticals JSONB,
  client_types JSONB,
  can_do JSONB,
  cannot_do JSONB,
  services_owner JSONB,
  services_support JSONB,
  task_types JSONB,
  special_rules TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oar_user_idx ON ops_agent_roles (user_id);
CREATE INDEX IF NOT EXISTS oar_slug_idx ON ops_agent_roles (agent_slug);
