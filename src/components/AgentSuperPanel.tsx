"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Send,
  Loader2,
  Cpu,
  Zap,
  Brain,
  Shield,
  Mail,
  Calculator,
  Calendar,
  Users,
  Flame,
  Settings2,
  ChevronDown,
  ChevronUp,
  Mic,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Activity,
  MessageSquare,
  BarChart3,
  Clock,
  RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; success: boolean }>;
  delegations?: Array<{ toAgent: string; reason: string; reply: string }>;
  tokensUsed?: number;
  durationMs?: number;
  timestamp: number;
}

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  status: "idle" | "active" | "delegating";
  priority: number;
}

interface SwarmStatusData {
  agents: AgentStatus[];
  gpt5Available: boolean;
  totalAgents: number;
}

// ─── Agent Metadata ──────────────────────────────────────────────────────

const AGENT_META: Record<string, { icon: typeof Bot; color: string; label: string }> = {
  ceo: { icon: Cpu, color: "text-cyan-400", label: "CEO" },
  "recepcion": { icon: Mail, color: "text-blue-400", label: "Recepción" },
  "comercial-principal": { icon: Users, color: "text-purple-400", label: "C.Principal" },
  "comercial-junior": { icon: Users, color: "text-orange-500", label: "C.Junior" },
  "consultor-servicios": { icon: Flame, color: "text-orange-400", label: "Servicios" },
  "consultor-digital": { icon: Settings2, color: "text-pink-400", label: "Digital" },
  "fiscal": { icon: Calculator, color: "text-yellow-400", label: "Fiscal" },
  "legal-rgpd": { icon: Shield, color: "text-red-400", label: "RGPD" },
  "marketing-automation": { icon: Sparkles, color: "text-fuchsia-400", label: "Marketing" },
  "bi-scoring": { icon: Calendar, color: "text-green-400", label: "BI/Scoring" },
  "gemini-fallback": { icon: Sparkles, color: "text-amber-400", label: "Gemini" },
};

const QUICK_ACTIONS = [
  { label: "Briefing del dia", prompt: "Dame el briefing ejecutivo de hoy: emails urgentes, facturas pendientes y proximos eventos." },
  { label: "Estado del negocio", prompt: "Dame una vision completa del estado del negocio ahora mismo." },
  { label: "Facturas pendientes", prompt: "Cuales son las facturas vencidas o proximas a vencer?" },
  { label: "Emails urgentes", prompt: "Que emails sin leer tienen prioridad alta? Resume los mas importantes." },
];

// ─── Component ───────────────────────────────────────────────────────────

export default function AgentSuperPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [swarmStatus, setSwarmStatus] = useState<SwarmStatusData | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<Array<{ name: string; success: boolean }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Load Swarm Status ──────────────────────────────────────────────

  const loadSwarmStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-gpt5");
      if (res.ok) {
        const data = await res.json();
        setSwarmStatus(data);
      }
    } catch {
      // Silently fail, status is non-critical
    }
  }, []);

  useEffect(() => {
    loadSwarmStatus();
    const interval = setInterval(loadSwarmStatus, 30000);
    return () => clearInterval(interval);
  }, [loadSwarmStatus]);

  // ─── Auto-scroll ────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // ─── Send Message ───────────────────────────────────────────────────

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setActiveAgent(null);
    setStreamingContent("");
    setStreamingToolCalls([]);

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/agent-gpt5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          stream: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(err.error || `Error ${res.status}`);
      }

      // Handle SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream available");

      const decoder = new TextDecoder();
      let fullContent = "";
      let agentId = "";
      let model = "";
      let tokensUsed = 0;
      let durationMs = 0;
      const toolCallsAccum: Array<{ name: string; args: Record<string, unknown>; success: boolean }> = [];
      const delegationsAccum: Array<{ toAgent: string; reason: string; reply: string }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case "agent_start":
                agentId = event.agentId;
                setActiveAgent(event.agentId);
                break;

              case "tool_call":
                toolCallsAccum.push({
                  name: event.name,
                  args: event.args || {},
                  success: event.success,
                });
                setStreamingToolCalls([...toolCallsAccum]);
                break;

              case "delegation":
                delegationsAccum.push({
                  toAgent: event.toAgent,
                  reason: event.reason,
                  reply: "",
                });
                break;

              case "text":
                fullContent += event.content;
                setStreamingContent(fullContent);
                break;

              case "done":
                agentId = event.agentId || agentId;
                model = event.model || "";
                tokensUsed = event.tokensUsed || 0;
                durationMs = event.durationMs || 0;
                break;

              case "error":
                fullContent += `\n\n[Error: ${event.message}]`;
                break;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Finalize message
      const agentMeta = AGENT_META[agentId] || AGENT_META["ceo"];
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: fullContent || "Sin respuesta del agente.",
        agentId,
        agentName: agentMeta.label,
        model,
        toolCalls: toolCallsAccum.length > 0 ? toolCallsAccum : undefined,
        delegations: delegationsAccum.length > 0 ? delegationsAccum : undefined,
        tokensUsed,
        durationMs,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent("");
      setStreamingToolCalls([]);

    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: err instanceof Error
          ? `Error: ${err.message}`
          : "Error de conexion con el agente. Intentalo de nuevo.",
        agentId: "error",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setActiveAgent(null);
      loadSwarmStatus();
    }
  }, [input, isLoading, messages, loadSwarmStatus]);

  // ─── Keyboard Handling ──────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  // ─── Render Helpers ─────────────────────────────────────────────────

  function renderAgentBadge(agentId?: string, model?: string) {
    if (!agentId) return null;
    const meta = AGENT_META[agentId] || { icon: Bot, color: "text-gray-400", label: agentId };
    const Icon = meta.icon;

    return (
      <div className="flex items-center gap-2 mb-1">
        <div className={`flex items-center gap-1 ${meta.color}`}>
          <Icon size={14} />
          <span className="text-xs font-semibold">{meta.label}</span>
        </div>
        {model && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
            model.includes("gpt-5")
              ? "bg-cyan-900/50 text-cyan-300 border border-cyan-700/50"
              : model.includes("gemini")
                ? "bg-amber-900/50 text-amber-300 border border-amber-700/50"
                : "bg-gray-800 text-gray-400 border border-gray-700"
          }`}>
            {model.includes("gpt-5") ? "GPT-5" : model.includes("gemini") ? "Gemini" : model}
          </span>
        )}
      </div>
    );
  }

  function renderToolCalls(msg: ChatMessage) {
    if (!msg.toolCalls || msg.toolCalls.length === 0) return null;
    const isExpanded = showToolCalls === msg.id;

    return (
      <div className="mt-2">
        <button
          onClick={() => setShowToolCalls(isExpanded ? null : msg.id)}
          className="flex items-center gap-1 text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
        >
          <Zap size={12} />
          <span>{msg.toolCalls.length} herramienta{msg.toolCalls.length > 1 ? "s" : ""}</span>
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {isExpanded && (
          <div className="mt-1 space-y-1">
            {msg.toolCalls.map((tc, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-[#050a14] border border-[#1a2d4a]/50"
              >
                {tc.success ? (
                  <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                ) : (
                  <XCircle size={12} className="text-red-400 shrink-0" />
                )}
                <span className="font-mono text-cyan-300">{tc.name}</span>
                <span className="text-gray-500 truncate max-w-[200px]">
                  {JSON.stringify(tc.args).slice(0, 80)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderDelegations(msg: ChatMessage) {
    if (!msg.delegations || msg.delegations.length === 0) return null;

    return (
      <div className="mt-2 space-y-1">
        {msg.delegations.map((d, i) => {
          const targetMeta = AGENT_META[d.toAgent] || { icon: Bot, color: "text-gray-400", label: d.toAgent };
          const TargetIcon = targetMeta.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-[#050a14]/80 border border-[#1a2d4a]/30"
            >
              <ArrowRight size={12} className="text-cyan-500 shrink-0" />
              <TargetIcon size={12} className={targetMeta.color} />
              <span className={targetMeta.color}>{targetMeta.label}</span>
              <span className="text-gray-500 truncate">{d.reason}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function renderMessageMeta(msg: ChatMessage) {
    if (msg.role !== "assistant") return null;
    const parts: string[] = [];
    if (msg.tokensUsed) parts.push(`${msg.tokensUsed} tokens`);
    if (msg.durationMs) parts.push(`${(msg.durationMs / 1000).toFixed(1)}s`);
    if (parts.length === 0) return null;

    return (
      <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-600">
        <Clock size={10} />
        <span>{parts.join(" | ")}</span>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#050a14] text-white">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a1628] border-b border-[#1a2d4a]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Brain size={24} className="text-cyan-400" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 border border-[#0a1628] animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-cyan-400">Sinergia AI Swarm</h2>
            <p className="text-[10px] text-gray-500">
              {swarmStatus?.gpt5Available ? "GPT-5 Activo" : "Modo Gemini"} | {swarmStatus?.totalAgents || 10} agentes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAgentPanel(!showAgentPanel)}
            className="p-1.5 rounded-md bg-[#050a14] border border-[#1a2d4a] text-gray-400 hover:text-cyan-400 hover:border-cyan-800 transition-all"
            title="Estado de agentes"
          >
            <Activity size={16} />
          </button>
          <button
            onClick={loadSwarmStatus}
            className="p-1.5 rounded-md bg-[#050a14] border border-[#1a2d4a] text-gray-400 hover:text-cyan-400 hover:border-cyan-800 transition-all"
            title="Actualizar estado"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ═══ Agent Status Panel (collapsible) ═══ */}
      {showAgentPanel && swarmStatus && (
        <div className="px-4 py-3 bg-[#0a1628]/80 border-b border-[#1a2d4a] space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Agentes del Swarm</div>
          <div className="grid grid-cols-4 gap-2">
            {swarmStatus.agents.map((agent) => {
              const meta = AGENT_META[agent.id] || { icon: Bot, color: "text-gray-400", label: agent.id };
              const Icon = meta.icon;
              const isActive = agent.status === "active";
              return (
                <div
                  key={agent.id}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                    isActive
                      ? "bg-cyan-900/20 border-cyan-700/50"
                      : "bg-[#050a14] border-[#1a2d4a]/50"
                  }`}
                >
                  <Icon size={16} className={isActive ? "text-cyan-400 animate-pulse" : meta.color} />
                  <span className={`text-[10px] font-medium ${isActive ? "text-cyan-300" : "text-gray-400"}`}>
                    {meta.label}
                  </span>
                  <span className={`text-[8px] ${
                    isActive ? "text-green-400" : "text-gray-600"
                  }`}>
                    {agent.status === "active" ? "ACTIVO" : agent.status === "delegating" ? "DELEGANDO" : "IDLE"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Messages Area ═══ */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-[#1a2d4a] scrollbar-track-transparent">
        {/* Welcome message if empty */}
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full space-y-6 text-center">
            <div className="relative">
              <Brain size={48} className="text-cyan-400/30" />
              <Sparkles size={20} className="text-cyan-400 absolute -top-1 -right-2 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-cyan-400 mb-1">Sinergia AI Swarm</h3>
              <p className="text-sm text-gray-500 max-w-md">
                10 agentes especializados con GPT-5 gestionando tu negocio.
                Pregunta cualquier cosa sobre emails, facturas, contactos, agenda, energia, marketing o web.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(action.prompt)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#1a2d4a] text-xs text-gray-300 hover:border-cyan-700 hover:text-cyan-400 transition-all text-left"
                >
                  <Zap size={12} className="text-cyan-500 shrink-0" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-cyan-900/30 border border-cyan-800/40 text-white"
                  : "bg-[#0a1628] border border-[#1a2d4a] text-gray-200"
              }`}
            >
              {msg.role === "assistant" && renderAgentBadge(msg.agentId, msg.model)}
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              {msg.role === "assistant" && renderToolCalls(msg)}
              {msg.role === "assistant" && renderDelegations(msg)}
              {renderMessageMeta(msg)}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {isLoading && (streamingContent || streamingToolCalls.length > 0) && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-4 py-3 bg-[#0a1628] border border-[#1a2d4a] text-gray-200">
              {activeAgent && renderAgentBadge(activeAgent)}
              {streamingToolCalls.length > 0 && (
                <div className="mb-2 space-y-1">
                  {streamingToolCalls.map((tc, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Loader2 size={10} className="animate-spin text-cyan-400" />
                      <span className="font-mono text-cyan-300">{tc.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {streamingContent && (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{streamingContent}</div>
              )}
              {!streamingContent && streamingToolCalls.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span>
                    {activeAgent
                      ? `${AGENT_META[activeAgent]?.label || activeAgent} pensando...`
                      : "Procesando..."}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading indicator (no stream yet) */}
        {isLoading && !streamingContent && streamingToolCalls.length === 0 && (
          <div className="flex justify-start">
            <div className="rounded-xl px-4 py-3 bg-[#0a1628] border border-[#1a2d4a]">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin text-cyan-400" />
                <span>
                  {activeAgent
                    ? `${AGENT_META[activeAgent]?.label || activeAgent} analizando...`
                    : "Enrutando al agente..."}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ═══ Quick Actions Bar (when conversation exists) ═══ */}
      {messages.length > 0 && !isLoading && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-none border-t border-[#1a2d4a]/30">
          {QUICK_ACTIONS.map((action, i) => (
            <button
              key={i}
              onClick={() => sendMessage(action.prompt)}
              className="shrink-0 px-3 py-1.5 rounded-full bg-[#0a1628] border border-[#1a2d4a] text-[11px] text-gray-400 hover:border-cyan-700 hover:text-cyan-400 transition-all"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* ═══ Input Area ═══ */}
      <div className="px-4 py-3 bg-[#0a1628] border-t border-[#1a2d4a]">
        <div className="flex items-end gap-2">
          {/* Voice placeholder */}
          <button
            className="p-2.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-gray-500 hover:text-cyan-400 hover:border-cyan-800 transition-all shrink-0"
            title="Entrada por voz (proximamente)"
            disabled
          >
            <Mic size={18} />
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje... (Shift+Enter para nueva linea)"
              className="w-full bg-[#050a14] border border-[#1a2d4a] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-700 transition-colors"
              rows={1}
              style={{
                minHeight: "40px",
                maxHeight: "120px",
                height: "auto",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
              disabled={isLoading}
            />
          </div>

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            className={`p-2.5 rounded-lg shrink-0 transition-all ${
              isLoading || !input.trim()
                ? "bg-[#050a14] border border-[#1a2d4a] text-gray-600"
                : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/30"
            }`}
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>

        {/* Model + Memory indicator */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            <div className={`w-1.5 h-1.5 rounded-full ${swarmStatus?.gpt5Available ? "bg-green-500" : "bg-amber-500"}`} />
            <span>{swarmStatus?.gpt5Available ? "GPT-5" : "Gemini"}</span>
            <span className="text-gray-700">|</span>
            <Brain size={10} />
            <span>Memoria activa</span>
            <span className="text-gray-700">|</span>
            <MessageSquare size={10} />
            <span>{messages.length} msgs</span>
          </div>
          <div className="text-[10px] text-gray-700">
            Sinergia AI v2.0
          </div>
        </div>
      </div>
    </div>
  );
}
