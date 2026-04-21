/**
 * Runtime Configuration — Feature flags, operation modes, kill switches, rate limits.
 *
 * Configurable via environment variables. Designed for controlled go-live
 * of Architecture v2 with safe rollback at every level.
 *
 * Hierarchy:
 *   OperationMode  →  global behavior (dry-run / shadow / guarded / production)
 *   KillSwitches   →  instant toggles to block specific capabilities
 *   RateLimits     →  numerical caps to prevent operational disasters
 *
 * Usage:
 *   import { runtimeConfig, OperationMode } from "@/lib/runtime/config";
 *   if (runtimeConfig.mode === OperationMode.DRY_RUN) { ... }
 *   if (runtimeConfig.killSwitches.blockAllExternalComms) { ... }
 */

// ─── Operation Modes ─────────────────────────────────────────────────────

export enum OperationMode {
  /** Simulate everything. No real external actions. Full audit trail. */
  DRY_RUN = "dry-run",
  /** System runs and decides, but external actions are logged-only or limited. */
  SHADOW = "shadow",
  /** Real actions allowed, but with extra guardrails and lower limits. */
  GUARDED = "guarded",
  /** Full production. All safety systems still active, limits relaxed. */
  PRODUCTION = "production",
}

// ─── Kill Switches ───────────────────────────────────────────────────────

export interface KillSwitches {
  /** Block ALL external communication (WhatsApp, SMS, email, calls, voice) */
  blockAllExternalComms: boolean;
  /** Block only WhatsApp + SMS + phone calls (keep email) */
  blockWhatsappSmsPhone: boolean;
  /** Block all agent delegation */
  blockDelegation: boolean;
  /** Block high-risk tools (bulk operations, automated rules, etc.) */
  blockHighRiskTools: boolean;
  /** Force read-only mode — no writes, no sends, no mutations */
  forceReadOnly: boolean;
  /** Disable Comercial Junior — all Junior cases go to Principal */
  disableJunior: boolean;
  /** Block specific channels by name */
  blockedChannels: Set<string>;
}

// ─── Rate Limits ─────────────────────────────────────────────────────────

export interface RateLimits {
  /** Max external messages per case (across all channels) */
  maxMessagesPerCase: number;
  /** Max external messages per client in a rolling time window */
  maxMessagesPerClientWindow: number;
  /** Rolling window duration in minutes for per-client limit */
  clientWindowMinutes: number;
  /** Max phone calls per case */
  maxCallsPerCase: number;
  /** Max chained escalations before forcing human review */
  maxChainedEscalations: number;
  /** Max retries per failed tool */
  maxToolRetries: number;
  /** Cooldown in seconds between visible contacts to same client */
  cooldownBetweenContactsSec: number;
  /** Max high-risk tool invocations per case */
  maxHighRiskToolsPerCase: number;
}

// ─── High-Risk Tools ─────────────────────────────────────────────────────

export const HIGH_RISK_TOOLS = new Set([
  "bulk_categorize",
  "create_email_rule",
  "delete_email_rule",
  "make_phone_call",
  "draft_and_send",
  "speak_with_voice",
]);

// ─── Defaults per Mode ───────────────────────────────────────────────────

const RATE_LIMITS_BY_MODE: Record<OperationMode, RateLimits> = {
  [OperationMode.DRY_RUN]: {
    maxMessagesPerCase: 0,
    maxMessagesPerClientWindow: 0,
    clientWindowMinutes: 60,
    maxCallsPerCase: 0,
    maxChainedEscalations: 3,
    maxToolRetries: 1,
    cooldownBetweenContactsSec: 0,
    maxHighRiskToolsPerCase: 0,
  },
  [OperationMode.SHADOW]: {
    maxMessagesPerCase: 2,
    maxMessagesPerClientWindow: 3,
    clientWindowMinutes: 60,
    maxCallsPerCase: 0,
    maxChainedEscalations: 3,
    maxToolRetries: 1,
    cooldownBetweenContactsSec: 300,
    maxHighRiskToolsPerCase: 1,
  },
  [OperationMode.GUARDED]: {
    maxMessagesPerCase: 5,
    maxMessagesPerClientWindow: 8,
    clientWindowMinutes: 60,
    maxCallsPerCase: 1,
    maxChainedEscalations: 4,
    maxToolRetries: 2,
    cooldownBetweenContactsSec: 120,
    maxHighRiskToolsPerCase: 3,
  },
  [OperationMode.PRODUCTION]: {
    maxMessagesPerCase: 20,
    maxMessagesPerClientWindow: 30,
    clientWindowMinutes: 60,
    maxCallsPerCase: 5,
    maxChainedEscalations: 6,
    maxToolRetries: 3,
    cooldownBetweenContactsSec: 30,
    maxHighRiskToolsPerCase: 10,
  },
};

// ─── Runtime Configuration ───────────────────────────────────────────────

export interface RuntimeConfig {
  mode: OperationMode;
  killSwitches: KillSwitches;
  rateLimits: RateLimits;
}

/** Parse a comma-separated env var into a Set */
function parseSet(envVal: string | undefined): Set<string> {
  if (!envVal) return new Set();
  return new Set(envVal.split(",").map((s) => s.trim()).filter(Boolean));
}

/** Parse a boolean env var (truthy: "true", "1", "yes") */
function parseBool(envVal: string | undefined, defaultVal: boolean = false): boolean {
  if (!envVal) return defaultVal;
  return ["true", "1", "yes"].includes(envVal.toLowerCase());
}

/** Parse an integer env var with a default */
function parseInt(envVal: string | undefined, defaultVal: number): number {
  if (!envVal) return defaultVal;
  const n = Number(envVal);
  return Number.isFinite(n) ? n : defaultVal;
}

/** Build the runtime config from environment variables */
export function buildRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  const mode = (env.SINERGIA_MODE as OperationMode) || OperationMode.DRY_RUN;
  const defaults = RATE_LIMITS_BY_MODE[mode] ?? RATE_LIMITS_BY_MODE[OperationMode.DRY_RUN];

  return {
    mode,
    killSwitches: {
      blockAllExternalComms: parseBool(env.KILL_BLOCK_ALL_COMMS),
      blockWhatsappSmsPhone: parseBool(env.KILL_BLOCK_WA_SMS_PHONE),
      blockDelegation: parseBool(env.KILL_BLOCK_DELEGATION),
      blockHighRiskTools: parseBool(env.KILL_BLOCK_HIGH_RISK),
      forceReadOnly: parseBool(env.KILL_FORCE_READONLY),
      disableJunior: parseBool(env.KILL_DISABLE_JUNIOR),
      blockedChannels: parseSet(env.KILL_BLOCKED_CHANNELS),
    },
    rateLimits: {
      maxMessagesPerCase: parseInt(env.LIMIT_MSG_PER_CASE, defaults.maxMessagesPerCase),
      maxMessagesPerClientWindow: parseInt(env.LIMIT_MSG_PER_CLIENT, defaults.maxMessagesPerClientWindow),
      clientWindowMinutes: parseInt(env.LIMIT_CLIENT_WINDOW_MIN, defaults.clientWindowMinutes),
      maxCallsPerCase: parseInt(env.LIMIT_CALLS_PER_CASE, defaults.maxCallsPerCase),
      maxChainedEscalations: parseInt(env.LIMIT_ESCALATIONS, defaults.maxChainedEscalations),
      maxToolRetries: parseInt(env.LIMIT_TOOL_RETRIES, defaults.maxToolRetries),
      cooldownBetweenContactsSec: parseInt(env.LIMIT_CONTACT_COOLDOWN, defaults.cooldownBetweenContactsSec),
      maxHighRiskToolsPerCase: parseInt(env.LIMIT_HIGH_RISK_PER_CASE, defaults.maxHighRiskToolsPerCase),
    },
  };
}

// ─── Singleton (rebuilt if env changes — for testing, use buildRuntimeConfig directly) ──

let _config: RuntimeConfig | null = null;
let _configFetchedAt = 0;
const CONFIG_TTL_MS = 30_000; // 30s — matches db-switches TTL

export function getRuntimeConfig(): RuntimeConfig {
  if (!_config) _config = buildRuntimeConfig();
  return _config;
}

/**
 * Async version that checks DB-backed switches for hot kill switches.
 * Falls back to env-only config if DB is unavailable.
 * Cached for 30 seconds to avoid DB hits on every request.
 */
export async function getRuntimeConfigAsync(): Promise<RuntimeConfig> {
  if (_config && Date.now() - _configFetchedAt < CONFIG_TTL_MS) {
    return _config;
  }

  try {
    const { getKillSwitchesFromDB, getRateLimitsFromDB } = await import("./db-switches");
    const envConfig = buildRuntimeConfig();

    const [killSwitches, rateLimits] = await Promise.all([
      getKillSwitchesFromDB(),
      getRateLimitsFromDB(envConfig.rateLimits),
    ]);

    _config = { mode: envConfig.mode, killSwitches, rateLimits };
    _configFetchedAt = Date.now();
    return _config;
  } catch {
    // DB unavailable — fall back to env-only
    if (!_config) _config = buildRuntimeConfig();
    return _config;
  }
}

/** Reset the singleton (for testing / hot-reload) */
export function resetRuntimeConfig(): void {
  _config = null;
  _configFetchedAt = 0;
}

/** Override the singleton with a custom config (for testing) */
export function setRuntimeConfig(config: RuntimeConfig): void {
  _config = config;
  _configFetchedAt = Date.now();
}

// ─── Convenience helpers ─────────────────────────────────────────────────

export function isDryRun(): boolean {
  return getRuntimeConfig().mode === OperationMode.DRY_RUN;
}

export function isShadow(): boolean {
  return getRuntimeConfig().mode === OperationMode.SHADOW;
}

export function isGuarded(): boolean {
  return getRuntimeConfig().mode === OperationMode.GUARDED;
}

export function isProduction(): boolean {
  return getRuntimeConfig().mode === OperationMode.PRODUCTION;
}

export function isExternalCommsBlocked(): boolean {
  const cfg = getRuntimeConfig();
  return cfg.killSwitches.blockAllExternalComms || cfg.killSwitches.forceReadOnly || cfg.mode === OperationMode.DRY_RUN;
}

export function isChannelBlocked(channel: string): boolean {
  const ks = getRuntimeConfig().killSwitches;
  if (ks.blockAllExternalComms) return true;
  if (ks.blockedChannels.has(channel)) return true;
  if (ks.blockWhatsappSmsPhone && ["send_whatsapp", "send_sms", "make_phone_call"].includes(channel)) return true;
  return false;
}

export function isDelegationBlocked(): boolean {
  const cfg = getRuntimeConfig();
  return cfg.killSwitches.blockDelegation || cfg.killSwitches.forceReadOnly;
}

export function isJuniorDisabled(): boolean {
  return getRuntimeConfig().killSwitches.disableJunior;
}

export function isReadOnly(): boolean {
  return getRuntimeConfig().killSwitches.forceReadOnly;
}
