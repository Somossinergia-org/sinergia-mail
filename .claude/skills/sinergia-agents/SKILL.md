---
name: sinergia-agents
description: Use when modifying the 10-agent swarm (src/lib/agent/swarm.ts, super-tools.ts, brand-voice.ts), adding/removing tools, changing agent prompts, routing logic, or tool access rules. Triggers on requests like "add a tool to X agent", "change the receptionist prompt", "modify swarm routing", "new super-tool", "brand voice", or any edit under src/lib/agent/.
---

# Sinergia Swarm — edit protocol

## Arquitectura (memorizar antes de editar)

10 agentes en 3 capas:

- **Visibles** (hablan con cliente): `recepcion`, `comercial-principal`, `comercial-junior`, `ceo`
- **Expertos internos** (no hablan fuera): `consultor-servicios`, `consultor-digital`, `legal-rgpd`
- **Módulos internos** (no hablan fuera): `fiscal`, `bi-scoring`, `marketing-automation`

Principios gobierno: single-voice (una sola voz al cliente), ownership por capa, separación interno/externo estricta.

## Checklist antes de commitear cambios al swarm

1. **Si añades/quitas un agente**: actualizar `VISIBLE_LAYERS` o `INTERNAL_LAYERS` en `swarm.ts`, actualizar `routeToAgent()`, y revisar `buildToolsForAgent()`.
2. **Si añades una tool nueva**:
   - Definirla en `super-tools.ts` con su handler.
   - Registrarla en `SUPER_TOOLS_REGISTRY`.
   - Decidir qué agentes la ven vía `buildToolsForAgent()`.
   - Si la tool se comunica externamente (email, WhatsApp, etc.), añadirla a `isExternalCommunicationTool()` — si no, un agente interno podría filtrar info fuera.
3. **Si editas prompts**:
   - Mantener el tono de `brand-voice.ts` (voz de David, no alterar sin pedir confirmación explícita).
   - Nunca meter credenciales, URLs internas, ni PII de ejemplo en prompts.
4. **Si tocas routing**: probar con consultas reales (ver `routeToAgent()` — keyword-based). Añadir tests si hay.
5. **Validar acceso**: correr mentalmente `validateToolAccess(agentId, toolName)` para casos borde — agente interno llamando tool externa debe fallar.

## Errores frecuentes

- Olvidar `isExternalCommunicationTool()` → agente interno filtra al cliente.
- Duplicar lógica entre `tools.ts` y `super-tools.ts` — super-tools es el registro canónico.
- Editar un prompt y romper `brand-voice` (frases, cierre, tuteo).
- Añadir agente sin meterlo en `VISIBLE_LAYERS` o `INTERNAL_LAYERS` → queda en limbo.

## Después de cambios significativos

- `/security-review` si la tool nueva toca datos externos, tokens, o envía mensajes.
- Commit message con `feat(swarm):` o `fix(swarm):` como prefijo (convención del repo — ver `git log --oneline | grep swarm`).
