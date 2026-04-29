/**
 * GET /api/issued-invoices/pending
 *
 * Resumen de cobros pendientes para el widget de Finanzas:
 *   - totalPending  → suma de facturas no cobradas (status != paid|cancelled)
 *   - overdueTotal  → suma de las que tienen dueDate < hoy y aún no cobradas
 *   - dueThisWeek   → suma de las que vencen en los próximos 7 días
 *   - count         → número de facturas pendientes
 *   - top           → 5 más antiguas pendientes (para listar inline)
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, isNull, isNotNull, lte, gte, ne, asc, inArray, notInArray } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 86400000);

  // Pendiente = no pagada, no cancelada, NO en draft.
  // Una factura en draft (borrador) aún no se ha enviado al cliente, por tanto
  // no es un cobro pendiente real. Solo cuentan facturas con status sent/overdue.
  const pending = await db.query.issuedInvoices.findMany({
    where: and(
      eq(schema.issuedInvoices.userId, userId),
      isNull(schema.issuedInvoices.paidAt),
      notInArray(schema.issuedInvoices.status, ["cancelled", "draft"]),
    ),
    orderBy: [asc(schema.issuedInvoices.dueDate), asc(schema.issuedInvoices.issueDate)],
  });

  let totalPending = 0;
  let overdueTotal = 0;
  let dueThisWeek = 0;
  let overdueCount = 0;
  let dueThisWeekCount = 0;

  for (const inv of pending) {
    const t = Number(inv.total || 0);
    totalPending += t;
    if (inv.dueDate) {
      if (inv.dueDate < now) {
        overdueTotal += t;
        overdueCount++;
      } else if (inv.dueDate <= in7days) {
        dueThisWeek += t;
        dueThisWeekCount++;
      }
    }
  }

  // Top 5 más antiguas
  const top = pending.slice(0, 5).map((inv) => ({
    id: inv.id,
    number: inv.number,
    clientName: inv.clientName,
    total: Number(inv.total || 0),
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    isOverdue: inv.dueDate ? inv.dueDate < now : false,
  }));

  return NextResponse.json({
    totalPending,
    overdueTotal,
    dueThisWeek,
    overdueCount,
    dueThisWeekCount,
    count: pending.length,
    top,
  });
}
