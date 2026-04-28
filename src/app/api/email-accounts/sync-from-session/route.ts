import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { encryptToken } from "@/lib/crypto/tokens";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/email-accounts/sync-from-session" });

/**
 * POST /api/email-accounts/sync-from-session
 *
 * Sincroniza email_accounts a partir de los tokens del JWT de la sesión actual.
 * Útil cuando el callback signIn de NextAuth no persistió por algún motivo.
 *
 * El user llama a este endpoint desde el dashboard si email_accounts está
 * vacío pero la sesión NextAuth está activa con accessToken.
 *
 * Requiere sesión válida.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const accessToken = (session as { accessToken?: string }).accessToken;
  const refreshToken = (session as { refreshToken?: string }).refreshToken;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Sesión sin accessToken — necesitas re-loguearte con Google", needsReauth: true },
      { status: 400 },
    );
  }

  try {
    // Asegurar que el user existe en `users` table
    let userRecord = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.email, session.user!.email!),
      columns: { id: true },
    });
    if (!userRecord) {
      const id = crypto.randomUUID();
      await db.insert(schema.users).values({
        id,
        email: session.user!.email!,
        name: session.user!.name || null,
        image: session.user!.image || null,
        emailVerified: new Date(),
      });
      userRecord = { id };
      log.info({ userId: id }, "user created from session sync");
    }

    // Upsert email_accounts
    const existing = await db.query.emailAccounts.findFirst({
      where: and(
        eq(schema.emailAccounts.userId, userRecord.id),
        eq(schema.emailAccounts.email, session.user!.email!),
      ),
    });

    const tokenData = {
      accessToken: encryptToken(accessToken) ?? accessToken,
      refreshToken: refreshToken
        ? (encryptToken(refreshToken) || refreshToken)
        : existing?.refreshToken || null,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    if (existing) {
      await db.update(schema.emailAccounts).set({
        ...tokenData,
        enabled: true,
        updatedAt: new Date(),
      }).where(eq(schema.emailAccounts.id, existing.id));
      log.info({ id: existing.id }, "email_account refreshed from session");
      return NextResponse.json({ ok: true, action: "updated", accountId: existing.id });
    } else {
      const inserted = await db.insert(schema.emailAccounts).values({
        userId: userRecord.id,
        provider: "google",
        email: session.user!.email!,
        displayName: session.user!.name || null,
        ...tokenData,
        isPrimary: true,
        enabled: true,
      }).returning({ id: schema.emailAccounts.id });
      log.info({ id: inserted[0]?.id }, "email_account created from session");
      return NextResponse.json({ ok: true, action: "created", accountId: inserted[0]?.id });
    }
  } catch (e) {
    logError(log, e, { email: session.user.email }, "sync-from-session failed");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error", ok: false },
      { status: 500 },
    );
  }
}
