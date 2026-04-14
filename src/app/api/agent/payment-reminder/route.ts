import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TOOLS_BY_NAME } from "@/lib/agent/tools";

/**
 * POST /api/agent/payment-reminder — direct UI endpoint to trigger the
 * draft_payment_reminder tool without going through Gemini.
 * Body: { invoice_id: number, tone?: 'cordial' | 'formal' | 'firme' }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    invoice_id?: number;
    tone?: string;
  };
  if (!body.invoice_id) {
    return NextResponse.json({ error: "invoice_id requerido" }, { status: 400 });
  }

  const tool = TOOLS_BY_NAME["draft_payment_reminder"];
  const result = await tool.handler(session.user.id, {
    invoice_id: body.invoice_id,
    tone: body.tone || "cordial",
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
