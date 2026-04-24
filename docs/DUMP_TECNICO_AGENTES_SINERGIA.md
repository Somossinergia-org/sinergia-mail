# DUMP TÉCNICO COMPLETO — SISTEMA DE AGENTES SINERGIA

---

## PARTE 1: allowedTools POR AGENTE

### 1. CEO (Director General / Orquestador)
```
allowedTools: [
  "get_stats", "business_dashboard", "smart_search", "delegate_task",
  "weekly_executive_brief", "forecast_revenue",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "learn_preference",
  "search_emails", "create_draft", "draft_and_send",
  "create_calendar_event", "list_upcoming_events", "create_task", "list_tasks",
  "contact_intelligence", "analyze_sentiment_trend",
  "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
  "make_phone_call", "speak_with_voice", "generate_image_ai", "get_channels_status",
  "web_search", "web_read_page", "search_company_info",
]
canDelegate: ["recepcionista", "director-comercial", "consultor-servicios", "consultor-digital", "fiscal-controller", "legal-rgpd", "marketing-director", "analista-bi"]
priority: 10
```

### 2. Recepcionista
```
allowedTools: [
  "search_emails", "mark_emails_read", "trash_emails", "create_draft",
  "draft_and_send", "bulk_categorize",
  "create_email_rule", "list_email_rules", "delete_email_rule",
  "create_calendar_event", "list_upcoming_events", "add_invoice_due_reminder",
  "create_task", "list_tasks",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "smart_search", "delegate_task", "learn_preference",
  "contact_intelligence", "ocr_scan_document",
  "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
  "speak_with_voice",
  "web_search", "web_read_page", "search_company_info",
]
canDelegate: ["director-comercial", "consultor-servicios", "consultor-digital", "fiscal-controller", "legal-rgpd", "marketing-director"]
priority: 7
```

### 3. Director Comercial
```
allowedTools: [
  "smart_search", "contact_intelligence", "analyze_sentiment_trend", "forecast_revenue",
  "search_emails", "search_invoices", "create_draft", "draft_and_send",
  "create_calendar_event", "list_upcoming_events", "create_task", "list_tasks",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "delegate_task", "learn_preference",
  "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
  "make_phone_call", "speak_with_voice", "ocr_scan_document",
  "web_search", "web_read_page", "search_company_info",
]
canDelegate: ["consultor-servicios", "consultor-digital", "recepcionista", "fiscal-controller", "legal-rgpd", "analista-bi"]
priority: 9
```

### 4. Consultor de Servicios (Energía, Telecom, Alarmas, Seguros)
```
allowedTools: [
  "find_invoices_smart", "search_invoices", "search_emails", "create_draft", "draft_and_send",
  "save_invoice_to_drive", "ocr_scan_document",
  "smart_search", "contact_intelligence", "forecast_revenue",
  "create_task", "list_tasks", "create_calendar_event", "list_upcoming_events",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "delegate_task", "learn_preference",
  "send_sms", "send_whatsapp", "send_email_transactional",
  "make_phone_call", "speak_with_voice",
  "web_search", "web_read_page", "search_energy_market", "search_regulation", "search_company_info",
]
canDelegate: ["director-comercial", "recepcionista", "fiscal-controller", "legal-rgpd"]
priority: 9
```

### 5. Consultor Digital (IA, Web, CRM, Apps)
```
allowedTools: [
  "smart_search", "search_emails", "contact_intelligence",
  "create_draft", "draft_and_send",
  "create_task", "list_tasks", "create_calendar_event", "list_upcoming_events",
  "save_invoice_to_drive", "generate_image_ai", "ocr_scan_document",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "delegate_task", "learn_preference",
  "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
  "make_phone_call", "speak_with_voice",
  "web_search", "web_read_page", "search_company_info",
]
canDelegate: ["director-comercial", "recepcionista", "legal-rgpd", "marketing-director"]
priority: 8
```

### 6. Fiscal Controller
```
allowedTools: [
  "search_invoices", "find_invoices_smart", "get_overdue_invoices",
  "get_iva_quarterly", "get_duplicate_invoices", "update_invoice",
  "draft_payment_reminder", "save_invoice_to_drive",
  "add_invoice_due_reminder", "forecast_revenue",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "smart_search", "contact_intelligence", "delegate_task", "learn_preference",
  "search_emails", "create_draft", "create_task", "list_tasks",
  "create_calendar_event", "list_upcoming_events",
  "send_sms", "send_whatsapp", "send_email_transactional",
  "speak_with_voice", "ocr_scan_document",
  "web_search", "web_read_page", "search_regulation",
]
canDelegate: ["recepcionista", "consultor-servicios", "legal-rgpd", "analista-bi"]
priority: 8
```

### 7. Legal/RGPD Officer
```
allowedTools: [
  "smart_search", "search_emails", "contact_intelligence",
  "create_task", "list_tasks", "ocr_scan_document",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "delegate_task", "learn_preference",
  "send_email_transactional", "speak_with_voice",
  "web_search", "web_read_page", "search_regulation",
]
canDelegate: ["recepcionista", "fiscal-controller", "director-comercial", "consultor-digital"]
priority: 8
```

### 8. Marketing Director
```
allowedTools: [
  "smart_search", "contact_intelligence", "analyze_sentiment_trend",
  "search_emails", "create_draft", "draft_and_send", "bulk_categorize",
  "create_email_rule", "list_email_rules", "delete_email_rule",
  "create_task", "list_tasks", "create_calendar_event", "list_upcoming_events",
  "save_invoice_to_drive", "generate_image_ai",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "delegate_task", "learn_preference",
  "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
  "get_channels_status", "speak_with_voice",
  "web_search", "web_read_page", "search_company_info",
]
canDelegate: ["consultor-digital", "director-comercial", "recepcionista"]
priority: 7
```

### 9. Analista BI
```
allowedTools: [
  "get_stats", "business_dashboard", "smart_search", "forecast_revenue",
  "search_invoices", "find_invoices_smart", "get_iva_quarterly",
  "contact_intelligence", "analyze_sentiment_trend",
  "search_emails", "create_draft",
  "create_task", "list_tasks",
  "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
  "knowledge_search", "delegate_task", "learn_preference",
  "speak_with_voice",
  "web_search", "web_read_page", "search_company_info", "search_energy_market",
]
canDelegate: ["fiscal-controller", "director-comercial", "consultor-servicios", "consultor-digital"]
priority: 7
```

---

## PARTE 2: PROMPTS COMPLETOS — CEO + RECEPCIONISTA + DIRECTOR COMERCIAL

### PROMPT CEO (Director General / Orquestador)

```
Eres David Miquel Jorda, CEO y gerente de Somos Sinergia Buen Fin de Mes SL (CIF B10730505). Consultoria multi-servicio para PYMEs. Sede: Orihuela, Alicante. Email: orihuela@somossinergia.es.

═══ TU MISION ═══
Eres el cerebro que orquesta 8 agentes especializados. Tu trabajo: decidir QUIEN hace QUE, consolidar respuestas y asegurar que NADA se quede sin resolver.

═══ REGLAS DE ORQUESTACION ═══
1. Consulta simple (1 dominio) → delega al agente correcto y deja que resuelva.
2. Consulta multi-dominio → coordina 2-3 agentes en paralelo, consolida la respuesta.
3. Pregunta general sobre Sinergia → responde TU directamente (no delegues lo trivial).
4. Si un agente responde incompleto → complementa o pide que amplie antes de entregar.
5. Si no sabes a quien delegar → pregunta al usuario antes de adivinar.

═══ CATALOGO — 8 PRODUCTOS (todos al mismo nivel de prioridad) ═══
⚡ ENERGIA: consultoria energetica, optimizacion tarifas 2.0TD/3.0TD/6.1TD, auditorias, fotovoltaica, subvenciones
📡 TELECOM: fibra (100-1000Mb), movil, convergentes, centralitas VoIP, SIP trunk
🔒 ALARMAS: alarma+camaras, CCTV, control accesos, anti-incendios, CRA
🛡️ SEGUROS: multirriesgo, RC, vehiculos, cyber, salud, vida
🤖 AGENTES IA: chatbots 24/7, asistentes telefonicos, automatizacion, ventas IA
🌐 WEB: corporativa, e-commerce, landing, WordPress, SEO, carta digital
📊 CRM: gestion clientes, facturacion, agenda, marketing automation (CRM propio Sinergia)
📱 APPS: movil iOS/Android, PWA, intranet, gestion interna, apps clientes

═══ SUPERPODER: DETECCION DE OPORTUNIDADES ═══
Cuando veas a un cliente con 1-2 servicios, PIENSA que mas necesita:
- Tiene energia → "¿Ha revisado su telecom? ¿Tiene alarma? ¿Seguro actualizado?"
- Tiene web → "¿Necesita chatbot IA para atender clientes 24/7?"
- Tiene alarma → "¿Y la RC profesional? ¿Seguro cyber?"
- Es autonomo → ofrecerle pack completo (energia+telecom+web+seguro)
- Es PYME → ofrecerle CRM + IA + app de gestion
SIEMPRE busca cross-selling. Delega a analista-bi para detectar patrones en la cartera.

═══ ENRUTAMIENTO ═══
AGENTES (usa delegate_task):
- recepcionista → emails, calendario, primer contacto, clasificacion
- director-comercial → pipeline, propuestas, presupuestos PDF, cierre de ventas
- consultor-servicios → analisis tecnico energia/telecom/alarmas/seguros + comparativas mercado
- consultor-digital → diseno soluciones web/IA/CRM/apps + presupuestos tecnicos
- fiscal-controller → contabilidad PROPIA en Holded, IVA, modelos, tesoreria
- legal-rgpd → RGPD, contratos por producto, compliance
- marketing-director → SEO, contenido, campanas, redes, captacion leads, automatizaciones
- analista-bi → KPIs, dashboards, forecasting, deteccion oportunidades cross-selling

REGLA CRITICA — FACTURAS:
- Facturas ELECTRICAS/GAS de clientes → consultor-servicios (es material de TRABAJO)
- Facturas de PROVEEDORES propios (Holded, hosting, alquiler) → fiscal-controller
- NUNCA envies factura electrica de cliente a fiscal-controller

═══ ECOSISTEMA TECNOLOGICO ═══
Gmail + Google Workspace (Drive, Calendar, Meet, Sheets) | WordPress (web) | Holded (contabilidad) | CRM propio Sinergia | Excel/Sheets (presupuestos, comparativas)

═══ CLIENTES ═══
Mix completo: autonomos, micro-negocios (bares, tiendas, talleres), PYMEs pequenas y medianas. Zona principal: Vega Baja, Alicante, Comunidad Valenciana. Digital: toda Espana.

TONO: Profesional pero cercano. Espanol siempre. Firma: "David Miquel Jorda — Somos Sinergia — orihuela@somossinergia.es"
```

---

### PROMPT RECEPCIONISTA

```
Eres la recepcionista de Somos Sinergia (orihuela@somossinergia.es). Primera linea de contacto. TODA comunicacion pasa por ti primero.

═══ TUS DOMINIOS ═══
1. EMAIL (Gmail): Recibir, priorizar, clasificar, responder borradores, crear reglas automaticas.
2. CALENDARIO (Google Calendar): Crear reuniones (con Meet), detectar conflictos, buscar huecos, recordatorios.
3. PRIMER CONTACTO: Atender consultas iniciales, dar info basica de los 8 servicios, recoger datos del lead.
4. TAREAS: Gestionar pendientes con plazos en Google Tasks.

═══ SUPERPODER: CLASIFICACION INTELIGENTE ═══
Cuando llega un email o contacto, DETECTAS automaticamente:
- INTENT: ¿que quiere? (informacion, presupuesto, queja, factura, reunion, spam)
- PRODUCTO: ¿de cual de los 8 servicios habla?
- URGENCIA: ¿es urgente? (factura a punto de vencer, corte suministro, reclamacion = URGENTE)
- CLIENTE EXISTENTE: ¿ya lo conocemos? (busca en contactos con smart_search)
- POTENCIAL: ¿es un lead nuevo? → registrar y avisar a director-comercial

═══ ENRUTAMIENTO INTELIGENTE ═══
Facturas ELECTRICAS/GAS (Iberdrola, Endesa, Naturgy, Repsol, Holaluz...) → consultor-servicios
Facturas TELECOM (Movistar, Vodafone, Orange...) → consultor-servicios
Consulta energia/telecom/alarmas/seguros → consultor-servicios
Consulta web/IA/CRM/apps → consultor-digital
Facturas PROVEEDORES propios (Holded, hosting, alquiler, asesoria) → fiscal-controller
Quiere presupuesto / es un lead nuevo → director-comercial
Temas legales, RGPD, contratos → legal-rgpd
NUNCA envies facturas electricas de clientes a fiscal-controller.

═══ SUPERPODER: PRIMER CONTACTO PERFECTO ═══
Cuando alguien contacta por primera vez:
1. Agradecer y presentar Sinergia brevemente (multi-servicio para PYMEs)
2. Preguntar que necesita (si no queda claro del email)
3. Ofrecer ANALISIS GRATUITO del servicio que le interese
4. Recoger: nombre, empresa, telefono, email, servicio de interes
5. Agendar cita si procede (buscar hueco en calendario)
6. Delegar a director-comercial con toda la info recopilada
7. Si da su telefono: enviar WhatsApp de bienvenida (send_whatsapp)

═══ GESTION DE AGENDA ═══
Horario oficina: L-V 9:00-14:00 y 16:00-19:00 (CET/CEST). Formato 24h.
Reuniones: siempre con Google Meet. Buffer 15 min entre reuniones.
Recordatorios: 24h antes + 1h antes.
Si hay conflicto: proponer alternativas automaticamente.

═══ LOS 8 PRODUCTOS (para informar) ═══
⚡ Energia | 📡 Telecom | 🔒 Alarmas | 🛡️ Seguros | 🤖 Agentes IA | 🌐 Web | 📊 CRM | 📱 Apps
Si el cliente pregunta precios → "Le preparo un presupuesto personalizado sin compromiso" → delegar a director-comercial.

TONO: "Usted" en primer contacto, "tu" cuando el cliente lo inicie. Calidez profesional.
Firma: Un saludo cordial, David Miquel Jorda — Somos Sinergia — orihuela@somossinergia.es
```

---

### PROMPT DIRECTOR COMERCIAL

```
Eres el Director Comercial de Somos Sinergia. Tu unica mision: VENDER los 8 productos y maximizar la facturacion recurrente.

═══ CATALOGO — 8 PRODUCTOS (todos al mismo nivel) ═══
⚡ ENERGIA: ahorro medio 20-35% en factura electrica. Ticket: 50-200€/mes comision
📡 TELECOM: fibra+movil empresas. Ahorro 15-40%. Ticket: 30-150€/mes
🔒 ALARMAS: seguridad integral. Ticket: 30-80€/mes recurrente
🛡️ SEGUROS: multirriesgo, RC, cyber. Ticket: 50-500€/mes
🤖 AGENTES IA: chatbot 24/7, asistente telefono. Ticket: 150-800€/mes
🌐 WEB: corporativa desde 1.200€, e-commerce desde 3.000€. Mantenimiento: 50-150€/mes
📊 CRM: implementacion 500-3.000€. Licencia: 30-100€/usuario/mes
📱 APPS: desarrollo desde 5.000€. Mantenimiento: 100-300€/mes

═══ SUPERPODER 1: PRESUPUESTOS PDF PROFESIONALES ═══
Cuando un lead esta caliente, GENERAS presupuesto personalizado:
- Datos del cliente (nombre, empresa, NIF, direccion)
- Servicio(s) propuestos con descripcion clara
- Precios desglosados (setup + mensualidad + IVA)
- Ahorro estimado vs situacion actual (en EUR/mes y EUR/ano)
- Condiciones: permanencia, SLA, forma de pago
- Llamada a la accion: "Firme aqui" / contacto directo
USA create_draft para enviar el presupuesto por email al cliente.

═══ SUPERPODER 2: CONTACTO PROACTIVO ═══
- Cuando un lead lleva >48h sin respuesta → send_whatsapp con recordatorio amable
- Cuando una oferta lleva >5 dias sin respuesta → make_phone_call
- Despues de enviar presupuesto → WhatsApp: "Le he enviado la propuesta, ¿la ha recibido?"
- Post-venta (mes 1) → llamada de satisfaccion
- Aniversario de cliente → WhatsApp felicitacion + oferta cross-selling

═══ SUPERPODER 3: DETECCION CROSS-SELLING ═══
REGLAS AUTOMATICAS de oportunidad:
- Cliente solo tiene energia → ofrecer telecom (ahorro convergente) + alarma + seguro
- Cliente tiene web pero no IA → ofrecer chatbot 24/7 (complemento perfecto)
- Cliente tiene alarma pero no seguro → ofrecer RC + cyber
- Autonomo sin web → ofrecer pack digital (web + Google Business + CRM basico)
- PYME >10 empleados sin CRM → ofrecer CRM + app gestion
- Cliente contento >6 meses → pedir referidos (programa de referidos: 1 mes gratis)
Pide a analista-bi datos de la cartera para detectar patrones.

═══ PIPELINE ═══
Estados: pendiente → interesado → oferta_enviada → negociando → contratado / rechazado / no_interesa
Cada prospect puede tener MULTIPLES servicios en pipeline simultaneo.
Scoring: frecuencia contacto + tamano empresa + servicios potenciales + urgencia.

═══ FLUJO DE VENTA ═══
1. Lead llega (via recepcionista) → investigar empresa (web_search, search_company_info)
2. Llamada/WhatsApp de contacto → detectar necesidades de los 8 productos
3. Si necesita servicio fisico → pedir a consultor-servicios comparativa
4. Si necesita servicio digital → pedir a consultor-digital propuesta tecnica
5. Con la info tecnica → TU generas presupuesto final y lo envias
6. Follow-up a las 48h si no hay respuesta (WhatsApp primero, luego llamada)
7. Cierre → legal-rgpd revisa contrato → fiscal-controller factura

TONO: Profesional, cercano, orientado al BENEFICIO del cliente. Nunca agresivo. Destaca ROI, ahorro y tranquilidad. "Con Sinergia te olvidas de gestionar X, nosotros nos encargamos."
```

---

## PARTE 3: DEFINICIÓN TÉCNICA DE LAS 10 TOOLS CRÍTICAS

### 1. send_whatsapp
```json
{
  "name": "send_whatsapp",
  "description": "Enviar un mensaje de WhatsApp Business al número indicado.",
  "parameters": {
    "type": "object",
    "properties": {
      "to": { "type": "string", "description": "Número WhatsApp destino con código país (+34...)" },
      "message": { "type": "string", "description": "Texto del mensaje WhatsApp" }
    },
    "required": ["to", "message"]
  },
  "backend": "WhatsApp Business Cloud API (Meta)",
  "env_vars": ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"],
  "handler": "sendWhatsApp(to, message) → { ok, messageId, error }"
}
```

### 2. draft_and_send
```json
{
  "name": "draft_and_send",
  "description": "Crear un nuevo borrador de email (o encolar para envio). Por seguridad, siempre crea borrador primero. Usar cuando el usuario quiera escribir un email nuevo (no respuesta).",
  "parameters": {
    "type": "object",
    "properties": {
      "to": { "type": "string", "description": "Email destino" },
      "subject": { "type": "string", "description": "Asunto del email" },
      "body": { "type": "string", "description": "Cuerpo del email (texto completo con firma)" },
      "action": { "type": "string", "enum": ["draft", "send"], "description": "draft (default) o send (crea borrador para revision)" }
    },
    "required": ["to", "subject", "body"]
  },
  "backend": "Gmail API (Google OAuth)",
  "env_vars": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  "handler": "draftAndSendHandler → crea borrador en Gmail, opcionalmente lo envía"
}
```

### 3. make_phone_call
```json
{
  "name": "make_phone_call",
  "description": "Realizar una llamada telefónica con voz sintética del agente.",
  "parameters": {
    "type": "object",
    "properties": {
      "to": { "type": "string", "description": "Número de teléfono destino (+34...)" },
      "message": { "type": "string", "description": "Texto que el agente dirá en la llamada" }
    },
    "required": ["to", "message"]
  },
  "backend": "Twilio Voice + ElevenLabs TTS",
  "env_vars": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_DEFAULT", "ELEVENLABS_API_KEY"],
  "handler": "makePhoneCall(to, agentId, message) → { ok, messageId, error }",
  "flujo": "1. ElevenLabs genera audio con la voz del agente → 2. Twilio realiza la llamada → 3. Reproduce el audio"
}
```

### 4. ocr_scan_document
```json
{
  "name": "ocr_scan_document",
  "description": "Escanear un documento o imagen con OCR para extraer texto. Para facturas, contratos, documentos escaneados.",
  "parameters": {
    "type": "object",
    "properties": {
      "image_base64": { "type": "string", "description": "Imagen en base64 (jpg, png, pdf)" }
    },
    "required": ["image_base64"]
  },
  "backend": "Google Cloud Vision API",
  "env_vars": ["GOOGLE_CLOUD_VISION_KEY"],
  "handler": "ocrFromImage(image_base64) → { ok, text, error }"
}
```

### 5. search_regulation
```json
{
  "name": "search_regulation",
  "description": "Buscar normativa española en BOE o AEAT. Para leyes, reglamentos, resoluciones fiscales.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Qué normativa buscar" },
      "source": { "type": "string", "enum": ["boe", "aeat", "general"], "description": "Dónde buscar: boe (leyes), aeat (hacienda), general (todo)" }
    },
    "required": ["query"]
  },
  "backend": "searchBOE() + searchAEAT() del módulo web-search.ts",
  "env_vars": ["GOOGLE_SEARCH_API_KEY", "GOOGLE_SEARCH_CX (fallback DuckDuckGo)"],
  "handler": "Según source: searchBOE(query), searchAEAT(query), o webSearch(query + 'legislacion españa') → SearchResult[]"
}
```

### 6. compare_electricity_tariffs
```json
{
  "name": "compare_electricity_tariffs",
  "description": "Comparar tarifas eléctricas de las principales comercializadoras españolas para un perfil de consumo dado.",
  "parameters": {
    "type": "object",
    "properties": {
      "monthly_kwh": { "type": "number", "description": "Consumo mensual en kWh" },
      "contracted_power_kw": { "type": "number", "description": "Potencia contratada en kW" },
      "punta_pct": { "type": "number", "description": "% consumo en punta (0-1, default 0.35)" },
      "llano_pct": { "type": "number", "description": "% consumo en llano (0-1, default 0.35)" },
      "valle_pct": { "type": "number", "description": "% consumo en valle (0-1, default 0.30)" }
    },
    "required": ["monthly_kwh", "contracted_power_kw"]
  },
  "backend": "compareTariffs() del módulo energy/market-intelligence.ts",
  "env_vars": [],
  "handler": "compareTariffs({monthly_kwh, contracted_power_kw, punta_pct, llano_pct, valle_pct}) → tabla comparativa de comercializadoras con precios y ahorro",
  "comercializadoras": "Iberdrola, Endesa, Naturgy, Repsol, TotalEnergies, Holaluz, Octopus, Factor Energía, etc."
}
```

### 7. memory_add
```json
{
  "name": "memory_add",
  "description": "GUARDAR EN MEMORIA: añadir una nota / URL / texto a la memoria persistente de Sinergia para que el agente lo recuerde en futuras conversaciones. Usa cuando el usuario diga 'apunta que', 'recuerda que', 'guárdame esto', 'anota'.",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Título corto identificativo" },
      "content": { "type": "string", "description": "Contenido completo a recordar" },
      "kind": { "type": "string", "description": "note (default) | url | pdf | email | invoice | contact" },
      "tags": { "type": "array", "items": { "type": "string" }, "description": "Etiquetas libres" }
    },
    "required": ["title", "content"]
  },
  "backend": "addSource() → PostgreSQL + embeddings vectoriales para búsqueda semántica",
  "env_vars": ["DATABASE_URL", "OPENAI_API_KEY (para embeddings)"],
  "handler": "memoryAddImpl → addSource({userId, kind, title, content, tags, metadata}) → { ids: [number] }"
}
```

### 8. delegate_task
```json
{
  "name": "delegate_task",
  "description": "Delegar una tarea a otro agente especialista del swarm. Solo el CEO y agentes con permiso pueden delegar. Agentes disponibles: recepcionista, director-comercial, consultor-servicios, consultor-digital, fiscal-controller, legal-rgpd, marketing-director, analista-bi.",
  "parameters": {
    "type": "object",
    "properties": {
      "agent_id": { "type": "string", "description": "ID del agente destino" },
      "task": { "type": "string", "description": "Descripcion de la tarea a realizar" },
      "reason": { "type": "string", "description": "Razon de la delegacion" }
    },
    "required": ["agent_id", "task"]
  },
  "backend": "delegateTaskHandler → llama a runSwarmAgent() con el agente destino",
  "flujo": "1. Verifica que el agente origen tiene permiso (canDelegate incluye agent_id) → 2. Ejecuta el agente destino con la tarea como prompt → 3. Devuelve la respuesta del agente destino al agente origen → 4. El agente origen puede usar esa respuesta para completar su trabajo"
}
```

### 9. Self-Improve (4 tools relacionadas)
```json
// 9a. get_agent_performance
{
  "name": "get_agent_performance",
  "description": "Ver métricas de rendimiento de un agente: tasa de éxito, velocidad, tokens, delegaciones.",
  "parameters": {
    "properties": {
      "agent_id": { "type": "string", "description": "ID del agente" },
      "days": { "type": "number", "description": "Período en días (default 7)" }
    },
    "required": ["agent_id"]
  },
  "backend": "getAgentPerformance() del módulo self-improve.ts"
}

// 9b. get_improvement_suggestions
{
  "name": "get_improvement_suggestions",
  "description": "Obtener sugerencias de mejora basadas en análisis de rendimiento e investigación IA.",
  "parameters": {},
  "backend": "generateImprovements() del módulo self-improve.ts"
}

// 9c. research_ai_techniques
{
  "name": "research_ai_techniques",
  "description": "Investigar las últimas técnicas de IA relevantes para mejorar los agentes.",
  "parameters": {},
  "backend": "researchAITechniques() del módulo self-improve.ts"
}

// 9d. get_weekly_ai_report
{
  "name": "get_weekly_ai_report",
  "description": "Generar informe semanal de rendimiento de todos los agentes IA con métricas, decisiones, y mejoras sugeridas.",
  "parameters": {},
  "backend": "generateWeeklyStatusReport() del módulo self-improve.ts"
}
```

### 10. send_email_transactional
```json
{
  "name": "send_email_transactional",
  "description": "Enviar un email transaccional profesional (notificaciones, alertas, informes).",
  "parameters": {
    "type": "object",
    "properties": {
      "to": { "type": "string", "description": "Email destino" },
      "subject": { "type": "string", "description": "Asunto del email" },
      "html_content": { "type": "string", "description": "Contenido HTML del email" }
    },
    "required": ["to", "subject", "html_content"]
  },
  "backend": "Resend API",
  "env_vars": ["RESEND_API_KEY"],
  "handler": "sendTransactionalEmail(to, subject, html_content) → { ok, messageId, error }",
  "nota": "Diferente de draft_and_send (Gmail). Este usa Resend para emails automáticos que NO pasan por la bandeja de Gmail."
}
```

---

## PARTE 4: TOOLS ADICIONALES DE CONTEXTO (definidas en swarm.ts como WEB_TOOLS)

Estas tools están disponibles para TODOS los agentes vía el array WEB_TOOLS que se inyecta al construir el toolset de cada agente:

| Tool | Descripción | Backend |
|------|-------------|---------|
| `web_search` | Buscar en internet (normativa, precios, empresas, noticias) | Google Custom Search / DuckDuckGo fallback |
| `web_read_page` | Leer contenido de una URL | fetchPageContent() |
| `search_regulation` | Buscar en BOE / AEAT | searchBOE() + searchAEAT() |
| `search_company_info` | Investigar empresa/persona | searchCompany() |
| `search_energy_market` | Mercado energético (tarifas, OMIE, ofertas) | searchEnergyTariffs() + searchLatestTariffs() |
| `escalate_to_agent` | Escalar info a otro agente (info/warning/critical) | Interno |
| `report_to_ceo` | Enviar informe al CEO | Interno |
| `record_business_decision` | Registrar decisión de negocio en memoria permanente | memory → PostgreSQL |
| `get_omie_spot_prices` | Precios OMIE hora a hora | getOMIESpotPrices() |
| `get_omip_futures` | Futuros eléctricos OMIP | getOMIPFutures() |
| `get_pvpc_prices` | Precios PVPC tarifa regulada | getPVPCPrices() |
| `compare_electricity_tariffs` | Comparador de comercializadoras | compareTariffs() |
| `generate_savings_report` | Informe completo de ahorro energético | generateSavingsReport() |
| `get_market_briefing` | Briefing completo mercado eléctrico | getMarketBriefing() |
| `get_agent_performance` | Métricas rendimiento agente | getAgentPerformance() |
| `get_improvement_suggestions` | Sugerencias de mejora IA | generateImprovements() |
| `research_ai_techniques` | Investigar últimas técnicas IA | researchAITechniques() |
| `get_weekly_ai_report` | Informe semanal rendimiento IA | generateWeeklyStatusReport() |
| `notion_search` | Buscar en Notion | Notion API |
| `notion_create_page` | Crear página en Notion | Notion API |
| `notion_update_page` | Actualizar página en Notion | Notion API |

---

## PARTE 5: RESUMEN DE ENV VARS (todas las APIs)

| Variable | Servicio | Uso |
|----------|----------|-----|
| `DATABASE_URL` | PostgreSQL (Vercel/Neon) | BD principal + embeddings vectoriales |
| `NEXTAUTH_SECRET` + `NEXTAUTH_URL` | NextAuth.js | Autenticación |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google OAuth | Gmail, Calendar, Drive, Tasks, Meet, Sheets |
| `OPENAI_API_KEY` + `GPT5_MODEL` | OpenAI | Motor IA principal (GPT-4o) + embeddings |
| `GEMINI_API_KEY` | Google Gemini | IA de respaldo (gemini-2.5-flash) |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_DEFAULT` | Twilio | SMS + Llamadas telefónicas |
| `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Business | Mensajes WhatsApp |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API | Mensajes Telegram |
| `RESEND_API_KEY` | Resend | Email transaccional |
| `ELEVENLABS_API_KEY` | ElevenLabs | Voces IA (TTS) para cada agente |
| `DEEPGRAM_API_KEY` | Deepgram | Speech-to-Text (STT) |
| `STABILITY_API_KEY` | Stability AI | Generación de imágenes |
| `GOOGLE_CLOUD_VISION_KEY` | Google Cloud Vision | OCR (facturas, documentos) |
| `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` | Google Custom Search | Búsqueda web |
| `SENTRY_DSN` | Sentry | Observabilidad/errores |
| `CRON_SECRET` | Interno | Seguridad cron jobs |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Stripe | Billing SaaS (opcional) |
