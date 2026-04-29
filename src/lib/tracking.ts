/**
 * Tracking — HMAC token utilities for email open tracking.
 *
 * Uso:
 *   const token = computeOpenToken(msgId);
 *   // genera URL: /api/track/open?msg=ID&t=TOKEN
 *
 *   const ok = verifyOpenToken(msgId, providedToken);
 *
 * El secret es TRACKING_SECRET (preferido) o CRON_SECRET (fallback).
 * Si ninguno está configurado, usa fallback constante (degraded mode — los
 * tokens son predecibles pero el endpoint sigue funcional).
 *
 * Token format: 12 chars hex (48 bits). Suficiente para evitar fuerza bruta
 * razonable en un endpoint sin valor financiero.
 */
import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_LENGTH = 12;

function getSecret(): string {
  return (
    process.env.TRACKING_SECRET ||
    process.env.CRON_SECRET ||
    "fallback-tracking-secret"
  );
}

export function computeOpenToken(msgId: number | string): string {
  const h = createHmac("sha256", getSecret());
  h.update(String(msgId));
  return h.digest("hex").slice(0, TOKEN_LENGTH);
}

export function verifyOpenToken(msgId: number | string, providedToken: string): boolean {
  if (!providedToken || providedToken.length !== TOKEN_LENGTH) return false;
  const expected = computeOpenToken(msgId);
  try {
    return timingSafeEqual(Buffer.from(providedToken), Buffer.from(expected));
  } catch {
    return false;
  }
}

// GIF transparente 1×1 (43 bytes). Estándar de la industria para email
// tracking. Lo usa /api/track/open como respuesta.
export const TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);
