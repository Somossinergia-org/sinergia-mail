import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, lt, isNotNull, count } from "drizzle-orm";

/**
 * GET /api/invoices/pending-count
 *
 * Cuenta facturas con dueDate en el pasado (vencidas) o sin pagar próximamente.
 * Usado por el dashboard móvil para mostrar el badge de notificaciones en
 * la pestaña Finanzas.
 *
 * Devuelve { pendingCount, overdueCount }.
 *
 * Auth: sesión NextAuth.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();

  try {
    // Vencidas: dueDate < hoy
    const overdueRows = await db
      .select({ c: count() })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.userId, session.user.id),
          isNotNull(schema.invoices.dueDate),
          lt(schema.invoices.dueDate, now),
        ),
      );
    const overdueCount = Number(overdueRows[0]?.c ?? 0);

    return NextResponse.json({
      pendingCount: overdueCount,
      overdueCount,
    });
  } catch (e) {
    return NextResponse.json(
      { pendingCount: 0, overdueCount: 0, error: (e as Error).message },
      { status: 200 }, // no rompemos UI por esto
    );
  }
}
