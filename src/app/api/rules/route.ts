import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";

/** GET /api/rules — List all memory rules for the current user */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rules = await db.query.memoryRules.findMany({
    where: eq(schema.memoryRules.userId, session.user.id),
    orderBy: [desc(schema.memoryRules.createdAt)],
  });

  return NextResponse.json({ rules });
}

/** POST /api/rules — Create a new memory rule */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { pattern, field, action, description } = body;

  if (!pattern || !action) {
    return NextResponse.json(
      { error: "pattern y action son obligatorios" },
      { status: 400 }
    );
  }

  const validFields = ["subject", "from_email", "from_name", "body"];
  const validActions = ["TRASH", "MARK_READ", "IGNORE", "IMPORTANT"];

  if (field && !validFields.includes(field)) {
    return NextResponse.json(
      { error: `field debe ser uno de: ${validFields.join(", ")}` },
      { status: 400 }
    );
  }

  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `action debe ser uno de: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  const [rule] = await db
    .insert(schema.memoryRules)
    .values({
      userId: session.user.id,
      pattern,
      field: field || "subject",
      action,
      description: description || null,
      matchCount: 0,
      enabled: true,
    })
    .returning();

  return NextResponse.json({ rule }, { status: 201 });
}

/** PATCH /api/rules — Update a rule (toggle enabled, update fields) */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { id, enabled, pattern, field, action, description } = body;

  if (!id) {
    return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });
  }

  // Verify ownership
  const existing = await db.query.memoryRules.findFirst({
    where: and(
      eq(schema.memoryRules.id, id),
      eq(schema.memoryRules.userId, session.user.id)
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof enabled === "boolean") updates.enabled = enabled;
  if (pattern !== undefined) updates.pattern = pattern;
  if (field !== undefined) updates.field = field;
  if (action !== undefined) updates.action = action;
  if (description !== undefined) updates.description = description;

  const [updated] = await db
    .update(schema.memoryRules)
    .set(updates)
    .where(
      and(
        eq(schema.memoryRules.id, id),
        eq(schema.memoryRules.userId, session.user.id)
      )
    )
    .returning();

  return NextResponse.json({ rule: updated });
}

/** DELETE /api/rules — Delete a rule */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = req.nextUrl;
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });
  }

  const ruleId = parseInt(id);
  if (isNaN(ruleId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  // Verify ownership
  const existing = await db.query.memoryRules.findFirst({
    where: and(
      eq(schema.memoryRules.id, ruleId),
      eq(schema.memoryRules.userId, session.user.id)
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
  }

  await db
    .delete(schema.memoryRules)
    .where(
      and(
        eq(schema.memoryRules.id, ruleId),
        eq(schema.memoryRules.userId, session.user.id)
      )
    );

  return NextResponse.json({ ok: true });
}
