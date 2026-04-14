# Plan de arquitectura — Paquetes B + C

**Fecha**: 2026-04-14 (continuación)
**Paquete A**: completado ✓ (commits 43771e6 → 57c2e3d en producción)

---

## PAQUETE B — Exposición MCP (skill 08)

### Misión
Convertir Sinergia Mail en servidor MCP consumible desde Claude Desktop. Permite al usuario hablar con Claude Desktop ("qué proveedores me han vencido", "dame el Excel del IVA Q2") sin abrir el dashboard.

### Decisiones técnicas

**Transport**: HTTP JSON-RPC 2.0 sobre Next.js route (`/api/mcp`).
Alternativa descartada: stdio server (requiere proceso local, no funciona con deploy Vercel remoto).

**Autenticación**: Bearer token en header `Authorization`. Token generado desde la UI (tabla `mcp_tokens` con hash), validado por endpoint antes de servir cualquier tool.

**Protocolo**: MCP 2024-11-05 spec. Métodos mínimos:
- `initialize` — handshake
- `tools/list` — enumera capacidades
- `tools/call` — invoca una capacidad

**Tools expuestos** (6 de alto valor, read-only):
1. `query_emails(category?, search?, limit?)` — lista emails filtrados
2. `query_invoices(category?, dateFrom?, dateTo?, limit?)` — lista facturas
3. `get_stats()` — resumen: totales, sin leer, gasto, IVA
4. `get_iva_quarterly(year, quarter)` — desglose Modelo 303
5. `get_overdue_invoices()` — facturas vencidas con cálculo de días
6. `get_duplicate_invoices()` — grupos de duplicados detectados

### Archivos nuevos
- `src/app/api/mcp/route.ts` — JSON-RPC handler
- `src/lib/mcp/tools.ts` — definiciones de schema + handlers
- `src/lib/mcp/auth.ts` — Bearer token validator
- `src/db/schema.ts` — nueva tabla `mcp_tokens`
- `scripts/migrate-mcp-tokens.js` — DDL migration
- Entrada en UI Sidebar → sección "Integraciones" con botón *Generar token MCP*

---

## PAQUETE C — WOW Factor (skill el-factor-wow)

### Misión
Llevar la UI de "funcional" a "top tier". Vanguardia visual sin romper consistencia.

### Decisiones técnicas

**Framer Motion** — Animaciones físicas (stagger, layout, shared elements).
- Stagger de cards al entrar en cada panel
- Layout animation en expand/collapse de contactos
- Briefing card con fade+slide al montar

**Command Palette `⌘K`** — con la librería `cmdk`.
Navegación instantánea entre paneles + ejecución de acciones del agente sin clicks:
- "Generar borradores" → POST auto-drafts
- "IVA Q2" → navega + carga
- "Excel facturas" → descarga
- "Buscar contacto X" → filtra contactos

**Toast notifications** — con `sonner`. Reemplaza los mensajes inline de éxito/error con toasts globales.

**Fuera de scope** (podría ser Paquete D):
- Vista Kanban drag-and-drop
- Service Worker offline
- Web Push notifications
- Gráfico 3D con react-three-fiber

### Archivos nuevos
- `src/components/CommandPalette.tsx`
- `src/components/ToastProvider.tsx`
- Refactor de panels: envolver cards con `motion.div` + `AnimatePresence`
- `src/app/layout.tsx` — añade `<Toaster />` y `<CommandPalette />` globales

---

## ORDEN DE COMMITS

1. `feat: MCP server — JSON-RPC endpoint + 6 read-only tools`
2. `feat: MCP token management — DB schema + UI to generate tokens`
3. `feat: command palette (cmdk) — ⌘K global navigation + actions`
4. `feat: framer-motion stagger animations on all panels`
5. `feat: sonner toast notifications replace inline messages`

Cada commit: `tsc --noEmit` + `next build` + push.

---

## CRITERIOS DE ÉXITO

- [ ] `GET /api/mcp` con método `tools/list` devuelve los 6 tools
- [ ] `POST /api/mcp` con método `tools/call` + `get_stats` devuelve datos reales
- [ ] Token generado desde UI funciona en `Authorization: Bearer ...`
- [ ] `⌘K` abre command palette, enter dispara acciones
- [ ] Panels animan entrada con stagger (delay 50ms)
- [ ] Toasts aparecen al completar acciones agentic
- [ ] 0 regresiones en paquetes A

---

**Procedo.**
