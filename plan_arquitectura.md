# Plan de arquitectura — Paquete D: Sinergia AI Agentic

**Fecha**: 2026-04-14
**Scope**: convertir Sinergia AI de chat conversacional a agente con function calling

---

## 1. Problema actual

El chat responde texto, nunca actúa. Si el usuario dice *"elimina los emails de Firebase fallidos cuando lleguen"*, Gemini le contesta *"no puedo, configura un filtro en Gmail"*. Debería:

1. Reconocer la intención
2. Crear una regla persistente
3. Aplicarla automáticamente en el próximo sync

---

## 2. Arquitectura — Function Calling de Gemini

Gemini 2.5-flash soporta **function calling nativo**: declaras un catálogo de funciones con JSON Schema, el modelo decide cuándo invocarlas, tú ejecutas el handler, devuelves resultado, el modelo sintetiza respuesta final.

```
┌───────────────────────────────────────────────────────┐
│ USER: "borra los emails de X cuando lleguen"          │
└───────────────────────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│ Gemini (con tools declarados)                         │
│   decide: functionCall → create_email_rule(...)       │
└───────────────────────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│ Tool registry (src/lib/agent/tools.ts)                │
│   ejecuta handler: INSERT en memory_rules             │
│   retorna: { success, ruleId, matches_so_far: 2 }     │
└───────────────────────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│ Gemini (2ª llamada con functionResponse)              │
│   sintetiza: "Regla creada. Ya hay 2 emails que       │
│   coinciden, los he movido a papelera."               │
└───────────────────────────────────────────────────────┘
```

### Patrones aplicados

- **Tool registry (Registry pattern)**: objeto `TOOLS` con `name → {schema, handler}`. Escalable sin tocar el core.
- **Defensive execution**: cada handler envuelto en try/catch + log estructurado + return tipado.
- **Idempotency**: operaciones destructivas (trash) usan Gmail API — recuperables 30 días.
- **Safety gate**: antes de cualquier operación masiva destructiva, el agente DEBE pedir confirmación vía respuesta intermedia.

---

## 3. Catálogo de tools (MVP — 12 de alto valor)

### Lectura (sin riesgo)

| Tool | Descripción |
|---|---|
| `get_stats` | Resumen global (emails, facturas, gasto, IVA) |
| `search_emails(query, category, isRead, limit)` | Buscar emails |
| `search_invoices(issuer, category, dateFrom, dateTo)` | Buscar facturas |
| `get_overdue_invoices` | Facturas vencidas |
| `get_iva_quarterly(year, quarter)` | Modelo 303 |
| `get_duplicates` | Grupos de duplicados |
| `forecast_expenses` | Previsión gastos |

### Escritura (no destructiva)

| Tool | Descripción |
|---|---|
| `mark_emails_read(emailIds)` | Marcar como leídos |
| `create_draft(emailId, body?, tone?, templateId?)` | Generar borrador Gmail |
| `create_email_rule(pattern, action, field?)` | **Persistir regla automática** ← clave para el caso del usuario |

### Escritura destructiva (con papelera Gmail)

| Tool | Descripción |
|---|---|
| `trash_emails(emailIds)` | Mover a papelera Gmail (recuperable 30 días) |

### Operaciones batch (Gemini-backed, costosas)

| Tool | Descripción |
|---|---|
| `generate_excel_report(type)` | URL descarga Excel |
| `categorize_unread` | Batch categorize |
| `extract_invoices_batch` | Batch extract facturas |

---

## 4. Ciclo completo del caso del usuario

**Input**: *"elimina los emails de Firebase fallidos cuando lleguen"*

1. Gemini llama `create_email_rule({pattern: "Run failed: Deploy Firebase", field: "subject", action: "TRASH"})`
2. Handler:
   - `INSERT INTO memory_rules (userId, pattern, action, field)`
   - Barre bandeja actual: `SELECT * FROM emails WHERE subject ILIKE '%Run failed: Deploy Firebase%'`
   - Llama Gmail API `users.messages.trash` sobre cada match
   - Marca `emails.category = 'TRASHED'` en DB
   - Return `{ruleId, matchesNow: 2, trashed: 2}`
3. Gemini sintetiza: *"Creada. He movido 2 emails existentes a papelera. Los futuros con ese asunto se borrarán solos al sincronizar."*
4. **Future sync integration**: `/api/sync` lee `memory_rules` antes de procesar nuevos emails y aplica acciones pre-categorización.

---

## 5. Cambios de código

### Archivos nuevos

- `src/lib/agent/tools.ts` — registry + 12 handlers
- `src/lib/agent/execute.ts` — orchestrator (loop de function calling)
- Schema DB: añadir columna `field` a `memory_rules` (asunto/remitente/cuerpo)

### Archivos modificados

- `src/app/api/agent/route.ts` — POST usa orchestrator en vez de `chat()` directo
- `src/lib/prompts.ts` — actualizar `SYSTEM_PROMPT_CHAT` con instrucciones sobre tools + confirmación destructiva
- `src/app/api/sync/route.ts` — integrar aplicación de rules en el flujo de sync
- `src/db/schema.ts` — `memoryRules.field` + columna `trashed` (opcional) en emails

### Dependencias

Ninguna nueva. `@google/generative-ai` v0.21 ya soporta function calling.

---

## 6. Orden de commits

1. **feat: tool registry + Gemini function calling orchestrator** — infra + 12 tools + refactor del chat endpoint
2. **feat: integrate memory_rules into sync pipeline** — auto-aplicar reglas al llegar emails nuevos
3. **docs: update README with agentic capabilities + flow diagrams**

Cada commit con `tsc --noEmit` + `next build` + deploy verification.

---

## 7. Criterios de éxito

- [ ] Decir *"cuántos emails tengo sin leer"* → responde con número real (tool `get_stats`)
- [ ] Decir *"búscame facturas de Microsoft"* → lista facturas (tool `search_invoices`)
- [ ] Decir *"borra los emails de X cuando lleguen"* → crea regla + aplica a existentes + confirma
- [ ] Nuevos emails en el sync que coincidan con regla van a papelera automáticamente
- [ ] Tool calls loggeados en `agent_logs` con tool name, input summary, output summary
- [ ] 0 regresiones en chat conversacional normal (sigue funcionando sin tools si no aplican)

---

## 8. Guardarraíles (Chain of Thought inyectado al agente)

System prompt amplía:

> Eres Sinergia AI con capacidad de ejecución. Tienes herramientas para leer/escribir sobre los datos del usuario.
>
> REGLAS:
> 1. Si la intención del usuario requiere actuar (buscar, crear, modificar, eliminar), USA una tool. No inventes datos.
> 2. Antes de ejecutar operaciones destructivas con más de 5 elementos afectados, responde ANTES pidiendo confirmación explícita.
> 3. Para patrones "cuando lleguen", "a partir de ahora", "siempre que" → usa `create_email_rule` (persistente).
> 4. Para operaciones ad-hoc sobre emails concretos → usa `trash_emails` / `mark_emails_read` directos.
> 5. Nunca expongas stack traces, IDs de base de datos crudos ni paths internos en la respuesta al usuario.
> 6. Responde siempre en español, tono natural, sin jerga técnica innecesaria.

---

**Procedo.**
