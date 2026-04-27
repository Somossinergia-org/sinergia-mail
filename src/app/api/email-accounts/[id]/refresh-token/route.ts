import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/email-accounts/[id]/refresh-token" });

/**
 * POST /api/email-accounts/[id]/refresh-token
 *
 * Forzar refresh proactivo del access_token Google de una cuenta concreta.
 * Útil cuando un cron va a sincronizar y queremos evitar que falle a mitad
 * de batch porque el token caducó hace 5 minutos.
 *
 * Auth: sesión NextAuth (admin/owner) o Bearer CRON_SECRET (para crons).
 *
 * Devuelve: { ok, expiresAt, refreshed: boolean }
 *  - refreshed=false → el token aún era válido (>5 min de margen) y no se tocó.
 *  - refreshed=true  → se intercambió refresh_token por nuevo access_token.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const accountId = Number(params.id);
  if (!Number.isFinite(accountId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  // Auth — sesión o cron secret
  const authHeader = req.headers.get("Authorization");
  const cronOk =
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let userId: string | null = null;
  if (!cronOk) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    userId = session.user.id;
  }

  // Cargar cuenta (cron puede tocar cualquier cuenta; sesión solo las propias)
  const where = userId
    ? and(
        eq(schema.emailAccounts.id, accountId),
        eq(schema.emailAccounts.userId, userId),
      )
    : eq(schema.emailAccounts.id, accountId);

  const account = await db.query.emailAccounts.findFirst({ where });
  if (!account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = account.expiresAt ?? 0;

  // Margen de 5 min: si aún quedan >300 segundos, no refrescamos.
  if (expiresAt - nowSec > 300) {
    return NextResponse.json({ ok: true, expiresAt, refreshed: false });
  }

  const refreshToken = decryptToken(account.refreshToken);
  if (!refreshToken) {
    log.warn({ accountId }, "no refresh_token — usuario debe re-autorizar");
    return NextResponse.json(
      { ok: false, error: "no_refresh_token", reauthorize: true },
      { status: 409 },
    );
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      log.error({ accountId, tokens }, "refresh exchange failed");
      // 400 invalid_grant → refresh token revocado por Google (>6 meses sin uso,
      // password change, scope removed). Marca cuenta para re-auth.
      const invalidGrant = tokens.error === "invalid_grant";
      return NextResponse.json(
        {
          ok: false,
          error: tokens.error || "refresh_failed",
          reauthorize: invalidGrant,
        },
        { status: invalidGrant ? 409 : 502 },
      );
    }

    const newExpiresAt = nowSec + (Number(tokens.expires_in) || 3600);
    await db
      .update(schema.emailAccounts)
      .set({
        accessToken: encryptToken(tokens.access_token) ?? tokens.access_token,
        expiresAt: newExpiresAt,
        scope: tokens.scope || account.scope,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailAccounts.id, accountId));

    log.info({ accountId, newExpiresAt }, "access_token refrescado");
    return NextResponse.json({ ok: true, expiresAt: newExpiresAt, refreshed: true });
  } catch (e) {
    logError(log, e, { accountId }, "refresh-token failed");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
