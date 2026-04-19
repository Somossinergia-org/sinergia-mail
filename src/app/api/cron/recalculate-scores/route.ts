import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { batchScoreAllContacts } from "@/lib/scoring/engine";

export const maxDuration = 300;

/**
 * Daily cron — recalculates all contact scores for every user.
 *
 * Secured via CRON_SECRET matching Vercel's Bearer token.
 *
 * Returns a summary with users processed, total contacts scored, and average score.
 */
export async function GET(req: NextRequest) {
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all users
    const allUsers = await db.select({ id: schema.users.id }).from(schema.users);

    let usersProcessed = 0;
    let contactsScored = 0;
    let totalAvgScore = 0;

    for (const user of allUsers) {
      try {
        const result = await batchScoreAllContacts(user.id);
        if (result.updated > 0) {
          usersProcessed++;
          contactsScored += result.updated;
          totalAvgScore += result.avgScore * result.updated;
        }
      } catch {
        // Skip users that fail — don't block the rest
      }
    }

    const avgScore = contactsScored > 0 ? Math.round(totalAvgScore / contactsScored) : 0;

    return NextResponse.json({
      ok: true,
      usersProcessed,
      contactsScored,
      avgScore,
    });
  } catch (e) {
    console.error("[cron/recalculate-scores]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
