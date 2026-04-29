import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";
import { safeBearer } from "@/lib/security/safe-equal";
import { createNotification } from "@/lib/crm/notifications";
import { createTask } from "@/lib/crm/commercial-tasks";

const log = logger.child({ route: "/api/cron/renewals-watch" });

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Cron diario: detecta servicios con expiry en 60/30/15 días y genera
 * tareas + notificaciones para que David pueda renovar.
 *
 * Schedule: una vez al día (configurar en vercel.json).
 *
 * Auth: Bearer CRON_SECRET (Vercel cron lo añade automáticamente).
 *
 * Idempotencia: createNotification usa onConflictDoNothing por dedupKey
 * basado en serviceId+día+ventana. Re-ejecuciones del mismo día = no-op.
 */
export async function GET(req: Request) {
  if (!safeBearer(req.headers.get("Authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const stats = { d60: 0, d30: 0, d15: 0, errors: 0 };

  // 3 ventanas: 55-65, 27-33, 13-17 días desde hoy
  const windows: Array<{ label: "d60" | "d30" | "d15"; from: Date; to: Date; severity: "warning" | "urgent" }> = [
    { label: "d60", from: addDays(now, 55), to: addDays(now, 65), severity: "warning" },
    { label: "d30", from: addDays(now, 27), to: addDays(now, 33), severity: "warning" },
    { label: "d15", from: addDays(now, 13), to: addDays(now, 17), severity: "urgent" },
  ];

  try {
    for (const w of windows) {
      // Buscar servicios contratados con expiryDate en la ventana
      const services = await db
        .select({
          id: schema.services.id,
          companyId: schema.services.companyId,
          type: schema.services.type,
          provider: schema.services.provider,
          expiryDate: schema.services.expiryDate,
          companyUserId: schema.companies.userId,
          companyName: schema.companies.name,
        })
        .from(schema.services)
        .innerJoin(schema.companies, eq(schema.companies.id, schema.services.companyId))
        .where(
          and(
            eq(schema.services.status, "contracted"),
            isNotNull(schema.services.expiryDate),
            gte(schema.services.expiryDate, w.from),
            lte(schema.services.expiryDate, w.to),
          ),
        );

      for (const svc of services) {
        try {
          const dueDate = svc.expiryDate;
          if (!dueDate) continue;

          // Notificación
          await createNotification({
            userId: svc.companyUserId,
            companyId: svc.companyId,
            type: "renewal_upcoming",
            severity: w.severity,
            title: `Renovación ${w.label === "d15" ? "URGENTE" : "próxima"}: ${svc.companyName}`,
            message: `Servicio ${svc.type}${svc.provider ? ` (${svc.provider})` : ""} vence el ${dueDate.toLocaleDateString("es-ES")}`,
            dedupKey: `renewal:${svc.id}:${w.label}:${dueDate.toISOString().slice(0, 10)}`,
          });

          // Tarea para David — solo en ventanas d30 y d15
          if (w.label !== "d60") {
            await createTask({
              userId: svc.companyUserId,
              companyId: svc.companyId,
              opportunityId: null,
              caseId: null,
              title: `Renovar ${svc.type} de ${svc.companyName}`,
              description: `Vence el ${dueDate.toLocaleDateString("es-ES")}. Provider actual: ${svc.provider || "—"}.`,
              priority: w.label === "d15" ? "alta" : "media",
              dueAt: addDays(dueDate, -7), // 1 semana antes del vencimiento
              source: "renewal",
            });
          }

          stats[w.label]++;
        } catch (e) {
          stats.errors++;
          logError(log, e, { svcId: svc.id, window: w.label }, "renewal notification failed");
        }
      }
    }

    log.info({ stats }, "renewals-watch cron complete");
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    logError(log, err, {}, "renewals-watch cron error");
    return NextResponse.json({ ok: false, error: "Error procesando renovaciones" }, { status: 500 });
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
