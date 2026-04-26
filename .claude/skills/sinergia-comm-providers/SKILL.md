---
name: sinergia-comm-providers
description: Use to diagnose, configure, or troubleshoot communication providers used by the swarm — Twilio (SMS + phone), Meta WhatsApp Cloud API, Telegram Bot API, Resend (email), ElevenLabs (voice), Stability AI (images). Triggers on "WhatsApp no funciona", "configurar Twilio", "Resend falla", "estado de comms", "agentes no envían mensajes", "kill switch comms", "providers".
---

# Comms Providers — diagnóstico y configuración

## Mapa de providers

| Tool del swarm | Provider | Handler | Env vars necesarias |
|---|---|---|---|
| `send_sms` | Twilio Programmable SMS | [channels.ts:268](src/lib/agent/channels.ts:268) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_DEFAULT` (o `TWILIO_PHONE_<AGENT_ID>`) |
| `make_phone_call` | Twilio Voice + Polly TwiML | [channels.ts:319](src/lib/agent/channels.ts:319) | mismo que SMS |
| `send_whatsapp` | Meta Cloud API v19.0 | [channels.ts:377](src/lib/agent/channels.ts:377) | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` |
| `send_telegram` | Telegram Bot API | [channels.ts:445](src/lib/agent/channels.ts:445) | `TELEGRAM_BOT_TOKEN` |
| `send_email_transactional` | Resend | [channels.ts:519](src/lib/agent/channels.ts:519) | `RESEND_API_KEY` |
| `speak_with_voice` | ElevenLabs (audio MP3 offline) | [channels.ts:152](src/lib/agent/channels.ts:152) | `ELEVENLABS_API_KEY` |
| `generate_image_ai` | Stability AI | [channels.ts:566](src/lib/agent/channels.ts:566) | `STABILITY_API_KEY` |

**Importante:** `make_phone_call` usa Twilio TwiML con voz `Polly.Lucia` (TTS de AWS Polly integrada en Twilio), NO ElevenLabs. ElevenLabs solo se usa para `speak_with_voice` que genera MP3 offline.

## Estado actual (2026-04-26)

```
✅ TELEGRAM_BOT_TOKEN          configurado en Preview + Production
✅ RESEND_API_KEY              configurado en Preview + Production
✅ ELEVENLABS_API_KEY          configurado en Preview + Production
✅ STABILITY_API_KEY           configurado en Preview + Production
❌ TWILIO_*                    NO configurado en ningún entorno
❌ WHATSAPP_*                  NO configurado en ningún entorno
🛑 KILL_BLOCK_WA_SMS_PHONE     activo en Preview (kill switch porque providers off)
```

Tools `send_sms`, `send_whatsapp`, `make_phone_call` devuelven `{ ok: false, error: "X not configured" }` en runtime.

## Cómo configurar cada provider

### Twilio (SMS + llamadas)

1. Crear cuenta en [twilio.com](https://www.twilio.com), comprar número español (~1€/mes).
2. Conseguir SID + Auth Token del dashboard.
3. Setear en Vercel:
   ```bash
   printf "ACxxxxxxxx" | vercel env add TWILIO_ACCOUNT_SID production preview
   printf "yyyyyyyy" | vercel env add TWILIO_AUTH_TOKEN production preview
   printf "+34XXXXXXXXX" | vercel env add TWILIO_PHONE_DEFAULT production preview
   ```
   **Usar `printf`, nunca `echo`** — `echo` añade `\n` final que rompe la comparación (lección crítica del repo).
4. Opcional: número distinto por agente vía `TWILIO_PHONE_<AGENT_ID>` (ej. `TWILIO_PHONE_COMERCIAL_PRINCIPAL`).
5. Quitar kill switch:
   ```bash
   vercel env rm KILL_BLOCK_WA_SMS_PHONE preview
   ```
6. Redeploy: `vercel redeploy <prod_url>`.

### Meta WhatsApp Cloud API

1. App en [developers.facebook.com](https://developers.facebook.com) → producto WhatsApp.
2. Conseguir `phone_number_id` (test number gratis) y `access_token` (permanent token vía System User).
3. Setear:
   ```bash
   printf "PHONE_ID" | vercel env add WHATSAPP_PHONE_NUMBER_ID production preview
   printf "ACCESS_TOKEN" | vercel env add WHATSAPP_ACCESS_TOKEN production preview
   ```
4. **Limitación crítica**: solo puedes mandar mensajes libres dentro de la **ventana de 24h** después de que el cliente te escriba. Fuera de ella, requiere **plantillas pre-aprobadas** por Meta. El handler actual NO maneja plantillas.

### Telegram

Ya configurado. Para verificar:
```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

### Resend

Ya configurado. Cuota free: 3.000 emails/mes, 100/día. Si excedes → upgrade a Pro ($20/mes, 50k emails).

Verificar:
```bash
curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@somossinergia.es","to":["test@example.com"],"subject":"ping","html":"hi"}'
```

### ElevenLabs

Ya configurado. Cuota free: 10.000 chars/mes. Cada agente tiene voiceId distinto en `AGENT_VOICE_PROFILES` ([channels.ts](src/lib/agent/channels.ts)).

## Test vivo (sin enviar de verdad)

Ping al swarm vía `/api/admin/agent` para ver si el handler devuelve "configured" o "not configured":

```bash
curl -s -X POST https://sinergia-mail.vercel.app/api/admin/agent \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Llama a get_channels_status y devuelve el resultado bruto."}],"agentOverride":"recepcion"}'
```

`get_channels_status` está implementada en [channels.ts](src/lib/agent/channels.ts) y devuelve `{ phone, voice, whatsapp, telegram, sms, email }` con `available: true/false` para cada uno.

## Kill switches disponibles

Set en Vercel para bloquear envío sin tocar código:

| Variable | Bloquea |
|---|---|
| `KILL_BLOCK_ALL_COMMS` | Todos los canales |
| `KILL_BLOCK_WA_SMS_PHONE` | WhatsApp + SMS + llamadas |
| `KILL_BLOCKED_CHANNELS` | Lista CSV: `sms,whatsapp,phone` |

Implementación en `src/lib/runtime.ts` → `preActionCheck()` ([swarm.ts:2202](src/lib/agent/swarm.ts:2202)).

## Errores comunes

| Síntoma | Causa probable |
|---|---|
| `Twilio not configured` | Falta env var SID/TOKEN/PHONE → `vercel env ls` |
| `WhatsApp not configured` | Falta `WHATSAPP_PHONE_NUMBER_ID` o `_ACCESS_TOKEN` |
| WhatsApp 401 Unauthorized | Token caducó (los temporales duran 24h) → generar permanent token vía System User |
| WhatsApp "outside 24h window" | Cliente no inició conversación en últimas 24h → hay que usar template (no implementado) |
| Resend bounce silencioso | Dominio `somossinergia.es` no verificado en Resend → dashboard.resend.com/domains |
| Email cae en spam | Falta SPF + DKIM + DMARC en DNS del dominio |
| Twilio SMS rechazado en España | España requiere alphanumeric sender ID registrado para algunos casos (B2B) |
| `make_phone_call` no usa voz personalizada | Es esperado: usa Polly.Lucia (TwiML), no ElevenLabs. Para voz personalizada en llamada hay que generar MP3 + servir URL pública + `<Play>` |

## Reglas duras

1. **Nunca** afirmar al usuario que "el agente envió un WhatsApp" sin verificar `result.ok === true` en la respuesta del handler.
2. **Nunca** poner credenciales de provider en `.env.local`. Solo en Vercel.
3. **Nunca** usar `echo` para añadir env vars en Vercel — siempre `printf` (sin `\n` final).
4. Si añades nueva tool de comunicación: actualizar tabla de este SKILL + añadir a `isExternalCommunicationTool()` en [swarm.ts:952](src/lib/agent/swarm.ts:952).
5. Cualquier cambio en providers → `/security-review` antes de mergear.
