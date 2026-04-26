import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logger, logError } from "@/lib/logger";
import fs from "node:fs/promises";
import path from "node:path";

const log = logger.child({ route: "/api/admin/migrate-all" });

const ADMIN_EMAIL = "orihuela@somossinergia.es";

/**
 * POST /api/admin/migrate-all
 *
 * Runs every SQL file under drizzle/ in lexicographic order against the
 * production database. All Sinergia migrations are written with
 * IF NOT EXISTS / IF EXISTS, so re-running is a no-op for already-applied
 * statements.
 *
 * Auth: Bearer CRON_SECRET, Bearer AGENT_API_KEY *or* admin session (orihuela@...).
 *
 * Returns: { ok, files: [{ name, statements, ok, errors? }] }
 *
 * Each .sql file is split on `;` at top level (naive but works for our
 * migrations — none of them use functions / DO blocks today).
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const cronOk =
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const agentKeyOk =
    !!process.env.AGENT_API_KEY &&
    authHeader === `Bearer ${process.env.AGENT_API_KEY}`;
  const bearerOk = cronOk || agentKeyOk;

  if (!bearerOk) {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const drizzleDir = path.join(process.cwd(), "drizzle");
  let files: string[];
  try {
    files = (await fs.readdir(drizzleDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (e) {
    logError(log, e, { drizzleDir }, "could not read drizzle dir");
    return NextResponse.json(
      { error: "drizzle dir not readable on serverless filesystem" },
      { status: 500 },
    );
  }

  const report: Array<{
    name: string;
    statements: number;
    ok: boolean;
    errors?: Array<{ stmtIdx: number; err: string; preview: string }>;
  }> = [];

  for (const name of files) {
    const full = path.join(drizzleDir, name);
    const raw = await fs.readFile(full, "utf8");

    // Strip line comments, then split on `;` (naive — fine for our migrations).
    const cleaned = raw
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const statements = cleaned
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const errors: Array<{ stmtIdx: number; err: string; preview: string }> = [];
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await db.execute(sql.raw(stmt));
      } catch (e) {
        const err = e instanceof Error ? e.message : "unknown";
        errors.push({ stmtIdx: i, err, preview: stmt.slice(0, 120) });
        logError(log, e, { name, stmtIdx: i }, "migration stmt failed");
      }
    }

    report.push({
      name,
      statements: statements.length,
      ok: errors.length === 0,
      ...(errors.length ? { errors } : {}),
    });
  }

  log.info(
    { files: report.length, allOk: report.every((r) => r.ok) },
    "migrate-all complete",
  );

  return NextResponse.json({
    ok: report.every((r) => r.ok),
    files: report,
  });
}
