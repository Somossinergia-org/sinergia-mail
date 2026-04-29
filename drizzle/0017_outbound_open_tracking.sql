-- Migration 0017: Pixel tracking de aperturas en outbound_messages
--
-- Añade 3 columnas para registrar aperturas de email vía pixel HMAC inyectado
-- en el HTML al momento del envío. Las aperturas las registra el endpoint
-- público GET /api/track/open?msg=ID&t=TOKEN (devuelve GIF 1x1 transparente).
--
-- - first_opened_at: timestamp de la primera apertura
-- - last_opened_at: timestamp de la última apertura
-- - open_count: total de aperturas (puede ser >1 si el cliente abre varias veces)
--
-- Index outbound_first_opened_idx para CampaignPanel (tasa de apertura por user).

ALTER TABLE outbound_messages
  ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS outbound_first_opened_idx
  ON outbound_messages (user_id, first_opened_at);
