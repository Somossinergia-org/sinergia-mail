"use client";

import { signIn } from "next-auth/react";
import { Mail, Shield, Zap, BarChart3, Sparkles } from "lucide-react";
import { useEffect } from "react";
import ParticleRain from "@/components/ParticleRain";
import { uiSound } from "@/lib/ui-sound";

export default function LoginPage() {
  // Leve "boot" sound on first interaction
  useEffect(() => {
    const kick = () => {
      uiSound.play("open");
      window.removeEventListener("pointerdown", kick);
    };
    window.addEventListener("pointerdown", kick, { once: true });
    return () => window.removeEventListener("pointerdown", kick);
  }, []);

  const handleSignIn = () => {
    uiSound.play("send");
    signIn("google", { callbackUrl: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Canvas con lluvia de partículas violeta */}
      <ParticleRain density={0.45} />

      {/* Vignette radial para dramatismo */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(10,10,26,0.75) 100%)",
          zIndex: 1,
        }}
      />

      {/* Beams de luz animados */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
        <div
          className="absolute -top-40 left-1/4 w-[60vw] h-[60vw] max-w-[900px] max-h-[900px] rounded-full blur-3xl animate-pulse"
          style={{
            background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%)",
            animationDuration: "6s",
          }}
        />
        <div
          className="absolute -bottom-40 right-1/4 w-[55vw] h-[55vw] max-w-[800px] max-h-[800px] rounded-full blur-3xl animate-pulse"
          style={{
            background: "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 65%)",
            animationDuration: "8s",
            animationDelay: "1s",
          }}
        />
        <div
          className="absolute top-1/3 right-0 w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] rounded-full blur-3xl animate-pulse"
          style={{
            background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 65%)",
            animationDuration: "10s",
            animationDelay: "2s",
          }}
        />
      </div>

      {/* Card principal */}
      <div
        className="relative z-10 ai-neon-frame is-active p-8 md:p-12 max-w-md w-full animate-fade-in"
        style={{ background: "rgba(10, 10, 26, 0.72)", backdropFilter: "blur(24px)" }}
      >
        {/* Logo con ring pulsante */}
        <div className="text-center mb-8">
          <div
            className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.25))",
              border: "1px solid rgba(168,85,247,0.4)",
              boxShadow:
                "0 0 40px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <span
              className="absolute inset-0 rounded-2xl bg-purple-500/30 animate-ping"
              style={{ animationDuration: "2s", opacity: 0.25 }}
              aria-hidden
            />
            <Mail className="w-10 h-10 text-sinergia-200 relative z-10 icon-glow-violet" />
          </div>
          <h1 className="text-3xl font-black text-shimmer mb-1 tracking-tight">
            Sinergia Mail
          </h1>
          <p className="text-[var(--text-secondary)] text-sm flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3 text-purple-400" />
            Dashboard inteligente · Somos Sinergia
          </p>
        </div>

        {/* Features con glow hover */}
        <div className="space-y-3 mb-8">
          <Feature
            icon={<Zap className="w-4 h-4 text-yellow-300 icon-glow-violet" />}
            text="Categorización automática con IA"
            glowColor="rgba(251,191,36,0.2)"
          />
          <Feature
            icon={<BarChart3 className="w-4 h-4 text-emerald-300 icon-glow-violet" />}
            text="Gestión de facturas y control de costes"
            glowColor="rgba(52,211,153,0.2)"
          />
          <Feature
            icon={<Shield className="w-4 h-4 text-blue-300 icon-glow-accent" />}
            text="Respuestas automáticas inteligentes"
            glowColor="rgba(96,165,250,0.2)"
          />
        </div>

        {/* Botón Google con efectos */}
        <button
          onClick={handleSignIn}
          className="group relative w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300"
          style={{
            background:
              "linear-gradient(135deg, var(--accent), #7c3aed 50%, #a855f7)",
            backgroundSize: "200% 200%",
            boxShadow: "0 0 32px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}
        >
          <span
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background:
                "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
              animation: "sweep 1.5s ease-in-out infinite",
            }}
            aria-hidden
          />
          <svg className="w-5 h-5 relative z-10" viewBox="0 0 24 24">
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
          <span className="relative z-10">Iniciar sesión con Google</span>
        </button>

        <p className="text-center text-xs text-[var(--text-secondary)] mt-5 flex items-center justify-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
          Conecta Gmail para empezar · conexión cifrada
        </p>
      </div>

      <style jsx>{`
        @keyframes sweep {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

function Feature({
  icon,
  text,
  glowColor,
}: {
  icon: React.ReactNode;
  text: string;
  glowColor: string;
}) {
  return (
    <div
      className="group flex items-center gap-3 text-sm text-[var(--text-secondary)] p-2 rounded-lg transition-all duration-300 hover:text-[var(--text-primary)] hover:bg-white/5"
      style={{ cursor: "default" }}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 border border-[var(--border)]"
        style={{
          background: "rgba(255,255,255,0.04)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 0 16px ${glowColor}`;
          e.currentTarget.style.transform = "scale(1.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {icon}
      </div>
      {text}
    </div>
  );
}
