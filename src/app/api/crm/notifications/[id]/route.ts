import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  updateNotificationStatus,
  NOTIFICATION_STATUSES,
  type NotificationStatus,
} from "@/lib/crm/notifications";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/notifications/[id]
 * Body: { status: "seen" | "dismissed" | "resolved" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const notifId = parseInt(params.id, 10);
  if (!notifId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { status } = body;

    if (!status || !NOTIFICATION_STATUSES.includes(status as NotificationStatus)) {
      return NextResponse.json(
        { error: `Estado no válido. Usa: ${NOTIFICATION_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const updated = await updateNotificationStatus(notifId, session.user.id, status as NotificationStatus);
    if (!updated) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ notification: updated });
  } catch (err) {
    console.error("[CRM] notification PATCH error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
