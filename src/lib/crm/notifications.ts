/**
 * Operational Notifications — CRUD + queries.
 *
 * Phase 9: Internal notification system for operational awareness.
 * All queries enforce userId ownership.
 */

import { db } from "@/db";
import {
  operationalNotifications,
  companies,
  commercialTasks,
  opportunities,
  services,
} from "@/db/schema";
import {
  eq, and, sql, desc, asc, not, inArray, isNull, isNotNull, lte, gte, or,
} from "drizzle-orm";
import type { NewOperationalNotification, OperationalNotification } from "@/db/schema";

// ─── Constants ────────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  "task_overdue",
  "followup_overdue",
  "renewal_upcoming",
  "opportunity_stale",
  "cross_sell",
  "inactivity",
  "suggested_task",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ["info", "warning", "urgent"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_STATUSES = ["new", "seen", "dismissed", "resolved"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_SOURCES = ["system", "suggested", "rule"] as const;
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number];

// ─── CRUD ─────────────────────────────────────────────────────────────

export async function createNotification(input: NewOperationalNotification) {
  const [row] = await db
    .insert(operationalNotifications)
    .values(input)
    .onConflictDoNothing({ target: [operationalNotifications.userId, operationalNotifications.dedupKey] })
    .returning();
  return row ?? null;
}

export async function createNotificationsBatch(inputs: NewOperationalNotification[]) {
  if (inputs.length === 0) return [];
  return db
    .insert(operationalNotifications)
    .values(inputs)
    .onConflictDoNothing({ target: [operationalNotifications.userId, operationalNotifications.dedupKey] })
    .returning();
}

export async function updateNotificationStatus(
  notifId: number,
  userId: string,
  status: NotificationStatus,
) {
  const now = new Date();
  const updates: Partial<OperationalNotification> = { status };

  if (status === "seen") updates.seenAt = now;
  if (status === "resolved") updates.resolvedAt = now;

  const [row] = await db
    .update(operationalNotifications)
    .set(updates)
    .where(
      and(
        eq(operationalNotifications.id, notifId),
        eq(operationalNotifications.userId, userId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markAllSeen(userId: string) {
  const now = new Date();
  return db
    .update(operationalNotifications)
    .set({ status: "seen", seenAt: now })
    .where(
      and(
        eq(operationalNotifications.userId, userId),
        eq(operationalNotifications.status, "new"),
      ),
    )
    .returning({ id: operationalNotifications.id });
}

export async function dismissAllByType(userId: string, type: NotificationType) {
  return db
    .update(operationalNotifications)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(operationalNotifications.userId, userId),
        eq(operationalNotifications.type, type),
        not(inArray(operationalNotifications.status, ["dismissed", "resolved"])),
      ),
    )
    .returning({ id: operationalNotifications.id });
}

// ─── Queries ──────────────────────────────────────────────────────────

export async function listNotifications(
  userId: string,
  opts: {
    status?: NotificationStatus;
    type?: NotificationType;
    severity?: NotificationSeverity;
    companyId?: number;
    limit?: number;
    offset?: number;
  } = {},
) {
  const { status, type, severity, companyId, limit = 50, offset = 0 } = opts;

  const conditions = [eq(operationalNotifications.userId, userId)];
  if (status) conditions.push(eq(operationalNotifications.status, status));
  if (type) conditions.push(eq(operationalNotifications.type, type));
  if (severity) conditions.push(eq(operationalNotifications.severity, severity));
  if (companyId) conditions.push(eq(operationalNotifications.companyId, companyId));

  return db
    .select({
      notification: operationalNotifications,
      companyName: companies.name,
    })
    .from(operationalNotifications)
    .leftJoin(companies, eq(operationalNotifications.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(operationalNotifications.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function listActiveNotifications(userId: string, limit: number = 50) {
  return listNotifications(userId, {
    limit,
  });
}

export async function listNewNotifications(userId: string, limit: number = 50) {
  return listNotifications(userId, { status: "new", limit });
}

export async function listUrgentNotifications(userId: string, limit: number = 20) {
  return listNotifications(userId, { severity: "urgent", limit });
}

export async function listCompanyNotifications(userId: string, companyId: number, limit: number = 20) {
  return listNotifications(userId, { companyId, limit });
}

export async function getNotificationSummary(userId: string) {
  const rows = await db
    .select({
      status: operationalNotifications.status,
      severity: operationalNotifications.severity,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(operationalNotifications)
    .where(eq(operationalNotifications.userId, userId))
    .groupBy(operationalNotifications.status, operationalNotifications.severity);

  let totalNew = 0;
  let totalUrgent = 0;
  let totalWarning = 0;
  let totalActive = 0;

  for (const r of rows) {
    if (r.status === "new") totalNew += r.count;
    if (r.severity === "urgent" && r.status !== "dismissed" && r.status !== "resolved") totalUrgent += r.count;
    if (r.severity === "warning" && r.status !== "dismissed" && r.status !== "resolved") totalWarning += r.count;
    if (r.status !== "dismissed" && r.status !== "resolved") totalActive += r.count;
  }

  return { totalNew, totalUrgent, totalWarning, totalActive };
}

// ─── Cleanup (remove old dismissed/resolved) ──────────────────────────

export async function cleanupOldNotifications(userId: string, olderThanDays: number = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  return db
    .delete(operationalNotifications)
    .where(
      and(
        eq(operationalNotifications.userId, userId),
        inArray(operationalNotifications.status, ["dismissed", "resolved"]),
        lte(operationalNotifications.createdAt, cutoff),
      ),
    )
    .returning({ id: operationalNotifications.id });
}
