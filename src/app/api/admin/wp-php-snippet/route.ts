/**
 * POST /api/admin/wp-php-snippet
 *
 * Bypass del agente LLM para crear/actualizar snippet PHP en Code Snippets.
 * Útil cuando el agente desvía repetidamente a otra tool por sesgo de selección.
 *
 * Auth: Bearer CRON_SECRET o Bearer AGENT_API_KEY o admin session.
 *
 * Body: { siteId: string, title: string, code: string, scope?: string }
 * Returns: { ok, provider, id, action } | { error }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWpClient } from "@/lib/agent/wordpress";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/admin/wp-php-snippet" });
const ADMIN_EMAIL = "orihuela@somossinergia.es";

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const cronOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const agentOk = !!process.env.AGENT_API_KEY && authHeader === `Bearer ${process.env.AGENT_API_KEY}`;
  if (!cronOk && !agentOk) {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: { siteId?: string; title?: string; code?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { siteId, title, code, scope } = body;
  if (!siteId || !title || !code) {
    return NextResponse.json({ error: "siteId, title, code son obligatorios" }, { status: 400 });
  }
  const validScope = (scope as "global" | "front-end" | "admin" | "single-use") || "global";
  if (!["global", "front-end", "admin", "single-use"].includes(validScope)) {
    return NextResponse.json({ error: `scope inválido: ${validScope}` }, { status: 400 });
  }

  try {
    const wp = getWpClient(siteId);
    const result = await wp.customCss.setPhp(code, title, validScope);
    log.info({ siteId, title, action: result.action, id: result.id }, "wp-php-snippet ok");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError(log, err, { siteId, title }, "wp-php-snippet failed");
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/wp-php-snippet?siteId=X&title=Y
 */
export async function DELETE(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const cronOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const agentOk = !!process.env.AGENT_API_KEY && authHeader === `Bearer ${process.env.AGENT_API_KEY}`;
  if (!cronOk && !agentOk) {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const url = new URL(req.url);
  const siteId = url.searchParams.get("siteId");
  const title = url.searchParams.get("title");
  if (!siteId || !title) {
    return NextResponse.json({ error: "siteId y title son obligatorios" }, { status: 400 });
  }

  try {
    const wp = getWpClient(siteId);
    const result = await wp.customCss.deleteByTitle(title);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError(log, err, { siteId, title }, "wp-php-snippet delete failed");
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
