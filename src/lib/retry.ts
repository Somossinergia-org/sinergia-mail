/**
 * Exponential backoff retry helper para llamadas externas críticas.
 *
 * Uso:
 *   const result = await retryWithBackoff(
 *     () => fetch("https://api.openai.com/...").then(r => r.json()),
 *     { retries: 3, initialDelayMs: 500, label: "openai-chat" },
 *   );
 *
 * Reintenta SOLO en errores transitorios (5xx, network, timeout). 4xx no se
 * reintenta — fallaría igual la próxima vez.
 */

import { logger } from "./logger";

const log = logger.child({ component: "retry" });

export interface RetryOptions {
  retries?: number;        // default 3
  initialDelayMs?: number; // default 500
  maxDelayMs?: number;     // default 8000
  factor?: number;         // default 2 (exp backoff)
  label?: string;          // for logs
  /** Custom check: should we retry this error? */
  shouldRetry?: (err: unknown) => boolean;
}

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string };

  // HTTP status codes
  if (typeof e.status === "number") {
    // Reintentar 5xx + 408 (Request Timeout) + 429 (Rate Limited)
    return e.status >= 500 || e.status === 408 || e.status === 429;
  }

  // Network errors (Node fetch / Undici)
  const code = e.code || "";
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "UND_ERR_SOCKET" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return true;
  }

  // Mensaje contiene timeout/network keywords
  const msg = (e.message || "").toLowerCase();
  if (/timeout|network|temporarily|unavailable|503|502/.test(msg)) {
    return true;
  }

  return false;
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const initial = opts.initialDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;
  const factor = opts.factor ?? 2;
  const label = opts.label ?? "external-call";
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const willRetry = attempt < retries && shouldRetry(err);
      if (!willRetry) {
        if (attempt > 0) {
          log.warn(
            { label, attempts: attempt + 1, finalErr: (err as Error)?.message?.slice(0, 200) },
            "retry exhausted, throwing",
          );
        }
        throw err;
      }
      const delay = Math.min(initial * Math.pow(factor, attempt), max);
      // Jitter ±25% para evitar thundering herd
      const jittered = delay * (0.75 + Math.random() * 0.5);
      log.info(
        { label, attempt: attempt + 1, nextDelayMs: Math.round(jittered), errMsg: (err as Error)?.message?.slice(0, 120) },
        "retrying after transient error",
      );
      await new Promise((r) => setTimeout(r, jittered));
    }
  }
  // Unreachable, but TS exhaustiveness
  throw lastErr;
}
