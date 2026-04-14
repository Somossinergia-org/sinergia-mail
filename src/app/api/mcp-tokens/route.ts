import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { generateToken } from "@/lib/mcp/auth";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/mcp-tokens" });

/**
 * MCP token management — list / create / revoke.
 * Session-auth protected (user must be logged in via NextAuth).
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const tokens = await db.query.mcpTokens.findMany({
    where: eq(schema.mcpTokens.userId, session.user.id),
    orderBy: [desc(schema.mcpTokens.createdAt)],
  });

  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      revoked: t.revoked,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let name = "Untitled token";
  try {
    const body = await req.json();
    if (typeof body?.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 80);
  } catch {
    /* empty body ok */
  }

  try {
    const { plaintext, hash, prefix } = generateToken();
    await db.insert(schema.mcpTokens).values({
      userId: session.user.id,
      name,
      tokenHash: hash,
      prefix,
    });

    log.info({ userId: session.user.id, name }, "mcp token created");

    return NextResponse.json({
      name,
      prefix,
      token: plaintext, // shown ONCE, never returned again
      warning: "Copia este token ahora. No podrás verlo de nuevo. Guárdalo en tu gestor de contraseñas.",
    });
  } catch (e) {
    logError(log, e, { userId: session.user.id }, "mcp token creation failed");
    return NextResponse.json({ error: "Error creando token" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const idParam = req.nextUrl.searchParams.get("id");
  if (!idParam) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const id = Number(idParam);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  // Soft revoke
  await db
    .update(schema.mcpTokens)
    .set({ revoked: true })
    .where(and(eq(schema.mcpTokens.id, id), eq(schema.mcpTokens.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
