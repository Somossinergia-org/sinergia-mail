---
name: sinergia-swarm-status
description: Use to run a health-check on the 10-agent swarm — pings the live agent endpoint, cross-checks tools registered vs. tools each agent declares, detects orphan handlers (handler exists but no agent uses it) and ghost tools (cited in allowedTools but no handler). Triggers on "estado del swarm", "salud agentes", "qué le falta a cada agente", "swarm status", "swarm health", "tools huérfanas", "verifica agentes".
---

# Swarm Status — diagnóstico rápido del swarm

## Cuándo usarla

- Antes de editar `swarm.ts` para entender qué está conectado y qué no.
- Después de añadir/quitar tools para verificar consistencia.
- Cuando un agente "falla en silencio" — probablemente la tool está en `allowedTools` pero sin definición OpenAI.
- Para producir un mapa visual del swarm en una sola pasada.

## Comprobaciones obligatorias

### 1. Ping al swarm vivo (producción)
```bash
curl -s -X POST https://sinergia-mail.vercel.app/api/admin/agent \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Ping de salud: lista WP sites con wp_list_sites."}],"agentOverride":"marketing-automation"}' \
  --max-time 90
```
Verificar: `toolCalls.length > 0`, `durationMs < 10000`, `reply` contiene datos reales.

Si `toolCalls.length === 0` con respuesta afirmativa → **alucinación** (ver skill `sinergia-wordpress` § anti-alucinación). Reintentar prefijando "OBLIGATORIO: tu respuesta debe incluir 1 tool_call".

### 2. Cross-check tools registradas vs. citadas

**CRÍTICO:** las tools del swarm vienen de 4 fuentes — si solo lees una o dos, te dará falsos positivos:
1. `super-tools.ts` SUPER_TOOLS_REGISTRY
2. `tools.ts` TOOLS array
3. `crm-tools.ts` CRM_TOOLS array (76 tools — fácil de olvidar)
4. **`swarm.ts` WEB_TOOLS array (40 tools, líneas ~976-1500) — auto-inyectadas a TODOS los agentes**

`buildToolsForAgent` (swarm.ts:2078) inyecta WEB_TOOLS a cada agente además de su `allowedTools`. Solo filtra comm tools para internos. Por eso un agente puede usar una tool que NO aparece en su `allowedTools`.

```bash
node -e "
const fs = require('fs');
const swarmT = fs.readFileSync('src/lib/agent/swarm.ts','utf8');
const superT = fs.readFileSync('src/lib/agent/super-tools.ts','utf8');
const toolsT = fs.readFileSync('src/lib/agent/tools.ts','utf8');
const crmT = fs.readFileSync('src/lib/agent/crm-tools.ts','utf8');
const re = /name:\s*['\"]([a-z_][a-z0-9_]+)['\"]/g;
const registered = new Set();
for (const src of [superT, toolsT, crmT]) { let m; while ((m=re.exec(src))) registered.add(m[1]); }
// WEB_TOOLS dentro de swarm.ts — capturar SOLO esa sección
const webStart = swarmT.indexOf('const WEB_TOOLS');
const webEnd = swarmT.indexOf('async function executeWebTool');
let m; while ((m=re.exec(swarmT.slice(webStart, webEnd)))) registered.add(m[1]);
const allowedRe = /allowedTools:\s*\[([\s\S]*?)\]/g;
const cited = new Set();
while ((m=allowedRe.exec(swarmT))) { let m2; const r2=/['\"]([a-z_][a-z0-9_]+)['\"]/g; while((m2=r2.exec(m[1]))) cited.add(m2[1]); }
const ghost = [...cited].filter(t=>!registered.has(t)).sort();
console.log('REGISTERED:', registered.size);
console.log('CITED:', cited.size);
console.log('GHOST (cited, no decl):', ghost.length);
if (ghost.length) console.log(ghost.join('\n'));
else console.log('OK — todas las tools citadas tienen declaración OpenAI');
"
```

**Falsos positivos comunes:** si reportas "X tool no registrada" sin haber leído las 4 fuentes, vas a equivocarte. **Verifica siempre con un ping vivo** antes de afirmar que algo está roto.

### 3. Tools por agente — extraer mapa
```bash
node -e "
const src = require('fs').readFileSync('src/lib/agent/swarm.ts','utf8');
const re = /id:\s*['\"]([a-z\-]+)['\"][\s\S]*?layer:\s*['\"]([a-z\-]+)['\"][\s\S]*?allowedTools:\s*\[([\s\S]*?)\]/g;
let m;
while ((m=re.exec(src))) {
  const tools = [...m[3].matchAll(/['\"]([a-z_][a-z0-9_]+)['\"]/g)].map(x=>x[1]);
  console.log(m[1].padEnd(22), m[2].padEnd(20), 'tools:', tools.length);
}
"
```

### 4. Verificar conectividad de providers de comms
| Tool | Provider | Env vars | Cómo verificar |
|---|---|---|---|
| `send_sms` | Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_DEFAULT` | `vercel env ls production \| grep TWILIO` |
| `send_whatsapp` | Meta Cloud API v19.0 | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | `vercel env ls production \| grep WHATSAPP` |
| `send_telegram` | Bot API | `TELEGRAM_BOT_TOKEN` | ya configurado |
| `send_email_transactional` | Resend | `RESEND_API_KEY` | ya configurado |
| `make_phone_call` | Twilio + Polly TwiML | `TWILIO_*` (mismo que SMS) | igual que SMS |
| `speak_with_voice` | ElevenLabs (audio offline) | `ELEVENLABS_API_KEY` | ya configurado |

Si una tool aparece en `allowedTools` pero su provider no está configurado → la tool en runtime devuelve `{ ok: false, error: "X not configured" }`. Documentar esto al usuario antes de prometer funcionalidad.

## Composición del informe final

Tras correr 1-4 producir tabla resumen:

```
| Agente | Layer | Tools | Comms | Estado |
|--------|-------|-------|-------|--------|
| ...    | ...   | N     | OK/❌ | OK/⚠️/🔴 |
```

Estados:
- 🟢 **OK** — todas las tools registradas, todos los providers conectados
- 🟡 **WARN** — falta 1-2 tools menores o 1 provider no crítico
- 🔴 **FAIL** — agente no puede cumplir su función (provider crítico off, tools clave huérfanas)

## Reglas duras

1. **Nunca** afirmar que un agente "funciona" sin haber ejecutado el ping del paso 1.
2. **Nunca** confundir GHOST (cited, no handler — la tool no se le pasa al modelo) con ORPHAN (handler, no agent — código muerto). El primero es bug, el segundo es deuda técnica.
3. Si encuentras GHOSTs, antes de añadir handler verifica si el agente realmente debería tener esa tool (puede ser typo en `allowedTools`).
4. Reportar al usuario en español, con archivo:línea para cada hallazgo.
