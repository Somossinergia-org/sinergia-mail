import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TOOLS_BY_NAME } from "@/lib/agent/tools";

export const maxDuration = 60;

/**
 * POST /api/invoices/[id]/drive
 * Sube esta factura al Google Drive del usuario, organizada en
 * "Sinergia Mail / Facturas YYYY / Categoría / nombre.pdf".
 *
 * Reutiliza la tool del agente (save_invoice_to_drive) para que la
 * lógica viva en un único sitio.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const tool = TOOLS_BY_NAME["save_invoice_to_drive"];
  if (!tool) return NextResponse.json({ error: "Tool no disponible" }, { status: 500 });

  const result = await tool.handler(session.user.id, { invoice_id: id });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.needsReauth ? 403 : 500 });
  }
  return NextResponse.json(result);
}
