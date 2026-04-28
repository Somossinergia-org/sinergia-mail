import { NextResponse } from "next/server";
import { db, schema } from "@/db";

const ADMIN_EMAIL = "orihuela@somossinergia.es";

/**
 * GET /api/admin/db-inspect
 * Devuelve users + email_accounts (sin tokens).
 * Auth: Bearer AGENT_API_KEY o sesión admin.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const ok =
    !!process.env.AGENT_API_KEY &&
    authHeader === `Bearer ${process.env.AGENT_API_KEY}`;
  if (!ok) {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const users = await db.query.users.findMany({
    columns: { id: true, email: true, name: true },
  });
  const emailAccounts = await db.query.emailAccounts.findMany({
    columns: {
      id: true,
      userId: true,
      provider: true,
      email: true,
      isPrimary: true,
      enabled: true,
      lastSyncAt: true,
    },
  });

  return NextResponse.json({ users, emailAccounts });
}
