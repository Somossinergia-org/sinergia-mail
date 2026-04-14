import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Global middleware:
 * 1. Inject x-request-id header for end-to-end traceability (Pino logger reads it).
 * 2. Auth guards for /dashboard and /api.
 * 3. Root redirect.
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isOnApi = req.nextUrl.pathname.startsWith("/api");
  const isAuthApi = req.nextUrl.pathname.startsWith("/api/auth");
  // MCP endpoint uses its own Bearer token auth — exempt from session guard
  // Exempt both the JSON-RPC endpoint and its trailing-slash variant
  const isMcpEndpoint =
    req.nextUrl.pathname === "/api/mcp" ||
    req.nextUrl.pathname === "/api/mcp/" ||
    req.nextUrl.pathname.startsWith("/api/mcp/");

  // ─── RequestId ──────────────────────────────────────────────────
  const existingId = req.headers.get("x-request-id");
  const requestId = existingId || crypto.randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const withRequestId = (response: NextResponse): NextResponse => {
    response.headers.set("x-request-id", requestId);
    return response;
  };

  // Allow auth API routes (they still get the requestId header)
  if (isAuthApi || isMcpEndpoint) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("x-mw-bypass", isMcpEndpoint ? "mcp" : "auth");
    res.headers.set("x-mw-path", req.nextUrl.pathname);
    return withRequestId(res);
  }

  // Debug: always include path so we can diagnose matcher issues
  const tagMw = (res: NextResponse): NextResponse => {
    res.headers.set("x-mw-path", req.nextUrl.pathname);
    res.headers.set("x-mw-bypass", "none");
    return res;
  };

  // Protect dashboard
  if (isOnDashboard && !isLoggedIn) {
    return withRequestId(NextResponse.redirect(new URL("/login", req.nextUrl)));
  }

  // Protect API routes (except auth)
  if (isOnApi && !isLoggedIn) {
    return withRequestId(
      tagMw(NextResponse.json({ error: "No autorizado", requestId }, { status: 401 }))
    );
  }

  // Redirect logged-in users from login to dashboard
  if (req.nextUrl.pathname === "/login" && isLoggedIn) {
    return withRequestId(NextResponse.redirect(new URL("/dashboard", req.nextUrl)));
  }

  // Redirect root to dashboard or login
  if (req.nextUrl.pathname === "/") {
    return withRequestId(
      NextResponse.redirect(new URL(isLoggedIn ? "/dashboard" : "/login", req.nextUrl))
    );
  }

  return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }));
});

export const config = {
  matcher: ["/", "/dashboard/:path*", "/login", "/api/:path*"],
};
