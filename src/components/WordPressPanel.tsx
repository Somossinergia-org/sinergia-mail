"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Globe, FileText, Layout, Puzzle, RefreshCw, Plus, Edit3,
  Eye, Trash2, Check, X, ChevronDown, ChevronUp, Zap,
  Clock, ExternalLink, Search,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface WpSite {
  id: string;
  label: string;
  url: string;
}

interface WpPost {
  id: number;
  title: { rendered: string };
  status: string;
  date: string;
  link: string;
  modified: string;
  excerpt?: { rendered: string };
}

interface WpPlugin {
  plugin: string;
  name: string;
  version: string;
  status: string;
  description?: { raw?: string };
}

interface AgentLog {
  id: string;
  action: string;
  timestamp: string;
  agentId: string;
  detail: string;
  status: "success" | "error" | "pending";
}

type TabId = "contenido" | "plugins" | "actividad";

// ─── Helpers ───────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    publish: { bg: "#dcfce7", text: "#166534", label: "Publicado" },
    draft: { bg: "#fef3c7", text: "#92400e", label: "Borrador" },
    pending: { bg: "#dbeafe", text: "#1e40af", label: "Pendiente" },
    private: { bg: "#f3e8ff", text: "#6b21a8", label: "Privado" },
    active: { bg: "#dcfce7", text: "#166534", label: "Activo" },
    inactive: { bg: "#f1f5f9", text: "#475569", label: "Inactivo" },
  };
  const c = colors[status] || { bg: "#f1f5f9", text: "#475569", label: status };
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 500,
      padding: "2px 8px", borderRadius: 6,
      background: c.bg, color: c.text,
    }}>
      {c.label}
    </span>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

// ─── Component ─────────────────────────────────────────────────────────

export default function WordPressPanel() {
  const [tab, setTab] = useState<TabId>("contenido");
  const [contentTab, setContentTab] = useState<"posts" | "pages">("posts");
  const [sites, setSites] = useState<WpSite[]>([]);
  const [selectedSite, setSelectedSite] = useState("1");
  const [posts, setPosts] = useState<WpPost[]>([]);
  const [pages, setPages] = useState<WpPost[]>([]);
  const [plugins, setPlugins] = useState<WpPlugin[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Create post/page state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  // ─── Fetch ──────────────────────────────────────────────────────────

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch("/api/wordpress?action=sites");
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites || []);
      }
    } catch { /* */ }
  }, []);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [postsRes, pagesRes] = await Promise.all([
        fetch(`/api/wordpress?action=posts&siteId=${selectedSite}`),
        fetch(`/api/wordpress?action=pages&siteId=${selectedSite}`),
      ]);

      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(Array.isArray(data) ? data : []);
      }
      if (pagesRes.ok) {
        const data = await pagesRes.json();
        setPages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError("Error conectando con WordPress");
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wordpress?action=plugins&siteId=${selectedSite}`);
      if (res.ok) {
        const data = await res.json();
        setPlugins(Array.isArray(data) ? data : []);
      }
    } catch { /* */ }
    finally { setLoading(false); }
  }, [selectedSite]);

  const fetchLogs = useCallback(async () => {
    // Fetch recent agent logs filtered for WP actions
    try {
      const res = await fetch("/api/operations/activity?filter=wordpress&limit=20");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.activities || []);
      } else {
        // Fallback: generate from local state
        setLogs([]);
      }
    } catch { setLogs([]); }
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  useEffect(() => {
    if (tab === "contenido") fetchContent();
    else if (tab === "plugins") fetchPlugins();
    else if (tab === "actividad") fetchLogs();
  }, [tab, selectedSite, fetchContent, fetchPlugins, fetchLogs]);

  // ─── Actions ────────────────────────────────────────────────────────

  const addLog = (action: string, agentId: string, detail: string, status: "success" | "error" = "success") => {
    setLogs((prev) => [{
      id: Date.now().toString(),
      action,
      timestamp: new Date().toISOString(),
      agentId,
      detail,
      status,
    }, ...prev].slice(0, 50));
  };

  const createContent = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const action = contentTab === "posts" ? "create_post" : "create_page";
      const res = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          siteId: selectedSite,
          title: newTitle,
          content: newContent || `<p>${newTitle}</p>`,
          status: "draft",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        addLog(action, "marketing-automation", `Creado: "${newTitle}" (ID: ${data.id})`, "success");
        setNewTitle("");
        setNewContent("");
        setShowCreate(false);
        fetchContent();
      } else {
        addLog(action, "marketing-automation", `Error creando "${newTitle}"`, "error");
      }
    } catch {
      addLog("create", "marketing-automation", `Error de red creando "${newTitle}"`, "error");
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (type: "posts" | "pages", id: number, newStatus: string, title: string) => {
    const action = type === "posts" ? "update_post" : "update_page";
    try {
      const res = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, siteId: selectedSite, id, status: newStatus }),
      });
      if (res.ok) {
        addLog(action, "marketing-automation", `"${title}" → ${newStatus}`, "success");
        fetchContent();
      }
    } catch { /* */ }
  };

  const togglePlugin = async (plugin: string, name: string, currentStatus: string) => {
    const activate = currentStatus !== "active";
    const action = activate ? "activate_plugin" : "deactivate_plugin";
    try {
      const res = await fetch("/api/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, siteId: selectedSite, plugin }),
      });
      if (res.ok) {
        addLog(action, "consultor-digital", `${name} → ${activate ? "activado" : "desactivado"}`, "success");
        fetchPlugins();
      }
    } catch { /* */ }
  };

  // ─── Filter ─────────────────────────────────────────────────────────

  const filteredItems = (items: WpPost[]) => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((i) =>
      stripHtml(i.title.rendered).toLowerCase().includes(q) ||
      i.status.includes(q)
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────

  const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: "contenido", label: "Contenido", icon: <FileText size={14} /> },
    { id: "plugins", label: "Plugins", icon: <Puzzle size={14} /> },
    { id: "actividad", label: "Actividad IA", icon: <Zap size={14} /> },
  ];

  const site = sites.find((s) => s.id === selectedSite);

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Globe size={20} style={{ color: "#06b6d4" }} />
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>WordPress</h3>
            {site && (
              <a
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#64748b", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
              >
                {site.label} <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            if (tab === "contenido") fetchContent();
            else if (tab === "plugins") fetchPlugins();
            else fetchLogs();
          }}
          style={{
            background: "none", border: "1px solid #e2e8f0", borderRadius: 8,
            padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "#475569",
          }}
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 16,
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", padding: "8px 16px",
              fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              color: tab === t.id ? "#0f172a" : "#94a3b8",
              borderBottom: tab === t.id ? "2px solid #0f172a" : "2px solid transparent",
              fontWeight: tab === t.id ? 600 : 400,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 14 }}>
          <RefreshCw size={20} style={{ animation: "spin 1s linear infinite" }} />
          <p>Cargando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
          padding: 12, color: "#991b1b", fontSize: 13, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* ── TAB: Contenido ── */}
      {tab === "contenido" && !loading && (
        <div>
          {/* Sub-tabs: Posts | Pages */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button
              onClick={() => setContentTab("posts")}
              style={{
                background: contentTab === "posts" ? "#0f172a" : "#f1f5f9",
                color: contentTab === "posts" ? "#fff" : "#475569",
                border: "none", borderRadius: 6, padding: "5px 14px",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >
              Posts ({posts.length})
            </button>
            <button
              onClick={() => setContentTab("pages")}
              style={{
                background: contentTab === "pages" ? "#0f172a" : "#f1f5f9",
                color: contentTab === "pages" ? "#fff" : "#475569",
                border: "none", borderRadius: 6, padding: "5px 14px",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >
              Páginas ({pages.length})
            </button>

            <div style={{ flex: 1 }} />

            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
              padding: "4px 10px",
            }}>
              <Search size={14} style={{ color: "#94a3b8" }} />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: "none", border: "none", outline: "none",
                  fontSize: 12, width: 120, color: "#0f172a",
                }}
              />
            </div>

            {/* Create button */}
            <button
              onClick={() => setShowCreate(!showCreate)}
              style={{
                background: "#06b6d4", color: "#fff", border: "none",
                borderRadius: 6, padding: "5px 12px", fontSize: 12,
                fontWeight: 500, cursor: "pointer", display: "flex",
                alignItems: "center", gap: 4,
              }}
            >
              <Plus size={14} /> Crear
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div style={{
              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <input
                type="text"
                placeholder={contentTab === "posts" ? "Título del post..." : "Título de la página..."}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0",
                  borderRadius: 6, fontSize: 14, marginBottom: 8, boxSizing: "border-box",
                  background: "#fff",
                }}
              />
              <textarea
                placeholder="Contenido HTML (opcional)..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                style={{
                  width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0",
                  borderRadius: 6, fontSize: 13, marginBottom: 8, boxSizing: "border-box",
                  resize: "vertical", fontFamily: "monospace", background: "#fff",
                }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowCreate(false); setNewTitle(""); setNewContent(""); }}
                  style={{
                    background: "none", border: "1px solid #e2e8f0", borderRadius: 6,
                    padding: "6px 14px", fontSize: 12, cursor: "pointer", color: "#475569",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={createContent}
                  disabled={creating || !newTitle.trim()}
                  style={{
                    background: creating ? "#94a3b8" : "#06b6d4", color: "#fff",
                    border: "none", borderRadius: 6, padding: "6px 14px",
                    fontSize: 12, fontWeight: 500, cursor: creating ? "wait" : "pointer",
                  }}
                >
                  {creating ? "Creando..." : "Crear como borrador"}
                </button>
              </div>
            </div>
          )}

          {/* Content list */}
          {filteredItems(contentTab === "posts" ? posts : pages).map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderBottom: "1px solid #f1f5f9",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {contentTab === "posts" ? <FileText size={14} style={{ color: "#06b6d4", flexShrink: 0 }} /> : <Layout size={14} style={{ color: "#8b5cf6", flexShrink: 0 }} />}
                  <span style={{
                    fontSize: 13, fontWeight: 500, color: "#0f172a",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {stripHtml(item.title.rendered) || "(sin título)"}
                  </span>
                  {statusBadge(item.status)}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, paddingLeft: 22 }}>
                  ID: {item.id} · {timeAgo(item.modified || item.date)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {item.status === "draft" && (
                  <button
                    onClick={() => updateStatus(contentTab, item.id, "publish", stripHtml(item.title.rendered))}
                    title="Publicar"
                    style={{
                      background: "#dcfce7", border: "none", borderRadius: 4,
                      padding: "4px 8px", cursor: "pointer", display: "flex",
                      alignItems: "center", gap: 3, fontSize: 11, color: "#166534",
                    }}
                  >
                    <Check size={12} /> Publicar
                  </button>
                )}
                {item.status === "publish" && (
                  <button
                    onClick={() => updateStatus(contentTab, item.id, "draft", stripHtml(item.title.rendered))}
                    title="Pasar a borrador"
                    style={{
                      background: "#fef3c7", border: "none", borderRadius: 4,
                      padding: "4px 8px", cursor: "pointer", display: "flex",
                      alignItems: "center", gap: 3, fontSize: 11, color: "#92400e",
                    }}
                  >
                    <Edit3 size={12} /> Borrador
                  </button>
                )}
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver en web"
                  style={{
                    background: "#f1f5f9", border: "none", borderRadius: 4,
                    padding: "4px 8px", cursor: "pointer", display: "flex",
                    alignItems: "center", fontSize: 11, color: "#475569",
                    textDecoration: "none",
                  }}
                >
                  <Eye size={12} />
                </a>
              </div>
            </div>
          ))}

          {filteredItems(contentTab === "posts" ? posts : pages).length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 13 }}>
              {searchQuery ? "Sin resultados para esta búsqueda" : `No hay ${contentTab === "posts" ? "posts" : "páginas"} todavía`}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Plugins ── */}
      {tab === "plugins" && !loading && (
        <div>
          <div style={{
            display: "flex", gap: 12, marginBottom: 16,
          }}>
            <div style={{
              background: "#f0fdf4", borderRadius: 8, padding: "10px 16px", flex: 1,
            }}>
              <div style={{ fontSize: 11, color: "#166534" }}>Activos</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#166534" }}>
                {plugins.filter((p) => p.status === "active").length}
              </div>
            </div>
            <div style={{
              background: "#f8fafc", borderRadius: 8, padding: "10px 16px", flex: 1,
            }}>
              <div style={{ fontSize: 11, color: "#475569" }}>Inactivos</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#475569" }}>
                {plugins.filter((p) => p.status !== "active").length}
              </div>
            </div>
            <div style={{
              background: "#eff6ff", borderRadius: 8, padding: "10px 16px", flex: 1,
            }}>
              <div style={{ fontSize: 11, color: "#1e40af" }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#1e40af" }}>
                {plugins.length}
              </div>
            </div>
          </div>

          {plugins.map((p) => (
            <div
              key={p.plugin}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Puzzle size={14} style={{ color: p.status === "active" ? "#22c55e" : "#94a3b8", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                    {stripHtml(p.name)}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>v{p.version}</span>
                  {statusBadge(p.status)}
                </div>
              </div>
              <button
                onClick={() => togglePlugin(p.plugin, stripHtml(p.name), p.status)}
                style={{
                  background: p.status === "active" ? "#fef2f2" : "#f0fdf4",
                  color: p.status === "active" ? "#991b1b" : "#166534",
                  border: "none", borderRadius: 4, padding: "4px 10px",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                }}
              >
                {p.status === "active" ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: Actividad IA ── */}
      {tab === "actividad" && (
        <div>
          <div style={{
            background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8,
            padding: 12, marginBottom: 16, fontSize: 12, color: "#0369a1",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Zap size={14} />
            Aquí verás las acciones que los agentes IA realizan en WordPress en tiempo real.
          </div>

          {logs.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 13 }}>
              <Clock size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p>Sin actividad reciente de agentes en WordPress</p>
              <p style={{ fontSize: 11 }}>Cuando un agente cree un post, edite una página o toque un plugin, aparecerá aquí.</p>
            </div>
          )}

          {logs.map((log) => (
            <div
              key={log.id}
              style={{
                display: "flex", gap: 12, padding: "10px 14px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: log.status === "success" ? "#dcfce7" : log.status === "error" ? "#fef2f2" : "#fef3c7",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {log.status === "success" ? <Check size={14} style={{ color: "#166534" }} /> :
                 log.status === "error" ? <X size={14} style={{ color: "#991b1b" }} /> :
                 <Clock size={14} style={{ color: "#92400e" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                  {log.detail}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {log.agentId} · {log.action} · {timeAgo(log.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
