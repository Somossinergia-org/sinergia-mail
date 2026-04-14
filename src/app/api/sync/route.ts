import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { searchEmails, readEmail, downloadAttachment } from "@/lib/gmail";
import { categorizeEmail, extractInvoiceFromPdf } from "@/lib/gemini";
import { invoiceNormalizedFields } from "@/lib/text/normalize";
import { checkRulesForIncoming, executeRuleAction } from "@/lib/agent/applyRules";

export const maxDuration = 300; // 5 min for Vercel Pro

/** POST /api/sync — Sync Gmail emails to database */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { query = "newer_than:30d", maxResults = 100, processInvoices = true } =
    await req.json().catch(() => ({}));

  try {
    // 1. Search Gmail
    const { messages } = await searchEmails(userId, query, maxResults);
    let synced = 0;
    let invoicesProcessed = 0;
    let autoRuleTrashed = 0;
    const errors: string[] = [];

    // 2. Process each message
    for (const msg of messages) {
      if (!msg.id) continue;

      // Skip if already synced
      const existing = await db.query.emails.findFirst({
        where: eq(schema.emails.gmailId, msg.id),
      });
      if (existing) continue;

      try {
        // Read full email
        const email = await readEmail(userId, msg.id);

        // ─── AUTO-RULES CHECK (before AI to save Gemini tokens on TRASH rules) ───
        const matchedRule = await checkRulesForIncoming(userId, {
          subject: email.subject,
          fromEmail: email.fromEmail,
          fromName: email.fromName,
          body: email.body,
        });

        if (matchedRule && matchedRule.action === "TRASH") {
          await executeRuleAction(userId, email.id, matchedRule);
          autoRuleTrashed++;
          continue; // skip categorization + DB insert — email is in Gmail trash
        }

        // AI categorization
        const ai = await categorizeEmail(
          email.fromName,
          email.fromEmail,
          email.subject,
          email.snippet,
          email.body
        );

        // Insert email
        const [inserted] = await db
          .insert(schema.emails)
          .values({
            gmailId: email.id,
            userId,
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

        // 3. Process PDF invoices if category is FACTURA
        if (
          processInvoices &&
          ai.category === "FACTURA" &&
          email.attachments.length > 0
        ) {
          for (const att of email.attachments) {
            if (
              !att.filename.toLowerCase().endsWith(".pdf") ||
              !att.attachmentId
            )
              continue;

            try {
              const pdfBuffer = await downloadAttachment(
                userId,
                email.id,
                att.attachmentId
              );

              const invoiceData = await extractInvoiceFromPdf(pdfBuffer);
              const norm = invoiceNormalizedFields(invoiceData.issuerName, invoiceData.issuerNif);

              await db.insert(schema.invoices).values({
                emailId: inserted.id,
                userId,
                invoiceNumber: invoiceData.invoiceNumber,
                issuerName: invoiceData.issuerName,
                issuerNif: invoiceData.issuerNif,
                recipientName: invoiceData.recipientName,
                recipientNif: invoiceData.recipientNif,
                concept: invoiceData.concept,
                amount: invoiceData.amount,
                tax: invoiceData.tax,
                totalAmount: invoiceData.totalAmount,
                currency: invoiceData.currency,
                invoiceDate: invoiceData.invoiceDate
                  ? new Date(invoiceData.invoiceDate)
                  : null,
                dueDate: invoiceData.dueDate
                  ? new Date(invoiceData.dueDate)
                  : null,
                pdfFilename: att.filename,
                pdfGmailAttachmentId: att.attachmentId,
                category: invoiceData.category,
                processed: true,
                rawText: invoiceData.rawText,
                aiResponse: invoiceData,
                issuerNormalized: norm.issuerNormalized,
                nifNormalized: norm.nifNormalized,
              });

              invoicesProcessed++;
            } catch (e) {
              errors.push(
                `Error procesando PDF ${att.filename}: ${e instanceof Error ? e.message : "unknown"}`
              );
            }
          }
        }
      } catch (e) {
        errors.push(
          `Error sync email ${msg.id}: ${e instanceof Error ? e.message : "unknown"}`
        );
      }

      // Rate limiting pause
      await new Promise((r) => setTimeout(r, 200));
    }

    // 4. Update sync state
    await db
      .insert(schema.syncState)
      .values({
        userId,
        lastSyncAt: new Date(),
        totalEmails: synced,
      })
      .onConflictDoUpdate({
        target: schema.syncState.userId,
        set: {
          lastSyncAt: new Date(),
          totalEmails: synced,
        },
      });

    return NextResponse.json({
      success: true,
      synced,
      invoicesProcessed,
      autoRuleTrashed,
      total: messages.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de sincronización" },
      { status: 500 }
    );
  }
}

/** GET /api/sync — Check sync status OR Vercel Cron trigger */
export async function GET(req: Request) {
  // Vercel Cron: auto-sync all users
  const isCron = req.headers.get("Authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (isCron) {
    // Get all users with accounts
    const allUsers = await db.query.users.findMany();
    const results = [];
    for (const user of allUsers) {
      try {
        const { messages } = await searchEmails(user.id, "newer_than:1d", 50);
        results.push({ userId: user.id, found: messages.length });
      } catch {
        results.push({ userId: user.id, error: "sync failed" });
      }
    }
    return NextResponse.json({ cron: true, results });
  }

  // Normal: check status for logged-in user
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const state = await db.query.syncState.findFirst({
    where: eq(schema.syncState.userId, session.user.id),
  });

  return NextResponse.json({
    lastSyncAt: state?.lastSyncAt || null,
    totalEmails: state?.totalEmails || 0,
  });
}
