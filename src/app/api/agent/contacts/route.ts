import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, ilike, desc, sql, gte } from "drizzle-orm";

/** GET /api/agent/contacts — List contacts with filters */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = req.nextUrl;
  const search = url.searchParams.get("search");
  const category = url.searchParams.get("category");
  const sort = url.searchParams.get("sort") || "emailCount"; // emailCount, createdAt, lastEmailDate
  const order = url.searchParams.get("order") || "desc";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [eq(schema.contacts.userId, session.user.id)];

  if (search) {
    conditions.push(
      sql`(${ilike(schema.contacts.name, `%${search}%`)} OR ${ilike(schema.contacts.email, `%${search}%`)} OR ${ilike(schema.contacts.company, `%${search}%`)})`
    );
  }

  if (category) {
    conditions.push(eq(schema.contacts.category, category));
  }

  const where = and(...conditions);

  // Build sort
  let orderBy;
  if (sort === "emailCount") {
    orderBy = order === "asc" ? schema.contacts.emailCount : desc(schema.contacts.emailCount);
  } else if (sort === "lastEmailDate") {
    orderBy = order === "asc" ? schema.contacts.lastEmailDate : desc(schema.contacts.lastEmailDate);
  } else {
    orderBy = order === "asc" ? schema.contacts.createdAt : desc(schema.contacts.createdAt);
  }

  const [contacts, countResult] = await Promise.all([
    db.query.contacts.findMany({
      where,
      orderBy,
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.contacts)
      .where(where),
  ]);

  // Category stats
  const stats = await db
    .select({
      category: schema.contacts.category,
      count: sql<number>`count(*)`,
    })
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, session.user.id))
    .groupBy(schema.contacts.category);

  return NextResponse.json({
    contacts,
    pagination: {
      page,
      limit,
      total: Number(countResult[0]?.count || 0),
      totalPages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
    },
    stats: {
      byCategory: stats.map((s) => ({ ...s, count: Number(s.count) || 0 })),
    },
  });
}

/** POST /api/agent/contacts — Extract contacts from emails and upsert */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const startTime = Date.now();

  try {
    // Get all unique email addresses from emails table
    const emailsData = await db
      .select({
        fromEmail: schema.emails.fromEmail,
        fromName: schema.emails.fromName,
        category: schema.emails.category,
        date: schema.emails.date,
      })
      .from(schema.emails)
      .where(eq(schema.emails.userId, userId))
      .orderBy(desc(schema.emails.date));

    // Group by email address
    const contactMap = new Map<
      string,
      {
        email: string;
        name: string | null;
        categories: string[];
        dates: (Date | null)[];
        emailCount: number;
      }
    >();

    for (const email of emailsData) {
      if (!email.fromEmail) continue;

      const key = email.fromEmail.toLowerCase();
      if (!contactMap.has(key)) {
        contactMap.set(key, {
          email: email.fromEmail,
          name: email.fromName || null,
          categories: [],
          dates: [],
          emailCount: 0,
        });
      }

      const contact = contactMap.get(key)!;
      contact.emailCount++;
      if (email.category) contact.categories.push(email.category);
      contact.dates.push(email.date);
    }

    // For each contact, get invoices and determine final category
    let processed = 0;
    let created = 0;
    let updated = 0;

    const contactEntries = Array.from(contactMap.entries());
    for (const [, contactData] of contactEntries) {
      processed++;

      // Find most common category
      const categoryCount: { [key: string]: number } = {};
      for (const cat of contactData.categories) {
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      }
      const mostCommonCategory =
        Object.entries(categoryCount).sort(([, a], [, b]) => b - a)[0]?.[0] || "OTRO";

      // Get invoices for this issuer (match by issuerNif)
      const invoices = await db.query.invoices.findMany({
        where: and(
          eq(schema.invoices.userId, userId),
          // Try to match by email or issuer name - since we don't have issuerEmail in schema
          // We'll match on issuerName being similar to fromName
          sql`${schema.invoices.issuerName} ILIKE ${"%" + (contactData.name || contactData.email) + "%"}`
        ),
      });

      const totalInvoiced =
        invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0) || 0;

      // Find latest email date
      const lastEmailDate = contactData.dates
        .filter((d: Date | null): d is Date => d !== null)
        .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] || null;

      // Check if contact exists
      const existing = await db.query.contacts.findFirst({
        where: and(
          eq(schema.contacts.userId, userId),
          eq(schema.contacts.email, contactData.email)
        ),
      });

      if (existing) {
        // Update
        await db
          .update(schema.contacts)
          .set({
            name: contactData.name,
            category: mostCommonCategory,
            emailCount: contactData.emailCount,
            lastEmailDate,
            totalInvoiced,
            updatedAt: new Date(),
          })
          .where(eq(schema.contacts.id, existing.id));
        updated++;
      } else {
        // Insert
        await db.insert(schema.contacts).values({
          userId,
          email: contactData.email,
          name: contactData.name,
          category: mostCommonCategory,
          emailCount: contactData.emailCount,
          lastEmailDate,
          totalInvoiced,
        });
        created++;
      }
    }

    // Log
    await db.insert(schema.agentLogs).values({
      userId,
      action: "contacts",
      inputSummary: `Extracted contacts from ${emailsData.length} emails`,
      outputSummary: `${processed} contacts processed, ${created} created, ${updated} updated`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({
      processed,
      created,
      updated,
      total: contactMap.size,
    });
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "contacts",
      inputSummary: "Extract contacts batch",
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error extrayendo contactos" },
      { status: 500 }
    );
  }
}

/** DELETE /api/agent/contacts?id=N — Delete a contact */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = req.nextUrl;
  const contactId = url.searchParams.get("id");

  if (!contactId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  try {
    const id = parseInt(contactId);

    // Verify ownership
    const contact = await db.query.contacts.findFirst({
      where: and(
        eq(schema.contacts.id, id),
        eq(schema.contacts.userId, session.user.id)
      ),
    });

    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    // Delete
    await db.delete(schema.contacts).where(eq(schema.contacts.id, id));

    return NextResponse.json({ success: true, deletedId: id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error eliminando contacto" },
      { status: 500 }
    );
  }
}
