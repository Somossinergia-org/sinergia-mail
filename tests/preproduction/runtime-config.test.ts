/**
 * PREPRODUCTION TESTS — Runtime config, feature flags, kill switches, rate limits.
 *
 * Validates that the go-live safety systems work correctly before deployment.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  OperationMode,
  buildRuntimeConfig,
  setRuntimeConfig,
  resetRuntimeConfig,
  getRuntimeConfig,
  isDryRun,
  isShadow,
  isGuarded,
  isProduction,
  isExternalCommsBlocked,
  isChannelBlocked,
  isDelegationBlocked,
  isJuniorDisabled,
  isReadOnly,
  HIGH_RISK_TOOLS,
} from "@/lib/runtime/config";

// ─── P1: Operation Modes ─────────────────────────────────────────────────

describe("P1 — Operation Modes", () => {
  beforeEach(() => resetRuntimeConfig());

  it("default mode es dry-run (más seguro)", () => {
    const cfg = buildRuntimeConfig({});
    expect(cfg.mode).toBe(OperationMode.DRY_RUN);
  });

  it("cada modo se configura correctamente desde env", () => {
    for (const mode of ["dry-run", "shadow", "guarded", "production"] as OperationMode[]) {
      const cfg = buildRuntimeConfig({ SINERGIA_MODE: mode });
      expect(cfg.mode).toBe(mode);
    }
  });

  it("dry-run tiene rate limits a 0 para mensajes/llamadas", () => {
    const cfg = buildRuntimeConfig({ SINERGIA_MODE: "dry-run" });
    expect(cfg.rateLimits.maxMessagesPerCase).toBe(0);
    expect(cfg.rateLimits.maxCallsPerCase).toBe(0);
    expect(cfg.rateLimits.maxHighRiskToolsPerCase).toBe(0);
  });

  it("shadow tiene límites bajos", () => {
    const cfg = buildRuntimeConfig({ SINERGIA_MODE: "shadow" });
    expect(cfg.rateLimits.maxMessagesPerCase).toBe(2);
    expect(cfg.rateLimits.maxCallsPerCase).toBe(0);
  });

  it("guarded tiene límites moderados", () => {
    const cfg = buildRuntimeConfig({ SINERGIA_MODE: "guarded" });
    expect(cfg.rateLimits.maxMessagesPerCase).toBe(5);
    expect(cfg.rateLimits.maxCallsPerCase).toBe(1);
  });

  it("production tiene límites relajados", () => {
    const cfg = buildRuntimeConfig({ SINERGIA_MODE: "production" });
    expect(cfg.rateLimits.maxMessagesPerCase).toBe(20);
    expect(cfg.rateLimits.maxCallsPerCase).toBe(5);
  });

  it("convenience helpers reflejan el modo correcto", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "dry-run" }));
    expect(isDryRun()).toBe(true);
    expect(isShadow()).toBe(false);

    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "shadow" }));
    expect(isShadow()).toBe(true);
    expect(isDryRun()).toBe(false);

    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "guarded" }));
    expect(isGuarded()).toBe(true);

    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production" }));
    expect(isProduction()).toBe(true);
  });
});

// ─── P2: Kill Switches ───────────────────────────────────────────────────

describe("P2 — Kill Switches", () => {
  beforeEach(() => resetRuntimeConfig());

  it("todos los kill switches off por defecto", () => {
    const cfg = buildRuntimeConfig({});
    expect(cfg.killSwitches.blockAllExternalComms).toBe(false);
    expect(cfg.killSwitches.blockWhatsappSmsPhone).toBe(false);
    expect(cfg.killSwitches.blockDelegation).toBe(false);
    expect(cfg.killSwitches.blockHighRiskTools).toBe(false);
    expect(cfg.killSwitches.forceReadOnly).toBe(false);
    expect(cfg.killSwitches.disableJunior).toBe(false);
    expect(cfg.killSwitches.blockedChannels.size).toBe(0);
  });

  it("KILL_BLOCK_ALL_COMMS bloquea comunicación externa", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production", KILL_BLOCK_ALL_COMMS: "true" }));
    expect(isExternalCommsBlocked()).toBe(true);
  });

  it("KILL_BLOCK_WA_SMS_PHONE bloquea canales específicos", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production", KILL_BLOCK_WA_SMS_PHONE: "true" }));
    expect(isChannelBlocked("send_whatsapp")).toBe(true);
    expect(isChannelBlocked("send_sms")).toBe(true);
    expect(isChannelBlocked("make_phone_call")).toBe(true);
    expect(isChannelBlocked("send_email_transactional")).toBe(false);
  });

  it("KILL_BLOCKED_CHANNELS bloquea canales individuales", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production", KILL_BLOCKED_CHANNELS: "send_whatsapp,send_telegram" }));
    expect(isChannelBlocked("send_whatsapp")).toBe(true);
    expect(isChannelBlocked("send_telegram")).toBe(true);
    expect(isChannelBlocked("send_sms")).toBe(false);
  });

  it("KILL_BLOCK_DELEGATION bloquea delegación", () => {
    setRuntimeConfig(buildRuntimeConfig({ KILL_BLOCK_DELEGATION: "true" }));
    expect(isDelegationBlocked()).toBe(true);
  });

  it("KILL_DISABLE_JUNIOR desactiva Junior", () => {
    setRuntimeConfig(buildRuntimeConfig({ KILL_DISABLE_JUNIOR: "true" }));
    expect(isJuniorDisabled()).toBe(true);
  });

  it("KILL_FORCE_READONLY activa solo lectura", () => {
    setRuntimeConfig(buildRuntimeConfig({ KILL_FORCE_READONLY: "true" }));
    expect(isReadOnly()).toBe(true);
    expect(isExternalCommsBlocked()).toBe(true);
    expect(isDelegationBlocked()).toBe(true);
  });

  it("dry-run siempre bloquea comunicación externa", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "dry-run" }));
    expect(isExternalCommsBlocked()).toBe(true);
  });
});

// ─── P3: Rate Limit Overrides ────────────────────────────────────────────

describe("P3 — Rate Limit Overrides via env", () => {
  beforeEach(() => resetRuntimeConfig());

  it("env vars overriden valores por defecto del modo", () => {
    const cfg = buildRuntimeConfig({
      SINERGIA_MODE: "guarded",
      LIMIT_MSG_PER_CASE: "99",
      LIMIT_CALLS_PER_CASE: "10",
    });
    expect(cfg.rateLimits.maxMessagesPerCase).toBe(99);
    expect(cfg.rateLimits.maxCallsPerCase).toBe(10);
  });

  it("env var inválido usa default del modo", () => {
    const cfg = buildRuntimeConfig({
      SINERGIA_MODE: "guarded",
      LIMIT_MSG_PER_CASE: "notanumber",
    });
    expect(cfg.rateLimits.maxMessagesPerCase).toBe(5); // guarded default
  });
});

// ─── P4: HIGH_RISK_TOOLS ────────────────────────────────────────────────

describe("P4 — High Risk Tools", () => {
  it("contiene las tools esperadas", () => {
    expect(HIGH_RISK_TOOLS.has("bulk_categorize")).toBe(true);
    expect(HIGH_RISK_TOOLS.has("make_phone_call")).toBe(true);
    expect(HIGH_RISK_TOOLS.has("draft_and_send")).toBe(true);
    expect(HIGH_RISK_TOOLS.has("speak_with_voice")).toBe(true);
  });

  it("no contiene tools normales", () => {
    expect(HIGH_RISK_TOOLS.has("web_search")).toBe(false);
    expect(HIGH_RISK_TOOLS.has("smart_search")).toBe(false);
    expect(HIGH_RISK_TOOLS.has("memory_search")).toBe(false);
  });
});
