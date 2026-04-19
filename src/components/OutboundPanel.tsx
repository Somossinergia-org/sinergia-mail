"use client";

import { useState, useEffect, useCallback } from "react";
import { Send, MessageCircle, Bell, RefreshCw, XCircle, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface OutboundMsg {
  id: number;
  channel: string;
  destination: string;
  subject: string | null;
  body: string;
  status: string;
  event_type: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
}

const channelIcon: Record<string, typeof Send> = { EMAIL: Send, WHATSAPP: MessageCircle, PUSH: Bell };
const statusColors: Record<string, string> = {
  QUEUED: "text-blue-400 bg-blue-400/10",
  PROCESSING: "text-amber-400 bg-amber-400/10",
  SENT: "text-emerald-400 bg-emerald-400/10",
  FAILED: "text-red-400 bg-red-400/10",
  CANCELLED: "text-[var(--text-secondary)] bg-[var(--bg-card)]",
};

export default function OutboundPanel() {
  const [messages, setMessages] = useState<OutboundMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ channel: "EMAIL", destination: "", subject: "", body: "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/outbound");
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!form.destination || !form.body) { toast.error("Destino y mensaje requeridos"); return; }
    setSending(true);
    try {
      await fetch("/api/outbound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      toast.success(`Mensaje encolado vía ${form.channel}`);
      setForm({ ...form, destination: "", subject: "", body: "" });
      load();
    } catch { toast.error("Error al enviar"); } finally { setSending(false); }
  };

  const retry = async (id: number) => {
    await fetch("/api/outbound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry", id }) });
    toast.success("Reintentando...");
    load();
  };

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-cyan-500/15 flex items-center justify-center">
          <Send className="w-4.5 h-4.5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Centro Omnicanal</h3>
          <p className="text-[11px] text-[var(--text-secondary)]">Email · WhatsApp · Push</p>
        </div>
      </div>

      {/* Quick Send */}
      <div className="px-5 py-3 border-b border-[var(--border)] space-y-2">
        <div className="flex gap-2">
          {(["EMAIL", "WHATSAPP", "PUSH"] as const).map(ch => {
            const Icon = channelIcon[ch] || Send;
            return (
              <button key={ch} onClick={() => setForm({ ...form, channel: ch })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  form.channel === ch ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-transparent hover:border-[var(--border)]"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {ch}
              </button>
            );
          })}
        </div>
        <input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}
          placeholder={form.channel === "WHATSAPP" ? "+34 600 000 000" : form.channel === "PUSH" ? "Token de dispositivo" : "email@ejemplo.com"}
          className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] focus:border-cyan-500/50 focus:outline-none" />
        {form.channel === "EMAIL" && (
          <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
            placeholder="Asunto" className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] focus:border-cyan-500/50 focus:outline-none" />
        )}
        <div className="flex gap-2">
          <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
            placeholder="Mensaje..." rows={2}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] focus:border-cyan-500/50 focus:outline-none resize-none" />
          <button onClick={send} disabled={sending || !form.destination || !form.body}
            className="self-end btn-accent px-4 py-2 rounded-lg text-sm disabled:opacity-30">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message History */}
      <div className="max-h-[300px] overflow-y-auto divide-y divide-[var(--border)]">
        {loading && <div className="py-6 text-center text-sm text-[var(--text-secondary)]">Cargando...</div>}
        {!loading && messages.length === 0 && (
          <div className="py-8 text-center">
            <Send className="w-8 h-8 text-cyan-400/20 mx-auto mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">Sin mensajes enviados aún</p>
          </div>
        )}
        {messages.slice(0, 20).map(msg => {
          const Icon = channelIcon[msg.channel] || Send;
          return (
            <div key={msg.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-card)]/50 transition">
              <Icon className={`w-4 h-4 flex-shrink-0 ${msg.channel === "WHATSAPP" ? "text-green-400" : msg.channel === "PUSH" ? "text-amber-400" : "text-blue-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{msg.destination}</div>
                <div className="text-[10px] text-[var(--text-secondary)] truncate">{msg.subject || msg.body?.substring(0, 60)}</div>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[msg.status] || ""}`}>
                {msg.status}
              </span>
              {msg.status === "FAILED" && (
                <button onClick={() => retry(msg.id)} className="text-amber-400 hover:text-amber-300" title="Reintentar">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
