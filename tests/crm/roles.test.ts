/**
 * Roles Helper Tests — Phase 1 CRM Unification
 */
import { describe, it, expect } from "vitest";
import { hasMinRole, isValidRole, type UserRole } from "../../src/lib/auth/roles";

describe("Roles — hasMinRole", () => {
  it("admin has all roles", () => {
    expect(hasMinRole("admin", "admin")).toBe(true);
    expect(hasMinRole("admin", "supervisor")).toBe(true);
    expect(hasMinRole("admin", "comercial")).toBe(true);
  });

  it("supervisor has supervisor and comercial", () => {
    expect(hasMinRole("supervisor", "supervisor")).toBe(true);
    expect(hasMinRole("supervisor", "comercial")).toBe(true);
    expect(hasMinRole("supervisor", "admin")).toBe(false);
  });

  it("comercial only has comercial", () => {
    expect(hasMinRole("comercial", "comercial")).toBe(true);
    expect(hasMinRole("comercial", "supervisor")).toBe(false);
    expect(hasMinRole("comercial", "admin")).toBe(false);
  });
});

describe("Roles — isValidRole", () => {
  it("accepts valid roles", () => {
    expect(isValidRole("admin")).toBe(true);
    expect(isValidRole("comercial")).toBe(true);
    expect(isValidRole("supervisor")).toBe(true);
  });

  it("rejects invalid roles", () => {
    expect(isValidRole("superadmin")).toBe(false);
    expect(isValidRole("")).toBe(false);
    expect(isValidRole("ADMIN")).toBe(false);
  });
});
