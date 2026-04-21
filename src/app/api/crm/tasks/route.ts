import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createTask,
  listActiveTasks,
  listTasksByCompany,
  listTasksByOpportunity,
  getTodayTasks,
  getOverdueTasks,
  getUpcomingTasks,
  getTaskCountsSummary,
  TASK_PRIORITIES,
  TASK_SOURCES,
  type TaskPriority,
  type TaskSource,
} from "@/lib/crm/commercial-tasks";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/tasks?view=active|company|opportunity|today|overdue|upcoming|summary
 *   - companyId: required for view=company
 *   - opportunityId: required for view=opportunity
 *   - days: optional for view=upcoming
 *   - limit: optional
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const view = params.get("view") || "active";
  const limitParam = params.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  try {
    switch (view) {
      case "active": {
        const tasks = await listActiveTasks(session.user.id, limit);
        return NextResponse.json({ tasks, total: tasks.length });
      }

      case "company": {
        const companyId = parseInt(params.get("companyId") || "", 10);
        if (!companyId) return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
        const includeCompleted = params.get("includeCompleted") === "true";
        const tasks = await listTasksByCompany(companyId, session.user.id, includeCompleted, limit);
        return NextResponse.json({ tasks, total: tasks.length });
      }

      case "opportunity": {
        const oppId = parseInt(params.get("opportunityId") || "", 10);
        if (!oppId) return NextResponse.json({ error: "opportunityId requerido" }, { status: 400 });
        const tasks = await listTasksByOpportunity(oppId, session.user.id, limit);
        return NextResponse.json({ tasks, total: tasks.length });
      }

      case "today": {
        const tasks = await getTodayTasks(session.user.id);
        return NextResponse.json({ tasks, total: tasks.length });
      }

      case "overdue": {
        const tasks = await getOverdueTasks(session.user.id, limit);
        return NextResponse.json({ tasks, total: tasks.length });
      }

      case "upcoming": {
        const days = parseInt(params.get("days") || "7", 10);
        const tasks = await getUpcomingTasks(session.user.id, days, limit);
        return NextResponse.json({ tasks, total: tasks.length });
      }

      case "summary": {
        const summary = await getTaskCountsSummary(session.user.id);
        return NextResponse.json({ summary });
      }

      default:
        return NextResponse.json(
          { error: `Vista no válida: ${view}. Usa: active|company|opportunity|today|overdue|upcoming|summary` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[CRM] tasks GET error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/crm/tasks
 * Body: { title, companyId?, opportunityId?, caseId?, description?, priority?, dueAt?, source? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, companyId, opportunityId, caseId, description, priority, dueAt, source } = body;

    if (!title) {
      return NextResponse.json({ error: "title es requerido" }, { status: 400 });
    }

    if (priority && !TASK_PRIORITIES.includes(priority as TaskPriority)) {
      return NextResponse.json({ error: `Prioridad no válida. Usa: ${TASK_PRIORITIES.join(", ")}` }, { status: 400 });
    }

    if (source && !TASK_SOURCES.includes(source as TaskSource)) {
      return NextResponse.json({ error: `Source no válido. Usa: ${TASK_SOURCES.join(", ")}` }, { status: 400 });
    }

    const task = await createTask({
      userId: session.user.id,
      companyId: companyId ?? null,
      opportunityId: opportunityId ?? null,
      caseId: caseId ?? null,
      title,
      description: description ?? null,
      priority: (priority as TaskPriority) ?? "media",
      dueAt: dueAt ? new Date(dueAt) : null,
      source: (source as TaskSource) ?? "manual",
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[CRM] tasks POST error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
