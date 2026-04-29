---
name: sinergia-data-cleanup
description: Use when crear endpoints admin de limpieza de datos legacy o duplicados (notifications, memory_sources, draft_responses obsoletos, etc.). Triggers on "limpiar datos viejos", "borrar duplicados", "endpoint admin cleanup", "purgar legacy", "deduplicar memoria", "borrar alertas obsoletas".
---

# Limpieza de datos — protocolo de admin endpoints

## Cuándo usar esta skill

Cuando un cron, bug o cambio de schema deja **basura en la DB** que se acumula y degrada UX:

- Notificaciones legacy con valores absurdos ("999 días sin actividad")
- Memory sources duplicados por chunking
- Drafts en estado intermedio que nunca se limpian
- Filas con foreign key huérfanas tras un soft-delete

La skill da el patrón de endpoint admin idempotente y seguro para limpiarlos.

## Patrón canónico

Crear `src/app/api/admin/cleanup-<X>/route.ts`. Plantilla mínima:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";
import { safeBearer } from "@/lib/security/safe-equal";

const log = logger.child({ route: "/api/admin/cleanup-<X>" });
const ADMIN_EMAIL = "orihuela@somossinergia.es";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1. Auth dual: Bearer CRON_SECRET o session admin
  const bearerOk = safeBearer(req.headers.get("Authorization"), process.env.CRON_SECRET);
  let scopedUserId: string | null = null;

  if (bearerOk) {
    const body = await req.json().catch(() => ({}));
    scopedUserId = body?.userId ?? null;  // bearer puede limpiar a otros
  } else {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL || !session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    scopedUserId = session.user.id;  // admin solo se limpia a sí mismo
  }

  try {
    // 2. Query SQL idempotente — si no hay basura, devuelve 0 sin error
    const userClause = scopedUserId ? sql`AND user_id = ${scopedUserId}` : sql``;
    const result = await db.execute(sql`
      DELETE FROM <tabla>
      WHERE <criterio_basura> ${userClause}
      RETURNING id
    `);
    const rows = result as unknown as { id: number }[];

    log.info({ scopedUserId, deletedCount: rows.length }, "cleanup complete");

    return NextResponse.json({
      ok: true,
      deletedCount: rows.length,
      sample: rows.slice(0, 20).map(r => r.id),
      scope: scopedUserId ? `userId=${scopedUserId}` : "all-users",
    });
  } catch (err) {
    logError(log, err, { scopedUserId }, "cleanup failed");
    return NextResponse.json(
      { error: "Error interno", detail: (err as Error).message?.slice(0, 200) },
      { status: 500 },
    );
  }
}
```

## Reglas duras

1. **Auth dual**: Bearer CRON_SECRET para crons + session admin para invocación manual desde browser. No exponer al user normal.
2. **Idempotente**: re-ejecutarlo NO debe romper. Si la basura ya está limpia → devolver `deletedCount: 0` sin error.
3. **Scope opcional**: bearer puede pasar `userId` en body para limpiar a alguien específico (cron multi-user). Session admin se limpia solo a sí mismo.
4. **Devolver sample IDs**: para que el caller pueda verificar qué borró sin tener que mirar logs.
5. **Logging estructurado**: `log.info({ scopedUserId, deletedCount }, "cleanup complete")` y `logError` con detail truncado a 200 chars en error.
6. **Detail field en error 500**: para diagnosticar desde browser sin abrir Vercel logs (visto en `/api/crm/agenda` post-mortem).

## Para borrar duplicates (no por criterio simple)

Usar `ROW_NUMBER() OVER PARTITION` y mantener el id más bajo de cada grupo:

```sql
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY <columnas que definen "mismo registro">
    ORDER BY id ASC  -- conserva el más antiguo
  ) AS rn
  FROM <tabla> WHERE TRUE ${userClause}
)
DELETE FROM <tabla>
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
RETURNING id
```

Ejemplos en repo:
- `cleanup-stale-inactivity` — borra notifications legacy "999 días"
- `cleanup-memory-duplicates` — dedupe memory_sources por (user, kind, title, content[:200])

## Cómo invocar

**Desde browser (session admin):**
```javascript
fetch("/api/admin/cleanup-X", { method: "POST", headers: {"Content-Type": "application/json"}, body: "{}" })
  .then(r => r.json()).then(console.log)
```

**Desde curl (Bearer CRON_SECRET):**
```bash
curl -X POST https://sinergia-mail.vercel.app/api/admin/cleanup-X \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId": "..."}'
```

**Desde cron (vercel.json):**
```json
{ "path": "/api/admin/cleanup-X", "schedule": "0 4 * * 0" }  // semanal
```
Vercel cron pasa el Bearer automáticamente cuando `CRON_SECRET` está en env.

## Tests

Crear `tests/preproduction/admin-cleanup-endpoints.test.ts` que verifique estructura del endpoint sin necesidad de DB:

```typescript
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../../src/app/api/admin/cleanup-X/route.ts"), "utf-8");

describe("admin/cleanup-X — estructura", () => {
  it("usa safeBearer + admin email fallback", () => {
    expect(src).toContain("safeBearer");
    expect(src).toContain("orihuela@somossinergia.es");
  });
  it("devuelve deletedCount", () => {
    expect(src).toContain("deletedCount");
  });
});
```

## Checklist antes de commit

- [ ] Endpoint en `src/app/api/admin/cleanup-<X>/route.ts`
- [ ] Auth dual: Bearer CRON_SECRET + session admin
- [ ] Query idempotente (re-ejecutable)
- [ ] Devuelve `{ ok, deletedCount, sample, scope }`
- [ ] Logging structured con `log.info` + `logError`
- [ ] Test smoke en `tests/preproduction/`
- [ ] Si requiere cron: añadir entrada en `vercel.json`
- [ ] Mensaje de commit: `feat(admin): cleanup-<X> endpoint`
