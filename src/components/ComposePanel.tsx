"use client";

import { useState } from "react";
import { Send, Sparkles, Loader2, Paperclip } from "lucide-react";

export default function ComposePanel() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sent, setSent] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  const handleSend = async () => {
    if (!to || !subject) return;
    setSending(true);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body, send: true }),
      });
      if (res.ok) { setSent(true); setTo(""); setSubject(""); setBody(""); setTimeout(() => setSent(false), 3000); }
    } catch { /* */ }
    finally { setSending(false); }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Redacta un email profesional en español para: ${aiPrompt}. Contexto: soy David Miquel Jordá, gerente de Somos Sinergia en Orihuela. Devuelve SOLO el cuerpo del email, sin asunto ni encabezado.` }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.response || data.message || "";
        setBody(text);
      }
    } catch { /* */ }
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Send size={14} className="text-cyan-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Redactar Email con IA</span>
      </div>

      {/* AI assist */}
      <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/20 p-4">
        <p className="text-[10px] font-bold text-cyan-400 mb-2 flex items-center gap-1"><Sparkles size={11} /> Asistente IA</p>
        <div className="flex gap-2">
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
            placeholder="Describe lo que quieres escribir... ej: 'solicitar presupuesto de energía solar'"
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50"
            onKeyDown={e => e.key === "Enter" && handleAiGenerate()} />
          <button onClick={handleAiGenerate} disabled={generating || !aiPrompt.trim()}
            className="btn-accent text-xs !py-2 !px-4 disabled:opacity-50 flex items-center gap-1">
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Generar
          </button>
        </div>
      </div>

      {/* Compose form */}
      <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4 space-y-3">
        <input value={to} onChange={e => setTo(e.target.value)}
          placeholder="Para: email@ejemplo.com" className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50" />
        <input value={subject} onChange={e => setSubject(e.target.value)}
          placeholder="Asunto" className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50" />
        <textarea value={body} onChange={e => setBody(e.target.value)}
          placeholder="Escribe el cuerpo del email..." rows={10}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50 resize-none leading-relaxed" />
        <div className="flex items-center justify-between">
          <button className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-slate-400 hover:text-white transition">
            <Paperclip size={10} /> Adjuntar
          </button>
          <div className="flex items-center gap-2">
            {sent && <span className="text-[10px] text-emerald-400 animate-fade-in">¡Enviado!</span>}
            <button onClick={handleSend} disabled={sending || !to || !subject}
              className="btn-accent text-xs !py-2 !px-6 disabled:opacity-50 flex items-center gap-1.5">
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
