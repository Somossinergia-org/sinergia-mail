# Plan Operativo de Salida — Sinergia v2

**Fecha:** 21 abril 2026 (staging) → 22 abril 2026 (producción guarded)  
**Responsable:** David Miquel Jordá  
**Estado del sistema:** 1013 tests pasando, tsc limpio, arquitectura v2 cerrada

---

## PARTE 1 — STAGING FINAL HOY (21 abril)

### A. Preparación previa al deploy

**1. Variables de entorno en Vercel (Preview/Staging)**

Verificar que TODAS estas variables existen en Vercel Dashboard → Settings → Environment Variables → Preview:

```
# CRÍTICAS (sin estas no arranca)
DATABASE_URL          → apuntando a base de staging (NO producción)
NEXTAUTH_SECRET       → valor único para staging (openssl rand -base64 32)
NEXTAUTH_URL          → https://staging.somossinergia.es (o tu URL de Preview)
GOOGLE_CLIENT_ID      → el mismo que producción (OAuth acepta ambos redirects)
GOOGLE_CLIENT_SECRET  → el mismo
OPENAI_API_KEY        → sk-... (puede ser la misma key, staging gasta poco)

# SEGURIDAD — NUEVAS
TOKEN_ENCRYPTION_KEY  → valor DIFERENTE al de producción (openssl rand -base64 32)

# MODO OPERATIVO
SINERGIA_MODE         → shadow
```

**2. Kill switches de partida en staging**

Poner en las env vars de Vercel o dejar en default (se gestionan después via API):

```
KILL_BLOCK_ALL_COMMS      = true     ← staging NO envía nada externo
KILL_BLOCK_WA_SMS_PHONE   = true     ← redundante pero explícito
KILL_BLOCK_DELEGATION     = false    ← queremos probar delegación
KILL_BLOCK_HIGH_RISK      = false    ← queremos probar que bloquea correctamente
KILL_FORCE_READONLY       = false    ← queremos que escriba en DB
KILL_DISABLE_JUNIOR       = false    ← queremos probar Junior
KILL_BLOCKED_CHANNELS     = whatsapp,sms,phone,telegram
```

**3. Verificar antes de pushear**

Ejecutar en local:

```bash
npx tsc --noEmit              # debe dar 0 errores
npx vitest run                 # debe dar 1013+ tests pasando
git status                     # sin cambios pendientes no commiteados
```

### B. Ejecución del deploy a staging

**Paso 1 — Push a rama de staging**

```bash
git push origin main           # Vercel despliega automáticamente
# o si usas branch staging:
git push origin staging
```

**Paso 2 — Migraciones (después de que el deploy esté live)**

```bash
# Opción A: drizzle-kit push (recomendado — idempotente)
CLOUDSQL_URL=$DATABASE_URL_STAGING npx drizzle-kit push

# Opción B: SQL directo si drizzle-kit no está disponible
psql $DATABASE_URL_STAGING -c "
CREATE TABLE IF NOT EXISTS runtime_switches (
  key varchar(100) PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_by text,
  updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  id serial PRIMARY KEY,
  scope varchar(30) NOT NULL,
  entity_key varchar(200) NOT NULL,
  counter varchar(50) NOT NULL,
  value integer NOT NULL DEFAULT 0,
  window_start timestamp DEFAULT now(),
  last_updated timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rlc_scope_key_idx ON rate_limit_counters (scope, entity_key, counter);
"
```

**Paso 3 — Verificar que las tablas nuevas existen**

```bash
psql $DATABASE_URL_STAGING -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('cases','audit_events','runtime_switches','rate_limit_counters','swarm_working_memory','email_accounts')
ORDER BY table_name;
"
# Debe devolver las 6 tablas
```

### C. Validación técnica inmediata

**Paso 1 — Sanity check (navegador o curl)**

```bash
# Abrir en navegador (requiere estar logueado):
https://staging.somossinergia.es/api/operations/sanity-check

# O con curl + cookie de sesión:
curl -s -H "Cookie: next-auth.session-token=TU_TOKEN" \
  https://staging.somossinergia.es/api/operations/sanity-check | jq .
```

**Resultado válido:**
```json
{
  "ok": true,
  "summary": { "passed": 8, "failed": 0 },
  "environment": {
    "operationMode": "shadow",
    "hasEncryptionKey": true,
    "hasDbUrl": true
  }
}
```

**Si `ok: false`:** leer el array `checks` para ver cuál falla. Corregir antes de continuar.

**Paso 2 — Smoke validation (desde terminal)**

```bash
./scripts/smoke-validation.sh https://staging.somossinergia.es "next-auth.session-token=TU_TOKEN"
```

**Resultado válido:** `SMOKE VALIDATION PASSED` con exit code 0.

**Paso 3 — Verificar modo operativo**

```bash
curl -s -H "Cookie: ..." \
  https://staging.somossinergia.es/api/operations/switches | jq '.switches[] | select(.key=="SINERGIA_MODE") // "using env default"'
```

Confirmar que el modo es `shadow`.

### D. Validación funcional manual — 10 casos

Abrir el navegador en staging. Loguearse. Ejecutar cada caso y verificar lo indicado.

---

**CASO 1 — Particular simple (comercial-principal)**

- Acción: Escribir en chat "Tengo una factura de luz muy alta en mi casa, quiero revisar opciones"
- Qué debe pasar: Recepción recibe → routea a comercial-principal → responde con opciones residenciales
- Verificar:
  - [ ] Caso creado en panel Operaciones
  - [ ] Owner visible = recepcion o comercial-principal
  - [ ] Timeline muestra routing + respuesta
  - [ ] Respuesta coherente sobre opciones residenciales
- Señal de fallo: no se crea caso, owner vacío, agente equivocado, respuesta en blanco

---

**CASO 2 — PYME multi-servicio (comercial-principal + consultor)**

- Acción: "Somos una empresa con 3 locales, queremos optimizar electricidad y contratar mantenimiento"
- Qué debe pasar: Recepción → comercial-principal → posible delegación a consultor-servicios
- Verificar:
  - [ ] Caso creado
  - [ ] Si delega: timeline muestra `agent_delegated`
  - [ ] Si no delega: comercial-principal responde sobre ambos servicios
  - [ ] En modo shadow: no se envía nada externo (verificar audit)
- Señal de fallo: dos agentes responden al usuario al mismo tiempo, delegación cíclica

---

**CASO 3 — Consulta interna (consultor-digital)**

- Acción: "Necesitamos una auditoría digital de nuestra presencia online"
- Qué debe pasar: Routing a consultor-digital (capa experta-interna)
- Verificar:
  - [ ] Owner visible = recepcion o comercial (NO consultor-digital directo al cliente)
  - [ ] Consultor-digital trabaja en segundo plano
  - [ ] La respuesta al usuario sale por la capa visible
- Señal de fallo: consultor-digital habla directamente al cliente, se expone agente interno

---

**CASO 4 — Consulta legal / RGPD**

- Acción: "Quiero saber cómo manejan mis datos personales y si cumplen con GDPR"
- Qué debe pasar: Routing involucra legal-rgpd (capa experta-interna)
- Verificar:
  - [ ] legal-rgpd participa en la decisión
  - [ ] Respuesta cita normativa de protección de datos
  - [ ] legal-rgpd NO aparece como owner visible al cliente
- Señal de fallo: respuesta genérica sin mención a RGPD, legal-rgpd como owner visible

---

**CASO 5 — Bloqueo de tool por guardrails**

- Acción: Activar temporalmente `KILL_BLOCK_HIGH_RISK=true` via API:
  ```bash
  curl -X PATCH -H "Content-Type: application/json" -H "Cookie: ..." \
    https://staging.somossinergia.es/api/operations/switches \
    -d '{"key":"KILL_BLOCK_HIGH_RISK","value":"true"}'
  ```
  Luego enviar un mensaje que active una tool de alto riesgo.
- Qué debe pasar: La tool se bloquea, se registra `tool_blocked` en audit
- Verificar:
  - [ ] Panel operativo muestra bloqueo
  - [ ] Timeline del caso muestra evento de bloqueo
  - [ ] El chat NO se rompe — responde algo razonable al usuario
- Después: Restaurar `KILL_BLOCK_HIGH_RISK=false`
- Señal de fallo: tool se ejecuta pese al kill switch, o el chat se queda colgado

---

**CASO 6 — Delegación entre agentes**

- Acción: "Quiero contratar un servicio de energía solar y necesito que revisen si hay subvenciones disponibles"
- Qué debe pasar: comercial delega a consultor-servicios para subvenciones
- Verificar:
  - [ ] Timeline muestra delegación
  - [ ] No hay más de 2 delegaciones en cadena
  - [ ] Owner visible se mantiene coherente
- Señal de fallo: más de 4 delegaciones (cadena infinita), owner cambia erráticamente

---

**CASO 7 — Cambio de owner manual**

- Acción: Desde el panel operativo, seleccionar un caso existente y ejecutar "Reasignar" a otro agente
- Qué debe pasar: PATCH al caso → owner cambia → audit registra `manual_reassign`
- Verificar:
  - [ ] Caso muestra nuevo owner
  - [ ] Timeline muestra acción manual con `agentId: "human"`
  - [ ] El caso sigue funcionando con el nuevo owner
- Señal de fallo: error 500, owner no cambia, timeline vacía

---

**CASO 8 — Chat móvil con streaming**

- Acción: Abrir staging en móvil (Chrome o Safari). Escribir "Hola, necesito información sobre tarifas de luz"
- Qué debe pasar: Streaming SSE funciona, texto aparece progresivamente
- Verificar:
  - [ ] La respuesta se muestra palabra a palabra (no de golpe)
  - [ ] No hay errores de conexión en consola
  - [ ] La interfaz es usable en pantalla pequeña
  - [ ] El scroll funciona correctamente
- Señal de fallo: respuesta aparece de golpe (no hay streaming), error de red, layout roto

---

**CASO 9 — Panel operativo coherente**

- Acción: Ir a la pestaña Operaciones del dashboard
- Qué debe pasar: Se ven los casos creados, con health, activity y timeline
- Verificar:
  - [ ] Health endpoint carga (casos por status, stale, blocks)
  - [ ] Lista de casos muestra los creados en las pruebas anteriores
  - [ ] Al hacer click en un caso, se ve su timeline completa
  - [ ] Activity muestra eventos recientes (los de estas pruebas)
- Señal de fallo: panel vacío, error al cargar, timeline incongruente con lo que pasó

---

**CASO 10 — Oficina virtual coherente**

- Acción: Ir a la pestaña Oficina Virtual del dashboard
- Qué debe pasar: Los 10 agentes aparecen, con estado que refleja actividad reciente
- Verificar:
  - [ ] 10 agentes visibles
  - [ ] Agentes que participaron en casos muestran actividad (busy/active)
  - [ ] Agentes bloqueados (si activaste kill switch) muestran estado "blocked"
  - [ ] SSE stream actualiza en tiempo real
- Señal de fallo: menos de 10 agentes, todos en idle, oficina no carga, SSE desconectado

---

### E. Criterio de aprobación de staging

**Para autorizar producción mañana, TODO esto debe cumplirse hoy:**

| # | Condición | Cumplido |
|---|-----------|----------|
| 1 | Sanity-check devuelve `ok: true` con 8/8 checks | [ ] |
| 2 | Smoke validation devuelve `PASSED` | [ ] |
| 3 | Los 10 casos funcionales se completaron sin bloqueo crítico | [ ] |
| 4 | Ningún agente interno habló directamente al cliente | [ ] |
| 5 | Las delegaciones funcionan sin cadena infinita | [ ] |
| 6 | Kill switches activan y desactivan correctamente | [ ] |
| 7 | Panel operativo muestra datos coherentes | [ ] |
| 8 | Oficina virtual muestra los 10 agentes con estados coherentes | [ ] |
| 9 | Chat móvil funciona con streaming | [ ] |
| 10 | Timeline de audit refleja lo que realmente pasó | [ ] |

**Bloqueantes — NO pasar a producción si:**

- Sanity-check devuelve `ok: false` en cualquier check
- Algún agente interno (fiscal, bi-scoring, consultor) apareció como owner visible ante el cliente
- Una delegación generó cadena de más de 4 saltos
- Un kill switch activado no bloqueó lo que debía
- El chat se quedó colgado o devolvió error 500
- La oficina virtual muestra menos de 10 agentes o no refleja actividad

---

## PARTE 2 — PRODUCCIÓN GUARDED MAÑANA (22 abril)

### A. Configuración inicial exacta

**Variables en Vercel → Production:**

```
SINERGIA_MODE              = guarded
TOKEN_ENCRYPTION_KEY       = <NUEVO valor, diferente de staging>
```

**Kill switches de arranque (via env o via API después del deploy):**

```
KILL_BLOCK_ALL_COMMS       = false    ← permitir email
KILL_BLOCK_WA_SMS_PHONE    = true     ← cerrar canales sensibles
KILL_BLOCK_DELEGATION      = false    ← delegación activa
KILL_BLOCK_HIGH_RISK       = false    ← activo pero con guardrails
KILL_FORCE_READONLY        = false
KILL_DISABLE_JUNIOR        = false
KILL_BLOCKED_CHANNELS      = whatsapp,sms,phone,telegram
```

**Rate limits (los de guarded por defecto, no necesitas override):**

```
maxMessagesPerCase         = 5        (guarded default)
maxMessagesPerClientWindow = 8        (guarded default)
clientWindowMinutes        = 60
maxCallsPerCase            = 1
maxChainedEscalations      = 4
maxToolRetries             = 2
cooldownBetweenContactsSec = 120
maxHighRiskToolsPerCase    = 3
```

No necesitas poner las LIMIT_* en env vars. El modo `guarded` ya aplica estos valores. Solo añádelas si quieres overrides.

### B. Alcance corto recomendado

**SÍ abrir mañana:**

- Casos de consulta simple (particular que pregunta por tarifas)
- Casos de PYME simple (un local, un servicio)
- Consultas informativas (qué servicios ofrecéis, horarios, ubicación)
- Email entrante de Gmail (ya conectado, lectura y respuesta via draft)

**NO abrir mañana:**

- Casos con envío de WhatsApp o SMS (canales bloqueados)
- Llamadas telefónicas automáticas (canal bloqueado)
- Casos de clientes grandes multi-sede (complejidad alta)
- Operaciones masivas o bulk (high-risk tools vigiladas)
- Envíos de Telegram (canal bloqueado)

**Canales activos mañana:**

| Canal | Estado | Motivo |
|-------|--------|--------|
| Email (Gmail) | ACTIVO | Ya probado, bajo riesgo, reversible |
| Chat web | ACTIVO | Interfaz propia, controlada |
| Chat móvil PWA | ACTIVO | Probado en staging |
| WhatsApp | BLOQUEADO | Canal sensible, abrir en semana 2 si todo ok |
| SMS | BLOQUEADO | Coste por mensaje, abrir después |
| Teléfono | BLOQUEADO | Mayor riesgo reputacional, abrir último |
| Telegram | BLOQUEADO | Abrir en semana 2 |

### C. Secuencia de arranque mañana

**Hora estimada: 09:00**

**Paso 1 — Deploy (08:30)**

```bash
# Verificar que env vars de producción están correctas en Vercel
# Hacer deploy a producción
git push origin main  # o merge PR a main
```

**Paso 2 — Migraciones (08:40)**

```bash
# Si es primera vez en producción con las tablas nuevas:
CLOUDSQL_URL=$DATABASE_URL_PRODUCTION npx drizzle-kit push

# Verificar:
psql $DATABASE_URL_PRODUCTION -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('cases','audit_events','runtime_switches','rate_limit_counters')
ORDER BY table_name;
"
```

**Paso 3 — Sanity check (08:45)**

```bash
# En navegador (logueado como admin):
https://app.somossinergia.es/api/operations/sanity-check

# DEBE dar: ok: true, 8/8 checks, operationMode: "guarded"
```

**Paso 4 — Smoke validation (08:50)**

```bash
./scripts/smoke-validation.sh https://app.somossinergia.es "next-auth.session-token=TU_TOKEN_PROD"
# DEBE dar: SMOKE VALIDATION PASSED
```

**Paso 5 — Configurar kill switches via API (08:55)**

```bash
BASE=https://app.somossinergia.es
COOKIE="next-auth.session-token=TU_TOKEN_PROD"

# Asegurar que canales sensibles están cerrados:
curl -X PATCH -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  $BASE/api/operations/switches \
  -d '{"key":"KILL_BLOCK_WA_SMS_PHONE","value":"true"}'

curl -X PATCH -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  $BASE/api/operations/switches \
  -d '{"key":"KILL_BLOCKED_CHANNELS","value":"whatsapp,sms,phone,telegram"}'

# Verificar estado final:
curl -s -H "Cookie: $COOKIE" $BASE/api/operations/switches | jq '.switches'
```

**Paso 6 — Primer caso real de prueba (09:00)**

Abrir el chat y enviar un mensaje real como si fueras un cliente. Seguir la checklist del punto D.

**Paso 7 — Supervisión primera hora (09:00–10:00)**

Mantener abiertos en paralelo:
- Chat (para ver respuestas)
- Panel Operaciones (para ver casos, timeline, health)
- Oficina Virtual (para ver estado de agentes)

### D. Checklist por caso real en producción

Para CADA uno de los primeros 5–10 casos reales, verificar:

| # | Verificación | OK |
|---|-------------|-----|
| 1 | Caso creado correctamente en panel Operaciones | [ ] |
| 2 | Owner visible = agente de capa visible (recepcion, comercial-principal, comercial-junior) | [ ] |
| 3 | Sin doble voz — solo un agente responde al cliente por turno | [ ] |
| 4 | Agentes internos (fiscal, bi-scoring, consultor, legal) NO hablan directamente al cliente | [ ] |
| 5 | Timeline correcta — secuencia lógica de eventos, sin saltos raros | [ ] |
| 6 | Panel operativo refleja el caso con status correcto (open/active) | [ ] |
| 7 | Oficina virtual muestra al agente activo trabajando en el caso | [ ] |
| 8 | Bloqueos de canales activos — no se envía nada por WhatsApp/SMS/teléfono | [ ] |
| 9 | Solo se usa email si el caso lo requiere (y en modo guarded, solo draft) | [ ] |
| 10 | Audit trail completo — cada acción del agente tiene evento registrado | [ ] |
| 11 | Rate limits respetados — no más de 5 mensajes por caso | [ ] |
| 12 | Respuesta coherente y útil para el cliente | [ ] |

### E. Señales para seguir / ampliar

**Si durante el día 1 (mañana) ves TODO esto, puedes seguir con confianza:**

- 5+ casos procesados sin ningún fallo de gobernanza
- 0 agentes internos expuestos al cliente
- 0 delegaciones cíclicas
- 0 errores 500 en el chat
- Timeline limpia y coherente en todos los casos
- Panel operativo estable (health carga, activity coherente)
- Kill switches responden correctamente cuando se activan/desactivan
- Respuestas de los agentes útiles y en español correcto

**Cuándo ampliar (decisiones concretas):**

| Hito | Acción |
|------|--------|
| 10 casos sin fallo en 2 días | Considerar abrir WhatsApp |
| 20 casos sin fallo en 3 días | Abrir WhatsApp + Telegram |
| 30 casos, 0 incidentes en 5 días | Considerar subir a `production` |
| 50 casos, 0 incidentes en 7 días | Abrir todos los canales, modo `production` |

**Para abrir WhatsApp (cuando decidas):**

```bash
curl -X PATCH -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  $BASE/api/operations/switches \
  -d '{"key":"KILL_BLOCK_WA_SMS_PHONE","value":"false"}'

curl -X PATCH -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  $BASE/api/operations/switches \
  -d '{"key":"KILL_BLOCKED_CHANNELS","value":"sms,phone"}'
```

### F. Señales para bajar o frenar

**ROJO — Acción inmediata (cortar en menos de 5 minutos):**

| Señal | Acción exacta |
|-------|---------------|
| Agente interno responde directamente a un cliente | Activar `KILL_BLOCK_ALL_COMMS=true` → investigar |
| Delegación cíclica (>4 saltos) | Activar `KILL_BLOCK_DELEGATION=true` → investigar |
| Error 500 masivo en chat (>3 seguidos) | Volver a `SINERGIA_MODE=shadow` en Vercel → redeploy |
| Email no solicitado enviado a un cliente | Activar `KILL_BLOCK_ALL_COMMS=true` → revisar audit |
| Datos de un cliente expuestos a otro | Activar `KILL_FORCE_READONLY=true` → PARAR TODO → investigar |

**Comando de emergencia — parar todo:**

```bash
# Opción 1: Via API (sin redeploy, efecto en <30s)
curl -X PATCH -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  $BASE/api/operations/switches \
  -d '{"key":"KILL_BLOCK_ALL_COMMS","value":"true"}'

# Opción 2: Volver a shadow (requiere redeploy)
# En Vercel: cambiar SINERGIA_MODE=shadow → Redeploy

# Opción 3: Modo solo lectura total
curl -X PATCH -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  $BASE/api/operations/switches \
  -d '{"key":"KILL_FORCE_READONLY","value":"true"}'
```

**AMARILLO — Vigilar más de cerca:**

| Señal | Acción |
|-------|--------|
| Respuesta de agente incoherente (1 vez) | Revisar caso, no cortar todavía |
| Latencia alta (>5s en respuesta) | Revisar logs de OpenAI, posible saturación |
| Kill switch no tuvo efecto en 30s | Llamar a `refreshSwitchCache()` o redeploy |
| Caso en status raro (ni open ni closed) | Revisar manualmente, posible bug de estado |
| Timeline con gaps (eventos faltantes) | Revisar logs de auditStore, posible fallo de insert |

---

## PARTE 3 — CONFIGURACIÓN EXACTA RECOMENDADA

### Staging (hoy)

```
SINERGIA_MODE              = shadow

KILL_BLOCK_ALL_COMMS       = true
KILL_BLOCK_WA_SMS_PHONE    = true
KILL_BLOCK_DELEGATION      = false
KILL_BLOCK_HIGH_RISK       = false
KILL_FORCE_READONLY        = false
KILL_DISABLE_JUNIOR        = false
KILL_BLOCKED_CHANNELS      = whatsapp,sms,phone,telegram

TOKEN_ENCRYPTION_KEY       = <generar con: openssl rand -base64 32>

# Rate limits: shadow defaults (no override necesario)
# maxMessagesPerCase=2, maxCallsPerCase=0, cooldown=300s
```

### Producción (mañana)

```
SINERGIA_MODE              = guarded

KILL_BLOCK_ALL_COMMS       = false
KILL_BLOCK_WA_SMS_PHONE    = true
KILL_BLOCK_DELEGATION      = false
KILL_BLOCK_HIGH_RISK       = false
KILL_FORCE_READONLY        = false
KILL_DISABLE_JUNIOR        = false
KILL_BLOCKED_CHANNELS      = whatsapp,sms,phone,telegram

TOKEN_ENCRYPTION_KEY       = <generar NUEVO con: openssl rand -base64 32>

# Rate limits: guarded defaults (no override necesario)
# maxMessagesPerCase=5, maxCallsPerCase=1, cooldown=120s
```

### Producción estable (semana 2+, cuando métricas sean buenas)

```
SINERGIA_MODE              = production

KILL_BLOCK_ALL_COMMS       = false
KILL_BLOCK_WA_SMS_PHONE    = false
KILL_BLOCK_DELEGATION      = false
KILL_BLOCK_HIGH_RISK       = false
KILL_FORCE_READONLY        = false
KILL_DISABLE_JUNIOR        = false
KILL_BLOCKED_CHANNELS      =             ← vacío, todos abiertos

# Rate limits: production defaults
# maxMessagesPerCase=20, maxCallsPerCase=5, cooldown=30s
```

---

## PARTE 4 — CHECKLIST DE EQUIPO

### Hoy — Staging

```
PREPARACIÓN
[ ] Variables de entorno configuradas en Vercel Preview
[ ] TOKEN_ENCRYPTION_KEY generada para staging
[ ] SINERGIA_MODE = shadow
[ ] Kill switches: BLOCK_ALL_COMMS=true, canales sensibles bloqueados
[ ] tsc --noEmit limpio en local
[ ] vitest run pasando (1013+ tests)
[ ] Código commiteado y pusheado

DEPLOY
[ ] Push a rama → Vercel despliega
[ ] Migraciones ejecutadas (drizzle-kit push)
[ ] Tablas nuevas verificadas en DB

VALIDACIÓN TÉCNICA
[ ] Sanity-check: ok=true, 8/8 checks
[ ] Smoke validation: PASSED
[ ] Modo confirmado: shadow

VALIDACIÓN FUNCIONAL (10 CASOS)
[ ] Caso 1: Particular simple → caso creado, owner correcto
[ ] Caso 2: PYME multi-servicio → delegación si aplica
[ ] Caso 3: Consulta interna → agente interno NO visible al cliente
[ ] Caso 4: Legal/RGPD → legal-rgpd participa, NO visible
[ ] Caso 5: Kill switch high-risk → bloquea y registra
[ ] Caso 6: Delegación → timeline correcta, sin ciclos
[ ] Caso 7: Cambio owner manual → funciona desde panel
[ ] Caso 8: Chat móvil → streaming funciona
[ ] Caso 9: Panel operativo → datos coherentes
[ ] Caso 10: Oficina virtual → 10 agentes, estados correctos

DECISIÓN
[ ] ¿Todos los criterios de aprobación cumplidos?
[ ] → SÍ: autorizado para producción mañana
[ ] → NO: listar bloqueos, resolver antes de avanzar
```

### Mañana — Producción guarded

```
PRE-DEPLOY (08:30)
[ ] Variables de producción verificadas en Vercel
[ ] TOKEN_ENCRYPTION_KEY de producción (NUEVA, diferente de staging)
[ ] SINERGIA_MODE = guarded
[ ] DATABASE_URL apunta a base de producción

DEPLOY (08:35)
[ ] Push/merge a main → Vercel despliega
[ ] Migraciones ejecutadas en producción
[ ] Tablas verificadas

VALIDACIÓN (08:45)
[ ] Sanity-check: ok=true, mode=guarded
[ ] Smoke validation: PASSED
[ ] Kill switches configurados via API (WA/SMS/phone bloqueados)

ARRANQUE (09:00)
[ ] Primer caso de prueba real enviado
[ ] Caso creado correctamente
[ ] Respuesta coherente
[ ] Owner visible correcto
[ ] Timeline limpia

SUPERVISIÓN PRIMERA HORA (09:00–10:00)
[ ] Panel operativo abierto en paralelo
[ ] Oficina virtual abierta en paralelo
[ ] 0 agentes internos expuestos
[ ] 0 errores 500
[ ] 0 delegaciones cíclicas
[ ] Canales bloqueados siguen bloqueados

REVISIÓN FIN DE DÍA
[ ] ¿Cuántos casos procesados?
[ ] ¿Algún incidente?
[ ] ¿Kill switches funcionaron si se probaron?
[ ] ¿Respuestas de agentes coherentes?
[ ] → TODO OK: seguir mañana
[ ] → INCIDENTES: documentar, valorar si volver a shadow
```

---

*Documento generado el 21 de abril de 2026. Basado en el estado real del código (1013 tests, tsc limpio) y la infraestructura existente (Vercel + PostgreSQL + drizzle-kit + Next.js).*
