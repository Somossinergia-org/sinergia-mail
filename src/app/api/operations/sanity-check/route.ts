import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/operations/sanity-check — Pre-deploy / post-deploy system health validation.
 *
 * Validates:
 *   1. DB connectivity (can query users table)
 *   2. Core tables exist (cases, auditEvents, emailAccounts, rateLimitCounters, runtimeSwitches)
 *   3. Token encryption module loads and round-trips correctly
 *   4. Runtime switches respond (read from DB + cache)
 *   5. Runtime config loads (mode, killSwitches, rateLimits)
 *   6. Guardrails module loads (preActionCheck available)
 *   7. Agent registry loads with expected count
 *
 * Returns: { ok: boolean, checks: [...], summary: { passed, failed, skipped } }
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const checks: Array<{
    name: string;
    status: "pass" | "fail" | "skip";
    detail?: string;
    ms?: number;
  }> = [];

  const runCheck = async (
    name: string,
    fn: () => Promise<{ ok: boolean; detail?: string }>,
  ) => {
    const t0 = Date.now();
    try {
      const result = await fn();
      checks.push({
        name,
        status: result.ok ? "pass" : "fail",
        detail: result.detail,
        ms: Date.now() - t0,
      });
    } catch (err) {
      checks.push({
        name,
        status: "fail",
        detail: (err as Error).message,
        ms: Date.now() - t0,
      });
    }
  };

  // ── 1. DB Connectivity ──────────────────────────────────────────────────
  await runCheck("db_connectivity", async () => {
    const { db, schema } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const [row] = await db.select({ now: sql<string>`NOW()` }).from(schema.users).limit(1);
    return { ok: true, detail: row ? "Connected, users table accessible" : "Connected, users table empty" };
  });

  // ── 2. Core Tables Exist ────────────────────────────────────────────────
  const REQUIRED_TABLES = [
    "cases",
    "audit_events",
    "email_accounts",
    "rate_limit_counters",
    "runtime_switches",
  ];

  await runCheck("core_tables", async () => {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(ARRAY[${sql.raw(REQUIRED_TABLES.map(t => `'${t}'`).join(","))}])`,
    );
    const rows = result as unknown as Array<{ table_name: string }>;
    const found = rows.map(r => r.table_name);
    const missing = REQUIRED_TABLES.filter(t => !found.includes(t));
    if (missing.length > 0) {
      return { ok: false, detail: `Missing tables: ${missing.join(", ")}` };
    }
    return { ok: true, detail: `All ${REQUIRED_TABLES.length} tables present` };
  });

  // ── 3. Token Encryption ─────────────────────────────────────────────────
  await runCheck("token_encryption", async () => {
    const { encryptToken, decryptToken, isEncryptionAvailable } = await import("@/lib/crypto/tokens");
    if (!isEncryptionAvailable()) {
      return { ok: true, detail: "TOKEN_ENCRYPTION_KEY not set — encryption disabled (graceful degradation)" };
    }
    const testValue = `sanity_${Date.now()}`;
    const encrypted = encryptToken(testValue);
    if (!encrypted || !encrypted.startsWith("enc:v1:")) {
      return { ok: false, detail: "Encryption produced invalid format" };
    }
    const decrypted = decryptToken(encrypted);
    if (decrypted !== testValue) {
      return { ok: false, detail: "Round-trip decrypt failed" };
    }
    return { ok: true, detail: "AES-256-GCM round-trip OK" };
  });

  // ── 4. Runtime Switches ─────────────────────────────────────────────────
  await runCheck("runtime_switches", async () => {
    const { getAllSwitches } = await import("@/lib/runtime/db-switches");
    const switches = await getAllSwitches();
    return {
      ok: true,
      detail: `${switches.size} switches loaded from DB/env`,
    };
  });

  // ── 5. Runtime Config ───────────────────────────────────────────────────
  await runCheck("runtime_config", async () => {
    const { getRuntimeConfig } = await import("@/lib/runtime/config");
    const config = getRuntimeConfig();
    if (!config.mode) {
      return { ok: false, detail: "Runtime config missing mode" };
    }
    return {
      ok: true,
      detail: `mode=${config.mode}, killSwitches=${Object.keys(config.killSwitches).length} keys, rateLimits present`,
    };
  });

  // ── 6. Guardrails Module ────────────────────────────────────────────────
  await runCheck("guardrails_module", async () => {
    const mod = await import("@/lib/runtime/guardrails");
    const hasPre = typeof mod.preActionCheck === "function";
    const hasPreAsync = typeof mod.preActionCheckAsync === "function";
    if (!hasPre) {
      return { ok: false, detail: "preActionCheck function not found" };
    }
    return {
      ok: true,
      detail: `preActionCheck=${hasPre}, preActionCheckAsync=${hasPreAsync}`,
    };
  });

  // ── 7. Agent Registry ───────────────────────────────────────────────────
  await runCheck("agent_registry", async () => {
    try {
      const { ALL_AGENT_IDS } = await import("@/lib/office/state-builder");
      const agentCount = ALL_AGENT_IDS.length;
      if (agentCount < 10) {
        return { ok: false, detail: `Only ${agentCount} agents found, expected 10` };
      }
      return { ok: true, detail: `${agentCount} agents registered: ${ALL_AGENT_IDS.join(", ")}` };
    } catch (err) {
      return { ok: false, detail: `Agent registry import failed: ${(err as Error).message}` };
    }
  });

  // ── 8. Rate Limit Counters ──────────────────────────────────────────────
  await runCheck("rate_limit_counters", async () => {
    const { getCaseCount } = await import("@/lib/runtime/db-rate-limits");
    // Read a counter — just verifying the DB path works
    const val = await getCaseCount("__sanity_check__", "messages");
    return {
      ok: true,
      detail: `Counter read OK (value=${val})`,
    };
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const skipped = checks.filter(c => c.status === "skip").length;
  const totalMs = checks.reduce((s, c) => s + (c.ms ?? 0), 0);

  return NextResponse.json({
    ok: failed === 0,
    checks,
    summary: { passed, failed, skipped, totalChecks: checks.length, totalMs },
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      operationMode: process.env.SINERGIA_MODE ?? "dry-run",
      hasEncryptionKey: !!process.env.TOKEN_ENCRYPTION_KEY,
      hasDbUrl: !!(process.env.DATABASE_URL ?? process.env.CLOUDSQL_URL),
    },
    generatedAt: new Date().toISOString(),
  });
}
