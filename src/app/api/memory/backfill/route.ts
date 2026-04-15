import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull, inArray, or } from "drizzle-orm";
import { addSourceIfNew } from "@/lib/memory";
import { logger, logError } from "@/lib/logger";

export const maxDuration = 120;

const log = logger.child({ route: "/api/memory/backfill" });

/**
 * POST /api/memory/backfill
 *
 * Ingiere a la memoria semántica todos los emails y facturas existentes
 * del usuario que aún no estén indexados. Idempotente: usa addSourceIfNew,
 * que omite los (kind, sourceRefId) ya presentes.
 *
 * Útil tras haber activado la función de memoria cuando ya existía data
 * histórica: en lugar de obligar al usuario a re-sincronizar Gmail, esto
 * procesa lo que ya está en la BBDD.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const userId = session.user.id;

  // Filtro opcional por categorías (default: las relevantes)
  const body = (await req.json().catch(() => ({}))) as {
    categories?: string[];
    limit?: number;
  };
  const categories = body.categories && body.categories.length > 0
    ? body.categories
    : ["FACTURA", "CLIENTE", "PROVEEDOR", "LEGAL"];
  const limit = Math.min(body.limit ?? 500, 1000);

  try {
    // 1) Emails relevantes (no borrados, categoría en la whitelist)
    const emails = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        isNull(schema.emails.deletedAt),
        inArray(schema.emails.category, categories),
      ),
      limit,
      columns: {
        id: true,
        accountId: true,
        subject: true,
        fromName: true,
        fromEmail: true,
        body: true,
        snippet: true,
        date: true,
        category: true,
        priority: true,
      },
    });

    let emailsProcessed = 0;
    let emailsSkipped = 0;
    for (const e of emails) {
      const plainBody = (e.body || e.snippet || "").replace(/<[^>]+>/g, " ");
      const content = `${e.subject || ""}\n\nDe: ${e.fromName || ""} <${e.fromEmail || ""}>\n\n${plainBody}`.slice(0, 8000);
      if (content.trim().length < 20) continue;
      try {
        const { skipped } = await addSourceIfNew({
          userId,
          kind: "email",
          title: e.subject || `(sin asunto) de ${e.fromName || e.fromEmail}`,
          content,
          sourceRefId: e.id,
          accountId: e.accountId,
          metadata: {
            from: e.fromEmail,
            category: e.category,
            priority: e.priority,
            date: e.date?.toISOString?.(),
            accountId: e.accountId,
          },
        });
        if (skipped) emailsSkipped++;
        else emailsProcessed++;
      } catch (err) {
        logError(log, err, { emailId: e.id }, "email backfill failed");
      }
    }

    // 2) Facturas con rawText
    const invoices = await db.query.invoices.findMany({
      where: and(
        eq(schema.invoices.userId, userId),
        // Solo las que tienen algo de texto útil
      ),
      limit,
      columns: {
        id: true,
        emailId: true,
        issuerName: true,
        issuerNif: true,
        invoiceNumber: true,
        totalAmount: true,
        invoiceDate: true,
        category: true,
        concept: true,
        rawText: true,
      },
    });

    // Mapa emailId → accountId para facturas
    const emailIds = invoices.map((i) => i.emailId).filter((x): x is number => !!x);
    const emailAccMap = new Map<number, number | null>();
    if (emailIds.length > 0) {
      const rows = await db
        .select({ id: schema.emails.id, accountId: schema.emails.accountId })
        .from(schema.emails)
        .where(
          and(
            eq(schema.emails.userId, userId),
            inArray(schema.emails.id, emailIds),
          ),
        );
      for (const r of rows) emailAccMap.set(r.id, r.accountId);
    }

    let invoicesProcessed = 0;
    let invoicesSkipped = 0;
    for (const inv of invoices) {
      const content = inv.rawText
        ? inv.rawText.slice(0, 8000)
        : [inv.issuerName, inv.concept, inv.invoiceNumber].filter(Boolean).join(" · ");
      if (!content || content.trim().length < 20) continue;
      const accountId = inv.emailId ? emailAccMap.get(inv.emailId) ?? null : null;
      try {
        const { skipped } = await addSourceIfNew({
          userId,
          kind: "invoice",
          title: `${inv.issuerName || "(sin emisor)"} — ${inv.invoiceNumber || "nº s/n"}`,
          content,
          sourceRefId: inv.id,
          accountId,
          metadata: {
            issuerName: inv.issuerName,
            issuerNif: inv.issuerNif,
            totalAmount: inv.totalAmount,
            invoiceDate: inv.invoiceDate?.toISOString?.(),
            category: inv.category,
            accountId,
          },
        });
        if (skipped) invoicesSkipped++;
        else invoicesProcessed++;
      } catch (err) {
        logError(log, err, { invoiceId: inv.id }, "invoice backfill failed");
      }
    }

    return NextResponse.json({
      ok: true,
      emailsProcessed,
      emailsSkipped,
      invoicesProcessed,
      invoicesSkipped,
      totalProcessed: emailsProcessed + invoicesProcessed,
    });
  } catch (e) {
    logError(log, e, { userId }, "backfill failed");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en backfill" },
      { status: 500 },
    );
  }
}
