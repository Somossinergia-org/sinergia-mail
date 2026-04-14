/**
 * Helpers para filtrar consultas por cuenta Gmail cuando el selector del
 * sidebar tiene una cuenta concreta seleccionada.
 *
 * - parseAccountId(req): lee ?accountId=N o "all"/vacío → null o number.
 * - invoiceEmailIdsForAccount(userId, accountId): IDs de emails de esa
 *   cuenta, usados para filtrar invoices (que no tienen account_id propio).
 */
import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

export function parseAccountId(req: NextRequest | Request): number | null {
  const url = req instanceof NextRequest ? req.nextUrl : new URL(req.url);
  const raw = url.searchParams.get("accountId");
  if (!raw || raw === "all") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Devuelve los IDs de emails del usuario que pertenecen a `accountId`.
 * Vacío = la cuenta no existe o no tiene emails sincronizados.
 */
export async function emailIdsForAccount(
  userId: string,
  accountId: number,
): Promise<number[]> {
  const rows = await db
    .select({ id: schema.emails.id })
    .from(schema.emails)
    .where(
      and(
        eq(schema.emails.userId, userId),
        eq(schema.emails.accountId, accountId),
      ),
    );
  return rows.map((r) => r.id);
}
