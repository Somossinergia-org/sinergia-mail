/**
 * Timing-safe string comparison for HMAC, Bearer tokens, secrets.
 *
 * SECURITY: comparar secretos con `a === b` permite timing attacks
 * (un atacante mide el tiempo de respuesta para deducir caracteres
 * uno a uno). `crypto.timingSafeEqual` siempre tarda lo mismo.
 *
 * Devuelve `false` si las strings tienen longitud distinta sin lanzar.
 */
import { timingSafeEqual } from "crypto";

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  // Buffers de la misma longitud requeridos por timingSafeEqual
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Compara un Authorization Bearer header contra un secreto esperado.
 * Aplica timing-safe automáticamente.
 */
export function safeBearer(authHeader: string | null | undefined, expectedSecret: string | undefined): boolean {
  if (!expectedSecret || !authHeader) return false;
  const expected = `Bearer ${expectedSecret}`;
  return safeEqual(authHeader, expected);
}
