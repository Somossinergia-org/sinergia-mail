import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { executeSwarm } from "@/lib/agent/swarm";
import { getAllDailyTasks } from "@/lib/agent/agent-knowledge";
import { consolidateMemory } from "@/lib/agent/memory-engine";
import { seedKnowledgeBase } from "@/lib/knowledge/base";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "cron-daily-agents" });

/**
 * Daily Agent Routines Cron Job
 *
 * Runs each agent's daily tasks proactively:
 *  - CEO: Morning briefing, evening summary
 *  - Email: Inbox scan, pending check, cleanup
 *  - Fiscal: Overdue invoices, income tracker
 *  - Calendar: Daily agenda, prep tomorrow
 *  - CRM: Scoring update, cold contacts, opportunity scan
 *  - Energy: Energy alerts, market check
 *  - Automation: Health check, pattern detection
 *  - Legal: RGPD audit, retention check, regulation scan
 *
 * Schedule: Vercel Cron runs this every hour. The function
 * checks which tasks are due for the current hour and executes them.
 *
 * vercel.json config:
 *   { "path": "/api/cron/daily-agents", "schedule": "0 * * * *" }
 */

export const maxDuration = 300; // 5 min max

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const currentHour = now.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
  const dayOfWeek = now.toLocaleDateString("es-ES", {
    weekday: "long",
    timeZone: "Europe/Madrid",
  }).toLowerCase();

  log.info({ currentHour, dayOfWeek }, "daily-agents cron triggered");

  // Get all daily tasks
  const allTasks = getAllDailyTasks();

  // Filter tasks that should run now
  const dueTasks = allTasks.filter((task) => {
    const schedule = task.schedule.toLowerCase();

    // Exact time match (e.g., "08:00")
    if (schedule === currentHour) return true;

    // Day-specific (e.g., "lunes-09:00")
    if (schedule.includes("-")) {
      const [day, time] = schedule.split("-");
      if (day === dayOfWeek && time === currentHour) return true;
    }

    // Special schedules
    if (schedule === "dia-1-mes" && now.getDate() === 1 && currentHour === "09:00") return true;

    return false;
  });

  if (dueTasks.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No tasks due at this time",
      currentHour,
    });
  }

  log.info({ taskCount: dueTasks.length, tasks: dueTasks.map((t) => t.name) }, "executing due tasks");

  // Get all users to run tasks for
  const users = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(50);

  const results: Array<{
    userId: string;
    taskName: string;
    agentId: string;
    success: boolean;
    reply?: string;
  }> = [];

  for (const user of users) {
    for (const task of dueTasks) {
      try {
        // Execute the task as a swarm message from the agent
        const prompt = `[TAREA DIARIA AUTOMÁTICA - ${task.name}]\n\n${task.description}\n\nEjecuta esta tarea ahora y reporta los resultados.`;

        const result = await executeSwarm({
          userId: user.id,
          messages: [{ role: "user", content: prompt }],
          agentOverride: task.agentId,
          context: `Tarea programada: ${task.name} (prioridad ${task.priority}/10). Hora: ${currentHour}. Día: ${dayOfWeek}.`,
        });

        results.push({
          userId: user.id,
          taskName: task.name,
          agentId: task.agentId,
          success: true,
          reply: result.reply.slice(0, 200),
        });

        log.info(
          { userId: user.id, task: task.name, agent: task.agentId, tokens: result.tokensUsed },
          "daily task completed",
        );
      } catch (err) {
        logError(log, err, { userId: user.id, task: task.name }, "daily task failed");
        results.push({
          userId: user.id,
          taskName: task.name,
          agentId: task.agentId,
          success: false,
        });
      }
    }
  }

  // ── Memory maintenance (runs at 03:00 — low traffic) ──
  const memoryResults: Array<{ userId: string; merged: number; pruned: number }> = [];
  if (currentHour === "03:00") {
    for (const user of users) {
      try {
        // Ensure knowledge base is seeded for every user
        await seedKnowledgeBase(user.id);
        // Consolidate memory: prune duplicates, persist high-importance data
        const stats = await consolidateMemory(user.id);
        memoryResults.push({ userId: user.id, ...stats });
        log.info({ userId: user.id, ...stats }, "memory consolidation completed");
      } catch (err) {
        logError(log, err, { userId: user.id }, "memory consolidation failed");
      }
    }
  }

  return NextResponse.json({
    ok: true,
    currentHour,
    dayOfWeek,
    tasksExecuted: results.length,
    results,
    memoryConsolidation: memoryResults.length > 0 ? memoryResults : undefined,
  });
}
