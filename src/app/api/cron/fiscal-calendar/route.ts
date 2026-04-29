import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";
import { safeBearer } from "@/lib/security/safe-equal";
import { createNotification } from "@/lib/crm/notifications";
import { createTask } from "@/lib/crm/commercial-tasks";

const log = logger.child({ route: "/api/cron/fiscal-calendar" });

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diario: genera recordatorios fiscales AEAT España.
 *
 * Modelos cubiertos:
 *   - 303 (IVA trimestral): trimestres terminan 31/Mar, 30/Jun, 30/Sep, 31/Dic
 *     Plazo: 1-20 del mes siguiente al cierre. Recordamos 10/5/3 días antes.
 *   - 130 (IRPF autónomos trimestral): mismas fechas que 303.
 *   - 115 (IRPF retenciones alquileres trimestral): mismas fechas.
 *   - 349 (intracomunitarios mensual o trimestral): trimestral, mismas fechas.
 *   - 390 (resumen anual IVA): plazo enero, recordamos del 5 al 25 enero.
 *   - 347 (operaciones >3005€ con terceros): plazo febrero, recordamos del 1 al 25 feb.
 *
 * Idempotencia: dedupKey con modelo+año+trimestre+ventana → re-ejecuciones
 * en el mismo día NO crean duplicados.
 */
export async function GET(req: Request) {
  if (!safeBearer(req.headers.get("Authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const stats = { remindersCreated: 0, errors: 0 };

  try {
    // Lista todos los users (cron global, mismo recordatorio para todos los autónomos/empresas)
    const users = await db.query.users.findMany({ columns: { id: true } });

    for (const u of users) {
      try {
        const reminders = computeUpcomingReminders(now);
        for (const r of reminders) {
          const dedup = `fiscal:${r.model}:${r.year}:${r.period}:${r.daysUntil}`;
          const noti = await createNotification({
            userId: u.id,
            type: "renewal_upcoming",
            severity: r.daysUntil <= 5 ? "urgent" : "warning",
            title: r.title,
            message: r.message,
            dedupKey: dedup,
          });
          if (noti) {
            stats.remindersCreated++;
            // Tarea solo si quedan 5 días o menos
            if (r.daysUntil <= 5) {
              await createTask({
                userId: u.id,
                companyId: null,
                opportunityId: null,
                caseId: null,
                title: `🧾 ${r.model}: ${r.title}`,
                description: r.message,
                priority: r.daysUntil <= 2 ? "alta" : "media",
                dueAt: r.deadline,
                source: "rule",
              });
            }
          }
        }
      } catch (e) {
        stats.errors++;
        logError(log, e, { userId: u.id }, "fiscal calendar entry failed");
      }
    }

    log.info({ stats, usersProcessed: users.length }, "fiscal-calendar cron complete");
    return NextResponse.json({ ok: true, ...stats, users: users.length });
  } catch (err) {
    logError(log, err, {}, "fiscal-calendar cron error");
    return NextResponse.json({ ok: false, error: "Error procesando calendario fiscal" }, { status: 500 });
  }
}

interface FiscalReminder {
  model: string;
  year: number;
  period: string; // "Q1" / "Q2" / "Q3" / "Q4" / "anual"
  title: string;
  message: string;
  deadline: Date;
  daysUntil: number;
}

/**
 * Calcula recordatorios para los próximos 30 días.
 * Genera entradas para 303/130/115/349 (trimestral) + 390/347 (anual).
 */
function computeUpcomingReminders(now: Date): FiscalReminder[] {
  const reminders: FiscalReminder[] = [];
  const year = now.getFullYear();

  // ── Trimestrales (303, 130, 115, 349) ──
  // Plazo de presentación: 1-20 del mes siguiente al fin de trimestre.
  const quarterDeadlines: Array<{ q: string; year: number; deadline: Date }> = [
    { q: "Q1", year, deadline: new Date(year, 3, 20, 23, 59) },  // 20 abril
    { q: "Q2", year, deadline: new Date(year, 6, 20, 23, 59) },  // 20 julio
    { q: "Q3", year, deadline: new Date(year, 9, 20, 23, 59) },  // 20 octubre
    { q: "Q4", year, deadline: new Date(year + 1, 0, 30, 23, 59) }, // 30 enero año siguiente
  ];

  // Si estamos en Q1 del año siguiente, también incluir Q4 del año actual
  if (now.getMonth() === 0) {
    quarterDeadlines.unshift({ q: "Q4", year: year - 1, deadline: new Date(year, 0, 30, 23, 59) });
  }

  for (const { q, year: y, deadline } of quarterDeadlines) {
    const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
    if (daysUntil < 0 || daysUntil > 30) continue;

    // Sólo disparar en días específicos (10, 5, 3, 1) para no spammear.
    if (![10, 5, 3, 1].includes(daysUntil)) continue;

    reminders.push({
      model: "303",
      year: y,
      period: q,
      title: `Modelo 303 ${q} ${y} en ${daysUntil} días`,
      message: `Liquidación trimestral de IVA. Plazo límite: ${deadline.toLocaleDateString("es-ES")}. Pide al agente fiscal: "fiscal_calculate_modelo_303 ${y} ${q.replace("Q", "")}".`,
      deadline,
      daysUntil,
    });
    reminders.push({
      model: "130",
      year: y,
      period: q,
      title: `Modelo 130 ${q} ${y} en ${daysUntil} días`,
      message: `Pago fraccionado IRPF (autónomos). Plazo: ${deadline.toLocaleDateString("es-ES")}. Pide al agente: "fiscal_calculate_modelo_130 ${y} ${q.replace("Q", "")}".`,
      deadline,
      daysUntil,
    });
    reminders.push({
      model: "115",
      year: y,
      period: q,
      title: `Modelo 115 ${q} ${y} en ${daysUntil} días`,
      message: `Retenciones IRPF alquileres. Plazo: ${deadline.toLocaleDateString("es-ES")}.`,
      deadline,
      daysUntil,
    });
  }

  // ── Anuales (390 y 347) ──
  // 390 (resumen anual IVA): 1-30 enero del año siguiente
  const deadline390 = new Date(year, 0, 30, 23, 59);
  if (now.getMonth() === 0) {
    const daysUntil = Math.ceil((deadline390.getTime() - now.getTime()) / 86400000);
    if (daysUntil >= 0 && [10, 5, 3, 1].includes(daysUntil)) {
      reminders.push({
        model: "390",
        year: year - 1,
        period: "anual",
        title: `Modelo 390 ${year - 1} en ${daysUntil} días`,
        message: `Resumen anual de IVA. Plazo: ${deadline390.toLocaleDateString("es-ES")}. Pide al agente: "fiscal_calculate_modelo_390 ${year - 1}".`,
        deadline: deadline390,
        daysUntil,
      });
    }
  }

  // 347 (terceros): 1-28 febrero del año siguiente
  const deadline347 = new Date(year, 1, 28, 23, 59);
  if (now.getMonth() === 1) {
    const daysUntil = Math.ceil((deadline347.getTime() - now.getTime()) / 86400000);
    if (daysUntil >= 0 && [10, 5, 3, 1].includes(daysUntil)) {
      reminders.push({
        model: "347",
        year: year - 1,
        period: "anual",
        title: `Modelo 347 ${year - 1} en ${daysUntil} días`,
        message: `Operaciones con terceros >3.005,06€. Plazo: ${deadline347.toLocaleDateString("es-ES")}.`,
        deadline: deadline347,
        daysUntil,
      });
    }
  }

  return reminders;
}
