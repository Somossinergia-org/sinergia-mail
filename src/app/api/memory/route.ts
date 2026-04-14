import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc, sql, or, isNull } from "drizzle-orm";
import { addSource, searchMemory } from "@/lib/memory";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/memory" });

/**
 * GET  /api/memory?q=...&kind=...&limit=...
 *   - with q       → semantic search
 *   - without q    → recent sources list
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = req.nextUrl;
  const q = url.searchParams.get("q")?.trim();
  const kind = url.searchParams.get("kind") || undefined;
  const starredOnly = url.searchParams.get("starred") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const accountIdRaw = url.searchParams.get("accountId");
  const accountId =
    accountIdRaw && accountIdRaw !== "all" && Number.isFinite(Number(accountIdRaw))
      ? Number(accountIdRaw)
      : null;

  try {
    if (q) {
      const results = await searchMemory(session.user.id, q, { limit, kind, accountId });
      return NextResponse.json({ mode: "search", query: q, count: results.length, sources: results });
    }

    // Plain list
    const conds = [eq(schema.memorySources.userId, session.user.id)];
    if (kind) conds.push(eq(schema.memorySources.kind, kind));
    if (starredOnly) conds.push(eq(schema.memorySources.starred, true));
    // Filtro por cuenta: acepta también notas manuales (account_id NULL)
    if (accountId !== null) {
      conds.push(
        or(
          eq(schema.memorySources.accountId, accountId),
          isNull(schema.memorySources.accountId),
        )!,
      );
    }

    const rows = await db.query.memorySources.findMany({
      where: and(...conds),
      orderBy: [desc(schema.memorySources.starred), desc(schema.memorySources.createdAt)],
      limit,
      columns: {
        id: true,
        kind: true,
        title: true,
        content: true,
        metadata: true,
        sourceRefId: true,
        starred: true,
        createdAt: true,
        tags: true,
      },
    });
    const statsConds = [eq(schema.memorySources.userId, session.user.id)];
    if (accountId !== null) {
      statsConds.push(
        or(
          eq(schema.memorySources.accountId, accountId),
          isNull(schema.memorySources.accountId),
        )!,
      );
    }
    const stats = await db
      .select({
        kind: schema.memorySources.kind,
        count: sql<number>`count(*)`,
      })
      .from(schema.memorySources)
      .where(and(...statsConds))
      .groupBy(schema.memorySources.kind);

    return NextResponse.json({
      mode: "list",
      count: rows.length,
      sources: rows,
      stats: stats.map((s) => ({ kind: s.kind, count: Number(s.count) })),
    });
  } catch (e) {
    logError(log, e, {}, "memory GET failed");
    return NextResponse.json({ error: "Error consultando memoria" }, { status: 500 });
  }
}

/** POST /api/memory — create new source */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      title?: string;
      content?: string;
      kind?: string;
      tags?: string[];
    };
    if (!body.title || !body.content) {
      return NextResponse.json({ error: "title y content requeridos" }, { status: 400 });
    }
    const kind = body.kind || "note";
    const { ids, chunked } = await addSource({
      userId: session.user.id,
      kind: kind as "note" | "pdf" | "url" | "email" | "invoice" | "contact",
      title: body.title,
      content: body.content,
      tags: body.tags,
    });
    return NextResponse.json({ ok: true, ids, chunks: ids.length, chunked });
  } catch (e) {
    logError(log, e, {}, "memory POST failed");
    return NextResponse.json({ error: "Error guardando" }, { status: 500 });
  }
}

/** PATCH — toggle starred */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = (await req.json()) as { id?: number; starred?: boolean };
  if (!body.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await db
    .update(schema.memorySources)
    .set({ starred: body.starred === true, updatedAt: new Date() })
    .where(and(eq(schema.memorySources.id, body.id), eq(schema.memorySources.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}

/** DELETE ?id=N */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const deleted = await db
    .delete(schema.memorySources)
    .where(and(eq(schema.memorySources.id, id), eq(schema.memorySources.userId, session.user.id)))
    .returning({ id: schema.memorySources.id });
  return NextResponse.json({ ok: true, deleted: deleted.length });
}
