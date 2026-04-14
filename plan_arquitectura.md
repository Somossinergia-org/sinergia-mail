# Plan de arquitectura — Paquete E: Mobile-first adaptación

**Fecha**: 2026-04-14

---

## Estado desktop (auditado)

- 16/16 endpoints devuelven 200
- 5 paneles nuevos (Automatización, Alertas, Contactos, Informes, Integraciones) + 4 originales funcionan
- Sidebar fijo 256px con flex row — correcto en pantallas ≥1024px
- Stats cards grid 2/4/5 responsive básico (falla en Touch <768)

---

## Breakpoints

| Ancho | Breakpoint Tailwind | Diseño |
|---|---|---|
| < 640 | (default) | Mobile — drawer sidebar + bottom nav + stack single-col |
| 640–768 | `sm:` | Mobile amplio — aún drawer pero más columnas (2) |
| 768–1024 | `md:` | Tablet — sidebar fija pero colapsable, 3 cols |
| ≥ 1024 | `lg:` | Desktop — sidebar siempre abierto (actual) |

---

## Decisiones clave

### 1. Sidebar → Drawer en mobile

Tailwind: `fixed inset-y-0 left-0 z-40 transform -translate-x-full lg:translate-x-0 lg:relative`.
Controlada por estado `sidebarOpen` en `DashboardPage`.
- Hamburger en header mobile abre/cierra
- Click en backdrop o en un tab cierra automáticamente
- En `lg:` siempre visible, sin hamburger

### 2. Bottom Navigation Bar (mobile only)

Barra fija en la parte inferior con **5 iconos** de alcance pulgar:
- Resumen · Emails · Facturas · Chat IA · Más

"Más" abre un sheet con el resto de secciones (Automatización, Alertas, Contactos, Informes, Integraciones).

Oculta en `lg:` (desktop ya tiene la sidebar completa).

### 3. Command Palette

- En mobile: se muestra full-screen (no centrado con max-width)
- Botón flotante ⌘K se oculta en mobile (la paleta se abre desde el bottom nav o un FAB más grande)
- Input más grande (48px touch target)

### 4. Touch targets

Todos los botones/links interactivos ≥ 44×44px (regla Apple HIG / Material). Clases `min-h-[44px]` o `py-3` en mobile.

### 5. Tipografía responsive

Scale down en mobile:
- `text-xl lg:text-2xl` para headings
- `text-xs sm:text-sm` para texto secundario
- `stat-number` escala con `text-2xl sm:text-3xl`

### 6. Seguridad UX: safe-area insets

Para iPhones con notch/home-indicator, uso `pb-[env(safe-area-inset-bottom)]` en bottom nav para que no se oculte bajo el indicador.

### 7. Chat IA en mobile

- Input **sticky al bottom** con `position: sticky; bottom: 0`
- Altura del textarea fija, scroll interno
- Mensajes ocupan full width

### 8. Listas (Emails, Facturas, Contactos)

- Grid de campos → stack vertical con jerarquía clara
- Fecha + categoría en una segunda línea pequeña
- Iconos de acción visibles siempre (no solo en hover — hover no existe en touch)

---

## Archivos afectados

### Nuevos

- `src/components/MobileBottomNav.tsx` — barra inferior con 5 tabs + sheet "Más"
- `src/components/MobileHeader.tsx` — barra superior mobile (logo + hamburger + sync)

### Modificados

- `src/components/Sidebar.tsx` — recibe prop `isOpen`, animación slide
- `src/app/dashboard/page.tsx` — control de drawer, header mobile, bottom nav, containers responsive
- `src/app/globals.css` — clases helper: `.safe-area-pb`, ajustes de scroll-padding
- `src/components/StatsCards.tsx` — `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`
- `src/components/EmailList.tsx`, `InvoicePanel.tsx`, `ContactosPanel.tsx` — stack mobile
- `src/components/AgentChat.tsx` — sticky input
- `src/components/CommandPalette.tsx` — full-screen mobile
- `src/components/{Automatizacion,Alertas,Informes,Integraciones}Panel.tsx` — grids responsive

---

## Orden de commits

1. **feat(mobile): responsive sidebar drawer + mobile header** — abre/cierra con hamburger
2. **feat(mobile): bottom navigation + "Más" sheet** — alcance pulgar
3. **feat(mobile): responsive grids + typography + touch targets** — todos los paneles
4. **feat(mobile): command palette full-screen + chat sticky input**

---

## Criterios de éxito

- [ ] 375×667 (iPhone SE) no tiene scroll horizontal
- [ ] 390×844 (iPhone 14) ídem
- [ ] Bottom nav accesible con pulgar (no esconde contenido clave)
- [ ] Drawer sidebar se abre/cierra con animación 300ms
- [ ] Touch targets ≥ 44px (medir con auditor)
- [ ] Command palette es usable en móvil (input suficientemente grande, resultados visibles)
- [ ] Chat IA: input visible siempre, teclado virtual no tapa la conversación
- [ ] Desktop NO se rompe (lg:≥1024 sigue como está)

---

**Procedo.**
