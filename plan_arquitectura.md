# Paquete I — Multi-cuenta + Calendar + WhatsApp

**Fecha**: 2026-04-14
**Scope**: tres integraciones priorizadas. Holded confirmado para sprint posterior.

---

## Sprint 1 — Multi-cuenta de email (foundational, crítico)

### Problema actual

NextAuth está atado a una sola cuenta Google por usuario. Los emails se sincronizan solo de `orihuela@somossinergia.es`. David quiere conectar más cuentas suyas (otro Gmail personal, otro de un departamento, etc.).

### Decisión arquitectónica

Crear una tabla `email_accounts` separada de `accounts` (que es de NextAuth). Cada `email_account` tiene su propio OAuth token de Gmail y se sincroniza independientemente. La columna `account_id` se añade a `emails`, `invoices`, `email_summaries`, etc.

```
users (NextAuth — auth principal)
  └── email_accounts (1:N)        ← NUEVO
       ├── id
       ├── userId (FK users)
       ├── provider ('google' por ahora, 'microsoft' futuro)
       ├── email
       ├── displayName
       ├── accessToken
       ├── refreshToken
       ├── expiresAt
       ├── lastSyncAt
       ├── isPrimary (boolean)
       └── enabled

emails
  └── accountId (FK email_accounts)  ← NUEVO

invoices
  └── accountId (FK email_accounts)  ← NUEVO (vía emails)
```

### Endpoints

- `GET  /api/email-accounts` — lista cuentas conectadas
- `POST /api/email-accounts/connect` — inicia OAuth con Google para añadir cuenta
- `DELETE /api/email-accounts/[id]` — desconecta cuenta (no borra emails)
- `POST /api/email-accounts/[id]/sync` — fuerza sync de esa cuenta concreta
- `/api/sync` modificado para iterar todas las cuentas activas

### UI

- Nuevo panel "Cuentas de email" en `Integraciones` (o standalone)
- Selector en Sidebar: dropdown "Todas las cuentas ▼" filtra emails/facturas por cuenta
- Estado por cuenta: última sync, total emails, ENABLED/DISABLED toggle

### Migración

- Añadir columna `account_id` a `emails` e `invoices` (nullable inicialmente)
- Crear `email_accounts` row para la cuenta primaria existente
- Backfill: `UPDATE emails SET account_id = <primary> WHERE account_id IS NULL`
- Hacer columna NOT NULL al final

---

## Sprint 2 — Google Calendar tools

### Tools nuevas en agente

- `create_calendar_event(title, datetime, description?, durationMin?)` — usa Calendar API con scope que ya tienes (NextAuth)
- `list_upcoming_events(days?)` — próximos eventos
- `add_invoice_due_reminder(invoiceId)` — crea evento 3 días antes del `dueDate` de la factura

### Eventos automáticos

Cron weekly o al sync de facturas:
- Si factura nueva tiene `dueDate` → crear evento Calendar 3 días antes
- Si vencimiento de IVA trimestral está en próximos 7 días → crear evento

### Endpoint

- `POST /api/agent/calendar/event` — wrap del tool para uso desde UI

### Scope OAuth

Necesita scope `https://www.googleapis.com/auth/calendar.events`. Si NextAuth ya pidió Gmail scopes pero NO Calendar, hay que reauth. Lo añado al scope inicial — usuario tendrá que reconectar una sola vez.

---

## Sprint 3 — WhatsApp Business Cloud API

### Setup requerido (por usuario, una vez)

1. Crear app en Meta for Developers (gratis)
2. Conectar número WhatsApp Business
3. Generar token permanente (System User)
4. Configurar webhook URL (sinergia-mail.vercel.app/api/whatsapp/webhook)

Estos pasos los configura David fuera del código. La app guarda token + phone_number_id en variables de entorno.

### Endpoints

- `POST /api/whatsapp/webhook` — recibe mensajes entrantes (con verificación VERIFY_TOKEN)
- `POST /api/whatsapp/send` — envía mensaje (texto, plantilla, media)

### Flujo "factura por WhatsApp"

```
Cliente envía foto factura por WhatsApp
        │
        ▼
Webhook recibe: { from, mediaId, type:'image' }
        │
        ▼
Descarga media de Meta API
        │
        ▼
Llama Gemini Vision (extract invoice)
        │
        ▼
Guarda en `invoices` con accountId virtual 'whatsapp'
        │
        ▼
Responde por WhatsApp: "✓ Factura de Endesa 156€ guardada"
```

### Tool agente

- `send_whatsapp(phone, message, template?)` — para que el agente pueda enviar mensajes

---

## Orden de commits

### Sprint 1 (4-5 commits)
1. `feat: email_accounts schema + migration + primary backfill`
2. `feat: API endpoints para conectar/listar/desconectar cuentas`
3. `feat: account selector en UI + filtrado por cuenta`
4. `feat: sync multi-cuenta + scheduling`

### Sprint 2 (1 commit)
5. `feat: Google Calendar tools + auto-eventos vencimiento`

### Sprint 3 (2 commits)
6. `feat: WhatsApp webhook + endpoint envío + tool agente`
7. `feat: WhatsApp recibe factura por foto → procesa via Gemini Vision`

---

## Hoy: ejecuto Sprint 2 (Calendar) primero

Razón: usa OAuth ya existente (con scope añadido), NO requiere DB migration grande, valor inmediato sin cambios disruptivos. Mientras lo verifico, planificamos Sprint 1 (multi-cuenta) que es más invasivo.

**Procedo con Calendar.**
