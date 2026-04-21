-- Phase 14: Email → IA → Action CRM — operational classification columns
-- Adds second-pass classification, routing destination, and classification metadata

ALTER TABLE emails ADD COLUMN IF NOT EXISTS operational_category VARCHAR(30);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS routing VARCHAR(20);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS classification_meta JSONB;

-- Index for operational category (used in dashboards and filtering)
CREATE INDEX IF NOT EXISTS emails_op_category_idx ON emails (operational_category);
-- Index for routing (used by action executor to find pending actions)
CREATE INDEX IF NOT EXISTS emails_routing_idx ON emails (routing);
