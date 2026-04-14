"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  X,
  Send,
  Mic,
  MicOff,
  Paperclip,
  Loader2,
  Trash2,
  Sparkles,
  CheckCircle2,
  XCircle,
  User,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "sinergia.floatingAgent.history";
const MAX_HISTORY = 50;

interface ToolCall {
  name: string;
  result: { ok: boolean };
}
interface Message {
  role: "user" | "model";
  content: string;
  toolCalls?: ToolCall[];
  attachment?: { kind: "image" | "pdf"; name: string };
}

// Web Speech API minimal types
interface SREventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
  resultIndex: number;
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SREventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRCtor = new () => SRInstance;

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export default function FloatingAgent({ open, onClose, onOpen }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [uploading, setUploading] = useState(false);
  const [internalDrag, setInternalDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SRInstance | null>(null);

  // ─── Persistencia ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_HISTORY));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {
      // ignore quota errors
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, sending]);

  // ─── Send to agent ────────────────────────────────────────────
  const sendToAgent = useCallback(
    async (text: string, attachment?: Message["attachment"]) => {
      if (!text.trim()) return;
      const userMsg: Message = { role: "user", content: text, attachment };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setInterim("");
      setSending(true);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setMessages([
            ...next,
            { role: "model", content: data.response || "(sin respuesta)", toolCalls: data.toolCalls || [] },
          ]);
        } else if (res.status === 429) {
          toast.error("Demasiadas peticiones, espera unos segundos");
          setMessages([...next, { role: "model", content: "⏳ Espera unos segundos y vuelve a preguntar." }]);
        } else {
          setMessages([...next, { role: "model", content: `Error: ${data.error || res.status}` }]);
        }
      } catch (e) {
        setMessages([
          ...next,
          { role: "model", content: `Error de red: ${e instanceof Error ? e.message : "desconocido"}` },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages],
  );

  const handleSend = () => sendToAgent(input);

  const clear = () => {
    if (!confirm("¿Vaciar conversación?")) return;
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ─── Voice ────────────────────────────────────────────────────
  const startVoice = () => {
    type W = Window & { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const w = window as W;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voz no disponible. Usa Chrome / Edge / Safari.");
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

  // ─── File upload (image / pdf) ────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error("Solo imágenes (JPG/PNG/WebP) o PDF");
      return;
    }
    setUploading(true);

    // Optimistic user message
    const attachment: Message["attachment"] = {
      kind: isImage ? "image" : "pdf",
      name: file.name,
    };

    try {
      let extracted: Record<string, unknown> | null = null;

      if (isImage) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("mode", "invoice");
        const res = await fetch("/api/agent/photo-extract", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Vision failed");
        extracted = json.data as Record<string, unknown>;
      } else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/agent/pdf-extract", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "PDF parse failed");
        extracted = json.data as Record<string, unknown>;
      }

      // Inject into chat as a structured user message — agent will then act
      const summary = describe(extracted);
      const text =
        `He ${isImage ? "subido una foto" : "subido un PDF"} de una factura. Datos extraídos:\n${summary}\n\n¿Puedes confirmar y crear el registro o hacer lo que corresponda?`;
      await sendToAgent(text, attachment);
    } catch (e) {
      toast.error("Error procesando archivo", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  // ─── Drop inside the panel ────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setInternalDrag(true);
  };
  const onDragLeave = () => setInternalDrag(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setInternalDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ─── External file injection (from GlobalDropZone) ───────────
  // The dashboard listens on the window for a custom event "sinergia:file"
  // so any source (global drop zone, future buttons) can deliver a File here.
  useEffect(() => {
    const onExternalFile = (e: Event) => {
      const file = (e as CustomEvent<File>).detail;
      if (file instanceof File) handleFile(file);
    };
    window.addEventListener("sinergia:file", onExternalFile);
    return () => window.removeEventListener("sinergia:file", onExternalFile);
    // handleFile depends on messages, but using stable dispatch is OK here
    // since handleFile reads the latest state via setState callbacks indirectly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── FAB (collapsed) ──────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={onOpen}
        aria-label="Abrir Sinergia AI"
        className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-30 w-14 h-14 rounded-full bg-gradient-to-br from-sinergia-500 to-purple-500 shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
      >
        <Bot className="w-6 h-6 text-white" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {Math.min(messages.length, 99)}
          </span>
        )}
      </button>
    );
  }

  // ─── Expanded panel ───────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-40 lg:inset-auto lg:bottom-6 lg:right-6 lg:w-[400px] lg:h-[640px] flex flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex-1 lg:flex-none lg:h-full bg-[var(--bg-primary)] lg:bg-[var(--bg-secondary)] lg:rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sinergia-500/20 to-purple-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-sinergia-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Sinergia AI</div>
            <div className="text-[10px] text-[var(--text-secondary)]">
              {sending ? "Pensando..." : listening ? "Escuchando..." : uploading ? "Procesando archivo..." : "Habla, escribe o suelta un archivo"}
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clear}
              aria-label="Vaciar conversación"
              className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-card)] text-[var(--text-secondary)] transition"
              title="Vaciar conversación"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-card)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !sending ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <Sparkles className="w-12 h-12 text-sinergia-400/30 mb-3" />
              <h3 className="text-sm font-semibold mb-1">Pregunta lo que quieras</h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Puedo buscar, crear, eliminar, generar facturas, recordatorios y mucho más.
              </p>
              <div className="space-y-1.5 text-[11px] text-left w-full max-w-xs">
                <Suggestion text='"¿Cuántas facturas vencidas tengo?"' />
                <Suggestion text='"Borra los emails de X cuando lleguen"' />
                <Suggestion text='"Genera el IVA del Q2"' />
                <Suggestion text='Suelta una imagen o PDF de factura aquí 📎' />
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Bubble key={i} message={m} />)
          )}
          {sending && (
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl px-3 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--text-secondary)]" />
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-primary)]/50">
          {(listening || interim) && (
            <div className="text-[11px] px-2 pb-2 text-sinergia-400 italic">
              {interim || "Te escucho..."}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={onPickFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || sending}
              aria-label="Adjuntar archivo"
              className="min-w-[40px] min-h-[44px] rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
              title="Adjuntar imagen o PDF"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>
            <button
              onClick={listening ? stopVoice : startVoice}
              disabled={sending}
              aria-label={listening ? "Detener voz" : "Activar voz"}
              className={`min-w-[40px] min-h-[44px] rounded-lg flex items-center justify-center transition disabled:opacity-50 ${
                listening
                  ? "bg-red-500/20 text-red-400 animate-pulse"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
              }`}
              title={listening ? "Detener" : "Hablar"}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Escribe o pulsa el micro..."
              disabled={sending}
              className="flex-1 px-3 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 min-h-[44px]"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label="Enviar"
              className="btn-accent rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drag overlay (shown when dragging file over the panel) */}
        {internalDrag && (
          <div className="absolute inset-0 bg-sinergia-500/15 backdrop-blur-sm border-4 border-dashed border-sinergia-400 rounded-2xl flex flex-col items-center justify-center pointer-events-none z-10">
            <Paperclip className="w-12 h-12 text-sinergia-400 mb-2" />
            <p className="text-sm font-semibold text-sinergia-400">Suelta el archivo aquí</p>
            <p className="text-xs text-[var(--text-secondary)]">Imagen o PDF</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? "bg-sinergia-600/20 text-sinergia-400" : "bg-purple-500/15 text-purple-400"
        }`}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className="max-w-[78%] space-y-1.5">
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isUser
              ? "bg-sinergia-600/15"
              : "bg-[var(--bg-card)] border border-[var(--border)]"
          }`}
        >
          {message.attachment && (
            <div className="text-[10px] text-[var(--text-secondary)] mb-1 flex items-center gap-1">
              <Paperclip className="w-3 h-3" /> {message.attachment.name} ({message.attachment.kind.toUpperCase()})
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.toolCalls.map((tc, j) => (
              <span
                key={j}
                className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded ${
                  tc.result.ok
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {tc.result.ok ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                {tc.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-[var(--bg-card)] text-[var(--text-secondary)]">
      {text}
    </div>
  );
}

/** Format extracted invoice data for the agent prompt */
function describe(data: Record<string, unknown>): string {
  const lines: string[] = [];
  if (data.issuerName) lines.push(`• Emisor: ${data.issuerName}`);
  if (data.issuerNif) lines.push(`• NIF: ${data.issuerNif}`);
  if (data.invoiceNumber) lines.push(`• Nº factura: ${data.invoiceNumber}`);
  if (data.invoiceDate) lines.push(`• Fecha: ${data.invoiceDate}`);
  if (data.dueDate) lines.push(`• Vencimiento: ${data.dueDate}`);
  if (data.subtotal) lines.push(`• Base: ${data.subtotal} ${data.currency || "EUR"}`);
  if (data.tax) lines.push(`• IVA: ${data.tax} ${data.currency || "EUR"}`);
  if (data.totalAmount) lines.push(`• Total: ${data.totalAmount} ${data.currency || "EUR"}`);
  if (data.category) lines.push(`• Categoría: ${data.category}`);
  if (data.concept) lines.push(`• Concepto: ${data.concept}`);
  if (data.confidence !== undefined) lines.push(`• Confianza IA: ${data.confidence}%`);
  return lines.join("\n");
}
