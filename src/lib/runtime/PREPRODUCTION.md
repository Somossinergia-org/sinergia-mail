# Pack de Preproducción — Sinergia v2

## Checklist de Preproducción

### A. Infraestructura

| Check | Variable / Requisito | Estado |
|-------|---------------------|--------|
| Mode configurado | `SINERGIA_MODE=dry-run` (empezar aquí) | [ ] |
| Database conectada | `DATABASE_URL` (PostgreSQL) | [ ] |
| OpenAI key | `OPENAI_API_KEY` | [ ] |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | [ ] |
| NextAuth secret | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | [ ] |
| Resend (email) | `RESEND_API_KEY` | [ ] |
| Twilio (SMS/WhatsApp) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE` | [ ] |
| Telegram | `TELEGRAM_BOT_TOKEN` | [ ] |
| App URL | `NEXT_PUBLIC_APP_URL` | [ ] |
| Stripe (billing) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | [ ] |
| Vercel deploy | Build sin errores, env vars en Vercel dashboard | [ ] |

### B. Aplicación

| Check | Comando / Verificación | Estado |
|-------|------------------------|--------|
| Build limpio | `npm run build` — 0 errors | [ ] |
| Tests gobernanza | `npx vitest run tests/governance/` — 370 pass | [ ] |
| Tests observabilidad | incluido arriba | [ ] |
| Tests E2E | `npx vitest run tests/e2e/` — 29 pass | [ ] |
| Tests preproducción | `npx vitest run tests/preproduction/` — todos pass | [ ] |
| Audit trail activo | `auditLog.getStats()` devuelve datos | [ ] |
| Runtime mode correcto | `getRuntimeConfig().mode` === objetivo | [ ] |
| Kill switches off | Salvo los intencionados por modo | [ ] |
| Rate limits configurados | Coherentes con modo actual | [ ] |

### C. Herramientas Externas

| Servicio | Validación | Sandbox vs Real | Estado |
|----------|-----------|-----------------|--------|
| Gmail/Google Workspace | OAuth token válido, scope correcto | Sandbox OK | [ ] |
| WhatsApp (Twilio) | Sandbox number funciona | SANDBOX hasta go-live | [ ] |
| SMS (Twilio) | Test message entrega | SANDBOX | [ ] |
| Telegram Bot | `/getMe` responde | Real (bot propio) | [ ] |
| Resend (email tx) | Test email llega | Sandbox domain | [ ] |
| OpenAI GPT-5 | Completions endpoint responde | Real (con billing) | [ ] |
| Web Search | Resultados coherentes | Real | [ ] |
| OMIE/Energy | Endpoint accesible | Real (lectura) | [ ] |

### D. Operativa

| Decisión | Responsable | Criterio |
|----------|------------|----------|
| Activar preproducción | CTO / David | Checklist A+B+C completo |
| Pasar a shadow | CTO | 24h en dry-run sin incidentes |
| Pasar a guarded | CTO + validación manual de 10 casos | Scorecard >= 80 |
| Go-live (production) | CTO | Scorecard 100, 7 días guarded sin incidentes |
| Rollback inmediato | Cualquier miembro | Violación crítica, fuga de datos, spam |

---

## Modos de Operación

```
SINERGIA_MODE=dry-run     → Nada real. Full audit. Seguro al 100%.
SINERGIA_MODE=shadow      → Decide pero no ejecuta externamente. Comms simuladas.
SINERGIA_MODE=guarded     → Real pero con límites estrictos y protecciones extra.
SINERGIA_MODE=production  → Full. Limits relajados. Safety systems activos.
```

### Progresión recomendada:
```
dry-run (1-2 días) → shadow (2-3 días) → guarded (5-7 días) → production
```

---

## Kill Switches

| Variable | Efecto | Usar cuando |
|----------|--------|-------------|
| `KILL_BLOCK_ALL_COMMS=true` | Bloquea TODA comunicación externa | Incidente de spam/fuga |
| `KILL_BLOCK_WA_SMS_PHONE=true` | Bloquea WhatsApp, SMS, llamadas (email OK) | Problema con Twilio |
| `KILL_BLOCK_DELEGATION=true` | Bloquea toda delegación entre agentes | Loop de delegación detectado |
| `KILL_BLOCK_HIGH_RISK=true` | Bloquea tools de alto riesgo | Comportamiento anómalo |
| `KILL_FORCE_READONLY=true` | Modo solo lectura total | Emergencia / mantenimiento |
| `KILL_DISABLE_JUNIOR=true` | Junior desactivado, casos van a Principal | Junior inestable |
| `KILL_BLOCKED_CHANNELS=send_whatsapp,send_sms` | Bloquea canales específicos | Canal específico fallando |

**Todos los kill switches son false por defecto.** Se activan en Vercel env vars y toman efecto inmediato al siguiente request.

---

## Rate Limits por Modo

| Límite | dry-run | shadow | guarded | production |
|--------|---------|--------|---------|------------|
| Mensajes/caso | 0 | 2 | 5 | 20 |
| Mensajes/cliente/hora | 0 | 3 | 8 | 30 |
| Llamadas/caso | 0 | 0 | 1 | 5 |
| Escalaciones encadenadas | 3 | 3 | 4 | 6 |
| Reintentos/tool | 1 | 1 | 2 | 3 |
| Cooldown contacto (seg) | 0 | 300 | 120 | 30 |
| High-risk tools/caso | 0 | 1 | 3 | 10 |

---

## Plan de Rollback

### Niveles de rollback (del más leve al más severo):

1. **Reducir modo** — `SINERGIA_MODE=shadow` o `dry-run`
   - Efecto: comms se simulan, no llegan a clientes
   - Tiempo: inmediato (redeploy env var)
   - Reversible: sí

2. **Kill switch canal** — `KILL_BLOCK_WA_SMS_PHONE=true`
   - Efecto: bloquea canal problemático, resto funciona
   - Tiempo: inmediato
   - Reversible: sí

3. **Kill switch total** — `KILL_BLOCK_ALL_COMMS=true`
   - Efecto: sistema funciona internamente pero no contacta a nadie
   - Tiempo: inmediato
   - Reversible: sí

4. **Modo solo lectura** — `KILL_FORCE_READONLY=true`
   - Efecto: nada se escribe, nada se envía, nada muta
   - Tiempo: inmediato
   - Reversible: sí

5. **Revert deployment** — Vercel rollback a commit anterior
   - Efecto: código anterior desplegado
   - Tiempo: <2 minutos
   - Reversible: sí (re-deploy)

### Qué NO se puede revertir:
- Mensajes ya enviados (WhatsApp, email, SMS)
- Llamadas ya realizadas
- Eventos de auditoría (inmutables por diseño)
- Datos ya escritos en DB (requiere script manual)

### Checklist de incidente:
1. Detectar anomalía (alerta, revisión manual, reporte usuario)
2. Activar kill switch apropiado (30 segundos)
3. Verificar que el bloqueo surte efecto (screenshot audit)
4. Evaluar daño: ¿qué mensajes salieron? ¿a quién?
5. Decidir: ¿rollback de código o solo kill switch?
6. Comunicar al equipo
7. Post-mortem: ¿qué provocó el fallo? ¿cómo evitarlo?

---

## Criterios de Go-Live (Scorecard)

| Criterio | Umbral | Peso |
|----------|--------|------|
| Violaciones de gobernanza | 0 en últimas 24h | Obligatorio |
| Incidentes doble voz | 0 en últimas 48h | Obligatorio |
| Tasa tool failures | < 5% | Obligatorio |
| Acciones sin owner | 0 | Obligatorio |
| Casos procesados (volumen) | >= 10 en shadow/guarded | Obligatorio |
| Ownership estable (sin flapping) | Sin cambios anómalos | Recomendado |
| Tasa bloqueos esperados | Coherente con internos (>0) | Informativo |
| Audit trail completo | Todos los eventos con timestamp | Obligatorio |
| Build limpio | 0 errors, 0 warnings críticos | Obligatorio |
| Tests passing | 100% (governance + E2E + preproduction) | Obligatorio |

**Go-live = TODOS los criterios obligatorios cumplidos.**
Score = (criterios cumplidos / total) × 100. Mínimo para producción: 100% obligatorios.

---

## Plan de Monitorización — Primera Semana

### Día 1-2 (dry-run)
- Verificar que audit trail se genera correctamente
- Revisar timelines de 5 casos simulados
- Confirmar que 0 mensajes reales salen
- Validar que rate limits se aplicarían correctamente
- Revisar logs de consola para errores

### Día 3-4 (shadow)
- Verificar que el sistema decide correctamente (comparar con operación manual)
- Revisar 10 casos shadow: ¿routing correcto? ¿ownership correcto?
- Confirmar que mensajes se simulan (no llegan)
- Validar scorecard >= 80
- Buscar anomalías en patrones de delegación

### Día 5-7 (guarded)
- Primeros mensajes reales (con límites estrictos)
- Revisar CADA mensaje enviado las primeras 24h
- Validar que no hay spam (rate limits activos)
- Confirmar single-voice en todos los casos
- Monitorizar tool failures
- Validar que kill switches funcionan si se activan

### Métricas diarias a revisar:
- `auditLog.getStats()` — totalEvents, blocked, violations
- `auditLog.getGovernanceViolations()` — debe ser 0
- `runHealthCheck()` — score debe ser >= 80
- Tasa mensajes enviados vs bloqueados
- Tiempo medio de resolución por caso
- Número de escalaciones

### Alertas a configurar:
- Governance violation detected → Slack/email inmediato
- Double-voice incident → Slack/email inmediato
- Rate limit hit → Log + review
- Tool failure rate > 5% en ventana de 1h → Alerta
- Kill switch activado → Notificación a todo el equipo
- Mode change → Notificación

### Señales de rollback:
- Cualquier governance violation en guarded/production
- Mensaje enviado a cliente incorrecto
- Doble voz visible para un cliente
- Tool failure rate > 10%
- Spam detectado (>5 mensajes al mismo cliente en 1h)

### Señales de que se puede ampliar:
- 48h sin incidentes en guarded
- Scorecard = 100%
- 10+ casos procesados correctamente
- 0 rollbacks necesarios
- Equipo confirma que respuestas son coherentes
