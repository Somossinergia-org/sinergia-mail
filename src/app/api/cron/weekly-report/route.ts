import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, sql, gte, lt } from "drizzle-orm";
import { sendEmail } from "@/lib/gmail";
import { logger, logError } from "@/lib/logger";
import { fmtEur } from "@/lib/format";

const log = logger.child({ route: "/api/cron/weekly-report" });

export const maxDuration = 60;

/**
 * Weekly report cron — runs Mondays at 08:00 UTC (09:00 Madrid in winter).
 *
 * Secured via CRON_SECRET matching Vercel's Bearer token.
 *
 * For each user with agentConfig.weeklyReportEnabled = true:
 *  - Computes last-7-days metrics (emails, invoices, top providers, overdue)
 *  - Renders an HTML email
 *  - Sends it via Gmail API using the user's stored OAuth tokens
 *
 * This way we avoid adding an external email provider dependency.
 */
export async function GET(req: NextRequest) {
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const users = await db.query.agentConfig.findMany({
      where: eq(schema.agentConfig.weeklyReportEnabled, true),
    });

    let sent = 0;
    let errors = 0;

    for (const cfg of users) {
      try {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, cfg.userId),
        });
        if (!user?.email) continue;

        const report = await buildReport(cfg.userId, weekAgo, now);
        const html = renderHtml(user.name || "", report);
        const subject = `Sinergia · Informe semanal ${report.period}`;

        await sendEmail(cfg.userId, user.email, subject, html);
        log.info({ userId: cfg.userId, email: user.email }, "weekly report sent");
        sent++;
      } catch (e) {
        logError(log, e, { userId: cfg.userId }, "weekly report failed for user");
        errors++;
      }
    }

    return NextResponse.json({ ok: true, sent, errors, users: users.length });
  } catch (e) {
    logError(log, e, {}, "weekly report cron failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface WeeklyReport {
  period: string;
  totalEmailsWeek: number;
  totalInvoicesWeek: number;
  spentWeek: number;
  overdueCount: number;
  overdueAmount: number;
  topProviders: Array<{ name: string; amount: number; count: number }>;
  anomalies: number;
  ivaAccumulated: number;
  quarter: number;
}

async function buildReport(userId: string, from: Date, to: Date): Promise<WeeklyReport> {
  const quarter = Math.ceil((to.getMonth() + 1) / 3);
  const qStart = new Date(to.getFullYear(), (quarter - 1) * 3, 1);

  const [emails, invs, overdue, top, iva] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails)
      .where(and(eq(schema.emails.userId, userId), gte(schema.emails.date, from), lt(schema.emails.date, to))),
    db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(total_amount), 0)`,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.userId, userId), gte(schema.invoices.createdAt, from))),
    db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(total_amount), 0)`,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.userId, userId), lt(schema.invoices.dueDate, to))),
    db
      .select({
        name: schema.invoices.issuerName,
        amount: sql<number>`SUM(total_amount)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.userId, userId), gte(schema.invoices.createdAt, from)))
      .groupBy(schema.invoices.issuerName)
      .orderBy(sql`SUM(total_amount) DESC`)
      .limit(3),
    db
      .select({
        tax: sql<number>`COALESCE(SUM(tax), 0)`,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.userId, userId), gte(schema.invoices.invoiceDate, qStart))),
  ]);

  return {
    period: `${fmtDate(from)} – ${fmtDate(to)}`,
    totalEmailsWeek: Number(emails[0]?.count || 0),
    totalInvoicesWeek: Number(invs[0]?.count || 0),
    spentWeek: Number(invs[0]?.total || 0),
    overdueCount: Number(overdue[0]?.count || 0),
    overdueAmount: Number(overdue[0]?.total || 0),
    topProviders: top
      .filter((t) => t.name)
      .map((t) => ({ name: t.name as string, amount: Number(t.amount), count: Number(t.count) })),
    anomalies: 0,
    ivaAccumulated: Number(iva[0]?.tax || 0),
    quarter,
  };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function renderHtml(name: string, r: WeeklyReport): string {
  const first = name.split(" ")[0] || "";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:system-ui,-apple-system,sans-serif;color:#fff;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:40px;height:40px;background:linear-gradient(135deg,#338dff,#a855f7);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:22px;">S</div>
      <div>
        <div style="font-size:18px;font-weight:700;">Sinergia Mail</div>
        <div style="font-size:12px;color:#a0a0c0;">Informe semanal</div>
      </div>
    </div>

    <h1 style="font-size:22px;margin:0 0 6px 0;">Buenos días${first ? `, ${first}` : ""}</h1>
    <p style="color:#a0a0c0;margin:0 0 28px 0;font-size:14px;">${r.period}</p>

    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:11px;color:#a0a0c0;text-transform:uppercase;letter-spacing:1px;">Emails recibidos</div>
          <div style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#338dff,#a855f7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${r.totalEmailsWeek}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#a0a0c0;text-transform:uppercase;letter-spacing:1px;">Facturas nuevas</div>
          <div style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#338dff,#a855f7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${r.totalInvoicesWeek}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#a0a0c0;text-transform:uppercase;letter-spacing:1px;">Gasto 7 días</div>
          <div style="font-size:22px;font-weight:700;">${fmtEur(r.spentWeek)} €</div>
        </div>
        <div>
          <div style="font-size:11px;color:#a0a0c0;text-transform:uppercase;letter-spacing:1px;">IVA Q${r.quarter} acumulado</div>
          <div style="font-size:22px;font-weight:700;">${fmtEur(r.ivaAccumulated)} €</div>
        </div>
      </div>
    </div>

    ${r.overdueCount > 0 ? `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#ef4444;margin-bottom:4px;">⚠ ${r.overdueCount} facturas vencidas</div>
      <div style="font-size:13px;color:#a0a0c0;">Importe pendiente: ${fmtEur(r.overdueAmount)} €</div>
    </div>` : ""}

    ${r.topProviders.length > 0 ? `
    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Top proveedores esta semana</div>
      ${r.topProviders.map((p) => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-size:14px;">${p.name}</span>
          <span style="font-size:14px;font-weight:600;">${fmtEur(p.amount)} €</span>
        </div>`).join("")}
    </div>` : ""}

    <div style="text-align:center;margin-top:32px;">
      <a href="https://sinergia-mail.vercel.app/dashboard"
         style="display:inline-block;padding:12px 24px;background:#338dff;color:white;text-decoration:none;border-radius:12px;font-weight:600;font-size:14px;">
        Abrir dashboard
      </a>
    </div>

    <p style="margin-top:40px;font-size:11px;color:#6b6b80;text-align:center;">
      Este email es automático. Puedes desactivarlo desde Chat IA → Configuración.
    </p>
  </div>
</body>
</html>`;
}
