"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Cpu,
  Zap,
  Shield,
  BarChart3,
  Send,
  Save,
  Loader2,
  X,
  Plus,
  Play,
  AlertTriangle,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface AgentConfigData {
  id?: number;
  autoCategorizeOnSync: boolean;
  autoSummarize: boolean;
  defaultDraftTone: string;
  weeklyReportEnabled: boolean;
  weeklyReportDay: number;
  agentName: string;
  agentPersonality: string;
  customSystemPrompt: string | null;
  businessContext: string | null;
  autoReplies: boolean;
  autoCategories: boolean;
  escalationEmail: string | null;
  preferredModel: string;
  fineTunedModelId: string | null;
  maxAutoActions: number;
  neverAutoReply: string[];
  alwaysNotify: string[];
  signatureHtml: string | null;
  timezone: string;
  language: string;
}

const DEFAULT_CONFIG: AgentConfigData = {
  autoCategorizeOnSync: true,
  autoSummarize: true,
  defaultDraftTone: "profesional",
  weeklyReportEnabled: true,
  weeklyReportDay: 1,
  agentName: "Sinergia IA",
  agentPersonality: "profesional",
  customSystemPrompt: null,
  businessContext: null,
  autoReplies: false,
  autoCategories: true,
  escalationEmail: null,
  preferredModel: "auto",
  fineTunedModelId: null,
  maxAutoActions: 5,
  neverAutoReply: [],
  alwaysNotify: [],
  signatureHtml: null,
  timezone: "Europe/Madrid",
  language: "es",
};

const PERSONALITIES = [
  { value: "profesional", label: "Profesional", desc: "Directo, resolutivo y cortés" },
  { value: "casual", label: "Casual", desc: "Cercano, amigable y relajado" },
  { value: "formal", label: "Formal", desc: "Protocolo estricto, muy educado" },
  { value: "tecnico", label: "Tecnico", desc: "Preciso, detallado y tecnico" },
];

const MODELS = [
  { value: "auto", label: "Auto (recomendado)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gpt-5", label: "GPT-5" },
  { value: "fine-tuned", label: "Fine-tuned personalizado" },
];

const TONES = [
  { value: "profesional", label: "Profesional" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "firme", label: "Firme" },
  { value: "amable", label: "Amable" },
];

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miercoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sabado" },
];

const TIMEZONES = [
  "Europe/Madrid",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Buenos_Aires",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Pacific/Auckland",
];

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInput("");
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-cyan-500/50 transition"
        />
        <button
          onClick={addTag}
          type="button"
          className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition text-sm"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="hover:text-red-400 transition"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  warning,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  warning?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked
            ? "bg-cyan-500"
            : "bg-[var(--bg-card)] border border-[var(--border)]"
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
            {description}
          </div>
        )}
        {warning && checked && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {warning}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentConfigPanel() {
  const [config, setConfig] = useState<AgentConfigData>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Test prompt state
  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<{
    model: string;
    personality: string;
    systemPrompt: string;
    userMessage: string;
    simulatedResponse: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-config");
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...DEFAULT_CONFIG, ...data.config });
      }
    } catch (e) {
      console.error("Error loading config:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateField = <K extends keyof AgentConfigData>(
    key: K,
    value: AgentConfigData[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/agent-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...DEFAULT_CONFIG, ...data.config });
        setDirty(false);
        toast.success("Configuracion guardada correctamente");
      } else {
        toast.error("Error al guardar configuracion");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_prompt", message: testMessage }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data.test);
      } else {
        toast.error("Error al probar prompt");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        <span className="ml-3 text-sm text-[var(--text-secondary)]">
          Cargando configuracion del agente...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30"
            style={{ boxShadow: "0 0 20px rgba(6, 182, 212, 0.2)" }}
          >
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-shimmer">
              Manual del Agente
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Configura exactamente como se comporta tu asistente IA
            </p>
          </div>
        </div>
      </div>

      {/* Section: Identidad del Agente */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-400">
            Identidad del Agente
          </h3>
        </div>

        {/* Agent Name */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Nombre del agente
          </label>
          <input
            type="text"
            value={config.agentName}
            onChange={(e) => updateField("agentName", e.target.value)}
            placeholder="Sinergia IA"
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-cyan-500/50 transition"
          />
        </div>

        {/* Personality */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Personalidad
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PERSONALITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => updateField("agentPersonality", p.value)}
                className={`p-3 rounded-xl border text-left transition ${
                  config.agentPersonality === p.value
                    ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                    : "border-[var(--border)] bg-[var(--bg-card)] hover:border-cyan-500/30"
                }`}
              >
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  {p.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom System Prompt */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Instrucciones personalizadas
          </label>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Escribe aqui instrucciones adicionales para el agente. Ejemplo:
            &ldquo;Siempre menciona nuestro telefono en las respuestas...&rdquo;
          </p>
          <textarea
            value={config.customSystemPrompt ?? ""}
            onChange={(e) =>
              updateField("customSystemPrompt", e.target.value || null)
            }
            rows={4}
            placeholder="Instrucciones adicionales que el agente seguira en cada interaccion..."
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-cyan-500/50 transition resize-y font-mono"
          />
        </div>

        {/* Business Context */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Contexto de negocio
          </label>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Informacion que el agente siempre debe saber sobre tu empresa
          </p>
          <textarea
            value={config.businessContext ?? ""}
            onChange={(e) =>
              updateField("businessContext", e.target.value || null)
            }
            rows={4}
            placeholder="Ej: Somos una empresa de servicios energeticos en Orihuela. Nuestros clientes principales son comunidades de vecinos..."
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-cyan-500/50 transition resize-y font-mono"
          />
        </div>
      </div>

      {/* Section: Modelo de IA */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-400">
            Modelo de IA
          </h3>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Modelo preferido
          </label>
          <select
            value={config.preferredModel}
            onChange={(e) => updateField("preferredModel", e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500/50 transition appearance-none"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {config.preferredModel === "fine-tuned" && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              ID del modelo fine-tuned
            </label>
            <input
              type="text"
              value={config.fineTunedModelId ?? ""}
              onChange={(e) =>
                updateField("fineTunedModelId", e.target.value || null)
              }
              placeholder="ft:gpt-4o-2024-08-06:my-org::abc123"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500/50 transition font-mono"
            />
          </div>
        )}
      </div>

      {/* Section: Automatizacion */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Automatizacion
          </h3>
        </div>

        <Toggle
          checked={config.autoCategorizeOnSync}
          onChange={(v) => updateField("autoCategorizeOnSync", v)}
          label="Auto-categorizar en sync"
          description="Clasificar emails automaticamente al sincronizar"
        />

        <Toggle
          checked={config.autoSummarize}
          onChange={(v) => updateField("autoSummarize", v)}
          label="Auto-generar resumenes"
          description="Crear resumenes IA de cada email nuevo"
        />

        <Toggle
          checked={config.autoReplies}
          onChange={(v) => updateField("autoReplies", v)}
          label="Auto-respuestas a emails rutinarios"
          description="El agente generara borradores de respuesta automaticamente"
          warning="El agente creara borradores sin tu supervision previa"
        />

        {/* Max auto actions slider */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Maximo acciones automaticas por sync:{" "}
            <span className="text-cyan-400 font-bold">
              {config.maxAutoActions}
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={config.maxAutoActions}
            onChange={(e) =>
              updateField("maxAutoActions", parseInt(e.target.value))
            }
            className="w-full accent-cyan-500"
          />
          <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
            <span>1 (conservador)</span>
            <span>20 (agresivo)</span>
          </div>
        </div>

        {/* Default draft tone */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Tono por defecto para borradores
          </label>
          <select
            value={config.defaultDraftTone}
            onChange={(e) => updateField("defaultDraftTone", e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-amber-500/50 transition appearance-none"
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Escalation email */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Email de escalacion
          </label>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Se notificara a este email cuando el agente no pueda gestionar algo
          </p>
          <input
            type="email"
            value={config.escalationEmail ?? ""}
            onChange={(e) =>
              updateField("escalationEmail", e.target.value || null)
            }
            placeholder="gerente@tuempresa.com"
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-amber-500/50 transition"
          />
        </div>
      </div>

      {/* Section: Reglas de comportamiento */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
            Reglas de comportamiento
          </h3>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Nunca responder automaticamente a:
          </label>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Patrones de email que el agente nunca debe auto-responder
          </p>
          <TagInput
            tags={config.neverAutoReply ?? []}
            onChange={(tags) => updateField("neverAutoReply", tags)}
            placeholder="ej: *@hacienda.gob.es, legal@*"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Siempre notificar cuando:
          </label>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Patrones que siempre generan notificacion
          </p>
          <TagInput
            tags={config.alwaysNotify ?? []}
            onChange={(tags) => updateField("alwaysNotify", tags)}
            placeholder='ej: urgente, factura vencida, "pago inmediato"'
          />
        </div>
      </div>

      {/* Section: Informes */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-400">
            Informes
          </h3>
        </div>

        <Toggle
          checked={config.weeklyReportEnabled}
          onChange={(v) => updateField("weeklyReportEnabled", v)}
          label="Informe semanal activado"
          description="El agente generara un informe semanal automaticamente"
        />

        {config.weeklyReportEnabled && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Dia del informe
            </label>
            <select
              value={config.weeklyReportDay}
              onChange={(e) =>
                updateField("weeklyReportDay", parseInt(e.target.value))
              }
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-indigo-500/50 transition appearance-none"
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Zona horaria
          </label>
          <select
            value={config.timezone}
            onChange={(e) => updateField("timezone", e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-indigo-500/50 transition appearance-none"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section: Prueba en vivo */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Play className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-rose-400">
            Prueba en vivo
          </h3>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">
          Escribe un mensaje de prueba para ver como responderia el agente con la
          configuracion actual.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTest();
            }}
            placeholder="Ej: Tengo una factura pendiente de Iberdrola, que hago?"
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-rose-500/50 transition"
          />
          <button
            onClick={handleTest}
            disabled={testing || !testMessage.trim()}
            className="px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition text-sm font-medium disabled:opacity-40 flex items-center gap-2"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Probar
          </button>
        </div>

        {testResult && (
          <div className="space-y-3 p-4 rounded-xl bg-[var(--bg-body)] border border-[var(--border)]">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase">
                  Modelo
                </div>
                <div className="text-sm font-medium text-purple-400">
                  {testResult.model}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase">
                  Personalidad
                </div>
                <div className="text-sm font-medium text-cyan-400">
                  {testResult.personality}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase">
                  Mensaje
                </div>
                <div className="text-sm font-medium truncate">
                  {testResult.userMessage}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[var(--text-secondary)] uppercase mb-1">
                System Prompt generado
              </div>
              <pre className="text-xs bg-[var(--bg-card)] p-3 rounded-lg border border-[var(--border)] overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {testResult.systemPrompt}
              </pre>
            </div>

            <div>
              <div className="text-[10px] text-[var(--text-secondary)] uppercase mb-1">
                Respuesta simulada
              </div>
              <div className="text-sm p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                {testResult.simulatedResponse}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="sticky bottom-4 z-10">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition ${
            dirty
              ? "bg-cyan-500 text-white hover:bg-cyan-600 shadow-lg shadow-cyan-500/25"
              : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]"
          } disabled:opacity-50`}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : dirty ? (
            <Save className="w-4 h-4" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {saving
            ? "Guardando..."
            : dirty
              ? "Guardar Configuracion"
              : "Configuracion guardada"}
        </button>
      </div>
    </div>
  );
}
