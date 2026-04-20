"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Sparkles, Mic, MicOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "model";
  content: string;
  /** Streaming animation state for the most recent AI message */
  streaming?: boolean;
}

// Web Speech API (Chromium / Safari) — minimal local typing
type SpeechRecognitionResult = { transcript: string };
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<SpeechRecognitionResult> & { isFinal?: boolean }>;
};
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SRCtor = new () => SpeechRecognitionInstance;

const STORAGE_KEY = "sinergia-agent-chat-v2";
const WELCOME: Message = {
  role: "model",
  content:
    "Hola, soy Sinergia AI. Pregúntame por tus emails, facturas o pídeme acciones — puedo ejecutarlas yo.",
};

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  // Persist conversation locally
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitiza: elimina mensajes "Sin respuesta" legacy (eran ruido de
          // un fallback antiguo). También elimina el user message huérfano
          // que los precedía para no dejar preguntas sin contestar visibles.
          const cleaned: Message[] = [];
          for (let i = 0; i < parsed.length; i++) {
            const m = parsed[i];
            if (m.role === "model" && m.content === "Sin respuesta") {
              if (cleaned[cleaned.length - 1]?.role === "user") cleaned.pop();
              continue;
            }
            cleaned.push(m);
          }
          setMessages(cleaned.length > 0 ? cleaned : [WELCOME]);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamingText, loading]);

  // Streaming effect: gradually reveal AI text
  const streamReply = useCallback((full: string) => {
    return new Promise<void>((resolve) => {
      let i = 0;
      const step = Math.max(1, Math.floor(full.length / 80)); // ~80 frames
      setStreamingText("");
      const interval = window.setInterval(() => {
        i = Math.min(full.length, i + step);
        setStreamingText(full.slice(0, i));
        if (i >= full.length) {
          window.clearInterval(interval);
          setTimeout(() => {
            setStreamingText(null);
            resolve();
          }, 80);
        }
      }, 18);
    });
  }, []);

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const updated = [...messages, userMessage];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent-gpt5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated
            .filter((_, idx) => !(idx === 0 && _.role === "model")) // skip welcome
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();

      // Fallback inteligente cuando el modelo no genera texto pero sí
      // ejecutó tools: resume las herramientas que corrió para no dejar
      // al usuario con "Sin respuesta".
      let reply: string = data.reply || data.response || data.error || "";
      if (!reply && Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
        // Primero: buscar errores de permisos / reauth en los tool results
        const authError = data.toolCalls.find(
          (t: { result?: { ok?: boolean; error?: string; needsReauth?: boolean } }) =>
            t.result && (!t.result.ok) && (t.result.needsReauth || (t.result.error && /permiso|scope|reauth|insufficient/i.test(t.result.error)))
        );
        if (authError?.result?.error) {
          reply = authError.result.error;
        } else {
          const okCount = data.toolCalls.filter((t: { result?: { ok?: boolean } }) => t.result?.ok).length;
          const failedTools = data.toolCalls.filter((t: { result?: { ok?: boolean } }) => !t.result?.ok);
          const names = data.toolCalls.map((t: { name: string }) => t.name).join(", ");
          if (failedTools.length > 0 && failedTools[0]?.result?.error) {
            reply = `Error al ejecutar ${failedTools[0].name}: ${failedTools[0].result.error}`;
          } else {
            reply = `He ejecutado ${data.toolCalls.length} acción(es) (${names}), ${okCount} con éxito. ¿Quieres que te resuma algo en concreto?`;
          }
        }
      }
      if (!reply) {
        reply = "No he podido generar una respuesta. Reformula la petición o inténtalo de nuevo.";
      }

      await streamReply(reply);
      setMessages([...updated, { role: "model", content: reply }]);
    } catch {
      setMessages([
        ...updated,
        { role: "model", content: "Error de conexión. Inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (!confirm("¿Vaciar conversación?")) return;
    setMessages([WELCOME]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  // ─── Voice ────────────────────────────────────────────────────
  const startVoice = () => {
    type W = Window & { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const w = window as W;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voz no disponible en este navegador");
      return;
    }
    const rec = new SR();
    rec.lang = "es-ES";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onstart = () => {
      setListening(true);
      setInterim("");
    };
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i]?.[0]?.transcript || "";
        const isFinal = (e.results[i] as unknown as { isFinal?: boolean }).isFinal;
        if (isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        setInput((prev) => (prev ? `${prev} ${finalText}` : finalText));
      }
    };
    rec.onerror = () => {
      setListening(false);
      setInterim("");
      toast.error("Error de micrófono");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    rec.start();
  };

  const stopVoice = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const isAiActive = loading || !!streamingText;

  return (
    <div
      className={`ai-neon-frame ai-chat-surface relative overflow-hidden flex flex-col h-[calc(100vh-220px)] lg:h-[520px] ${
        isAiActive ? "is-active" : ""
      }`}
    >
      {/* Header */}
      <div className="relative z-10 px-5 py-3 border-b border-[var(--border)]/60 backdrop-blur-md flex items-center gap-3">
        <span className={`ai-orb ${isAiActive ? "is-speaking" : ""}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            Sinergia AI
            <Sparkles className="w-3 h-3 text-purple-400" />
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            {isAiActive ? "procesando…" : "Gemini · listo"}
          </div>
        </div>
        <button
          onClick={clearChat}
          aria-label="Vaciar chat"
          className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-red-500/10 text-[var(--text-secondary)] hover:text-red-400 transition flex items-center justify-center"
          title="Vaciar conversación"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {messages.map((msg, i) => {
          const isStreamingLast =
            streamingText !== null && i === messages.length - 1 && msg.role === "user";
          // We render the streaming AI bubble below as a virtual entry
          return (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""} animate-fade-in`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md ${
                  msg.role === "user"
                    ? "bg-sinergia-600/25 text-sinergia-300 border border-sinergia-500/30"
                    : "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                }`}
                style={{ boxShadow: msg.role === "user"
                  ? "0 0 12px rgba(99,102,241,0.25)"
                  : "0 0 12px rgba(168,85,247,0.25)" }}
              >
                {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user" ? "user-bubble" : "ai-bubble"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              </div>
              {isStreamingLast && null}
            </div>
          );
        })}

        {/* Streaming AI bubble (transient) */}
        {streamingText !== null && (
          <div className="flex gap-3 animate-fade-in">
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center justify-center"
              style={{ boxShadow: "0 0 16px rgba(168,85,247,0.5)" }}
            >
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="ai-bubble max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed">
              <div className="whitespace-pre-wrap break-words ai-caret">{streamingText}</div>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {loading && streamingText === null && (
          <div className="flex gap-3 animate-fade-in">
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center justify-center"
              style={{ boxShadow: "0 0 16px rgba(168,85,247,0.5)" }}
            >
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="ai-bubble rounded-2xl px-4 py-3">
              <div className="wave-bars" aria-label="Pensando">
                <span /><span /><span /><span /><span />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="relative z-10 px-3 py-3 border-t border-[var(--border)]/60 backdrop-blur-md">
        {listening && interim && (
          <div className="mb-2 text-[11px] italic text-rose-400 px-2">
            🎙 «{interim}…»
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={listening ? stopVoice : startVoice}
            aria-label={listening ? "Detener voz" : "Hablar"}
            className={`relative min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition ${
              listening
                ? "bg-rose-500/20 text-rose-400 mic-listening"
                : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10"
            }`}
            title={listening ? "Detener" : "Hablar (es-ES)"}
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={listening ? "Te escucho…" : "Pregunta o pide una acción…"}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-card)]/80 backdrop-blur border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)] transition disabled:opacity-50 min-h-[44px]"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            aria-label="Enviar"
            className="send-pulse min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-gradient-to-br from-sinergia-500 to-purple-600 text-white shadow-[0_0_16px_rgba(168,85,247,0.35)] hover:shadow-[0_0_24px_rgba(168,85,247,0.55)] transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
