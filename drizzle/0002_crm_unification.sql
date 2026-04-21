-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 0002: CRM Unification — Phase 1                              ║
-- ║  Creates 6 new tables + modifies 4 existing tables                       ║
-- ║  ALL changes are additive: no DROP, no RENAME, no data modification      ║
-- ╚═══════════════════════════��═══════════════════════════════════════════════╝

-- ═══════ MODIFY EXISTING TABLES ═══════

-- users: add role, phone, firma
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(20) DEFAULT 'admin';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firma" text;

-- ═══════ NEW TABLE: companies ═���═════
CREATE TABLE IF NOT EXISTS "companies" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "legal_name" text,
  "nif" varchar(20),
  "sector" varchar(50),
  "cnae" varchar(10),
  "address" text,
  "city" text,
  "province" varchar(50),
  "postal_code" varchar(10),
  "lat" real,
  "lng" real,
  "phone" text,
  "email" text,
  "website" text,
  "instagram" text,
  "facebook" text,
  "source" varchar(30),
  "tags" text[],
  "notes" text,
  "zone_id" integer,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "companies_user_idx" ON "companies" ("user_id");
CREATE INDEX IF NOT EXISTS "companies_nif_idx" ON "companies" ("nif");
CREATE INDEX IF NOT EXISTS "companies_province_idx" ON "companies" ("province");
CREATE INDEX IF NOT EXISTS "companies_source_idx" ON "companies" ("source");

-- contacts: add company_id FK (AFTER companies table exists)
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "company_id" integer REFERENCES "companies"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "contacts_company_idx" ON "contacts" ("company_id");

-- visits: add company_id + contact_id FKs
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "company_id" integer REFERENCES "companies"("id") ON DELETE SET NULL;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "visits_company_idx" ON "visits" ("company_id");

-- ═══════ NEW TABLE: supply_points ═══════
CREATE TABLE IF NOT EXISTS "supply_points" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "cups" varchar(25) UNIQUE,
  "address" text,
  "tariff" varchar(10),
  "power_p1_kw" real,
  "power_p2_kw" real,
  "power_p3_kw" real,
  "power_p4_kw" real,
  "power_p5_kw" real,
  "power_p6_kw" real,
  "annual_consumption_kwh" real,
  "monthly_spend_eur" real,
  "current_retailer" varchar(100),
  "distributor" varchar(100),
  "contract_expiry_date" timestamp,
  "estimated_savings_eur" real,
  "estimated_savings_pct" real,
  "status" varchar(20) DEFAULT 'active',
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "supply_points_company_idx" ON "supply_points" ("company_id");
CREATE INDEX IF NOT EXISTS "supply_points_cups_idx" ON "supply_points" ("cups");
CREATE INDEX IF NOT EXISTS "supply_points_retailer_idx" ON "supply_points" ("current_retailer");
CREATE INDEX IF NOT EXISTS "supply_points_expiry_idx" ON "supply_points" ("contract_expiry_date");

-- ═══════ NEW TABLE: opportunities ���══════
CREATE TABLE IF NOT EXISTS "opportunities" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "primary_contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "status" varchar(30) NOT NULL DEFAULT 'pendiente',
  "temperature" varchar(10),
  "priority" varchar(10),
  "estimated_value_eur" real,
  "expected_close_date" timestamp,
  "lost_reason" text,
  "source" varchar(30),
  "tags" text[],
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "closed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "opportunities_user_idx" ON "opportunities" ("user_id");
CREATE INDEX IF NOT EXISTS "opportunities_company_idx" ON "opportunities" ("company_id");
CREATE INDEX IF NOT EXISTS "opportunities_status_idx" ON "opportunities" ("status");
CREATE INDEX IF NOT EXISTS "opportunities_temperature_idx" ON "opportunities" ("temperature");
CREATE INDEX IF NOT EXISTS "opportunities_priority_idx" ON "opportunities" ("priority");
CREATE INDEX IF NOT EXISTS "opportunities_close_date_idx" ON "opportunities" ("expected_close_date");

-- cases: add company_id + opportunity_id FKs (AFTER opportunities exists)
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "company_id" integer REFERENCES "companies"("id") ON DELETE SET NULL;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "opportunity_id" integer REFERENCES "opportunities"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "cases_company_idx" ON "cases" ("company_id");
CREATE INDEX IF NOT EXISTS "cases_opportunity_idx" ON "cases" ("opportunity_id");

-- ═══════ NEW TABLE: services ═══════
CREATE TABLE IF NOT EXISTS "services" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "opportunity_id" integer REFERENCES "opportunities"("id") ON DELETE SET NULL,
  "supply_point_id" integer REFERENCES "supply_points"("id") ON DELETE SET NULL,
  "type" varchar(30) NOT NULL,
  "status" varchar(20) DEFAULT 'prospecting',
  "current_provider" text,
  "current_spend_eur" real,
  "offered_price_eur" real,
  "estimated_savings" real,
  "contract_date" timestamp,
  "expiry_date" timestamp,
  "data" jsonb,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "services_company_idx" ON "services" ("company_id");
CREATE INDEX IF NOT EXISTS "services_opportunity_idx" ON "services" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "services_type_idx" ON "services" ("type");
CREATE INDEX IF NOT EXISTS "services_status_idx" ON "services" ("status");

-- ═══════ NEW TABLE: documents ═══════
CREATE TABLE IF NOT EXISTS "documents" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "opportunity_id" integer REFERENCES "opportunities"("id") ON DELETE SET NULL,
  "uploaded_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "type" varchar(30),
  "file_url" text NOT NULL,
  "file_name" text,
  "file_size" integer,
  "file_mime" varchar(100),
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "documents_company_idx" ON "documents" ("company_id");
CREATE INDEX IF NOT EXISTS "documents_opportunity_idx" ON "documents" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "documents_type_idx" ON "documents" ("type");

-- ═══════ NEW TABLE: energy_bills ═══════
CREATE TABLE IF NOT EXISTS "energy_bills" (
  "id" serial PRIMARY KEY,
  "supply_point_id" integer NOT NULL REFERENCES "supply_points"("id") ON DELETE CASCADE,
  "document_id" integer REFERENCES "documents"("id") ON DELETE SET NULL,
  "billing_period_start" timestamp,
  "billing_period_end" timestamp,
  "retailer" varchar(100),
  "total_amount_eur" real,
  "energy_amount_eur" real,
  "power_amount_eur" real,
  "tax_amount_eur" real,
  "electricity_tax_eur" real,
  "meter_rental_eur" real,
  "reactive_eur" real,
  "consumption_kwh" jsonb,
  "power_kw" jsonb,
  "prices_eur_kwh" jsonb,
  "confidence_score" real,
  "raw_extraction" jsonb,
  "parsed_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "energy_bills_supply_point_idx" ON "energy_bills" ("supply_point_id");
CREATE INDEX IF NOT EXISTS "energy_bills_retailer_idx" ON "energy_bills" ("retailer");
CREATE INDEX IF NOT EXISTS "energy_bills_period_idx" ON "energy_bills" ("billing_period_end");
