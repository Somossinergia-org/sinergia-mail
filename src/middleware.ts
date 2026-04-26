import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Global middleware:
 * 1. Inject x-request-id header for end-to-end traceability (Pino logger reads it).
 * 2. Auth guards for /dashboard and /api (except explicit exemptions).
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
  // office-state acepta session OR Bearer (CRON_SECRET / AGENT_API_KEY) — la
  // verificación se hace en la propia route. Exenta del middleware para que
  // los Bearer tokens lleguen al handler.
  const isOfficeStateApi = pathname.startsWith("/api/office-state");

  // ─── RequestId ──────────────────────────────────────────────────
  const existingId = req.headers.get("x-request-id");
  const requestId = existingId || crypto.randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const withRequestId = (response: NextResponse): NextResponse => {
    response.headers.set("x-request-id", requestId);
    return response;
  };

  // ─── Exemptions (Bearer token / public widget / webhooks / crons) ─
  if (
    isAuthApi ||
    isMcpApi ||
    isAdminApi ||
    isTelegramApi ||
    isWhatsAppApi ||
    isCronApi ||
    isWebhookApi ||
    isChatWidgetApi ||
    isOfficeStateApi
  ) {
    return withRequestId(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  }

  // ─── Dashboard: requiere sesión ─────────────────────────────────
  if (isOnDashboard && !isLoggedIn) {
    return withRequestId(NextResponse.redirect(new URL("/login", req.nextUrl)));
  }

  // ─── API: requiere sesión salvo exenciones ─────────────────────
  if (isOnApi && !isLoggedIn) {
    return withRequestId(
      NextResponse.json(
        { error: "No autorizado", requestId },
        { status: 401 },
      ),
    );
  }

  // ─── /login: redirige a dashboard si ya hay sesión ─────────────
  if (pathname === "/login" && isLoggedIn) {
    return withRequestId(
      NextResponse.redirect(new URL("/dashboard", req.nextUrl)),
    );
  }

  // ─── Raíz ──────────────────────────────────────────────────────
  if (pathname === "/") {
    return withRequestId(
      NextResponse.redirect(
        new URL(isLoggedIn ? "/dashboard" : "/login", req.nextUrl),
      ),
    );
  }

  return withRequestId(
    NextResponse.next({ request: { headers: requestHeaders } }),
  );
});

export const config = {
  matcher: ["/", "/dashboard/:path*", "/login", "/api/:path*"],
};
