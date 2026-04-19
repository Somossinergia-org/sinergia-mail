import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, lt, sql, isNull } from "drizzle-orm";

export const maxDuration = 300;

/**
 * Daily cron — enforces RGPD data retention policies.
 *
 * For each enabled retention policy whose last_executed_at + retention_days < now:
 *  - "delete": soft-deletes emails (sets deletedAt), hard-deletes agentLogs and memorySources
 *  - "anonymize": replaces personal fields (fromName, fromEmail, body) with anonymized values
 *  - "archive": marks emails as archived via labels
 *
 * Secured via CRON_SECRET matching Vercel's Bearer token.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const actions: Array<{
    userId: string;
    dataType: string;
    action: string;
    affected: number;
  }> = [];

  try {
    // Fetch all enabled policies that are due for execution
    const policies = await db
      .select()
      .from(schema.gdprRetentionPolicies)
      .where(eq(schema.gdprRetentionPolicies.enabled, true));

    for (const policy of policies) {
      // Check if policy is due: lastExecutedAt + retentionDays < now
      // If never executed, always run
      if (policy.lastExecutedAt) {
        const nextRun = new Date(
          policy.lastExecutedAt.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000
        );
        if (nextRun > now) continue;
      }

      const cutoffDate = new Date(
        now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000
      );

      let affected = 0;

      try {
        if (policy.dataType === "emails") {
          affected = await processEmails(policy.userId, policy.action, cutoffDate, now);
        } else if (policy.dataType === "logs") {
          affected = await processLogs(policy.userId, policy.action, cutoffDate);
        } else if (policy.dataType === "memory") {
          affected = await processMemory(policy.userId, policy.action, cutoffDate);
        }

        // Update lastExecutedAt on the policy
        await db
          .update(schema.gdprRetentionPolicies)
          .set({ lastExecutedAt: now })
          .where(eq(schema.gdprRetentionPolicies.id, policy.id));

        actions.push({
          userId: policy.userId,
          dataType: policy.dataType,
          action: policy.action,
          affected,
        });
      } catch (e) {
        console.error(
          `[cron/rgpd-retention] Error processing policy ${policy.id}`,
          e
        );
      }
    }

    return NextResponse.json({
      ok: true,
      policiesEvaluated: policies.length,
      actionsExecuted: actions.length,
      actions,
    });
  } catch (e) {
    console.error("[cron/rgpd-retention]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Emails: soft-delete, anonymize, or archive */
async function processEmails(
  userId: string,
  action: string,
  cutoffDate: Date,
  now: Date
): Promise<number> {
  if (action === "delete") {
    // Soft-delete: set deletedAt on old emails that aren't already deleted
    const result = await db
      .update(schema.emails)
      .set({ deletedAt: now })
      .where(
        and(
          eq(schema.emails.userId, userId),
          lt(schema.emails.date, cutoffDate),
          isNull(schema.emails.deletedAt)
        )
      );
    return result.count ?? 0;
  }

  if (action === "anonymize") {
    // Replace personal fields with anonymized values
    const result = await db
      .update(schema.emails)
      .set({
        fromName: "[ANONIMIZADO]",
        fromEmail: "[ANONIMIZADO]",
        body: "[Contenido eliminado por politica de retencion RGPD]",
        snippet: "[ANONIMIZADO]",
      })
      .where(
        and(
          eq(schema.emails.userId, userId),
          lt(schema.emails.date, cutoffDate),
          isNull(schema.emails.deletedAt)
        )
      );
    return result.count ?? 0;
  }

  if (action === "archive") {
    // Mark as archived via labels JSONB field
    const result = await db
      .update(schema.emails)
      .set({
        labels: sql`COALESCE(labels, '[]'::jsonb) || '["RGPD_ARCHIVED"]'::jsonb`,
      })
      .where(
        and(
          eq(schema.emails.userId, userId),
          lt(schema.emails.date, cutoffDate)
        )
      );
    return result.count ?? 0;
  }

  return 0;
}

/** Logs: hard-delete old agent logs */
async function processLogs(
  userId: string,
  action: string,
  cutoffDate: Date
): Promise<number> {
  if (action === "delete" || action === "anonymize") {
    // For logs, both delete and anonymize perform hard-delete
    const result = await db
      .delete(schema.agentLogs)
      .where(
        and(
          eq(schema.agentLogs.userId, userId),
          lt(schema.agentLogs.createdAt, cutoffDate)
        )
      );
    return result.count ?? 0;
  }

  return 0;
}

/** Memory: hard-delete old memory sources */
async function processMemory(
  userId: string,
  action: string,
  cutoffDate: Date
): Promise<number> {
  if (action === "delete") {
    const result = await db
      .delete(schema.memorySources)
      .where(
        and(
          eq(schema.memorySources.userId, userId),
          lt(schema.memorySources.createdAt, cutoffDate)
        )
      );
    return result.count ?? 0;
  }

  if (action === "anonymize") {
    // Anonymize content but keep the record
    const result = await db
      .update(schema.memorySources)
      .set({
        title: "[ANONIMIZADO]",
        content: "[Contenido eliminado por politica de retencion RGPD]",
        summary: null,
        metadata: null,
      })
      .where(
        and(
          eq(schema.memorySources.userId, userId),
          lt(schema.memorySources.createdAt, cutoffDate)
        )
      );
    return result.count ?? 0;
  }

  return 0;
}
