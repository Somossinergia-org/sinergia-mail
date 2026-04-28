# Plan de reorganización móvil — Sinergia Mail

**Fecha:** 2026-04-28
**Autor:** Claude (auditoría tras feedback "no se ve bien" + screenshots)

---

## 1. Mapa actual — qué tienes hoy

```
┌────────────────────────────────────────────────────────────────┐
│  BOTTOM NAV (5 tabs visibles)                                  │
└────────────────────────────────────────────────────────────────┘
   │
   ├── INICIO ─── AgentBriefing (alerts del día)
   │              TodayWidget (tareas urgentes)
   │              [Hoy] HudDashboard (KPIs)
   │              [Analíticas] CategoryChart + Prioridad
   │
   ├── CRM ────── 12 sub-tabs (los más numerosos):
   │              ┌─ Día a día:    Agenda · Tareas · Alertas
   │              ├─ Negocio:      Empresas · Contactos · Oportunidades
   │              ├─ Análisis:     Resumen · Actividad · Scoring
   │              └─ Especializ.:  Energía · Visitas · Operativa
   │
   ├── EMAILS ─── 3 sub-tabs:  Bandeja · Kanban · Redactar
   │
   ├── FINANZAS ─ 5 sub-tabs:  Facturas · Facturar · Alertas&IVA · Tesorería · Informes
   │
   └── AJUSTES ── 15 ITEMS en 3 secciones (¡demasiado!):
                  ┌─ Herramientas: Calendario · Drive · Tareas · Importar · WordPress
                  ├─ IA:           Agente IA · Oficina IA · Conocimiento · Memoria · Fine-tuning
                  └─ Sistema:      Conexiones · Firma · RGPD · Operaciones · Base Operativa

┌────────────────────────────────────────────────────────────────┐
│  SIDEBAR (oculto detrás del ≡, raro de abrir en móvil)         │
└────────────────────────────────────────────────────────────────┘
   └── CAMPAÑAS ─ 6 sub-tabs:  Automatización · Templates · Reglas
                               · Secuencias · Mensajes · Dashboard

┌────────────────────────────────────────────────────────────────┐
│  FAB / FLOTANTES                                                │
└────────────────────────────────────────────────────────────────┘
   ├── 🟣 Sparkles → Chat IA
   └── 🟦 + → Crear (tarea, actividad, nota, oportunidad)
```

**Total navegable:** ~46 vistas distintas escondidas en 6 tabs.

---

## 2. Problemas detectados

### A) `Ajustes` se usó como cajón de sastre
Tiene 15 items mezclando 3 categorías que NO deberían estar juntas:

| Categoría | Items | Naturaleza | Frecuencia de uso |
|---|---|---|---|
| **Tools (uso diario)** | Calendario, Drive, Tareas, Importar, WordPress | acción/consulta | alta |
| **IA (referencia/config)** | Agente IA, Oficina IA, Conocimiento, Memoria, Fine-tuning | mixto | media |
| **Settings reales** | Conexiones, Firma, RGPD, Operaciones, Base Operativa | configurar una vez | baja |

> Pones a un usuario buscando "Calendario" y va a `Ajustes → Herramientas → Calendario`. Eso es **3 taps** para una herramienta diaria. Es mal IA.

### B) `Campañas` exiliado al sidebar
Tras el rediseño móvil quitamos Campañas del bottom nav y lo dejamos solo en sidebar. Pero el sidebar es "abrir hamburguesa → tap" = 2 taps cada vez. Para una sección con templates/secuencias/auto-borradores que se usan a diario, es **demasiado profundo**.

### C) Duplicados de funcionalidad
- `CRM > Tareas` ↔ `Ajustes > Herramientas > Tareas` (Google Tasks) — confunde
- `Inicio > TodayWidget` ↔ `CRM > Agenda` ↔ `Ajustes > Calendario` — 3 vistas distintas de eventos/tareas
- `CRM > Operativa` ↔ `Ajustes > Operaciones` ↔ `Ajustes > Base Operativa` — 3 panels parecidos

### D) Profundidad inconsistente
- `Calendario` está a 3 taps
- `RGPD` (urgente cuando hay un caso) también a 3 taps
- `Generar borrador IA` es 1 tap (FAB)

No hay relación entre frecuencia de uso y accesibilidad.

### E) `Inicio` infrautilizado
El "Mi día" muestra 4 cards que no añaden información accionable cuando estás en cero. No es punto de entrada útil — sólo briefing de alerts cuando los hay.

---

## 3. Mapa propuesto — la app reorganizada

```
┌────────────────────────────────────────────────────────────────┐
│  NUEVO BOTTOM NAV (5 tabs, sin sheet "Más")                    │
└────────────────────────────────────────────────────────────────┘
   │
   ├── 🏠 INICIO ─── (rediseño: hub real, no solo briefing)
   │      ├── Briefing alerts (cuando hay)
   │      ├── Agenda hoy + tareas urgentes (TodayWidget compacto)
   │      ├── Acciones rápidas: [Calendario] [Drive] [Importar]
   │      ├── Atajos del agente: [Habla con IA] [Auto-borradores]
   │      └── KPIs (HudDashboard inline, no sub-tabs)
   │
   ├── 📋 CRM ────── 8 sub-tabs (de 12 → reducidos):
   │      ├─ Día:        Agenda · Tareas · Alertas
   │      ├─ Negocio:    Empresas · Oportunidades · Contactos
   │      └─ Análisis:   Resumen · Actividad
   │      (Energía/Visitas/Operativa/Scoring → mover ver sección 4)
   │
   ├── 📧 EMAILS ─── 4 sub-tabs (era 3):
   │      Bandeja · Kanban · Redactar · Templates
   │      (templates aquí porque son "respuesta rápida")
   │
   ├── 📣 CAMPAÑAS ─ 5 sub-tabs (era 6 + recuperado del sidebar):
   │      Automatización · Reglas · Secuencias · Mensajes · WordPress
   │      (WordPress vuelve aquí — es marketing/content)
   │
   └── ⚙️ AJUSTES ── 7 items en 2 secciones (era 15):
          ┌─ Cuenta:   Conexiones · Firma · RGPD
          └─ Sistema:  Agente IA · Memoria · Fine-tuning · Operaciones

┌────────────────────────────────────────────────────────────────┐
│  TOOLS BAR — nueva fila contextual debajo del header           │
└────────────────────────────────────────────────────────────────┘
   En INICIO aparecen 3 atajos visibles SIEMPRE:
   [📅 Calendario] [💾 Drive] [📥 Importar]
   No están dentro de Ajustes — accesibles a 1 tap.

┌────────────────────────────────────────────────────────────────┐
│  AGENTE IA — promovido (era enterrado en Ajustes)              │
└────────────────────────────────────────────────────────────────┘
   ✨ FAB sparkles (ya existe) → chat con cualquier agente
   📋 INICIO tiene tarjeta "Agente del día" con sugerencias
   📊 INICIO tiene "Oficina IA" mini-widget con estado vivo

┌────────────────────────────────────────────────────────────────┐
│  FINANZAS                                                       │
└────────────────────────────────────────────────────────────────┘
   En esta sesión NO la tocamos — los 5 sub-tabs están bien.
   Sólo añadiría: shortcut "📥 Subir factura por foto" como FAB
   secundario contextual (sólo aparece cuando estás en Finanzas).
```

---

## 4. Items que se mueven — antes / después

| Item | Estaba en | Ahora va a | Por qué |
|---|---|---|---|
| **Calendario** | Ajustes > Herramientas | Inicio (atajo) + integrado en CRM > Agenda | Es vista diaria, no setting |
| **Drive** | Ajustes > Herramientas | Inicio (atajo) | Acceso rápido |
| **Tareas (Google)** | Ajustes > Herramientas | (eliminar duplicado, sólo mantener `CRM > Tareas`) | Era duplicado |
| **Importar** | Ajustes > Herramientas | Inicio (atajo) | Es acción, no setting |
| **WordPress** | Ajustes > Herramientas | **Campañas** | Es content/marketing |
| **Agente IA config** | Ajustes > IA | Ajustes > Sistema (queda) | OK donde está |
| **Oficina IA** | Ajustes > IA | Inicio (mini-widget) + accesible vía atajo | Es monitorización viva |
| **Conocimiento** | Ajustes > IA | (queda accesible al chat IA) | Es referencia interna del agente |
| **Memoria** | Ajustes > IA | Ajustes > Sistema | OK config |
| **Fine-tuning** | Ajustes > IA | Ajustes > Sistema | OK config avanzada |
| **Operaciones** | Ajustes > Sistema | Ajustes > Sistema (queda) | Es admin |
| **Base Operativa** | Ajustes > Sistema | (eliminar — fundirlo con Operaciones) | Duplicado |
| **Energía** | CRM > Especializado | CRM > Negocio | Es vertical de servicios, no especial |
| **Visitas** | CRM > Especializado | (eliminar item separado, integrar en `Actividad`) | Una visita ES una actividad |
| **Operativa** | CRM > Especializado | (eliminar — fundir con `Actividad`) | Duplicado |
| **Scoring** | CRM > Análisis | (eliminar como sub-tab, integrar en CrmCompanyDetailPanel) | Métrica por empresa, no vista global |
| **Campañas** | (Sidebar oculto) | Bottom nav 4º tab | Uso diario, debe estar visible |
| **Hoy / Analíticas** | Inicio > SubTabs | Inicio (sin sub-tabs, uno debajo del otro o KPIs solo) | Sub-tabs internos en Inicio sobran |
| **Templates** | Campañas | Emails (también) — duplicado | Uso desde redactar email es natural |

---

## 5. Diagrama visual — flujo del usuario antes/después

### Antes — para escribir un email a un cliente con su factura

```
[Bottom: Emails] → [Sub-tab: Redactar] → escribir → necesito plantilla
       ↓
       hay que cambiar de tab
       ↓
[Bottom: ≡ sidebar] → [Campañas] → [Templates] → buscar → copiar texto
       ↓
       volver a redactar
       ↓
[Bottom: Emails] → [Redactar] → pegar → enviar
                                                = 6 pantallas, 8 taps
```

### Después

```
[Bottom: Emails] → [Sub-tab: Redactar]
       ↓ botón "Plantillas" inline (cargado desde Templates)
       elegir plantilla → autofill → editar → enviar
                                                = 1 pantalla, 4 taps
```

---

### Antes — para subir una factura por foto

```
[Bottom: Finanzas] → mirar facturas
       ↓
[botón pequeño arriba: "Añadir factura por foto"]
                                                = 2 taps
```

### Después

```
[Bottom: Finanzas] → FAB cámara contextual abajo a la derecha
                                                = 1 tap
```

---

### Antes — para ver el calendario

```
[Bottom: Ajustes] → [scroll down a Herramientas] → [Calendario]
                                                = 3 taps + scroll
```

### Después

```
[Bottom: Inicio] → [atajo Calendario en la fila superior]
                                                = 2 taps
```

---

## 6. Mockup del nuevo `Inicio`

```
┌──────────────────────────────────────────────────────────┐
│ ≡  Inicio                              ⌕  ↻             │ ← header igual
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ┌──────────────────────────────────────────────────┐   │
│ │ 🤖  Buenas tardes, David                          │   │ ← AgentBriefing
│ │     0 alertas · 3 emails sin contestar     [→]   │   │   (cuando hay datos)
│ │     [Generar borradores]                          │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─Atajos────────────────────────────────────────────┐   │
│ │ 📅 Cal.    💾 Drive    📥 Importar    ✨ IA     │   │ ← 4 tools 1 tap
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─Mi agenda hoy────────────────────────────────────┐   │
│ │ 09:00  Reunión Iberdrola             [empresa]   │   │ ← compactado
│ │ 11:30  Tarea: enviar oferta Acme                  │   │
│ │ 16:00  Llamada control familia López              │   │
│ │   [Ver semana →]                                  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─KPIs─────────────────────────────────────────────┐   │
│ │ 209 empresas · 459 servicios · 728€/año previsto  │   │
│ │ ─────────────────────────────────────────────     │   │
│ │ Pipeline: 0 € · Renovaciones próx: 3 · Tareas: 5  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─Oficina IA (vivo)────────────────────────────────┐   │
│ │ 🟢 4 agentes activos · último: comercial-junior  │   │
│ │   [Ver mapa completo →]                           │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
        🟣 (chat IA)        🟦 + (crear)
┌──────────────────────────────────────────────────────────┐
│  🏠 Inicio  📋 CRM  📧 Emails  📣 Campañas  ⚙️ Ajustes │
└──────────────────────────────────────────────────────────┘
```

**Resultado**: Inicio = panel real con todo a 1 tap. Sin scroll perdido.

---

## 7. Plan de implementación — 4 fases

### Fase 1 — Arreglos rápidos (1-2 commits, sin riesgo)
1. ✅ Mover Campañas al bottom nav (volver a 5 tabs reales: Inicio · CRM · Emails · **Campañas** · Ajustes — Finanzas detrás del FAB en Inicio)
   - O alternativa: 6 tabs sin labels en mobile pequeño
2. ✅ Mover WordPress a Campañas
3. ✅ Quitar duplicado "Tareas (Google)" de Ajustes (mantener solo `CRM > Tareas`)
4. ✅ Eliminar "Base Operativa" (fundir con Operaciones)
5. ✅ Eliminar "Visitas" como sub-tab CRM (integrar en Actividad)
6. ✅ Mover "Energía" de Especializado → Negocio en CRM

### Fase 2 — Atajos en Inicio (1 commit medio)
1. ✅ Crear componente `<MobileQuickActions>` con 4 chips (Calendario · Drive · Importar · IA)
2. ✅ Añadir mini-widget "Oficina IA" en Inicio (estado live de los agentes)
3. ✅ Compactar TodayWidget para mostrarlo siempre en Inicio si hay datos

### Fase 3 — Templates inline en Emails (1 commit)
1. ✅ En `ComposePanel`, añadir dropdown de "Plantillas" cargadas vía `/api/email-templates`
2. ✅ Click en plantilla → autofill subject + body
3. ✅ Mantener Templates accesible en Campañas (admin de plantillas), pero el USO está en Emails

### Fase 4 — FAB cámara para Finanzas (1 commit)
1. ✅ Si activeTab === "finanzas", el FAB principal cambia a icono cámara
2. ✅ Tap → abre `<UploadInvoicePhoto>` (ya existe)
3. ✅ Subida directa desde la pestaña, sin entrar a Facturar

---

## 8. Decisiones que necesito de ti

Antes de implementar, hay 3 decisiones que solo tú puedes tomar:

### Decisión 1 — Bottom nav: 5 ó 6 tabs?
**Opción A (5 tabs, current con cambio):** Inicio · CRM · Emails · Campañas · Ajustes
   → Finanzas se accede por widget en Inicio (un atajo grande arriba)
**Opción B (6 tabs, icon-only):** Inicio · CRM · Emails · Campañas · Finanzas · Ajustes
   → cabe en 360px con icon de 24px y labels micro (10px)

**Mi recomendación:** B con iconos limpios. Probado en native apps similares (HubSpot, Pipedrive móvil).

### Decisión 2 — `Inicio` como hub o como briefing?
**Opción A (hub):** Atajos siempre visibles + KPIs + agenda + briefing (mockup §6)
**Opción B (briefing):** Solo briefing + KPIs (similar a hoy, más limpio)

**Mi recomendación:** A. Te da Calendario/Drive/Importar a 1 tap sin sacrificar el briefing.

### Decisión 3 — Eliminar duplicados ahora o después?
- "Visitas" sub-tab CRM
- "Base Operativa"
- "Tareas (Google)" en Ajustes

**Mi recomendación:** ahora — son code-only changes sin migración de datos.

---

## 9. Estimación

- **Fase 1** (arreglos rápidos): 2-3 horas, 1 PR
- **Fase 2** (Inicio hub): 4-6 horas, 1 PR
- **Fase 3** (templates inline): 2 horas, 1 PR
- **Fase 4** (FAB cámara contextual): 1 hora, 1 PR

**Total: ~10-12 horas de trabajo, 4 PRs incrementales y testeables.**

Cada PR despliega solo a staging, lo pruebas en tu móvil, y si OK → main.

---

¿Empezamos por la Fase 1?
