"use client";

interface Props {
  visible: boolean;
}

/**
 * Barra de progreso superior tipo YouTube cuando se está sincronizando o
 * cargando algo a nivel global. Indeterminate (no necesita %).
 *
 * Render-only — el padre controla visibility. Se anima sola con CSS.
 */
export default function TopProgressBar({ visible }: Props) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed top-0 left-0 right-0 z-[60] h-0.5 overflow-hidden pointer-events-none transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-purple-500/10" />
      <div
        className="absolute top-0 left-0 h-full w-1/3 rounded-r-full"
        style={{
          background: "linear-gradient(90deg, transparent, #a855f7, #6366f1, transparent)",
          boxShadow: "0 0 16px rgba(168, 85, 247, 0.7)",
          animation: visible ? "topbar-slide 1.4s ease-in-out infinite" : "none",
        }}
      />
      <style jsx>{`
        @keyframes topbar-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%);  }
        }
      `}</style>
    </div>
  );
}
