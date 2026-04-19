import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";

/** GET /api/visits — List visits for current user */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const filter = req.nextUrl.searchParams.get("filter") || "all";

  const conditions = [eq(schema.visits.userId, session.user.id)];

  if (filter === "today") {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
    conditions.push(gte(schema.visits.date, startOfDay));
    conditions.push(lt(schema.visits.date, endOfDay));
  } else if (filter === "completed") {
    conditions.push(eq(schema.visits.status, "completed"));
  }

  const rows = await db
    .select()
    .from(schema.visits)
    .where(and(...conditions))
    .orderBy(desc(schema.visits.date))
    .limit(200);

  return NextResponse.json(rows);
}

/** POST /api/visits — Create a new visit */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { contactName, address, phone, date, time, notes, lat, lng } = body;

  if (!contactName || !date) {
    return NextResponse.json({ error: "contactName y date son obligatorios" }, { status: 400 });
  }

  const [visit] = await db
    .insert(schema.visits)
    .values({
      userId: session.user.id,
      contactName,
      address: address || null,
      phone: phone || null,
      date: new Date(date),
      time: time || null,
      notes: notes || null,
      lat: lat ?? null,
      lng: lng ?? null,
      status: "scheduled",
    })
    .returning();

  return NextResponse.json(visit, { status: 201 });
}

/** PATCH /api/visits — Update visit status (check-in, check-out, complete, cancel) */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { id, action } = body as { id: number; action: string };

  if (!id || !action) {
    return NextResponse.json({ error: "id y action son obligatorios" }, { status: 400 });
  }

  // Verify ownership
  const [existing] = await db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.id, id), eq(schema.visits.userId, session.user.id)));

  if (!existing) {
    return NextResponse.json({ error: "Visita no encontrada" }, { status: 404 });
  }

  const now = new Date();
  let updateData: Record<string, unknown> = { updatedAt: now };

  switch (action) {
    case "check_in":
      updateData.status = "in_progress";
      updateData.checkInAt = now;
      break;
    case "check_out":
    case "complete":
      updateData.status = "completed";
      updateData.checkOutAt = now;
      break;
    case "cancel":
      updateData.status = "cancelled";
      break;
    default:
      return NextResponse.json({ error: `Accion no valida: ${action}` }, { status: 400 });
  }

  const [updated] = await db
    .update(schema.visits)
    .set(updateData)
    .where(eq(schema.visits.id, id))
    .returning();

  return NextResponse.json(updated);
}
