"use client";

import { useState } from "react";
import { Send, Sparkles, Loader2, Paperclip, FileText, ChevronDown } from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   Templates rápidas inline. Antes vivían sólo en Campañas > Templates,
   forzando al usuario a navegar para usarlas. Ahora se acceden desde el
   propio panel de redactar (1 tap).
   ────────────────────────────────────────────────────────────────────────── */

interface QuickTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  { id: "acuse", name: "Acuse de recibo", category: "General",
    subject: "Re: tu mensaje",
    body: "Hola,\n\nAcuso recibo de tu email. Lo revisaré y te responderé a la mayor brevedad.\n\nUn saludo,\nDavid Miquel Jordá\nSomos Sinergia" },
  { id: "presupuesto", name: "Solicitud presupuesto", category: "Comercial",
    subject: "Solicitud de presupuesto - Somos Sinergia",
    body: "Hola,\n\nNos ponemos en contacto para solicitar presupuesto por los siguientes servicios/productos:\n\n[detalles]\n\nQuedamos a la espera de su respuesta.\n\nUn saludo,\nDavid Miquel Jordá\nSomos Sinergia" },
  { id: "seguimiento", name: "Seguimiento", category: "Comercial",
    subject: "Seguimiento de nuestra conversación",
    body: "Hola,\n\nLe escribo para hacer seguimiento de nuestra conversación anterior.\n\n¿Ha tenido oportunidad de revisarlo?\n\nQuedamos a su disposición.\n\nUn saludo,\nDavid Miquel Jordá\nSomos Sinergia" },
  { id: "agradecimiento", name: "Agradecimiento", category: "General",
    subject: "Gracias",
    body: "Hola,\n\nMuchas gracias por su pronta respuesta y colaboración.\n\nUn saludo cordial,\nDavid Miquel Jordá\nSomos Sinergia" },
  { id: "pago", name: "Confirmación de pago", category: "Finanzas",
    subject: "Confirmación de pago - [importe]",
    body: "Hola,\n\nLe confirmamos que hemos realizado el pago por importe de [importe] correspondiente a la factura [número].\n\nAdjuntamos justificante.\n\nUn saludo,\nDavid Miquel Jordá\nSomos Sinergia" },
  { id: "reclamacion", name: "Reclamación", category: "Legal",
    subject: "Reclamación - [referencia]",
    body: "Hola,\n\nNos ponemos en contacto para presentar una reclamación respecto a:\n\n[descripción]\n\nReferencia: [referencia]\nFecha: [fecha]\n\nSolicitamos una resolución a la mayor brevedad.\n\nUn saludo,\nDavid Miquel Jordá\nSomos Sinergia" },
  { id: "bienvenida", name: "Bienvenida cliente", category: "Onboarding",
    subject: "Bienvenido/a a Somos Sinergia",
    body: "Hola,\n\nEs un placer darle la bienvenida como nuevo cliente de Somos Sinergia.\n\nA partir de ahora contará con gestión integral, asistente IA y panel de facturas y analíticas.\n\nNo dude en contactarnos para cualquier consulta.\n\nUn saludo,\nDavid Miquel Jordá\nSomos Sinergia" },
];

const CATEGORY_COLORS: Record<string, string> = {
  General: "text-slate-300 bg-slate-500/10 border-slate-500/30",
  Comercial: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  Finanzas: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  Legal: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  Onboarding: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
};

export default function ComposePanel() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sent, setSent] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const applyTemplate = (t: QuickTemplate) => {
    setSubject(t.subject);
    setBody(t.body);
    setShowTemplates(false);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch { /* noop */ }
    }
  };

  const handleSend = async () => {
    if (!to || !subject) return;
    setSending(true);
    try {
      const res = await fetch("/api/send-email", {
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
      // Saltamos la recepción: el agente correcto para redacción de
      // emails es marketing-automation (tiene brand-voice.ts).
      // Antes pasaba por recepción → 2 LLM calls. Ahora 1 sola.
      const res = await fetch("/api/agent-gpt5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Redacta un email profesional en español para: ${aiPrompt}. Contexto: soy David Miquel Jordá, gerente de Somos Sinergia en Orihuela. Devuelve SOLO el cuerpo del email, sin asunto ni encabezado.` }],
          agentOverride: "marketing-automation",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.reply || data.response || data.message || "";
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

      {/* Quick templates dropdown — acceso a 1 tap, sin salir del compose */}
      <div className="relative">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] hover:border-cyan-500/40 transition text-sm"
          aria-expanded={showTemplates}
        >
          <span className="flex items-center gap-2 text-slate-300">
            <FileText size={14} className="text-cyan-400" />
            Usar plantilla
          </span>
          <ChevronDown size={14} className={`text-slate-500 transition-transform ${showTemplates ? "rotate-180" : ""}`} />
        </button>
        {showTemplates && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl bg-[#050a14] border border-cyan-500/30 shadow-2xl"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(6,182,212,0.15)" }}>
            {QUICK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="w-full text-left px-3 py-2.5 hover:bg-[#0a1628] transition border-b border-[#1a2d4a] last:border-b-0 active:bg-cyan-500/10"
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-white truncate">{t.name}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.General}`}>
                    {t.category}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">{t.subject}</p>
              </button>
            ))}
          </div>
        )}
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
