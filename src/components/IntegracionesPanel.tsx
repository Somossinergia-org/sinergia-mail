"use client";

import { useState, useEffect, useCallback } from "react";
import { Key, Copy, Trash2, Loader2, Plus, Check, AlertTriangle, BookOpen, Plug, Mail, ToggleLeft, ToggleRight, Star } from "lucide-react";
import { toast } from "sonner";

interface McpToken {
  id: number;
  name: string;
  prefix: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
}

interface EmailAccount {
  id: number;
  provider: string;
  email: string;
  displayName: string | null;
  isPrimary: boolean;
  enabled: boolean;
  lastSyncAt: string | null;
  totalEmails: number;
}

export default function IntegracionesPanel() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("Claude Desktop");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, aRes] = await Promise.all([
        fetch("/api/mcp-tokens"),
        fetch("/api/email-accounts"),
      ]);
      const tData = await tRes.json();
      const aData = await aRes.json();
      setTokens(tData.tokens || []);
      setAccounts(aData.accounts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Show success/error toast from OAuth callback redirect
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("integration_success") === "email_account") {
        toast.success("Cuenta de email conectada");
        window.history.replaceState({}, "", window.location.pathname);
      } else if (params.get("integration_error")) {
        toast.error("Error conectando cuenta", { description: params.get("integration_error")! });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [load]);

  const toggleAccount = async (id: number, enabled: boolean) => {
    await fetch("/api/email-accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    await load();
  };

  const disconnectAccount = async (id: number, email: string) => {
    if (!confirm(`¿Desconectar la cuenta ${email}? Los emails ya sincronizados se conservarán.`)) return;
    const res = await fetch(`/api/email-accounts?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error || "No se pudo desconectar");
      return;
    }
    toast.success(`${email} desconectada`);
    await load();
  };

  const connectNew = () => {
    window.location.href = "/api/email-accounts/connect";
  };

  const create = async () => {
    setCreating(true);
    try {
      const r = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName || "Untitled" }),
      });
      const d = await r.json();
      if (d.token) setNewToken(d.token);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: number) => {
    if (!confirm("¿Revocar este token? No podrá volver a usarse.")) return;
    await fetch(`/api/mcp-tokens?id=${id}`, { method: "DELETE" });
    await load();
  };

  const copyToken = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mcpConfigJson = newToken
    ? JSON.stringify(
        {
          mcpServers: {
            sinergia: {
              url: "https://sinergia-mail.vercel.app/api/mcp",
              headers: { Authorization: `Bearer ${newToken}` },
            },
          },
        },
        null,
        2
      )
    : "";

  return (
    <div className="space-y-6">
      {/* ═══ EMAIL ACCOUNTS ═══ */}
      <div className="glass-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sinergia-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Mail className="w-6 h-6 text-sinergia-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base">Cuentas de Gmail</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Conecta varias cuentas de correo y Sinergia AI las gestiona todas. Tu cuenta principal está marcada con ⭐.
            </p>
          </div>
          <button
            onClick={connectNew}
            className="px-4 py-2.5 rounded-xl bg-sinergia-500/10 text-sinergia-400 hover:bg-sinergia-500/20 transition flex items-center gap-2 text-sm font-medium min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Añadir cuenta
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6 mt-4">
            <Loader2 className="w-5 h-5 animate-spin text-sinergia-400" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] mt-4 text-center py-4">
            No hay cuentas conectadas. Pulsa &ldquo;Añadir cuenta&rdquo; para empezar.
          </p>
        ) : (
          <div className="space-y-2 mt-5">
            {accounts.map((a) => (
              <div
                key={a.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  a.enabled
                    ? "bg-[var(--bg-card)] border-[var(--border)]"
                    : "bg-[var(--bg-card)]/40 border-[var(--border)] opacity-60"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-sinergia-500/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-sinergia-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {a.displayName || a.email}
                    </span>
                    {a.isPrimary && (
                      <span title="Cuenta principal" className="text-amber-400">
                        <Star className="w-3.5 h-3.5 inline" />
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] truncate">
                    {a.email} · {a.totalEmails} emails ·{" "}
                    {a.lastSyncAt
                      ? "última sync " +
                        new Date(a.lastSyncAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "sin sincronizar"}
                  </div>
                </div>
                <button
                  onClick={() => toggleAccount(a.id, a.enabled)}
                  aria-label={a.enabled ? "Deshabilitar" : "Habilitar"}
                  title={a.enabled ? "Deshabilitar" : "Habilitar"}
                  className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition"
                >
                  {a.enabled ? (
                    <ToggleRight className="w-5 h-5 text-green-400" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-[var(--text-secondary)]" />
                  )}
                </button>
                {!a.isPrimary && (
                  <button
                    onClick={() => disconnectAccount(a.id, a.email)}
                    aria-label="Desconectar"
                    title="Desconectar"
                    className="p-2 rounded-lg hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ MCP HEADER ═══ */}
      <div className="glass-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-sinergia-500/20 flex items-center justify-center flex-shrink-0">
            <Plug className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base">MCP — Model Context Protocol</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Expón Sinergia Mail como servidor MCP. Desde Claude Desktop podrás preguntar
              cosas como <em>&ldquo;qué proveedores me han vencido&rdquo;</em> o
              <em> &ldquo;dame el IVA del Q2&rdquo;</em> y Claude consultará tus datos en tiempo real.
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs">
              <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                <BookOpen className="w-3 h-3" /> 6 tools disponibles
              </div>
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                Aprender sobre MCP →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Create token */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-purple-400" />
          Generar nuevo token
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Etiqueta (ej. 'Claude Desktop MacBook')"
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={create}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            {creating ? "Generando..." : "Crear token"}
          </button>
        </div>
      </div>

      {/* New token revealed */}
      {newToken && (
        <div className="glass-card p-5 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Guarda este token AHORA</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                No podrás volver a verlo. Cópialo a tu gestor de contraseñas o directamente al
                archivo <code className="text-purple-400">claude_desktop_config.json</code>.
              </p>
            </div>
          </div>
          <div className="bg-[var(--bg-card)] rounded-lg p-3 font-mono text-xs break-all relative group">
            {newToken}
            <button
              onClick={copyToken}
              className="absolute top-2 right-2 p-1.5 rounded bg-purple-500/20 hover:bg-purple-500/40 transition opacity-0 group-hover:opacity-100"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
            </button>
          </div>

          <div className="mt-4">
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              Configuración para <code className="text-purple-400">claude_desktop_config.json</code>:
            </p>
            <pre className="bg-[var(--bg-card)] rounded-lg p-3 text-[11px] overflow-x-auto font-mono text-[var(--text-secondary)]">
              {mcpConfigJson}
            </pre>
          </div>

          <button
            onClick={() => setNewToken(null)}
            className="mt-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >
            Ya lo he copiado — ocultar
          </button>
        </div>
      )}

      {/* Active tokens */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-4">Tokens activos</h3>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] py-4 text-center">
            No tienes tokens. Crea uno arriba para conectar Claude Desktop.
          </p>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  t.revoked
                    ? "bg-[var(--bg-card)]/40 border-[var(--border)] opacity-50"
                    : "bg-[var(--bg-card)] border-[var(--border)]"
                }`}
              >
                <Key className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{t.name}</span>
                    {t.revoked && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                        revocado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)] mt-0.5 font-mono">
                    <span>{t.prefix}••••</span>
                    {t.lastUsedAt && (
                      <span>
                        último uso:{" "}
                        {new Date(t.lastUsedAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </span>
                    )}
                    {!t.lastUsedAt && <span>nunca usado</span>}
                  </div>
                </div>
                {!t.revoked && (
                  <button
                    onClick={() => revoke(t.id)}
                    className="p-2 rounded hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available tools */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3">Tools expuestos al agente MCP</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {[
            { n: "get_stats", d: "Resumen global (emails, facturas, gasto, IVA)" },
            { n: "query_emails", d: "Buscar emails por categoría/texto" },
            { n: "query_invoices", d: "Buscar facturas por emisor/fechas/categoría" },
            { n: "get_overdue_invoices", d: "Facturas vencidas con días de retraso" },
            { n: "get_iva_quarterly", d: "Desglose IVA trimestral (Modelo 303)" },
            { n: "get_duplicate_invoices", d: "Grupos de facturas duplicadas" },
          ].map((t) => (
            <div
              key={t.n}
              className="flex items-start gap-2 p-2 rounded bg-[var(--bg-card)]"
            >
              <code className="text-purple-400 font-mono text-[10px] pt-0.5">{t.n}</code>
              <span className="text-[var(--text-secondary)] flex-1 text-[11px]">{t.d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
