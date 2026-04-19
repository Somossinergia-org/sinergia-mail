import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listPendingTasks, createTask } from "@/lib/tasks";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const tasks = await listPendingTasks(session.user.id);
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("[tasks] GET error:", e);
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg, tasks: [] }, { status: msg.includes("No Google") ? 403 : 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await req.json();
    const result = await createTask(session.user.id, {
      title: body.title,
      notes: body.notes,
      due: body.due,
    });
    return NextResponse.json({ success: true, task: result });
  } catch (e) {
    console.error("[tasks] POST error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
