/**
 * Shared formatting utilities — Somos Sinergia
 *
 * Single source of truth for number/currency formatting.
 * Import from "@/lib/format" instead of defining local copies.
 */

/**
 * Format a number as EUR string (e.g., "1.234,56").
 * Handles unknown/null/undefined/NaN gracefully, returning "0,00".
 */
export const fmtEur = (n: unknown): string =>
  Number(n || 0).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
