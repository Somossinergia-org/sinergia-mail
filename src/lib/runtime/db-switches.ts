/**
 * DB-Backed Runtime Switches — Hot kill switches & rate limits changeable without redeploy.
 *
 * Reads from `runtime_switches` table with a TTL cache (default 30s).
 * Falls back to env vars if DB is unavailable or key not found.
 *
 * Usage:
 *   import { getSwitch, setSwitch, refreshSwitchCache } from "@/lib/runtime/db-switches";
 *   const blocked = await getSwitch("KILL_BLOCK_ALL_COMMS", "false");
 *   await setSwitch("KILL_BLOCK_ALL_COMMS", "true", "admin@sinergia.es");
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// ─── Cache Layer ────────────────────────────────────────────────────────

interface CacheEntry {
  value: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
const _cache = new Map<string, CacheEntry>();
let _allFetchedAt = 0;
let _allCache = new Map<string, string>();

/** Fetch a single switch from DB with caching. Falls back to env var. */
export async function getSwitch(key: string, defaultValue: string = ""): Promise<string> {
  // Check memory cache first
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const row = await db.query.runtimeSwitches.findFirst({
      where: eq(schema.runtimeSwitches.key, key),
    });

    if (row) {
      _cache.set(key, { value: row.value, fetchedAt: Date.now() });
      return row.value;
    }
  } catch {
    // DB unavailable — fall through to env
  }

  // Fallback: env var
  const envVal = process.env[key];
  if (envVal !== undefined) return envVal;

  return defaultValue;
}

/** Fetch a boolean switch. Truthy: "true", "1", "yes". */
export async function getSwitchBool(key: string, defaultValue: boolean = false): Promise<boolean> {
  const val = await getSwitch(key, defaultValue ? "true" : "false");
  return ["true", "1", "yes"].includes(val.toLowerCase());
}

/** Fetch a numeric switch. */
export async function getSwitchNum(key: string, defaultValue: number): Promise<number> {
  const val = await getSwitch(key, String(defaultValue));
  const n = Number(val);
  return Number.isFinite(n) ? n : defaultValue;
}

/** Fetch ALL switches at once (batch read, refreshes cache). */
export async function getAllSwitches(): Promise<Map<string, string>> {
  if (Date.now() - _allFetchedAt < CACHE_TTL_MS) {
    return _allCache;
  }

  try {
    const rows = await db.select().from(schema.runtimeSwitches);
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.key, row.value);
      _cache.set(row.key, { value: row.value, fetchedAt: Date.now() });
    }
    _allCache = map;
    _allFetchedAt = Date.now();
    return map;
  } catch {
    return _allCache; // Return stale cache if DB fails
  }
}

// ─── Write ──────────────────────────────────────────────────────────────

/** Set a switch value in the DB (upsert). */
export async function setSwitch(key: string, value: string, updatedBy?: string, description?: string): Promise<void> {
  const existing = await db.query.runtimeSwitches.findFirst({
    where: eq(schema.runtimeSwitches.key, key),
  });

  if (existing) {
    await db.update(schema.runtimeSwitches)
      .set({
        value,
        updatedBy: updatedBy || existing.updatedBy,
        description: description || existing.description,
        updatedAt: new Date(),
      })
      .where(eq(schema.runtimeSwitches.key, key));
  } else {
    await db.insert(schema.runtimeSwitches).values({
      key,
      value,
      description: description || null,
      updatedBy: updatedBy || null,
    });
  }

  // Update cache immediately
  _cache.set(key, { value, fetchedAt: Date.now() });
  _allCache.set(key, value);
}

// ─── Cache Control ──────────────────────────────────────────────────────

/** Force-refresh the entire cache from DB. */
export async function refreshSwitchCache(): Promise<void> {
  _allFetchedAt = 0;
  _cache.clear();
  await getAllSwitches();
}

/** Clear the cache (for testing). */
export function clearSwitchCache(): void {
  _cache.clear();
  _allCache.clear();
  _allFetchedAt = 0;
}

// ─── Integration with getRuntimeConfig ──────────────────────────────────

/**
 * Build kill switches from DB, falling back to env vars.
 * Called by the enhanced getRuntimeConfig when DB switches are available.
 */
export async function getKillSwitchesFromDB(): Promise<{
  blockAllExternalComms: boolean;
  blockWhatsappSmsPhone: boolean;
  blockDelegation: boolean;
  blockHighRiskTools: boolean;
  forceReadOnly: boolean;
  disableJunior: boolean;
  blockedChannels: Set<string>;
}> {
  const [
    blockAll,
    blockWaSms,
    blockDeleg,
    blockHigh,
    readOnly,
    noJunior,
    blockedCh,
  ] = await Promise.all([
    getSwitchBool("KILL_BLOCK_ALL_COMMS"),
    getSwitchBool("KILL_BLOCK_WA_SMS_PHONE"),
    getSwitchBool("KILL_BLOCK_DELEGATION"),
    getSwitchBool("KILL_BLOCK_HIGH_RISK"),
    getSwitchBool("KILL_FORCE_READONLY"),
    getSwitchBool("KILL_DISABLE_JUNIOR"),
    getSwitch("KILL_BLOCKED_CHANNELS", ""),
  ]);

  return {
    blockAllExternalComms: blockAll,
    blockWhatsappSmsPhone: blockWaSms,
    blockDelegation: blockDeleg,
    blockHighRiskTools: blockHigh,
    forceReadOnly: readOnly,
    disableJunior: noJunior,
    blockedChannels: new Set(
      blockedCh ? blockedCh.split(",").map((s) => s.trim()).filter(Boolean) : [],
    ),
  };
}

/**
 * Build rate limits from DB, falling back to env vars / mode defaults.
 */
export async function getRateLimitsFromDB(defaults: {
  maxMessagesPerCase: number;
  maxMessagesPerClientWindow: number;
  clientWindowMinutes: number;
  maxCallsPerCase: number;
  maxChainedEscalations: number;
  maxToolRetries: number;
  cooldownBetweenContactsSec: number;
  maxHighRiskToolsPerCase: number;
}): Promise<typeof defaults> {
  const [msgCase, msgClient, clientWin, calls, esc, retries, cooldown, highRisk] = await Promise.all([
    getSwitchNum("LIMIT_MSG_PER_CASE", defaults.maxMessagesPerCase),
    getSwitchNum("LIMIT_MSG_PER_CLIENT", defaults.maxMessagesPerClientWindow),
    getSwitchNum("LIMIT_CLIENT_WINDOW_MIN", defaults.clientWindowMinutes),
    getSwitchNum("LIMIT_CALLS_PER_CASE", defaults.maxCallsPerCase),
    getSwitchNum("LIMIT_ESCALATIONS", defaults.maxChainedEscalations),
    getSwitchNum("LIMIT_TOOL_RETRIES", defaults.maxToolRetries),
    getSwitchNum("LIMIT_CONTACT_COOLDOWN", defaults.cooldownBetweenContactsSec),
    getSwitchNum("LIMIT_HIGH_RISK_PER_CASE", defaults.maxHighRiskToolsPerCase),
  ]);

  return {
    maxMessagesPerCase: msgCase,
    maxMessagesPerClientWindow: msgClient,
    clientWindowMinutes: clientWin,
    maxCallsPerCase: calls,
    maxChainedEscalations: esc,
    maxToolRetries: retries,
    cooldownBetweenContactsSec: cooldown,
    maxHighRiskToolsPerCase: highRisk,
  };
}
