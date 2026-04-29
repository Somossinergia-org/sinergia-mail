"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Trash2,
  AlertTriangle,
  Loader2,
  X,
  Database,
  Wrench,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

interface CleanupGroup {
  reason: string;
  count: number;
  score: number;
  emailIds: number[];
}
interface CleanupAnalysis {
  totalEmails: number;
  deletable: number;
  groups: CleanupGroup[];
  protected: string[];
}
interface TrashItem {
  id: number;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  category: string | null;
  date: string | null;
  deletedAt: string | null;
}

interface SidebarToolsProps {
  /** Si es true, oculta los botones triggers y solo escucha eventos window
   *  (sinergia:open-cleanup / sinergia:open-trash / sinergia:run-migration).
   *  Util cuando los triggers están en otro sitio (ej. Ajustes > Herramientas). */
  hideTriggers?: boolean;
}

/**
 * Herramientas globales accesibles desde el sidebar:
 *   - Limpieza inteligente (analiza + mueve a papelera interna)
 *   - Papelera interna (lista, restaura, purga)
 *   - Aplicar migración BBDD (idempotente)
 *
 * Las acciones tienen modales propios montados en posición fija.
 *
 * Cuando se monta con `hideTriggers`, sólo expone los modales (escucha eventos
 * window). Esto permite tenerlos disponibles desde Ajustes > Herramientas sin
 * duplicar lógica.
 */
export default function SidebarTools({ hideTriggers = false }: SidebarToolsProps = {}) {
  const [open, setOpen] = useState(true);
  // Portal mount flag: evita mismatch SSR/CSR con createPortal
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Cleanup
  const [analyzing, setAnalyzing] = useState(false);
  const [cleanupAnalysis, setCleanupAnalysis] = useState<CleanupAnalysis | null>(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [cleaningUp, setCleaningUp] = useState(false);

  // Trash
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashBusy, setTrashBusy] = useState(false);

  // Migration busy
  const [migrating, setMigrating] = useState(false);

  // ─── Cleanup ─────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/agent/cleanup");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setCleanupAnalysis(data.analysis);
      const auto = new Set<number>();
      data.analysis.groups.forEach((g: CleanupGroup, i: number) => {
        if (g.score >= 70) auto.add(i);
      });
      setSelectedGroups(auto);
      setShowCleanupModal(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo analizar");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (!cleanupAnalysis) return;
    const emailIds: number[] = [];
    cleanupAnalysis.groups.forEach((g, i) => {
      if (selectedGroups.has(i)) emailIds.push(...g.emailIds);
    });
    if (emailIds.length === 0) {
      toast.info("Selecciona al menos un grupo");
      return;
    }
    if (
      !confirm(
        `¿Mover ${emailIds.length} emails a papelera?\n\nVan a la papelera interna (restaurables) y a Gmail (30 días).`,
      )
    )
      return;
    setCleaningUp(true);
    try {
      const res = await fetch("/api/agent/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds, action: "trash" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      toast.success(`${data.trashed} emails movidos a papelera`);
      setShowCleanupModal(false);
      setCleanupAnalysis(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCleaningUp(false);
    }
  };

  const toggleGroup = (i: number) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // ─── Trash ───────────────────────────────────────────────────────
  const openTrash = async () => {
    setShowTrash(true);
    setTrashBusy(true);
    try {
      const res = await fetch("/api/agent/cleanup?trash=list");
      const data = await res.json();
      setTrashItems(data.trash || []);
    } finally {
      setTrashBusy(false);
    }
  };

  const restoreEmails = async (ids?: number[]) => {
    if (
      !confirm(
        ids
          ? `¿Restaurar ${ids.length} emails?`
          : "¿Restaurar TODOS los emails de la papelera interna?",
      )
    )
      return;
    setTrashBusy(true);
    try {
      const res = await fetch("/api/agent/cleanup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { emailIds: ids } : {}),
      });
      const data = await res.json();
      toast.success(`${data.restored} emails restaurados`);
      const r = await fetch("/api/agent/cleanup?trash=list");
      const d = await r.json();
      setTrashItems(d.trash || []);
    } catch {
      toast.error("Error restaurando");
    } finally {
      setTrashBusy(false);
    }
  };

  const purgeOld = async () => {
    if (
      !confirm(
        "¿Purgar permanentemente los emails con más de 30 días en la papelera?\n\nEsta acción NO se puede deshacer.",
      )
    )
      return;
    setTrashBusy(true);
    try {
      const res = await fetch("/api/agent/cleanup?purge=1", { method: "PUT" });
      const data = await res.json();
      toast.success(`${data.purged} emails purgados permanentemente`);
      const r = await fetch("/api/agent/cleanup?trash=list");
      const d = await r.json();
      setTrashItems(d.trash || []);
    } finally {
      setTrashBusy(false);
    }
  };

  // ─── Migration ───────────────────────────────────────────────────
  const runMigration = async () => {
    setMigrating(true);
    try {
      const res = await fetch("/api/admin/migrate", { method: "POST" });
      const data = await res.json();
      if (data.ok) toast.success("Migración aplicada (BBDD al día)");
      else toast.warning(`Migración parcial: ${data.steps?.length || 0} pasos`);
    } catch {
      toast.error("Error ejecutando migración");
    } finally {
      setMigrating(false);
    }
  };

  // ─── Eventos window (para triggers externos como Ajustes > Herramientas) ──
  useEffect(() => {
    const onCleanup = () => { void handleAnalyze(); };
    const onTrash = () => { void openTrash(); };
    const onMigrate = () => { void runMigration(); };
    window.addEventListener("sinergia:open-cleanup", onCleanup);
    window.addEventListener("sinergia:open-trash", onTrash);
    window.addEventListener("sinergia:run-migration", onMigrate);
    return () => {
      window.removeEventListener("sinergia:open-cleanup", onCleanup);
      window.removeEventListener("sinergia:open-trash", onTrash);
      window.removeEventListener("sinergia:run-migration", onMigrate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {!hideTriggers && (
      <div className="px-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-2 py-2 text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider hover:text-[var(--text-primary)] transition"
          aria-expanded={open}
        >
          <Wrench className="w-3 h-3" />
          <span className="flex-1 text-left">Herramientas</span>
          <ChevronDown className={`w-3 h-3 transition ${open ? "" : "-rotate-90"}`} />
        </button>
        {open && (
          <div className="space-y-1 mt-1">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition disabled:opacity-50 min-h-[44px]"
              title="Detecta SPAM, marketing y notificaciones antiguas"
            >
              {analyzing ? (
                <Loader2 className="w-5 h-5 animate-spin text-red-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
              <span className="truncate">Limpieza inteligente</span>
            </button>
            <button
              onClick={openTrash}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition min-h-[44px]"
              title="Emails borrados (restaurables)"
            >
              <Trash2 className="w-5 h-5 text-amber-400" />
              <span className="truncate">Papelera interna</span>
            </button>
            <button
              onClick={runMigration}
              disabled={migrating}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition disabled:opacity-50 min-h-[44px]"
              title="ALTER TABLE idempotente (seguro de pulsar varias veces)"
            >
              {migrating ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              ) : (
                <Database className="w-5 h-5 text-blue-400" />
              )}
              <span className="truncate">Migrar BBDD</span>
            </button>
          </div>
        )}
      </div>
      )}

      {/* Cleanup analysis modal — via portal para escapar el backdrop-filter
          del sidebar (que crearía un containing block para position:fixed) */}
      {mounted && showCleanupModal && cleanupAnalysis && createPortal(
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !cleaningUp && setShowCleanupModal(false)}
        >
          <div
            className="glass-card max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-sm">
                  Limpieza: {cleanupAnalysis.deletable} eliminables de {cleanupAnalysis.totalEmails}
                </h3>
              </div>
              <button
                onClick={() => !cleaningUp && setShowCleanupModal(false)}
                aria-label="Cerrar"
                className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-[var(--bg-card)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cleanupAnalysis.groups.map((group, i) => (
                <label
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] cursor-pointer hover:bg-[var(--bg-card-hover)] transition"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(i)}
                    onChange={() => toggleGroup(i)}
                    className="w-4 h-4 rounded border-[var(--border)] accent-red-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{group.reason}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {group.count} emails — Confianza: {group.score}%
                    </div>
                  </div>
                  <div
                    className={`text-xs font-mono px-2 py-0.5 rounded ${
                      group.score >= 80
                        ? "bg-red-500/10 text-red-400"
                        : group.score >= 60
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-gray-500/10 text-gray-400"
                    }`}
                  >
                    {group.score}
                  </div>
                </label>
              ))}
              <div className="text-[10px] text-[var(--text-secondary)] mt-3">
                Categorías protegidas (nunca se borran): {cleanupAnalysis.protected.join(", ")}
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex items-center justify-between">
              <div className="text-xs text-[var(--text-secondary)]">
                Seleccionados:{" "}
                {Array.from(selectedGroups).reduce(
                  (sum, i) => sum + (cleanupAnalysis.groups[i]?.count || 0),
                  0,
                )}{" "}
                emails
              </div>
              <button
                onClick={handleExecuteCleanup}
                disabled={cleaningUp || selectedGroups.size === 0}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition disabled:opacity-50"
              >
                {cleaningUp ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Limpiando…
                  </span>
                ) : (
                  "Mover a papelera"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Trash modal — portal también */}
      {mounted && showTrash && createPortal(
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !trashBusy && setShowTrash(false)}
        >
          <div
            className="glass-card max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-amber-400" /> Papelera interna
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {trashItems.length} email{trashItems.length === 1 ? "" : "s"} soft-deleted. Gmail los retiene 30 días.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => restoreEmails()}
                  disabled={trashBusy || trashItems.length === 0}
                  className="text-xs px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40 min-h-[36px]"
                >
                  Restaurar todos
                </button>
                <button
                  onClick={purgeOld}
                  disabled={trashBusy}
                  title="Borrar permanentemente los >30d"
                  className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 min-h-[36px]"
                >
                  Purgar &gt;30d
                </button>
                <button
                  onClick={() => setShowTrash(false)}
                  aria-label="Cerrar"
                  className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-[var(--bg-card)] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border)]">
              {trashBusy && trashItems.length === 0 ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                </div>
              ) : trashItems.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-secondary)]">
                  <Trash2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">Papelera interna vacía</p>
                </div>
              ) : (
                trashItems.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 p-3 hover:bg-[var(--bg-card-hover)]">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.subject || "(sin asunto)"}</div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        {t.fromName || t.fromEmail} · {t.category || "OTROS"}
                      </div>
                      {t.deletedAt && (
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                          Eliminado: {new Date(t.deletedAt).toLocaleString("es-ES")}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => restoreEmails([t.id])}
                      disabled={trashBusy}
                      title="Restaurar"
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40"
                    >
                      Restaurar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
