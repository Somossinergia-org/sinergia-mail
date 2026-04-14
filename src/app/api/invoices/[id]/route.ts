import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { invoiceNormalizedFields } from "@/lib/text/normalize";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/invoices/[id]" });

/** GET /api/invoices/[id] — full invoice detail */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const inv = await db.query.invoices.findFirst({
    where: and(eq(schema.invoices.id, id), eq(schema.invoices.userId, session.user.id)),
  });
  if (!inv) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  return NextResponse.json({
    invoice: {
      ...inv,
      amount: Number(inv.amount) || 0,
      tax: Number(inv.tax) || 0,
      totalAmount: Number(inv.totalAmount) || 0,
      hasPdf: Boolean(inv.pdfGmailAttachmentId && inv.emailId),
    },
  });
}

/** PATCH /api/invoices/[id] — edit fields */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const body = (await req.json()) as Partial<{
      invoiceNumber: string | null;
      issuerName: string | null;
      issuerNif: string | null;
      concept: string | null;
      amount: number | null;
      tax: number | null;
      totalAmount: number | null;
      invoiceDate: string | null;
      dueDate: string | null;
      category: string | null;
    }>;

    const patch: Record<string, unknown> = {};
    const stringFields = ["invoiceNumber", "issuerName", "issuerNif", "concept", "category"] as const;
    for (const k of stringFields) if (k in body) patch[k] = body[k];
    const numberFields = ["amount", "tax", "totalAmount"] as const;
    for (const k of numberFields) if (k in body) patch[k] = body[k];
    if ("invoiceDate" in body) patch.invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : null;
    if ("dueDate" in body) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    if (body.issuerName !== undefined || body.issuerNif !== undefined) {
      const norm = invoiceNormalizedFields(
        body.issuerName ?? null,
        body.issuerNif ?? null,
      );
      patch.issuerNormalized = norm.issuerNormalized;
      patch.nifNormalized = norm.nifNormalized;
    }

    const [updated] = await db
      .update(schema.invoices)
      .set(patch)
      .where(and(eq(schema.invoices.id, id), eq(schema.invoices.userId, session.user.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, invoice: updated });
  } catch (e) {
    logError(log, e, { invoiceId: id }, "invoice PATCH failed");
    return NextResponse.json({ error: "Error actualizando" }, { status: 500 });
  }
}

/** DELETE /api/invoices/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const deleted = await db
    .delete(schema.invoices)
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.userId, session.user.id)))
    .returning({ id: schema.invoices.id });

  if (deleted.length === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: deleted[0].id });
}
