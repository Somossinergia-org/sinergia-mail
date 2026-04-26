import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConfiguredSites, getWpClient } from "@/lib/agent/wordpress";

export const dynamic = "force-dynamic";

/**
 * GET /api/wordpress
 * Query: action=sites|posts|pages|plugins|themes|settings|search
 *        siteId=1|2|3  (required for all except action=sites)
 *        id=123         (for single item)
 *        search=query   (for search action)
 *        status=draft|publish
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "sites";
  const siteId = sp.get("siteId") || "1";

  try {
    if (action === "sites") {
      const sites = getConfiguredSites();
      return NextResponse.json({
        sites: sites.map((s) => ({ id: s.id, label: s.label, url: s.url })),
        total: sites.length,
      });
    }

    const wp = getWpClient(siteId);
    const id = sp.get("id");
    const status = sp.get("status");

    switch (action) {
      case "posts": {
        if (id) return NextResponse.json(await wp.posts.get(Number(id)));
        const params: Record<string, string> = {};
        if (status) params.status = status;
        return NextResponse.json(await wp.posts.list(params));
      }
      case "pages": {
        if (id) return NextResponse.json(await wp.pages.get(Number(id)));
        return NextResponse.json(await wp.pages.list());
      }
      case "plugins":
        return NextResponse.json(await wp.plugins.list());
      case "themes":
        return NextResponse.json(await wp.themes.list());
      case "settings":
        return NextResponse.json(await wp.settings.get());
      case "search": {
        const query = sp.get("search") || "";
        const type = (sp.get("type") as "post" | "page") || "post";
        return NextResponse.json(await wp.search(query, type));
      }
      case "media":
        return NextResponse.json(await wp.media.list());
      case "categories":
        return NextResponse.json(await wp.categories.list());
      case "tags":
        return NextResponse.json(await wp.tags.list());
      default:
        return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[WP] GET error:", err);
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/wordpress
 * Body: { action, siteId, ...data }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, siteId = "1", ...data } = body;
    const wp = getWpClient(siteId);

    switch (action) {
      case "create_post":
        return NextResponse.json(await wp.posts.create(data));
      case "update_post":
        return NextResponse.json(await wp.posts.update(data.id, data));
      case "delete_post":
        return NextResponse.json(await wp.posts.delete(data.id));
      case "create_page":
        return NextResponse.json(await wp.pages.create(data));
      case "update_page":
        return NextResponse.json(await wp.pages.update(data.id, data));
      case "delete_page":
        return NextResponse.json(await wp.pages.delete(data.id));
      case "activate_plugin":
        return NextResponse.json(await wp.plugins.activate(data.plugin));
      case "deactivate_plugin":
        return NextResponse.json(await wp.plugins.deactivate(data.plugin));
      case "activate_theme":
        return NextResponse.json(await wp.themes.activate(data.stylesheet));
      case "update_settings":
        return NextResponse.json(await wp.settings.update(data));
      case "upload_media":
        return NextResponse.json(await wp.media.uploadFromUrl(data.imageUrl, { title: data.filename, alt: data.altText, caption: data.caption }));
      case "create_category":
        return NextResponse.json(await wp.categories.create(data.name, { slug: data.slug, description: data.description, parent: data.parent }));
      case "create_tag":
        return NextResponse.json(await wp.tags.create(data.name, { slug: data.slug, description: data.description }));
      default:
        return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[WP] POST error:", err);
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
