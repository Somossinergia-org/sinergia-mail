import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, or, ilike, gte, lte, desc, sql } from "drizzle-orm";

/**
 * GET /api/search — universal search across emails, invoices, contacts,
 * issued invoices.
 *
 * Query params:
 *   q            text query (matches subject/issuer/name/email)
 *   types        comma-separated: emails,invoices,contacts,issued
 *                (default: all)
 *   from         YYYY-MM-DD
 *   to           YYYY-MM-DD
 *   amountMin    number (filters invoices/issued)
 *   amountMax    number
 *   limit        per-source limit (default 5)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;
  const url = req.nextUrl;
  const q = (url.searchParams.get("q") || "").trim();
  const typesParam = url.searchParams.get("types") || "emails,invoices,contacts,issued";
  const types = new Set(typesParam.split(",").map((t) => t.trim()));
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const amountMin = parseFloat(url.searchParams.get("amountMin") || "");
  const amountMax = parseFloat(url.searchParams.get("amountMax") || "");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "5"), 20);

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const ilikeQ = `%${q}%`;

  // Run all sources in parallel
  const promises: Promise<unknown>[] = [];
  const labels: string[] = [];

  if (types.has("emails")) {
    labels.push("emails");
    const conds = [eq(schema.emails.userId, userId)];
    if (q) {
      conds.push(
        sql`(${ilike(schema.emails.subject, ilikeQ)} OR ${ilike(schema.emails.fromName, ilikeQ)} OR ${ilike(schema.emails.fromEmail, ilikeQ)})`,
      );
    }
    if (fromDate) conds.push(gte(schema.emails.date, fromDate));
    if (toDate) conds.push(lte(schema.emails.date, toDate));
    promises.push(
      db.query.emails.findMany({
        where: and(...conds),
        orderBy: [desc(schema.emails.date)],
        limit,
        columns: { id: true, fromName: true, fromEmail: true, subject: true, date: true, category: true, isRead: true },
      }),
    );
  }

  if (types.has("invoices")) {
    labels.push("invoices");
    const conds = [eq(schema.invoices.userId, userId)];
    if (q) {
      conds.push(
        sql`(${ilike(schema.invoices.issuerName, ilikeQ)} OR ${ilike(schema.invoices.invoiceNumber, ilikeQ)} OR ${ilike(schema.invoices.concept, ilikeQ)})`,
      );
    }
    if (fromDate) conds.push(gte(schema.invoices.invoiceDate, fromDate));
    if (toDate) conds.push(lte(schema.invoices.invoiceDate, toDate));
    if (Number.isFinite(amountMin)) conds.push(sql`${schema.invoices.totalAmount} >= ${amountMin}`);
    if (Number.isFinite(amountMax)) conds.push(sql`${schema.invoices.totalAmount} <= ${amountMax}`);
    promises.push(
      db.query.invoices.findMany({
        where: and(...conds),
        orderBy: [desc(schema.invoices.invoiceDate)],
        limit,
        columns: { id: true, issuerName: true, invoiceNumber: true, totalAmount: true, invoiceDate: true, category: true },
      }),
    );
  }

  if (types.has("contacts")) {
    labels.push("contacts");
    const conds = [eq(schema.contacts.userId, userId)];
    if (q) {
      conds.push(
        sql`(${ilike(schema.contacts.name, ilikeQ)} OR ${ilike(schema.contacts.email, ilikeQ)} OR ${ilike(schema.contacts.company, ilikeQ)})`,
      );
    }
    promises.push(
      db.query.contacts.findMany({
        where: and(...conds),
        orderBy: [desc(schema.contacts.emailCount)],
        limit,
        columns: { id: true, name: true, email: true, company: true, category: true, emailCount: true, totalInvoiced: true },
      }),
    );
  }

  if (types.has("issued")) {
    labels.push("issued");
    const conds = [eq(schema.issuedInvoices.userId, userId)];
    if (q) {
      conds.push(
        sql`(${ilike(schema.issuedInvoices.clientName, ilikeQ)} OR ${ilike(schema.issuedInvoices.number, ilikeQ)} OR ${ilike(schema.issuedInvoices.clientNif, ilikeQ)})`,
      );
    }
    if (fromDate) conds.push(gte(schema.issuedInvoices.issueDate, fromDate));
    if (toDate) conds.push(lte(schema.issuedInvoices.issueDate, toDate));
    if (Number.isFinite(amountMin)) conds.push(sql`${schema.issuedInvoices.total} >= ${amountMin}`);
    if (Number.isFinite(amountMax)) conds.push(sql`${schema.issuedInvoices.total} <= ${amountMax}`);
    promises.push(
      db.query.issuedInvoices.findMany({
        where: and(...conds),
        orderBy: [desc(schema.issuedInvoices.issueDate)],
        limit,
        columns: { id: true, number: true, clientName: true, clientNif: true, total: true, issueDate: true, status: true },
      }),
    );
  }

  const results = await Promise.all(promises);
  const groups: Record<string, unknown> = {};
  labels.forEach((label, i) => {
    groups[label] = results[i];
  });

  return NextResponse.json({
    query: q,
    filters: { from, to, amountMin: Number.isFinite(amountMin) ? amountMin : null, amountMax: Number.isFinite(amountMax) ? amountMax : null },
    groups,
    totals: {
      emails: (groups.emails as unknown[] | undefined)?.length || 0,
      invoices: (groups.invoices as unknown[] | undefined)?.length || 0,
      contacts: (groups.contacts as unknown[] | undefined)?.length || 0,
      issued: (groups.issued as unknown[] | undefined)?.length || 0,
    },
  });
}
