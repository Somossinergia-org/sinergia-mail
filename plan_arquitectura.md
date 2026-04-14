# Paquete H — Agente IA omnipresente

**Fecha**: 2026-04-14
**Scope**: agente flotante accesible desde cualquier tab + voz que ejecuta acciones + drag&drop universal de imágenes/PDFs

---

## Arquitectura

```
┌──────────────────────────────────────────────────────┐
│ Cualquier pestaña del dashboard                      │
│  (Resumen, Emails, Facturas, …)                      │
│                                                      │
│                                       ┌────────┐     │
│                                       │  💬   │     │
│                                       │ FAB   │     │ ← FloatingAgent
│                                       └────────┘     │   colapsado
└──────────────────────────────────────────────────────┘
        ▼ click ▼
┌──────────────────────────────────────────────────────┐
│                                  ┌───────────────┐   │
│                                  │ Sinergia AI   │   │
│                                  │ • • •         │   │
│                                  │               │   │
│                                  │ [chat msgs]   │   │
│                                  │               │   │
│                                  │ [tool chips]  │   │
│                                  │               │   │
│                                  │ [📎 🎤  ⌃]   │   │
│                                  └───────────────┘   │
└──────────────────────────────────────────────────────┘
```

## Componentes nuevos

### `FloatingAgent.tsx`

- FAB bottom-right (encima de bottom-nav en móvil, esquina inferior en desktop)
- Estados: `collapsed` | `expanded`
- Expandido en desktop: panel lateral 380×600px
- Expandido en móvil: full-screen
- Contenido:
  - Header con título + close
  - Lista de mensajes (user / model / tool-result chips)
  - Drop zone embebida (drag image/PDF dentro del panel)
  - Input + botones: 📎 (archivo) · 🎤 (voz) · ⌃ (enviar)
- Persiste conversación en `localStorage` (sobrevive recargas)
- Shortcut `c` (chat) abre el FAB

### `GlobalDropZone.tsx`

- Listener `dragenter` / `dragleave` / `drop` en `window`
- Overlay full-screen cuando se arrastra archivo
- Acepta: PNG, JPG, WebP, PDF
- Ruta:
  - imagen → `/api/agent/photo-extract` mode=invoice
  - PDF → `/api/agent/pdf-extract` (nuevo endpoint)
- Resultado → inyecta como mensaje del agente con tool result chip
- Si el FloatingAgent está cerrado, lo abre automáticamente

### Voz que ejecuta acciones

Reutilizo Web Speech API. Diferencia clave con UniversalSearch:
- En UniversalSearch la voz alimenta una búsqueda
- En FloatingAgent la voz alimenta el **chat con tools**

Flujo:
1. Click 🎤 → empieza a escuchar
2. Transcribe ES-ES en vivo (interim results)
3. Al terminar (silencio o click stop) → muestra transcript editable
4. Envía a `/api/agent` POST → orchestrator con function calling
5. Agente responde con texto + ejecuta tools
6. Render: mensaje del modelo + chips con `tool_name · ok` por cada tool

### Endpoint nuevo: `/api/agent/pdf-extract`

POST multipart con `file` (PDF):
- Usa `pdf-parse` (ya en deps) para texto
- Llama `extractInvoiceFromPdf` con el buffer
- Devuelve mismo formato que photo-extract para reutilizar UI

---

## Decisiones técnicas

### Persistencia chat

`localStorage` con clave `sinergia.floatingAgent.history`. Limit: últimos 50 mensajes. Se serializa solo `{role, content, toolCalls}`.

### Mobile-first

- En móvil el FAB se posiciona `bottom-20` (sobre bottom nav)
- Panel expandido full-screen (no flotante 380px)
- Drag&drop en móvil: usar el botón 📎 (no hay drag desde galería en touch)

### Reusabilidad

`FloatingAgent` puede internamente reutilizar `AgentChat` o tener su propia copia ligera. Optaré por **propio**, más control.

### Voice + tools

El `/api/agent` POST ya existe y soporta function calling vía orchestrator. Solo cambio el cliente: voz → transcript → `messages[]` → POST. Sin cambios backend.

### Drop overlay

Z-index 60 (sobre todo). Se cierra después de 300ms si no hay drop. Detección de tipos por `file.type`.

---

## Orden de commits

1. `feat: floating agent — accesible desde cualquier tab + voz + drop interno`
2. `feat: PDF extract endpoint + drop PDF en FloatingAgent`
3. `feat: global drop zone — drag&drop desde cualquier sitio del dashboard`

---

## Criterios de éxito

- [ ] FAB visible en TODAS las tabs
- [ ] Click → panel expandido con chat funcional
- [ ] Persiste mensajes entre recargas
- [ ] 🎤 transcribe voz y envía al agente (con tools)
- [ ] Si digo "borra los emails de X cuando lleguen" → crea regla
- [ ] 📎 sube imagen/PDF y agente extrae datos
- [ ] Drag&drop en CUALQUIER zona del dashboard activa overlay
- [ ] Mobile: FAB encima de bottom-nav, panel full-screen
- [ ] Atajo `c` abre el chat flotante

---

**Procedo.**
