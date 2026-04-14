# Plan de arquitectura — Paquete G: Foto + Buscador multimodal

**Fecha**: 2026-04-14
**Scope**: 2 features grandes, 5 commits

---

## Feature 1 — Captura de facturas por foto

### Casos de uso

A. **Registrar factura recibida** (proveedor): foto de papel/PDF en mano →
   extracción IA → row en tabla `invoices`
B. **Auto-rellenar form de facturación emitida**: foto de tarjeta de visita
   o factura previa de un cliente → datos cliente pre-cargados en `FacturarPanel`

### Stack

- **Captura**: `<input type="file" accept="image/*" capture="environment">`
  (móvil abre cámara directa, desktop file picker). FilePond / DropZone NO
  necesarios — input nativo + preview con `URL.createObjectURL`.
- **Compresión cliente**: Canvas → resize a max 1600px lado largo + JPEG q=0.85
  → ahorra Gemini tokens (vision cobra por píxel) y evita timeouts en upload.
- **Backend**: `multipart/form-data` → buffer → base64 inline en `inlineData`
  para Gemini.
- **IA**: `gemini-2.5-flash` ya soporta visión multimodal. Prompt estructurado
  con JSON schema esperado, mode `application/json` para garantizar parseo.
- **Persistencia**: imagen original NO se guarda (ahorro storage); solo el
  JSON extraído + un hash del file para detectar duplicados.

### Componente reutilizable

`PhotoCapture` con props `mode: 'invoice' | 'client'` y callback `onExtract(data)`.
Estados: idle | uploading | extracting | done | error.

### Endpoints nuevos

- `POST /api/agent/photo-extract` — multipart, params `mode`, retorna JSON
  estructurado según mode

### UI puntos de entrada

- `FacturarPanel`: botón "📷 Capturar factura/cliente" arriba del form
- Nuevo en panel `Facturas` (recibidas): botón "📷 Añadir factura por foto"
  → endpoint adicional `POST /api/invoices/from-photo` que inserta directo
  en DB

---

## Feature 2 — Buscador universal multimodal

### Modos

1. **Texto**: input con búsqueda paralela en 4 fuentes
2. **Voz**: Web Speech API (`SpeechRecognition`) → transcribe ES → ejecuta
   búsqueda con el texto
3. **Imagen**: usuario sube/captura imagen → Gemini Vision extrae texto +
   entidades clave → búsqueda con esa información

### Fuentes de búsqueda (paralelo)

- Emails (`/api/emails?search=...`)
- Facturas recibidas (`/api/invoices?issuer=...`)
- Contactos CRM (`/api/agent/contacts?search=...`)
- Facturas emitidas (`/api/issued-invoices` filtrado client-side)

### Filtros (chip bar)

- **Tipo**: todo · emails · facturas · contactos · venta
- **Período**: 7d · 30d · 90d · 1y · custom
- **Importe** (cuando filtro = facturas): rango min/max
- **Estado** (cuando filtro = facturas): pagadas · pendientes · vencidas

### UX

- Modal full-width (no full-screen) con backdrop blur
- Atajo: `f` (en lugar de `/` que enfoca el input local)
- Resultados agrupados por tipo, max 5 por grupo (con "ver todos N")
- Skeleton durante búsqueda
- Click en resultado → navega + cierra modal
- Tecla `↑/↓` navega resultados, `Enter` selecciona, `Esc` cierra

### Integración voz

- API browser nativa: `webkitSpeechRecognition || SpeechRecognition`
- Idioma: `es-ES`
- Botón mic con animación pulse cuando activo
- Fallback graceful si navegador no soporta (botón disabled con tooltip)

### Integración imagen

- Drop zone OR botón cámara → `/api/agent/photo-search` (nuevo endpoint)
- Backend: Gemini Vision con prompt "extrae el texto y las entidades clave
  (nombres de empresa, NIFs, números de factura, importes)"
- Devuelve `{ text, entities: { issuers: [], invoiceNumbers: [], amounts: [] } }`
- Frontend usa esos datos para búsqueda compuesta

---

## Orden de commits

1. **feat: photo capture pipeline** — `extractFromImage` en gemini.ts +
   endpoint `/api/agent/photo-extract` + componente `PhotoCapture`
2. **feat: photo → autofill issued invoice form** — botón en FacturarPanel +
   integración con autocomplete de campos
3. **feat: photo → register received invoice** — endpoint
   `/api/invoices/from-photo` + botón en InvoicePanel
4. **feat: universal search modal — text + filters** — endpoint `/api/search`
   + componente UniversalSearch + atajo `f`
5. **feat: universal search — voice + image** — Web Speech API + Gemini
   Vision integration en el modal

Cada commit: `tsc --noEmit` + `next lint` + `next build` + push.

---

## Decisiones técnicas clave

### Por qué no usar OCR clásico (Tesseract)

Gemini Vision es **mejor que Tesseract+regex** para facturas porque:
- Maneja layouts variables (no necesita templates por proveedor)
- Reconoce contexto semántico (sabe qué es importe vs. fecha)
- Extrae directamente a JSON estructurado
- 1 llamada vs. OCR + parsing + heurísticas

### Compresión imagen — cliente vs. servidor

Cliente: ahorro ancho de banda usuario + reduce tiempo Vercel function.
Aplico `OffscreenCanvas` con `convertToBlob({ type: 'image/jpeg', quality: 0.85 })`.
Tamaño objetivo: <500KB por foto (Gemini cobra por píxel, no por byte, así
que el límite real es **resolución** ≤ 1600px lado largo).

### Coste Gemini Vision

`gemini-2.5-flash` Vision: ~$0.075 por 1M tokens entrada. Una imagen
estándar son ~258 tokens. Coste por foto: **<0.0001 €**. Despreciable.

### Persistencia imagen

NO se guarda. La imagen es un input efímero. Solo guardamos el JSON
extraído. Si el usuario quiere conservarla, ya está en su Galería /
Gmail / Drive. Esto evita complicaciones legales (RGPD) y storage cost.

---

## Criterios de éxito

- [ ] Foto factura papel desde móvil → extrae emisor, NIF, importe, fecha,
      número en <8 segundos
- [ ] Botón "📷 capturar" en FacturarPanel rellena cliente al instante
- [ ] Buscador universal abre con `f`, busca al escribir (debounce 250ms)
- [ ] Voz: hablar "facturas Microsoft" → ejecuta búsqueda equivalente
- [ ] Imagen en buscador: foto de factura → encuentra emails y facturas
      relacionados
- [ ] Filtros se acumulan (chip bar visual)
- [ ] Mobile: cámara nativa, voz funciona, modal usable con pulgar
- [ ] 0 regresiones, lint clean, TS clean

---

**Procedo.**
