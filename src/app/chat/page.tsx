"use client";

/**
 * Mobile Agent Chat — Talk to any Sinergia agent individually
 *
 * Features:
 *   - Per-agent chat with unique personality and voice
 *   - Voice input (speech-to-text via Deepgram)
 *   - Voice output (text-to-speech per agent via ElevenLabs)
 *   - Camera for document/invoice scanning (OCR)
 *   - Quick agent switcher
 *   - Push notification integration
 *   - Full PWA support (installable, offline-aware)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, MicOff, Camera, Phone, Volume2, VolumeX,
  ChevronLeft, Menu, X, Zap, Bot, User, Loader2,
  Image as ImageIcon, FileText, PhoneCall,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  description: string;
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
  { id: "ceo", name: "Director General", role: "CEO", avatar: "👨‍💼", color: "#f59e0b", description: "Coordina todo el equipo. Pregunta lo que necesites." },
  { id: "email-manager", name: "Gestor de Email", role: "Email", avatar: "👩‍💻", color: "#3b82f6", description: "Tu bandeja de entrada, priorizada y automática." },
  { id: "fiscal-controller", name: "Controller Fiscal", role: "Fiscal", avatar: "💼", color: "#10b981", description: "Facturas, IVA, impuestos. Todo al céntimo." },
  { id: "calendar-assistant", name: "Asistente Agenda", role: "Agenda", avatar: "📅", color: "#8b5cf6", description: "Eventos, reuniones, recordatorios." },
  { id: "crm-director", name: "Director CRM", role: "CRM", avatar: "👥", color: "#ec4899", description: "Tus contactos y oportunidades de negocio." },
  { id: "energy-analyst", name: "Analista Energético", role: "Energía", avatar: "⚡", color: "#f97316", description: "Tarifas, consumos, ahorro energético." },
  { id: "automation-engineer", name: "Ingeniero Auto", role: "Auto", avatar: "🤖", color: "#06b6d4", description: "Automatiza tareas repetitivas." },
  { id: "legal-rgpd", name: "Oficial RGPD", role: "Legal", avatar: "⚖️", color: "#6366f1", description: "Normativa, RGPD, protección de datos." },
  { id: "marketing-director", name: "Director Marketing", role: "Marketing", avatar: "👨‍🎨", color: "#a855f7", description: "SEO, redes sociales, contenido, branding." },
  { id: "web-master", name: "Web Master", role: "Web", avatar: "🧑‍💻", color: "#14b8a6", description: "WordPress, landing pages, velocidad web." },
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

      // Auto-speak response if enabled
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

        // Convert to base64 and send to STT
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
            // Fallback: just notify user
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

    // Close camera
    streamRef.current?.getTracks().forEach(t => t.stop());
    setShowCamera(false);

    // Send to OCR + agent
    sendMessage("Escanea y analiza este documento", base64);
  }, [sendMessage]);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setShowCamera(false);
  }, []);

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
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white overflow-hidden">
      {/* ── Header ── */}
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-gray-800"
        style={{ background: `linear-gradient(135deg, ${selectedAgent.color}15, transparent)` }}
      >
        <button
          onClick={() => setShowAgentPicker(!showAgentPicker)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <span className="text-2xl">{selectedAgent.avatar}</span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold truncate">{selectedAgent.name}</h1>
            <p className="text-xs text-gray-400 truncate">{selectedAgent.description}</p>
          </div>
          <Menu className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoSpeak(!autoSpeak)}
            className={`p-2 rounded-full transition-colors ${
              autoSpeak ? "bg-cyan-500/20 text-cyan-400" : "text-gray-500"
            }`}
            title={autoSpeak ? "Voz activada" : "Voz desactivada"}
          >
            {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── Agent Picker Overlay ── */}
      {showAgentPicker && (
        <div className="absolute inset-0 z-50 bg-gray-950/95 backdrop-blur-sm overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Equipo Sinergia</h2>
              <button onClick={() => setShowAgentPicker(false)}>
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {AGENTS.map(agent => {
                const unread = (messages[agent.id] || []).length;
                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowAgentPicker(false);
                    }}
                    className={`p-3 rounded-xl border transition-all text-left ${
                      selectedAgent.id === agent.id
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{agent.avatar}</span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: agent.color }}
                      />
                    </div>
                    <p className="text-sm font-semibold truncate">{agent.name}</p>
                    <p className="text-xs text-gray-500 truncate">{agent.role}</p>
                    {unread > 0 && (
                      <span className="mt-1 inline-block text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                        {unread} msgs
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Camera Overlay ── */}
      {showCamera && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4">
            <button onClick={closeCamera} className="text-white">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-sm font-medium">Escanear documento</span>
            <div className="w-6" />
          </div>
          <div className="flex-1 relative">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline autoPlay muted />
            <div className="absolute inset-8 border-2 border-white/30 rounded-xl pointer-events-none" />
          </div>
          <div className="p-6 flex justify-center">
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
            >
              <Camera className="w-8 h-8 text-gray-900" />
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* ── Chat Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {currentMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <span className="text-5xl mb-3">{selectedAgent.avatar}</span>
            <h2 className="text-lg font-bold mb-1">{selectedAgent.name}</h2>
            <p className="text-sm text-gray-400 mb-6">{selectedAgent.description}</p>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {selectedAgent.id === "ceo" && (
                <>
                  <QuickAction icon={<Zap />} label="Resumen del día" onClick={() => sendMessage("Dame un resumen ejecutivo del día")} />
                  <QuickAction icon={<Bot />} label="Estado agentes" onClick={() => sendMessage("¿Cómo están rindiendo los agentes?")} />
                </>
              )}
              {selectedAgent.id === "email-manager" && (
                <>
                  <QuickAction icon={<FileText />} label="Emails urgentes" onClick={() => sendMessage("¿Hay emails urgentes sin leer?")} />
                  <QuickAction icon={<Send />} label="Redactar email" onClick={() => sendMessage("Ayúdame a redactar un email")} />
                </>
              )}
              {selectedAgent.id === "fiscal-controller" && (
                <>
                  <QuickAction icon={<FileText />} label="Facturas pendientes" onClick={() => sendMessage("¿Hay facturas vencidas?")} />
                  <QuickAction icon={<Camera />} label="Escanear factura" onClick={openCamera} />
                </>
              )}
              {selectedAgent.id === "energy-analyst" && (
                <>
                  <QuickAction icon={<Zap />} label="Precio hoy" onClick={() => sendMessage("¿Cuál es el precio de la electricidad hoy?")} />
                  <QuickAction icon={<FileText />} label="Comparar tarifas" onClick={() => sendMessage("Compara tarifas eléctricas para 500kWh/mes")} />
                </>
              )}
              {selectedAgent.id === "marketing-director" && (
                <>
                  <QuickAction icon={<ImageIcon />} label="Post social" onClick={() => sendMessage("Crea un post para LinkedIn sobre ahorro energético")} />
                  <QuickAction icon={<FileText />} label="SEO web" onClick={() => sendMessage("Analiza el SEO de somossinergia.es")} />
                </>
              )}
              {/* Generic quick actions for other agents */}
              {!["ceo", "email-manager", "fiscal-controller", "energy-analyst", "marketing-director"].includes(selectedAgent.id) && (
                <>
                  <QuickAction icon={<Zap />} label="¿Qué puedes hacer?" onClick={() => sendMessage("¿Qué puedes hacer por mí?")} />
                  <QuickAction icon={<Bot />} label="Estado" onClick={() => sendMessage("Dame tu informe de estado")} />
                </>
              )}
            </div>
          </div>
        )}

        {currentMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.role === "user"
                  ? "bg-cyan-600 text-white rounded-br-md"
                  : "bg-gray-800 text-gray-100 rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">{selectedAgent.avatar}</span>
                  <span className="text-xs font-semibold" style={{ color: selectedAgent.color }}>
                    {selectedAgent.name}
                  </span>
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>

              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.toolsUsed.map((t, i) => (
                    <span key={i} className="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-500">
                  {new Date(msg.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {msg.role === "assistant" && (
                  <button
                    onClick={() => speakText(msg.content, msg.agentId)}
                    className="text-gray-500 hover:text-cyan-400 transition-colors ml-2"
                    title="Escuchar"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span className="text-xs text-gray-400">{selectedAgent.name} pensando...</span>
              </div>
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="flex justify-center">
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-full px-4 py-1.5 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400">Hablando...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="border-t border-gray-800 bg-gray-900/80 backdrop-blur px-3 py-2 safe-area-bottom">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* Camera button */}
          <button
            type="button"
            onClick={openCamera}
            className="p-2.5 text-gray-500 hover:text-cyan-400 transition-colors flex-shrink-0"
            title="Escanear documento"
          >
            <Camera className="w-5 h-5" />
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Escribe a ${selectedAgent.name}...`}
              className="w-full bg-gray-800 text-white text-sm rounded-2xl px-4 py-2.5 resize-none max-h-24 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-gray-500"
              rows={1}
              disabled={isLoading}
            />
          </div>

          {/* Voice / Send button */}
          {input.trim() ? (
            <button
              type="submit"
              disabled={isLoading}
              className="p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              className={`p-2.5 rounded-full transition-all flex-shrink-0 ${
                isRecording
                  ? "bg-red-500 text-white animate-pulse scale-110"
                  : "bg-gray-800 text-gray-400 hover:text-cyan-400"
              }`}
              title="Mantén pulsado para hablar"
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Quick Action Button ─────────────────────────────────────────────────

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50 hover:border-cyan-500/30 hover:bg-gray-800 transition-all text-left"
    >
      <span className="text-cyan-400 flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      <span className="text-xs text-gray-300">{label}</span>
    </button>
  );
}
