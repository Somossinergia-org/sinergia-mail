#!/usr/bin/env node

const postgres = require('postgres');

const sql = postgres('postgresql://postgres:SinergiaMail2024Secure@34.155.166.61:5432/sinergia_mail', {
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Running migration: Create contacts table...');

    await sql`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        email TEXT NOT NULL,
        company TEXT,
        nif TEXT,
        category VARCHAR(50),
        email_count INTEGER DEFAULT 0,
        last_email_date TIMESTAMP,
        total_invoiced REAL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log('Creating indexes...');

    await sql`CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts(email)`;
    await sql`CREATE INDEX IF NOT EXISTS contacts_user_email_idx ON contacts(user_id, email)`;

    console.log('✓ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
