"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Archive,
  Trash2,
  Send,
  Clock,
  X,
  Loader2,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { sanitizeEmailHtml } from "@/lib/sanitize";

interface Email {
  id: number;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  body: string | null;
  category: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Inbox Zero — zen view for processing unread emails one at a time.
 *
 * Flow:
 *   - Fetch queue: unread CLIENTE/PROVEEDOR/FACTURA emails
 *   - Show one at a time with 4 big action buttons
 *   - Actions: Archive (mark read), Respond (open draft), Trash, Later (snooze)
 *   - Keyboard shortcuts: a / r / d / l (also 1..4)
 *   - After last email: celebration state
 */
export default function InboxZero({ open, onClose, onDone }: Props) {
  const [queue, setQueue] = useState<Email[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const current = queue[index];
  const remaining = queue.length - index;

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch unread priority emails: FACTURA, CLIENTE, PROVEEDOR
      const params = new URLSearchParams({ limit: "50" });
      const res = await fetch(`/api/emails?${params}`);
      const data = await res.json();
      const filtered = (data.emails || []).filter(
        (e: Email) =>
          !e.body && e.category
            ? false
            : ["FACTURA", "CLIENTE", "PROVEEDOR"].includes(e.category || "") &&
              !(e as unknown as { isRead?: boolean }).isRead,
      );
      setQueue(filtered);
      setIndex(0);
    } catch {
      toast.error("No se pudo cargar la cola");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadQueue();
  }, [open, loadQueue]);

  const next = () => {
    if (index + 1 >= queue.length) {
      // Done
      toast.success("¡Bandeja procesada!");
      onDone();
      setQueue([]);
      setIndex(0);
    } else {
      setIndex(index + 1);
    }
  };

  const archive = async () => {
    if (!current) return;
    setActing("archive");
    try {
      await fetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, isRead: true }),
      });
      toast.success("Archivado (marcado como leído)");
      next();
    } catch {
      toast.error("Error");
    } finally {
      setActing(null);
    }
  };

  const trash = async () => {
    if (!current) return;
    setActing("trash");
    try {
      const res = await fetch("/api/agent/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: [current.id], action: "trash" }),
      });
      if (res.ok) {
        toast.success("Movido a papelera");
        next();
      } else {
        toast.error("No se pudo eliminar");
      }
    } catch {
      toast.error("Error");
    } finally {
      setActing(null);
    }
  };

  const respond = async () => {
    if (!current) return;
    setActing("respond");
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: current.id, tone: "profesional" }),
      });
      if (res.ok) {
        toast.success("Borrador creado en Gmail");
        next();
      } else {
        const d = await res.json();
        toast.error("No se pudo crear borrador", { description: d.error });
      }
    } catch {
      toast.error("Error");
    } finally {
      setActing(null);
    }
  };

  const later = () => {
    // Move to end of queue (snooze without side effects)
    if (!current) return;
    const rest = queue.slice(0, index).concat(queue.slice(index + 1));
    setQueue([...rest, current]);
    toast("Pospuesto al final de la cola");
  };

  // Keyboard shortcuts while modal open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLElement) {
        const tag = document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
      }
      const k = e.key.toLowerCase();
      if (k === "escape") onClose();
      else if (k === "a" || k === "1") archive();
      else if (k === "r" || k === "2") respond();
      else if (k === "d" || k === "3") trash();
      else if (k === "l" || k === "4") later();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sinergia-500/20 to-purple-500/20 flex items-center justify-center">
            <Mail className="w-5 h-5 text-sinergia-400" />
          </div>
          <div>
            <div className="text-sm font-semibold">Inbox Zero</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {queue.length === 0
                ? loading
                  ? "Cargando..."
                  : "Sin pendientes"
                : `${remaining} / ${queue.length} restantes`}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] rounded-xl hover:bg-[var(--bg-card)] flex items-center justify-center"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sinergia-400" />
          </div>
        ) : !current ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">¡Bandeja al día!</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                No hay emails de clientes, proveedores o facturas pendientes de revisar.
              </p>
              <button
                onClick={onClose}
                className="btn-accent px-6 py-3 rounded-xl"
              >
                Volver al dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {/* Email card */}
            <div className="glass-card p-5 lg:p-8 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-sinergia-500/15 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-sinergia-400">
                    {(current.fromName || current.fromEmail || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {current.fromName || current.fromEmail}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] truncate">
                    {current.fromEmail}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1">
                    {current.date ? new Date(current.date).toLocaleString("es-ES") : ""}
                    {current.category && ` · ${current.category}`}
                  </div>
                </div>
              </div>
              <h2 className="text-lg lg:text-xl font-bold mb-4">{current.subject || "(Sin asunto)"}</h2>
              {current.body ? (
                <div
                  className="email-html-body text-sm max-h-[40vh] overflow-y-auto"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(current.body.slice(0, 8000)),
                  }}
                />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{current.snippet}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      {current && (
        <div className="border-t border-[var(--border)] p-3 lg:p-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="max-w-3xl mx-auto grid grid-cols-4 gap-2 lg:gap-3">
            <ActionBtn
              onClick={archive}
              loading={acting === "archive"}
              icon={<Archive className="w-5 h-5" />}
              label="Archivar"
              shortcut="a"
              color="green"
            />
            <ActionBtn
              onClick={respond}
              loading={acting === "respond"}
              icon={<Send className="w-5 h-5" />}
              label="Responder"
              shortcut="r"
              color="sinergia"
            />
            <ActionBtn
              onClick={trash}
              loading={acting === "trash"}
              icon={<Trash2 className="w-5 h-5" />}
              label="Papelera"
              shortcut="d"
              color="red"
            />
            <ActionBtn
              onClick={later}
              loading={false}
              icon={<Clock className="w-5 h-5" />}
              label="Más tarde"
              shortcut="l"
              color="amber"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  onClick,
  loading,
  icon,
  label,
  shortcut,
  color,
}: {
  onClick: () => void;
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: "bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/30",
    sinergia: "bg-sinergia-500/10 hover:bg-sinergia-500/20 text-sinergia-400 border-sinergia-500/30",
    red: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30",
    amber: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded-xl border transition p-3 lg:p-4 flex flex-col items-center justify-center gap-1 min-h-[64px] disabled:opacity-50 ${colorMap[color]}`}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      <span className="text-xs font-semibold">{label}</span>
      <kbd className="text-[9px] opacity-60 font-mono">{shortcut}</kbd>
    </button>
  );
}
