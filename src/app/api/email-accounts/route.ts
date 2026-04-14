import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";

/** GET /api/email-accounts — list connected accounts for current user */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const accounts = await db.query.emailAccounts.findMany({
    where: eq(schema.emailAccounts.userId, session.user.id),
    orderBy: [desc(schema.emailAccounts.isPrimary), schema.emailAccounts.email],
  });

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      email: a.email,
      displayName: a.displayName,
      isPrimary: a.isPrimary,
      enabled: a.enabled,
      lastSyncAt: a.lastSyncAt,
      totalEmails: a.totalEmails,
      // never expose tokens
    })),
  });
}

/** PATCH /api/email-accounts — toggle enabled */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json()) as { id?: number; enabled?: boolean };
  if (!body.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await db
    .update(schema.emailAccounts)
    .set({ enabled: body.enabled === true, updatedAt: new Date() })
    .where(and(eq(schema.emailAccounts.id, body.id), eq(schema.emailAccounts.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}

/** DELETE /api/email-accounts?id=N — disconnect (does not delete past emails) */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  // Don't delete primary
  const acc = await db.query.emailAccounts.findFirst({
    where: and(eq(schema.emailAccounts.id, id), eq(schema.emailAccounts.userId, session.user.id)),
  });
  if (!acc) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (acc.isPrimary) {
    return NextResponse.json(
      { error: "No se puede desconectar la cuenta principal. Cierra sesión para hacerlo." },
      { status: 400 },
    );
  }

  await db.delete(schema.emailAccounts).where(eq(schema.emailAccounts.id, id));
  return NextResponse.json({ ok: true });
}
