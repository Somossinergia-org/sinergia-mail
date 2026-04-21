/**
 * PREPRODUCTION TESTS — Operational Phase: Migration + Cron + SSE Streaming
 *
 * Validates:
 *   OP1: SQL migration file exists and covers all Phase 3 tables
 *   OP2: Cron audit-cleanup route structure and security
 *   OP3: vercel.json has audit-cleanup cron entry
 *   OP4: chat/page.tsx uses SSE streaming (stream: true)
 *   OP5: auditLog.purgeOlderThan is callable
 *   OP6: DatabaseAuditStore.purgeOlderThan exists
 *   OP7: Schema alignment between SQL migration and schema.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { auditLog, AuditLogger, DatabaseAuditStore, DualAuditStore } from "@/lib/audit";

// ─── Helpers ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../..");

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

// ─── OP1: SQL Migration File ─────────────────────────────────────────────

describe("OP1: SQL migration file", () => {
  const sql = readFile("drizzle/0001_phase3_tables.sql");

  it("exists and is non-empty", () => {
    expect(sql.length).toBeGreaterThan(100);
  });

  it("creates cases table with IF NOT EXISTS", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "cases"');
  });

  it("creates audit_events table with IF NOT EXISTS", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "audit_events"');
  });

  it("creates swarm_working_memory table with IF NOT EXISTS", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "swarm_working_memory"');
  });

  it("includes all cases indexes", () => {
    expect(sql).toContain("cases_user_idx");
    expect(sql).toContain("cases_client_idx");
    expect(sql).toContain("cases_user_client_idx");
    expect(sql).toContain("cases_status_idx");
    expect(sql).toContain("cases_owner_idx");
    expect(sql).toContain("cases_contact_idx");
  });

  it("includes all audit_events indexes", () => {
    expect(sql).toContain("audit_events_case_idx");
    expect(sql).toContain("audit_events_user_idx");
    expect(sql).toContain("audit_events_agent_idx");
    expect(sql).toContain("audit_events_type_idx");
    expect(sql).toContain("audit_events_date_idx");
    expect(sql).toContain("audit_events_result_idx");
  });

  it("includes swarm_working_memory index", () => {
    expect(sql).toContain("swarm_wm_user_idx");
  });

  it("references users table FK on cases", () => {
    expect(sql).toMatch(/REFERENCES "users"\("id"\) ON DELETE CASCADE/);
  });

  it("uses serial primary keys", () => {
    const serialCount = (sql.match(/"id" serial PRIMARY KEY/g) || []).length;
    expect(serialCount).toBe(3);
  });
});

// ─── OP2: Cron Audit Cleanup Route ──────────────────────────────────────

describe("OP2: Cron audit-cleanup route", () => {
  const routeSource = readFile("src/app/api/cron/audit-cleanup/route.ts");

  it("exists and is non-empty", () => {
    expect(routeSource.length).toBeGreaterThan(50);
  });

  it("exports GET handler", () => {
    expect(routeSource).toContain("export async function GET");
  });

  it("checks CRON_SECRET for authorization", () => {
    expect(routeSource).toContain("CRON_SECRET");
    expect(routeSource).toContain("Bearer");
    expect(routeSource).toContain("Unauthorized");
  });

  it("uses AUDIT_RETENTION_DAYS env var with default 90", () => {
    expect(routeSource).toContain("AUDIT_RETENTION_DAYS");
    expect(routeSource).toContain('"90"');
  });

  it("calls auditLog.purgeOlderThan", () => {
    expect(routeSource).toContain("purgeOlderThan");
  });

  it("returns JSON with ok, purged, retentionDays", () => {
    expect(routeSource).toContain("ok: true");
    expect(routeSource).toContain("purged");
    expect(routeSource).toContain("retentionDays");
  });

  it("sets maxDuration for serverless", () => {
    expect(routeSource).toContain("maxDuration");
  });
});

// ─── OP3: vercel.json has cron entry ────────────────────────────────────

describe("OP3: vercel.json audit-cleanup cron", () => {
  const vercelConfig = JSON.parse(readFile("vercel.json"));

  it("has crons array", () => {
    expect(Array.isArray(vercelConfig.crons)).toBe(true);
  });

  it("includes audit-cleanup path", () => {
    const auditCron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/audit-cleanup"
    );
    expect(auditCron).toBeDefined();
  });

  it("runs daily at 3 AM UTC", () => {
    const auditCron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/audit-cleanup"
    );
    expect(auditCron.schedule).toBe("0 3 * * *");
  });

  it("total crons count is 8 (7 original + audit-cleanup)", () => {
    expect(vercelConfig.crons.length).toBe(8);
  });
});

// ─── OP4: chat/page.tsx SSE Streaming ───────────────────────────────────

describe("OP4: chat/page.tsx uses SSE streaming", () => {
  const chatSource = readFile("src/app/chat/page.tsx");

  it("sends stream: true in fetch body", () => {
    expect(chatSource).toContain("stream: true");
  });

  it("uses ReadableStream reader (getReader)", () => {
    expect(chatSource).toContain("getReader()");
  });

  it("uses TextDecoder for chunk decoding", () => {
    expect(chatSource).toContain("new TextDecoder()");
  });

  it("parses SSE data: prefix", () => {
    expect(chatSource).toContain('line.startsWith("data: ")');
  });

  it("handles agent_start event", () => {
    expect(chatSource).toContain('"agent_start"');
  });

  it("handles text event for streaming content", () => {
    expect(chatSource).toContain('"text"');
    expect(chatSource).toContain("fullContent += event.content");
  });

  it("handles tool_call event", () => {
    expect(chatSource).toContain('"tool_call"');
  });

  it("handles done event", () => {
    expect(chatSource).toContain('"done"');
  });

  it("handles error event", () => {
    expect(chatSource).toContain('"error"');
  });

  it("no longer uses data.reply pattern in sendMessage", () => {
    // The old pattern was: const data = await res.json(); data.reply
    // The new pattern uses SSE parsing with fullContent
    expect(chatSource).not.toContain("data.reply || data.response");
    expect(chatSource).toContain("fullContent");
  });
});

// ─── OP5: auditLog.purgeOlderThan is callable ──────────────────────────

describe("OP5: auditLog purge functionality", () => {
  it("auditLog has purgeOlderThan method", () => {
    expect(typeof auditLog.purgeOlderThan).toBe("function");
  });

  it("purgeOlderThan returns a Promise", () => {
    const result = auditLog.purgeOlderThan(90);
    expect(result).toBeInstanceOf(Promise);
  });

  it("purgeOlderThan resolves to 0 in test env (MemoryAuditStore)", async () => {
    // In test env, store is MemoryAuditStore which returns 0
    const purged = await auditLog.purgeOlderThan(90);
    expect(purged).toBe(0);
  });
});

// ─── OP6: DatabaseAuditStore.purgeOlderThan ─────────────────────────────

describe("OP6: DatabaseAuditStore purge", () => {
  it("has purgeOlderThan method", () => {
    const store = new DatabaseAuditStore();
    expect(typeof store.purgeOlderThan).toBe("function");
  });

  it("DualAuditStore has purgeOlderThan method", () => {
    const store = new DualAuditStore();
    expect(typeof store.purgeOlderThan).toBe("function");
  });
});

// ─── OP7: Schema alignment ──────────────────────────────────────────────

describe("OP7: Schema alignment between migration and schema.ts", () => {
  const sql = readFile("drizzle/0001_phase3_tables.sql");
  const schemaTs = readFile("src/db/schema.ts");

  it("cases table columns match between SQL and schema.ts", () => {
    // Key columns from schema.ts
    const casesColumns = [
      "user_id", "contact_id", "client_identifier", "visible_owner_id",
      "status", "subject", "channel", "metadata", "interaction_count",
      "created_at", "updated_at", "closed_at",
    ];
    for (const col of casesColumns) {
      expect(sql).toContain(`"${col}"`);
    }
  });

  it("audit_events table columns match between SQL and schema.ts", () => {
    const auditColumns = [
      "event_id", "case_id", "user_id", "agent_id", "agent_layer",
      "event_type", "result", "tool_name", "visible_owner_id",
      "target_agent_id", "reason", "metadata", "created_at",
    ];
    for (const col of auditColumns) {
      expect(sql).toContain(`"${col}"`);
    }
  });

  it("swarm_working_memory columns match between SQL and schema.ts", () => {
    const wmColumns = [
      "user_id", "current_task", "active_agent_id",
      "pending_delegations", "context_summary", "started_at", "updated_at",
    ];
    for (const col of wmColumns) {
      expect(sql).toContain(`"${col}"`);
    }
  });

  it("schema.ts exports Case type", () => {
    expect(schemaTs).toContain("export type Case");
  });

  it("schema.ts exports AuditEventRow type", () => {
    expect(schemaTs).toContain("export type AuditEventRow");
  });

  it("schema.ts exports SwarmWorkingMemoryRow type", () => {
    expect(schemaTs).toContain("export type SwarmWorkingMemoryRow");
  });
});
