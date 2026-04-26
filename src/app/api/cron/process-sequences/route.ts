import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sequenceEnrollments, sequenceSteps, emailSequences } from "@/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { enqueueMessage } from "@/lib/outbound";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "/api/cron/process-sequences" });

// Vercel function timeout
export const maxDuration = 60;

/**
 * Cron: avanza secuencias drip
 * Se ejecuta cada 15 minutos vía Vercel Cron o llamada manual
 * Busca enrollments con nextSendAt <= ahora y status = active
 */
export async function GET(req: NextRequest) {
  // Protect with cron secret
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let processed = 0, sent = 0, completed = 0;

  try {
    // Find enrollments ready to advance
    const ready = await db.select().from(sequenceEnrollments)
      .where(and(
        eq(sequenceEnrollments.status, "active"),
        lte(sequenceEnrollments.nextSendAt, now)
      ))
      .limit(50);

    for (const enrollment of ready) {
      processed++;
      const nextStepOrder = (enrollment.currentStep || 0) + 1;

      // Get the step to send
      const [step] = await db.select().from(sequenceSteps)
        .where(and(
          eq(sequenceSteps.sequenceId, enrollment.sequenceId),
          eq(sequenceSteps.stepOrder, nextStepOrder)
        ))
        .limit(1);

      if (!step) {
        // No more steps — mark as completed
        await db.update(sequenceEnrollments)
          .set({ status: "completed" })
          .where(eq(sequenceEnrollments.id, enrollment.id));
        await db.update(emailSequences)
          .set({ totalCompleted: sql`total_completed + 1` })
          .where(eq(emailSequences.id, enrollment.sequenceId));
        completed++;
        continue;
      }

      // Get sequence to find userId
      const [seq] = await db.select().from(emailSequences)
        .where(eq(emailSequences.id, enrollment.sequenceId))
        .limit(1);
      if (!seq || !seq.active) continue;

      // Replace template variables in subject/body
      const subject = step.subject
        .replace(/\{\{name\}\}/g, enrollment.contactName || "")
        .replace(/\{\{email\}\}/g, enrollment.contactEmail);
      const body = step.body
        .replace(/\{\{name\}\}/g, enrollment.contactName || "")
        .replace(/\{\{email\}\}/g, enrollment.contactEmail);

      // Enqueue email via outbound service
      await enqueueMessage(seq.userId, {
        channel: "EMAIL",
        destination: enrollment.contactEmail,
        subject,
        body,
        eventType: "drip_sequence",
        sourceType: "sequence",
        sourceId: String(enrollment.sequenceId),
      });

      // Get next step to calculate nextSendAt
      const [nextStep] = await db.select().from(sequenceSteps)
        .where(and(
          eq(sequenceSteps.sequenceId, enrollment.sequenceId),
          eq(sequenceSteps.stepOrder, nextStepOrder + 1)
        ))
        .limit(1);

      const nextSendAt = nextStep
        ? new Date(now.getTime() + nextStep.waitDays * 86400000)
        : null;

      await db.update(sequenceEnrollments)
        .set({
          currentStep: nextStepOrder,
          lastSentAt: now,
          nextSendAt,
          status: nextStep ? "active" : "completed",
        })
        .where(eq(sequenceEnrollments.id, enrollment.id));

      if (!nextStep) completed++;
      sent++;
    }

    log.info({ processed, sent, completed }, "sequences advanced");
    return NextResponse.json({ ok: true, processed, sent, completed });
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : String(e) }, "process-sequences failed");
    return NextResponse.json(
      { error: "Error processing sequences", detail: e instanceof Error ? e.message.slice(0, 200) : String(e) },
      { status: 500 },
    );
  }
}
