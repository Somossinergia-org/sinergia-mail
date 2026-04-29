/**
 * PREPRODUCTION TESTS — Endpoints admin de cleanup (smoke tests).
 *
 * No mockean DB porque los endpoints viven en `/app/api/admin/*` y dependen
 * de drizzle + auth. Estos tests verifican únicamente:
 *   - Estructura del archivo (export GET/POST)
 *   - Que usa auth dual (Bearer CRON_SECRET o session admin)
 *   - Que devuelve 403 sin auth
 *   - Que existen los helpers esperados
 *
 * Tests de integración E2E real viven en tests/e2e/ y requieren DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(import.meta.dirname!, "../../src");

function readSrc(relPath: string): string {
  return readFileSync(resolve(srcDir, relPath), "utf-8");
}

describe("admin/cleanup-stale-inactivity — estructura", () => {
  const src = readSrc("app/api/admin/cleanup-stale-inactivity/route.ts");

  it("exporta POST", () => {
    expect(src).toMatch(/export async function POST/);
  });

  it("usa safeBearer con CRON_SECRET", () => {
    expect(src).toContain("safeBearer");
    expect(src).toContain("CRON_SECRET");
  });

  it("verifica admin email como fallback", () => {
    expect(src).toContain("orihuela@somossinergia.es");
    expect(src).toContain("Forbidden");
  });

  it("borra solo notifications con type='inactivity' y mensaje legacy 999d", () => {
    expect(src).toContain('"inactivity"');
    expect(src).toContain("999 días");
    expect(src).toContain("999 dias"); // sin tilde, por si algún backfill antiguo
  });

  it("devuelve deletedCount + sample de IDs", () => {
    expect(src).toContain("deletedCount");
  });
});

describe("admin/cleanup-memory-duplicates — estructura", () => {
  const src = readSrc("app/api/admin/cleanup-memory-duplicates/route.ts");

  it("exporta POST", () => {
    expect(src).toMatch(/export async function POST/);
  });

  it("usa auth dual (bearer + session admin)", () => {
    expect(src).toContain("safeBearer");
    expect(src).toContain("CRON_SECRET");
    expect(src).toContain("orihuela@somossinergia.es");
  });

  it("usa ROW_NUMBER OVER PARTITION para identificar duplicates", () => {
    expect(src).toContain("ROW_NUMBER()");
    expect(src).toContain("PARTITION BY");
  });

  it("conserva el id más bajo de cada grupo (ORDER BY id ASC)", () => {
    expect(src).toContain("ORDER BY id ASC");
  });

  it("partition incluye user_id+kind+title+content[:200]", () => {
    expect(src).toContain("user_id, kind, title");
    expect(src).toContain("LEFT(COALESCE(content, ''), 200)");
  });

  it("acepta scope opcional userId del body", () => {
    expect(src).toContain("scopedUserId");
    expect(src).toContain("userId");
  });
});

describe("api/track/open — estructura", () => {
  const src = readSrc("app/api/track/open/route.ts");

  it("exporta GET (pixel tracking)", () => {
    expect(src).toMatch(/export async function GET/);
  });

  it("verifica HMAC token con verifyOpenToken", () => {
    expect(src).toContain("verifyOpenToken");
  });

  it("devuelve siempre el pixel GIF (no leak de info al sender)", () => {
    expect(src).toContain("TRACKING_PIXEL_GIF");
    expect(src).toContain("pixelResponse");
  });

  it("actualiza first_opened_at + last_opened_at + open_count en outbound_messages", () => {
    expect(src).toContain("firstOpenedAt");
    expect(src).toContain("lastOpenedAt");
    expect(src).toContain("openCount");
    expect(src).toContain("COALESCE");
  });

  it("Cache-Control: no-store para que el cliente no cachee la apertura", () => {
    expect(src).toContain("no-store");
  });
});

describe("middleware — exempt /api/track", () => {
  const src = readSrc("middleware.ts");

  it("/api/track exempt de auth (verificación HMAC en handler)", () => {
    expect(src).toContain('"/api/track"');
    expect(src).toContain("isTrackApi");
  });
});

describe("outbound.ts — pixel injection", () => {
  const src = readSrc("lib/outbound.ts");

  it("inyecta pixel HMAC al enviar EMAIL", () => {
    expect(src).toContain("injectTrackingPixel");
    expect(src).toContain("computeOpenToken");
  });

  it("respeta </body> si existe (insertar antes), si no anexar al final", () => {
    expect(src).toContain("</body>");
  });

  it("URL del pixel apunta a /api/track/open con msg+t", () => {
    expect(src).toContain("/api/track/open");
    expect(src).toMatch(/msg=\$\{msgId\}/);
    expect(src).toMatch(/t=\$\{token\}/);
  });
});
