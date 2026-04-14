# Plan de arquitectura — Paquete F: Productividad Tier S + A

**Fecha**: 2026-04-14
**Scope**: 6 utilidades de producción

---

## Roadmap

| # | Feature | Tipo | LOC aprox | Deps nuevas |
|---|---|---|---|---|
| 1 | PWA installable | UI + manifest | ~80 | - |
| 2 | Atajos teclado globales + cheatsheet | UI | ~120 | - |
| 3 | Detección de anomalías en facturas | SQL + UI | ~180 | - |
| 4 | Reporte semanal automático | Cron + email | ~200 | - (Gmail API) |
| 5 | Inbox Zero mode | UI + state | ~250 | - |
| 6 | Recordatorios de pago automáticos | Tool + endpoint | ~100 | - |
| 7 | Facturación emitida (venta) | DB + UI + PDF | ~500 | `@react-pdf/renderer` |

---

## Decisiones arquitectónicas

### 1. PWA installable

- `public/manifest.json` con icons 192/512, theme_color `#0a0a1a`, display `standalone`, start_url `/dashboard`
- `public/sw.js` Service Worker mínimo (cache-first shell)
- `<meta name="apple-mobile-web-app-capable">` en layout
- Icons: SVG → PNG (uso un icono Lucide renderizado)

### 2. Atajos teclado

- Hook `useGlobalShortcuts(handlers)` central en `src/lib/hooks/useShortcuts.ts`
- `?` abre modal con cheatsheet (componente `ShortcutsHelp`)
- `g r/e/f/a/...` para tabs
- `/` focus search
- `z` Inbox Zero
- `⌘K` ya existe

### 3. Anomalías de facturas

SQL window function: compara factura nueva con media móvil 3 meses del mismo emisor. Threshold ±30% → flag.

- `/api/agent/anomalies` GET → devuelve array de anomalías
- Card en AlertasPanel tipo "Anomalías detectadas"
- Incluida en briefing

### 4. Reporte semanal

**Sin dependencia externa**: uso el propio Gmail OAuth del usuario para auto-envío. El cron ejecuta como el usuario y manda el email a sí mismo usando `users.messages.send`.

- `vercel.json` → `crons: [{ path: "/api/cron/weekly-report", schedule: "0 8 * * 1" }]` (lunes 8:00 UTC = 9:00 España)
- `/api/cron/weekly-report` valida `Authorization: Bearer $CRON_SECRET`, itera usuarios con `agentConfig.weeklyReportEnabled`, construye reporte HTML, envía vía Gmail API
- Template HTML con datos reales: ingresos/gastos, alertas, top proveedores

### 5. Inbox Zero

Vista pantalla completa:
- Queue de emails CLIENTE/PROVEEDOR sin leer
- Un email a la vez, 4 botones gigantes: Archivar · Responder (abre chat IA con borrador) · Papelera · Más tarde (snooze)
- Atajo `z` activa el modo; `1/2/3/4` o letras `a/r/d/l` para las acciones
- Estado "Más tarde" = label Gmail "_SINERGIA_LATER" + persistencia en DB

### 6. Recordatorios de pago

Tool nueva `draft_payment_reminder(invoice_id, tone)` → crea borrador Gmail cordial.
Panel Alertas añade botón "Generar recordatorio" en cada factura vencida.

### 7. Facturación emitida (venta)

Nueva tabla `issued_invoices` (schema: id, user_id, number, client_name, client_nif, client_email, date, due_date, concepts jsonb, subtotal, tax, total, currency, status, pdf_url, sent_at).

- Panel nuevo "Facturar" en sidebar
- Form: seleccionar cliente (dropdown de contactos CRM) + añadir conceptos + calcular totales
- Numeración automática (`Sinergia-YYYY-NNNN`)
- PDF con `@react-pdf/renderer` (logo + datos Somos Sinergia)
- Botón "Enviar por Gmail" → borrador con PDF adjunto
- Módulo 303 IVA suma repercutido (emitidas) vs. soportado (recibidas)

---

## Orden de commits

1. `feat: PWA installable — manifest + SW + meta tags`
2. `feat: global keyboard shortcuts + cheatsheet modal`
3. `feat: invoice anomaly detection — SQL + panel card + briefing`
4. `feat: weekly report via Gmail API + Vercel cron`
5. `feat: payment reminder tool + Alertas panel action`
6. `feat: inbox zero mode — zen view + keyboard actions`
7. `feat: issued invoices — sales module with PDF + Gmail send`

Cada commit: `tsc --noEmit` + `next build` + push. Verifico después del push que la app no se rompe.

---

## Criterios de éxito

- [ ] iOS "Add to Home Screen" instala la app con icono correcto
- [ ] Pulsar `?` muestra cheatsheet con 10+ atajos
- [ ] Panel Alertas muestra anomalías cuando hay variación >30%
- [ ] Cron manda un email tipo HTML cada lunes (probado via endpoint manual)
- [ ] Inbox Zero activable con `z`, procesa 1 email a la vez, acciones funcionan
- [ ] Tool `draft_payment_reminder` crea borrador Gmail válido desde el chat
- [ ] Facturar: crear factura de venta → PDF descargable → enviar borrador
- [ ] Modelo 303 suma repercutido + soportado

---

**Procedo — commits atómicos.**
