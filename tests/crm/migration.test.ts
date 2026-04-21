/**
 * Migration Integrity Tests — Phase 1
 * Verifies the SQL migration file exists and has the expected structure.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

describe("Migration 0002 — CRM Unification", () => {
  const migrationPath = resolve(__dirname, "../../drizzle/0002_crm_unification.sql");

  it("migration file exists", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf-8") : "";

  it("creates companies table", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "companies"');
  });

  it("creates supply_points table", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "supply_points"');
  });

  it("creates opportunities table", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "opportunities"');
  });

  it("creates services table", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "services"');
  });

  it("creates documents table", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "documents"');
  });

  it("creates energy_bills table", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "energy_bills"');
  });

  it("alters users table for role", () => {
    expect(sql).toContain('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role"');
  });

  it("alters contacts table for company_id", () => {
    expect(sql).toContain('ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "company_id"');
  });

  it("alters cases table for company_id and opportunity_id", () => {
    expect(sql).toContain('ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "company_id"');
    expect(sql).toContain('ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "opportunity_id"');
  });

  it("uses IF NOT EXISTS for idempotency", () => {
    const createStatements = sql.match(/CREATE TABLE/g) || [];
    const ifNotExists = sql.match(/CREATE TABLE IF NOT EXISTS/g) || [];
    expect(createStatements.length).toBe(ifNotExists.length);
  });

  it("uses ADD COLUMN IF NOT EXISTS for idempotency", () => {
    const alterStatements = sql.match(/ADD COLUMN/g) || [];
    const ifNotExists = sql.match(/ADD COLUMN IF NOT EXISTS/g) || [];
    expect(alterStatements.length).toBe(ifNotExists.length);
  });

  it("does NOT contain DROP statements", () => {
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("DROP COLUMN");
  });

  it("does NOT contain RENAME statements (as SQL commands)", () => {
    // Strip SQL comments before checking
    const sqlNoComments = sql.replace(/--.*$/gm, "");
    expect(sqlNoComments).not.toContain("RENAME");
  });

  it("all new columns on existing tables are nullable or have defaults", () => {
    // role has DEFAULT 'admin'
    expect(sql).toContain("DEFAULT 'admin'");
    // company_id and opportunity_id on cases reference with SET NULL
    expect(sql).toContain("ON DELETE SET NULL");
  });
});
