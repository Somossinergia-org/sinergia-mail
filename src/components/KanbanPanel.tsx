"use client";

import { useState, useEffect, useCallback } from "react";
import { Columns3, Mail, ArrowRight, RefreshCw, MailOpen, CheckCircle, Archive } from "lucide-react";

type KanbanColumn = "unread" | "in_progress" | "replied" | "archived";

interface KanbanEmail {
  id: number;
  subject: string;
  from: string;
  category: string | null;
  date: string;
  isRead: boolean;
  draftCreated: boolean;
}

const COLUMNS: Array<{ id: KanbanColumn; label: string; icon: React.ReactNode; color: string }> = [
  { id: "unread", label: "Sin leer", icon: <Mail size={12} />, color: "#06b6d4" },
  { id: "in_progress", label: "En curso", icon: <MailOpen size={12} />, color: "#f59e0b" },
  { id: "replied", label: "Respondido", icon: <CheckCircle size={12} />, color: "#22c55e" },
  { id: "archived", label: "Archivado", icon: <Archive size={12} />, color: "#64748b" },
];

const KANBAN_STORAGE_KEY = "sinergia:kanban-overrides";

/**
 * Load kanban column overrides from localStorage.
 * TODO: Replace with DB-backed persistence via a /api/kanban endpoint
 * and a kanban_mappings table (emailId, userId, column) once the schema supports it.
 */
function loadOverrides(): Record<number, KanbanColumn> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KANBAN_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, KanbanColumn>;
  } catch {
    return {};
  }
}

/**
 * Save kanban column overrides to localStorage.
 * TODO: Replace with POST /api/kanban { emailId, column } backed by DB.
 */
function saveOverrides(overrides: Record<number, KanbanColumn>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function classifyEmail(e: KanbanEmail): KanbanColumn {
  if (e.draftCreated) return "replied";
  if (!e.isRead) return "unread";
  return "in_progress";
}

export default function KanbanPanel() {
  const [emails, setEmails] = useState<KanbanEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<number, KanbanColumn>>({});

  // Load persisted overrides on mount
  useEffect(() => {
    setOverrides(loadOverrides());
  }, []);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails?limit=100");
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const getColumn = (e: KanbanEmail): KanbanColumn => overrides[e.id] || classifyEmail(e);

  const moveEmail = (emailId: number, to: KanbanColumn) => {
    const next = { ...overrides, [emailId]: to };
    setOverrides(next);
    // TODO: Replace localStorage with POST /api/kanban when DB table exists
    saveOverrides(next);
  };

  const columnEmails = (col: KanbanColumn) => emails.filter(e => getColumn(e) === col);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Columns3 size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Kanban Emails</span>
        </div>
        <button onClick={fetchEmails} className="text-cyan-500/60 hover:text-cyan-400 transition">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-48 rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {COLUMNS.map(col => {
            const items = columnEmails(col.id);
            return (
              <div key={col.id} className="rounded-2xl bg-[#050a14] border border-[#1a2d4a] p-3 min-h-[200px]">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a2d4a]">
                  <span style={{ color: col.color }}>{col.icon}</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: col.color }}>{col.label}</span>
                  <span className="text-[10px] font-mono text-slate-600 ml-auto">{items.length}</span>
                </div>
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {items.length === 0 && <p className="text-[10px] text-slate-700 text-center py-4 font-mono">vacío</p>}
                  {items.slice(0, 15).map(email => (
                    <div key={email.id}
                      className="rounded-lg bg-[#0a1628] border border-[#1a2d4a]/60 p-2.5 hover:border-cyan-500/20 transition-colors group">
                      <p className="text-[11px] text-slate-300 truncate font-medium">{email.subject || "(sin asunto)"}</p>
                      <p className="text-[9px] text-slate-600 truncate mt-0.5">{email.from?.split("<")[0]?.trim()}</p>
                      {email.category && (
                        <span className="inline-block text-[8px] px-1.5 py-0.5 rounded mt-1 bg-cyan-500/10 text-cyan-400">{email.category}</span>
                      )}
                      {/* Move arrows */}
                      <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {COLUMNS.filter(c => c.id !== col.id).map(target => (
                          <button key={target.id} onClick={() => moveEmail(email.id, target.id)}
                            title={`Mover a ${target.label}`}
                            className="text-[8px] px-1.5 py-0.5 rounded bg-[#050a14] border border-[#1a2d4a] hover:border-cyan-500/30 transition" style={{ color: target.color }}>
                            {target.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
