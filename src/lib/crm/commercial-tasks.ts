/**
 * Commercial Tasks — CRUD + helpers for today's tasks, overdue, by company/opportunity.
 *
 * Phase 8: Real commercial task management.
 * All queries enforce userId ownership.
 */

import { db } from "@/db";
import { commercialTasks, companies } from "@/db/schema";
import { eq, and, desc, asc, lte, gte, gt, sql, not, inArray } from "drizzle-orm";

// ─── Constants ─────────────────────────────────────────────────────────

export const TASK_STATUSES = ["pendiente", "en_progreso", "completada", "cancelada"] as const;
export const TASK_PRIORITIES = ["alta", "media", "baja"] as const;
export const TASK_SOURCES = ["manual", "suggested", "followup", "renewal", "case"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskSource = (typeof TASK_SOURCES)[number];

const TERMINAL_STATUSES: TaskStatus[] = ["completada", "cancelada"];

// ─── Create ────────────────────────────────────────────────────────────

export interface CreateTaskInput {
  userId: string;
  companyId?: number | null;
  opportunityId?: number | null;
  caseId?: number | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: Date | null;
  source?: TaskSource;
}

export async function createTask(input: CreateTaskInput) {
  const [row] = await db
    .insert(commercialTasks)
    .values({
      userId: input.userId,
      companyId: input.companyId ?? null,
      opportunityId: input.opportunityId ?? null,
      caseId: input.caseId ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "media",
      status: "pendiente",
      dueAt: input.dueAt ?? null,
      source: input.source ?? "manual",
    })
    .returning();
  return row;
}

/**
 * Batch-create multiple commercial tasks in a single INSERT.
 * Used by notification-rules to avoid N+1 (was: for-loop with await createTask).
 *
 * Returns the inserted rows. Empty array if input is empty.
 */
export async function createTasksBatch(inputs: CreateTaskInput[]) {
  if (inputs.length === 0) return [];
  return db
    .insert(commercialTasks)
    .values(
      inputs.map((input) => ({
        userId: input.userId,
        companyId: input.companyId ?? null,
        opportunityId: input.opportunityId ?? null,
        caseId: input.caseId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "media",
        status: "pendiente" as const,
        dueAt: input.dueAt ?? null,
        source: input.source ?? "manual",
      })),
    )
    .returning();
}

// ─── Update status ─────────────────────────────────────────────────────

export async function updateTaskStatus(
  taskId: number,
  userId: string,
  status: TaskStatus,
) {
  const now = new Date();
  const [updated] = await db
    .update(commercialTasks)
    .set({
      status,
      updatedAt: now,
      completedAt: status === "completada" ? now : null,
    })
    .where(
      and(
        eq(commercialTasks.id, taskId),
        eq(commercialTasks.userId, userId),
      ),
    )
    .returning();
  return updated ?? null;
}

// ─── Update task fields ────────────────────────────────────────────────

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: Date | null;
  status?: TaskStatus;
}

export async function updateTask(
  taskId: number,
  userId: string,
  input: UpdateTaskInput,
) {
  const now = new Date();
  const [updated] = await db
    .update(commercialTasks)
    .set({
      ...input,
      updatedAt: now,
      completedAt: input.status === "completada" ? now : undefined,
    })
    .where(
      and(
        eq(commercialTasks.id, taskId),
        eq(commercialTasks.userId, userId),
      ),
    )
    .returning();
  return updated ?? null;
}

// ─── List active tasks for user ────────────────────────────────────────

export async function listActiveTasks(userId: string, limit: number = 50) {
  return db
    .select({
      task: commercialTasks,
      companyName: companies.name,
    })
    .from(commercialTasks)
    .leftJoin(companies, eq(commercialTasks.companyId, companies.id))
    .where(
      and(
        eq(commercialTasks.userId, userId),
        not(inArray(commercialTasks.status, TERMINAL_STATUSES)),
      ),
    )
    .orderBy(
      asc(commercialTasks.dueAt),
      desc(sql`CASE WHEN ${commercialTasks.priority} = 'alta' THEN 0 WHEN ${commercialTasks.priority} = 'media' THEN 1 ELSE 2 END`),
    )
    .limit(limit);
}

// ─── Tasks by company ──────────────────────────────────────────────────

export async function listTasksByCompany(
  companyId: number,
  userId: string,
  includeCompleted: boolean = false,
  limit: number = 50,
) {
  const conditions = [
    eq(commercialTasks.companyId, companyId),
    eq(commercialTasks.userId, userId),
  ];
  if (!includeCompleted) {
    conditions.push(not(inArray(commercialTasks.status, TERMINAL_STATUSES)));
  }

  return db
    .select()
    .from(commercialTasks)
    .where(and(...conditions))
    .orderBy(asc(commercialTasks.dueAt))
    .limit(limit);
}

// ─── Tasks by opportunity ──────────────────────────────────────────────

export async function listTasksByOpportunity(
  opportunityId: number,
  userId: string,
  limit: number = 50,
) {
  return db
    .select()
    .from(commercialTasks)
    .where(
      and(
        eq(commercialTasks.opportunityId, opportunityId),
        eq(commercialTasks.userId, userId),
        not(inArray(commercialTasks.status, TERMINAL_STATUSES)),
      ),
    )
    .orderBy(asc(commercialTasks.dueAt))
    .limit(limit);
}

// ─── Today's tasks ─────────────────────────────────────────────────────

export async function getTodayTasks(userId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return db
    .select({
      task: commercialTasks,
      companyName: companies.name,
    })
    .from(commercialTasks)
    .leftJoin(companies, eq(commercialTasks.companyId, companies.id))
    .where(
      and(
        eq(commercialTasks.userId, userId),
        not(inArray(commercialTasks.status, TERMINAL_STATUSES)),
        gte(commercialTasks.dueAt, startOfDay),
        lte(commercialTasks.dueAt, endOfDay),
      ),
    )
    .orderBy(
      desc(sql`CASE WHEN ${commercialTasks.priority} = 'alta' THEN 0 WHEN ${commercialTasks.priority} = 'media' THEN 1 ELSE 2 END`),
    );
}

// ─── Overdue tasks ─────────────────────────────────────────────────────

export async function getOverdueTasks(userId: string, limit: number = 30) {
  const now = new Date();
  return db
    .select({
      task: commercialTasks,
      companyName: companies.name,
    })
    .from(commercialTasks)
    .leftJoin(companies, eq(commercialTasks.companyId, companies.id))
    .where(
      and(
        eq(commercialTasks.userId, userId),
        not(inArray(commercialTasks.status, TERMINAL_STATUSES)),
        lte(commercialTasks.dueAt, now),
      ),
    )
    .orderBy(asc(commercialTasks.dueAt))
    .limit(limit);
}

// ─── Upcoming tasks (next N days) ──────────────────────────────────────

export async function getUpcomingTasks(
  userId: string,
  days: number = 7,
  limit: number = 30,
) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return db
    .select({
      task: commercialTasks,
      companyName: companies.name,
    })
    .from(commercialTasks)
    .leftJoin(companies, eq(commercialTasks.companyId, companies.id))
    .where(
      and(
        eq(commercialTasks.userId, userId),
        not(inArray(commercialTasks.status, TERMINAL_STATUSES)),
        gt(commercialTasks.dueAt, now),
        lte(commercialTasks.dueAt, futureDate),
      ),
    )
    .orderBy(asc(commercialTasks.dueAt))
    .limit(limit);
}

// ─── Task counts summary ───────────────────────────────────────────────

export interface TaskCountsSummary {
  totalActive: number;
  overdue: number;
  dueToday: number;
  upcoming7d: number;
  alta: number;
}

export async function getTaskCountsSummary(userId: string): Promise<TaskCountsSummary> {
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);

  const active = await db
    .select()
    .from(commercialTasks)
    .where(
      and(
        eq(commercialTasks.userId, userId),
        not(inArray(commercialTasks.status, TERMINAL_STATUSES)),
      ),
    );

  const overdue = active.filter((t) => t.dueAt && t.dueAt < now);
  const today = active.filter((t) => t.dueAt && t.dueAt >= startOfDay && t.dueAt <= endOfDay);
  const upcoming = active.filter((t) => t.dueAt && t.dueAt > now && t.dueAt <= in7Days);
  const alta = active.filter((t) => t.priority === "alta");

  return {
    totalActive: active.length,
    overdue: overdue.length,
    dueToday: today.length,
    upcoming7d: upcoming.length,
    alta: alta.length,
  };
}
