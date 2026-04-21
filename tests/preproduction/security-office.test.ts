/**
 * PREPRODUCTION TESTS — Security Operational + Office Virtual Verification
 *
 * SEC1: Token encryption module (crypto/tokens.ts)
 * SEC2: Encryption integration in oauth-callback
 * SEC3: Encryption integration in gmail.ts (read/write)
 * SEC4: Encryption integration in calendar/drive/tasks
 * SEC5: DB kill switches table + service
 * SEC6: DB rate limit counters table + service
 * SEC7: Switches API route structure
 * SEC8: Manual case actions (PATCH)
 * SEC9: Async preActionCheck with persistent counters
 * OFF1: 10-agent ID match between backend and UI
 * OFF2: Agent layer assignments
 * OFF3: STATUS_MAP coverage (including blocked)
 * OFF4: Blocked visual state in UI
 * OFF5: No legacy/duplicate agents
 * OFF6: Ownership visibility in components
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

// ─── SEC1: Token Encryption Module ─────────────────────────────────────

describe("SEC1: Token encryption module", () => {
  const content = readFile("src/lib/crypto/tokens.ts");

  it("exports encryptToken", () => {
    expect(content).toContain("export function encryptToken");
  });

  it("exports decryptToken", () => {
    expect(content).toContain("export function decryptToken");
  });

  it("exports isEncryptionAvailable", () => {
    expect(content).toContain("export function isEncryptionAvailable");
  });

  it("uses AES-256-GCM", () => {
    expect(content).toContain("aes-256-gcm");
  });

  it("derives key from TOKEN_ENCRYPTION_KEY env var", () => {
    expect(content).toContain("TOKEN_ENCRYPTION_KEY");
    expect(content).toContain("createHash");
    expect(content).toContain("sha256");
  });

  it("uses enc:v1: prefix format", () => {
    expect(content).toContain('enc:v1:');
  });

  it("gracefully degrades without key", () => {
    expect(content).toContain("Graceful degradation");
  });

  it("backward compatible with plaintext", () => {
    expect(content).toContain("startsWith(PREFIX)");
    expect(content).toContain("return value"); // returns as-is if not encrypted
  });

  it("has testing helper _resetKeyCache", () => {
    expect(content).toContain("export function _resetKeyCache");
  });
});

// ─── SEC2: Encryption in OAuth Callback ────────────────────────────────

describe("SEC2: Encryption in oauth-callback", () => {
  const content = readFile("src/app/api/email-accounts/oauth-callback/route.ts");

  it("imports encryptToken", () => {
    expect(content).toContain('import { encryptToken }');
    expect(content).toContain('@/lib/crypto/tokens');
  });

  it("encrypts accessToken on insert", () => {
    expect(content).toMatch(/accessToken:\s*encryptToken\(tokens\.access_token\)/);
  });

  it("encrypts refreshToken on insert", () => {
    expect(content).toMatch(/refreshToken:\s*encryptToken\(tokens\.refresh_token\)/);
  });

  it("encrypts accessToken on update", () => {
    // Both update and insert paths use encryptToken
    const matches = content.match(/encryptToken\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3); // at least 3 calls (2 update + 1 insert access + 1 insert refresh)
  });
});

// ─── SEC3: Encryption in gmail.ts ──────────────────────────────────────

describe("SEC3: Encryption in gmail.ts (read/write)", () => {
  const content = readFile("src/lib/gmail.ts");

  it("imports encryptToken and decryptToken", () => {
    expect(content).toContain("encryptToken");
    expect(content).toContain("decryptToken");
    expect(content).toContain("@/lib/crypto/tokens");
  });

  it("decrypts access token on read (primary)", () => {
    expect(content).toContain("decryptToken(primaryAccount.accessToken)");
  });

  it("decrypts refresh token on read (primary)", () => {
    expect(content).toContain("decryptToken(primaryAccount.refreshToken)");
  });

  it("encrypts on token refresh callback", () => {
    expect(content).toContain("encryptToken(newTokens.access_token");
  });

  it("decrypts legacy account tokens", () => {
    expect(content).toContain("decryptToken(account.access_token)");
    expect(content).toContain("decryptToken(account.refresh_token)");
  });

  it("decrypts in getGmailClientForAccount", () => {
    expect(content).toContain("decryptToken(account.accessToken)");
    expect(content).toContain("decryptToken(account.refreshToken)");
  });
});

// ─── SEC4: Encryption in calendar/drive/tasks ─────────────────────────

describe("SEC4: Encryption in calendar/drive/tasks", () => {
  for (const file of ["src/lib/calendar.ts", "src/lib/drive.ts", "src/lib/tasks.ts"]) {
    const name = file.split("/").pop()!;
    const content = readFile(file);

    it(`${name} imports decryptToken`, () => {
      expect(content).toContain("decryptToken");
      expect(content).toContain("@/lib/crypto/tokens");
    });

    it(`${name} decrypts access_token`, () => {
      expect(content).toContain("decryptToken(account.access_token)");
    });

    it(`${name} decrypts refresh_token`, () => {
      expect(content).toContain("decryptToken(account.refresh_token)");
    });
  }
});

// ─── SEC5: DB Kill Switches ───────────────────────────────────────────

describe("SEC5: DB kill switches", () => {
  it("runtime_switches table exists in schema", () => {
    const content = readFile("src/db/schema.ts");
    expect(content).toContain("runtimeSwitches");
    expect(content).toContain("runtime_switches");
  });

  it("db-switches service exists", () => {
    expect(fileExists("src/lib/runtime/db-switches.ts")).toBe(true);
  });

  const dbSwitches = readFile("src/lib/runtime/db-switches.ts");

  it("exports getSwitch", () => {
    expect(dbSwitches).toContain("export async function getSwitch");
  });

  it("exports setSwitch", () => {
    expect(dbSwitches).toContain("export async function setSwitch");
  });

  it("exports getSwitchBool", () => {
    expect(dbSwitches).toContain("export async function getSwitchBool");
  });

  it("exports getKillSwitchesFromDB", () => {
    expect(dbSwitches).toContain("export async function getKillSwitchesFromDB");
  });

  it("exports getRateLimitsFromDB", () => {
    expect(dbSwitches).toContain("export async function getRateLimitsFromDB");
  });

  it("has TTL cache", () => {
    expect(dbSwitches).toContain("CACHE_TTL_MS");
    expect(dbSwitches).toContain("fetchedAt");
  });

  it("falls back to env vars", () => {
    expect(dbSwitches).toContain("process.env[key]");
  });

  it("config.ts has getRuntimeConfigAsync", () => {
    const config = readFile("src/lib/runtime/config.ts");
    expect(config).toContain("export async function getRuntimeConfigAsync");
    expect(config).toContain("getKillSwitchesFromDB");
    expect(config).toContain("getRateLimitsFromDB");
  });
});

// ─── SEC6: DB Rate Limit Counters ─────────────────────────────────────

describe("SEC6: DB rate limit counters", () => {
  it("rate_limit_counters table exists in schema", () => {
    const content = readFile("src/db/schema.ts");
    expect(content).toContain("rateLimitCounters");
    expect(content).toContain("rate_limit_counters");
  });

  it("db-rate-limits service exists", () => {
    expect(fileExists("src/lib/runtime/db-rate-limits.ts")).toBe(true);
  });

  const dbRL = readFile("src/lib/runtime/db-rate-limits.ts");

  it("exports getCaseCount", () => {
    expect(dbRL).toContain("export async function getCaseCount");
  });

  it("exports incrementCaseCount", () => {
    expect(dbRL).toContain("export async function incrementCaseCount");
  });

  it("exports getClientMessageCount", () => {
    expect(dbRL).toContain("export async function getClientMessageCount");
  });

  it("exports getToolRetries", () => {
    expect(dbRL).toContain("export async function getToolRetries");
  });

  it("exports getLastContactTimestamp", () => {
    expect(dbRL).toContain("export async function getLastContactTimestamp");
  });

  it("handles window expiration", () => {
    expect(dbRL).toContain("windowMinutes");
    expect(dbRL).toContain("Window expired");
  });

  it("guardrails.ts exports preActionCheckAsync", () => {
    const guardrails = readFile("src/lib/runtime/guardrails.ts");
    expect(guardrails).toContain("export async function preActionCheckAsync");
    expect(guardrails).toContain("db-rate-limits");
    expect(guardrails).toContain("getRuntimeConfigAsync");
  });
});

// ─── SEC7: Switches API Route ─────────────────────────────────────────

describe("SEC7: Switches API route", () => {
  it("route file exists", () => {
    expect(fileExists("src/app/api/operations/switches/route.ts")).toBe(true);
  });

  const content = readFile("src/app/api/operations/switches/route.ts");

  it("exports GET handler", () => {
    expect(content).toMatch(/export async function GET/);
  });

  it("exports PATCH handler", () => {
    expect(content).toMatch(/export async function PATCH/);
  });

  it("requires auth", () => {
    expect(content).toContain("auth()");
    expect(content).toContain("session?.user?.id");
    expect(content).toContain("401");
  });

  it("lists known kill switch keys", () => {
    expect(content).toContain("KILL_BLOCK_ALL_COMMS");
    expect(content).toContain("KILL_BLOCK_DELEGATION");
    expect(content).toContain("KILL_FORCE_READONLY");
  });

  it("lists known rate limit keys", () => {
    expect(content).toContain("LIMIT_MSG_PER_CASE");
    expect(content).toContain("LIMIT_CALLS_PER_CASE");
  });

  it("resets runtime config on PATCH", () => {
    expect(content).toContain("resetRuntimeConfig");
  });
});

// ─── SEC8: Manual Case Actions ────────────────────────────────────────

describe("SEC8: Manual case actions (PATCH)", () => {
  const content = readFile("src/app/api/operations/cases/[id]/route.ts");

  it("exports PATCH handler", () => {
    expect(content).toMatch(/export async function PATCH/);
  });

  it("supports close action", () => {
    expect(content).toContain('"close"');
    expect(content).toContain('"closed"');
    expect(content).toContain("closedAt");
  });

  it("supports reopen action", () => {
    expect(content).toContain('"reopen"');
    expect(content).toContain('"open"');
  });

  it("supports reassign action", () => {
    expect(content).toContain('"reassign"');
    expect(content).toContain("newOwnerId");
    expect(content).toContain("visibleOwnerId");
  });

  it("supports pause action", () => {
    expect(content).toContain('"pause"');
    expect(content).toContain('"waiting"');
  });

  it("supports mark_review action", () => {
    expect(content).toContain('"mark_review"');
    expect(content).toContain("markedForReview");
    expect(content).toContain("reviewReason");
  });

  it("validates action is in allowed set", () => {
    expect(content).toContain("VALID_ACTIONS");
    expect(content).toContain("Acción inválida");
  });

  it("requires auth", () => {
    expect(content).toContain("auth()");
    expect(content).toContain("No autorizado");
    expect(content).toContain("401");
  });

  it("verifies case ownership", () => {
    expect(content).toContain("session.user.id");
    expect(content).toContain("Caso no encontrado");
    expect(content).toContain("404");
  });

  it("records audit event for manual action", () => {
    expect(content).toContain("auditEvents");
    expect(content).toContain("manual_");
    expect(content).toContain('"human"');
    expect(content).toContain("performedBy");
  });
});

// ─── OFF1: 10 Agent ID Match (Backend ↔ UI) ──────────────────────────

describe("OFF1: 10 agents match between backend and UI", () => {
  const EXPECTED_AGENTS = [
    "ceo",
    "recepcion",
    "comercial-principal",
    "comercial-junior",
    "consultor-servicios",
    "consultor-digital",
    "legal-rgpd",
    "fiscal",
    "bi-scoring",
    "marketing-automation",
  ];

  it("state-builder.ts has all 10 agent IDs", () => {
    const content = readFile("src/lib/office/state-builder.ts");
    for (const id of EXPECTED_AGENTS) {
      expect(content).toContain(`"${id}"`);
    }
  });

  it("AgentOfficeMap.tsx has all 10 agent IDs", () => {
    const content = readFile("src/components/AgentOfficeMap.tsx");
    for (const id of EXPECTED_AGENTS) {
      expect(content).toContain(`"${id}"`);
    }
  });

  it("exactly 10 agents in AGENT_LAYER_MAP", () => {
    const content = readFile("src/lib/office/state-builder.ts");
    const matches = content.match(/"[a-z-]+":\s*"[a-z-]+"/g);
    // AGENT_LAYER_MAP should have exactly 10 entries
    const layerMapSection = content.slice(
      content.indexOf("AGENT_LAYER_MAP"),
      content.indexOf("}", content.indexOf("AGENT_LAYER_MAP")) + 1,
    );
    const agentEntries = layerMapSection.match(/"[a-z-]+":\s*"/g);
    expect(agentEntries).not.toBeNull();
    expect(agentEntries!.length).toBe(10);
  });
});

// ─── OFF2: Agent Layer Assignments ────────────────────────────────────

describe("OFF2: Agent layer assignments", () => {
  const content = readFile("src/lib/office/state-builder.ts");

  it("CEO is in gobierno layer", () => {
    expect(content).toMatch(/"ceo":\s*"gobierno"/);
  });

  it("recepcion is in visible layer", () => {
    expect(content).toMatch(/"recepcion":\s*"visible"/);
  });

  it("comercial-principal is in visible layer", () => {
    expect(content).toMatch(/"comercial-principal":\s*"visible"/);
  });

  it("comercial-junior is in visible layer", () => {
    expect(content).toMatch(/"comercial-junior":\s*"visible"/);
  });

  it("consultor-servicios is in experta-interna layer", () => {
    expect(content).toMatch(/"consultor-servicios":\s*"experta-interna"/);
  });

  it("consultor-digital is in experta-interna layer", () => {
    expect(content).toMatch(/"consultor-digital":\s*"experta-interna"/);
  });

  it("legal-rgpd is in experta-interna layer", () => {
    expect(content).toMatch(/"legal-rgpd":\s*"experta-interna"/);
  });

  it("fiscal is in modulo-interno layer", () => {
    expect(content).toMatch(/"fiscal":\s*"modulo-interno"/);
  });

  it("bi-scoring is in modulo-interno layer", () => {
    expect(content).toMatch(/"bi-scoring":\s*"modulo-interno"/);
  });

  it("marketing-automation is in modulo-interno layer", () => {
    expect(content).toMatch(/"marketing-automation":\s*"modulo-interno"/);
  });
});

// ─── OFF3: STATUS_MAP Coverage ────────────────────────────────────────

describe("OFF3: STATUS_MAP coverage", () => {
  const content = readFile("src/components/AgentOfficeMap.tsx");

  it("maps 'blocked' to 'blocked'", () => {
    expect(content).toMatch(/blocked:\s*"blocked"/);
  });

  it("maps 'active' to 'working'", () => {
    expect(content).toMatch(/active:\s*"working"/);
  });

  it("maps 'delegating' to 'delegating'", () => {
    expect(content).toMatch(/delegating:\s*"delegating"/);
  });

  it("maps 'internal_work' to 'thinking'", () => {
    expect(content).toMatch(/internal_work:\s*"thinking"/);
  });

  it("maps 'idle' to 'idle'", () => {
    expect(content).toMatch(/idle:\s*"idle"/);
  });

  it("maps 'offline' to 'idle'", () => {
    expect(content).toMatch(/offline:\s*"idle"/);
  });
});

// ─── OFF4: Blocked Visual State ───────────────────────────────────────

describe("OFF4: Blocked visual state in UI", () => {
  const content = readFile("src/components/AgentOfficeMap.tsx");

  it("AgentStatus type includes blocked", () => {
    expect(content).toMatch(/type AgentStatus\s*=.*"blocked"/);
  });

  it("STATUS_LABEL has blocked entry", () => {
    expect(content).toContain("Bloqueado");
  });

  it("red glow for blocked agents", () => {
    expect(content).toContain("rgba(239,68,68");
  });

  it("blocked conditional in badge styling", () => {
    expect(content).toContain('agent.status === "blocked"');
  });
});

// ─── OFF5: No Legacy/Duplicate Agents ─────────────────────────────────

describe("OFF5: No legacy or duplicate agents", () => {
  const stateBuilder = readFile("src/lib/office/state-builder.ts");
  const officeMap = readFile("src/components/AgentOfficeMap.tsx");

  const LEGACY_NAMES = ["marketing-director", "web-master", "energy-expert", "soporte-tecnico", "operaciones-interno", "infraestructura-seguridad"];

  for (const legacy of LEGACY_NAMES) {
    it(`no legacy agent '${legacy}' in state-builder`, () => {
      expect(stateBuilder).not.toContain(`"${legacy}"`);
    });

    it(`no legacy agent '${legacy}' in AgentOfficeMap`, () => {
      expect(officeMap).not.toContain(`"${legacy}"`);
    });
  }
});

// ─── OFF6: Ownership Visibility in Components ─────────────────────────

describe("OFF6: Ownership visibility", () => {
  it("state-builder includes visibleOwnerId in agent state", () => {
    const content = readFile("src/lib/office/state-builder.ts");
    expect(content).toContain("visibleOwnerId");
  });

  it("CaseDetailPanel shows owner info", () => {
    const content = readFile("src/components/operations/OperationsCaseDetailPanel.tsx");
    expect(content).toContain("visibleOwnerId");
    expect(content).toContain("Owner visible");
  });

  it("CaseListPanel shows owner per case", () => {
    const content = readFile("src/components/operations/OperationsCaseListPanel.tsx");
    expect(content).toContain("visibleOwnerId");
  });
});
