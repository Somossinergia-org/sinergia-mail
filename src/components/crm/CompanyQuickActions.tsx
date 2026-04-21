"use client";

import { useState } from "react";
import {
  CheckSquare,
  Activity,
  Bot,
  AlertTriangle,
  Zap,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CompanyQuickActionsProps {
  companyId: number;
  companyName: string;
  hasEnergy?: boolean;
  onRefresh?: () => void;
  onOpenAgent?: (context: string) => void;
  onSwitchTab?: (tab: string) => void;
}

type InlineForm = "tarea" | "actividad" | null;

const ACTIVITY_TYPES = [
  { value: "llamada", label: "Llamada" },
  { value: "email", label: "Email" },
  { value: "reunion", label: "Reunión" },
  { value: "visita", label: "Visita" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "nota", label: "Nota" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CompanyQuickActions({
  companyId,
  companyName,
  hasEnergy = false,
  onRefresh,
  onOpenAgent,
  onSwitchTab,
}: CompanyQuickActionsProps) {
  const [inlineForm, setInlineForm] = useState<InlineForm>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("media");
  const [activitySummary, setActivitySummary] = useState("");
  const [activityType, setActivityType] = useState("llamada");
  const [submitting, setSubmitting] = useState(false);

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          companyId,
          priority: taskPriority,
          source: "manual",
        }),
      });
      if (res.ok) {
        toast.success("Tarea creada");
        setTaskTitle("");
        setInlineForm(null);
        onRefresh?.();
      } else {
        toast.error("Error al crear tarea");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogActivity = async () => {
    if (!activitySummary.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          type: activityType,
          summary: activitySummary,
        }),
      });
      if (res.ok) {
        toast.success("Actividad registrada");
        setActivitySummary("");
        setInlineForm(null);
        onRefresh?.();
      } else {
        toast.error("Error al registrar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setInlineForm(inlineForm === "tarea" ? null : "tarea")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border active:scale-95 ${
            inlineForm === "tarea"
              ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
              : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/30"
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          Tarea
        </button>

        <button
          onClick={() =>
            setInlineForm(inlineForm === "actividad" ? null : "actividad")
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border active:scale-95 ${
            inlineForm === "actividad"
              ? "bg-green-500/20 border-green-500/40 text-green-300"
              : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-green-400 hover:border-green-500/30"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Actividad
        </button>

        {onOpenAgent && (
          <button
            onClick={() =>
              onOpenAgent(
                `Contexto: empresa "${companyName}" (ID: ${companyId}). Ayúdame con esta empresa.`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-purple-400 hover:border-purple-500/30 transition active:scale-95"
          >
            <Bot className="w-3.5 h-3.5" />
            Preguntar IA
          </button>
        )}

        {hasEnergy && onSwitchTab && (
          <button
            onClick={() => onSwitchTab("energia")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-amber-400 hover:border-amber-500/30 transition active:scale-95"
          >
            <Zap className="w-3.5 h-3.5" />
            Energía
          </button>
        )}
      </div>

      {/* Inline task form */}
      {inlineForm === "tarea" && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--bg-card)] border border-blue-500/20 animate-slide-up">
          <input
            type="text"
            placeholder="¿Qué hay que hacer?"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTask();
              if (e.key === "Escape") setInlineForm(null);
            }}
          />
          <select
            value={taskPriority}
            onChange={(e) => setTaskPriority(e.target.value)}
            className="bg-transparent text-xs border border-[var(--border)] rounded px-1 py-0.5"
          >
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
          <button
            onClick={handleCreateTask}
            disabled={submitting || !taskTitle.trim()}
            className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => setInlineForm(null)}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Inline activity form */}
      {inlineForm === "actividad" && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--bg-card)] border border-green-500/20 animate-slide-up">
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="bg-transparent text-xs border border-[var(--border)] rounded px-1 py-0.5"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Resumen de la actividad..."
            value={activitySummary}
            onChange={(e) => setActivitySummary(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogActivity();
              if (e.key === "Escape") setInlineForm(null);
            }}
          />
          <button
            onClick={handleLogActivity}
            disabled={submitting || !activitySummary.trim()}
            className="p-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => setInlineForm(null)}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
