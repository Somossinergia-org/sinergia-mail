import { NextResponse } from "next/server";
import { type Logger } from "pino";
import { logError } from "./logger";

/**
 * Safe API error handler.
 *
 * - Logs full error with stack via Pino (never exposed to client).
 * - In production: returns generic message + requestId so user can report it.
 * - In development: returns the real error message for fast debugging.
 *
 * Usage:
 *   try { ... } catch (e) {
 *     return apiError(e, log, { route: "/api/agent/chat" });
 *   }
 */
export function apiError(
  err: unknown,
  log: Logger,
  context: Record<string, unknown> = {},
  status = 500,
  publicMessage = "Error interno del servidor"
): NextResponse {
  logError(log, err, context, "api error");

  const requestId = (context.requestId as string) || "unknown";
  const isDev = process.env.NODE_ENV !== "production";

  const body = isDev
    ? {
        error: err instanceof Error ? err.message : String(err),
        requestId,
        stack: err instanceof Error ? err.stack : undefined,
      }
    : { error: publicMessage, requestId };

  return NextResponse.json(body, { status });
}
