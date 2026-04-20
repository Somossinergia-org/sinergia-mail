"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail, FileText, Calendar, Users, Activity, Zap, Shield, Crown,
  MessageCircle, X, Send, ChevronRight, Cpu, Sparkles,
  Megaphone, Globe,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────

type AgentStatus = "idle" | "thinking" | "working" | "delegating" | "done" | "talking";

interface OfficeAgent {
  id: string;
  name: string;
  shortName: string;
  role: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
  status: AgentStatus;
  currentTask: string | null;
  position: { x: number; y: number };
  deskType: "executive" | "standard" | "corner";
  avatar: string; // Emoji character for MVP, later real avatars
  stats: { tasksToday: number; tokensUsed: number; avgTime: string };
  personality: string;
}

interface ChatMsg {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

interface DelegationLine {
  from: string;
  to: string;
  reason: string;
  progress: number;
  id: string;
}

// ─── Agent Definitions ──────────────────────────────────────────────────

const INITIAL_AGENTS: OfficeAgent[] = [
  {
    id: "ceo",
    name: "Director General",
    shortName: "CEO",
    role: "Orquestador principal",
    icon: <Crown className="w-5 h-5" />,
    color: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 50, y: 22 },
    deskType: "executive",
    avatar: "👨‍💼",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Estratégico, decide quién hace qué",
  },
  {
    id: "email-manager",
    name: "Gestora de Email",
    shortName: "Email",
    role: "Bandeja de entrada",
    icon: <Mail className="w-5 h-5" />,
    color: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 18, y: 42 },
    deskType: "standard",
    avatar: "👩‍💻",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Organizada, prioriza y clasifica",
  },
  {
    id: "fiscal-controller",
    name: "Controller Fiscal",
    shortName: "Fiscal",
    role: "Facturas e IVA",
    icon: <FileText className="w-5 h-5" />,
    color: "#10b981",
    glow: "rgba(16, 185, 129, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 82, y: 42 },
    deskType: "standard",
    avatar: "👨‍💼",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Preciso, nunca redondea cifras",
  },
  {
    id: "calendar-assistant",
    name: "Asistente de Agenda",
    shortName: "Agenda",
    role: "Calendario y reuniones",
    icon: <Calendar className="w-5 h-5" />,
    color: "#06b6d4",
    glow: "rgba(6, 182, 212, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 18, y: 65 },
    deskType: "standard",
    avatar: "👩‍💼",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Puntual, gestiona conflictos de horario",
  },
  {
    id: "crm-director",
    name: "Director CRM",
    shortName: "CRM",
    role: "Contactos y ventas",
    icon: <Users className="w-5 h-5" />,
    color: "#8b5cf6",
    glow: "rgba(139, 92, 246, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 82, y: 65 },
    deskType: "standard",
    avatar: "👨‍💻",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Relacional, detecta oportunidades",
  },
  {
    id: "energy-analyst",
    name: "Analista Energético",
    shortName: "Energía",
    role: "Facturas eléctricas",
    icon: <Activity className="w-5 h-5" />,
    color: "#22c55e",
    glow: "rgba(34, 197, 94, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 20, y: 85 },
    deskType: "corner",
    avatar: "👩‍🔬",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Analítica, detecta anomalías en consumo",
  },
  {
    id: "automation-engineer",
    name: "Ingeniero Automatización",
    shortName: "Auto",
    role: "Reglas y flujos",
    icon: <Zap className="w-5 h-5" />,
    color: "#f97316",
    glow: "rgba(249, 115, 22, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 36, y: 85 },
    deskType: "corner",
    avatar: "🧑‍💻",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Eficiente, elimina tareas repetitivas",
  },
  {
    id: "legal-rgpd",
    name: "Oficial RGPD",
    shortName: "Legal",
    role: "Protección de datos",
    icon: <Shield className="w-5 h-5" />,
    color: "#ec4899",
    glow: "rgba(236, 72, 153, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 50, y: 85 },
    deskType: "corner",
    avatar: "👩‍⚖️",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Rigurosa, protege la privacidad",
  },
  {
    id: "marketing-director",
    name: "Director Marketing",
    shortName: "Mktg",
    role: "SEO, SEM y contenido",
    icon: <Megaphone className="w-5 h-5" />,
    color: "#a855f7",
    glow: "rgba(168, 85, 247, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 64, y: 85 },
    deskType: "corner",
    avatar: "👨‍🎨",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Creativo, posiciona la marca",
  },
  {
    id: "web-master",
    name: "Web Master",
    shortName: "Web",
    role: "WordPress y desarrollo",
    icon: <Globe className="w-5 h-5" />,
    color: "#14b8a6",
    glow: "rgba(20, 184, 166, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 80, y: 85 },
    deskType: "corner",
    avatar: "🧑‍💻",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Técnico, optimiza rendimiento web",
  },
];

// ─── Status labels & animations ─────────────────────────────────────────

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Esperando",
  thinking: "Pensando...",
  working: "Trabajando",
  delegating: "Delegando",
  done: "Completado",
  talking: "Hablando contigo",
};

// ─── Person SVG Component ───────────────────────────────────────────────

function PersonSVG({
  status,
  color,
  size = 64,
}: {
  status: AgentStatus;
  color: string;
  size?: number;
}) {
  const isWorking = status === "working" || status === "thinking";
  const isDelegating = status === "delegating";
  const isTalking = status === "talking";
  const isDone = status === "done";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      className={`transition-transform duration-500 ${
        isDelegating ? "animate-person-walk" : ""
      } ${isWorking ? "animate-person-type" : ""}`}
    >
      {/* Chair */}
      <ellipse cx="50" cy="110" rx="22" ry="6" fill="rgba(255,255,255,0.05)" />
      <rect x="30" y="75" width="40" height="30" rx="5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {/* Chair back */}
      <rect x="32" y="60" width="36" height="18" rx="4" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

      {/* Body / Torso */}
      <rect
        x="35"
        y="52"
        width="30"
        height="32"
        rx="6"
        fill={color}
        opacity="0.9"
        className="transition-all duration-300"
      />
      {/* Shoulders */}
      <rect x="28" y="54" width="44" height="8" rx="4" fill={color} opacity="0.7" />

      {/* Left Arm */}
      <g className={isWorking ? "animate-arm-type-left" : ""}>
        <rect
          x="22"
          y="56"
          width="10"
          height="24"
          rx="5"
          fill={color}
          opacity="0.8"
          transform={isDone ? "rotate(-20, 27, 56)" : "rotate(0, 27, 56)"}
          className="transition-transform duration-500"
        />
        {/* Hand */}
        <circle
          cx={isDone ? "20" : "27"}
          cy={isDone ? "76" : "80"}
          r="4"
          fill="#fbbf24"
          opacity="0.9"
        />
      </g>

      {/* Right Arm */}
      <g className={isWorking ? "animate-arm-type-right" : ""}>
        <rect
          x="68"
          y="56"
          width="10"
          height="24"
          rx="5"
          fill={color}
          opacity="0.8"
          transform={isTalking ? "rotate(-15, 73, 56)" : isDone ? "rotate(20, 73, 56)" : "rotate(0, 73, 56)"}
          className="transition-transform duration-500"
        />
        {/* Hand */}
        <circle
          cx={isDone ? "80" : "73"}
          cy={isDone ? "76" : "80"}
          r="4"
          fill="#fbbf24"
          opacity="0.9"
        />
      </g>

      {/* Document in hand when done */}
      {isDone && (
        <g className="animate-fade-in">
          <rect x="77" y="65" width="14" height="18" rx="2" fill="white" opacity="0.9" />
          <line x1="80" y1="70" x2="88" y2="70" stroke={color} strokeWidth="1.5" opacity="0.6" />
          <line x1="80" y1="74" x2="86" y2="74" stroke={color} strokeWidth="1.5" opacity="0.4" />
          <line x1="80" y1="78" x2="88" y2="78" stroke={color} strokeWidth="1.5" opacity="0.3" />
        </g>
      )}

      {/* Head */}
      <circle cx="50" cy="38" r="16" fill="#fbbf24" opacity="0.9" />
      {/* Hair */}
      <ellipse cx="50" cy="28" rx="14" ry="8" fill={color} opacity="0.6" />

      {/* Eyes */}
      <g>
        <circle cx="44" cy="38" r="2.5" fill="white" />
        <circle cx="56" cy="38" r="2.5" fill="white" />
        <circle
          cx={isWorking ? "45" : "44"}
          cy="38"
          r="1.2"
          fill="#1e293b"
          className={isWorking ? "animate-eyes-read" : ""}
        />
        <circle
          cx={isWorking ? "57" : "56"}
          cy="38"
          r="1.2"
          fill="#1e293b"
          className={isWorking ? "animate-eyes-read" : ""}
        />
        {/* Blink animation for idle */}
        {status === "idle" && (
          <>
            <rect x="41" y="36" width="7" height="5" fill="#fbbf24" opacity="0.9" className="animate-blink" />
            <rect x="53" y="36" width="7" height="5" fill="#fbbf24" opacity="0.9" className="animate-blink" />
          </>
        )}
      </g>

      {/* Mouth */}
      {isTalking ? (
        <ellipse cx="50" cy="45" rx="4" ry="3" fill="#1e293b" opacity="0.5" className="animate-talk-mouth" />
      ) : isDone ? (
        <path d="M44 44 Q50 49 56 44" fill="none" stroke="#1e293b" strokeWidth="1.5" opacity="0.4" />
      ) : (
        <line x1="46" y1="45" x2="54" y2="45" stroke="#1e293b" strokeWidth="1.5" opacity="0.3" />
      )}

      {/* Thinking bubbles */}
      {status === "thinking" && (
        <g className="animate-fade-in">
          <circle cx="72" cy="25" r="3" fill="white" opacity="0.6" className="animate-bubble-1" />
          <circle cx="78" cy="18" r="4" fill="white" opacity="0.5" className="animate-bubble-2" />
          <circle cx="85" cy="10" r="5" fill="white" opacity="0.4" className="animate-bubble-3" />
        </g>
      )}

      {/* Laptop/Screen on desk */}
      <g>
        {/* Screen */}
        <rect x="38" y="82" width="24" height="16" rx="2" fill="#0f172a" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        {isWorking && (
          <>
            <rect x="41" y="85" width="8" height="1.5" rx="0.5" fill={color} opacity="0.8" className="animate-code-line-1" />
            <rect x="41" y="88" width="14" height="1.5" rx="0.5" fill={color} opacity="0.5" className="animate-code-line-2" />
            <rect x="41" y="91" width="10" height="1.5" rx="0.5" fill={color} opacity="0.3" className="animate-code-line-3" />
          </>
        )}
        {status === "idle" && (
          <rect x="41" y="87" width="18" height="6" rx="1" fill={color} opacity="0.15" />
        )}
        {/* Keyboard */}
        <rect x="40" y="99" width="20" height="4" rx="1" fill="rgba(255,255,255,0.1)" />
      </g>
    </svg>
  );
}

// ─── Desk Component ─────────────────────────────────────────────────────

function AgentDesk({
  agent,
  isSelected,
  onClick,
}: {
  agent: OfficeAgent;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="absolute transition-all duration-500 cursor-pointer group"
      style={{
        left: `${agent.position.x}%`,
        top: `${agent.position.y}%`,
        transform: "translate(-50%, -50%)",
        zIndex: isSelected ? 30 : agent.status !== "idle" ? 20 : 10,
      }}
      onClick={onClick}
    >
      {/* Glow effect when active */}
      {agent.status !== "idle" && (
        <div
          className="absolute inset-0 rounded-full blur-2xl animate-pulse-slow"
          style={{
            background: agent.glow,
            width: "120px",
            height: "120px",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            opacity: 0.3,
          }}
        />
      )}

      {/* Selection ring */}
      {isSelected && (
        <div
          className="absolute rounded-full border-2 animate-spin-slow"
          style={{
            borderColor: agent.color,
            width: "130px",
            height: "130px",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            borderStyle: "dashed",
            opacity: 0.6,
          }}
        />
      )}

      {/* The person */}
      <div className="relative flex flex-col items-center">
        <PersonSVG status={agent.status} color={agent.color} size={80} />

        {/* Name badge */}
        <div
          className="mt-1 px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase backdrop-blur-md border transition-all duration-300"
          style={{
            background: `${agent.color}15`,
            borderColor: `${agent.color}40`,
            color: agent.color,
            boxShadow: agent.status !== "idle" ? `0 0 12px ${agent.glow}` : "none",
          }}
        >
          {agent.shortName}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 mt-1">
          <div
            className={`w-2 h-2 rounded-full ${
              agent.status === "idle"
                ? "bg-gray-500"
                : agent.status === "thinking"
                ? "bg-yellow-400 animate-pulse"
                : agent.status === "working"
                ? "bg-green-400 animate-pulse"
                : agent.status === "delegating"
                ? "bg-blue-400 animate-pulse"
                : agent.status === "done"
                ? "bg-emerald-400"
                : "bg-cyan-400 animate-pulse"
            }`}
          />
          <span className="text-[9px] text-[var(--text-secondary)] font-mono">
            {STATUS_LABEL[agent.status]}
          </span>
        </div>

        {/* Current task bubble */}
        {agent.currentTask && (
          <div
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-[10px] text-white font-medium whitespace-nowrap backdrop-blur-md border animate-fade-in max-w-[200px] truncate"
            style={{
              background: `${agent.color}30`,
              borderColor: `${agent.color}50`,
            }}
          >
            💬 {agent.currentTask}
          </div>
        )}

        {/* Hover tooltip */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="px-2 py-1 rounded-lg bg-black/80 backdrop-blur text-[9px] text-white whitespace-nowrap">
            Click para hablar con {agent.name}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delegation Line ────────────────────────────────────────────────────

function DelegationArrow({ line, agents }: { line: DelegationLine; agents: OfficeAgent[] }) {
  const from = agents.find((a) => a.id === line.from);
  const to = agents.find((a) => a.id === line.to);
  if (!from || !to) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 15 }}>
      <defs>
        <linearGradient id={`grad-${line.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={from.color} stopOpacity="0.8" />
          <stop offset="100%" stopColor={to.color} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Line */}
      <line
        x1={`${from.position.x}%`}
        y1={`${from.position.y}%`}
        x2={`${to.position.x}%`}
        y2={`${to.position.y}%`}
        stroke={`url(#grad-${line.id})`}
        strokeWidth="2"
        strokeDasharray="8 4"
        className="animate-dash"
        opacity="0.6"
      />
      {/* Walking person dot */}
      <circle
        cx={`${from.position.x + (to.position.x - from.position.x) * line.progress}%`}
        cy={`${from.position.y + (to.position.y - from.position.y) * line.progress}%`}
        r="6"
        fill={from.color}
        opacity="0.9"
        className="animate-pulse"
      />
      {/* Reason label */}
      <text
        x={`${(from.position.x + to.position.x) / 2}%`}
        y={`${(from.position.y + to.position.y) / 2 - 2}%`}
        textAnchor="middle"
        fill="white"
        fontSize="9"
        opacity="0.7"
        fontFamily="monospace"
      >
        {line.reason}
      </text>
    </svg>
  );
}

// ─── Activity Log ───────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  color: string;
  action: string;
  timestamp: number;
}

function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="glass-card rounded-xl p-3 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">
          Log en Tiempo Real
        </span>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
        {entries.length === 0 && (
          <p className="text-[10px] text-[var(--text-secondary)] italic font-mono py-4 text-center">
            Esperando actividad de los agentes...
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex items-start gap-2 py-1 animate-fade-in">
            <span className="text-[9px] text-[var(--text-secondary)] font-mono mt-0.5 shrink-0">
              {new Date(e.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span
              className="text-[10px] font-bold shrink-0"
              style={{ color: e.color }}
            >
              [{e.agentName}]
            </span>
            <span className="text-[10px] text-[var(--text-primary)] font-mono">
              {e.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Chat Drawer ──────────────────────────────────────────────────

function AgentChat({
  agent,
  onClose,
  chatHistory,
  onSendMessage,
  sending,
}: {
  agent: OfficeAgent;
  onClose: () => void;
  chatHistory: ChatMsg[];
  onSendMessage: (msg: string) => void;
  sending: boolean;
}) {
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-full animate-slide-in-right">
      {/* Header */}
      <div
        className="p-4 flex items-center gap-3 border-b border-[var(--border)]"
        style={{ background: `${agent.color}10` }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border"
          style={{
            background: `${agent.color}15`,
            borderColor: `${agent.color}30`,
            boxShadow: `0 0 20px ${agent.glow}`,
          }}
        >
          {agent.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold truncate">{agent.name}</h3>
          <p className="text-[10px] font-mono" style={{ color: agent.color }}>
            {agent.role} · {STATUS_LABEL[agent.status]}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stats bar */}
      <div className="px-4 py-2 flex gap-4 border-b border-[var(--border)] bg-black/20">
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: agent.color }}>
            {agent.stats.tasksToday}
          </div>
          <div className="text-[8px] text-[var(--text-secondary)] uppercase">Tareas hoy</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: agent.color }}>
            {agent.stats.tokensUsed.toLocaleString()}
          </div>
          <div className="text-[8px] text-[var(--text-secondary)] uppercase">Tokens</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: agent.color }}>
            {agent.stats.avgTime}
          </div>
          <div className="text-[8px] text-[var(--text-secondary)] uppercase">Tiempo medio</div>
        </div>
      </div>

      {/* Personality */}
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <p className="text-[10px] text-[var(--text-secondary)] italic">
          &quot;{agent.personality}&quot;
        </p>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <div className="text-4xl">{agent.avatar}</div>
            <p className="text-xs text-[var(--text-secondary)] text-center max-w-[200px]">
              Habla directamente con {agent.shortName}. Este agente se especializa en{" "}
              {agent.role.toLowerCase()}.
            </p>
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                msg.role === "user"
                  ? "bg-cyan-500/20 border border-cyan-500/30 text-[var(--text-primary)]"
                  : "border"
              }`}
              style={
                msg.role === "agent"
                  ? {
                      background: `${agent.color}10`,
                      borderColor: `${agent.color}25`,
                    }
                  : undefined
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div
              className="px-4 py-2 rounded-xl border text-xs flex items-center gap-2"
              style={{
                background: `${agent.color}10`,
                borderColor: `${agent.color}25`,
              }}
            >
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: agent.color, animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: agent.color, animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: agent.color, animationDelay: "300ms" }} />
              </div>
              <span className="text-[var(--text-secondary)]">pensando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`Hablar con ${agent.shortName}...`}
            className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-cyan-500/50 transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="px-3 py-2 rounded-xl transition disabled:opacity-40"
            style={{
              background: `${agent.color}20`,
              color: agent.color,
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Office Map Component ──────────────────────────────────────────

export default function AgentOfficeMap() {
  const [agents, setAgents] = useState<OfficeAgent[]>(INITIAL_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [delegations, setDelegations] = useState<DelegationLine[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMsg[]>>({});
  const [sending, setSending] = useState(false);
  const delegationTimers = useRef<NodeJS.Timeout[]>([]);

  // Cleanup delegation timers
  useEffect(() => {
    return () => {
      delegationTimers.current.forEach(clearInterval);
    };
  }, []);

  // ── Poll real swarm status every 5 seconds ──
  useEffect(() => {
    let mounted = true;
    const pollStatus = async () => {
      try {
        const res = await fetch("/api/agent-gpt5");
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (!data.agents || !mounted) return;
        setAgents((prev) =>
          prev.map((agent) => {
            const apiAgent = data.agents?.find((a: { id: string; status: string }) => a.id === agent.id);
            if (!apiAgent) return agent;
            if (apiAgent.status === "active" && agent.status === "idle") {
              return { ...agent, status: "working" as AgentStatus, currentTask: "Procesando solicitud..." };
            }
            if (apiAgent.status === "idle" && agent.status === "working") {
              return { ...agent, status: "done" as AgentStatus };
            }
            return agent;
          }),
        );
      } catch {
        // silently ignore polling errors
      }
    };
    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // ── Add log entry ──
  const addLog = useCallback((agentId: string, action: string) => {
    const agent = INITIAL_AGENTS.find((a) => a.id === agentId);
    if (!agent) return;
    setActivityLog((prev) => [
      ...prev.slice(-100),
      {
        id: `${Date.now()}-${Math.random()}`,
        agentId,
        agentName: agent.shortName,
        color: agent.color,
        action,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // ── Update agent status ──
  const updateAgentStatus = useCallback((agentId: string, status: AgentStatus, task?: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status,
              currentTask: task ?? a.currentTask,
              stats: status === "done"
                ? { ...a.stats, tasksToday: a.stats.tasksToday + 1 }
                : a.stats,
            }
          : a,
      ),
    );
  }, []);

  // ── Simulate delegation animation ──
  const simulateDelegation = useCallback(
    (fromId: string, toId: string, reason: string) => {
      const lineId = `${fromId}-${toId}-${Date.now()}`;
      const newLine: DelegationLine = {
        from: fromId,
        to: toId,
        reason,
        progress: 0,
        id: lineId,
      };

      setDelegations((prev) => [...prev, newLine]);
      updateAgentStatus(fromId, "delegating", `Delegando a ${toId}`);
      addLog(fromId, `→ Delegando "${reason}" a ${toId}`);

      let progress = 0;
      const timer = setInterval(() => {
        progress += 0.02;
        if (progress >= 1) {
          clearInterval(timer);
          setDelegations((prev) => prev.filter((d) => d.id !== lineId));
          updateAgentStatus(fromId, "idle");
          updateAgentStatus(toId, "working", reason);
          addLog(toId, `Recibida tarea: "${reason}"`);

          // Simulate work completion
          setTimeout(() => {
            updateAgentStatus(toId, "done", "Tarea completada");
            addLog(toId, "✓ Tarea completada");
            setTimeout(() => {
              updateAgentStatus(toId, "idle");
              setAgents((prev) =>
                prev.map((a) =>
                  a.id === toId ? { ...a, currentTask: null } : a,
                ),
              );
            }, 3000);
          }, 4000 + Math.random() * 3000);
        } else {
          setDelegations((prev) =>
            prev.map((d) => (d.id === lineId ? { ...d, progress } : d)),
          );
        }
      }, 50);

      delegationTimers.current.push(timer);
    },
    [updateAgentStatus, addLog],
  );

  // ── Send message to agent ──
  const handleSendMessage = useCallback(
    async (msg: string) => {
      if (!selectedAgent) return;

      // Add user message to chat
      setChatHistories((prev) => ({
        ...prev,
        [selectedAgent]: [
          ...(prev[selectedAgent] || []),
          { role: "user" as const, content: msg, timestamp: Date.now() },
        ],
      }));

      // Update agent status
      updateAgentStatus(selectedAgent, "talking", msg.slice(0, 60));
      addLog(selectedAgent, `Usuario pregunta: "${msg.slice(0, 80)}"`);

      setSending(true);

      try {
        const res = await fetch("/api/agent-gpt5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: msg,
            agentOverride: selectedAgent,
          }),
        });

        if (!res.ok) throw new Error("Error del agente");

        // Read SSE stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullReply = "";

        if (reader) {
          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));

                    if (data.type === "text_delta" && data.content) {
                      fullReply += data.content;
                    }

                    if (data.type === "tool_call") {
                      addLog(selectedAgent!, `🔧 Usando: ${data.name}`);
                      updateAgentStatus(selectedAgent!, "working", `Usando ${data.name}`);
                    }

                    if (data.type === "delegation") {
                      simulateDelegation(selectedAgent!, data.toAgent, data.reason);
                    }

                    if (data.type === "done" && data.reply) {
                      fullReply = data.reply;
                    }
                  } catch {
                    // Not JSON, might be raw text
                    if (line.slice(6).trim() && line.slice(6).trim() !== "[DONE]") {
                      fullReply += line.slice(6);
                    }
                  }
                }
              }
            }
          }
        }

        if (!fullReply) {
          fullReply = "He procesado tu solicitud. ¿Necesitas algo más?";
        }

        setChatHistories((prev) => ({
          ...prev,
          [selectedAgent!]: [
            ...(prev[selectedAgent!] || []),
            { role: "agent", content: fullReply, timestamp: Date.now() },
          ],
        }));

        updateAgentStatus(selectedAgent!, "done", "Respondido");
        addLog(selectedAgent!, "✓ Respuesta enviada");

        // Reset to idle after a bit
        setTimeout(() => {
          updateAgentStatus(selectedAgent!, "idle");
          setAgents((prev) =>
            prev.map((a) =>
              a.id === selectedAgent ? { ...a, currentTask: null } : a,
            ),
          );
        }, 3000);
      } catch (err) {
        setChatHistories((prev) => ({
          ...prev,
          [selectedAgent!]: [
            ...(prev[selectedAgent!] || []),
            {
              role: "agent",
              content: "Lo siento, ha ocurrido un error. Inténtalo de nuevo.",
              timestamp: Date.now(),
            },
          ],
        }));
        updateAgentStatus(selectedAgent!, "idle");
      } finally {
        setSending(false);
      }
    },
    [selectedAgent, updateAgentStatus, addLog, simulateDelegation],
  );

  // ── Demo simulation ──
  const runDemo = useCallback(() => {
    addLog("ceo", "🎬 Iniciando demo de la oficina...");

    // Step 1: CEO receives task
    setTimeout(() => {
      updateAgentStatus("ceo", "thinking", "Analizando petición...");
      addLog("ceo", "Analizando petición del usuario...");
    }, 500);

    // Step 2: CEO delegates to email
    setTimeout(() => {
      simulateDelegation("ceo", "email-manager", "Revisar bandeja");
    }, 2500);

    // Step 3: CEO also delegates to fiscal
    setTimeout(() => {
      simulateDelegation("ceo", "fiscal-controller", "Facturas pendientes");
    }, 4000);

    // Step 4: CRM starts working independently
    setTimeout(() => {
      updateAgentStatus("crm-director", "working", "Actualizando scoring");
      addLog("crm-director", "Recalculando scoring de contactos...");
    }, 5000);

    setTimeout(() => {
      updateAgentStatus("crm-director", "done", "Scoring actualizado");
      addLog("crm-director", "✓ 47 contactos actualizados");
    }, 9000);

    setTimeout(() => {
      updateAgentStatus("crm-director", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "crm-director" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 12000);

    // Step 5: Legal checks everything
    setTimeout(() => {
      updateAgentStatus("legal-rgpd", "thinking", "Verificando RGPD...");
      addLog("legal-rgpd", "Verificando cumplimiento RGPD...");
    }, 7000);

    setTimeout(() => {
      updateAgentStatus("legal-rgpd", "done", "RGPD ✓ OK");
      addLog("legal-rgpd", "✓ Todos los procesos cumplen RGPD");
    }, 10000);

    setTimeout(() => {
      updateAgentStatus("legal-rgpd", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "legal-rgpd" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 13000);

    // Step 6: Marketing creates content
    setTimeout(() => {
      updateAgentStatus("marketing-director", "working", "Preparando contenido...");
      addLog("marketing-director", "Creando calendario de contenido semanal...");
    }, 6000);

    setTimeout(() => {
      updateAgentStatus("marketing-director", "done", "Contenido ✓");
      addLog("marketing-director", "✓ 5 posts programados, 1 newsletter lista");
    }, 11000);

    setTimeout(() => {
      updateAgentStatus("marketing-director", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "marketing-director" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 14000);

    // Step 7: Web Master checks website
    setTimeout(() => {
      updateAgentStatus("web-master", "working", "Verificando web...");
      addLog("web-master", "Comprobando velocidad y SSL de somossinergia.es...");
    }, 8000);

    setTimeout(() => {
      updateAgentStatus("web-master", "done", "Web OK ✓");
      addLog("web-master", "✓ Web activa, SSL válido, LCP 1.8s");
    }, 12000);

    setTimeout(() => {
      updateAgentStatus("web-master", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "web-master" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 15000);
  }, [updateAgentStatus, addLog, simulateDelegation]);

  const selected = agents.find((a) => a.id === selectedAgent);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30"
            style={{ boxShadow: "0 0 20px rgba(6, 182, 212, 0.2)" }}
          >
            <Cpu className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-shimmer">Oficina Virtual IA</h2>
            <p className="text-[10px] text-[var(--text-secondary)] font-mono">
              {agents.filter((a) => a.status !== "idle").length} agentes activos · {agents.length} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runDemo}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ver Demo
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Office Floor */}
        <div className={`flex-1 flex flex-col gap-4 min-w-0 ${selected ? "lg:w-[60%]" : "w-full"}`}>
          {/* The Office */}
          <div className="flex-1 glass-card rounded-2xl relative overflow-hidden min-h-[400px]">
            {/* Office background grid */}
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />

            {/* Office label */}
            <div className="absolute top-3 left-4 z-20">
              <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-widest">
                Somos Sinergia · Planta Principal
              </span>
            </div>

            {/* Room dividers */}
            <div className="absolute top-[35%] left-[5%] right-[5%] h-px bg-[var(--border)] opacity-30" />
            <div className="absolute top-[75%] left-[5%] right-[5%] h-px bg-[var(--border)] opacity-30" />
            <div className="absolute top-[35%] bottom-[25%] left-[50%] w-px bg-[var(--border)] opacity-30" />

            {/* Room labels */}
            <div className="absolute top-[12%] left-[42%] text-[8px] font-mono text-[var(--text-secondary)] opacity-40 uppercase tracking-widest">
              Dirección
            </div>
            <div className="absolute top-[36%] left-[8%] text-[8px] font-mono text-[var(--text-secondary)] opacity-40 uppercase tracking-widest">
              Comunicaciones
            </div>
            <div className="absolute top-[36%] right-[8%] text-[8px] font-mono text-[var(--text-secondary)] opacity-40 uppercase tracking-widest">
              Finanzas & CRM
            </div>
            <div className="absolute top-[76%] left-[25%] text-[8px] font-mono text-[var(--text-secondary)] opacity-40 uppercase tracking-widest">
              Especialistas
            </div>

            {/* Delegation lines */}
            {delegations.map((d) => (
              <DelegationArrow key={d.id} line={d} agents={agents} />
            ))}

            {/* Agent desks */}
            {agents.map((agent) => (
              <AgentDesk
                key={agent.id}
                agent={agent}
                isSelected={selectedAgent === agent.id}
                onClick={() =>
                  setSelectedAgent(selectedAgent === agent.id ? null : agent.id)
                }
              />
            ))}
          </div>

          {/* Activity Log */}
          <div className="h-[180px] shrink-0">
            <ActivityLog entries={activityLog} />
          </div>
        </div>

        {/* Agent Chat Panel */}
        {selected && (
          <div className="w-[340px] shrink-0 hidden lg:block">
            <AgentChat
              agent={selected}
              onClose={() => setSelectedAgent(null)}
              chatHistory={chatHistories[selected.id] || []}
              onSendMessage={handleSendMessage}
              sending={sending}
            />
          </div>
        )}
      </div>

      {/* Mobile chat drawer */}
      {selected && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedAgent(null)} />
          <div className="absolute right-0 top-0 bottom-0 w-[90%] max-w-[380px]">
            <AgentChat
              agent={selected}
              onClose={() => setSelectedAgent(null)}
              chatHistory={chatHistories[selected.id] || []}
              onSendMessage={handleSendMessage}
              sending={sending}
            />
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes person-walk {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-3px) rotate(-2deg); }
          75% { transform: translateY(-3px) rotate(2deg); }
        }
        .animate-person-walk {
          animation: person-walk 0.6s ease-in-out infinite;
        }

        @keyframes person-type {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1px); }
        }
        .animate-person-type {
          animation: person-type 0.3s ease-in-out infinite;
        }

        @keyframes arm-type-left {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(5deg) translateY(-2px); }
        }
        .animate-arm-type-left {
          animation: arm-type-left 0.25s ease-in-out infinite;
          transform-origin: top center;
        }

        @keyframes arm-type-right {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-5deg) translateY(-2px); }
        }
        .animate-arm-type-right {
          animation: arm-type-right 0.3s ease-in-out infinite;
          transform-origin: top center;
        }

        @keyframes blink {
          0%, 92%, 100% { opacity: 0; }
          95%, 98% { opacity: 1; }
        }
        .animate-blink {
          animation: blink 4s ease-in-out infinite;
        }

        @keyframes eyes-read {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(2px); }
        }
        .animate-eyes-read {
          animation: eyes-read 1.5s ease-in-out infinite;
        }

        @keyframes talk-mouth {
          0%, 100% { ry: 2; rx: 3; }
          30% { ry: 4; rx: 4; }
          60% { ry: 1.5; rx: 2.5; }
        }
        .animate-talk-mouth {
          animation: talk-mouth 0.4s ease-in-out infinite;
        }

        @keyframes bubble-1 {
          0%, 100% { opacity: 0.6; transform: translateY(0); }
          50% { opacity: 0.3; transform: translateY(-3px); }
        }
        .animate-bubble-1 { animation: bubble-1 1.5s ease-in-out infinite; }

        @keyframes bubble-2 {
          0%, 100% { opacity: 0.5; transform: translateY(0); }
          50% { opacity: 0.2; transform: translateY(-4px); }
        }
        .animate-bubble-2 { animation: bubble-2 1.8s ease-in-out infinite 0.3s; }

        @keyframes bubble-3 {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50% { opacity: 0.15; transform: translateY(-5px); }
        }
        .animate-bubble-3 { animation: bubble-3 2s ease-in-out infinite 0.6s; }

        @keyframes code-line-1 {
          0%, 100% { width: 8px; opacity: 0.8; }
          50% { width: 16px; opacity: 0.5; }
        }
        .animate-code-line-1 { animation: code-line-1 2s ease-in-out infinite; }

        @keyframes code-line-2 {
          0%, 100% { width: 14px; opacity: 0.5; }
          50% { width: 8px; opacity: 0.8; }
        }
        .animate-code-line-2 { animation: code-line-2 2.3s ease-in-out infinite 0.5s; }

        @keyframes code-line-3 {
          0%, 100% { width: 10px; opacity: 0.3; }
          50% { width: 16px; opacity: 0.6; }
        }
        .animate-code-line-3 { animation: code-line-3 1.8s ease-in-out infinite 1s; }

        @keyframes dash {
          to { stroke-dashoffset: -24; }
        }
        .animate-dash { animation: dash 1s linear infinite; }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.15; transform: translate(-50%, -50%) scale(1.2); }
        }
        .animate-pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }

        @keyframes spin-slow {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }

        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in-right { animation: slide-in-right 0.3s ease-out; }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}
