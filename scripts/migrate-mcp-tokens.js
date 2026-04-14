/**
 * Migration: create mcp_tokens table.
 * Run: node scripts/migrate-mcp-tokens.js
 */
const postgres = require("postgres");
require("dotenv").config({ path: ".env.local" });

const DDL = `
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS mcp_tokens_user_idx ON mcp_tokens (user_id);
CREATE INDEX IF NOT EXISTS mcp_tokens_hash_idx ON mcp_tokens (token_hash);
`;

(async () => {
  const url = process.env.CLOUDSQL_URL;
  if (!url) {
    console.error("CLOUDSQL_URL missing in .env.local");
    process.exit(1);
  }
  const sql = postgres(url, { ssl: "require" });
  try {
    console.log("Running migration...");
    await sql.unsafe(DDL);
    const rows = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'mcp_tokens' ORDER BY ordinal_position`;
    console.log("✓ mcp_tokens table ready. Columns:");
    rows.forEach((r) => console.log(`  ${r.column_name} (${r.data_type})`));
  } catch (e) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
