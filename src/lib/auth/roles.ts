/**
 * Role-based auth helpers — Phase 1 CRM Unification
 *
 * Roles: admin | comercial | supervisor
 * Default: admin (all existing users remain admin)
 *
 * Phase 1 scope: helpers only, no middleware enforcement yet.
 * Phase 2 will add requireRole() middleware for CRM routes.
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type UserRole = "admin" | "comercial" | "supervisor";

const VALID_ROLES: readonly UserRole[] = ["admin", "comercial", "supervisor"] as const;

/**
 * Get the role of a user by ID.
 * Returns "admin" if user not found or role is null (safe default).
 */
export async function getUserRole(userId: string): Promise<UserRole> {
  const result = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const role = result[0]?.role;
  if (role && VALID_ROLES.includes(role as UserRole)) {
    return role as UserRole;
  }
  return "admin";
}

/**
 * Check if a role has sufficient privileges.
 * Hierarchy: admin > supervisor > comercial
 */
export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    comercial: 0,
    supervisor: 1,
    admin: 2,
  };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

/**
 * Validate that a string is a valid UserRole.
 */
export function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

/**
 * Update user role. Returns true if updated, false if user not found.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<boolean> {
  if (!isValidRole(role)) return false;

  const result = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId));

  return (result as any).rowCount > 0;
}
