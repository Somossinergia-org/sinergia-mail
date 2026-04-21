import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listNotifications,
  listNewNotifications,
  listUrgentNotifications,
  listCompanyNotifications,
  getNotificationSummary,
  markAllSeen,
  type NotificationType,
  type NotificationSeverity,
  type NotificationStatus,
} from "@/lib/crm/notifications";
import { executeNotificationRules, type NotificationRulesConfig } from "@/lib/crm/notification-rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/notifications
 * Query: view=list|new|urgent|company|summary
 *        type?, severity?, status?, companyId?, limit?
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userId = session.user.id;
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "list";

  try {
    if (view === "summary") {
      const summary = await getNotificationSummary(userId);
      return NextResponse.json({ summary });
    }

    if (view === "new") {
      const limit = parseInt(sp.get("limit") || "50", 10);
      const notifications = await listNewNotifications(userId, limit);
      return NextResponse.json({ notifications });
    }

    if (view === "urgent") {
      const limit = parseInt(sp.get("limit") || "20", 10);
      const notifications = await listUrgentNotifications(userId, limit);
      return NextResponse.json({ notifications });
    }

    if (view === "company") {
      const companyId = parseInt(sp.get("companyId") || "0", 10);
      if (!companyId) return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
      const limit = parseInt(sp.get("limit") || "20", 10);
      const notifications = await listCompanyNotifications(userId, companyId, limit);
      return NextResponse.json({ notifications });
    }

    // Default: list with optional filters
    const opts: {
      status?: NotificationStatus;
      type?: NotificationType;
      severity?: NotificationSeverity;
      companyId?: number;
      limit?: number;
    } = {};
    if (sp.get("status")) opts.status = sp.get("status") as NotificationStatus;
    if (sp.get("type")) opts.type = sp.get("type") as NotificationType;
    if (sp.get("severity")) opts.severity = sp.get("severity") as NotificationSeverity;
    if (sp.get("companyId")) opts.companyId = parseInt(sp.get("companyId")!, 10);
    opts.limit = parseInt(sp.get("limit") || "50", 10);

    const notifications = await listNotifications(userId, opts);
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("[CRM] notifications GET error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/crm/notifications
 * Body: { action: "generate" | "mark_all_seen", config?: Partial<NotificationRulesConfig> }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await req.json();
    const { action, config } = body;

    if (action === "generate") {
      const result = await executeNotificationRules(userId, config as Partial<NotificationRulesConfig>);
      return NextResponse.json({ result });
    }

    if (action === "mark_all_seen") {
      const updated = await markAllSeen(userId);
      return NextResponse.json({ updated: updated.length });
    }

    return NextResponse.json({ error: "Acción no válida. Usa: generate, mark_all_seen" }, { status: 400 });
  } catch (err) {
    console.error("[CRM] notifications POST error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
