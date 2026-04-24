import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";


/**
 * Global middleware:
 * 1. Inject x-request-id header for end-to-end traceability (Pino logger reads it).
 * 2. Auth guards for /dashboard and /api (except /api/auth/* and /api/mcp).
 * 3. Root redirect.
 */
export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const isLoggedIn = !!req.auth;
  const isOnDashboard = pathname.startsWith("/dashboard");
  const isOnApi = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isMcpApi = pathname.startsWith("/api/mcp");
  const isAdminApi = pathname.startsWith("/api/admin");
  const isTelegramApi = pathname.startsWith("/api/telegram");
  const isWhatsAppApi = pathname.startsWith("/api/whatsapp");
  const isCronApi = pathname.startsWith("/api/cron");
  const isWebhookApi = pathname.startsWith("/api/webhooks");
  const isChatWidgetApi = pathname.startsWith("/api/chat/widget");


  // ─── RequestId ──────────────────────────────────────────────────
  const existingId = req.headers.get("x-request-id");
  const requestId = existingId || crypto.randomUUID();


  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);


  const withRequestId = (response: NextResponse): NextResponse => {
    response.headers.set("x-request-id", requestId);
    return response;
  };


  // ─── Exemptions (MCP + admin usan Bearer token, no sesión) ──────
  if (isAuthApi || isMcpApi || isAdminApi || isTelegramApi || isWhatsAppApi || isCronApi || isWebhookApi || isChatWidgetApi) {
