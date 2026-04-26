---
name: sinergia-tool-add
description: Use when adding a new tool to the swarm — guides through all 5 required steps so the tool is actually callable by the agent (handler + OpenAI declaration + registry + allowedTools + governance). Triggers on "añade una tool", "nueva tool para X agente", "registra tool", "implementar tool", "add tool to agent".
---

# Añadir una tool nueva al swarm — protocolo completo

## El error más común

Devs añaden una tool en un solo sitio (handler en swarm.ts) y se olvidan del resto. Resultado: la tool **nunca se ejecuta** porque OpenAI nunca la ve. Esta skill fuerza los 5 pasos.

## Los 5 pasos obligatorios

### Paso 1 — Definir handler
Añadir el `case` en `executeToolCall()` ([swarm.ts:2158](src/lib/agent/swarm.ts:2158)):

```typescript
case "mi_tool_nueva": {
  const result = await miHandler(args.foo as string);
  return { ok: true, ...result };
}
```

Si el handler usa `fetch` externo: **siempre** `signal: AbortSignal.timeout(15000)` y `try/catch`.

### Paso 2 — Declarar la tool en super-tools.ts
Añadir entrada en `SUPER_TOOLS_REGISTRY` ([super-tools.ts](src/lib/agent/super-tools.ts)):

```typescript
{
  name: "mi_tool_nueva",
  openaiTool: {
    type: "function",
    function: {
      name: "mi_tool_nueva",
      description: "Qué hace, en una frase clara para el LLM.",
      parameters: {
        type: "object",
        properties: {
          foo: { type: "string", description: "..." },
        },
        required: ["foo"],
      },
    },
  },
}
```

Sin esto, `buildToolsForAgent` no la incluye y el modelo nunca la llama.

### Paso 3 — Añadir a `allowedTools` del/los agente(s)
En [swarm.ts](src/lib/agent/swarm.ts) en la definición del agente correspondiente:

```typescript
allowedTools: [
  ...,
  "mi_tool_nueva",  // <- aquí
],
```

Decisión clave: **¿qué agente debe tener la tool?**
- Comm externa (envía cliente) → solo agentes visibles
- Análisis interno → expertos internos / módulos
- Lectura general → todos los relevantes
- WP → consultor-digital y/o marketing-automation

### Paso 4 — Si es comunicación externa, añadir a `isExternalCommunicationTool()`
[swarm.ts:952](src/lib/agent/swarm.ts:952):

```typescript
return [
  "send_whatsapp", "send_sms", ..., 
  "mi_tool_nueva",  // <- si envía algo al exterior
].includes(toolName);
```

Si NO la añades aquí y un agente interno la incluye en allowedTools → puede filtrar info al cliente sin pasar por governance.

### Paso 5 — Verificar
```bash
# Cross-check después de tu cambio
node -e "
const fs = require('fs');
const swarmT = fs.readFileSync('src/lib/agent/swarm.ts','utf8');
const superT = fs.readFileSync('src/lib/agent/super-tools.ts','utf8');
const tool = 'mi_tool_nueva';
console.log('handler:', /case\s+[\"\\']'+tool+'[\"\\']/. test(swarmT));
console.log('registered:', superT.includes('name: \"' + tool + '\"'));
console.log('cited by agents:', (swarmT.match(new RegExp('\"'+tool+'\"','g'))||[]).length - 2);  // -2 por handler+registry
"
```

Los 3 valores deben ser `true`/`true`/`>0`.

Después: ping vivo al agente con el endpoint `/api/admin/agent` pidiéndole que use la tool. Verificar `toolCalls.length > 0`.

## Reglas duras

1. **Nunca** committear sin haber corrido el cross-check del Paso 5.
2. **Nunca** añadir tool nueva sin antes leer `brand-voice.ts` si la tool genera contenido visible al cliente.
3. **Si la tool toca DB**: verificar que el handler usa `db` importado, no raw SQL — Drizzle gestiona conexiones.
4. **Si la tool toca APIs externas**: documentar env vars necesarias en el comentario del handler + actualizar README si aplica.
5. **Tools que envían dinero, eliminan datos, o cambian configuración crítica**: añadir confirmación humana — devolver `{ requiresConfirmation: true, ...}` y manejar en el flujo.

## Plantilla mental

Antes de implementar, responder:
- [ ] ¿Qué agente la necesita? (puede ser más de uno)
- [ ] ¿Es interna o externa (envía al cliente)?
- [ ] ¿Qué env vars requiere? ¿Están configuradas en Vercel?
- [ ] ¿Tiene timeout y manejo de error?
- [ ] ¿Devuelve `{ ok, ... }` consistente con el resto?
- [ ] ¿El description del Paso 2 deja claro al LLM cuándo usarla?

## Después de añadir

Correr `/security-review` si la tool toca tokens, datos personales o envía al exterior. Si solo es lectura interna, basta con `/simplify` para confirmar que no hay duplicación con tools existentes.
