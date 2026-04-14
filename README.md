# Sinergia Mail

Dashboard inteligente de gestión de emails y facturas para **Somos Sinergia**. Sincroniza Gmail, categoriza con IA, extrae datos de facturas (email + PDFs adjuntos), y provee herramientas de automatización financiera.

**Producción**: [sinergia-mail.vercel.app](https://sinergia-mail.vercel.app)

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Auth | NextAuth v5 (Google OAuth con scopes Gmail) |
| Base de datos | PostgreSQL (Cloud SQL europe-west9) + Drizzle ORM |
| IA | Google Gemini 2.5-flash (`@google/generative-ai`) |
| Estilos | Tailwind + glassmorphism + Lucide icons |
| Charts | Recharts + pure SVG (donut custom) |
| Excel | exceljs (pure Node.js, Vercel-compatible) |
| PDF | pdf-parse + Gemini para extracción estructurada |
| Logging | Pino (JSON estructurado, redact de secrets) |
| Rate limit | LRU-cache (in-memory, sliding window) |
| XSS defense | DOMPurify (isomorphic) |
| Deploy | Vercel (prod) + GitHub Actions (CI gates) |

---

## Paneles de UI

1. **Resumen** — stats generales + briefing proactivo + emails recientes
2. **Emails** — bandeja con filtro por categoría y búsqueda
3. **Facturas** — gestor con totales, export ZIP por categoría
4. **Analíticas** — gráficos de distribución y gasto por categoría
5. **Automatización IA** — categorizar, extraer, reparar, auto-borradores, plantillas
6. **Alertas & IVA** — dashboard de facturas vencidas, IVA Q, duplicados, previsión
7. **Contactos CRM** — lista expandible con emails + facturas por contacto
8. **Informes Excel** — 4 tipos de Excel + informe IA narrativo
9. **Chat IA** — conversación Gemini con contexto real + cleanup inteligente + config

---

## Setup local

```bash
# 1. Clonar e instalar
git clone https://github.com/Somossinergia-org/sinergia-mail.git
cd sinergia-mail
npm install

# 2. Configurar entorno
cp .env.example .env.local
# Rellenar: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET,
#           DATABASE_URL, GEMINI_API_KEY

# 3. Migrar DB (si aplica)
npx drizzle-kit push

# 4. Dev server
npm run dev    # http://localhost:3000
```

---

## Seguridad (hardening aplicado)

- **Secrets**: todo en `.env.local`, nunca hardcoded. `.env.example` documenta el shape
- **OAuth tokens**: almacenados en DB (accounts table), refresh automático por NextAuth
- **Rate limit**: `/api/agent/*` limitado a 10-30 req/min por usuario según endpoint
- **XSS**: HTML de emails pasa por DOMPurify con config strict antes de `dangerouslySetInnerHTML`
- **Error boundary**: los 500 nunca exponen stack traces en producción (solo requestId)
- **Redact**: el logger Pino elide `access_token`, `refresh_token`, `DATABASE_URL`, etc.
- **Auth middleware**: `/dashboard` y `/api/*` requieren sesión válida (excepto `/api/auth/*`)

---

## Observabilidad

- Cada request obtiene un `x-request-id` UUID (header visible en response)
- Los logs son JSON estructurados, parseables por Vercel Logs / Datadog / Loki
- Niveles: `debug` (dev) | `info` (prod) | `warn` | `error` | `fatal`
- `logger.child({userId, route})` para loggers con contexto pre-poblado

```typescript
import { logger, logError } from "@/lib/logger";
const log = logger.child({ route: "/api/agent/foo" });
log.info({ userId }, "processing");
try { ... } catch (e) { logError(log, e, { userId }); }
```

---

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): 3 jobs paralelos
  - `typecheck` — `tsc --noEmit`
  - `lint` — `next lint`
  - `build` — `next build` con envs mockeados
- **Vercel** deploy automático en merge a `main` (post-CI)
- Rollback: `git revert <sha> && git push` → redeploy automático

---

## Estructura

```
src/
├── app/
│   ├── api/              # 22 API routes
│   ├── dashboard/        # UI principal
│   ├── login/            # auth entry
│   ├── globals.css       # Tailwind + glass + gradient
│   └── layout.tsx
├── components/           # 14 React components
├── db/
│   ├── index.ts          # Drizzle client
│   └── schema.ts         # users, emails, invoices, contacts, agent_logs
├── lib/
│   ├── auth.ts           # NextAuth config
│   ├── gemini.ts         # Gemini wrapper (singleton + helpers)
│   ├── gmail.ts          # Gmail API wrapper
│   ├── prompts.ts        # system prompts centralizados
│   ├── logger.ts         # Pino singleton
│   ├── apiError.ts       # error boundary helper
│   ├── rateLimit.ts      # LRU rate limiter
│   └── sanitize.ts       # DOMPurify wrappers
└── middleware.ts         # requestId + auth + redirects
```

---

## Licencia

Privado — Somos Sinergia S.L.
