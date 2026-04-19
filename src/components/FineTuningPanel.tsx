"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap,
  Database,
  MessageSquare,
  Tag,
  FileText,
  Play,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ═══ Types ═══

interface Stats {
  drafts: number;
  conversations: number;
  categorizations: number;
  total: number;
}

interface TrainingMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TrainingExample {
  messages: TrainingMessage[];
}

interface Preview {
  drafts: TrainingExample[];
  conversations: TrainingExample[];
  categorizations: TrainingExample[];
}

interface Job {
  id: string;
  status: string;
  model: string;
  fine_tuned_model: string | null;
  created_at: number;
}

interface GenerateResult {
  jsonl: string;
  examples: number;
  estimatedCost: string;
}

// ═══ Status helpers ═══

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  validating_files: { color: "text-yellow-400", label: "Validando archivos", icon: <Clock className="w-4 h-4" /> },
  queued: { color: "text-blue-400", label: "En cola", icon: <Clock className="w-4 h-4" /> },
  running: { color: "text-cyan-400", label: "Entrenando", icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  succeeded: { color: "text-emerald-400", label: "Completado", icon: <CheckCircle2 className="w-4 h-4" /> },
  failed: { color: "text-red-400", label: "Error", icon: <XCircle className="w-4 h-4" /> },
  cancelled: { color: "text-slate-400", label: "Cancelado", icon: <XCircle className="w-4 h-4" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { color: "text-slate-400", label: status, icon: null };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ═══ Main Panel ═══

export default function FineTuningPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [training, setTraining] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["drafts", "conversations", "categorizations"]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);

  // ── Fetch stats & jobs ──
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/fine-tuning");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setJobs(data.jobs || []);
      }
    } catch (e: any) {
      console.error("Error fetching fine-tuning data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh running jobs every 30s
  useEffect(() => {
    const hasRunning = jobs.some((j) =>
      ["validating_files", "queued", "running"].includes(j.status)
    );
    if (!hasRunning) return;

    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [jobs, fetchData]);

  // ── Extract training data ──
  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/fine-tuning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats(data.stats);
      setPreview(data.preview);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  };

  // ── Generate JSONL ──
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/fine-tuning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", types: selectedTypes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGenerateResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // ── Start training ──
  const handleStartTraining = async () => {
    setTraining(true);
    setError(null);
    try {
      const res = await fetch("/api/fine-tuning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          model: selectedModel,
          types: selectedTypes,
          suffix: "sinergia",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Refresh jobs list
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTraining(false);
    }
  };

  // ── Copy to clipboard ──
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Toggle type selection ──
  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  const activeJobs = jobs.filter((j) =>
    ["validating_files", "queued", "running"].includes(j.status)
  );
  const completedModels = jobs.filter((j) => j.status === "succeeded" && j.fine_tuned_model);
  const failedJobs = jobs.filter((j) => j.status === "failed");

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5" />
        <div className="relative flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
            <GraduationCap className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              Entrenar Modelo IA Personalizado
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Crea un modelo OpenAI entrenado con los datos reales de tu negocio:
              borradores aprobados, conversaciones con el agente y categorizaciones de emails.
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats Overview ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          label="Borradores aprobados"
          value={stats?.drafts ?? 0}
          color="cyan"
          selected={selectedTypes.includes("drafts")}
          onToggle={() => toggleType("drafts")}
        />
        <StatCard
          icon={<MessageSquare className="w-5 h-5" />}
          label="Conversaciones"
          value={stats?.conversations ?? 0}
          color="purple"
          selected={selectedTypes.includes("conversations")}
          onToggle={() => toggleType("conversations")}
        />
        <StatCard
          icon={<Tag className="w-5 h-5" />}
          label="Categorizaciones"
          value={stats?.categorizations ?? 0}
          color="emerald"
          selected={selectedTypes.includes("categorizations")}
          onToggle={() => toggleType("categorizations")}
        />
        <div className="glass-card p-4 flex flex-col items-center justify-center">
          <Database className="w-5 h-5 text-amber-400 mb-2" />
          <p className="text-2xl font-black font-mono text-amber-400">{stats?.total ?? 0}</p>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mt-1">
            Total ejemplos
          </p>
        </div>
      </div>

      {/* ── Minimum threshold warning ── */}
      {stats && stats.total < 10 && (
        <div className="glass-card p-4 border-l-4 border-amber-500/60 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-400">Datos insuficientes</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Necesitas al menos 10 ejemplos para entrenar un modelo. Tienes {stats.total}.
              Sigue usando el agente IA, aprobando borradores y categorizando emails para generar
              mas datos de entrenamiento.
            </p>
          </div>
        </div>
      )}

      {/* ── Step 1: Extract ── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">
              1
            </span>
            <h4 className="font-semibold text-[var(--text-primary)]">Extraer Datos de Entrenamiento</h4>
          </div>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-medium hover:bg-cyan-500/20 transition disabled:opacity-50 flex items-center gap-2"
          >
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Extraer Datos
          </button>
        </div>

        {/* Preview */}
        {preview && (
          <div className="space-y-3 mt-4">
            <PreviewSection
              title="Borradores aprobados"
              examples={preview.drafts}
              expanded={expandedPreview === "drafts"}
              onToggle={() => setExpandedPreview(expandedPreview === "drafts" ? null : "drafts")}
              color="cyan"
            />
            <PreviewSection
              title="Conversaciones"
              examples={preview.conversations}
              expanded={expandedPreview === "conversations"}
              onToggle={() => setExpandedPreview(expandedPreview === "conversations" ? null : "conversations")}
              color="purple"
            />
            <PreviewSection
              title="Categorizaciones"
              examples={preview.categorizations}
              expanded={expandedPreview === "categorizations"}
              onToggle={() => setExpandedPreview(expandedPreview === "categorizations" ? null : "categorizations")}
              color="emerald"
            />
          </div>
        )}
      </div>

      {/* ── Step 2: Generate JSONL ── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold">
              2
            </span>
            <h4 className="font-semibold text-[var(--text-primary)]">Generar Archivo de Entrenamiento</h4>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || selectedTypes.length === 0}
            className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generar JSONL
          </button>
        </div>

        {generateResult && (
          <div className="mt-4 p-4 rounded-xl bg-[#0a1628]/60 border border-[var(--border)]">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-purple-400">{generateResult.examples}</p>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Ejemplos</p>
              </div>
              <div>
                <p className="text-lg font-bold text-cyan-400">
                  {(generateResult.jsonl.length / 1024).toFixed(1)} KB
                </p>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Tamano JSONL</p>
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-400">{generateResult.estimatedCost}</p>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Coste estimado</p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-3 text-center">
              Coste de entrenamiento con gpt-4o-mini: ~$0.008/1K tokens (4 epochs por defecto)
            </p>
          </div>
        )}
      </div>

      {/* ── Step 3: Start Training ── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
              3
            </span>
            <h4 className="font-semibold text-[var(--text-primary)]">Iniciar Entrenamiento</h4>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">Modelo base</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl bg-[#0a1628] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500/50 transition appearance-none"
            >
              <option value="gpt-4o-mini">gpt-4o-mini (recomendado - ~$0.008/1K tokens)</option>
              <option value="gpt-4o">gpt-4o (premium - ~$0.08/1K tokens)</option>
            </select>
          </div>
          <button
            onClick={handleStartTraining}
            disabled={training || !stats || stats.total < 10}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-white text-sm font-semibold hover:from-cyan-400 hover:to-emerald-400 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            {training ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Iniciar Entrenamiento
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="glass-card p-4 border-l-4 border-red-500/60 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-400">Error</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ── Active Jobs ── */}
      {activeJobs.length > 0 && (
        <div className="glass-card p-6">
          <h4 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            Entrenamientos en curso
          </h4>
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <JobCard key={job.id} job={job} onCopy={copyToClipboard} copied={copied} />
            ))}
          </div>
        </div>
      )}

      {/* ── Completed Models ── */}
      {completedModels.length > 0 && (
        <div className="glass-card p-6">
          <h4 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Modelos Entrenados
          </h4>
          <div className="space-y-3">
            {completedModels.map((job) => (
              <div
                key={job.id}
                className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <StatusBadge status={job.status} />
                    <p className="text-sm font-mono text-emerald-400 mt-1.5">{job.fine_tuned_model}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                      Creado: {new Date(job.created_at * 1000).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(job.fine_tuned_model!, job.id)}
                    className="p-2 rounded-lg hover:bg-emerald-500/10 transition text-emerald-400"
                    title="Copiar ID del modelo"
                  >
                    {copied === job.id ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-2 px-2 py-1 rounded bg-[#0a1628]/60">
                  Usa este modelo configurando GPT5_MODEL={job.fine_tuned_model} en tus variables de entorno.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Failed Jobs ── */}
      {failedJobs.length > 0 && (
        <div className="glass-card p-6">
          <h4 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <XCircle className="w-4 h-4 text-red-400" />
            Entrenamientos fallidos
          </h4>
          <div className="space-y-3">
            {failedJobs.map((job) => (
              <JobCard key={job.id} job={job} onCopy={copyToClipboard} copied={copied} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Stat Card ═══

function StatCard({
  icon,
  label,
  value,
  color,
  selected,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const colorMap: Record<string, string> = {
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };
  const colors = colorMap[color] || colorMap.cyan;
  const [textColor] = colors.split(" ");

  return (
    <button
      onClick={onToggle}
      className={`glass-card p-4 flex flex-col items-center justify-center text-center transition cursor-pointer ${
        selected ? "ring-1 ring-cyan-500/40" : "opacity-60"
      }`}
    >
      <span className={textColor}>{icon}</span>
      <p className={`text-2xl font-black font-mono mt-2 ${textColor}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mt-1">
        {label}
      </p>
      <span className={`text-[9px] mt-2 px-2 py-0.5 rounded-full ${selected ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-500/20 text-slate-500"}`}>
        {selected ? "Incluido" : "Excluido"}
      </span>
    </button>
  );
}

// ═══ Preview Section ═══

function PreviewSection({
  title,
  examples,
  expanded,
  onToggle,
  color,
}: {
  title: string;
  examples: TrainingExample[];
  expanded: boolean;
  onToggle: () => void;
  color: string;
}) {
  if (examples.length === 0) return null;

  const colorMap: Record<string, string> = {
    cyan: "text-cyan-400",
    purple: "text-purple-400",
    emerald: "text-emerald-400",
  };

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#0a1628]/40 transition"
      >
        <span className={`text-sm font-medium ${colorMap[color] || "text-cyan-400"}`}>
          {title} ({examples.length} ejemplos)
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {examples.map((ex, i) => (
            <div key={i} className="rounded-lg bg-[#0a1628]/60 p-3 space-y-2">
              {ex.messages
                .filter((m) => m.role !== "system")
                .map((msg, j) => (
                  <div key={j} className="text-xs">
                    <span
                      className={`font-semibold uppercase tracking-wide ${
                        msg.role === "user" ? "text-blue-400" : "text-emerald-400"
                      }`}
                    >
                      {msg.role === "user" ? "Usuario" : "Asistente"}:
                    </span>
                    <p className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap line-clamp-4">
                      {msg.content}
                    </p>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ Job Card ═══

function JobCard({
  job,
  onCopy,
  copied,
}: {
  job: Job;
  onCopy: (text: string, label: string) => void;
  copied: string | null;
}) {
  return (
    <div className="p-4 rounded-xl bg-[#0a1628]/40 border border-[var(--border)]">
      <div className="flex items-center justify-between">
        <div>
          <StatusBadge status={job.status} />
          <p className="text-xs font-mono text-[var(--text-secondary)] mt-1">{job.id}</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
            Modelo base: {job.model} | Creado:{" "}
            {new Date(job.created_at * 1000).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          onClick={() => onCopy(job.id, `job-${job.id}`)}
          className="p-2 rounded-lg hover:bg-cyan-500/10 transition text-[var(--text-secondary)]"
          title="Copiar Job ID"
        >
          {copied === `job-${job.id}` ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
