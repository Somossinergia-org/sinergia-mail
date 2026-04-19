import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import {
  calculateContactScore,
  batchScoreAllContacts,
  predictContactBehavior,
  getScoreTrend,
} from "@/lib/scoring/engine";

/** GET /api/scoring — Get scoring data for all contacts */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const contactIdParam = req.nextUrl.searchParams.get("contactId");
  const trendDays = req.nextUrl.searchParams.get("trendDays");

  // If contactId is provided with trendDays, return trend data
  if (contactIdParam && trendDays) {
    try {
      const trend = await getScoreTrend(userId, parseInt(contactIdParam), parseInt(trendDays));
      return NextResponse.json({ trend });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  // If contactId is provided, return detailed breakdown for that contact
  if (contactIdParam) {
    try {
      const breakdown = await calculateContactScore(userId, parseInt(contactIdParam));
      return NextResponse.json({ breakdown });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  // Otherwise, return all contacts with their scores
  const contacts = await db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      email: schema.contacts.email,
      company: schema.contacts.company,
      category: schema.contacts.category,
      score: schema.contacts.score,
      scoreEmail: schema.contacts.scoreEmail,
      scoreInvoice: schema.contacts.scoreInvoice,
      scoreActivity: schema.contacts.scoreActivity,
      temperature: schema.contacts.temperature,
      priority: schema.contacts.priority,
      emailsSent: schema.contacts.emailsSent,
      emailsReceived: schema.contacts.emailsReceived,
      emailsOpened: schema.contacts.emailsOpened,
      totalInvoiced: schema.contacts.totalInvoiced,
      lastContactedAt: schema.contacts.lastContactedAt,
      updatedAt: schema.contacts.updatedAt,
    })
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, userId))
    .orderBy(desc(schema.contacts.score));

  // Calculate stats
  const hotCount = contacts.filter((c) => c.temperature === "hot").length;
  const warmCount = contacts.filter((c) => c.temperature === "warm").length;
  const coldCount = contacts.filter((c) => c.temperature === "cold").length;
  const avgScore =
    contacts.length > 0
      ? Math.round(contacts.reduce((s, c) => s + (c.score ?? 0), 0) / contacts.length)
      : 0;

  // Score distribution
  const distribution = [
    { range: "0-20", count: contacts.filter((c) => (c.score ?? 0) >= 0 && (c.score ?? 0) < 20).length },
    { range: "20-40", count: contacts.filter((c) => (c.score ?? 0) >= 20 && (c.score ?? 0) < 40).length },
    { range: "40-60", count: contacts.filter((c) => (c.score ?? 0) >= 40 && (c.score ?? 0) < 60).length },
    { range: "60-80", count: contacts.filter((c) => (c.score ?? 0) >= 60 && (c.score ?? 0) < 80).length },
    { range: "80-100", count: contacts.filter((c) => (c.score ?? 0) >= 80 && (c.score ?? 0) <= 100).length },
  ];

  return NextResponse.json({
    contacts,
    stats: {
      total: contacts.length,
      hotCount,
      warmCount,
      coldCount,
      avgScore,
      distribution,
    },
  });
}

/** POST /api/scoring — Batch recalculate or predict */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const body = await req.json();
    const { action, contactId } = body;

    if (action === "recalculate") {
      const result = await batchScoreAllContacts(userId);
      return NextResponse.json({
        success: true,
        ...result,
        recalculatedAt: new Date().toISOString(),
      });
    }

    if (action === "predict" && contactId) {
      const prediction = await predictContactBehavior(userId, contactId);
      return NextResponse.json({ prediction });
    }

    return NextResponse.json({ error: "Accion no valida. Usa 'recalculate' o 'predict'" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
