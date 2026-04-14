import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, inArray, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { trashEmails } from "@/lib/gmail";

export const maxDuration = 60;

/**
 * GET /api/agent/cleanup
 *   ?trash=list       → lista de emails en papelera interna (soft-deleted)
 *   (sin query)       → análisis de candidatos a limpieza
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const startTime = Date.now();
  const mode = new URL(req.url).searchParams.get("trash");

  // ─── Modo papelera interna ────────────────────────────────────────
  if (mode === "list") {
    const trashed = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        isNotNull(schema.emails.deletedAt),
      ),
      orderBy: [desc(schema.emails.deletedAt)],
      limit: 500,
      columns: {
        id: true,
        subject: true,
        fromName: true,
        fromEmail: true,
        category: true,
        date: true,
        deletedAt: true,
      },
    });
    return NextResponse.json({ trash: trashed, count: trashed.length });
  }

  try {
    // Fetch all emails for user (excluye los ya eliminados soft)
    const userEmails = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        isNull(schema.emails.deletedAt),
      ),
    });

    // Protected categories that should NEVER be deleted
    const protectedCategories = ["FACTURA", "CLIENTE", "PROVEEDOR", "LEGAL", "RRHH"];

    // Check for invoices (to avoid deleting emails linked to invoices)
    const invoiceEmailIds = await db.query.invoices
      .findMany({
        where: eq(schema.invoices.userId, userId),
      })
      .then((invoices) => new Set(invoices.map((inv) => inv.emailId)));

    // Score each email for deletability
    const groups: Record<string, { emailIds: number[]; count: number; reason: string; score: number }> = {};
    let totalDeletable = 0;

    for (const email of userEmails) {
      // Skip protected categories
      if (email.category && protectedCategories.includes(email.category)) {
        continue;
      }

      // Skip emails linked to invoices
      if (invoiceEmailIds.has(email.id)) {
        continue;
      }

      let score = 0;
      let reason = "";

      if (email.category === "SPAM") {
        score = 100;
        reason = "SPAM";
      } else if (email.category === "MARKETING") {
        if (email.isRead) {
          score = 80;
          reason = "Marketing leído";
        } else {
          score = 60;
          reason = "Marketing sin leer";
        }
      } else if (email.category === "NOTIFICACION") {
        if (email.isRead && email.date) {
          const daysSinceEmail = (Date.now() - email.date.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceEmail > 30) {
            score = 70;
            reason = "Notificaciones antiguas (>30d)";
          } else if (daysSinceEmail > 7) {
            score = 40;
            reason = "Notificaciones antiguas (>7d)";
          }
        }
      }

      if (score > 0) {
        if (!groups[reason]) {
          groups[reason] = { emailIds: [], count: 0, reason, score };
        }
        groups[reason].emailIds.push(email.id);
        groups[reason].count++;
        totalDeletable++;
      }
    }

    // Build response
    const groupsArray = Object.values(groups).sort((a, b) => b.score - a.score);

    return NextResponse.json({
      analysis: {
        totalEmails: userEmails.length,
        deletable: totalDeletable,
        groups: groupsArray.map((g) => ({
          reason: g.reason,
          count: g.count,
          emailIds: g.emailIds,
          score: g.score,
        })),
        protected: protectedCategories,
      },
      durationMs: Date.now() - startTime,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de análisis" },
      { status: 500 }
    );
  }
}

/** POST /api/agent/cleanup — Execute cleanup */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { emailIds, action } = await req.json().catch(() => ({ emailIds: undefined, action: undefined }));
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json({ error: "emailIds requerido y no vacío" }, { status: 400 });
    }

    if (action !== "trash") {
      return NextResponse.json({ error: "action debe ser 'trash'" }, { status: 400 });
    }

    // Verify all emails belong to user
    const emails = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        inArray(
          schema.emails.id,
          emailIds.map((id) => parseInt(String(id), 10)).filter((n) => !isNaN(n))
        )
      ),
    });

    if (emails.length === 0) {
      return NextResponse.json({ error: "No se encontraron emails válidos" }, { status: 400 });
    }

    if (emails.length !== emailIds.length) {
      return NextResponse.json(
        { error: "Algunos emails no pertenecen al usuario" },
        { status: 403 }
      );
    }

    // Get Gmail IDs for deletion
    const gmailIds = emails.map((e) => e.gmailId);

    // Call Gmail API to trash (30 días de retención en Gmail)
    const trashResult = await trashEmails(userId, gmailIds);

    // Soft-delete: marca deletedAt. Permite restaurar vía DELETE endpoint
    // sin tener que re-sincronizar desde Gmail.
    await db
      .update(schema.emails)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.emails.userId, userId),
          inArray(
            schema.emails.id,
            emails.map((e) => e.id),
          ),
        ),
      );

    // Log the action
    const durationMs = Date.now() - startTime;
    await db.insert(schema.agentLogs).values({
      userId,
      action: "cleanup",
      inputSummary: `Moved ${trashResult.trashed} emails to trash`,
      outputSummary: `Successfully trashed ${trashResult.trashed} emails, ${trashResult.errors} errors`,
      durationMs,
      success: trashResult.errors === 0,
      error: trashResult.errors > 0 ? `${trashResult.errors} errors during trash` : null,
    });

    return NextResponse.json({
      success: true,
      trashed: trashResult.trashed,
      errors: trashResult.errors,
      durationMs,
    });
  } catch (e) {
    const durationMs = Date.now() - startTime;
    await db.insert(schema.agentLogs).values({
      userId,
      action: "cleanup",
      inputSummary: "Cleanup execution",
      durationMs,
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de limpieza" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent/cleanup
 *   body { emailIds?: number[] } — si se provee, restaura esos IDs.
 *   Si no, restaura todos los soft-deleted del usuario.
 *
 * Nota: esto SÓLO limpia deletedAt en la BBDD local. En Gmail el email
 * sigue en la papelera; si quieres recuperarlo allí también, hazlo desde
 * la UI de Gmail (Sinergia no modifica ese estado automáticamente para
 * evitar confusión).
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({})) as { emailIds?: number[] };
  const ids = Array.isArray(body.emailIds)
    ? body.emailIds
        .map((n) => parseInt(String(n), 10))
        .filter((n) => Number.isFinite(n))
    : [];

  const where = ids.length > 0
    ? and(
        eq(schema.emails.userId, userId),
        isNotNull(schema.emails.deletedAt),
        inArray(schema.emails.id, ids),
      )
    : and(
        eq(schema.emails.userId, userId),
        isNotNull(schema.emails.deletedAt),
      );

  const restored = await db
    .update(schema.emails)
    .set({ deletedAt: null })
    .where(where)
    .returning({ id: schema.emails.id });

  return NextResponse.json({ ok: true, restored: restored.length });
}

/**
 * PUT /api/agent/cleanup?purge=1
 *   Purga permanente: borra físicamente los soft-deleted con deletedAt >
 *   30 días. Protege contra ejecución accidental con el query param.
 */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (new URL(req.url).searchParams.get("purge") !== "1") {
    return NextResponse.json({ error: "Falta ?purge=1" }, { status: 400 });
  }
  const userId = session.user.id;
  const purged = await db.execute(
    sql`DELETE FROM emails
        WHERE user_id = ${userId}
          AND deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '30 days'
        RETURNING id`,
  );
  const rows = (purged as unknown as { rows?: unknown[] }).rows ?? [];
  return NextResponse.json({ ok: true, purged: rows.length });
}
