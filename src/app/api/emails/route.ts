import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc, like, sql, ilike } from "drizzle-orm";

/** GET /api/emails — List emails with filters */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = req.nextUrl;
  const category = url.searchParams.get("category");
  const priority = url.searchParams.get("priority");
  const search = url.searchParams.get("search");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [eq(schema.emails.userId, session.user.id)];

  if (category) {
    conditions.push(eq(schema.emails.category, category));
  }
  if (priority) {
    conditions.push(eq(schema.emails.priority, priority));
  }
  if (search) {
    conditions.push(
      sql`(${ilike(schema.emails.subject, `%${search}%`)} OR ${ilike(schema.emails.fromEmail, `%${search}%`)} OR ${ilike(schema.emails.fromName, `%${search}%`)})`
    );
  }

  const where = and(...conditions);

  const [emails, countResult] = await Promise.all([
    db.query.emails.findMany({
      where,
      orderBy: [desc(schema.emails.date)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails)
      .where(where),
  ]);

  // Category stats
  const stats = await db
    .select({
      category: schema.emails.category,
      count: sql<number>`count(*)`,
    })
    .from(schema.emails)
    .where(eq(schema.emails.userId, session.user.id))
    .groupBy(schema.emails.category);

  // Priority stats
  const priorityStats = await db
    .select({
      priority: schema.emails.priority,
      count: sql<number>`count(*)`,
    })
    .from(schema.emails)
    .where(eq(schema.emails.userId, session.user.id))
    .groupBy(schema.emails.priority);

  return NextResponse.json({
    emails,
    pagination: {
      page,
      limit,
      total: Number(countResult[0]?.count || 0),
      totalPages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
    },
    stats: {
      byCategory: stats,
      byPriority: priorityStats,
    },
  });
}
