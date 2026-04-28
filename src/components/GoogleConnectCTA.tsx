"use client";

import { useState, useEffect } from "react";
import { Link2, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  /** Servicio que requiere conexión: "calendar" | "drive" | "tasks" | "gmail" | "todos" */
  service?: "calendar" | "drive" | "tasks" | "gmail" | "todos";
  /** Mensaje override. Si no, se autogenera por servicio. */
  message?: string;
  /** Llamado tras conectar con éxito (cuando el usuario regresa a la app) */
  onConnected?: () => void;
}

const SERVICE_LABEL: Record<NonNullable<Props["service"]>, string> = {
  calendar: "Calendario",
  drive: "Drive",
  tasks: "Tareas (Google)",
  gmail: "Gmail",
  todos: "Google (Calendar, Drive, Tasks, Gmail)",
};

const SERVICE_ICON: Record<NonNullable<Props["service"]>, string> = {
  calendar: "📅",
  drive: "💾",
  tasks: "✅",
  gmail: "📧",
  todos: "🔗",
};

/**
 * GoogleConnectCTA — empty state visible cuando un panel necesita Google
 * tokens pero el usuario NO tiene cuenta conectada (`email_accounts: []`).
 *
 * Reemplaza el feo "No Google account connected for this user" con un
 * onboarding claro: explica qué falta y un botón directo al OAuth.
 *
 * El flujo:
 *   1. User pulsa "Conectar Google"
 *   2. Redirige a /api/email-accounts/connect (genera URL OAuth)
 *   3. Google pide permisos (scopes ya configurados)
 *   4. Callback /api/email-accounts/oauth-callback guarda tokens
 *   5. Vuelve a /dashboard?integration_success=email_account
 *   6. onConnected() se llama si existe (recarga panel)
 */
export default function GoogleConnectCTA({ service = "todos", message, onConnected }: Props) {
  const [redirecting, setRedirecting] = useState(false);

  // Detectar regreso de OAuth: query param integration_success=email_account
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("integration_success") === "email_account") {
      onConnected?.();
      // Limpiar query string
      const url = new URL(window.location.href);
      url.searchParams.delete("integration_success");
      url.searchParams.delete("scopes_missing");
      window.history.replaceState({}, "", url.toString());
    }
  }, [onConnected]);

  const handleConnect = () => {
    setRedirecting(true);
    window.location.href = "/api/email-accounts/connect";
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-cyan-500/5 to-purple-500/5 border border-cyan-500/20 p-6 text-center">
      <div className="text-4xl mb-3">{SERVICE_ICON[service]}</div>
      <h3 className="text-base font-bold text-white mb-1.5">
        Conecta tu cuenta Google
      </h3>
      <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto leading-relaxed">
        {message ?? `Para usar ${SERVICE_LABEL[service]} necesitamos permiso para acceder a tu cuenta Google. Es seguro: los tokens se guardan cifrados y los puedes revocar cuando quieras.`}
      </p>
      <button
        onClick={handleConnect}
        disabled={redirecting}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-sm font-bold hover:opacity-90 transition active:scale-95 disabled:opacity-50 min-h-[44px]"
        style={{ boxShadow: "0 4px 16px rgba(6,182,212,0.3)" }}
      >
        {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {redirecting ? "Redirigiendo a Google..." : "Conectar cuenta Google"}
      </button>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-md mx-auto text-[10px] text-slate-500">
        <div className="flex items-center gap-1 justify-center"><CheckCircle2 className="w-3 h-3 text-green-400" /> Gmail</div>
        <div className="flex items-center gap-1 justify-center"><CheckCircle2 className="w-3 h-3 text-green-400" /> Calendar</div>
        <div className="flex items-center gap-1 justify-center"><CheckCircle2 className="w-3 h-3 text-green-400" /> Drive</div>
        <div className="flex items-center gap-1 justify-center"><CheckCircle2 className="w-3 h-3 text-green-400" /> Tasks</div>
      </div>
    </div>
  );
}
