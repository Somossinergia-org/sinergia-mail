import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import {
  searchEmails,
  readEmail,
  downloadAttachment,
  getGmailClientForAccount,
  type GmailClient,
} from "@/lib/gmail";
import { categorizeEmail, extractInvoiceFromPdf } from "@/lib/gemini";
import { invoiceNormalizedFields } from "@/lib/text/normalize";
import { checkRulesForIncoming, executeRuleAction } from "@/lib/agent/applyRules";
import { addSourceIfNew as memoryAddIfNew } from "@/lib/memory";
import { logger, logError } from "@/lib/logger";

export const maxDuration = 300; // 5 min for Vercel Pro

const log = logger.child({ route: "/api/sync" });

interface AccountSyncResult {
  accountId: number;
  email: string;
  synced: number;
  invoicesProcessed: number;
  autoRuleTrashed: number;
  errors: string[];
}

async function syncOneAccount(
  userId: string,
  accountId: number,
  accountEmail: string,
  gmail: GmailClient,
  query: string,
  maxResults: number,
  processInvoices: boolean,
): Promise<AccountSyncResult> {
  const result: AccountSyncResult = {
    accountId,
    email: accountEmail,
    synced: 0,
    invoicesProcessed: 0,
    autoRuleTrashed: 0,
    errors: [],
  };

  const { messages } = await searchEmails(userId, query, maxResults, undefined, gmail);

  for (const msg of messages) {
    if (!msg.id) continue;

    // Skip if already synced (same gmailId could exist from a previous account;
    // gmail_id is globally unique per Gmail message, so this dedupes naturally)
    const existing = await db.query.emails.findFirst({
      where: eq(schema.emails.gmailId, msg.id),
    });
    if (existing) continue;

    try {
      const email = await readEmail(userId, msg.id, gmail);

      // Rules
      const matchedRule = await checkRulesForIncoming(userId, {
        subject: email.subject,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        body: email.body,
      });
      if (matchedRule && matchedRule.action === "TRASH") {
        await executeRuleAction(userId, email.id, matchedRule);
        result.autoRuleTrashed++;
        continue;
      }

      // AI categorization
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
      result.synced++;

      // Auto-ingest to memory if relevant category (fire-and-forget, don't
      // block the sync loop on embedding latency)
      if (["FACTURA", "CLIENTE", "PROVEEDOR", "LEGAL"].includes(ai.category || "")) {
        const plainBody = (email.body || email.snippet || "").replace(/<[^>]+>/g, " ");
        const content = `${email.subject || ""}\n\nDe: ${email.fromName || ""} <${email.fromEmail || ""}>\n\n${plainBody}`.slice(0, 8000);
        memoryAddIfNew({
          userId,
          kind: "email",
          title: email.subject || `(sin asunto) de ${email.fromName || email.fromEmail}`,
          content,
          sourceRefId: inserted.id,
          metadata: {
            from: email.fromEmail,
            category: ai.category,
            priority: ai.priority,
            date: email.date?.toISOString?.(),
          },
        }).catch(() => {});
      }

      // PDF invoices
      if (processInvoices && ai.category === "FACTURA" && email.attachments.length > 0) {
        for (const att of email.attachments) {
          if (!att.filename.toLowerCase().endsWith(".pdf") || !att.attachmentId) continue;
          try {
            const pdfBuffer = await downloadAttachment(userId, email.id, att.attachmentId, gmail);
            const invoiceData = await extractInvoiceFromPdf(pdfBuffer);
            const norm = invoiceNormalizedFields(invoiceData.issuerName, invoiceData.issuerNif);
            const [insertedInvoice] = await db.insert(schema.invoices).values({
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
              invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : null,
              dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
              pdfFilename: att.filename,
              pdfGmailAttachmentId: att.attachmentId,
              category: invoiceData.category,
              processed: true,
              rawText: invoiceData.rawText,
              aiResponse: invoiceData,
              issuerNormalized: norm.issuerNormalized,
              nifNormalized: norm.nifNormalized,
            }).returning({ id: schema.invoices.id });
            result.invoicesProcessed++;

            // Auto-ingest invoice text into memory (fire-and-forget)
            if (invoiceData.rawText) {
              memoryAddIfNew({
                userId,
                kind: "invoice",
                title: `${invoiceData.issuerName || "(sin emisor)"} — ${invoiceData.invoiceNumber || "nº s/n"}`,
                content: invoiceData.rawText.slice(0, 8000),
                sourceRefId: insertedInvoice.id,
                metadata: {
                  issuerName: invoiceData.issuerName,
                  issuerNif: invoiceData.issuerNif,
                  totalAmount: invoiceData.totalAmount,
                  invoiceDate: invoiceData.invoiceDate,
                  category: invoiceData.category,
                },
              }).catch(() => {});
            }
          } catch (e) {
            result.errors.push(`PDF ${att.filename}: ${e instanceof Error ? e.message : "unknown"}`);
          }
        }
      }
    } catch (e) {
      result.errors.push(`Email ${msg.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }

    // Pause between messages
    await new Promise((r) => setTimeout(r, 200));
  }

  // Update per-account sync state
  await db
    .update(schema.emailAccounts)
    .set({
      lastSyncAt: new Date(),
      totalEmails: sql`${schema.emailAccounts.totalEmails} + ${result.synced}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailAccounts.id, accountId));

  return result;
}

/**
 * POST /api/sync
 *
 * Body (all optional):
 *   - query: Gmail search query (default 'newer_than:30d')
 *   - maxResults: per-account cap (default 100)
 *   - processInvoices: extract PDFs (default true)
 *   - accountId: sync ONE specific email_account. If omitted, syncs ALL
 *     enabled accounts of the user.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const query = body.query || "newer_than:30d";
  const maxResults = Number(body.maxResults) || 100;
  const processInvoices = body.processInvoices !== false;
  const specificAccountId = body.accountId ? Number(body.accountId) : null;

  try {
    // Discover accounts to sync
    const accountsToSync = specificAccountId
      ? await db.query.emailAccounts.findMany({
          where: and(
            eq(schema.emailAccounts.userId, userId),
            eq(schema.emailAccounts.id, specificAccountId),
          ),
        })
      : await db.query.emailAccounts.findMany({
          where: and(
            eq(schema.emailAccounts.userId, userId),
            eq(schema.emailAccounts.enabled, true),
          ),
        });

    if (accountsToSync.length === 0) {
      return NextResponse.json({ error: "No hay cuentas para sincronizar" }, { status: 404 });
    }

    // Sync each account sequentially (to stay within Gemini rate limits)
    const accountResults: AccountSyncResult[] = [];
    for (const account of accountsToSync) {
      try {
        const gmail = await getGmailClientForAccount(account.id);
        const r = await syncOneAccount(
          userId,
          account.id,
          account.email,
          gmail,
          query,
          maxResults,
          processInvoices,
        );
        accountResults.push(r);
      } catch (e) {
        logError(log, e, { userId, accountId: account.id }, "account sync failed");
        accountResults.push({
          accountId: account.id,
          email: account.email,
          synced: 0,
          invoicesProcessed: 0,
          autoRuleTrashed: 0,
          errors: [e instanceof Error ? e.message : "sync failed"],
        });
      }
    }

    // Aggregate totals
    const agg = accountResults.reduce(
      (acc, r) => ({
        synced: acc.synced + r.synced,
        invoicesProcessed: acc.invoicesProcessed + r.invoicesProcessed,
        autoRuleTrashed: acc.autoRuleTrashed + r.autoRuleTrashed,
      }),
      { synced: 0, invoicesProcessed: 0, autoRuleTrashed: 0 },
    );

    // Legacy single-user sync_state for backward compat
    await db
      .insert(schema.syncState)
      .values({
        userId,
        lastSyncAt: new Date(),
        totalEmails: agg.synced,
      })
      .onConflictDoUpdate({
        target: schema.syncState.userId,
        set: { lastSyncAt: new Date(), totalEmails: agg.synced },
      });

    return NextResponse.json({
      success: true,
      accountsSynced: accountResults.length,
      ...agg,
      accounts: accountResults.map((r) => ({
        accountId: r.accountId,
        email: r.email,
        synced: r.synced,
        invoicesProcessed: r.invoicesProcessed,
        autoRuleTrashed: r.autoRuleTrashed,
        errorCount: r.errors.length,
      })),
    });
  } catch (e) {
    logError(log, e, { userId }, "multi-account sync failed");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de sincronización" },
      { status: 500 },
    );
  }
}

/** GET /api/sync — Check sync status OR Vercel Cron trigger */
export async function GET(req: Request) {
  // Vercel Cron: sync primary accounts of all users (one query per user)
  const isCron = req.headers.get("Authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (isCron) {
    const accounts = await db.query.emailAccounts.findMany({
      where: eq(schema.emailAccounts.enabled, true),
    });
    const results = [];
    for (const account of accounts) {
      try {
        const gmail = await getGmailClientForAccount(account.id);
        const { messages } = await searchEmails(account.userId, "newer_than:1d", 50, undefined, gmail);
        results.push({ accountId: account.id, email: account.email, found: messages.length });
      } catch {
        results.push({ accountId: account.id, email: account.email, error: "sync failed" });
      }
    }
    return NextResponse.json({ cron: true, accountsChecked: accounts.length, results });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const state = await db.query.syncState.findFirst({
    where: eq(schema.syncState.userId, session.user.id),
  });

  return NextResponse.json({
    lastSyncAt: state?.lastSyncAt || null,
    totalEmails: state?.totalEmails || 0,
  });
}
