-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0015: Commission rates catalog + service tracking + payouts
-- ═══════════════════════════════════════════════════════════════════════════
-- Permite a fiscal y bi-scoring proyectar ingresos por comisiones desde el
-- catálogo importado (comisiones_unificadas.csv, 1413 filas).
--
-- Tablas:
--   commission_rates     — catálogo: por (provider, tariff, concept) cuánto cobramos
--   commission_payouts   — quién paga David por cada provider (broker intermediario)
--   services.commission_rate_id — vincula contrato activo a su rate vigente
--
-- Idempotente con IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "commission_rates" (
  "id" serial PRIMARY KEY,
  "category" varchar(30) NOT NULL,         -- energia | telecomunicaciones | seguros | ...
  "provider" varchar(60) NOT NULL,         -- ELEIA | IGNIS | GANA | ENDESA | IBERDROLA | ...
  "product_type" varchar(40),              -- luz | gas | dual | tlf | ...
  "action" varchar(20),                    -- alta | renovacion | cambio_titular | ...
  "product" text,                          -- nombre comercial (TU DECIDES, MARE PLUS...)
  "tariff" varchar(40),                    -- 2.0TD | 3.0TD | RL.4 | ...
  "concept" text,                          -- BALANCE OF ENERGY (POTENCIA) | "0 - 2.500 KWH" | ...
  "coverage" text,                         -- restricciones de cobertura
  "clawback" text,                         -- política de retroceso si el cliente cancela
  "commission_sin_iva" real,               -- comisión base €
  "commission_iva" real,                   -- comisión con IVA 21% €
  "valid_from" timestamp,
  "valid_to" timestamp,                    -- NULL = vigente indefinida
  "priority" integer DEFAULT 100,          -- prioridad para resolver ambigüedades
  "active" boolean DEFAULT true,
  "source_sheet" text,                     -- de qué hoja vino (ENERGÍA, TELEFONÍA...)
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "comm_rates_provider_tariff_idx"
  ON "commission_rates" ("provider", "tariff");
CREATE INDEX IF NOT EXISTS "comm_rates_category_active_idx"
  ON "commission_rates" ("category", "active");
CREATE INDEX IF NOT EXISTS "comm_rates_validity_idx"
  ON "commission_rates" ("valid_from", "valid_to") WHERE "active" = true;

-- ─── Broker / pagador real (intermediario que factura David) ──────────────
-- David factura a empresas intermediarias que trabajan para ELEIA/IGNIS/GANA.
-- Esta tabla mapea: provider energético → broker_company_id (en companies).
CREATE TABLE IF NOT EXISTS "commission_payouts" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(60) NOT NULL,         -- ELEIA, IGNIS, GANA, ...
  "payer_company_id" integer REFERENCES "companies"("id") ON DELETE SET NULL,
  "payer_name" text,                       -- fallback si aún no creaste la company
  "iva_rate" real DEFAULT 21.0,            -- 21 | 10 | 4 | 0
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "comm_payouts_user_provider_idx"
  ON "commission_payouts" ("user_id", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "comm_payouts_user_provider_unique"
  ON "commission_payouts" ("user_id", "provider");

-- ─── Vincular services al rate vigente ────────────────────────────────────
-- Permite proyectar comisiones esperadas: services activos × rate × periodo.
ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "commission_rate_id" integer
    REFERENCES "commission_rates"("id") ON DELETE SET NULL;

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "provider" varchar(60);

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "tariff" varchar(40);

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "external_id" text;        -- ID externo del CRM origen

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "commission_estimated_eur" real;

CREATE INDEX IF NOT EXISTS "services_rate_id_idx"
  ON "services" ("commission_rate_id");

CREATE INDEX IF NOT EXISTS "services_external_id_idx"
  ON "services" ("external_id");

-- ─── Companies: añadir IBAN (no estaba en schema base) ────────────────────
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "iban" varchar(40);
