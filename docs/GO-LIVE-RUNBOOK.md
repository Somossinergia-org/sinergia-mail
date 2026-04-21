# Sinergia v2 — Runbook de Go-Live Controlado

**Versión:** 1.0  
**Fecha:** 2026-04-21  
**Responsable:** David Miquel Jordá (CTO, Somos Sinergia)

---

## 1. Prerequisitos

### 1.1 Infraestructura

| Requisito | Variable / Check | Cómo verificar |
|-----------|-----------------|----------------|
| PostgreSQL accesible | `DATABASE_URL` | `psql $DATABASE_URL -c "SELECT 1"` |
| Tablas Phase 3 creadas | cases, audit_events, swarm_working_memory | `GET /api/operations/sanity-check` |
| Tablas Phase 4 creadas | runtime_switches, rate_limit_counters | `GET /api/operations/sanity-check` |
| NextAuth configurado | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Login funciona |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth callback devuelve tokens |
| OpenAI activo | `OPENAI_API_KEY` | Chat responde en dashboard |
| Token encryption key | `TOKEN_ENCRYPTION_KEY` | `GET /api/operations/sanity-check` → encryption: true |
| Modo operativo definido | `SINERGIA_MODE` | Vercel env vars dashboard |

### 1.2 Migraciones a Aplicar

```bash
# Opción A: drizzle-kit push (recomendado — idempotente)
npx drizzle-kit push

# Opción B: SQL manual (si push no está disponible)
psql $DATABASE_URL -f drizzle/0001_phase3_tables.sql

# Phase 4 tablas (runtime_switches + rate_limit_counters):
# Se crean automáticamente con drizzle-kit push.
# Si manual, ejecutar:
psql $DATABASE_URL -c "
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

### 1.3 Variables de Entorno Obligatorias para Go-Live

```bash
# ─── CRÍTICAS (sin estas no arranca) ───
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://app.somossinergia.es
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OPENAI_API_KEY=sk-...

# ─── SEGURIDAD (nuevas en Phase 4) ───
TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>

# ─── MODO OPERATIVO ───
SINERGIA_MODE=shadow  # Empezar aquí. NUNCA production directamente.

# ─── KILL SWITCHES (todos OFF al inicio) ───
# Se gestionan via DB (/api/operations/switches), no necesitan estar en env.
# Env vars son fallback si DB no tiene el key.
```

---

## 2. Orden de Despliegue

```
1. Verificar que DATABASE_URL apunta a la DB correcta
2. Ejecutar migraciones (drizzle-kit push)
3. Verificar tablas: GET /api/operations/sanity-check
4. Deploy a Vercel (git push o vercel deploy)
5. Verificar post-deploy: GET /api/operations/sanity-check
6. Login manual → dashboard carga
7. Panel Operaciones → health carga
8. Oficina Virtual → agents aparecen
9. Enviar un mensaje de prueba al chat → caso se crea
10. Verificar en Panel Operaciones → caso aparece con owner
```

---

## 3. Verificación Post-Deploy

### 3.1 Sanity Check Automático

```bash
curl -s https://app.somossinergia.es/api/operations/sanity-check | jq .
```

Respuesta esperada:
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "tables": { "cases": true, "audit_events": true, "runtime_switches": true, "rate_limit_counters": true },
    "encryption": true,
    "mode": "shadow",
    "killSwitches": { "blockAllExternalComms": false, ... },
    "rateLimits": { "maxMessagesPerCase": 2, ... }
  },
  "timestamp": "2026-04-21T..."
}
```

### 3.2 Verificación Manual

| Check | Cómo | Resultado esperado |
|-------|------|-------------------|
| Login | Iniciar sesión con Google | Dashboard carga |
| Chat | Enviar "Hola, tengo una consulta" | Agente responde, caso se crea |
| Panel Operaciones → Health | Click en tab Operaciones | KPIs visibles, 0 bloqueos |
| Panel Operaciones → Cases | Click en Cases | Caso de prueba visible con owner |
| Panel Operaciones → Activity | Click en Activity | Eventos del caso reciente |
| Oficina Virtual | Click en tab Oficina | 10 agentes visibles con estado |
| Kill Switch | PATCH /api/operations/switches con KILL_BLOCK_ALL_COMMS=true | Próximo intento de envío se bloquea |
| Desactivar Kill Switch | PATCH con value=false | Envíos vuelven a funcionar |

---

## 4. Cómo Activar/Desactivar Modos

### Cambiar modo operativo:

```bash
# En Vercel Dashboard → Settings → Environment Variables:
SINERGIA_MODE=shadow    # o guarded, o production

# Redeploy necesario para cambio de modo (variable de entorno)
```

### Cambiar kill switches en caliente (SIN redeploy):

```bash
# Activar bloqueo total de comunicaciones:
curl -X PATCH https://app.somossinergia.es/api/operations/switches \
  -H "Cookie: <session>" \
  -H "Content-Type: application/json" \
  -d '{"key": "KILL_BLOCK_ALL_COMMS", "value": "true"}'

# Desactivar:
curl -X PATCH ... -d '{"key": "KILL_BLOCK_ALL_COMMS", "value": "false"}'

# Ver estado actual de todos los switches:
curl https://app.somossinergia.es/api/operations/switches
```

### Kill switches disponibles:

| Key | Efecto | Tiempo de aplicación |
|-----|--------|---------------------|
| `KILL_BLOCK_ALL_COMMS` | Bloquea email, WhatsApp, SMS, llamadas | < 30 segundos |
| `KILL_BLOCK_WA_SMS_PHONE` | Bloquea WhatsApp + SMS + teléfono (deja email) | < 30 segundos |
| `KILL_BLOCK_DELEGATION` | Bloquea delegación entre agentes | < 30 segundos |
| `KILL_BLOCK_HIGH_RISK` | Bloquea tools de alto riesgo | < 30 segundos |
| `KILL_FORCE_READONLY` | Nada se escribe ni se envía | < 30 segundos |
| `KILL_DISABLE_JUNIOR` | Junior no recibe casos | < 30 segundos |

---

## 5. Estrategia de Activación por Fases

### Fase A — Staging Final (Día -2 a Día 0)

**Objetivo:** Verificar que todo funciona end-to-end en entorno staging.

```
SINERGIA_MODE=dry-run
```

| Acción | Verificación |
|--------|-------------|
| Ejecutar migraciones | Tablas creadas sin errores |
| Deploy a staging | Build OK, app accesible |
| `GET /api/operations/sanity-check` | Todos los checks = true |
| Login + enviar 3 mensajes distintos | Casos creados, owners asignados |
| Revisar audit_events | Timeline correcta en Panel Operaciones |
| Verificar oficina virtual | Agentes reflejan actividad |
| Probar kill switch | Activar → verificar bloqueo → desactivar |
| Probar acción manual | Cerrar caso → reabrirlo → reasignar |
| Revisar logs | No errores críticos |

**Criterio de salida:** Todo lo anterior pasa. 0 errores en 24h de dry-run.

### Fase B — Producción Shadow (Día 1-3)

**Objetivo:** El sistema toma decisiones reales pero NO envía comunicaciones externas.

```
SINERGIA_MODE=shadow
```

| Configuración | Valor |
|--------------|-------|
| Modo | `shadow` |
| Canales activos | Gmail lectura + sync activo |
| WhatsApp/SMS/Teléfono | Bloqueados (shadow los simula) |
| Rate limits | 2 msg/caso, 3 msg/cliente/60min |
| Kill switches | Todos OFF salvo `KILL_BLOCK_WA_SMS_PHONE=true` |

**Qué hacer:**
1. Sincronizar emails reales (el sync ya funciona en shadow)
2. Observar cómo el swarm categoriza, asigna owners, decide acciones
3. Verificar que las decisiones son correctas revisando Panel Operaciones
4. Los "envíos" se registran como simulados en audit_events (result="simulated")

**Criterio de salida:** 48h sin incidentes. Decisiones del swarm correctas en >90% de casos revisados manualmente.

### Fase C — Producción Guarded (Día 4-10)

**Objetivo:** Acciones reales con límites estrictos y supervisión humana.

```
SINERGIA_MODE=guarded
```

| Configuración | Valor |
|--------------|-------|
| Modo | `guarded` |
| Email salida | Activo (drafts + envío) con límite 5/caso |
| WhatsApp | Bloqueado (abrir en Fase D si éxito) |
| SMS/Teléfono | Bloqueado |
| Rate limits | 5 msg/caso, 8 msg/cliente/60min, 1 llamada/caso |
| Kill switches | `KILL_BLOCK_WA_SMS_PHONE=true` |
| Revisión humana | Primeros 10 envíos reales revisados manualmente |

**Qué hacer:**
1. Revisar cada email saliente del sistema los primeros 2 días
2. Verificar que ownership es correcta (no doble voz)
3. Monitorizar Panel Operaciones → Health diariamente
4. Si se detecta anomalía → activar kill switch correspondiente

**Criterio de salida:** 7 días sin incidentes. 0 doble voz. 0 envíos incorrectos. Health score ≥ 80.

### Fase D — Producción Ampliada (Día 11+)

```
SINERGIA_MODE=production
```

| Configuración | Valor |
|--------------|-------|
| Modo | `production` |
| Todos los canales | Activos (desactivar `KILL_BLOCK_WA_SMS_PHONE`) |
| Rate limits | 20 msg/caso, 30 msg/cliente, 5 llamadas/caso |
| Kill switches | Todos OFF |
| Supervisión | Diaria → cada 2 días → semanal |

---

## 6. Checklist de Validación Humana (Primeros 10 Casos)

Para **cada uno** de los primeros 10 casos reales en modo guarded:

```
□ Caso creado correctamente (id, timestamp, channel, client)
□ Owner visible asignado (visibleOwnerId no es null)
□ Owner es coherente (agente de capa visible o CEO)
□ NO hay doble voz (solo el owner habla al cliente)
□ Timeline audit completa (todos los pasos registrados)
□ Herramientas bloqueadas correctamente si aplica
□ Si hay envío externo: contenido apropiado, tono correcto
□ Si NO hay envío: motivo correcto (kill switch, rate limit, modo)
□ Panel operativo refleja el caso (aparece en lista, detalle correcto)
□ Oficina virtual refleja actividad coherente del agente owner
□ Si se usa kill switch mid-case: el caso se para correctamente
□ Acciones manuales funcionan (pause, close, reassign desde panel)
□ No hay errores en console/logs para este caso
```

**Criterio:** 10/10 casos pasan todos los checks → se puede relajar supervisión.

---

## 7. Plan de Monitorización — Primera Semana

### Día 1-2 (Shadow)

| Momento | Qué revisar | Dónde |
|---------|-------------|-------|
| Mañana | Sanity check + Health endpoint | `GET /api/operations/sanity-check` + `GET /api/operations/health` |
| Mañana | Casos creados overnight | Panel Operaciones → Cases (filtrar por today) |
| Mañana | Errores en audit | Panel Operaciones → Activity (filtrar violations/blocked) |
| Tarde | Ownership correcta | Revisar 3-5 casos manualmente |
| Tarde | Oficina virtual coherente | Tab Oficina → agentes con estado lógico |

**Señales OK:** Casos se crean, owners se asignan, 0 violations, 0 blocked inesperados.  
**Señales alarma:** Violations > 0, ownership null en casos activos, errores repetitivos.

### Día 3-4 (Transición a Guarded)

| KPI | Umbral OK | Umbral alarma |
|-----|-----------|---------------|
| Casos procesados/día | > 5 | < 1 (sistema no responde) |
| Bloqueos gobernanza | 0-2 (normales) | > 5 en 1h |
| Violaciones | 0 | > 0 (rollback a shadow) |
| Doble voz | 0 | > 0 (rollback INMEDIATO) |
| Health score | ≥ 80 | < 60 |
| Emails enviados correctamente | 100% | < 90% requiere pausa |

### Día 5-7 (Guarded estable)

| Momento | Qué revisar |
|---------|-------------|
| Diario mañana | Health check automático + últimas 24h de actividad |
| Diario | Revisar 2-3 casos con envíos reales (contenido, tono, timing) |
| Diario | Verificar que rate limits no se agotan prematuramente |
| Fin de semana | Revisar todos los envíos de la semana, clasificar como correcto/incorrecto |

### Herramientas de monitorización disponibles:

- **`GET /api/operations/health`** — KPIs en tiempo real
- **`GET /api/operations/activity?type=violations`** — Solo anomalías
- **`GET /api/operations/activity?type=blocked`** — Bloqueos legítimos
- **Panel Operaciones en UI** — Vista humana completa
- **`GET /api/operations/sanity-check`** — Estado del sistema
- **Oficina Virtual** — Señal visual de actividad

---

## 8. Criterios de Rollback

### Rollback INMEDIATO (activar en < 1 minuto):

| Incidente | Acción | Kill Switch |
|-----------|--------|-------------|
| Doble voz detectada | Bloquear todo + investigar | `KILL_FORCE_READONLY=true` |
| Spam / envíos masivos no deseados | Bloquear comms | `KILL_BLOCK_ALL_COMMS=true` |
| Datos de cliente expuestos | Read-only + notificar | `KILL_FORCE_READONLY=true` |
| Mensajes con contenido incorrecto/ofensivo | Bloquear canal afectado | `KILL_BLOCK_ALL_COMMS=true` |

### Bajar de modo (aplicar en < 5 minutos):

| Incidente | Acción |
|-----------|--------|
| 3+ violaciones de gobernanza en 1h | `production → guarded` |
| Ownership incorrecta detectada | `guarded → shadow` |
| Agente responde a cliente equivocado | `guarded → shadow` |
| Rate limits se agotan en < 1h | Subir límites O bajar a shadow |
| Health score < 60 durante 2h | Bajar un nivel de modo |

### Árbol de decisión:

```
¿Afecta al cliente directamente? (mensaje enviado, datos expuestos)
├─ SÍ → KILL_BLOCK_ALL_COMMS=true AHORA. Investigar. Notificar.
│       ⚠️ Los mensajes ya enviados NO se pueden revertir.
│       → Documentar: qué se envió, a quién, impacto.
└─ NO → ¿Es un problema de decisión del swarm? (ownership mal, delegación rota)
         ├─ SÍ → Bajar modo un nivel. Revisar últimos 5 casos afectados.
         │       → Si se repite tras bajar → KILL_FORCE_READONLY.
         └─ NO → ¿Es un problema de infraestructura? (DB, OpenAI, timeouts)
                  ├─ SÍ → No tocar modo. Arreglar infra. Monitorizar.
                  └─ NO → Documentar como anomalía. Seguir monitorizando.
```

### Qué NO se puede revertir:
- Emails ya enviados (están en la bandeja del destinatario)
- Mensajes WhatsApp entregados
- SMS enviados
- Llamadas realizadas

### Documentar incidente:
```
1. Timestamp exacto
2. Qué pasó (evento audit_events concreto)
3. A quién afectó (cliente, caso)
4. Qué acción se tomó (kill switch, modo)
5. Quién lo detectó y cuándo
6. Root cause (si se sabe)
7. Prevención futura
```

---

## 9. Criterios de Ampliación de Alcance

### De shadow → guarded (requiere TODO esto):
- ✅ 48h continuas sin violaciones
- ✅ 20+ casos procesados correctamente
- ✅ Ownership correcta en 100% de casos revisados
- ✅ 0 doble voz
- ✅ Sanity check = healthy

### De guarded → production (requiere TODO esto):
- ✅ 7 días continuos sin incidentes
- ✅ 50+ casos con envíos reales correctos
- ✅ Health score ≥ 80 durante 7 días
- ✅ 0 doble voz
- ✅ 0 envíos incorrectos (contenido, destinatario, tono)
- ✅ Rate limits no alcanzados prematuramente
- ✅ Revisión manual confirma calidad

### Abrir WhatsApp/SMS/Teléfono (desde production):
- ✅ 14 días de email sin incidentes
- ✅ 100+ casos procesados correctamente
- ✅ Configurar números Twilio reales
- ✅ Test con número propio primero (sandbox)
- ✅ Desactivar `KILL_BLOCK_WA_SMS_PHONE` gradualmente

### Relajar rate limits:
- ✅ Verificar que los límites actuales se alcanzan por volumen legítimo (no por error)
- ✅ Subir límites de 2 en 2, no de golpe
- ✅ Monitorizar 24h después de cada subida

---

## 10. Configuración Recomendada por Entorno

### Staging

```bash
SINERGIA_MODE=dry-run
TOKEN_ENCRYPTION_KEY=staging-only-key-not-for-production
# Kill switches: todos OFF (testar en dry-run es seguro)
# Rate limits: los de dry-run (0 — nada se envía)
```

### Producción — Semana 1

```bash
SINERGIA_MODE=shadow
TOKEN_ENCRYPTION_KEY=<clave-real-generada-con-openssl>
# Kill switches via DB:
#   KILL_BLOCK_WA_SMS_PHONE = true  (solo email activo)
#   Resto = false
# Rate limits (shadow defaults):
#   LIMIT_MSG_PER_CASE = 2
#   LIMIT_MSG_PER_CLIENT = 3
#   LIMIT_CALLS_PER_CASE = 0
#   LIMIT_CONTACT_COOLDOWN = 300
```

### Producción — Semana 2+ (guarded)

```bash
SINERGIA_MODE=guarded
# Kill switches via DB:
#   KILL_BLOCK_WA_SMS_PHONE = true (mantener hasta semana 3+)
#   Resto = false
# Rate limits via DB:
#   LIMIT_MSG_PER_CASE = 5
#   LIMIT_MSG_PER_CLIENT = 8
#   LIMIT_CALLS_PER_CASE = 1
#   LIMIT_CONTACT_COOLDOWN = 120
```

### Producción estable (production)

```bash
SINERGIA_MODE=production
# Kill switches: todos OFF
# Rate limits (production defaults):
#   LIMIT_MSG_PER_CASE = 20
#   LIMIT_MSG_PER_CLIENT = 30
#   LIMIT_CALLS_PER_CASE = 5
#   LIMIT_CONTACT_COOLDOWN = 30
```

---

## 11. Smoke Tests Pre-Go-Live

Ejecutar antes de cada cambio de modo:

```bash
# Automático:
node scripts/smoke-validation.mjs https://app.somossinergia.es

# O manual:
curl -s $URL/api/operations/sanity-check | jq '.status'  # → "healthy"
```

Checklist compacto:

```
□ Sanity check = healthy
□ Login funciona
□ Chat responde (caso se crea)
□ Panel Operaciones carga (health + cases + activity)
□ Oficina Virtual muestra agentes
□ Kill switch KILL_BLOCK_ALL_COMMS activa y desactiva correctamente
□ Caso se puede cerrar/reabrir desde panel
□ Tokens cifrados (encryptToken/decryptToken funciona)
□ Stream SSE conecta (oficina se actualiza)
```

---

## Apéndice: Contactos y Escalación

| Rol | Persona | Acción |
|-----|---------|--------|
| CTO / Decisor | David Miquel Jordá | Cambios de modo, rollback final |
| Monitorización | David (semana 1) | Revisión diaria panel + logs |
| Escalación técnica | Soporte técnico interno | Si DB cae, si OpenAI no responde |
