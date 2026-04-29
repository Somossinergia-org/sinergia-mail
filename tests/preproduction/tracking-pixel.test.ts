/**
 * PREPRODUCTION TESTS — Pixel tracking de aperturas de email.
 *
 * Cubre:
 *   - HMAC token generation determinista
 *   - HMAC token verification (válido vs inválido)
 *   - Resistencia a IDs maliciosos
 *   - Pixel GIF size correcto
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeOpenToken,
  verifyOpenToken,
  TRACKING_PIXEL_GIF,
} from "@/lib/tracking";

describe("Tracking — computeOpenToken", () => {
  beforeEach(() => {
    process.env.TRACKING_SECRET = "test-secret-please-do-not-use-in-prod";
  });

  it("genera token determinista para mismo msgId", () => {
    const t1 = computeOpenToken(42);
    const t2 = computeOpenToken(42);
    expect(t1).toBe(t2);
  });

  it("genera tokens distintos para msgIds distintos", () => {
    expect(computeOpenToken(42)).not.toBe(computeOpenToken(43));
  });

  it("token tiene length 12 chars hex", () => {
    const t = computeOpenToken(123);
    expect(t).toHaveLength(12);
    expect(t).toMatch(/^[0-9a-f]{12}$/);
  });

  it("acepta msgId como number o string", () => {
    expect(computeOpenToken(99)).toBe(computeOpenToken("99"));
  });
});

describe("Tracking — verifyOpenToken", () => {
  beforeEach(() => {
    process.env.TRACKING_SECRET = "test-secret-please-do-not-use-in-prod";
  });

  it("acepta token válido", () => {
    const token = computeOpenToken(100);
    expect(verifyOpenToken(100, token)).toBe(true);
  });

  it("rechaza token de otro msgId", () => {
    const token = computeOpenToken(100);
    expect(verifyOpenToken(101, token)).toBe(false);
  });

  it("rechaza token vacío", () => {
    expect(verifyOpenToken(100, "")).toBe(false);
  });

  it("rechaza token con length distinto a 12", () => {
    expect(verifyOpenToken(100, "abc")).toBe(false);
    expect(verifyOpenToken(100, "abcdef0123456789abcdef")).toBe(false);
  });

  it("rechaza token claramente falsificado", () => {
    expect(verifyOpenToken(100, "000000000000")).toBe(false);
    expect(verifyOpenToken(100, "ffffffffffff")).toBe(false);
  });

  it("cambia si TRACKING_SECRET cambia (rotación de secret invalida tokens)", () => {
    const t1 = computeOpenToken(50);
    process.env.TRACKING_SECRET = "different-secret";
    const t2 = computeOpenToken(50);
    expect(t1).not.toBe(t2);
    expect(verifyOpenToken(50, t1)).toBe(false);
  });
});

describe("Tracking — TRACKING_PIXEL_GIF", () => {
  it("es un Buffer válido de 43 bytes (GIF transparente 1×1 estándar)", () => {
    expect(Buffer.isBuffer(TRACKING_PIXEL_GIF)).toBe(true);
    expect(TRACKING_PIXEL_GIF.length).toBe(43);
  });

  it("empieza con magic bytes GIF89a", () => {
    expect(TRACKING_PIXEL_GIF.slice(0, 6).toString("ascii")).toBe("GIF89a");
  });
});
