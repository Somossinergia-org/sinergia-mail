# Plan de arquitectura — Paquete A: Hardening de producción

**Fecha**: 2026-04-14
**Scope**: Sinergia Mail (Next.js 14 + TS + Drizzle/Postgres + Vercel)
**Objetivo**: elevar el producto de "funciona en local" a "seguro, observable y con CI en producción"

---

## 1. Diagnóstico (estado real pre-hardening)

| Área | Estado actual | Riesgo |
|---|---|---|
| Secrets | `.env.example` desactualizado (menciona Anthropic pero usamos Gemini, Vercel Postgres pero usamos Cloud SQL). `.gitignore` básico. | Onboarding roto, posible commit accidental de `.env.local` |
| Logging | 17 `console.error` dispersos en 9 archivos, sin niveles, sin requestId, sin formato estructurado | Ceguera total ante fallos en producción |
| Rate limiting | No existe. `/api/agent/*` (9 endpoints Gemini) abiertos a llamadas infinitas | Un bug cliente o ataque puede vaciar la cuenta de Google Cloud |
| XSS | `EmailList.tsx` usa `dangerouslySetInnerHTML` con sanitización por regex casero | Vector XSS activo: un email bien construido puede robar tokens de Gmail |
| Error leakage | Endpoints devuelven `e.message` directo al cliente en 500 | Stack traces, paths internos, estructura DB expuestas |
| CI | Solo Vercel build. No hay `tsc`, `eslint`, `build` gates en GitHub Actions | Commits rotos van a producción (ya pasó con AlertasPanel esta misma sesión) |

---

## 2. Decisiones arquitectónicas

### 2.1 Logger — Pino sobre Winston

Selecciono **Pino** por:
- 5x más rápido que Winston (benchmarks oficiales)
- Output JSON nativo, parseable por Datadog/Sentry/Grafana Loki sin transforms
- Peso mínimo (~4kb gzipped)
- API simple: `logger.info({userId, route}, "message")`

Singleton exportado desde `src/lib/logger.ts`. Niveles: `debug`, `info`, `warn`, `error`, `fatal`. En dev: pretty-print con `pino-pretty`. En prod: JSON a stdout (Vercel Functions lo capta automáticamente).

### 2.2 RequestId — middleware Next.js

Edge middleware en `src/middleware.ts` que:
- Genera UUID por request con `crypto.randomUUID()`
- Inyecta header `x-request-id` en request y response
- Disponible en routes via `req.headers.get('x-request-id')`

Cada log estructurado incluye `requestId` → trazabilidad end-to-end.

### 2.3 Rate limiting — estrategia híbrida

Descarto **Upstash Redis** en esta fase: añade dependencia externa y coste para un single-tenant app. En su lugar:

- **In-memory LRU** con `lru-cache` por `userId` (sesión autenticada) + fallback por IP
- Ventana deslizante: 30 requests/minuto en `/api/agent/*`, 10/minuto en endpoints Gemini-intensivos (`/chat`, `/report`, `/auto-drafts`)
- Singleton por lambda (Vercel serverless limitation aceptable para este nivel de tráfico: ~1 user concurrente)
- Migración futura a Upstash: swap del módulo `src/lib/rate-limit.ts` sin tocar routes

### 2.4 Sanitización HTML — DOMPurify (isomorphic)

Reemplazo del regex casero por `isomorphic-dompurify`:
- Basado en DOMPurify de Cure53 (estándar de facto, auditado)
- Configuración strict: sin `<script>`, sin handlers `on*`, sin `javascript:` URLs
- Helper `sanitizeHtml()` en `src/lib/sanitize.ts`
- Aplicado en `EmailList.tsx` sobre el body HTML de cada email

### 2.5 Error boundary server — `apiError()` helper

Wrapper que:
- En `NODE_ENV=production`: devuelve mensaje genérico + `requestId` para que el user lo reporte
- En `development`: devuelve stack trace completo para debug
- Siempre loggea el error completo vía Pino

Aplicado sistemáticamente en cada `catch` de las 14 routes.

### 2.6 CI — GitHub Actions mínimo viable

`.github/workflows/ci.yml` con 3 jobs paralelos:
1. **typecheck**: `npx tsc --noEmit`
2. **lint**: `npx next lint`
3. **build**: `npm run build` (sin envs sensibles — usa mocks)

Trigger: push a `main` y PRs. Vercel deploy queda después (post-merge).

Branch protection lo configura el usuario manualmente en GitHub (no accesible vía gh CLI sin permisos admin).

---

## 3. Patrones de diseño aplicados

- **Singleton**: `logger`, `rateLimiter`, `sanitizer` — una instancia por proceso
- **Factory**: `createLogger(context)` para scoped loggers con contexto pre-poblado
- **Middleware chain**: requestId → auth → rate limit → handler → error boundary
- **Fail-fast**: validación de body en el primer layer, no dentro del handler

---

## 4. Convenciones de nomenclatura

- Libs en `src/lib/*.ts` (camelCase): `logger.ts`, `rateLimit.ts`, `sanitize.ts`, `apiError.ts`
- Middleware en `src/middleware.ts` (convención Next.js 14)
- CI workflows en `.github/workflows/*.yml` (kebab-case)
- Funciones helper: verbo + sustantivo (`sanitizeHtml`, `rateLimitOrThrow`, `handleApiError`)

---

## 5. Orden de commits (atomicidad)

Cada commit es independiente y revertible:

1. **chore: env and gitignore hardening** — actualiza `.env.example` (Gemini, Cloud SQL), añade `.gitignore` entries para logs/coverage/IDE files
2. **feat: structured logging with Pino + requestId middleware** — `src/lib/logger.ts`, `src/middleware.ts`, reemplaza los 17 `console.error`
3. **feat: rate limiting on /api/agent/* with LRU** — `src/lib/rateLimit.ts`, wrapper aplicado a 9 routes
4. **feat: replace regex sanitization with DOMPurify** — `src/lib/sanitize.ts`, usado en `EmailList.tsx`
5. **ci: GitHub Actions — typecheck + lint + build gates** — `.github/workflows/ci.yml`

Cada commit verifica `tsc --noEmit` y `next build` antes de push.

---

## 6. Criterios de éxito

- [ ] `.env.example` refleja el stack real
- [ ] 0 `console.error` en src (solo `logger.error`)
- [ ] Middleware inyecta `x-request-id` en todas las responses
- [ ] `/api/agent/chat` devuelve 429 tras 10 requests/min del mismo usuario
- [ ] XSS payload en body de email no ejecuta JS (test manual: `<img src=x onerror=alert(1)>`)
- [ ] 500 en producción devuelve `{error: "...", requestId: "..."}` sin stack trace
- [ ] GitHub Actions runs verdes en próximo push
- [ ] Vercel deploy sigue funcionando (nada roto)

---

## 7. Fuera de alcance (Paquete B/C)

- MCP server exposure
- Sentry SDK (queda scaffolded en logger, se activa cuando se añada `SENTRY_DSN`)
- Tests unitarios (otro paquete dedicado)
- Animaciones, command palette, Kanban

---

**Procedo a ejecutar.**
