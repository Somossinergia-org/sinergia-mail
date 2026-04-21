import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/operations/switches — List all runtime switches.
 * PATCH /api/operations/switches — Update a switch value.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { getAllSwitches } = await import("@/lib/runtime/db-switches");
    const switches = await getAllSwitches();
    const entries = Array.from(switches.entries()).map(([key, value]) => ({ key, value }));

    // Also include well-known keys with defaults if not in DB
    const KNOWN_KEYS = [
      { key: "KILL_BLOCK_ALL_COMMS", description: "Bloquear TODAS las comunicaciones externas", default: "false" },
      { key: "KILL_BLOCK_WA_SMS_PHONE", description: "Bloquear WhatsApp + SMS + teléfono", default: "false" },
      { key: "KILL_BLOCK_DELEGATION", description: "Bloquear delegación entre agentes", default: "false" },
      { key: "KILL_BLOCK_HIGH_RISK", description: "Bloquear herramientas de alto riesgo", default: "false" },
      { key: "KILL_FORCE_READONLY", description: "Forzar modo solo lectura", default: "false" },
      { key: "KILL_DISABLE_JUNIOR", description: "Deshabilitar Comercial Junior", default: "false" },
      { key: "KILL_BLOCKED_CHANNELS", description: "Canales bloqueados (lista separada por comas)", default: "" },
      { key: "LIMIT_MSG_PER_CASE", description: "Max mensajes externos por caso", default: "0" },
      { key: "LIMIT_MSG_PER_CLIENT", description: "Max mensajes por cliente en ventana", default: "0" },
      { key: "LIMIT_CALLS_PER_CASE", description: "Max llamadas por caso", default: "0" },
      { key: "LIMIT_ESCALATIONS", description: "Max escalaciones encadenadas", default: "3" },
      { key: "LIMIT_TOOL_RETRIES", description: "Max reintentos por herramienta", default: "1" },
      { key: "LIMIT_CONTACT_COOLDOWN", description: "Cooldown entre contactos (seg)", default: "0" },
      { key: "LIMIT_HIGH_RISK_PER_CASE", description: "Max herramientas de alto riesgo por caso", default: "0" },
    ];

    const switchMap = new Map(entries.map((e) => [e.key, e.value]));
    const result = KNOWN_KEYS.map((k) => ({
      key: k.key,
      value: switchMap.get(k.key) ?? process.env[k.key] ?? k.default,
      description: k.description,
      source: switchMap.has(k.key) ? "db" : process.env[k.key] !== undefined ? "env" : "default",
    }));

    return NextResponse.json({ switches: result });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al obtener switches", detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { key?: string; value?: string };
    if (!body.key || body.value === undefined) {
      return NextResponse.json({ error: "key y value son requeridos" }, { status: 400 });
    }

    const { setSwitch } = await import("@/lib/runtime/db-switches");
    const { resetRuntimeConfig } = await import("@/lib/runtime/config");

    await setSwitch(body.key, body.value, session.user.id);
    resetRuntimeConfig(); // Force refresh on next access

    return NextResponse.json({ ok: true, key: body.key, value: body.value });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al actualizar switch", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
