/**
 * PREPRODUCTION TESTS — Go-Live Readiness
 *
 * GL1: Sanity-check endpoint structure and completeness
 * GL2: Smoke validation script exists and is well-formed
 * GL3: Environment config files present and correct
 * GL4: Go-Live Runbook completeness
 * GL5: Sanity-check covers all critical subsystems
 * GL6: Operation modes documented and configured
 * GL7: Kill switch keys consistency between config, switches API, and env files
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ─── GL1: Sanity-Check Endpoint ─────────────────────────────────────────

describe("GL1: Sanity-check endpoint", () => {
  const routePath = "src/app/api/operations/sanity-check/route.ts";

  it("route file exists", () => {
    expect(fileExists(routePath)).toBe(true);
  });

  const content = readFile(routePath);

  it("exports GET handler", () => {
    expect(content).toContain("export async function GET");
  });

  it("requires authentication", () => {
    expect(content).toContain("auth()");
    expect(content).toContain("401");
  });

  it("returns ok boolean", () => {
    expect(content).toContain("ok:");
    expect(content).toMatch(/ok:\s*failed\s*===\s*0/);
  });

  it("returns checks array", () => {
    expect(content).toContain("checks");
    expect(content).toContain("summary");
  });

  it("includes environment metadata", () => {
    expect(content).toContain("nodeEnv");
    expect(content).toContain("operationMode");
    expect(content).toContain("hasEncryptionKey");
    expect(content).toContain("hasDbUrl");
  });

  it("checks DB connectivity", () => {
    expect(content).toContain("db_connectivity");
  });

  it("checks core tables", () => {
    expect(content).toContain("core_tables");
    expect(content).toContain("rate_limit_counters");
    expect(content).toContain("runtime_switches");
  });

  it("checks token encryption", () => {
    expect(content).toContain("token_encryption");
    expect(content).toContain("encryptToken");
    expect(content).toContain("decryptToken");
  });

  it("checks runtime switches", () => {
    expect(content).toContain("runtime_switches");
    expect(content).toContain("getAllSwitches");
  });

  it("checks runtime config", () => {
    expect(content).toContain("runtime_config");
    expect(content).toContain("getRuntimeConfig");
  });

  it("checks guardrails module", () => {
    expect(content).toContain("guardrails_module");
    expect(content).toContain("preActionCheck");
  });

  it("checks agent registry", () => {
    expect(content).toContain("agent_registry");
    expect(content).toContain("ALL_AGENT_IDS");
  });

  it("checks rate limit counters", () => {
    expect(content).toContain("rate_limit_counters");
    expect(content).toContain("getCaseCount");
  });

  it("is force-dynamic", () => {
    expect(content).toContain('export const dynamic = "force-dynamic"');
  });
});

// ─── GL2: Smoke Validation Script ───────────────────────────────────────

describe("GL2: Smoke validation script", () => {
  const scriptPath = "scripts/smoke-validation.sh";

  it("script file exists", () => {
    expect(fileExists(scriptPath)).toBe(true);
  });

  const content = readFile(scriptPath);

  it("has shebang and set -euo pipefail", () => {
    expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
    expect(content).toContain("set -euo pipefail");
  });

  it("accepts BASE_URL parameter", () => {
    expect(content).toContain("BASE_URL");
  });

  it("accepts AUTH_COOKIE parameter", () => {
    expect(content).toContain("AUTH_COOKIE");
  });

  it("checks sanity-check endpoint", () => {
    expect(content).toContain("/api/operations/sanity-check");
  });

  it("checks health endpoint", () => {
    expect(content).toContain("/api/operations/health");
  });

  it("checks switches endpoint", () => {
    expect(content).toContain("/api/operations/switches");
  });

  it("checks cases endpoint", () => {
    expect(content).toContain("/api/operations/cases");
  });

  it("checks activity endpoint", () => {
    expect(content).toContain("/api/operations/activity");
  });

  it("reports pass/fail summary", () => {
    expect(content).toContain("PASSED");
    expect(content).toContain("FAILED");
    expect(content).toContain("SMOKE VALIDATION PASSED");
    expect(content).toContain("SMOKE VALIDATION FAILED");
  });

  it("exits with non-zero on failure", () => {
    expect(content).toContain("exit 1");
  });

  it("requires curl and jq", () => {
    expect(content).toContain("curl");
    expect(content).toContain("jq");
  });
});

// ─── GL3: Environment Config Files ──────────────────────────────────────

describe("GL3: Environment configuration", () => {
  it(".env.staging exists", () => {
    expect(fileExists(".env.staging")).toBe(true);
  });

  // .env.production está gitignored (vive en Vercel env vars). Si no existe
  // localmente, los checks sobre prod se saltan — Vercel los valida en su
  // dashboard. Se ejecutan completos sólo en máquinas con el archivo presente.
  const hasProd = fileExists(".env.production");
  const staging = readFile(".env.staging");
  const production = hasProd ? readFile(".env.production") : "";

  it("staging uses shadow mode", () => {
    expect(staging).toContain("SINERGIA_MODE=shadow");
  });

  it.skipIf(!hasProd)("production uses guarded mode (week 1)", () => {
    expect(production).toContain("SINERGIA_MODE=guarded");
  });

  it("staging blocks all external comms", () => {
    expect(staging).toContain("KILL_BLOCK_ALL_COMMS=true");
  });

  it.skipIf(!hasProd)("production allows comms (not all blocked)", () => {
    expect(production).toContain("KILL_BLOCK_ALL_COMMS=false");
  });

  it("staging requires TOKEN_ENCRYPTION_KEY", () => {
    expect(staging).toContain("TOKEN_ENCRYPTION_KEY=");
  });

  it.skipIf(!hasProd)("production requires TOKEN_ENCRYPTION_KEY", () => {
    expect(production).toContain("TOKEN_ENCRYPTION_KEY=");
  });

  it("staging has restrictive rate limits", () => {
    expect(staging).toContain("LIMIT_MSG_PER_CASE=5");
  });

  it.skipIf(!hasProd)("production has operational rate limits", () => {
    expect(production).toContain("LIMIT_MSG_PER_CASE=15");
  });

  // Both should have ALL rate limit keys
  const RATE_LIMIT_KEYS = [
    "LIMIT_MSG_PER_CASE",
    "LIMIT_MSG_PER_CLIENT",
    "LIMIT_CLIENT_WINDOW_MIN",
    "LIMIT_CALLS_PER_CASE",
    "LIMIT_ESCALATIONS",
    "LIMIT_TOOL_RETRIES",
    "LIMIT_CONTACT_COOLDOWN",
    "LIMIT_HIGH_RISK_PER_CASE",
  ];

  for (const key of RATE_LIMIT_KEYS) {
    it(`staging defines ${key}`, () => {
      expect(staging).toContain(`${key}=`);
    });

    it.skipIf(!hasProd)(`production defines ${key}`, () => {
      expect(production).toContain(`${key}=`);
    });
  }

  // Both should have ALL kill switch keys
  const KILL_SWITCH_KEYS = [
    "KILL_BLOCK_ALL_COMMS",
    "KILL_BLOCK_WA_SMS_PHONE",
    "KILL_BLOCK_DELEGATION",
    "KILL_BLOCK_HIGH_RISK",
    "KILL_FORCE_READONLY",
    "KILL_DISABLE_JUNIOR",
    "KILL_BLOCKED_CHANNELS",
  ];

  for (const key of KILL_SWITCH_KEYS) {
    it(`staging defines ${key}`, () => {
      expect(staging).toContain(`${key}=`);
    });

    it.skipIf(!hasProd)(`production defines ${key}`, () => {
      expect(production).toContain(`${key}=`);
    });
  }
});

// ─── GL4: Go-Live Runbook ───────────────────────────────────────────────

describe("GL4: Go-Live Runbook", () => {
  const runbookPath = "docs/GO-LIVE-RUNBOOK.md";

  it("runbook file exists", () => {
    expect(fileExists(runbookPath)).toBe(true);
  });

  const content = readFile(runbookPath);

  it("covers prerequisites", () => {
    expect(content.toLowerCase()).toContain("prerequisit");
  });

  it("covers migrations", () => {
    expect(content.toLowerCase()).toContain("migra");
  });

  it("covers rollback", () => {
    expect(content.toLowerCase()).toContain("rollback");
  });

  it("covers monitoring", () => {
    expect(content.toLowerCase()).toContain("monitor");
  });

  it("covers mode activation (shadow/guarded/production)", () => {
    expect(content).toContain("shadow");
    expect(content).toContain("guarded");
    expect(content).toContain("production");
  });

  it("references sanity-check endpoint", () => {
    expect(content).toContain("sanity-check");
  });

  it("covers expansion criteria", () => {
    // Runbook may use "abrir más volumen" or "ampliar" instead of "expansión"
    const lower = content.toLowerCase();
    const hasExpansion = lower.includes("expan") || lower.includes("ampliar") || lower.includes("volumen") || lower.includes("escalar");
    expect(hasExpansion).toBe(true);
  });

  it("covers human validation checklist", () => {
    expect(content.toLowerCase()).toContain("validaci");
  });
});

// ─── GL5: Sanity-Check Subsystem Coverage ───────────────────────────────

describe("GL5: Sanity-check subsystem coverage", () => {
  const content = readFile("src/app/api/operations/sanity-check/route.ts");

  const REQUIRED_CHECKS = [
    "db_connectivity",
    "core_tables",
    "token_encryption",
    "runtime_switches",
    "runtime_config",
    "guardrails_module",
    "agent_registry",
    "rate_limit_counters",
  ];

  for (const check of REQUIRED_CHECKS) {
    it(`includes check: ${check}`, () => {
      expect(content).toContain(`"${check}"`);
    });
  }

  it("reports pass/fail/skip per check", () => {
    expect(content).toContain('"pass"');
    expect(content).toContain('"fail"');
    expect(content).toContain('"skip"');
  });

  it("measures execution time per check", () => {
    expect(content).toContain("ms:");
    expect(content).toContain("Date.now()");
  });

  it("catches errors gracefully per check", () => {
    expect(content).toContain("catch (err)");
  });
});

// ─── GL6: Operation Modes ───────────────────────────────────────────────

describe("GL6: Operation modes in runtime config", () => {
  const configContent = readFile("src/lib/runtime/config.ts");

  const MODES = ["dry-run", "shadow", "guarded", "production"];

  for (const mode of MODES) {
    it(`defines mode: ${mode}`, () => {
      expect(configContent).toContain(mode);
    });
  }

  it("reads SINERGIA_MODE from env", () => {
    expect(configContent).toContain("SINERGIA_MODE");
  });

  it("defaults to dry-run", () => {
    expect(configContent).toContain("DRY_RUN");
  });
});

// ─── GL7: Kill Switch Keys Consistency ──────────────────────────────────

describe("GL7: Kill switch keys consistency", () => {
  const configContent = readFile("src/lib/runtime/config.ts");
  const switchesContent = readFile("src/app/api/operations/switches/route.ts");
  const stagingContent = readFile(".env.staging");
  const hasProdLocal = fileExists(".env.production");
  const productionContent = hasProdLocal ? readFile(".env.production") : "";

  const KILL_KEYS_IN_CONFIG = [
    "KILL_BLOCK_ALL_COMMS",
    "KILL_BLOCK_WA_SMS_PHONE",
    "KILL_BLOCK_DELEGATION",
    "KILL_BLOCK_HIGH_RISK",
    "KILL_FORCE_READONLY",
    "KILL_DISABLE_JUNIOR",
    "KILL_BLOCKED_CHANNELS",
  ];

  for (const key of KILL_KEYS_IN_CONFIG) {
    it(`config.ts reads ${key}`, () => {
      expect(configContent).toContain(key);
    });

    it(`switches route knows ${key}`, () => {
      expect(switchesContent).toContain(key);
    });

    it(`.env.staging defines ${key}`, () => {
      expect(stagingContent).toContain(key);
    });

    it.skipIf(!hasProdLocal)(`.env.production defines ${key}`, () => {
      expect(productionContent).toContain(key);
    });
  }
});
