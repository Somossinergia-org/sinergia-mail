"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  X,
  Mail,
  FileText,
  Users,
  Receipt,
  Loader2,
  Mic,
  MicOff,
  Camera,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { fmtEur } from "@/lib/format";
import type { Tab } from "./Sidebar";

// Minimal types for Web Speech API (not in default DOM lib)
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SourceType = "emails" | "invoices" | "contacts" | "issued";

interface EmailHit {
  id: number;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  date: string | null;
  category: string | null;
  isRead: boolean;
}
interface InvoiceHit {
  id: number;
  issuerName: string | null;
  invoiceNumber: string | null;
  totalAmount: number | null;
  invoiceDate: string | null;
  category: string | null;
}
interface ContactHit {
  id: number;
  name: string | null;
  email: string;
  company: string | null;
  category: string | null;
  emailCount: number;
  totalInvoiced: string | number | null;
}
interface IssuedHit {
  id: number;
  number: string;
  clientName: string;
  clientNif: string | null;
  total: number;
  issueDate: string;
  status: string;
}

interface SearchResults {
  query: string;
  groups: {
    emails?: EmailHit[];
    invoices?: InvoiceHit[];
    contacts?: ContactHit[];
    issued?: IssuedHit[];
  };
  totals: { emails: number; invoices: number; contacts: number; issued: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
}

// fmtEur imported from @/lib/format

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" }) : "";

const FILTERS: Array<{ id: SourceType | "all"; label: string; icon: React.ReactNode }> = [
  { id: "all", label: "Todo", icon: <Filter className="w-3 h-3" /> },
  { id: "emails", label: "Emails", icon: <Mail className="w-3 h-3" /> },
  { id: "invoices", label: "Facturas", icon: <FileText className="w-3 h-3" /> },
  { id: "contacts", label: "Contactos", icon: <Users className="w-3 h-3" /> },
  { id: "issued", label: "Venta", icon: <Receipt className="w-3 h-3" /> },
];

const PERIODS: Array<{ id: string; label: string; days: number | null }> = [
  { id: "all", label: "Cualquier fecha", days: null },
  { id: "7d", label: "7 días", days: 7 },
  { id: "30d", label: "30 días", days: 30 },
  { id: "90d", label: "90 días", days: 90 },
  { id: "1y", label: "1 año", days: 365 },
];

export default function UniversalSearch({ open, onClose, onNavigate }: Props) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<SourceType | "all">("all");
  const [period, setPeriod] = useState<string>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-focus when opening
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced search
  const search = useCallback(
    async (query: string, sourceType: SourceType | "all", periodKey: string) => {
      if (!query.trim() && sourceType === "all") {
        setResults(null);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (sourceType !== "all") params.set("types", sourceType);
        const periodObj = PERIODS.find((p) => p.id === periodKey);
        if (periodObj?.days) {
          const from = new Date(Date.now() - periodObj.days * 24 * 60 * 60 * 1000);
          params.set("from", from.toISOString().slice(0, 10));
        }
        const res = await fetch(`/api/search?${params}`);
        if (res.ok) setResults(await res.json());
      } catch {
        toast.error("Error de búsqueda");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => search(q, type, period), 250);
    return () => clearTimeout(t);
  }, [q, type, period, open, search]);

  // ─── Voice ─────────────────────────────────────────────────
  const startVoice = () => {
    type WindowWithSR = Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const w = window as WindowWithSR;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voz no soportada en este navegador. Usa Chrome o Safari.");
      return;
    }
    const rec = new SR();
    rec.lang = "es-ES";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setVoiceListening(true);
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript || "";
      setQ(text);
      toast.success("Texto reconocido", { description: text });
    };
    rec.onerror = () => {
      setVoiceListening(false);
      toast.error("Error con el micrófono");
    };
    rec.onend = () => setVoiceListening(false);
    rec.start();
  };

  // ─── Image search ──────────────────────────────────────────
  const onImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageProcessing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "search");
      const res = await fetch("/api/agent/photo-extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      const data = json.data as {
        text: string;
        entities: { issuers?: string[]; invoiceNumbers?: string[]; nifs?: string[] };
      };
      // Build search query: prioritize issuers, then invoice numbers, then NIFs
      const candidates: string[] = [];
      if (data.entities.issuers?.length) candidates.push(...data.entities.issuers);
      else if (data.entities.invoiceNumbers?.length) candidates.push(...data.entities.invoiceNumbers);
      else if (data.entities.nifs?.length) candidates.push(...data.entities.nifs);
      const query = candidates[0] || data.text.slice(0, 80);
      setQ(query);
      toast.success("Imagen analizada", { description: `Buscando: ${query}` });
    } catch (err) {
      toast.error("No se pudo analizar la imagen", {
        description: err instanceof Error ? err.message : "",
      });
    } finally {
      setImageProcessing(false);
    }
  };

  if (!open) return null;

  const handleNav = (tab: Tab) => {
    onNavigate(tab);
    onClose();
  };

  const showGroup = (key: SourceType) =>
    type === "all" || type === key;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-0 lg:pt-[10vh] p-0 lg:p-4"
      onClick={onClose}
    >
      <div
        className="w-full h-full lg:h-auto lg:max-w-3xl bg-[var(--bg-primary)] border border-[var(--border)] lg:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — input + actions */}
        <div className="flex items-center gap-2 px-3 lg:px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca emails, facturas, contactos…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-secondary)] min-h-[44px]"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-sinergia-400" />}
          <button
            onClick={startVoice}
            disabled={voiceListening}
            className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition ${
              voiceListening
                ? "bg-red-500/20 text-red-400 animate-pulse"
                : "hover:bg-[var(--bg-card)] text-[var(--text-secondary)]"
            }`}
            aria-label="Búsqueda por voz"
            title="Búsqueda por voz"
          >
            {voiceListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onImagePick} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={imageProcessing}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)] text-[var(--text-secondary)] transition disabled:opacity-50"
            aria-label="Búsqueda por imagen"
            title="Búsqueda por imagen"
          >
            {imageProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)]"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-3 lg:px-4 py-2 border-b border-[var(--border)] overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setType(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
                type === f.id
                  ? "bg-sinergia-500 text-white"
                  : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
          <span className="text-[var(--border)]">·</span>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
                period === p.id
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 lg:p-3 space-y-4">
          {!q.trim() && type === "all" ? (
            <EmptyHint />
          ) : results ? (
            <>
              {showGroup("emails") && results.groups.emails && results.groups.emails.length > 0 && (
                <Group label="Emails" icon={<Mail className="w-3.5 h-3.5 text-sinergia-400" />}>
                  {results.groups.emails.map((e) => (
                    <ResultRow
                      key={`e${e.id}`}
                      onClick={() => handleNav("emails")}
                      title={e.subject || "(Sin asunto)"}
                      subtitle={`${e.fromName || e.fromEmail || ""} · ${fmtDate(e.date)} · ${e.category || "—"}`}
                      right={!e.isRead ? <span className="text-[10px] text-sinergia-400 font-semibold">NUEVO</span> : null}
                    />
                  ))}
                </Group>
              )}

              {showGroup("invoices") && results.groups.invoices && results.groups.invoices.length > 0 && (
                <Group label="Facturas recibidas" icon={<FileText className="w-3.5 h-3.5 text-yellow-400" />}>
                  {results.groups.invoices.map((i) => (
                    <ResultRow
                      key={`i${i.id}`}
                      onClick={() => handleNav("finanzas")}
                      title={i.issuerName || "—"}
                      subtitle={`${i.invoiceNumber || "Sin nº"} · ${fmtDate(i.invoiceDate)} · ${i.category || "—"}`}
                      right={<span className="text-sm font-mono text-yellow-400">{fmtEur(i.totalAmount)} €</span>}
                    />
                  ))}
                </Group>
              )}

              {showGroup("contacts") && results.groups.contacts && results.groups.contacts.length > 0 && (
                <Group label="Contactos" icon={<Users className="w-3.5 h-3.5 text-lime-400" />}>
                  {results.groups.contacts.map((c) => (
                    <ResultRow
                      key={`c${c.id}`}
                      onClick={() => handleNav("crm")}
                      title={c.name || c.email}
                      subtitle={`${c.email} · ${c.emailCount} emails ${c.company ? "· " + c.company : ""}`}
                      right={
                        c.totalInvoiced && Number(c.totalInvoiced) > 0 ? (
                          <span className="text-xs text-lime-400">{fmtEur(c.totalInvoiced)} €</span>
                        ) : null
                      }
                    />
                  ))}
                </Group>
              )}

              {showGroup("issued") && results.groups.issued && results.groups.issued.length > 0 && (
                <Group label="Facturas emitidas (venta)" icon={<Receipt className="w-3.5 h-3.5 text-teal-400" />}>
                  {results.groups.issued.map((iss) => (
                    <ResultRow
                      key={`iss${iss.id}`}
                      onClick={() => handleNav("finanzas")}
                      title={`${iss.number} — ${iss.clientName}`}
                      subtitle={`${fmtDate(iss.issueDate)} · ${iss.status}`}
                      right={<span className="text-sm font-mono text-teal-400">{fmtEur(iss.total)} €</span>}
                    />
                  ))}
                </Group>
              )}

              {Object.values(results.totals).every((n) => n === 0) && (
                <div className="text-center py-12 text-[var(--text-secondary)]">
                  <Search className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Sin resultados para &ldquo;{q}&rdquo;</p>
                  <p className="text-xs mt-1">Prueba con menos filtros o un término diferente.</p>
                </div>
              )}
            </>
          ) : (
            !loading && <div className="text-xs text-[var(--text-secondary)] text-center py-12">Escribe para buscar…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        {icon} {label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ResultRow({
  onClick,
  title,
  subtitle,
  right,
}: {
  onClick: () => void;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-card)] transition text-left min-h-[44px]"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{title}</div>
        <div className="text-[11px] text-[var(--text-secondary)] truncate">{subtitle}</div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </button>
  );
}

function EmptyHint() {
  return (
    <div className="px-2 py-6 space-y-3">
      <div className="text-xs text-[var(--text-secondary)]">Empieza a escribir, o:</div>
      <div className="flex flex-col gap-2">
        <div className="text-xs flex items-center gap-2">
          <Mic className="w-3.5 h-3.5 text-sinergia-400" /> Pulsa el micro y di lo que buscas
        </div>
        <div className="text-xs flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-teal-400" /> Sube foto de una factura para encontrar registros relacionados
        </div>
        <div className="text-xs flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-purple-400" /> Combina filtros de tipo + período
        </div>
      </div>
    </div>
  );
}
