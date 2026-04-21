"use client";

import { useState, useEffect, useCallback } from "react";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Mail,
  FileText,
  BarChart3,
  Users,
  Plug,
  RefreshCw,
  Send,
  Download,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import type { Tab } from "./Sidebar";

interface CommandPaletteProps {
  onNavigate: (tab: Tab) => void;
  onSync?: () => Promise<void> | void;
}

export default function CommandPalette({ onNavigate, onSync }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const go = useCallback(
    (tab: Tab) => {
      onNavigate(tab);
      setOpen(false);
      setSearch("");
    },
    [onNavigate]
  );

  const runAction = useCallback(
    async (label: string, fn: () => Promise<Response>) => {
      setOpen(false);
      const id = toast.loading(`${label}…`);
      try {
        const res = await fn();
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success(label + " completado", { id, description: JSON.stringify(data).slice(0, 120) });
        } else {
          toast.error(label + " falló", { id, description: data.error || `Status ${res.status}` });
        }
      } catch (e) {
        toast.error(label + " falló", { id, description: e instanceof Error ? e.message : "Error" });
      }
    },
    []
  );

  const downloadExcel = useCallback(
    async (type: string) => {
      setOpen(false);
      const id = toast.loading(`Generando Excel ${type}…`);
      try {
        const res = await fetch("/api/agent/report-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        if (!res.ok) throw new Error("fallo");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sinergia-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Excel ${type} descargado`, { id });
      } catch {
        toast.error("Error generando Excel", { id });
      }
    },
    []
  );

  if (!open) {
    return (
      <div className="hidden lg:block fixed bottom-[88px] right-6 z-30">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] backdrop-blur border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-sinergia-500/50 hover:shadow-[0_0_16px_rgba(168,85,247,0.25)] transition shadow-lg"
          title="Abrir paleta de comandos (⌘K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Comandos</span>
          <kbd className="ml-1 px-1.5 py-0.5 rounded bg-[var(--bg-card-hover)] font-mono text-[10px]">⌘K</kbd>
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 pt-0 lg:pt-[15vh] p-0 lg:p-4"
      onClick={() => setOpen(false)}
    >
      <Command
        className="w-full h-full lg:h-auto lg:max-w-xl bg-[var(--bg-primary)] border border-[var(--border)] lg:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-secondary)]" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Escribe un comando o busca…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-secondary)]"
            autoFocus
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-secondary)] font-mono">ESC</kbd>
        </div>

        <Command.List className="flex-1 lg:max-h-96 overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-xs text-[var(--text-secondary)]">
            Sin resultados para &ldquo;{search}&rdquo;
          </Command.Empty>

          <Command.Group heading="Navegación" className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-2 py-1.5">
            <Item icon={<LayoutDashboard className="w-4 h-4 text-sinergia-400" />} label="Ir a Mi día" onSelect={() => go("overview")} shortcut="g r" />
            <Item icon={<Users className="w-4 h-4 text-lime-400" />} label="Ir a CRM" onSelect={() => go("crm")} shortcut="g c" />
            <Item icon={<Mail className="w-4 h-4 text-sinergia-400" />} label="Ir a Emails" onSelect={() => go("emails")} shortcut="g e" />
            <Item icon={<Send className="w-4 h-4 text-indigo-400" />} label="Ir a Campañas" onSelect={() => go("campanas")} shortcut="g p" />
            <Item icon={<BarChart3 className="w-4 h-4 text-emerald-400" />} label="Ir a Finanzas" onSelect={() => go("finanzas")} shortcut="g f" />
            <Item icon={<Plug className="w-4 h-4 text-purple-400" />} label="Ir a Ajustes" onSelect={() => go("config")} shortcut="g a" />
          </Command.Group>

          <Command.Group heading="Acciones del agente" className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-2 py-1.5 mt-2">
            {onSync && (
              <Item
                icon={<RefreshCw className="w-4 h-4 text-sinergia-400" />}
                label="Sincronizar Gmail ahora"
                onSelect={() => {
                  setOpen(false);
                  toast.promise(Promise.resolve(onSync()), {
                    loading: "Sincronizando Gmail…",
                    success: "Sincronización completada",
                    error: "Error sincronizando",
                  });
                }}
              />
            )}
            <Item
              icon={<Sparkles className="w-4 h-4 text-sinergia-400" />}
              label="Categorizar emails nuevos"
              onSelect={() => runAction("Categorizar emails", () => fetch("/api/agent/categorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))}
            />
            <Item
              icon={<FileText className="w-4 h-4 text-yellow-400" />}
              label="Extraer facturas"
              onSelect={() => runAction("Extraer facturas", () => fetch("/api/agent/invoice-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: true }) }))}
            />
            <Item
              icon={<Send className="w-4 h-4 text-indigo-400" />}
              label="Generar auto-borradores"
              onSelect={() => runAction("Generar borradores", () => fetch("/api/agent/auto-drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tone: "profesional" }) }))}
            />
            <Item
              icon={<Users className="w-4 h-4 text-lime-400" />}
              label="Re-extraer contactos"
              onSelect={() => runAction("Extraer contactos", () => fetch("/api/agent/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))}
            />
          </Command.Group>

          <Command.Group heading="Descargas Excel" className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-2 py-1.5 mt-2">
            <Item icon={<Download className="w-4 h-4 text-teal-400" />} label="Excel — Resumen ejecutivo" onSelect={() => downloadExcel("executive")} />
            <Item icon={<Download className="w-4 h-4 text-teal-400" />} label="Excel — Facturas" onSelect={() => downloadExcel("invoices")} />
            <Item icon={<Download className="w-4 h-4 text-teal-400" />} label="Excel — Análisis de gastos" onSelect={() => downloadExcel("expenses")} />
            <Item icon={<Download className="w-4 h-4 text-teal-400" />} label="Excel — Emails" onSelect={() => downloadExcel("emails")} />
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Item({
  icon,
  label,
  onSelect,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  shortcut?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] data-[selected=true]:bg-sinergia-500/10 data-[selected=true]:text-sinergia-400 transition"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="text-[10px] text-[var(--text-secondary)] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-card)]">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
