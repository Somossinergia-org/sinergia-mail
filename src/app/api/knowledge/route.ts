import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  seedKnowledgeBase,
  addKnowledge,
  searchKnowledge,
  listKnowledge,
  deleteKnowledge,
  getKnowledgeStats,
} from "@/lib/knowledge/base";

/* ------------------------------------------------------------------ */
/*  GET /api/knowledge — list all entries + stats                      */
/* ------------------------------------------------------------------ */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const [entries, stats] = await Promise.all([
      listKnowledge(session.user.id),
      getKnowledgeStats(session.user.id),
    ]);
    return NextResponse.json({ entries, stats });
  } catch (err) {
    console.error("GET /api/knowledge error:", err);
    return NextResponse.json(
      { error: "Error al obtener conocimiento" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/knowledge — seed | add | search                         */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "seed": {
        const result = await seedKnowledgeBase(session.user.id);
        return NextResponse.json(result);
      }

      case "add": {
        const { title, content, tags } = body;
        if (!title || !content) {
          return NextResponse.json(
            { error: "Titulo y contenido son obligatorios" },
            { status: 400 },
          );
        }
        const parsedTags = typeof tags === "string"
          ? tags.split(",").map((t: string) => t.trim()).filter(Boolean)
          : Array.isArray(tags) ? tags : [];
        const result = await addKnowledge(
          session.user.id,
          title,
          content,
          parsedTags,
        );
        return NextResponse.json(result);
      }

      case "search": {
        const { query } = body;
        if (!query) {
          return NextResponse.json(
            { error: "Query es obligatorio" },
            { status: 400 },
          );
        }
        const results = await searchKnowledge(
          session.user.id,
          query,
          body.limit || 5,
        );
        return NextResponse.json({ results });
      }

      default:
        return NextResponse.json(
          { error: `Accion desconocida: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("POST /api/knowledge error:", err);
    return NextResponse.json(
      { error: "Error procesando la solicitud" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/knowledge?id=N — remove a knowledge entry              */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id || isNaN(Number(id))) {
    return NextResponse.json(
      { error: "ID invalido" },
      { status: 400 },
    );
  }

  try {
    await deleteKnowledge(session.user.id, Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/knowledge error:", err);
    return NextResponse.json(
      { error: "Error al eliminar" },
      { status: 500 },
    );
  }
}
