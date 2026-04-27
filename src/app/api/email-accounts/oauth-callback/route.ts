import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { logger, logError } from "@/lib/logger";
import { encryptToken } from "@/lib/crypto/tokens";

const log = logger.child({ route: "/api/email-accounts/oauth-callback" });

function verifyState(state: string, secret: string): { userId: string; nonce: string; ts: number } | null {
  const parts = state.split("|");
  if (parts.length !== 4) return null;
  const [userId, nonce, ts, sig] = parts;
  const payload = `${userId}|${nonce}|${ts}`;
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (sig !== expectedSig) return null;
  const tsNum = Number(ts);
  // Reject states older than 10 minutes
  if (Date.now() - tsNum > 10 * 60 * 1000) return null;
  return { userId, nonce, ts: tsNum };
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(new URL(`/dashboard?integration_error=${error || "missing_params"}`, req.nextUrl));
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // SECURITY: el fallback "fallback-not-secure" anterior permitía a
    // cualquiera forjar el state HMAC y secuestrar cuentas Gmail durante
    // el OAuth callback. Auditoría 2026-04-26 lo detectó.
    log.error("NEXTAUTH_SECRET no configurado — oauth-callback abortado");
    return NextResponse.redirect(new URL("/dashboard?integration_error=config_missing", req.nextUrl));
  }
  const verified = verifyState(state, secret);
  if (!verified) {
    return NextResponse.redirect(new URL("/dashboard?integration_error=invalid_state", req.nextUrl));
  }

  const baseUrl = process.env.NEXTAUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = `${baseUrl}/api/email-accounts/oauth-callback`;

  // Scopes que pedimos en /connect — si Google omite alguno (usuario destildó
  // un permiso en la pantalla de consent), avisamos en query string para que
  // el dashboard pueda mostrar warning. No bloquea la conexión.
  const REQUESTED_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.events",
  ];

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      log.error({ tokens }, "token exchange failed");
      return NextResponse.redirect(new URL("/dashboard?integration_error=token_exchange", req.nextUrl));
    }

    // 2. Fetch user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();
    if (!userInfoRes.ok || !userInfo.email) {
      return NextResponse.redirect(new URL("/dashboard?integration_error=userinfo", req.nextUrl));
    }

    // 3. Upsert email_account
    const existing = await db.query.emailAccounts.findFirst({
      where: and(
        eq(schema.emailAccounts.userId, verified.userId),
        eq(schema.emailAccounts.email, userInfo.email),
      ),
    });

    if (existing) {
      await db
        .update(schema.emailAccounts)
        .set({
          accessToken: encryptToken(tokens.access_token) ?? tokens.access_token,
          refreshToken: encryptToken(tokens.refresh_token) || existing.refreshToken,
          expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600),
          scope: tokens.scope,
          enabled: true,
          displayName: userInfo.name || existing.displayName,
          updatedAt: new Date(),
        })
        .where(eq(schema.emailAccounts.id, existing.id));
      log.info({ userId: verified.userId, email: userInfo.email }, "email account refreshed");
    } else {
      await db.insert(schema.emailAccounts).values({
        userId: verified.userId,
        provider: "google",
        email: userInfo.email,
        displayName: userInfo.name || null,
        accessToken: encryptToken(tokens.access_token) ?? tokens.access_token,
        refreshToken: encryptToken(tokens.refresh_token) || null,
        expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600),
        scope: tokens.scope,
        isPrimary: false,
        enabled: true,
      });
      log.info({ userId: verified.userId, email: userInfo.email }, "email account connected");
    }

    const granted = (tokens.scope as string | undefined)?.split(/\s+/) ?? [];
    const missing = REQUESTED_SCOPES.filter((s) => !granted.includes(s));
    const successUrl = new URL("/dashboard?integration_success=email_account", req.nextUrl);
    if (missing.length > 0) {
      successUrl.searchParams.set("scopes_missing", missing.map((s) => s.split("/").pop()!).join(","));
      log.warn({ userId: verified.userId, missing }, "OAuth completado con scopes incompletos");
    }
    return NextResponse.redirect(successUrl);
  } catch (e) {
    logError(log, e, { userId: verified.userId }, "oauth-callback failed");
    return NextResponse.redirect(new URL("/dashboard?integration_error=server", req.nextUrl));
  }
}
