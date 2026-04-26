/**
 * WordPress REST API Integration — Full control for AI agents.
 *
 * Supports 1-3 WP sites via environment variables.
 * Each site needs: URL + Application Password (base64 user:pass).
 *
 * Env vars pattern:
 *   WP_SITE_1_URL=https://ejemplo.com
 *   WP_SITE_1_USER=admin
 *   WP_SITE_1_APP_PASSWORD=xxxx xxxx xxxx xxxx
 *   WP_SITE_1_LABEL=Web principal
 *
 * Usage: const wp = getWpClient("1"); wp.posts.list();
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface WpSiteConfig {
  id: string;
  url: string;
  user: string;
  appPassword: string;
  label: string;
}

export interface WpPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  status: string;
  slug: string;
  date: string;
  modified: string;
  link: string;
  categories: number[];
  tags: number[];
  featured_media: number;
}

export interface WpPage {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  status: string;
  slug: string;
  link: string;
  parent: number;
  menu_order: number;
}

export interface WpMedia {
  id: number;
  title: { rendered: string };
  source_url: string;
  mime_type: string;
  media_details: { width: number; height: number; file: string };
}

export interface WpPlugin {
  plugin: string;
  name: string;
  status: "active" | "inactive";
  version: string;
  description: { raw: string };
}

export interface WpTheme {
  stylesheet: string;
  name: { raw: string };
  status: "active" | "inactive";
  version: string;
}

export interface WpUser {
  id: number;
  username: string;
  name: string;
  email: string;
  roles: string[];
}

export interface WpSettings {
  title: string;
  description: string;
  url: string;
  timezone_string: string;
  date_format: string;
  time_format: string;
  language: string;
}

// ─── Site Discovery ───────────────────────────────────────────────────

export function getConfiguredSites(): WpSiteConfig[] {
  const sites: WpSiteConfig[] = [];
  for (let i = 1; i <= 3; i++) {
    const url = process.env[`WP_SITE_${i}_URL`];
    const user = process.env[`WP_SITE_${i}_USER`];
    const pass = process.env[`WP_SITE_${i}_APP_PASSWORD`];
    const label = process.env[`WP_SITE_${i}_LABEL`] || `Sitio ${i}`;
    if (url && user && pass) {
      sites.push({ id: String(i), url: url.replace(/\/$/, ""), user, appPassword: pass, label });
    }
  }
  return sites;
}

export function getSiteConfig(siteId: string): WpSiteConfig | null {
  return getConfiguredSites().find((s) => s.id === siteId) ?? null;
}

// ─── HTTP Client ──────────────────────────────────────────────────────

class WpApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: WpSiteConfig) {
    this.baseUrl = `${config.url}/wp-json`;
    // WordPress Application Passwords use Basic Auth (base64 user:apppassword)
    const token = Buffer.from(`${config.user}:${config.appPassword}`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  private async request<T>(
    endpoint: string,
    options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
  ): Promise<T> {
    const { method = "GET", body, params } = options;
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "User-Agent": "SinergiaAgent/1.0",
    };
    if (body && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`WP API ${method} ${endpoint} → ${res.status}: ${errorBody.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Posts ──

  posts = {
    list: (params?: Record<string, string>) =>
      this.request<WpPost[]>("/wp/v2/posts", { params: { per_page: "20", ...params } }),

    get: (id: number) => this.request<WpPost>(`/wp/v2/posts/${id}`),

    create: (data: {
      title: string;
      content: string;
      status?: "publish" | "draft" | "pending";
      categories?: number[];
      tags?: number[];
      featured_media?: number;
    }) => this.request<WpPost>("/wp/v2/posts", { method: "POST", body: { status: "draft", ...data } }),

    update: (id: number, data: Partial<{
      title: string;
      content: string;
      status: string;
      categories: number[];
      tags: number[];
      featured_media: number;
    }>) => this.request<WpPost>(`/wp/v2/posts/${id}`, { method: "PUT", body: data }),

    delete: (id: number) =>
      this.request<{ deleted: boolean }>(`/wp/v2/posts/${id}`, { method: "DELETE", params: { force: "true" } }),
  };

  // ── Pages ──

  pages = {
    list: (params?: Record<string, string>) =>
      this.request<WpPage[]>("/wp/v2/pages", { params: { per_page: "50", ...params } }),

    get: (id: number) => this.request<WpPage>(`/wp/v2/pages/${id}`),

    create: (data: {
      title: string;
      content: string;
      status?: "publish" | "draft";
      parent?: number;
      menu_order?: number;
    }) => this.request<WpPage>("/wp/v2/pages", { method: "POST", body: { status: "draft", ...data } }),

    update: (id: number, data: Partial<{
      title: string;
      content: string;
      status: string;
      parent: number;
      menu_order: number;
    }>) => this.request<WpPage>(`/wp/v2/pages/${id}`, { method: "PUT", body: data }),

    delete: (id: number) =>
      this.request<{ deleted: boolean }>(`/wp/v2/pages/${id}`, { method: "DELETE", params: { force: "true" } }),
  };

  // ── Media ──

  media = {
    list: (params?: Record<string, string>) =>
      this.request<WpMedia[]>("/wp/v2/media", { params: { per_page: "20", ...params } }),

    get: (id: number) => this.request<WpMedia>(`/wp/v2/media/${id}`),

    /** Upload from URL — downloads the image and uploads to WP */
    uploadFromUrl: async (imageUrl: string, filename: string, altText?: string) => {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
      const blob = await imgRes.blob();

      const formData = new FormData();
      formData.append("file", blob, filename);
      if (altText) formData.append("alt_text", altText);

      return this.request<WpMedia>("/wp/v2/media", { method: "POST", body: formData });
    },

    delete: (id: number) =>
      this.request<{ deleted: boolean }>(`/wp/v2/media/${id}`, { method: "DELETE", params: { force: "true" } }),
  };

  // ── Categories & Tags ──

  categories = {
    list: () => this.request<Array<{ id: number; name: string; slug: string; count: number }>>(
      "/wp/v2/categories", { params: { per_page: "100" } },
    ),
    create: (data: { name: string; slug?: string; parent?: number }) =>
      this.request<{ id: number; name: string }>("/wp/v2/categories", { method: "POST", body: data }),
  };

  tags = {
    list: () => this.request<Array<{ id: number; name: string; slug: string; count: number }>>(
      "/wp/v2/tags", { params: { per_page: "100" } },
    ),
    create: (data: { name: string; slug?: string }) =>
      this.request<{ id: number; name: string }>("/wp/v2/tags", { method: "POST", body: data }),
  };

  // ── Plugins ──

  plugins = {
    list: () => this.request<WpPlugin[]>("/wp/v2/plugins"),

    get: (plugin: string) => this.request<WpPlugin>(`/wp/v2/plugins/${plugin.split("/").map(encodeURIComponent).join("/")}`),

    /**
     * Instalar plugin desde el directorio WordPress.org.
     * Requiere capability `install_plugins` (admin).
     * @param slug — slug del directorio (ej. "code-snippets", "wpcode")
     * @param activate — si true, activa tras instalar (default false → queda inactive)
     */
    install: (slug: string, activate = false) =>
      this.request<WpPlugin>("/wp/v2/plugins", {
        method: "POST",
        body: { slug, status: activate ? "active" : "inactive" },
      }),

    activate: (plugin: string) =>
      this.request<WpPlugin>(`/wp/v2/plugins/${plugin.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        body: { status: "active" },
      }),

    deactivate: (plugin: string) =>
      this.request<WpPlugin>(`/wp/v2/plugins/${plugin.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        body: { status: "inactive" },
      }),

    delete: (plugin: string) =>
      this.request<{ deleted: boolean }>(`/wp/v2/plugins/${plugin.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" }),
  };

  // ── Page HTML replace + utilidades de rediseño seguras ──

  /**
   * Reescribir el contenido HTML completo de una página.
   *
   * Salvaguardas automáticas:
   * - Rechaza HTML con secuencias `\n` literales sin escape (signo de que
   *   el caller pasó Markdown o JSON con escape mal hecho).
   * - Rechaza status="draft" si la página es la front_page del sitio
   *   (despublicar la home rompería el sitio público).
   * - Si `disableElementor=true`, limpia `_elementor_edit_mode`.
   *
   * El backup se hace DESDE FUERA con `getPage(id)` antes de llamar.
   */
  replacePageHTML = async (
    pageId: number,
    html: string,
    opts: { disableElementor?: boolean; status?: "publish" | "draft" } = {},
  ) => {
    if (/\\n|\\r/.test(html) && !html.includes("\n")) {
      throw new Error(
        "wp_replace_page_html: el HTML contiene `\\n` o `\\r` literales sin saltos de línea reales. " +
          "Probablemente pasaste Markdown o un string JSON con escape doble. Pasa HTML real con tags <p>, <h1>, <div>, etc.",
      );
    }

    if (opts.status === "draft") {
      const settings = await this.request<{ page_on_front?: number; show_on_front?: string }>(
        "/wp/v2/settings",
      );
      if (settings.show_on_front === "page" && settings.page_on_front === pageId) {
        throw new Error(
          `wp_replace_page_html: la página ${pageId} está configurada como front_page del sitio. ` +
            "Si la pones en draft, la home pública dará 404. Usa wp_clone_page primero o mantén status='publish'.",
        );
      }
    }

    return this.request<WpPage>(`/wp/v2/pages/${pageId}`, {
      method: "PUT",
      body: {
        content: html,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.disableElementor ? { meta: { _elementor_edit_mode: "" } } : {}),
      },
    });
  };

  /**
   * Devuelve el contenido completo de una página (HTML renderizado + raw + meta).
   * Úsalo ANTES de wp_replace_page_html para tener backup.
   */
  getPageFull = (pageId: number) =>
    this.request<WpPage & { content: { rendered: string; raw: string }; meta?: Record<string, unknown> }>(
      `/wp/v2/pages/${pageId}`,
      { params: { context: "edit" } },
    );

  /**
   * Clona una página existente como nueva página en estado `draft`.
   * Útil para iterar diseños sin tocar la página viva.
   */
  clonePage = async (
    pageId: number,
    opts: { newTitle?: string } = {},
  ) => {
    const original = await this.getPageFull(pageId);
    const titleText =
      opts.newTitle ||
      (typeof original.title === "string" ? original.title : original.title.rendered) + " (clon)";
    return this.request<WpPage>("/wp/v2/pages", {
      method: "POST",
      body: {
        title: titleText,
        content: original.content.raw,
        status: "draft",
        parent: original.parent,
        menu_order: original.menu_order,
      },
    });
  };

  /**
   * Lista las revisiones de una página y restaura una concreta.
   * Si no se pasa `revisionId`, restaura la última revisión disponible.
   */
  revertPage = async (pageId: number, revisionId?: number) => {
    const revisions = await this.request<Array<{ id: number; date: string; content?: { raw: string } }>>(
      `/wp/v2/pages/${pageId}/revisions`,
      { params: { per_page: "10", context: "edit" } },
    );
    if (!revisions.length) {
      throw new Error(`wp_revert_page: no hay revisiones disponibles para la página ${pageId}.`);
    }
    const target = revisionId
      ? revisions.find((r) => r.id === revisionId)
      : revisions[0]; // la más reciente
    if (!target) {
      throw new Error(`wp_revert_page: revisión ${revisionId} no encontrada.`);
    }
    if (!target.content?.raw) {
      throw new Error(`wp_revert_page: la revisión ${target.id} no expone contenido raw.`);
    }
    return this.request<WpPage>(`/wp/v2/pages/${pageId}`, {
      method: "PUT",
      body: { content: target.content.raw, status: "publish" },
    });
  };

  // ── Custom CSS site-wide ──
  // Ningun endpoint REST core de WP cubre Customizer Additional CSS.
  // Probamos en orden: Code Snippets → WPCode Lite → Astra theme custom CSS.
  // Si ninguno funciona, devuelve un error indicando qué plugin instalar.

  customCss = {
    /**
     * Escribe CSS site-wide. Usa Code Snippets plugin (v3+) — único que
     * acepta Application Password vía REST de forma fiable.
     *
     * Endpoint: /wp-json/code-snippets/v1/snippets (v1 es la versión REST
     * actual del plugin, no confundir con la versión 3.x del plugin en sí).
     *
     * Schema relevante (v3.x):
     *   - scope: "site-css" → CSS aplicado al frontend en <head>
     *   - active: true / false (1 / 0 según versión)
     *   - code: contenido literal
     *   - name: título visible
     *
     * Update: el endpoint de update es POST con id en path (no PUT).
     */
    set: async (
      css: string,
      snippetTitle = "Sinergia Custom CSS",
    ): Promise<{ provider: string; id: number | string; action: "created" | "updated" }> => {
      // Diagnóstico: agrupamos errores por proveedor para devolverlos al
      // agente si todo falla; el agente puede entonces saber qué arreglar.
      const errors: Array<{ provider: string; step: string; err: string }> = [];

      // ── Code Snippets v3+ con REST v1 ───────────────────────────────
      try {
        const snippets = await this.request<Array<{ id: number; name: string; scope?: string }>>(
          "/code-snippets/v1/snippets",
        );
        const existing = snippets.find((s) => s.name === snippetTitle);

        const payload = {
          name: snippetTitle,
          code: css,
          scope: "site-css",
          active: true,
        };

        if (existing) {
          // Update: POST a /snippets/{id}
          await this.request(`/code-snippets/v1/snippets/${existing.id}`, {
            method: "POST",
            body: payload,
          });
          return { provider: "code-snippets", id: existing.id, action: "updated" };
        }

        const created = await this.request<{ id: number }>("/code-snippets/v1/snippets", {
          method: "POST",
          body: payload,
        });
        return { provider: "code-snippets", id: created.id, action: "created" };
      } catch (e) {
        errors.push({
          provider: "code-snippets",
          step: "v1/snippets",
          err: e instanceof Error ? e.message : "unknown",
        });
      }

      // ── Fallback: SiteOrigin CSS (siteorigin-css) ────────────────────
      // Si alguien tiene este plugin instalado, usa option-based storage.
      try {
        const created = await this.request<{ updated: boolean }>(
          "/wp/v2/settings",
          {
            method: "POST",
            body: { siteorigin_custom_css: css } as Record<string, unknown>,
          },
        );
        return { provider: "siteorigin-css", id: "settings", action: "updated" };
      } catch (e) {
        errors.push({
          provider: "siteorigin-css",
          step: "wp/v2/settings",
          err: e instanceof Error ? e.message : "unknown",
        });
      }

      throw new Error(
        "wp_set_custom_css falló — diagnóstico por proveedor: " +
          JSON.stringify(errors) +
          ". Confirma que Code Snippets v3+ esté activo (visita /wp-admin/admin.php?page=snippets) o instálalo con wp_install_plugin('code-snippets', true).",
      );
    },
  };

  // ── Themes ──

  themes = {
    list: () => this.request<WpTheme[]>("/wp/v2/themes"),

    activate: (stylesheet: string) =>
      this.request<WpTheme>(`/wp/v2/themes/${encodeURIComponent(stylesheet)}`, {
        method: "PUT",
        body: { status: "active" },
      }),
  };

  // ── Users ──

  users = {
    list: () => this.request<WpUser[]>("/wp/v2/users", { params: { per_page: "50" } }),

    get: (id: number) => this.request<WpUser>(`/wp/v2/users/${id}`),

    create: (data: {
      username: string;
      email: string;
      password: string;
      roles?: string[];
      name?: string;
    }) => this.request<WpUser>("/wp/v2/users", { method: "POST", body: data }),

    update: (id: number, data: Partial<{ name: string; email: string; roles: string[] }>) =>
      this.request<WpUser>(`/wp/v2/users/${id}`, { method: "PUT", body: data }),
  };

  // ── Settings ──

  settings = {
    get: () => this.request<WpSettings>("/wp/v2/settings"),

    update: (data: Partial<WpSettings>) =>
      this.request<WpSettings>("/wp/v2/settings", { method: "PUT", body: data }),
  };

  // ── Search ──

  search = (query: string, type: "post" | "page" | "category" | "tag" = "post") =>
    this.request<Array<{ id: number; title: string; url: string; type: string }>>(
      "/wp/v2/search",
      { params: { search: query, type, per_page: "10" } },
    );

  // ── Site Health (WP 5.2+) ──

  health = async () => {
    try {
      const info = await this.request<Record<string, unknown>>("/wp-site-health/v1/tests/background-updates");
      return { available: true, info };
    } catch {
      return { available: false, info: null };
    }
  };
}

// ─── Factory ──────────────────────────────────────────────────────────

const clientCache = new Map<string, WpApiClient>();

export function getWpClient(siteId: string): WpApiClient {
  const cached = clientCache.get(siteId);
  if (cached) return cached;

  const config = getSiteConfig(siteId);
  if (!config) throw new Error(`WordPress site "${siteId}" not configured. Check WP_SITE_${siteId}_* env vars.`);

  const client = new WpApiClient(config);
  clientCache.set(siteId, client);
  return client;
}

// ─── Agent Tool Definitions ───────────────────────────────────────────

/**
 * Tool definitions for the AI agent swarm.
 * Register these in the agent's tool list so it can call WordPress functions.
 */
export const WP_AGENT_TOOLS = [
  {
    name: "wp_list_sites",
    description: "List all configured WordPress sites",
    parameters: {},
    execute: async () => {
      const sites = getConfiguredSites();
      return sites.map((s) => ({ id: s.id, label: s.label, url: s.url }));
    },
  },
  {
    name: "wp_list_posts",
    description: "List recent posts from a WordPress site",
    parameters: { siteId: "string", status: "string?" },
    execute: async (args: { siteId: string; status?: string }) => {
      const wp = getWpClient(args.siteId);
      const params: Record<string, string> = {};
      if (args.status) params.status = args.status;
      return wp.posts.list(params);
    },
  },
  {
    name: "wp_create_post",
    description: "Create a new post (draft by default) on a WordPress site",
    parameters: { siteId: "string", title: "string", content: "string", status: "string?" },
    execute: async (args: { siteId: string; title: string; content: string; status?: string }) => {
      const wp = getWpClient(args.siteId);
      return wp.posts.create({
        title: args.title,
        content: args.content,
        status: (args.status as "publish" | "draft") || "draft",
      });
    },
  },
  {
    name: "wp_update_post",
    description: "Update an existing post on a WordPress site",
    parameters: { siteId: "string", postId: "number", title: "string?", content: "string?", status: "string?" },
    execute: async (args: { siteId: string; postId: number; title?: string; content?: string; status?: string }) => {
      const wp = getWpClient(args.siteId);
      const data: Record<string, unknown> = {};
      if (args.title) data.title = args.title;
      if (args.content) data.content = args.content;
      if (args.status) data.status = args.status;
      return wp.posts.update(args.postId, data);
    },
  },
  {
    name: "wp_list_pages",
    description: "List all pages from a WordPress site",
    parameters: { siteId: "string" },
    execute: async (args: { siteId: string }) => {
      const wp = getWpClient(args.siteId);
      return wp.pages.list();
    },
  },
  {
    name: "wp_create_page",
    description: "Create a new page on a WordPress site",
    parameters: { siteId: "string", title: "string", content: "string", status: "string?" },
    execute: async (args: { siteId: string; title: string; content: string; status?: string }) => {
      const wp = getWpClient(args.siteId);
      return wp.pages.create({
        title: args.title,
        content: args.content,
        status: (args.status as "publish" | "draft") || "draft",
      });
    },
  },
  {
    name: "wp_update_page",
    description: "Update an existing page on a WordPress site",
    parameters: { siteId: "string", pageId: "number", title: "string?", content: "string?", status: "string?" },
    execute: async (args: { siteId: string; pageId: number; title?: string; content?: string; status?: string }) => {
      const wp = getWpClient(args.siteId);
      const data: Record<string, unknown> = {};
      if (args.title) data.title = args.title;
      if (args.content) data.content = args.content;
      if (args.status) data.status = args.status;
      return wp.pages.update(args.pageId, data);
    },
  },
  {
    name: "wp_list_plugins",
    description: "List installed plugins on a WordPress site",
    parameters: { siteId: "string" },
    execute: async (args: { siteId: string }) => {
      const wp = getWpClient(args.siteId);
      return wp.plugins.list();
    },
  },
  {
    name: "wp_toggle_plugin",
    description: "Activate or deactivate a plugin",
    parameters: { siteId: "string", plugin: "string", activate: "boolean" },
    execute: async (args: { siteId: string; plugin: string; activate: boolean }) => {
      const wp = getWpClient(args.siteId);
      return args.activate ? wp.plugins.activate(args.plugin) : wp.plugins.deactivate(args.plugin);
    },
  },
  {
    name: "wp_list_themes",
    description: "List installed themes on a WordPress site",
    parameters: { siteId: "string" },
    execute: async (args: { siteId: string }) => {
      const wp = getWpClient(args.siteId);
      return wp.themes.list();
    },
  },
  {
    name: "wp_get_settings",
    description: "Get WordPress site settings (title, description, timezone, etc.)",
    parameters: { siteId: "string" },
    execute: async (args: { siteId: string }) => {
      const wp = getWpClient(args.siteId);
      return wp.settings.get();
    },
  },
  {
    name: "wp_update_settings",
    description:
      "Update WordPress site settings. Soporta: title, description (tagline), show_on_front ('page'|'posts'), page_on_front (id), page_for_posts (id), default_category, default_post_format, posts_per_page, timezone_string, language. NUNCA cambiar 'url' o 'siteurl' — desconecta la instalación.",
    parameters: {
      siteId: "string",
      title: "string?",
      description: "string?",
      show_on_front: "string?",
      page_on_front: "number?",
      page_for_posts: "number?",
      posts_per_page: "number?",
      timezone_string: "string?",
      language: "string?",
    },
    execute: async (args: {
      siteId: string;
      title?: string;
      description?: string;
      show_on_front?: string;
      page_on_front?: number;
      page_for_posts?: number;
      posts_per_page?: number;
      timezone_string?: string;
      language?: string;
    }) => {
      const wp = getWpClient(args.siteId);
      const data: Record<string, unknown> = {};
      if (args.title !== undefined) data.title = args.title;
      if (args.description !== undefined) data.description = args.description;
      if (args.show_on_front !== undefined) data.show_on_front = args.show_on_front;
      if (args.page_on_front !== undefined) data.page_on_front = args.page_on_front;
      if (args.page_for_posts !== undefined) data.page_for_posts = args.page_for_posts;
      if (args.posts_per_page !== undefined) data.posts_per_page = args.posts_per_page;
      if (args.timezone_string !== undefined) data.timezone_string = args.timezone_string;
      if (args.language !== undefined) data.language = args.language;
      return wp.settings.update(data);
    },
  },
  {
    name: "wp_search",
    description: "Search content across a WordPress site",
    parameters: { siteId: "string", query: "string", type: "string?" },
    execute: async (args: { siteId: string; query: string; type?: string }) => {
      const wp = getWpClient(args.siteId);
      return wp.search(args.query, (args.type as "post" | "page") || "post");
    },
  },
];
