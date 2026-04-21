/**
 * POST /api/ops-config/seed — Ejecuta la carga inicial de datos operativos.
 * Idempotente: borra datos existentes del usuario antes de insertar.
 * Solo admins / owner deberían poder ejecutarlo.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { SERVICES, AGENTS, EMAIL_RULES, PARTNERS } from "@/lib/ops-config/seed-data";

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return err("No autorizado", 401);
  const userId = session.user.id;

  try {
    // ── 1. Limpiar datos existentes del usuario (orden inverso por FK) ──
    // Documents y checklists se borran en cascade con servicios
    await db.delete(schema.opsAgentRoles).where(eq(schema.opsAgentRoles.userId, userId));
    await db.delete(schema.emailRules).where(eq(schema.emailRules.userId, userId));
    await db.delete(schema.partners).where(eq(schema.partners.userId, userId));
    await db.delete(schema.serviceCatalog).where(eq(schema.serviceCatalog.userId, userId));

    // ── 2. Insertar servicios con docs y checklists ──
    let servicesCreated = 0;
    let docsCreated = 0;
    let tasksCreated = 0;

    for (const svc of SERVICES) {
      const { _docs, _tasks, ...serviceData } = svc;
      const [inserted] = await db.insert(schema.serviceCatalog)
        .values({ ...serviceData, userId })
        .returning({ id: schema.serviceCatalog.id });

      servicesCreated++;

      if (_docs.length > 0) {
        await db.insert(schema.serviceDocuments)
          .values(_docs.map(d => ({ ...d, serviceId: inserted.id })));
        docsCreated += _docs.length;
      }

      if (_tasks.length > 0) {
        await db.insert(schema.serviceChecklists)
          .values(_tasks.map(t => ({ ...t, serviceId: inserted.id })));
        tasksCreated += _tasks.length;
      }
    }

    // ── 3. Insertar agentes ──
    const agentsInserted = await db.insert(schema.opsAgentRoles)
      .values(AGENTS.map(a => ({ ...a, userId })))
      .returning({ id: schema.opsAgentRoles.id });

    // ── 4. Insertar reglas de email ──
    const rulesInserted = await db.insert(schema.emailRules)
      .values(EMAIL_RULES.map(r => ({ ...r, userId })))
      .returning({ id: schema.emailRules.id });

    // ── 5. Insertar partners ──
    const partnersInserted = await db.insert(schema.partners)
      .values(PARTNERS.map(p => ({ ...p, userId })))
      .returning({ id: schema.partners.id });

    return NextResponse.json({
      ok: true,
      seeded: {
        services: servicesCreated,
        documents: docsCreated,
        checklists: tasksCreated,
        agents: agentsInserted.length,
        emailRules: rulesInserted.length,
        partners: partnersInserted.length,
      },
    });
  } catch (e) {
    console.error("[ops-config/seed] Error:", e);
    return err(e instanceof Error ? e.message : "Error al ejecutar seed", 500);
  }
}
