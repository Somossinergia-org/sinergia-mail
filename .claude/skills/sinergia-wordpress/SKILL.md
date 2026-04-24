---
name: sinergia-wordpress
description: Use for anything WordPress-related in this repo — adding/modifying WP agent tools, auditing a WP site via the marketing-automation agent, designing audit prompts, troubleshooting WP REST API issues, or adding new WP env vars/sites. Triggers on "WordPress", "WP", "wp-json", "wordpress.ts", "audit wp", "agente marketing y WordPress".
---

# WordPress — operación y auditoría

## Configuración (prod/preview en Vercel)

Env vars obligatorias por sitio (1..3):
- `WP_SITE_N_URL` — dominio completo sin `/` final
- `WP_SITE_N_USER` — usuario admin
- `WP_SITE_N_APP_PASSWORD` — Application Password (generar en WP Admin > Users > Perfil > Application Passwords)
- `WP_SITE_N_LABEL` — etiqueta legible

Nunca meter `WP_SITE_*` en `.env.local` local — son secretos; viven solo en Vercel.

## Tools disponibles (registry en `src/lib/agent/tools.ts`)

**Lectura (seguras)**: `wp_list_sites`, `wp_list_posts`, `wp_list_pages`, `wp_list_plugins`, `wp_list_themes`, `wp_get_settings`, `wp_search`.

**Escritura (requieren cuidado)**: `wp_create_post`, `wp_update_post`, `wp_create_page`, `wp_update_page`, `wp_update_settings`.

**Peligrosas (confirmación humana obligatoria)**: `wp_toggle_plugin` — puede romper el sitio.

## Agentes con acceso

- `ceo` — solo lectura + búsqueda
- `consultor-digital` — full control incluido `toggle_plugin` (uso para consultoría)
- `marketing-automation` — posts/pages/settings + listar plugins/themes (sin toggle)

## Reglas duras

1. **Drafts por defecto** al crear posts/pages. Solo `status: "publish"` si el usuario lo pide explícitamente.
2. **Nunca** `wp_toggle_plugin` sin confirmación humana en el chat — puede tirar el sitio.
3. **Nunca** `wp_update_settings` para cambiar la URL principal — WordPress desconecta la instalación.
4. Cualquier contenido nuevo respeta `brand-voice.ts` (voz David).
5. Si un endpoint REST falla con 401 → la Application Password ha caducado/se ha rotado; no intentar user/pass básico.
6. Rate limit natural: no más de ~30 ops consecutivas al mismo sitio; WP responde con 429/503.

## Prompt de auditoría — pegar al agente marketing-automation

```
Auditoría completa del sitio WordPress principal (siteId="1"). Quiero:

1. wp_get_settings: título, descripción, timezone, idioma, URL. Evaluar si reflejan bien la marca.
2. wp_list_themes: qué temas hay instalados y cuál está activo. ¿Es el tema adecuado para un negocio de servicios B2B? ¿Versiones desactualizadas?
3. wp_list_plugins: inventario completo. Marca los que estén inactivos (candidatos a eliminar) y los que puedan ser redundantes o problemáticos (seguridad, SEO, cache, forms).
4. wp_list_pages: estructura de páginas. ¿Faltan páginas clave (Home, Servicios, Contacto, Aviso Legal, Privacidad, Cookies RGPD)?
5. wp_list_posts: últimos 20 posts. Frecuencia de publicación, longitud media, gaps temáticos vs. los 8 servicios (energía, telefonía, seguros, IA, marketing, consultoría, facturación, RGPD).
6. wp_search con queries "rgpd", "privacidad", "cookies", "aviso legal" — confirmar que existen esas páginas legales.

Al terminar:
- Resumen estado general (0-10 por área: contenido, SEO básico, legal/RGPD, plugins, tema).
- Lista priorizada de acciones recomendadas (crítico / importante / opcional).
- Para cada acción propuesta, indicar qué tool ejecutarías (sin ejecutar aún). Espero confirmación antes de crear/modificar nada.

Idioma: español. Formato: markdown. Nada de emojis.
```

## Patrón para pedir acciones después de la auditoría

Cuando el usuario apruebe una recomendación:

1. Crear contenido → `wp_create_post` o `wp_create_page` con `status: "draft"` **siempre**.
2. Usuario revisa draft en WP Admin.
3. Si aprueba → `wp_update_post` con `status: "publish"`.

Nunca saltarse el paso de draft.

## Debugging

| Síntoma | Causa probable |
|---|---|
| 401 Unauthorized | Application Password rota/caducada — regenerar en WP Admin |
| 404 en `/wp-json/` | REST API deshabilitada por plugin de seguridad (Wordfence, iThemes) |
| 403 Forbidden | Plugin de firewall bloquea la IP de Vercel — whitelist `*.vercel.app` |
| 500 en `/settings` | Usuario sin rol admin; las app passwords heredan permisos del user |
| Timeouts | Hosting compartido lento; subir timeout del cliente en `wordpress.ts` |
