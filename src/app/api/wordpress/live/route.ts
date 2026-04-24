import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getWpClient, getConfiguredSites } from "@/lib/agent/wordpress";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────

interface WpLiveStep {
  step: number;
  total: number;
  action: string;
  detail: string;
  status: "running" | "done" | "error";
  agentId: string;
  timestamp: string;
}

// ─── SSE Helpers ──────────────────────────────────────────────────────

function serializeStep(step: WpLiveStep): string {
  return `data: ${JSON.stringify(step)}\n\n`;
}

function serializeDone(summary: string): string {
  return `data: ${JSON.stringify({ type: "complete", summary, timestamp: new Date().toISOString() })}\n\n`;
}

function serializeErr(message: string): string {
  return `data: ${JSON.stringify({ type: "error", message, timestamp: new Date().toISOString() })}\n\n`;
}

// ─── Audit helper ─────────────────────────────────────────────────────

function emitAudit(agentId: string, action: string, detail: string, result: "success" | "info") {
  try {
    auditLog.emit({
      eventType: "tool_called",
      result,
      agentId,
      agentLayer: "modulo-interno",
      userId: "system",
      toolName: `wp_live_${action}`,
      reason: detail,
      metadata: { source: "wordpress-live", action },
    });
  } catch {
    // Non-blocking
  }
}

// ─── Action Executors ─────────────────────────────────────────────────

type StepEmitter = (action: string, detail: string, status?: "running" | "done" | "error") => void;

async function executeModernizeHomepage(
  siteId: string,
  emit: StepEmitter,
): Promise<string> {
  const wp = getWpClient(siteId);

  // Step 1: Fetch current pages
  emit("Analizando sitio", "Obteniendo listado de páginas actuales...");
  const pages = await wp.pages.list();
  emit("Analizando sitio", `Encontradas ${pages.length} páginas`, "done");

  // Step 2: Find the homepage
  emit("Buscando página de inicio", "Identificando la página principal...");
  const homepage = pages.find(
    (p) =>
      p.slug === "inicio" ||
      p.slug === "home" ||
      p.slug === "portada" ||
      p.title?.rendered?.toLowerCase().includes("inicio"),
  ) || pages.find((p) => p.slug === "sample-page") || pages[0];

  if (!homepage) {
    emit("Error", "No se encontró página de inicio", "error");
    throw new Error("No homepage found");
  }
  emit("Buscando página de inicio", `Página: "${homepage.title?.rendered}" (ID: ${homepage.id})`, "done");

  // Step 3: Fetch settings
  emit("Leyendo configuración", "Obteniendo datos del sitio...");
  const settings = await wp.settings.get();
  emit("Leyendo configuración", `Sitio: ${settings.title}`, "done");

  // Step 4: Build new content
  emit("Diseñando nuevo contenido", "Generando hero y secciones de servicios...");

  const modernContent = buildModernHomepageContent();
  emit("Diseñando nuevo contenido", "Contenido con 8 secciones de servicios generado", "done");

  // Step 5: Update the page
  emit("Actualizando página", `Aplicando contenido moderno a "${homepage.title?.rendered}"...`);
  await wp.pages.update(homepage.id, {
    content: modernContent,
  });
  emit("Actualizando página", "Contenido actualizado en WordPress", "done");

  // Step 6: Verify
  emit("Verificando cambios", "Comprobando que la página se actualizó correctamente...");
  const updated = await wp.pages.get(homepage.id);
  const success = updated.content?.rendered?.includes("sinergia-hero");
  emit(
    "Verificando cambios",
    success ? "Página verificada correctamente" : "Página actualizada (verificar manualmente)",
    "done",
  );

  return `Homepage modernizada: ${updated.link}`;
}

async function executeCreatePost(
  siteId: string,
  data: { title: string; content: string; status?: string },
  emit: StepEmitter,
): Promise<string> {
  const wp = getWpClient(siteId);

  emit("Preparando post", `Creando: "${data.title}"...`);
  const post = await wp.posts.create({
    title: data.title,
    content: data.content,
    status: (data.status as "publish" | "draft") || "draft",
  });
  emit("Post creado", `ID: ${post.id} — ${post.link}`, "done");

  return `Post creado: ${post.title.rendered} (${post.link})`;
}

async function executeUpdateCSS(
  siteId: string,
  css: string,
  emit: StepEmitter,
): Promise<string> {
  emit("Preparando CSS", "CSS personalizado listo para inyectar...");
  // Note: CSS injection via REST has limitations with classic themes
  // This creates a post with the CSS for reference
  const wp = getWpClient(siteId);
  const post = await wp.posts.create({
    title: `[CSS] Actualización de estilo - ${new Date().toLocaleDateString("es-ES")}`,
    content: `<pre><code>${css}</code></pre>`,
    status: "draft",
  });
  emit("CSS guardado", `Referencia CSS guardada como borrador (ID: ${post.id})`, "done");

  return `CSS guardado como referencia en post borrador ID: ${post.id}`;
}

async function executeListContent(
  siteId: string,
  emit: StepEmitter,
): Promise<string> {
  const wp = getWpClient(siteId);

  emit("Obteniendo posts", "Listando artículos recientes...");
  const posts = await wp.posts.list();
  emit("Posts obtenidos", `${posts.length} posts encontrados`, "done");

  emit("Obteniendo páginas", "Listando páginas del sitio...");
  const pages = await wp.pages.list();
  emit("Páginas obtenidas", `${pages.length} páginas encontradas`, "done");

  emit("Obteniendo plugins", "Comprobando plugins instalados...");
  const plugins = await wp.plugins.list();
  const activePlugins = plugins.filter((p) => p.status === "active");
  emit("Plugins obtenidos", `${activePlugins.length} activos de ${plugins.length} total`, "done");

  return `Sitio: ${posts.length} posts, ${pages.length} páginas, ${activePlugins.length} plugins activos`;
}

// ─── Modern Homepage Content Builder ──────────────────────────────────

function buildModernHomepageContent(): string {
  return `
<!-- SINERGIA MODERN HOMEPAGE — Generated by AI Agent -->
<style>
  .sinergia-hero {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
    color: #fff;
    padding: 80px 20px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .sinergia-hero::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at 30% 50%, rgba(99,102,241,0.15) 0%, transparent 50%),
                radial-gradient(circle at 70% 50%, rgba(249,115,22,0.1) 0%, transparent 50%);
    animation: heroGlow 8s ease-in-out infinite alternate;
  }
  @keyframes heroGlow {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(3deg); }
  }
  .sinergia-hero h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 800;
    margin-bottom: 16px;
    position: relative;
    z-index: 1;
  }
  .sinergia-hero h1 span {
    background: linear-gradient(135deg, #f97316, #fb923c);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .sinergia-hero p {
    font-size: 1.2rem;
    color: #94a3b8;
    max-width: 700px;
    margin: 0 auto 32px;
    position: relative;
    z-index: 1;
  }
  .sinergia-hero .hero-stats {
    display: flex;
    justify-content: center;
    gap: 40px;
    flex-wrap: wrap;
    position: relative;
    z-index: 1;
  }
  .sinergia-hero .hero-stat {
    text-align: center;
  }
  .sinergia-hero .hero-stat .number {
    font-size: 2.5rem;
    font-weight: 800;
    color: #f97316;
  }
  .sinergia-hero .hero-stat .label {
    font-size: 0.85rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .sinergia-cta-btn {
    display: inline-block;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff !important;
    padding: 16px 40px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 1.1rem;
    text-decoration: none !important;
    margin: 24px 8px 40px;
    transition: all 0.3s ease;
    position: relative;
    z-index: 1;
    box-shadow: 0 4px 20px rgba(249,115,22,0.3);
  }
  .sinergia-cta-btn:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 30px rgba(249,115,22,0.4);
  }
  .sinergia-cta-btn.secondary {
    background: transparent;
    border: 2px solid rgba(255,255,255,0.3);
    box-shadow: none;
  }
  .sinergia-cta-btn.secondary:hover {
    border-color: #f97316;
    box-shadow: 0 4px 20px rgba(249,115,22,0.2);
  }

  /* Services Grid */
  .sinergia-services {
    padding: 80px 20px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .sinergia-services h2 {
    text-align: center;
    font-size: 2.2rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 12px;
  }
  .sinergia-services .subtitle {
    text-align: center;
    color: #64748b;
    font-size: 1.1rem;
    margin-bottom: 48px;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }
  .services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
  }
  .service-card {
    background: #fff;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    transition: all 0.3s ease;
    border: 1px solid #f1f5f9;
    position: relative;
    overflow: hidden;
  }
  .service-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--card-accent, #f97316);
  }
  .service-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.1);
  }
  .service-card .service-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    margin-bottom: 20px;
    background: var(--card-bg, #fff7ed);
  }
  .service-card h3 {
    font-size: 1.3rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 8px;
  }
  .service-card p {
    color: #64748b;
    font-size: 0.95rem;
    line-height: 1.6;
    margin-bottom: 16px;
  }
  .service-card .saving-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #ecfdf5;
    color: #059669;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  /* Why Us Section */
  .sinergia-why {
    background: #f8fafc;
    padding: 80px 20px;
  }
  .sinergia-why .inner {
    max-width: 1000px;
    margin: 0 auto;
    text-align: center;
  }
  .sinergia-why h2 {
    font-size: 2.2rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 48px;
  }
  .why-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 32px;
    text-align: center;
  }
  .why-item .why-number {
    font-size: 2.5rem;
    font-weight: 800;
    color: #f97316;
    margin-bottom: 8px;
  }
  .why-item h4 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 8px;
  }
  .why-item p {
    color: #64748b;
    font-size: 0.9rem;
  }

  /* CTA Section */
  .sinergia-cta-section {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    padding: 80px 20px;
    text-align: center;
    color: #fff;
  }
  .sinergia-cta-section h2 {
    font-size: 2rem;
    font-weight: 800;
    margin-bottom: 16px;
  }
  .sinergia-cta-section p {
    color: #94a3b8;
    font-size: 1.1rem;
    margin-bottom: 32px;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }
</style>

<!-- HERO -->
<div class="sinergia-hero">
  <h1>Tu empresa merece <span>Sinergia</span></h1>
  <p>Todos los servicios que tu empresa necesita en un solo lugar. Ahorra en cada factura mientras potencias tu negocio con las últimas tecnologías.</p>
  <a href="/contacto" class="sinergia-cta-btn">Solicita tu Estudio Gratuito</a>
  <a href="#servicios" class="sinergia-cta-btn secondary">Ver Servicios</a>
  <div class="hero-stats">
    <div class="hero-stat">
      <div class="number">35%</div>
      <div class="label">Ahorro Medio</div>
    </div>
    <div class="hero-stat">
      <div class="number">500+</div>
      <div class="label">Empresas Confían</div>
    </div>
    <div class="hero-stat">
      <div class="number">24/7</div>
      <div class="label">Soporte IA</div>
    </div>
    <div class="hero-stat">
      <div class="number">8</div>
      <div class="label">Servicios</div>
    </div>
  </div>
</div>

<!-- SERVICIOS -->
<div id="servicios" class="sinergia-services">
  <h2>Nuestros Servicios</h2>
  <p class="subtitle">Cada servicio optimizado con inteligencia artificial para maximizar tu ahorro y productividad</p>

  <div class="services-grid">
    <!-- Energía -->
    <div class="service-card" style="--card-accent: #f97316; --card-bg: #fff7ed;">
      <div class="service-icon" style="background: #fff7ed;">⚡</div>
      <h3>Energía (Luz y Gas)</h3>
      <p>Comparamos y optimizamos tu tarifa energética entre todas las comercializadoras. Auditoría de consumo inteligente con IA para detectar ineficiencias.</p>
      <span class="saving-badge">💰 Ahorro hasta 40% en factura</span>
    </div>

    <!-- Telefonía -->
    <div class="service-card" style="--card-accent: #3b82f6; --card-bg: #eff6ff;">
      <div class="service-icon" style="background: #eff6ff;">📱</div>
      <h3>Telefonía e Internet</h3>
      <p>Fibra, móvil y centralita virtual para empresas. Tarifas negociadas en exclusiva con los principales operadores nacionales.</p>
      <span class="saving-badge">💰 Ahorro hasta 30% mensual</span>
    </div>

    <!-- Seguros -->
    <div class="service-card" style="--card-accent: #10b981; --card-bg: #ecfdf5;">
      <div class="service-icon" style="background: #ecfdf5;">🛡️</div>
      <h3>Seguros Empresariales</h3>
      <p>Seguros de responsabilidad civil, salud, vida y multirriesgo. Mediación independiente para encontrar la mejor cobertura al mejor precio.</p>
      <span class="saving-badge">💰 Ahorro hasta 25% en primas</span>
    </div>

    <!-- IA y Automatización -->
    <div class="service-card" style="--card-accent: #8b5cf6; --card-bg: #f5f3ff;">
      <div class="service-icon" style="background: #f5f3ff;">🤖</div>
      <h3>Inteligencia Artificial</h3>
      <p>Agentes IA que atienden clientes, clasifican emails, generan informes y automatizan tareas repetitivas. Tu oficina virtual inteligente 24/7.</p>
      <span class="saving-badge">⏱️ Ahorra 20h/semana</span>
    </div>

    <!-- Marketing Digital -->
    <div class="service-card" style="--card-accent: #ec4899; --card-bg: #fdf2f8;">
      <div class="service-icon" style="background: #fdf2f8;">📣</div>
      <h3>Marketing Digital</h3>
      <p>Campañas automatizadas, email marketing, SEO y gestión de redes sociales potenciados por IA. Resultados medibles desde el primer mes.</p>
      <span class="saving-badge">📈 +60% leads cualificados</span>
    </div>

    <!-- Consultoría Digital -->
    <div class="service-card" style="--card-accent: #06b6d4; --card-bg: #ecfeff;">
      <div class="service-icon" style="background: #ecfeff;">💻</div>
      <h3>Consultoría Digital</h3>
      <p>Transformación digital integral: CRM, ERP, web corporativa, apps y automatización de procesos. Te acompañamos en cada paso.</p>
      <span class="saving-badge">🚀 Digitalización completa</span>
    </div>

    <!-- Asesoría Fiscal -->
    <div class="service-card" style="--card-accent: #f59e0b; --card-bg: #fffbeb;">
      <div class="service-icon" style="background: #fffbeb;">📊</div>
      <h3>Asesoría y Facturación</h3>
      <p>Facturación electrónica automatizada, contabilidad inteligente y asesoría fiscal. Cumplimiento normativo sin preocupaciones.</p>
      <span class="saving-badge">✅ 100% automatizado</span>
    </div>

    <!-- RGPD y Legal -->
    <div class="service-card" style="--card-accent: #ef4444; --card-bg: #fef2f2;">
      <div class="service-icon" style="background: #fef2f2;">⚖️</div>
      <h3>RGPD y Legal</h3>
      <p>Adaptación completa a la normativa de protección de datos. Contratos, políticas de privacidad y auditorías de cumplimiento legal.</p>
      <span class="saving-badge">🔒 Cumplimiento garantizado</span>
    </div>
  </div>
</div>

<!-- POR QUÉ NOSOTROS -->
<div class="sinergia-why">
  <div class="inner">
    <h2>¿Por qué Somos Sinergia?</h2>
    <div class="why-grid">
      <div class="why-item">
        <div class="why-number">1</div>
        <h4>Un Solo Interlocutor</h4>
        <p>Gestiona todos tus servicios desde un único punto de contacto. Sin perder tiempo con múltiples proveedores.</p>
      </div>
      <div class="why-item">
        <div class="why-number">IA</div>
        <h4>Potenciado con IA</h4>
        <p>Nuestra oficina virtual con 10 agentes IA trabaja para ti 24/7, optimizando cada aspecto de tu negocio.</p>
      </div>
      <div class="why-item">
        <div class="why-number">0€</div>
        <h4>Estudio Gratuito</h4>
        <p>Analizamos tus facturas y procesos sin compromiso. Solo pagas si realmente ahorras.</p>
      </div>
      <div class="why-item">
        <div class="why-number">100%</div>
        <h4>Independientes</h4>
        <p>No estamos vinculados a ninguna comercializadora. Buscamos siempre la mejor opción para ti.</p>
      </div>
    </div>
  </div>
</div>

<!-- CTA FINAL -->
<div class="sinergia-cta-section">
  <h2>¿Listo para ahorrar de verdad?</h2>
  <p>Solicita tu estudio gratuito y descubre cuánto puedes ahorrar en todos tus servicios empresariales.</p>
  <a href="/contacto" class="sinergia-cta-btn">Contactar Ahora</a>
  <a href="tel:+34966123456" class="sinergia-cta-btn secondary">📞 Llamar</a>
</div>
`;
}

// ─── Main POST Handler ────────────────────────────────────────────────

/**
 * POST /api/wordpress/live
 *
 * Body: { task: string, siteId?: string, data?: Record<string,unknown> }
 *
 * Tasks:
 *   - "modernize_homepage" — Rebuild homepage with modern content
 *   - "create_post" — Create a new post (data: { title, content, status })
 *   - "update_css" — Save CSS reference (data: { css })
 *   - "list_content" — List all content (posts, pages, plugins)
 *
 * Returns: SSE stream with step-by-step progress
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { task: string; siteId?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { task, siteId = "1", data = {} } = body;
  const agentId = "consultor-digital";
  const encoder = new TextEncoder();
  let closed = false;
  let stepNumber = 0;

  // Estimate total steps per task
  const totalSteps: Record<string, number> = {
    modernize_homepage: 6,
    create_post: 1,
    update_css: 1,
    list_content: 3,
  };

  const total = totalSteps[task] || 3;

  const stream = new ReadableStream({
    async start(controller) {
      function write(text: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      }

      const emit: StepEmitter = (action, detail, status = "running") => {
        if (status === "running") stepNumber++;
        const step: WpLiveStep = {
          step: stepNumber,
          total,
          action,
          detail,
          status,
          agentId,
          timestamp: new Date().toISOString(),
        };
        write(serializeStep(step));
        emitAudit(agentId, action, detail, status === "error" ? "info" : "success");
      };

      try {
        let summary: string;

        switch (task) {
          case "modernize_homepage":
            summary = await executeModernizeHomepage(siteId, emit);
            break;
          case "create_post":
            summary = await executeCreatePost(
              siteId,
              data as { title: string; content: string; status?: string },
              emit,
            );
            break;
          case "update_css":
            summary = await executeUpdateCSS(siteId, (data as { css: string }).css, emit);
            break;
          case "list_content":
            summary = await executeListContent(siteId, emit);
            break;
          default:
            emit("Error", `Tarea desconocida: ${task}`, "error");
            summary = `Error: tarea "${task}" no reconocida`;
        }

        write(serializeDone(summary));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        write(serializeErr(msg));
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  // Cleanup on client abort
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── GET: Available tasks ─────────────────────────────────────────────

export async function GET() {
  const sites = getConfiguredSites();
  return new Response(
    JSON.stringify({
      tasks: [
        { id: "modernize_homepage", label: "Modernizar Homepage", description: "Rediseña la página de inicio con todos los servicios" },
        { id: "create_post", label: "Crear Post", description: "Crea un nuevo artículo" },
        { id: "update_css", label: "Actualizar CSS", description: "Guarda CSS personalizado" },
        { id: "list_content", label: "Listar Contenido", description: "Muestra todo el contenido del sitio" },
      ],
      sites: sites.map((s) => ({ id: s.id, label: s.label, url: s.url })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
