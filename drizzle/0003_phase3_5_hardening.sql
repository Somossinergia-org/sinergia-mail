-- Phase 3.5: Energy Hardening Migration
-- 1. Remove global unique constraint on CUPS, add compound unique (cups, company_id)
-- 2. Add file_hash column to energy_bills for deduplication
-- 3. Add dedup unique index on energy_bills (supply_point_id, billing_period_start, billing_period_end)

-- Step 1: Drop old global unique index on cups
DROP INDEX IF EXISTS "supply_points_cups_key";
ALTER TABLE "supply_points" DROP CONSTRAINT IF EXISTS "supply_points_cups_unique";

-- Step 2: Create compound unique index (cups scoped per company)
CREATE UNIQUE INDEX IF NOT EXISTS "supply_points_cups_company_uniq"
  ON "supply_points" ("cups", "company_id");

-- Step 3: Add file_hash column to energy_bills
ALTER TABLE "energy_bills"
  ADD COLUMN IF NOT EXISTS "file_hash" VARCHAR(64);

-- Step 4: Create deduplication unique index on energy_bills
-- Prevents duplicate bills for same supply point + same billing period
CREATE UNIQUE INDEX IF NOT EXISTS "energy_bills_dedup_idx"
  ON "energy_bills" ("supply_point_id", "billing_period_start", "billing_period_end");

-- Step 5: Index on file_hash for fast lookups
CREATE INDEX IF NOT EXISTS "energy_bills_file_hash_idx"
  ON "energy_bills" ("file_hash");
