"use client";

import { useState } from "react";
import {
  Mail,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import { sanitizeEmailHtml } from "@/lib/sanitize";

interface Email {
  id: number;
  gmailId: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  snippet: string | null;
  body: string | null;
  date: string | null;
  category: string | null;
  priority: string | null;
  hasAttachments: boolean | null;
  draftCreated: boolean | null;
}

interface EmailListProps {
  emails: Email[];
  onCreateDraft: (emailId: number) => Promise<void>;
}

const CATEGORY_COLORS: Record<string, string> = {
  FACTURA: "badge-factura",
  CLIENTE: "badge-cliente",
  PROVEEDOR: "badge-proveedor",
  MARKETING: "badge-marketing",
  NOTIFICACION: "badge-notificacion",
  LEGAL: "badge-legal",
  SPAM: "badge-spam",
  RRHH: "bg-indigo-500/15 text-indigo-400",
  PERSONAL: "bg-teal-500/15 text-teal-400",
  OTRO: "bg-gray-500/15 text-gray-400",
};

export default function EmailList({ emails, onCreateDraft }: EmailListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null);

  const handleDraft = async (emailId: number) => {
    setDrafting(emailId);
    try {
      await onCreateDraft(emailId);
    } finally {
      setDrafting(null);
    }
  };

  return (
    <div className="stagger-children space-y-2">
      {emails.map((email) => (
        <div
          key={email.id}
          className={`glass-card p-4 priority-${(email.priority || "media").toLowerCase()} ${
            email.priority === "ALTA" ? "priority-pulse-alta" : ""
          }`}
        >
          {/* Header row */}
          <div
            className="flex items-start gap-3 cursor-pointer"
            onClick={() =>
              setExpandedId(expandedId === email.id ? null : email.id)
            }
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-sm truncate">
                  {email.fromName || email.fromEmail || "Desconocido"}
                </span>
                {email.category && (
                  <span
                    className={`badge ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.OTRO}`}
                  >
                    {email.category}
                  </span>
                )}
                {email.hasAttachments && (
                  <FileText className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                )}
                {email.draftCreated && (
                  <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                )}
              </div>
              <div className="text-sm font-medium truncate">
                {email.subject || "(sin asunto)"}
              </div>
              <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                {email.snippet}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-[var(--text-secondary)]">
                {email.date
                  ? new Date(email.date).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                    })
                  : ""}
              </span>
              {expandedId === email.id ? (
                <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
              )}
            </div>
          </div>

          {/* Expanded body */}
          {expandedId === email.id && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--text-secondary)] mb-2">
                De: {email.fromName} &lt;{email.fromEmail}&gt;
              </div>
              {email.body && /<[a-z][\s\S]*>/i.test(email.body) ? (
                <div
                  className="text-sm max-h-64 overflow-y-auto leading-relaxed email-html-body"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(email.body.slice(0, 8000)),
                  }}
                />
              ) : (
                <div className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                  {email.body?.slice(0, 2000) || email.snippet || (
                    <span className="italic text-[var(--text-secondary)]">(sin contenido)</span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDraft(email.id);
                  }}
                  disabled={drafting === email.id || !!email.draftCreated}
                  className="btn-accent text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {drafting === email.id
                    ? "Generando..."
                    : email.draftCreated
                      ? "Borrador creado"
                      : "Auto-respuesta"}
                </button>
                <a
                  href={`https://mail.google.com/mail/u/0/#inbox/${email.gmailId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs py-1.5 px-3 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-card-hover)] flex items-center gap-1.5 transition"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Abrir en Gmail
                </a>
              </div>
            </div>
          )}
        </div>
      ))}

      {emails.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay emails para mostrar</p>
        </div>
      )}
    </div>
  );
}
