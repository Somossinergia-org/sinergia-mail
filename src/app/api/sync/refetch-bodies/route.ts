import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { readEmail } from "@/lib/gmail";

export const maxDuration = 300;

/**
 * POST /api/sync/refetch-bodies
 * Re-download full email body from Gmail for emails that have empty body.
 * Useful after fixing the nested multipart body extraction bug.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { category } = await req.json().catch(() => ({}));

  // Find emails with empty or null body
  const conditions = [
    eq(schema.emails.userId, userId),
    sql`(${schema.emails.body} IS NULL OR ${schema.emails.body} = '')`,
  ];

  if (category) {
    conditions.push(eq(schema.emails.category, category));
  }

  const emptyBodyEmails = await db.query.emails.findMany({
    where: and(...conditions),
    columns: { id: true, gmailId: true, subject: true, fromName: true },
  });

  if (emptyBodyEmails.length === 0) {
    return NextResponse.json({
      success: true,
      updated: 0,
      message: "Todos los emails ya tienen body",
    });
  }

  let updated = 0;
  const errors: string[] = [];

  for (const email of emptyBodyEmails) {
    try {
      // Re-read from Gmail with fixed recursive body extraction
      const fullEmail = await readEmail(userId, email.gmailId);

      if (fullEmail.body && fullEmail.body.length > 0) {
        await db
          .update(schema.emails)
          .set({ body: fullEmail.body })
          .where(eq(schema.emails.id, email.id));
        updated++;
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors.push(
        `Error re-fetching ${email.gmailId} (${email.subject}): ${e instanceof Error ? e.message : "unknown"}`
      );
    }
  }

  return NextResponse.json({
    success: true,
    total: emptyBodyEmails.length,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
