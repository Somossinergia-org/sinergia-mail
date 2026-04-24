"use client";

/**
 * WordPressLivePanel — Panel integrado en la Oficina IA que muestra
 * las acciones de WordPress del agente en tiempo real.
 *
 * Se conecta a /api/wordpress/live via SSE y muestra cada paso
 * con animaciones. Diseñado para ir DEBAJO del mapa de oficina,
 * no como pestaña separada.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Globe, Play, CheckCircle2, AlertCircle, Loader2, Zap, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

interface LiveStep {
  step: number;
  total: number;
  action: string;
  detail: string;
  status: "running" | "done" | "error";
  agentId: string;
  timestamp: string;
}

interface LiveComplete {
  type: "complete";
  summary: string;
  timestamp: string;
}

interface LiveError {
  type: "error";
  message: string;
  timestamp: string;
}

type LiveEvent = LiveStep | LiveComplete | LiveError;

interface WpTask {
  id: string;
  label: string;
  description: string;
}

// ─── Agent color map ──────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  "consultor-digital": "#06b6d4",
  "marketing-automation": "#ec4899",
  "ceo": "#f59e0b",
  default: "#6366f1",
};

function getAgentColor(agentId: string): string {
  return AGENT_COLORS[agentId] || AGENT_COLORS.default;
}

function getAgentName(agentId: string): string {
  const names: Record<string, string> = {
    "consultor-digital": "Consultor Digital",
    "marketing-automation": "Marketing",
    "ceo": "CEO",
  };
  return names[agentId] || agentId;
}

// ─── Component ────────────────────────────────────────────────────────

export default function WordPressLivePanel() {
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [tasks, setTasks] = useState<WpTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<string>("modernize_homepage");
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [steps]);

  // Fetch available tasks on mount
  useEffect(() => {
    fetch("/api/wordpress/live")
      .then((r) => r.json())
      .then((data) => {
        if (data.tasks) setTasks(data.tasks);
      })
      .catch(() => {
        // Default tasks if fetch fails
        setTasks([
          { id: "modernize_homepage", label: "Modernizar Homepage", description: "Rediseña la página de inicio" },
          { id: "list_content", label: "Listar Contenido", description: "Muestra todo el contenido" },
        ]);
      });
  }, []);

  // Execute task with SSE streaming
  const executeTask = useCallback(async () => {
    if (isRunning) return;

    // Reset state
    setSteps([]);
    setIsRunning(true);
    setIsComplete(false);
    setSummary(null);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/wordpress/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: selectedTask, siteId: "1" }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event: LiveEvent = JSON.parse(jsonStr);

            if ("type" in event && event.type === "complete") {
              setSummary((event as LiveComplete).summary);
              setIsComplete(true);
            } else if ("type" in event && event.type === "error") {
              setError((event as LiveError).message);
            } else if ("step" in event) {
              setSteps((prev) => {
                const step = event as LiveStep;
                // Update existing step or add new
                const existing = prev.findIndex(
                  (s) => s.step === step.step && s.status === "running",
                );
                if (existing >= 0 && step.status !== "running") {
                  const updated = [...prev];
                  updated[existing] = step;
                  return updated;
                }
                // Avoid duplicates
                if (prev.some((s) => s.step === step.step && s.status === step.status)) {
                  return prev;
                }
                return [...prev, step];
              });
            }
          } catch {
            // Skip malformed
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, selectedTask]);

  // Cancel
  const cancelTask = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  // Progress calculation
  const progress = steps.length > 0
    ? Math.round((steps.filter((s) => s.status === "done").length / (steps[0]?.total || 1)) * 100)
    : 0;

  const currentStep = steps.filter((s) => s.status === "running").pop();

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-[var(--border)]">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 hover:from-cyan-500/10 hover:to-purple-500/10 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Globe className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              WordPress en Directo
            </h3>
            <p className="text-[10px] text-[var(--text-secondary)]">
              {isRunning
                ? `Agente trabajando... ${progress}%`
                : isComplete
                  ? "Tarea completada"
                  : "El agente puede modificar tu web en tiempo real"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
              <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
              <span className="text-[10px] text-cyan-400 font-mono">{progress}%</span>
            </div>
          )}
          {isComplete && !isRunning && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30">
              <CheckCircle2 className="w-3 h-3 text-green-400" />
              <span className="text-[10px] text-green-400">OK</span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
          )}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="p-4 space-y-3">
          {/* Task Selector + Execute */}
          <div className="flex gap-2">
            <select
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
              disabled={isRunning}
              className="flex-1 px-3 py-2 rounded-lg text-xs bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] focus:border-cyan-500/50 outline-none disabled:opacity-50"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.description}
                </option>
              ))}
            </select>
            {isRunning ? (
              <button
                onClick={cancelTask}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition"
              >
                Parar
              </button>
            ) : (
              <button
                onClick={executeTask}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                Ejecutar
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {(isRunning || isComplete) && (
            <div className="relative h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progress}%`,
                  background: error
                    ? "#ef4444"
                    : isComplete
                      ? "#10b981"
                      : "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                }}
              />
              {isRunning && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full animate-pulse opacity-50"
                  style={{
                    width: `${progress + 5}%`,
                    background: "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                  }}
                />
              )}
            </div>
          )}

          {/* Current action banner */}
          {currentStep && isRunning && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20 animate-pulse">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-cyan-400 font-mono">
                {getAgentName(currentStep.agentId)}: {currentStep.action}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] ml-auto">
                Paso {currentStep.step}/{currentStep.total}
              </span>
            </div>
          )}

          {/* Live Log */}
          <div
            ref={logRef}
            className="max-h-[240px] overflow-y-auto space-y-1 custom-scrollbar"
          >
            {steps.length === 0 && !isRunning && (
              <p className="text-[10px] text-[var(--text-secondary)] italic font-mono py-6 text-center">
                Selecciona una tarea y pulsa Ejecutar para ver al agente trabajar en directo
              </p>
            )}
            {steps.map((s, i) => (
              <div
                key={`${s.step}-${s.status}-${i}`}
                className="flex items-start gap-2 py-1.5 px-2 rounded-md transition-all duration-300"
                style={{
                  background:
                    s.status === "running"
                      ? "rgba(6,182,212,0.05)"
                      : s.status === "error"
                        ? "rgba(239,68,68,0.05)"
                        : "transparent",
                }}
              >
                {/* Status icon */}
                <span className="mt-0.5 shrink-0">
                  {s.status === "running" && (
                    <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                  )}
                  {s.status === "done" && (
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                  )}
                  {s.status === "error" && (
                    <AlertCircle className="w-3 h-3 text-red-400" />
                  )}
                </span>

                {/* Timestamp */}
                <span className="text-[9px] text-[var(--text-secondary)] font-mono mt-0.5 shrink-0">
                  {new Date(s.timestamp).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>

                {/* Agent badge */}
                <span
                  className="text-[10px] font-bold shrink-0"
                  style={{ color: getAgentColor(s.agentId) }}
                >
                  [{getAgentName(s.agentId)}]
                </span>

                {/* Action + detail */}
                <div className="min-w-0">
                  <span className="text-[10px] text-[var(--text-primary)] font-mono font-semibold">
                    {s.action}
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-1">
                    — {s.detail}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          {summary && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-500/5 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-green-400 font-semibold">Tarea completada</p>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">
                  {summary}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-red-400 font-semibold">Error</p>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">
                  {error}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
