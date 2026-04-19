"use client";

/**
 * Mobile Agent Chat — Talk to any Sinergia agent individually
 *
 * Features:
 *   - Per-agent chat with unique personality and voice
 *   - Voice input (speech-to-text via Deepgram)
 *   - Voice output (text-to-speech per agent via ElevenLabs)
 *   - Camera for document/invoice scanning (OCR)
 *   - Quick agent switcher with HUD cards
 *   - Push notification integration
 *   - Full PWA support (installable, offline-aware)
 *   - Ten21 design system integration
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, MicOff, Camera, Volume2, VolumeX,
  ChevronLeft, X, Zap, Bot,
  Loader2, FileText, ArrowLeft,
  MessageSquare, Phone, Sparkles,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  name: string;
  shortName: string;
  role: string;
  avatar: string;
  color: string;
  description: string;
  quickActions: { icon: string; label: string; prompt: string }[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentId: string;
  timestamp: number;
  audioUrl?: string;
  imageUrl?: string;
  toolsUsed?: string[];
}

// ─── Agent Registry ──────────────────────────────────────────────────────

const AGENTS: AgentInfo[] = [
  {
    id: "ceo", name: "Director General", shortName: "CEO", role: "Orchestrator", avatar: "👨‍💼", color: "#f59e0b",
    description: "Coordina todo el equipo y toma decisiones estratégicas.",
    quickActions: [
      { icon: "⚡", label: "Resumen del día", prompt: "Dame un resumen ejecutivo del día" },
      { icon: "🤖", label: "Estado agentes", prompt: "¿Cómo están rindiendo los agentes?" },
      { icon: "📊", label: "Dashboard", prompt: "Dame un informe completo del negocio" },
      { icon: "🎯", label: "Prioridades", prompt: "¿Cuáles son las prioridades hoy?" },
    ],
  },
  {
    id: "email-manager", name: "Gestor de Email", shortName: "Email", role: "Email Manager", avatar: "👩‍💻", color: "#3b82f6",
    description: "Tu bandeja de entrada, priorizada y automática.",
    quickActions: [
      { icon: "📨", label: "Urgentes", prompt: "¿Hay emails urgentes sin leer?" },
      { icon: "✍️", label: "Redactar", prompt: "Ayúdame a redactar un email profesional" },
      { icon: "📋", label: "Resumen inbox", prompt: "Resume mi bandeja de entrada de hoy" },
      { icon: "🏷️", label: "Categorizar", prompt: "Categoriza mis últimos emails" },
    ],
  },
  {
    id: "fiscal-controller", name: "Controller Fiscal", shortName: "Fiscal", role: "Fiscal Controller", avatar: "💼", color: "#10b981",
    description: "Facturas, IVA trimestral, impuestos. Todo al céntimo.",
    quickActions: [
      { icon: "📄", label: "Facturas pendientes", prompt: "¿Hay facturas vencidas o próximas a vencer?" },
      { icon: "📸", label: "Escanear factura", prompt: "__CAMERA__" },
      { icon: "💰", label: "IVA trimestral", prompt: "Calcula el IVA de este trimestre" },
      { icon: "📊", label: "Tesorería", prompt: "Dame un forecast de tesorería" },
    ],
  },
  {
    id: "calendar-assistant", name: "Asistente Agenda", shortName: "Agenda", role: "Calendar", avatar: "📅", color: "#8b5cf6",
    description: "Eventos, reuniones con Meet, recordatorios.",
    quickActions: [
      { icon: "📅", label: "Hoy", prompt: "¿Qué tengo hoy en la agenda?" },
      { icon: "➕", label: "Nueva reunión", prompt: "Programa una reunión para mañana" },
      { icon: "🔔", label: "Próximos", prompt: "¿Cuáles son mis próximos eventos?" },
      { icon: "🎥", label: "Meet", prompt: "Crea una reunión con Google Meet" },
    ],
  },
  {
    id: "crm-director", name: "Director CRM", shortName: "CRM", role: "CRM Director", avatar: "👥", color: "#ec4899",
    description: "Contactos, oportunidades y seguimiento comercial.",
    quickActions: [
      { icon: "👥", label: "Top contactos", prompt: "¿Quiénes son mis contactos más importantes?" },
      { icon: "📞", label: "Seguimientos", prompt: "¿Hay seguimientos pendientes?" },
      { icon: "📈", label: "Scoring", prompt: "Muestra los contactos con mejor scoring" },
      { icon: "🔍", label: "Buscar", prompt: "Busca información de un contacto" },
    ],
  },
  {
    id: "energy-analyst", name: "Analista Energético", shortName: "Energía", role: "Energy", avatar: "⚡", color: "#f97316",
    description: "Tarifas, mercado eléctrico, ahorro energético.",
    quickActions: [
      { icon: "💡", label: "Precio hoy", prompt: "¿Cuál es el precio de la electricidad hoy?" },
      { icon: "📊", label: "Comparar tarifas", prompt: "Compara tarifas eléctricas para 500kWh/mes" },
      { icon: "📉", label: "Mercado", prompt: "Dame un briefing del mercado eléctrico" },
      { icon: "💰", label: "Ahorro", prompt: "Genera un informe de ahorro para un cliente" },
    ],
  },
  {
    id: "automation-engineer", name: "Ingeniero Auto", shortName: "Auto", role: "Automation", avatar: "🤖", color: "#06b6d4",
    description: "Automatiza tareas repetitivas con reglas inteligentes.",
    quickActions: [
      { icon: "⚙️", label: "Mis reglas", prompt: "Lista mis reglas de automatización activas" },
      { icon: "➕", label: "Nueva regla", prompt: "Crea una regla de automatización" },
      { icon: "📧", label: "Auto-respuesta", prompt: "Configura una auto-respuesta inteligente" },
      { icon: "🔄", label: "Secuencias", prompt: "¿Qué secuencias drip están activas?" },
    ],
  },
  {
    id: "legal-rgpd", name: "Oficial RGPD", shortName: "Legal", role: "Legal", avatar: "⚖️", color: "#6366f1",
    description: "Normativa RGPD, LOPD, protección de datos.",
    quickActions: [
      { icon: "🔒", label: "Compliance", prompt: "¿Estamos cumpliendo con el RGPD?" },
      { icon: "📋", label: "Auditoría", prompt: "Haz una auditoría de protección de datos" },
      { icon: "⚖️", label: "Consulta legal", prompt: "Tengo una duda legal sobre contratación" },
      { icon: "📜", label: "Normativa", prompt: "¿Qué novedades hay en normativa española?" },
    ],
  },
  {
    id: "marketing-director", name: "Director Marketing", shortName: "Marketing", role: "Marketing", avatar: "👨‍🎨", color: "#a855f7",
    description: "SEO, redes sociales, contenido, campañas, branding.",
    quickActions: [
      { icon: "📱", label: "Post social", prompt: "Crea un post para LinkedIn sobre ahorro energético" },
      { icon: "🔍", label: "SEO web", prompt: "Analiza el SEO de somossinergia.es" },
      { icon: "✏️", label: "Blog post", prompt: "Escribe un borrador de post para el blog" },
      { icon: "📧", label: "Campaña email", prompt: "Diseña una campaña de email marketing" },
    ],
  },
  {
    id: "web-master", name: "Web Master", shortName: "Web", role: "Web", avatar: "🧑‍💻", color: "#14b8a6",
    description: "WordPress, landing pages, velocidad web, SSL.",
    quickActions: [
      { icon: "🌐", label: "Estado web", prompt: "Verifica el estado de somossinergia.es" },
      { icon: "🚀", label: "Velocidad", prompt: "Audita la velocidad de nuestra web" },
      { icon: "🔒", label: "Seguridad", prompt: "Revisa la seguridad y SSL de la web" },
      { icon: "📄", label: "Landing page", prompt: "Diseña una landing page de captación" },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────────────

export default function MobileChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo>(AGENTS[0]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const currentMessages = messages[selectedAgent.id] || [];

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length]);

  // ─── Send Message ─────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string, imageBase64?: string) => {
    if (!text.trim() && !imageBase64) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: imageBase64 ? `[Documento escaneado]\n${text || "Analiza este documento"}` : text,
      agentId: selectedAgent.id,
      timestamp: Date.now(),
      imageUrl: imageBase64 ? `data:image/jpeg;base64,${imageBase64.slice(0, 100)}...` : undefined,
    };

    setMessages(prev => ({
      ...prev,
      [selectedAgent.id]: [...(prev[selectedAgent.id] || []), userMsg],
    }));
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          agentId: selectedAgent.id,
          context: `Chat móvil directo con el usuario. Responde de forma concisa y natural. Agente: ${selectedAgent.name}.`,
          ...(imageBase64 ? { imageBase64 } : {}),
        }),
      });

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.reply || data.error || "Sin respuesta",
        agentId: data.agentId || selectedAgent.id,
        timestamp: Date.now(),
        toolsUsed: data.toolsUsed,
      };

      setMessages(prev => ({
        ...prev,
        [selectedAgent.id]: [...(prev[selectedAgent.id] || []), assistantMsg],
      }));

      if (autoSpeak && data.reply) {
        speakText(data.reply, data.agentId || selectedAgent.id);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: "Error de conexión. Verifica tu red e inténtalo de nuevo.",
        agentId: selectedAgent.id,
        timestamp: Date.now(),
      };
      setMessages(prev => ({
        ...prev,
        [selectedAgent.id]: [...(prev[selectedAgent.id] || []), errorMsg],
      }));
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgent, autoSpeak]);

  // ─── Voice Input ──────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const res = await fetch("/api/voice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "stt", audio: base64, language: "es" }),
            });
            const data = await res.json();
            if (data.text) {
              sendMessage(data.text);
            }
          } catch {
            // STT not available
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch {
      // Microphone not available
    }
  }, [sendMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // ─── Voice Output ─────────────────────────────────────────────────────

  const speakText = useCallback(async (text: string, agentId: string) => {
    setIsSpeaking(true);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tts", agentId, text: text.slice(0, 500) }),
      });
      const data = await res.json();
      if (data.ok && data.audioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
        audio.onended = () => setIsSpeaking(false);
        await audio.play();
      } else {
        setIsSpeaking(false);
      }
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  // ─── Camera / OCR ─────────────────────────────────────────────────────

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 },
      });
      streamRef.current = stream;
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      // Camera not available
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const base64 = canvasRef.current.toDataURL("image/jpeg", 0.8).split(",")[1];

    streamRef.current?.getTracks().forEach(t => t.stop());
    setShowCamera(false);
    sendMessage("Escanea y analiza este documento", base64);
  }, [sendMessage]);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setShowCamera(false);
  }, []);

  // ─── Quick Action Handler ─────────────────────────────────────────────

  const handleQuickAction = useCallback((prompt: string) => {
    if (prompt === "__CAMERA__") {
      openCamera();
    } else {
      sendMessage(prompt);
    }
  }, [sendMessage, openCamera]);

  // ─── Handle Submit ────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" style={{ background: "var(--bg-primary)" }}>

      {/* ── Header ── */}
      <header
        className="relative z-30 flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
        style={{
          background: `linear-gradient(180deg, ${selectedAgent.color}12 0%, transparent 100%)`,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Back to dashboard */}
        <a
          href="/dashboard"
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors flex-shrink-0"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <ArrowLeft className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
        </a>

        {/* Agent info — tap to open picker */}
        <button
          onClick={() => setShowAgentPicker(true)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{
              background: `${selectedAgent.color}20`,
              border: `1px solid ${selectedAgent.color}40`,
              boxShadow: `0 0 12px ${selectedAgent.color}15`,
            }}
          >
            {selectedAgent.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {selectedAgent.name}
              </h1>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                style={{ background: selectedAgent.color }}
              />
            </div>
            <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
              {selectedAgent.description}
            </p>
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setAutoSpeak(!autoSpeak)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{
              background: autoSpeak ? `${selectedAgent.color}20` : "var(--bg-card)",
              border: `1px solid ${autoSpeak ? selectedAgent.color + "50" : "var(--border)"}`,
            }}
            title={autoSpeak ? "Voz activada" : "Voz desactivada"}
          >
            {autoSpeak
              ? <Volume2 className="w-4 h-4" style={{ color: selectedAgent.color }} />
              : <VolumeX className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            }
          </button>
          <button
            onClick={() => setShowAgentPicker(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            title="Cambiar agente"
          >
            <MessageSquare className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>
      </header>

      {/* ── Agent Picker Overlay ── */}
      {showAgentPicker && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          style={{ background: "rgba(5,10,20,0.97)", backdropFilter: "blur(16px)" }}
        >
          <div className="p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  Equipo Sinergia
                </h2>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  10 agentes IA especializados
                </p>
              </div>
              <button
                onClick={() => setShowAgentPicker(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <X className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {AGENTS.map(agent => {
                const msgCount = (messages[agent.id] || []).length;
                const isSelected = selectedAgent.id === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowAgentPicker(false);
                    }}
                    className="glass-card p-3.5 text-left transition-all active:scale-[0.97]"
                    style={{
                      borderColor: isSelected ? selectedAgent.color + "60" : undefined,
                      background: isSelected ? `${agent.color}08` : undefined,
                      boxShadow: isSelected ? `0 0 20px ${agent.color}15` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                        style={{
                          background: `${agent.color}20`,
                          border: `1px solid ${agent.color}30`,
                        }}
                      >
                        {agent.avatar}
                      </div>
                      {isSelected && (
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: `${agent.color}25`, color: agent.color }}
                        >
                          ACTIVO
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {agent.shortName}
                    </p>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {agent.role}
                    </p>
                    {msgCount > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <MessageSquare className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {msgCount} mensajes
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Back to Dashboard link */}
            <a
              href="/dashboard"
              className="glass-card flex items-center justify-center gap-2 p-3 mt-4 transition-all active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                Volver al Dashboard
              </span>
            </a>
          </div>
        </div>
      )}

      {/* ── Camera Overlay ── */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button onClick={closeCamera} className="flex items-center gap-2 text-white/80">
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Cancelar</span>
            </button>
            <span className="text-sm font-medium text-white">Escanear documento</span>
            <div className="w-16" />
          </div>
          <div className="flex-1 relative">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline autoPlay muted />
            {/* Scan frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[85%] aspect-[3/4] relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400 rounded-br-lg" />
                {/* Scan line animation */}
                <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-bounce" style={{ top: "50%" }} />
              </div>
            </div>
            <p className="absolute bottom-8 left-0 right-0 text-center text-xs text-white/60">
              Enfoca el documento dentro del marco
            </p>
          </div>
          <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex justify-center bg-black/80">
            <button
              onClick={capturePhoto}
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{
                background: "linear-gradient(135deg, var(--accent), #0ea5e9)",
                boxShadow: "0 0 24px var(--accent-glow), 0 0 48px rgba(6,182,212,0.15)",
              }}
            >
              <Camera className="w-7 h-7 text-white" />
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* ── Chat Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative z-10">
        {currentMessages.length === 0 ? (
          /* ── Empty State ── */
          <div className="flex flex-col items-center justify-center h-full px-2">
            {/* Agent avatar */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-4"
              style={{
                background: `${selectedAgent.color}15`,
                border: `1px solid ${selectedAgent.color}30`,
                boxShadow: `0 0 32px ${selectedAgent.color}15, 0 0 64px ${selectedAgent.color}08`,
              }}
            >
              {selectedAgent.avatar}
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {selectedAgent.name}
            </h2>
            <p className="text-xs text-center mb-6 max-w-[260px]" style={{ color: "var(--text-secondary)" }}>
              {selectedAgent.description}
            </p>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
              {selectedAgent.quickActions.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickAction(qa.prompt)}
                  className="glass-card flex items-center gap-2.5 p-3 transition-all active:scale-[0.97]"
                >
                  <span className="text-lg flex-shrink-0">{qa.icon}</span>
                  <span className="text-xs font-medium text-left" style={{ color: "var(--text-primary)" }}>
                    {qa.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Hint */}
            <p className="text-[11px] mt-6 text-center" style={{ color: "var(--text-muted)" }}>
              <Sparkles className="w-3 h-3 inline mr-1" style={{ color: "var(--accent)" }} />
              Escribe, envía un audio o escanea un documento
            </p>
          </div>
        ) : (
          /* ── Messages ── */
          <>
            {currentMessages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[82%] rounded-2xl px-3.5 py-2.5"
                  style={msg.role === "user" ? {
                    background: `linear-gradient(135deg, ${selectedAgent.color}, ${selectedAgent.color}cc)`,
                    borderBottomRightRadius: "6px",
                    boxShadow: `0 2px 12px ${selectedAgent.color}30`,
                  } : {
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderBottomLeftRadius: "6px",
                  }}
                >
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs">{selectedAgent.avatar}</span>
                      <span className="text-[11px] font-bold" style={{ color: selectedAgent.color }}>
                        {selectedAgent.shortName}
                      </span>
                    </div>
                  )}
                  <p
                    className="text-[13px] whitespace-pre-wrap leading-relaxed"
                    style={{ color: msg.role === "user" ? "#fff" : "var(--text-primary)" }}
                  >
                    {msg.content}
                  </p>

                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.toolsUsed.slice(0, 3).map((t, i) => (
                        <span
                          key={i}
                          className="text-[9px] px-1.5 py-0.5 rounded-full"
                          style={{ background: `${selectedAgent.color}15`, color: selectedAgent.color }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <span className="text-[10px]" style={{ color: msg.role === "user" ? "rgba(255,255,255,0.6)" : "var(--text-muted)" }}>
                      {new Date(msg.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {msg.role === "assistant" && (
                      <button
                        onClick={() => speakText(msg.content, msg.agentId)}
                        className="p-1 rounded-lg transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        title="Escuchar"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-md px-4 py-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: selectedAgent.color, animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: selectedAgent.color, animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: selectedAgent.color, animationDelay: "300ms" }} />
                </div>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {selectedAgent.shortName} pensando...
                </span>
              </div>
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="flex justify-center">
            <div
              className="rounded-full px-4 py-1.5 flex items-center gap-2"
              style={{
                background: `${selectedAgent.color}10`,
                border: `1px solid ${selectedAgent.color}30`,
              }}
            >
              <Volume2 className="w-4 h-4 animate-pulse" style={{ color: selectedAgent.color }} />
              <span className="text-xs" style={{ color: selectedAgent.color }}>Hablando...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Bottom Agent Quick-Switch Bar ── */}
      <div
        className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto no-scrollbar relative z-20"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        {AGENTS.map(agent => {
          const isActive = selectedAgent.id === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all flex-shrink-0 active:scale-95"
              style={{
                background: isActive ? `${agent.color}15` : "transparent",
                minWidth: "44px",
              }}
            >
              <span className="text-base">{agent.avatar}</span>
              <span
                className="text-[9px] font-medium leading-tight"
                style={{ color: isActive ? agent.color : "var(--text-muted)" }}
              >
                {agent.shortName}
              </span>
              {isActive && (
                <span
                  className="w-1 h-1 rounded-full mt-0.5"
                  style={{ background: agent.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Input Area ── */}
      <div
        className="relative z-20 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        style={{ background: "var(--bg-primary)", borderTop: "1px solid var(--border)" }}
      >
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* Camera button */}
          <button
            type="button"
            onClick={openCamera}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            title="Escanear documento"
          >
            <Camera className="w-[18px] h-[18px]" style={{ color: "var(--text-secondary)" }} />
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Escribe a ${selectedAgent.shortName}...`}
              className="w-full text-sm rounded-xl px-3.5 py-2.5 resize-none max-h-24 focus:outline-none transition-all"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = selectedAgent.color + "60")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              rows={1}
              disabled={isLoading}
            />
          </div>

          {/* Voice / Send button */}
          {input.trim() ? (
            <button
              type="submit"
              disabled={isLoading}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${selectedAgent.color}, ${selectedAgent.color}cc)`,
                boxShadow: `0 0 16px ${selectedAgent.color}30`,
              }}
            >
              <Send className="w-[18px] h-[18px] text-white" />
            </button>
          ) : (
            <button
              type="button"
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
              style={{
                background: isRecording
                  ? "linear-gradient(135deg, #ef4444, #dc2626)"
                  : "var(--bg-card)",
                border: isRecording ? "none" : "1px solid var(--border)",
                boxShadow: isRecording ? "0 0 20px rgba(239,68,68,0.4)" : "none",
                animation: isRecording ? "pulse 1.5s infinite" : "none",
              }}
              title="Mantén pulsado para hablar"
            >
              {isRecording
                ? <MicOff className="w-[18px] h-[18px] text-white" />
                : <Mic className="w-[18px] h-[18px]" style={{ color: "var(--text-secondary)" }} />
              }
            </button>
          )}
        </form>
      </div>

      {/* ── CSS for scrollbar hiding ── */}
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
