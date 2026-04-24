# Sinergia-Mail — Claude guidance

Next.js 14 (App Router) + TypeScript · Drizzle ORM (Postgres/Cloud SQL) · NextAuth · Pino logger · OpenAI + swarm de 10 agentes · Integraciones: Gmail, Telegram, WhatsApp, WordPress REST. Deploy: Vercel. Branches: `main` (prod) ← `staging` (preview).

## Reglas no negociables

- **Nunca** hacer force-push a `main`, amend de commits publicados, ni `--no-verify`.
- Deploy real lo valida Vercel; no bloquear esperando `next build` local (lento en Windows).
- Drizzle: migraciones en `drizzle/` y `src/db/migrations/`. Nunca editar una migración ya aplicada — crear una nueva.
- Todo endpoint de `/api/*` pasa por `src/middleware.ts` (auth por sesión) salvo exenciones explícitas para webhooks/crons/widget público.
- Rate limits, CORS locked, y validación de input en cualquier endpoint sin auth (ver `src/app/api/chat/widget/route.ts` como patrón).

## Skills — cuándo usar cada una

| Situación | Skill |
|---|---|
| Antes de push a `staging`/`main` con cambios de seguridad (auth, crypto, tokens, webhooks, RGPD) | `/security-review` |
| Code review de PR antes de merge | `/review` |
| Después de fases grandes de features — detectar dead code, duplicación | `/simplify` |
| Tocar swarm de agentes, prompts, tools | skill local `sinergia-agents` |
| Workflow de deploy staging → main + Vercel | skill local `sinergia-deploy` |
| Logs/observabilidad (Pino + requestId) | `anthropic-skills:10-skill-observabilidad-logstxt` |
| Reglas SecOps en castellano | `anthropic-skills:07-skill-secops-seguridadtxt` |
| CI/CD (Vercel + GitHub Actions) | `anthropic-skills:09-skill-cicd-automatizaciontxt` |
| Consultas SQL / análisis sobre la DB | `data:sql-queries`, `data:analyze` |
| Contenido marketing (emails, landing, secuencias) | `marketing:email-sequence`, `marketing:content-creation` |

## Comandos clave

```bash
npx drizzle-kit generate   # generar migración desde schema
npx drizzle-kit migrate    # aplicar migraciones
npm run dev                # dev local
```

## Estructura crítica

- `src/lib/agent/swarm.ts` — controlador de los 10 agentes (3039 líneas, cuidado al editar).
- `src/lib/agent/super-tools.ts` — tools disponibles para agentes (PDF quotes, WhatsApp, etc.).
- `src/lib/agent/brand-voice.ts` — voz de marca "David" (no alterar sin confirmación).
- `src/db/schema.ts` — esquema canónico. Cambios siempre vía migración Drizzle.
- `vercel.json` — crons. Cambios afectan producción inmediatamente tras deploy.
