import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listUpcomingEvents, createEvent } from "@/lib/calendar";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const days = Number(req.nextUrl.searchParams.get("days") || "14");
    const events = await listUpcomingEvents(session.user.id, days);
    return NextResponse.json({ events });
  } catch (e) {
    console.error("[calendar] GET error:", e);
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg, events: [] }, { status: msg.includes("No Google") ? 403 : 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await req.json();
    const result = await createEvent(session.user.id, {
      summary: body.summary,
      description: body.description,
      startISO: body.startISO,
      endISO: body.endISO,
      durationMin: body.durationMin,
      location: body.location,
      withMeet: body.withMeet,
    });
    return NextResponse.json({ success: true, event: result });
  } catch (e) {
    console.error("[calendar] POST error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
