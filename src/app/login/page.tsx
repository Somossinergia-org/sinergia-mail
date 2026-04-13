"use client";

import { signIn } from "next-auth/react";
import { Mail, Shield, Zap, BarChart3 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sinergia-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="glass-card p-8 md:p-12 max-w-md w-full relative animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sinergia-600/20 mb-4">
            <Mail className="w-8 h-8 text-sinergia-400" />
          </div>
          <h1 className="text-2xl font-bold mb-1">Sinergia Mail</h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Dashboard inteligente de email para Somos Sinergia
          </p>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          <Feature
            icon={<Zap className="w-4 h-4 text-yellow-400" />}
            text="Categorización automática con IA"
          />
          <Feature
            icon={<BarChart3 className="w-4 h-4 text-green-400" />}
            text="Gestión de facturas y control de costes"
          />
          <Feature
            icon={<Shield className="w-4 h-4 text-blue-400" />}
            text="Respuestas automáticas inteligentes"
          />
        </div>

        {/* Sign in button */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full flex items-center justify-center gap-3 btn-accent py-3 text-base"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Iniciar sesión con Google
        </button>

        <p className="text-center text-xs text-[var(--text-secondary)] mt-4">
          Conecta tu cuenta de Gmail para empezar
        </p>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--bg-card)] flex items-center justify-center">
        {icon}
      </div>
      {text}
    </div>
  );
}
