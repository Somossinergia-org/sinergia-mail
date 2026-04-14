"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Search,
  Plus,
  Star,
  Trash2,
  Loader2,
  FileText,
  Mail,
  Receipt,
  Link2,
  StickyNote,
  UserSquare,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type Kind = "email" | "invoice" | "pdf" | "note" | "url" | "contact";

interface Source {
  id: number;
  kind: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  starred: boolean;
  createdAt: string | null;
  tags?: string[] | null;
  similarity?: number;
}

const KIND_META: Record<Kind, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: "Emails", icon: <Mail className="w-3.5 h-3.5" />, color: "sinergia" },
  invoice: { label: "Facturas", icon: <Receipt className="w-3.5 h-3.5" />, color: "yellow" },
  pdf: { label: "PDFs", icon: <FileText className="w-3.5 h-3.5" />, color: "red" },
  note: { label: "Notas", icon: <StickyNote className="w-3.5 h-3.5" />, color: "amber" },
  url: { label: "URLs", icon: <Link2 className="w-3.5 h-3.5" />, color: "cyan" },
  contact: { label: "Contactos", icon: <UserSquare className="w-3.5 h-3.5" />, color: "lime" },
};

export default function MemoriaPanel() {
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Array<{ kind: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Nueva nota modal
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query.trim()) params.set("q", query.trim());
      if (kindFilter) params.set("kind", kindFilter);
      if (starredOnly && !query) params.set("starred", "true");
      const res = await fetch(`/api/memory?${params}`);
      const d = await res.json();
      setSources(d.sources || []);
      if (d.stats) setStats(d.stats);
      setSearchMode(d.mode === "search");
    } catch {
      toast.error("Error cargando memoria");
    } finally {
      setLoading(false);
    }
  }, [query, kindFilter, starredOnly]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const saveNote = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Título y contenido obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          kind: "note",
          tags: newTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("Guardado en memoria", {
          description: d.chunked ? `${d.chunks} fragmentos` : "1 fragmento",
        });
        setNewTitle("");
        setNewContent("");
        setNewTags("");
        setShowNew(false);
        await load();
      } else {
        toast.error(d.error || "Error");
      }
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  const toggleStar = async (id: number, starred: boolean) => {
    await fetch("/api/memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, starred: !starred }),
    });
    await load();
  };

  const del = async (id: number) => {
    if (!confirm("¿Eliminar esta fuente de memoria?")) return;
    await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
    await load();
  };

  const totalSources = stats.reduce((s, st) => s + st.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-sinergia-500/20 flex items-center justify-center flex-shrink-0">
            <Brain className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">Memoria de Sinergia AI</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              El agente recuerda todo lo aquí almacenado entre conversaciones. Busca por significado (no por palabra exacta).
              Emails importantes y facturas se ingieren automáticamente al sincronizar.
            </p>
            <div className="flex items-center gap-3 mt-3 text-xs">
              <span className="text-[var(--text-secondary)]">
                <Sparkles className="w-3 h-3 inline mr-1" />
                {totalSources} fuente{totalSources === 1 ? "" : "s"}
              </span>
              {stats.map((s) => {
                const meta = KIND_META[s.kind as Kind];
                if (!meta) return null;
                return (
                  <span key={s.kind} className="text-[var(--text-secondary)]">
                    {meta.icon} {s.count} {meta.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2.5 rounded-xl bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition flex items-center gap-2 text-sm font-medium min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> Nueva nota
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="glass-card p-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca por significado: “contrato de marzo”, “IBAN de Buen Fin”, etc."
            className="pl-9 pr-3 py-2.5 w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500 transition"
          />
        </div>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="py-2.5 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500"
        >
          <option value="">Todos</option>
          {Object.entries(KIND_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
        <button
          onClick={() => setStarredOnly(!starredOnly)}
          className={`px-3 py-2.5 rounded-lg text-sm transition flex items-center gap-1.5 ${
            starredOnly
              ? "bg-amber-500/20 text-amber-400"
              : "bg-[var(--bg-card)] text-[var(--text-secondary)]"
          }`}
        >
          <Star className="w-4 h-4" /> Favoritas
        </button>
      </div>

      {/* Sources list */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">
            <Brain className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-xs">
              {query
                ? `Sin resultados para "${query}".`
                : "La memoria está vacía. Sincroniza Gmail para auto-ingerir emails importantes o crea una nota manual."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {sources.map((s) => {
              const meta = KIND_META[s.kind as Kind] || KIND_META.note;
              const isExpanded = expanded === s.id;
              return (
                <div key={s.id} className="group">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : s.id)}
                    className="w-full flex items-start gap-3 p-4 hover:bg-[var(--bg-card-hover)] transition text-left"
                  >
                    <div className={`w-10 h-10 rounded-lg bg-${meta.color}-500/10 text-${meta.color}-400 flex items-center justify-center flex-shrink-0`}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{s.title}</span>
                        {s.starred && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />}
                        {searchMode && typeof s.similarity === "number" && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                            {Math.round(s.similarity * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                        {s.content.slice(0, 150)}…
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(s.id, s.starred);
                      }}
                      aria-label="Favorito"
                      className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition opacity-0 group-hover:opacity-100"
                    >
                      <Star
                        className={`w-4 h-4 ${s.starred ? "text-amber-400 fill-amber-400" : "text-[var(--text-secondary)]"}`}
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        del(s.id);
                      }}
                      aria-label="Eliminar"
                      className="p-2 rounded-lg hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-[var(--bg-card)]/30">
                      <div className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {s.content}
                      </div>
                      {s.tags && s.tags.length > 0 && (
                        <div className="flex gap-1 mt-3">
                          {s.tags.map((t) => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-secondary)]">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New note modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !saving && setShowNew(false)}>
          <div className="glass-card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-amber-400" /> Nueva nota de memoria
              </h3>
              <button onClick={() => !saving && setShowNew(false)} aria-label="Cerrar" className="min-w-[40px] min-h-[40px] rounded-lg hover:bg-[var(--bg-card)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Título</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="p.ej. Condiciones pago Endesa 2026"
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500 min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Contenido</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={6}
                  placeholder="Lo que quieres que Sinergia recuerde..."
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Tags (separadas por coma)</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="endesa, contrato, 2026"
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500 min-h-[44px]"
                />
              </div>
              <button
                onClick={saveNote}
                disabled={saving}
                className="w-full btn-accent py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                {saving ? "Guardando..." : "Guardar en memoria"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
