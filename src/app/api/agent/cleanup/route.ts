import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { trashEmails } from "@/lib/gmail";

export const maxDuration = 60;

/** GET /api/agent/cleanup — Analyze emails for cleanup */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const startTime = Date.now();

  try {
    // Fetch all emails for user
    const userEmails = await db.query.emails.findMany({
      where: eq(schema.emails.userId, userId),
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

    // Call Gmail API to trash
    const trashResult = await trashEmails(userId, gmailIds);

    // Update DB: mark as deleted or remove (soft delete: we'll just delete from DB)
    // In production, you might want a 'deletedAt' field for recovery
    await db.delete(schema.emails).where(
      and(
        eq(schema.emails.userId, userId),
        inArray(
          schema.emails.id,
          emails.map((e) => e.id)
        )
      )
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

/** DELETE /api/agent/cleanup — Undo cleanup */
export async function DELETE() {
  return NextResponse.json(
    { error: "Not implemented" },
    { status: 501 }
  );
}
