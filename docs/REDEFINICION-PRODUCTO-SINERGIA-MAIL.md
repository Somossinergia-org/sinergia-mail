# REDEFINICIÓN DE PRODUCTO — SINERGIA MAIL

**Fecha:** 21 de abril de 2026
**Base:** Inventario técnico auditado (commit 52c7d9f)

---

## 1. QUÉ ES SINERGIA MAIL HOY, EN UNA FRASE

**Un dashboard de email que mutó sin plan en un centro operativo con agentes IA, pero que sigue organizado como si fuera un gestor de correo.**

El problema no es que el sistema tenga demasiadas piezas. El problema es que la estructura de navegación, la jerarquía de pantallas y el nombre del producto siguen reflejando la idea original de "email dashboard", mientras que el valor real del sistema ya está en otro sitio: en los agentes, los casos y la operación.

El resultado es una app donde lo más potente (agentes gestionando casos con gobernanza) está enterrado en tabs secundarios, y lo más visible (bandeja de email, facturas, gráficas) ya no es lo que diferencia al producto.

---

## 2. QUÉ DEBERÍA SER COMO PRODUCTO

**Sinergia Mail debería definirse como: un centro de operaciones IA para consultoras de servicios.**

No es un CRM (no gestiona pipeline de ventas). No es un helpdesk (no tiene tickets públicos). No es un email client (no compite con Gmail). Es algo más específico: una plataforma donde agentes IA especializados gestionan el trabajo operativo de una consultora — atender leads, preparar propuestas, coordinar con fiscal, revisar documentos, controlar comunicaciones — bajo supervisión humana.

La definición exacta que propongo:

> **Sinergia: Centro de operaciones IA para consultoras.**
> 10 agentes especializados gestionan casos de clientes de forma autónoma — con gobernanza, auditoría y control humano.

Por qué esta definición y no otra:

- **No es "dashboard de email"** porque el email es solo un canal de entrada. El valor está en lo que los agentes hacen después de recibir el email, no en mostrarlo.
- **No es "CRM con IA"** porque el sistema no gestiona un pipeline comercial clásico (etapas, deals, forecast). Gestiona casos operativos.
- **No es "hub omnicanal"** porque los canales (WhatsApp, SMS, Telegram) son medios, no el producto. Y la mayoría están incompletos.
- **Es "centro de operaciones IA"** porque lo que realmente hace es: recibir trabajo → asignarlo a un agente especializado → ejecutarlo con herramientas → auditarlo → supervisarlo.

El cambio de nombre debería acompañar esta redefinición. "Sinergia Mail" limita la percepción. "Sinergia" a secas, o "Sinergia Ops", comunicaría mejor lo que el producto realmente hace.

---

## 3. CUÁL DEBE SER EL NÚCLEO CENTRAL

### El centro de gravedad real es: CASOS + AGENTES

No es email. No es el dashboard genérico. No es la oficina virtual.

El flujo que genera valor real para Somos Sinergia es:

```
Entrada (email, WhatsApp, manual) 
  → Se crea/reasigna un CASO
    → Un AGENTE especializado lo gestiona
      → Usa HERRAMIENTAS (buscar, analizar, redactar, consultar)
        → Produce una ACCIÓN (respuesta, documento, delegación)
          → Se AUDITA todo
            → El HUMANO supervisa y aprueba si es necesario
```

Todo lo demás orbita alrededor de este flujo. Veamos la evidencia en el código:

- **swarm.ts** (2.937 líneas) es el módulo más complejo del sistema. Su función: gestionar casos con agentes.
- **cases/index.ts** organiza el trabajo por caso con ownership exclusivo.
- **audit/** traza todo lo que pasa en cada caso.
- **guardrails.ts** (580 líneas) controla qué puede y qué no puede hacer cada agente.
- **operations/** permite supervisar casos en tiempo real.

Email, OCR, WhatsApp, etc. son canales de entrada. Dashboard, oficina virtual, super panel son vistas de salida. Pero el motor es: caso → agente → acción → auditoría → supervisión.

### Qué pantalla debería ser la principal

Hoy la pantalla principal es el dashboard genérico con 12 tabs. Eso es herencia del "email dashboard" original.

La pantalla principal debería ser una **vista de casos activos** — algo como:

- Lista de casos abiertos, con agente asignado, estado, último evento, canal de origen
- Acceso rápido al detalle de cada caso (timeline, acciones, comunicaciones)
- Indicadores de casos que necesitan atención humana (bloqueados, pendientes de aprobación)
- Acceso directo al chat con el agente que lleva cada caso

Esto ya existe parcialmente en el panel de operaciones (OperationsCaseListPanel + OperationsCaseDetailPanel), pero está enterrado como sub-tab dentro de "operaciones", que a su vez es el tab #11 de 12.

---

## 4. CÓMO REORGANIZARÍA LA APP

### Estado actual de la navegación (12 tabs)

| Tab actual | Contenido | Uso real estimado |
|-----------|-----------|-------------------|
| overview | KPIs genéricos, resumen | Informativo, no accionable |
| emails | Bandeja de entrada | Uso diario, pero como lectura |
| facturas | Lista + análisis de facturas | Uso periódico (fiscal) |
| automatizacion | Reglas de email, auto-drafts | Configuración, uso esporádico |
| outreach | Secuencias drip, outbound | Feature de catálogo, uso mínimo |
| crm | Contactos, scoring | Uso medio |
| finanzas | Forecasting, presupuestos | Feature de catálogo |
| workspace | Calendar, Drive, Tasks | Proxy de Google Workspace |
| agente-ia | Chat con agentes | Uso principal real |
| entrenar-ia | Config de agente, knowledge | Admin esporádico |
| operaciones | Health, casos, actividad | Supervisión diaria |
| config | Configuración general | Admin esporádico |

### Reorganización propuesta

La propuesta se basa en un principio: **organizar por frecuencia de uso y valor operativo, no por categoría técnica**.

#### NIVEL 1 — Pantalla principal (lo que ves al abrir la app)

**Centro de Casos**

Lo que hoy es el panel de operaciones (casos + actividad), pero elevado a pantalla principal. Muestra:
- Casos activos con agente asignado y estado
- Casos que requieren atención humana (bloqueados, pendientes)
- Actividad reciente (últimas acciones de agentes)
- Acceso directo a abrir chat con cualquier agente sobre un caso

Esta pantalla responde a la pregunta: "¿Qué está pasando ahora y qué necesita mi atención?"

#### NIVEL 2 — Acceso directo (tabs principales, siempre visibles)

Máximo 5 tabs principales:

| Tab | Contenido | Por qué aquí |
|-----|-----------|--------------|
| **Casos** | Centro de casos (nivel 1) | Es el núcleo |
| **Chat** | Conversación con agentes | Es la forma de trabajar con el sistema |
| **Email** | Bandeja de entrada, sincronización | Canal principal de entrada |
| **Documentos** | Facturas + OCR + documentos | Herramienta operativa diaria |
| **Supervisión** | Health, auditoría, métricas | Control operativo |

5 tabs en vez de 12. Cada uno con un propósito claro.

#### NIVEL 3 — Módulos secundarios (accesibles pero no en nav principal)

Accesibles desde un menú "Más" o desde contexto:

| Módulo | Contenido actual | Ubicación propuesta |
|--------|-----------------|---------------------|
| CRM/Contactos | Lista de contactos, scoring | Accesible desde detalle de caso o menú "Más" |
| Automatización | Reglas, secuencias | Sección de configuración |
| Workspace | Calendar, Drive, Tasks | Accesible desde contexto (e.g., "agendar cita" dentro de un caso) |
| Configuración | Agent config, runtime, kill switches | Menú de admin |

#### NIVEL 4 — Módulos internos/admin (solo para operador/admin)

| Módulo | Contenido |
|--------|-----------|
| Runtime switches | Kill switches, modos de operación |
| Sanity check | Validación de subsistemas |
| Agent training | Knowledge base, prompts |
| Métricas avanzadas | Auditoría detallada, timeline completa |

#### NIVEL 5 — Módulos a congelar (dejar como están, no invertir más)

| Módulo | Razón |
|--------|-------|
| SMS (Twilio) | Canal irrelevante para el mercado |
| Teléfono (Voice) | Incompleto, sin flow conversacional |
| Telegram | Canal irrelevante |
| Outreach/secuencias drip | Feature de catálogo, uso mínimo |
| Finanzas/forecasting | Feature de catálogo |

#### NIVEL 6 — A eliminar

| Componente | Razón |
|-----------|-------|
| personalities.ts | Código muerto, solo usado por sistema legacy |
| context-packs.ts | Código muerto |
| Notion fake tools | Teatro técnico |
| executeParallelSwarm() | Deprecated, nunca llamado |
| Tab "entrenar-ia" | Se fusiona con configuración |

### La oficina virtual: decisión especial

La oficina virtual (3.032 líneas, el fichero más grande del proyecto) merece una decisión separada porque no encaja en ninguna categoría limpia.

**Argumentos para mantenerla:**
- Es el diferenciador visual más fuerte del producto
- Cuando hay datos reales, muestra el estado de los agentes de forma intuitiva
- Puede impresionar en demos y pitch

**Argumentos para simplificarla:**
- 3.032 líneas de SVG artesanal por una visualización
- La misma información (qué agente hace qué) cabe en una tabla de 50 líneas
- Las animaciones ambient (caminar al café, bocadillos) no aportan información operativa
- Es el componente más frágil de mantener (cualquier cambio en agentes = editar SVG a mano)

**Mi recomendación:** Convertirla en una vista alternativa opcional dentro de "Supervisión", no en una pantalla principal. El estado de los agentes debería mostrarse como una lista/grid compacta por defecto, con la opción de "ver oficina virtual" para quien la quiera. Esto permite conservar el "wow" sin que sea el centro de la experiencia.

---

## 5. QUÉ CONSERVAR

### Intocable (núcleo que genera valor)

| Componente | Por qué |
|-----------|---------|
| Swarm + 10 agentes | Es el motor del producto |
| Casos + ownership | Organiza el trabajo de forma fiable |
| Gobernanza (permisos, single-voice) | Diferenciador vs. chatbots genéricos |
| Guardrails + runtime config | Permite operar de forma segura |
| Auditoría (dual-store) | Trazabilidad completa |
| Kill switches (DB-backed) | Control sin redeploy |
| Email/Gmail integration | Canal principal |
| OCR/Vision | Valor real para fiscalistas |
| Memory engine | Los agentes recuerdan entre sesiones |
| Cifrado de tokens | Compliance |
| Panel de operaciones | Supervisión humana |
| Chat con agentes | Punto de interacción principal |

### Reubicar (existe pero está mal colocado)

| Componente | De | A |
|-----------|-----|---|
| Casos activos | Tab "operaciones" (#11 de 12) | Pantalla principal |
| Chat con agentes | Tab "agente-ia" (#9 de 12) | Tab principal #2 |
| Health/métricas | Sub-tab dentro de operaciones | Tab principal "Supervisión" |
| Facturas + OCR | Tab "facturas" separado | Fusionar en "Documentos" |

### Ocultar (existe, funciona, pero no es primera línea)

| Componente | Razón |
|-----------|-------|
| CRM/Contactos | Útil pero secundario al flujo principal |
| Calendar/Drive/Tasks | Son proxies de Google, no funcionalidad propia |
| Automatización/reglas | Configuración, no operación diaria |
| Scoring predictivo | Feature avanzada, no principal |
| Overview/KPIs genéricos | Informativo, no accionable |

---

## 6. QUÉ CONGELAR

| Componente | Estado actual | Razón para congelar |
|-----------|-------------|---------------------|
| SMS | Funcional | Irrelevante para el mercado |
| Teléfono/Voice | Incompleto | Sin flow completo no aporta |
| Telegram | Funcional | Irrelevante para el mercado |
| Secuencias drip | Funcional | Feature de catálogo, uso mínimo |
| Forecasting tesorería | Funcional | Feature de catálogo |
| Visits (visitas comerciales) | Solo schema | Sin service layer |
| Fine-tuning pipeline | Funcional | No aporta valor operativo inmediato |

"Congelar" significa: no invertir más tiempo, no eliminar, no tocar. Si alguien lo usa, bien. Si no, se queda dormido.

---

## 7. QUÉ ELIMINAR

| Componente | Líneas | Razón |
|-----------|--------|-------|
| personalities.ts | 156 | Código muerto — solo usado por sistema pre-swarm |
| context-packs.ts | 95 | Código muerto — reemplazado por memory-engine |
| executeParallelSwarm() | ~50 | @deprecated, nunca llamado |
| LEGACY_AGENT_ID_ALIASES | ~20 | Mappings de IDs que ya no existen en DB |
| Notion fake tools | ~40 | Teatro — finge ser Notion pero hace web search |
| Tab "entrenar-ia" | - | Se fusiona con configuración/admin |
| Tab "outreach" como principal | - | Se baja a módulo secundario |
| Tab "finanzas" como principal | - | Se baja a módulo secundario |

Total eliminado: ~360 líneas de código + simplificación de navegación.

No es mucho en volumen, pero eliminar ruido es tan importante como añadir función.

---

## 8. QUÉ PONER EN PRIMER PLANO

| Qué | Por qué | Cómo |
|-----|---------|------|
| **Casos activos** | Es el trabajo real del día a día | Pantalla principal al abrir la app |
| **Chat con agentes** | Es la forma de interactuar con el sistema | Tab principal #2, siempre accesible |
| **Email** | Canal de entrada principal | Tab principal, pero como "inbox del sistema" no como "app de email" |
| **Documentos (facturas + OCR)** | Herramienta operativa diaria | Tab principal que unifica facturas, PDFs, fotos |
| **Supervisión** | Control humano del sistema | Tab principal con health, métricas, alertas |

El cambio mental clave: email deja de ser "el producto" y pasa a ser "un canal de entrada al sistema de casos". La bandeja de entrada sigue siendo accesible y funcional, pero ya no es lo primero que ves ni lo que define la app.

---

## 9. QUÉ DEJAR EN SEGUNDO PLANO

| Qué | Dónde | Razón |
|-----|-------|-------|
| CRM/Contactos | Menú "Más" o contextual desde caso | Útil pero no es el flujo principal |
| Calendar/Drive/Tasks | Contextual (desde caso o chat) | Son proxies, no producto propio |
| Automatización/reglas | Admin/configuración | Setup, no operación diaria |
| Oficina virtual | Vista alternativa en Supervisión | Wow visual, no herramienta operativa |
| Scoring/BI | Accesible pero no prominente | Feature avanzada |
| Overview genérico | Se reemplaza por la vista de casos | KPIs sin acción no aportan |
| Super Panel | Herramienta admin/debug | Solo para operadores técnicos |
| Agent training/knowledge | Admin | Configuración esporádica |

---

## 10. TOP 10 DECISIONES ESTRUCTURALES

### 1. Renombrar el producto

"Sinergia Mail" comunica "gestor de email". El producto ya no es eso. Propuesta: **"Sinergia"** a secas, o **"Sinergia Ops"**. Este cambio no es cosmético — afecta a cómo los usuarios y el mercado perciben el producto. Un centro de operaciones IA no puede llamarse "Mail".

### 2. Hacer de los casos la pantalla principal

Mover la vista de casos activos (hoy enterrada en tab #11 → sub-tab "Cases") a la pantalla que ves al abrir la app. Es el cambio de UX más impactante y no requiere código nuevo — solo reorganizar lo que ya existe.

### 3. Reducir la navegación de 12 a 5 tabs

De 12 tabs top-level a 5: Casos, Chat, Email, Documentos, Supervisión. Todo lo demás se baja a menú secundario o admin. Esto elimina la sensación de "app sobrecargada" y focaliza al usuario.

### 4. Fusionar "facturas" y "OCR" en "Documentos"

Hoy las facturas tienen su propio tab, y el OCR/extracción está disperso en endpoints sueltos. Un tab unificado "Documentos" que muestre facturas recibidas, facturas emitidas, documentos escaneados, y permita subir/fotografiar nuevos documentos es más coherente con el flujo de una consultora.

### 5. Reconocer que email es un canal, no el producto

El email sigue siendo tab principal (es el canal de entrada más frecuente), pero se reencuadra como "bandeja de entrada del sistema" — los emails nuevos alimentan casos, no son el fin en sí mismo. Visualmente: cuando llega un email nuevo, el sistema debería preguntar "¿crear caso?" o vincularlo a uno existente, no solo mostrarlo como mensaje en una bandeja.

### 6. La oficina virtual pasa a vista alternativa

Sacarla de la navegación principal. Ponerla como toggle dentro de "Supervisión": "Ver como lista" (default) / "Ver como oficina virtual". Esto preserva el wow para demos sin penalizar la experiencia operativa diaria.

### 7. Establecer el flujo coherente de todo el sistema

El flujo canónico del producto debería ser:

```
ENTRADA                    GESTIÓN                    SUPERVISIÓN
─────────                  ────────                   ────────────
Email llega        →  Se crea caso           →  Aparece en lista de casos
WhatsApp llega     →  Se asigna agente       →  Operador ve actividad
Documento subido   →  Agente lo procesa      →  Auditoría registra todo
Petición manual    →  Agente ejecuta tools   →  Health muestra métricas
                   →  Agente responde        →  Si es guarded: humano aprueba
                   →  Si se bloquea: escala  →  Alertas al operador
```

Hoy este flujo existe en el código pero no en la UX. La app no guía al usuario por este camino. Los emails van por un lado, los agentes por otro, los casos por otro, las facturas por otro. Reorganizar la navegación según este flujo es lo que convertirá "una suma de piezas" en "un producto".

### 8. Crear una "inbox unificada" como sub-vista de Casos

En vez de que el usuario vaya al tab de email para ver emails, al tab de WhatsApp para ver mensajes, etc., la vista de Casos debería tener una sub-vista "Nuevas entradas" que muestre todo lo que ha llegado por cualquier canal y aún no está vinculado a un caso. Esto cierra el ciclo: toda entrada se convierte en caso o se descarta.

### 9. Fusionar "entrenar-ia" y "config" en un solo menú admin

Hoy son dos tabs separados que se pisan. Todo lo que sea configuración (runtime, knowledge, agent config, switches, templates) debería vivir en un único espacio de administración, accesible desde un icono de engranaje o menú lateral, no como tabs principales.

### 10. Documentar la arquitectura de producto como referencia

Una vez tomadas estas decisiones, escribir un documento corto (1 página) que defina: qué es Sinergia, cuáles son los 5 módulos principales, cuál es el flujo canónico, y qué no es Sinergia. Esto sirve como referencia para toda decisión futura de producto — cada feature nueva tiene que encajar en este marco o se descarta.

---

## RESUMEN VISUAL DE LA REORGANIZACIÓN

```
┌─────────────────────────────────────────────────────────┐
│                    SINERGIA (Ops)                        │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐
│  │  CASOS  │ │  CHAT   │ │  EMAIL  │ │  DOCS   │ │SUPERVISIÓN│
│  │(principal│ │(agentes)│ │(entrada)│ │(facturas│ │(health,   │
│  │ activos) │ │         │ │         │ │OCR,docs)│ │ audit,    │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │ métricas) │
│       ▲            │            │           │     └───────────┘
│       │            │            │           │          │
│       └────────────┴────────────┴───────────┘          │
│              Todo alimenta casos                        │
│                                                         │
│  ┌──────────────────── SECUNDARIO ─────────────────────┐│
│  │ CRM · Calendar · Drive · Automatización · Scoring  ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌──────────────────── ADMIN ──────────────────────────┐│
│  │ Config · Switches · Knowledge · Training · Runtime  ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌──────────────────── CONGELADO ──────────────────────┐│
│  │ SMS · Teléfono · Telegram · Drip · Forecasting      ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## NOTA FINAL

Esta redefinición no requiere reescribir la app. Los módulos ya existen y funcionan. Lo que requiere es:

1. **Reorganizar la navegación** (mover tabs, fusionar algunos, ocultar otros)
2. **Elevar los casos a pantalla principal** (reusar OperationsCaseListPanel)
3. **Bajar la oficina virtual a vista alternativa** (toggle en Supervisión)
4. **Fusionar tabs** (facturas + OCR → Documentos; entrenar-ia + config → Admin)
5. **Eliminar código muerto** (~360 líneas, ya identificado)

Ninguno de estos cambios rompe funcionalidad existente. Son reorganización, no reconstrucción.

El mayor riesgo de no hacer esto es seguir acumulando features sobre una estructura de "email dashboard" que ya no refleja lo que el producto es. Cada feature nueva añadida sobre una base conceptual equivocada aumenta el caos. Redefinir primero, ampliar después.
