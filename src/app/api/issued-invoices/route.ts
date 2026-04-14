import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/issued-invoices" });

interface ConceptInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

/** GET — list issued invoices for current user */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rows = await db.query.issuedInvoices.findMany({
    where: eq(schema.issuedInvoices.userId, session.user.id),
    orderBy: [desc(schema.issuedInvoices.issueDate)],
  });

  const totals = await db
    .select({
      count: sql<number>`count(*)`,
      subtotal: sql<number>`COALESCE(SUM(subtotal), 0)`,
      tax: sql<number>`COALESCE(SUM(tax), 0)`,
      total: sql<number>`COALESCE(SUM(total), 0)`,
    })
    .from(schema.issuedInvoices)
    .where(eq(schema.issuedInvoices.userId, session.user.id));

  return NextResponse.json({
    invoices: rows,
    totals: {
      count: Number(totals[0]?.count || 0),
      subtotal: Number(totals[0]?.subtotal || 0),
      tax: Number(totals[0]?.tax || 0),
      total: Number(totals[0]?.total || 0),
    },
  });
}

/** POST — create new issued invoice (auto-numbered) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;

  try {
    const body = (await req.json()) as {
      clientName: string;
      clientNif?: string;
      clientAddress?: string;
      clientEmail?: string;
      issueDate?: string;
      dueDate?: string;
      concepts: ConceptInput[];
      notes?: string;
    };

    if (!body.clientName || !Array.isArray(body.concepts) || body.concepts.length === 0) {
      return NextResponse.json({ error: "clientName y concepts requeridos" }, { status: 400 });
    }

    // Calculate totals
    let subtotal = 0;
    let tax = 0;
    for (const c of body.concepts) {
      const line = Number(c.quantity) * Number(c.unitPrice);
      subtotal += line;
      tax += line * (Number(c.taxRate) / 100);
    }
    const total = subtotal + tax;

    // Generate number: SINERGIA-YYYY-NNNN
    const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();
    const year = issueDate.getFullYear();

    const last = await db
      .select({ maxSeq: sql<number>`COALESCE(MAX(sequence), 0)` })
      .from(schema.issuedInvoices)
      .where(and(eq(schema.issuedInvoices.userId, userId), eq(schema.issuedInvoices.year, year)));
    const sequence = Number(last[0]?.maxSeq || 0) + 1;
    const number = `SINERGIA-${year}-${String(sequence).padStart(4, "0")}`;

    const [inserted] = await db
      .insert(schema.issuedInvoices)
      .values({
        userId,
        number,
        series: "SINERGIA",
        year,
        sequence,
        clientName: body.clientName,
        clientNif: body.clientNif || null,
        clientAddress: body.clientAddress || null,
        clientEmail: body.clientEmail || null,
        issueDate,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        concepts: body.concepts,
        subtotal,
        tax,
        total,
        notes: body.notes || null,
      })
      .returning();

    log.info({ userId, invoiceId: inserted.id, number }, "issued invoice created");
    return NextResponse.json({ invoice: inserted });
  } catch (e) {
    logError(log, e, { userId }, "failed to create issued invoice");
    return NextResponse.json({ error: "Error creando factura" }, { status: 500 });
  }
}
