"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Search,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  Tag,
  Clock,
  Database,
  Loader2,
  BookOpen,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  tags: string[] | null;
  createdAt: string | null;
  starred: boolean;
}

interface KnowledgeStats {
  total: number;
  byTag: Record<string, number>;
  lastUpdated: string | null;
}

interface SearchResult {
  id: number;
  title: string;
  content: string;
  similarity: number;
  createdAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Tag color mapping                                                  */
/* ------------------------------------------------------------------ */

const TAG_COLORS: Record<string, string> = {
  empresa: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  servicios: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  tarifas: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  procesos: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  workflow: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  normativa: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  legal: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  energia: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  comunicacion: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  politica: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  custom: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "info-general": "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

function tagColor(tag: string): string {
  return TAG_COLORS[tag] || "bg-slate-500/20 text-slate-400 border-slate-500/30";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function KnowledgePanel() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");

  // Expanded entries
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Filter by tag
  const [filterTag, setFilterTag] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Fetch                                                            */
  /* ---------------------------------------------------------------- */

  const fetchKnowledge = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error("Error fetching knowledge:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKnowledge();
  }, [fetchKnowledge]);

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      if (res.ok) {
        await fetchKnowledge();
      }
    } catch (err) {
      console.error("Seed error:", err);
    } finally {
      setSeeding(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: searchQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          title: newTitle,
          content: newContent,
          tags: newTags,
        }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewContent("");
        setNewTags("");
        setShowAddForm(false);
        await fetchKnowledge();
      }
    } catch (err) {
      console.error("Add error:", err);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/knowledge?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        // Refresh stats
        fetchKnowledge();
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ---------------------------------------------------------------- */
  /*  Filtered entries                                                 */
  /* ---------------------------------------------------------------- */

  const filteredEntries = filterTag
    ? entries.filter((e) => e.tags?.includes(filterTag))
    : entries;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30"
            style={{ boxShadow: "0 0 20px rgba(6, 182, 212, 0.25)" }}
          >
            <Brain className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-shimmer">Cerebro del Negocio</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Base de conocimiento empresarial para el agente IA
            </p>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-[#0a1628] rounded-xl p-3 border border-[#1a2d4a]">
              <div className="text-2xl font-bold text-cyan-400">{stats.total}</div>
              <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                Entradas
              </div>
            </div>
            {Object.entries(stats.byTag)
              .filter(([tag]) => tag !== "knowledge-base")
              .slice(0, 5)
              .map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={`bg-[#0a1628] rounded-xl p-3 border transition-all text-left ${
                    filterTag === tag
                      ? "border-cyan-500/60 ring-1 ring-cyan-500/30"
                      : "border-[#1a2d4a] hover:border-[#2a3d5a]"
                  }`}
                >
                  <div className="text-2xl font-bold text-cyan-400">{count}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider truncate">
                    {tag}
                  </div>
                </button>
              ))}
          </div>
        )}

        {/* Last updated */}
        {stats?.lastUpdated && (
          <div className="flex items-center gap-1.5 mt-3 text-xs text-[var(--text-secondary)]">
            <Clock className="w-3 h-3" />
            Ultima actualizacion:{" "}
            {new Date(stats.lastUpdated).toLocaleString("es-ES")}
          </div>
        )}
      </div>

      {/* Seed button (if empty) */}
      {stats && stats.total === 0 && (
        <div className="glass-card p-6 text-center">
          <Database className="w-12 h-12 text-cyan-400/50 mx-auto mb-3" />
          <h3 className="text-sm font-semibold mb-2">
            Base de conocimiento vacia
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-4 max-w-md mx-auto">
            Inicializa la base de conocimiento con informacion predefinida sobre
            Somos Sinergia: servicios, procesos, normativa y politica de
            comunicacion.
          </p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition disabled:opacity-50 font-medium text-sm"
          >
            {seeding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Inicializar Base de Conocimiento
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="glass-card p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Buscar en la base de conocimiento (busqueda semantica)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] text-sm focus:outline-none focus:border-cyan-500/50 transition"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Buscar
          </button>
        </div>

        {/* Search results */}
        {searchResults && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
              {searchResults.length} resultados encontrados
            </div>
            {searchResults.map((r) => (
              <div
                key={r.id}
                className="bg-[#0a1628] rounded-xl p-4 border border-[#1a2d4a]"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-cyan-400">
                    {r.title}
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {(r.similarity * 100).toFixed(0)}% relevancia
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-4">
                  {r.content}
                </p>
              </div>
            ))}
            {searchResults.length === 0 && (
              <div className="text-center py-6 text-sm text-[var(--text-secondary)]">
                Sin resultados para &quot;{searchQuery}&quot;
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Anadir Conocimiento
        </button>
        {stats && stats.total === 0 && null}
        {stats && stats.total > 0 && (
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0a1628] text-[var(--text-secondary)] border border-[#1a2d4a] hover:border-[#2a3d5a] transition text-sm disabled:opacity-50"
          >
            {seeding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Re-inicializar conocimiento base
          </button>
        )}
        {filterTag && (
          <button
            onClick={() => setFilterTag(null)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition text-sm"
          >
            <Tag className="w-4 h-4" />
            Filtro: {filterTag} (click para quitar)
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            Nuevo Conocimiento
          </h3>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
              Titulo
            </label>
            <input
              type="text"
              placeholder="Ej: Politica de precios 2026"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] text-sm focus:outline-none focus:border-cyan-500/50 transition"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
              Contenido
            </label>
            <textarea
              placeholder="Escribe aqui toda la informacion que quieres que el agente IA conozca sobre este tema..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={6}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] text-sm focus:outline-none focus:border-cyan-500/50 transition resize-y"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
              Etiquetas (separadas por comas)
            </label>
            <input
              type="text"
              placeholder="Ej: precios, comercial, 2026"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] text-sm focus:outline-none focus:border-cyan-500/50 transition"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={adding || !newTitle.trim() || !newContent.trim()}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition text-sm font-medium disabled:opacity-50"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Guardar
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Knowledge entries list */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">
          {filteredEntries.length} entradas
          {filterTag ? ` con etiqueta "${filterTag}"` : " en la base de conocimiento"}
        </div>

        {filteredEntries.map((entry) => {
          const isExpanded = expanded.has(entry.id);
          return (
            <div
              key={entry.id}
              className="glass-card overflow-hidden transition-all"
            >
              {/* Header row */}
              <button
                onClick={() => toggleExpand(entry.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--bg-card-hover)] transition"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-cyan-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold truncate">{entry.title}</h4>
                  {!isExpanded && (
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {entry.content.slice(0, 120)}...
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.tags
                    ?.filter((t) => t !== "knowledge-base")
                    .slice(0, 3)
                    .map((tag) => (
                      <span
                        key={tag}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${tagColor(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0">
                  <div className="bg-[#0a1628] rounded-xl p-4 border border-[#1a2d4a]">
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                      {entry.content}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.tags
                        ?.filter((t) => t !== "knowledge-base")
                        .map((tag) => (
                          <span
                            key={tag}
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${tagColor(tag)}`}
                          >
                            {tag}
                          </span>
                        ))}
                      {entry.createdAt && (
                        <span className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(entry.createdAt).toLocaleDateString("es-ES")}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.id);
                      }}
                      className="p-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Eliminar entrada"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredEntries.length === 0 && stats && stats.total > 0 && filterTag && (
          <div className="glass-card p-8 text-center">
            <Tag className="w-8 h-8 text-[var(--text-secondary)] mx-auto mb-2 opacity-50" />
            <p className="text-sm text-[var(--text-secondary)]">
              No hay entradas con la etiqueta &quot;{filterTag}&quot;
            </p>
          </div>
        )}

        {entries.length === 0 && (
          <div className="glass-card p-8 text-center">
            <Brain className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-3 opacity-30" />
            <p className="text-sm text-[var(--text-secondary)]">
              La base de conocimiento esta vacia. Pulsa &quot;Inicializar&quot; para
              cargar el conocimiento base de Somos Sinergia.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
