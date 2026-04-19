import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { emailSequences, sequenceSteps, sequenceEnrollments } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET — listar secuencias del usuario
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sequences = await db.select().from(emailSequences)
    .where(eq(emailSequences.userId, session.user.id))
    .orderBy(desc(emailSequences.createdAt));

  // Load steps for each sequence
  const result = await Promise.all(sequences.map(async (seq) => {
    const steps = await db.select().from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, seq.id))
      .orderBy(sequenceSteps.stepOrder);
    const enrolled = await db.select().from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, seq.id));
    return { ...seq, steps, enrollments: enrolled };
  }));

  return NextResponse.json(result);
}

// POST — crear nueva secuencia
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { name, description, trigger, steps } = body;

  if (!name || !steps?.length) return NextResponse.json({ error: "Nombre y al menos un paso requeridos" }, { status: 400 });

  const [seq] = await db.insert(emailSequences).values({
    userId: session.user.id,
    name,
    description: description || null,
    trigger: trigger || "manual",
  }).returning();

  // Insert steps
  for (let i = 0; i < steps.length; i++) {
    await db.insert(sequenceSteps).values({
      sequenceId: seq.id,
      stepOrder: i + 1,
      waitDays: steps[i].waitDays || 1,
      subject: steps[i].subject,
      body: steps[i].body,
      condition: steps[i].condition || null,
    });
  }

  return NextResponse.json({ success: true, sequence: seq });
}

// PUT — actualizar secuencia (activar/desactivar)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id, active, name, description } = await req.json();
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (active !== undefined) updates.active = active;
  if (name) updates.name = name;
  if (description !== undefined) updates.description = description;

  await db.update(emailSequences)
    .set(updates)
    .where(and(eq(emailSequences.id, id), eq(emailSequences.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
