/**
 * Notification Generation Rules — Controlled automation.
 *
 * Phase 9: Rules that scan existing data and generate operational notifications.
 * Two levels:
 *   A) Notifications only (always safe)
 *   B) Auto-create tasks (controlled by config flags)
 *
 * All rules are:
 *   - Internal only (never contacts clients)
 *   - Auditable (dedup keys, source tracking)
 *   - Idempotent (dedup prevents duplicate notifications)
 *   - Reversible (notifications can be dismissed/resolved)
 */

import { db } from "@/db";
import { commercialTasks, operationalNotifications } from "@/db/schema";
import type { NewOperationalNotification } from "@/db/schema";
import { createNotificationsBatch, type NotificationType } from "./notifications";
import { createTasksBatch, type CreateTaskInput } from "./commercial-tasks";
import { getOverdueFollowUps, getCompaniesWithoutRecentActivity } from "./activities";
import { getOverdueTasks } from "./commercial-tasks";
import {
  getExpiringServices,
  getStaleOpportunities,
  getCrossSellCandidates,
  OPS_THRESHOLDS,
} from "./commercial-ops";

// ─── Configuration ────────────────────────────────────────────────────

export interface NotificationRulesConfig {
  /** Enable notification generation at all */
  enabled: boolean;
  /** Enable auto-creation of suggested tasks (Level B) */
  autoCreateTasks: boolean;
  /** Thresholds */
  inactivityDays: number;
  /** Maximum notifications per rule execution batch */
  maxPerBatch: number;
  /** Types to generate (allow selective disable) */
  enabledTypes: NotificationType[];
}

export const DEFAULT_RULES_CONFIG: NotificationRulesConfig = {
  enabled: true,
  autoCreateTasks: false, // Conservative default: suggestions only
  inactivityDays: 14,
  maxPerBatch: 50,
  enabledTypes: [
    "task_overdue",
    "followup_overdue",
    "renewal_upcoming",
    "opportunity_stale",
    "cross_sell",
    "inactivity",
    "suggested_task",
  ],
};

// ─── Rule Result ──────────────────────────────────────────────────────

export interface RuleExecutionResult {
  rule: string;
  notificationsCreated: number;
  tasksCreated: number;
  skipped: number;
  errors: string[];
}

export interface GenerationResult {
  totalNotifications: number;
  totalTasks: number;
  rules: RuleExecutionResult[];
  config: NotificationRulesConfig;
  executedAt: string;
}

// ─── Date helper ──────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Rule: Overdue Tasks ──────────────────────────────────────────────

async function ruleOverdueTasks(
  userId: string,
  config: NotificationRulesConfig,
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = { rule: "task_overdue", notificationsCreated: 0, tasksCreated: 0, skipped: 0, errors: [] };

  if (!config.enabledTypes.includes("task_overdue")) { result.skipped = 1; return result; }

  try {
    const overdue = await getOverdueTasks(userId, config.maxPerBatch);

    const notifs: NewOperationalNotification[] = overdue.map((item) => ({
      userId,
      companyId: item.task.companyId,
      taskId: item.task.id,
      type: "task_overdue" as const,
      title: `Tarea vencida: ${item.task.title}`,
      message: `La tarea "${item.task.title}" tiene fecha vencida${item.task.dueAt ? ` (${item.task.dueAt.toLocaleDateString("es-ES")})` : ""}. Prioridad: ${item.task.priority}.`,
      severity: item.task.priority === "alta" ? "urgent" as const : "warning" as const,
      source: "system" as const,
      dedupKey: `task_overdue_${item.task.id}_${todayKey()}`,
    }));

    const created = await createNotificationsBatch(notifs);
    result.notificationsCreated = created.length;
  } catch (err) {
    result.errors.push(String(err));
  }
  return result;
}

// ─── Rule: Overdue Follow-ups ─────────────────────────────────────────

async function ruleOverdueFollowUps(
  userId: string,
  config: NotificationRulesConfig,
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = { rule: "followup_overdue", notificationsCreated: 0, tasksCreated: 0, skipped: 0, errors: [] };

  if (!config.enabledTypes.includes("followup_overdue")) { result.skipped = 1; return result; }

  try {
    const overdue = await getOverdueFollowUps(userId, config.maxPerBatch);

    const notifs: NewOperationalNotification[] = overdue.map((item) => ({
      userId,
      companyId: item.activity.companyId,
      type: "followup_overdue" as const,
      title: `Seguimiento vencido: ${item.companyName}`,
      message: `Acción pendiente: "${item.activity.nextStep}" para ${item.companyName}${item.activity.dueAt ? ` (vencía ${item.activity.dueAt.toLocaleDateString("es-ES")})` : ""}.`,
      severity: "warning" as const,
      source: "system" as const,
      dedupKey: `followup_overdue_${item.activity.id}_${todayKey()}`,
    }));

    const created = await createNotificationsBatch(notifs);
    result.notificationsCreated = created.length;

    // Level B: auto-create follow-up tasks if enabled (batch insert, no N+1)
    if (config.autoCreateTasks && config.enabledTypes.includes("suggested_task")) {
      const dueToday = new Date();
      const tasks: CreateTaskInput[] = overdue.map((item) => ({
        userId,
        companyId: item.activity.companyId,
        opportunityId: item.activity.opportunityId,
        title: `Seguimiento: ${item.activity.nextStep || "contactar"} — ${item.companyName}`,
        priority: "alta" as const,
        source: "followup" as const,
        dueAt: dueToday,
      }));
      try {
        const created = await createTasksBatch(tasks);
        result.tasksCreated = created.length;
      } catch (e) {
        result.errors.push(`createTasksBatch followup: ${String(e)}`);
      }
    }
  } catch (err) {
    result.errors.push(String(err));
  }
  return result;
}

// ─── Rule: Upcoming Renewals ──────────────────────────────────────────

async function ruleRenewalUpcoming(
  userId: string,
  config: NotificationRulesConfig,
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = { rule: "renewal_upcoming", notificationsCreated: 0, tasksCreated: 0, skipped: 0, errors: [] };

  if (!config.enabledTypes.includes("renewal_upcoming")) { result.skipped = 1; return result; }

  try {
    const expiring = await getExpiringServices(userId, OPS_THRESHOLDS.expiringDays);

    const notifs: NewOperationalNotification[] = expiring.slice(0, config.maxPerBatch).map((svc) => ({
      userId,
      companyId: svc.companyId,
      serviceId: svc.id,
      type: "renewal_upcoming" as const,
      title: `Renovación ${svc.urgency === "overdue" ? "VENCIDA" : svc.urgency === "urgent" ? "URGENTE" : "próxima"}: ${svc.companyName}`,
      message: `Servicio ${svc.type} de ${svc.companyName} ${svc.urgency === "overdue" ? "ya venció" : `vence en ${svc.daysUntilExpiry} días`}. Proveedor: ${svc.currentProvider || "N/A"}.`,
      severity: svc.urgency === "overdue" ? "urgent" as const : svc.urgency === "urgent" ? "warning" as const : "info" as const,
      source: "system" as const,
      dedupKey: `renewal_${svc.id}_${todayKey()}`,
    }));

    const created = await createNotificationsBatch(notifs);
    result.notificationsCreated = created.length;

    // Level B: auto-create renewal tasks for overdue/urgent (batch insert, no N+1)
    if (config.autoCreateTasks) {
      const urgentServices = expiring
        .filter((s) => s.urgency === "overdue" || s.urgency === "urgent")
        .slice(0, 10);
      const tasks: CreateTaskInput[] = urgentServices.map((svc) => ({
        userId,
        companyId: svc.companyId,
        title: `Renovar ${svc.type} — ${svc.companyName}`,
        priority: (svc.urgency === "overdue" ? "alta" : "media") as "alta" | "media",
        source: "renewal" as const,
      }));
      try {
        const created = await createTasksBatch(tasks);
        result.tasksCreated = created.length;
      } catch (e) {
        result.errors.push(`createTasksBatch renewal: ${String(e)}`);
      }
    }
  } catch (err) {
    result.errors.push(String(err));
  }
  return result;
}

// ─── Rule: Stale Opportunities ────────────────────────────────────────

async function ruleStaleOpportunities(
  userId: string,
  config: NotificationRulesConfig,
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = { rule: "opportunity_stale", notificationsCreated: 0, tasksCreated: 0, skipped: 0, errors: [] };

  if (!config.enabledTypes.includes("opportunity_stale")) { result.skipped = 1; return result; }

  try {
    const stale = await getStaleOpportunities(userId, OPS_THRESHOLDS.staleOpportunityDays);

    const notifs: NewOperationalNotification[] = stale.slice(0, config.maxPerBatch).map((opp) => ({
      userId,
      companyId: opp.companyId,
      opportunityId: opp.id,
      type: "opportunity_stale" as const,
      title: `Oportunidad estancada: ${opp.title}`,
      message: `"${opp.title}" de ${opp.companyName} lleva ${opp.daysSinceUpdate} días sin actividad. Estado: ${opp.status}. Valor: ${opp.estimatedValueEur ? `${opp.estimatedValueEur}€` : "N/A"}.`,
      severity: opp.daysSinceUpdate > 45 ? "urgent" as const : "warning" as const,
      source: "system" as const,
      dedupKey: `stale_opp_${opp.id}_${todayKey()}`,
    }));

    const created = await createNotificationsBatch(notifs);
    result.notificationsCreated = created.length;
  } catch (err) {
    result.errors.push(String(err));
  }
  return result;
}

// ─── Rule: Cross-sell Candidates ──────────────────────────────────────

async function ruleCrossSell(
  userId: string,
  config: NotificationRulesConfig,
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = { rule: "cross_sell", notificationsCreated: 0, tasksCreated: 0, skipped: 0, errors: [] };

  if (!config.enabledTypes.includes("cross_sell")) { result.skipped = 1; return result; }

  try {
    const candidates = await getCrossSellCandidates(userId, config.maxPerBatch);
    // Only notify for alta/media priority candidates
    const relevant = candidates.filter((c) => c.priority === "alta" || c.priority === "media");

    const notifs: NewOperationalNotification[] = relevant.map((c) => ({
      userId,
      companyId: c.companyId,
      type: "cross_sell" as const,
      title: `Cross-sell: ${c.companyName} (${c.missingCount} verticales)`,
      message: `${c.companyName} tiene ${c.contractedCount} servicio(s) activo(s) y ${c.missingCount} verticales disponibles: ${c.missingVerticals.join(", ")}. Gasto actual: ${c.totalCurrentSpend}€.`,
      severity: c.priority === "alta" ? "warning" as const : "info" as const,
      source: "system" as const,
      dedupKey: `cross_sell_${c.companyId}_${todayKey()}`,
    }));

    const created = await createNotificationsBatch(notifs);
    result.notificationsCreated = created.length;
  } catch (err) {
    result.errors.push(String(err));
  }
  return result;
}

// ─── Rule: Commercial Inactivity ──────────────────────────────────────

async function ruleInactivity(
  userId: string,
  config: NotificationRulesConfig,
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = { rule: "inactivity", notificationsCreated: 0, tasksCreated: 0, skipped: 0, errors: [] };

  if (!config.enabledTypes.includes("inactivity")) { result.skipped = 1; return result; }

  try {
    const inactive = await getCompaniesWithoutRecentActivity(userId, config.inactivityDays, config.maxPerBatch);

    const notifs: NewOperationalNotification[] = inactive.map((c) => ({
      userId,
      companyId: c.companyId,
      type: "inactivity" as const,
      title: `Sin actividad: ${c.companyName}`,
      message: `${c.companyName} lleva ${c.daysSinceActivity} días sin actividad comercial registrada.`,
      severity: c.daysSinceActivity > 30 ? "warning" as const : "info" as const,
      source: "system" as const,
      dedupKey: `inactivity_${c.companyId}_${todayKey()}`,
    }));

    const created = await createNotificationsBatch(notifs);
    result.notificationsCreated = created.length;

    // Level B: auto-create contact tasks for very inactive companies (batch insert, no N+1)
    if (config.autoCreateTasks && config.enabledTypes.includes("suggested_task")) {
      const veryInactive = inactive.filter((c) => c.daysSinceActivity > 30).slice(0, 10);
      const tasks: CreateTaskInput[] = veryInactive.map((c) => ({
        userId,
        companyId: c.companyId,
        title: `Contactar: ${c.companyName} (${c.daysSinceActivity}d sin actividad)`,
        priority: "media" as const,
        source: "suggested" as const,
      }));
      try {
        const created = await createTasksBatch(tasks);
        result.tasksCreated = created.length;
      } catch (e) {
        result.errors.push(`createTasksBatch inactivity: ${String(e)}`);
      }
    }
  } catch (err) {
    result.errors.push(String(err));
  }
  return result;
}

// ─── Main: Execute All Rules ──────────────────────────────────────────

/**
 * Execute all notification generation rules for a user.
 * Idempotent: dedup keys prevent duplicate notifications per day.
 * Returns detailed execution result for audit/logging.
 */
export async function executeNotificationRules(
  userId: string,
  configOverride?: Partial<NotificationRulesConfig>,
): Promise<GenerationResult> {
  const config = { ...DEFAULT_RULES_CONFIG, ...configOverride };

  if (!config.enabled) {
    return {
      totalNotifications: 0,
      totalTasks: 0,
      rules: [],
      config,
      executedAt: new Date().toISOString(),
    };
  }

  const rules = await Promise.all([
    ruleOverdueTasks(userId, config),
    ruleOverdueFollowUps(userId, config),
    ruleRenewalUpcoming(userId, config),
    ruleStaleOpportunities(userId, config),
    ruleCrossSell(userId, config),
    ruleInactivity(userId, config),
  ]);

  const totalNotifications = rules.reduce((sum, r) => sum + r.notificationsCreated, 0);
  const totalTasks = rules.reduce((sum, r) => sum + r.tasksCreated, 0);

  return {
    totalNotifications,
    totalTasks,
    rules,
    config,
    executedAt: new Date().toISOString(),
  };
}
