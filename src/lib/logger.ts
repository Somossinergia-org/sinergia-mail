import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * Structured logger — singleton.
 *
 * In production (Vercel): JSON to stdout (parsed automatically by Vercel Logs,
 * ready for Datadog/Sentry/Loki exporters).
 * In development: human-readable with pino-pretty.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ userId, route }, "email categorized");
 *   logger.error({ err, userId }, "gemini call failed");
 *
 * For scoped loggers (auto-injects context):
 *   const log = logger.child({ requestId, userId });
 *   log.info("processing invoice");
 */

const isDev = process.env.NODE_ENV !== "production";
const level = process.env.LOG_LEVEL || (isDev ? "debug" : "info");

const baseOptions: LoggerOptions = {
  level,
  base: {
    env: process.env.NODE_ENV || "unknown",
    service: "sinergia-mail",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields automatically in every log payload
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "access_token",
      "refresh_token",
      "GEMINI_API_KEY",
      "GOOGLE_CLIENT_SECRET",
      "NEXTAUTH_SECRET",
      "DATABASE_URL",
    ],
    censor: "[REDACTED]",
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
};

// In dev we can load pino-pretty; in serverless prod we stay JSON-only
const devTransport = isDev
  ? {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,env,service",
          singleLine: false,
        },
      },
    }
  : {};

export const logger: Logger = pino({ ...baseOptions, ...devTransport });

/**
 * Create a child logger with pre-filled context (e.g. requestId, userId, route).
 * Each log emitted from the returned logger includes those fields automatically.
 */
export function createScopedLogger(context: Record<string, unknown>): Logger {
  return logger.child(context);
}

/**
 * Helper: log an error object with full stack + typed properties.
 */
export function logError(
  log: Logger,
  err: unknown,
  context: Record<string, unknown> = {},
  message = "unhandled error"
): void {
  if (err instanceof Error) {
    log.error({ err: { message: err.message, stack: err.stack, name: err.name }, ...context }, message);
  } else {
    log.error({ err: String(err), ...context }, message);
  }
}
