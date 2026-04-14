import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { trashEmail as gmailTrashEmail } from "@/lib/gmail";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "apply-rules" });

type RuleAction = "TRASH" | "MARK_READ" | "IGNORE" | "IMPORTANT";
type RuleField = "subject" | "from_email" | "from_name" | "body";

interface EmailMatchInput {
  subject: string | null | undefined;
  fromEmail: string | null | undefined;
  fromName: string | null | undefined;
  body: string | null | undefined;
}

function fieldValue(input: EmailMatchInput, field: string | null): string {
  switch (field) {
    case "from_email":
      return input.fromEmail || "";
    case "from_name":
      return input.fromName || "";
    case "body":
      return input.body || "";
    case "subject":
    default:
      return input.subject || "";
  }
}

export interface AppliedRule {
  action: RuleAction;
  ruleId: number;
  pattern: string;
}

/**
 * Check active rules for a user against an incoming email and return the first matching action.
 * Null means no rule matched — proceed with normal processing.
 *
 * Returned action is the intent: the caller is responsible for executing it (e.g. trash
 * the Gmail message, mark read, etc.) so this stays decoupled from IO side effects.
 */
export async function checkRulesForIncoming(
  userId: string,
  email: EmailMatchInput,
): Promise<AppliedRule | null> {
  const rules = await db.query.memoryRules.findMany({
    where: and(eq(schema.memoryRules.userId, userId), eq(schema.memoryRules.enabled, true)),
  });
  if (rules.length === 0) return null;

  for (const rule of rules) {
    const haystack = fieldValue(email, rule.field).toLowerCase();
    const needle = rule.pattern.toLowerCase();
    if (haystack && needle && haystack.includes(needle)) {
      // Increment counter (fire-and-forget)
      db.update(schema.memoryRules)
        .set({ matchCount: sql`${schema.memoryRules.matchCount} + 1`, updatedAt: new Date() })
        .where(eq(schema.memoryRules.id, rule.id))
        .catch(() => {});

      return {
        action: rule.action as RuleAction,
        ruleId: rule.id,
        pattern: rule.pattern,
      };
    }
  }
  return null;
}

/**
 * Execute the rule action on a specific incoming email.
 * Called during sync right after matching — before expensive AI categorization.
 */
export async function executeRuleAction(
  userId: string,
  gmailMessageId: string,
  applied: AppliedRule,
): Promise<void> {
  try {
    switch (applied.action) {
      case "TRASH":
        await gmailTrashEmail(userId, gmailMessageId);
        log.info(
          { userId, ruleId: applied.ruleId, pattern: applied.pattern, gmailMessageId },
          "rule auto-trashed incoming email",
        );
        break;
      case "MARK_READ":
        // Mark as read via DB (sync already reads labels). Actual Gmail label update can be
        // added if needed via users.messages.modify removeLabel UNREAD.
        break;
      case "IGNORE":
      case "IMPORTANT":
        // Handled by caller as metadata hint
        break;
    }
  } catch (e) {
    logError(log, e, { userId, applied }, "failed to execute rule action");
  }
}
