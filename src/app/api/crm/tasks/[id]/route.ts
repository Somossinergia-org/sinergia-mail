import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  updateTask,
  updateTaskStatus,
  TASK_STATUSES,
  type TaskStatus,
} from "@/lib/crm/commercial-tasks";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/tasks/[id]
 * Body: { status?, title?, description?, priority?, dueAt? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const taskId = parseInt(params.id, 10);
  if (!taskId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { status, title, description, priority, dueAt } = body;

    // Quick status-only update
    if (status && !title && !description && !priority && dueAt === undefined) {
      if (!TASK_STATUSES.includes(status as TaskStatus)) {
        return NextResponse.json({ error: `Estado no válido. Usa: ${TASK_STATUSES.join(", ")}` }, { status: 400 });
      }
      const updated = await updateTaskStatus(taskId, session.user.id, status as TaskStatus);
      if (!updated) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
      return NextResponse.json({ task: updated });
    }

    // Full update
    const updated = await updateTask(taskId, session.user.id, {
      ...(status && { status: status as TaskStatus }),
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(priority && { priority }),
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
    });

    if (!updated) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    return NextResponse.json({ task: updated });
  } catch (err) {
    console.error("[CRM] tasks PATCH error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
