import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { searchEmails, readEmail, downloadAttachment, getGmailClientForAccount } from "@/lib/gmail";
import { categorizeEmail, extractInvoiceFromPdf } from "@/lib/gemini";
import { invoiceNormalizedFields } from "@/lib/text/normalize";
import { checkRulesForIncoming, executeRuleAction } from "@/lib/agent/applyRules";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/email-accounts/[id]/sync" });

export const maxDuration = 300;

/**
 * POST /api/email-accounts/[id]/sync
 *
 * Sync a single email account. Thin wrapper: reuses the multi-account POST
 * /api/sync logic but scoped to one account by body.accountId.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const accountId = Number(params.id);
  if (!Number.isFinite(accountId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const query = body.query || "newer_than:30d";
  const maxResults = Number(body.maxResults) || 100;
  const processInvoices = body.processInvoices !== false;

  // Verify ownership
  const account = await db.query.emailAccounts.findFirst({
    where: and(
      eq(schema.emailAccounts.id, accountId),
      eq(schema.emailAccounts.userId, session.user.id),
    ),
  });
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  if (!account.enabled) return NextResponse.json({ error: "Cuenta deshabilitada" }, { status: 400 });

  const userId = session.user.id;
  let synced = 0;
  let invoicesProcessed = 0;
  let autoRuleTrashed = 0;
  const errors: string[] = [];

  try {
    const gmail = await getGmailClientForAccount(accountId);
    const { messages } = await searchEmails(userId, query, maxResults, undefined, gmail);

    for (const msg of messages) {
      if (!msg.id) continue;
      const existing = await db.query.emails.findFirst({ where: eq(schema.emails.gmailId, msg.id) });
      if (existing) continue;

      try {
        const email = await readEmail(userId, msg.id, gmail);

        const rule = await checkRulesForIncoming(userId, {
          subject: email.subject,
          fromEmail: email.fromEmail,
          fromName: email.fromName,
          body: email.body,
        });
        if (rule && rule.action === "TRASH") {
          await executeRuleAction(userId, email.id, rule);
          autoRuleTrashed++;
          continue;
        }

        const ai = await categorizeEmail(
          email.fromName,
          email.fromEmail,
          email.subject,
          email.snippet,
          email.body,
        );

        const [inserted] = await db
          .insert(schema.emails)
          .values({
            gmailId: email.id,
            userId,
            accountId,
            threadId: email.threadId,
            fromName: email.fromName,
            fromEmail: email.fromEmail,
            subject: email.subject,
            snippet: email.snippet,
            body: email.body,
            date: email.date,
            labels: email.labelIds,
            category: ai.category,
            priority: ai.priority,
            hasAttachments: email.attachments.length > 0,
            attachmentNames: email.attachments.map((a) => a.filename),
            isRead: !email.labelIds.includes("UNREAD"),
          })
          .returning();
        synced++;

        if (processInvoices && ai.category === "FACTURA" && email.attachments.length > 0) {
          for (const att of email.attachments) {
            if (!att.filename.toLowerCase().endsWith(".pdf") || !att.attachmentId) continue;
            try {
              const pdfBuffer = await downloadAttachment(userId, email.id, att.attachmentId, gmail);
              const inv = await extractInvoiceFromPdf(pdfBuffer);
              const norm = invoiceNormalizedFields(inv.issuerName, inv.issuerNif);
              await db.insert(schema.invoices).values({
                emailId: inserted.id,
                userId,
                invoiceNumber: inv.invoiceNumber,
                issuerName: inv.issuerName,
                issuerNif: inv.issuerNif,
                recipientName: inv.recipientName,
                recipientNif: inv.recipientNif,
                concept: inv.concept,
                amount: inv.amount,
                tax: inv.tax,
                totalAmount: inv.totalAmount,
                currency: inv.currency,
                invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
                dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
                pdfFilename: att.filename,
                pdfGmailAttachmentId: att.attachmentId,
                category: inv.category,
                processed: true,
                rawText: inv.rawText,
                aiResponse: inv,
                issuerNormalized: norm.issuerNormalized,
                nifNormalized: norm.nifNormalized,
              });
              invoicesProcessed++;
            } catch (e) {
              errors.push(`PDF ${att.filename}: ${e instanceof Error ? e.message : "err"}`);
            }
          }
        }
      } catch (e) {
        errors.push(`Email ${msg.id}: ${e instanceof Error ? e.message : "err"}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    await db
      .update(schema.emailAccounts)
      .set({
        lastSyncAt: new Date(),
        totalEmails: sql`${schema.emailAccounts.totalEmails} + ${synced}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailAccounts.id, accountId));

    return NextResponse.json({
      ok: true,
      accountId,
      email: account.email,
      synced,
      invoicesProcessed,
      autoRuleTrashed,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    logError(log, e, { userId, accountId }, "single-account sync failed");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de sincronización" },
      { status: 500 },
    );
  }
}
