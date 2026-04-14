import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";

/**
 * GET /api/email-accounts/connect
 *
 * Initiates a Google OAuth flow to connect an ADDITIONAL Gmail account
 * (not the primary login account). Returns the authorization URL or
 * 302-redirects directly.
 *
 * Carries the userId in the OAuth `state` (HMAC-signed to prevent tampering).
 * The callback (/api/email-accounts/oauth-callback) verifies state, exchanges
 * the code, and persists tokens in `email_accounts`.
 */

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
];

function signState(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.NEXTAUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const secret = process.env.NEXTAUTH_SECRET || "fallback-not-secure";
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID no configurado" }, { status: 500 });
  }

  const nonce = crypto.randomBytes(12).toString("base64url");
  const payload = `${session.user.id}|${nonce}|${Date.now()}`;
  const sig = signState(payload, secret);
  const state = `${payload}|${sig}`;

  const redirectUri = `${baseUrl}/api/email-accounts/oauth-callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  // prompt=consent forces refresh_token even if user already authorized this client
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}
