"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "model";
  content: string;
}

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content:
        "Hola, soy Sinergia AI. Puedo ayudarte con tus emails y facturas. Pregunta lo que necesites.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();
      setMessages([
        ...updatedMessages,
        { role: "model", content: data.response || data.error || "Sin respuesta" },
      ]);
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "model", content: "Error de conexión. Inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card overflow-hidden flex flex-col" style={{ height: "450px" }}>
      {/* Chat header */}
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <Bot className="w-4 h-4 text-sinergia-400" />
        <span className="text-sm font-semibold">Sinergia AI</span>
        <span className="text-[10px] text-[var(--text-secondary)] ml-1">
          Gemini Pro
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                msg.role === "user"
                  ? "bg-sinergia-600/20 text-sinergia-400"
                  : "bg-purple-500/15 text-purple-400"
              }`}
            >
              {msg.role === "user" ? (
                <User className="w-3.5 h-3.5" />
              ) : (
                <Bot className="w-3.5 h-3.5" />
              )}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-sinergia-600/15 text-[var(--text-primary)]"
                  : "bg-[var(--bg-card)] border border-[var(--border)]"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-500/15 flex items-center justify-center text-purple-400">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl px-4 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--text-secondary)]" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escribe tu pregunta..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] transition disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="btn-accent p-2.5 rounded-xl disabled:opacity-30"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
