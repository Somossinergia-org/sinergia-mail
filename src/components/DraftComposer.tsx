"use client";

import { useState } from "react";
import {
  Send,
  RefreshCw,
  Trash2,
  Loader2,
  PenLine,
  CheckCircle2,
} from "lucide-react";

interface DraftComposerProps {
  emailId: number;
  onDraftSent?: () => void;
}

const TONES = [
  { value: "profesional", label: "Profesional" },
  { value: "formal", label: "Formal" },
  { value: "amable", label: "Amable" },
  { value: "casual", label: "Casual" },
  { value: "firme", label: "Firme" },
];

export default function DraftComposer({
  emailId,
  onDraftSent,
}: DraftComposerProps) {
  const [tone, setTone] = useState("profesional");
  const [instructions, setInstructions] = useState("");
  const [draftId, setDraftId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "generated" | "sent" | "discarded"
  >("idle");

  const handleGenerate = async () => {
    setGenerating(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/agent/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, tone, instructions: instructions || undefined }),
      });

      if (!res.ok) throw new Error("Error generando borrador");

      const data = await res.json();
      setDraftId(data.draftId);
      setSubject(data.subject);
      setBody(data.body);
      setStatus("generated");
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (action: "send" | "discard") => {
    if (!draftId) return;

    if (action === "send") setSending(true);

    try {
      const res = await fetch("/api/agent/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, action, body }),
      });

      if (!res.ok) throw new Error(`Error: ${action}`);

      setStatus(action === "send" ? "sent" : "discarded");
      if (action === "send") onDraftSent?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  if (status === "sent") {
    return (
      <div className="flex items-center gap-2 text-xs text-green-400 py-2">
        <CheckCircle2 className="w-4 h-4" />
        Borrador guardado en Gmail
      </div>
    );
  }

  if (status === "discarded") {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-2">
        <Trash2 className="w-3.5 h-3.5" />
        Borrador descartado
      </div>
    );
  }

  return (
    <div className="mt-3 p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 space-y-3">
      {/* Tone + instructions */}
      {status === "idle" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-secondary)]">Tono:</span>
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={`text-xs px-2.5 py-1 rounded-lg transition ${
                  tone === t.value
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-transparent hover:border-[var(--border)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instrucciones adicionales (opcional)..."
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs focus:outline-none focus:border-purple-500/50 transition"
          />

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-accent text-xs py-2 px-4 flex items-center gap-1.5"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PenLine className="w-3.5 h-3.5" />
            )}
            {generating ? "Generando borrador..." : "Generar borrador IA"}
          </button>
        </>
      )}

      {/* Generated draft editor */}
      {status === "generated" && (
        <>
          <div className="text-xs text-[var(--text-secondary)]">
            Asunto: <span className="text-[var(--text-primary)]">{subject}</span>
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm leading-relaxed focus:outline-none focus:border-purple-500/50 transition resize-none"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAction("send")}
              disabled={sending}
              className="btn-accent text-xs py-2 px-4 flex items-center gap-1.5"
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {sending ? "Guardando..." : "Guardar en Gmail"}
            </button>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs py-2 px-3 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-card-hover)] flex items-center gap-1.5 transition"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`}
              />
              Regenerar
            </button>

            <button
              onClick={() => handleAction("discard")}
              className="text-xs py-2 px-3 rounded-xl text-red-400 hover:bg-red-400/10 flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
