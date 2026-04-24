---
name: sinergia-deploy
description: Use for any deploy, branch, or Vercel workflow task — pushing to staging, promoting staging to main, resolving rebase conflicts with remote cowork commits, managing the Vercel project, or troubleshooting failed deploys. Triggers on "deploy", "push to staging", "promote to main", "merge to main", "Vercel", "rebase", "resolve conflict with origin/staging".
---

# Sinergia deploy workflow

## Topología

- **main** → producción en `sinergia-mail-somossinergia-orgs-projects.vercel.app` (y dominio custom si aplica).
- **staging** → preview Vercel, rama de trabajo diario.
- Proyecto Vercel: `prj_3kDoUBWx8RjaasbOEFuzrzFFkilf` (team `team_aFyX7WRuXo9RiHEXNyzOnyxf`).

## Flujo estándar

1. Trabajar en `staging`. Commits pequeños con Conventional Commits (`feat:`, `fix:`, `chore:`, `feat(scope):`).
2. Antes de push: `git fetch origin` — **cowork sessions suelen pushear en paralelo**, verifica divergencia con `git log --oneline origin/staging..HEAD` y `git log --oneline HEAD..origin/staging`.
3. Si hay divergencia:
   - Si tu commit y el remoto son **equivalentes** (típico cuando otra sesión cowork hizo lo mismo): `git reset --soft origin/staging`, comparar diff, quedarte solo con lo que de verdad aporta, recommit.
   - Si son **complementarios**: `git rebase origin/staging` y resolver.
4. Push: `git push origin staging`. Vercel despliega preview automáticamente.
5. Promoción a `main`: PR desde `staging`, `/security-review` primero si toca auth/crypto/webhooks, luego merge.

## Reglas duras

- **NO** `git push --force` a `main`.
- **NO** esperar `next build` local para decidir deploy — Windows lo buffea y cuelga. Vercel es la verdad.
- **NO** commitear archivos grandes sueltos del working tree (docs `.docx`, `.pdf`, `.bat`) sin pedir confirmación. Hay muchos untracked acumulados.
- Si un hook pre-commit falla: arreglar la causa y hacer **commit nuevo**, nunca `--amend`.

## Diagnóstico rápido

| Síntoma | Comprobar |
|---|---|
| Push rechazado "fetch first" | `git fetch && git log --oneline HEAD..origin/staging` — casi siempre es un commit de cowork |
| Deploy Vercel falla en build | Revisar runtime logs (MCP Vercel `get_deployment_build_logs`) — suele ser env var faltante o tipo drizzle |
| Cron no dispara | `vercel.json` + verificar que el endpoint está en la lista de exenciones del middleware |
| Endpoint público devuelve 401 | Falta exención en `src/middleware.ts` (ver `isChatWidgetApi` como patrón) |

## Validación post-deploy

1. `curl -I https://<preview-url>/api/health` (o similar) — 200 OK.
2. Comprobar logs en Vercel durante 2-3 min tras deploy.
3. Si era un cambio de cron/webhook: validar ejecución en la siguiente ventana programada.
