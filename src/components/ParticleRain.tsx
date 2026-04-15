"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vy: number;
  len: number;
  alpha: number;
  hue: number;
}

interface Props {
  /** Density: número de partículas por 10000px² de viewport. Default 0.35 */
  density?: number;
  /** Respeta prefers-reduced-motion automáticamente */
  className?: string;
}

/**
 * Lluvia digital tipo "Matrix" pero en violeta/índigo, con estelas difusas
 * y un halo ambiental que responde a la posición del cursor.
 *
 * Canvas full-screen con devicePixelRatio. ~60fps, GPU-friendly gracias a
 * globalCompositeOperation + fade progresivo en lugar de clearRect.
 */
export default function ParticleRain({ density = 0.35, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Respect reduced motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      ctx.fillStyle = "rgba(168,85,247,0.04)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    const mouse = { x: -1000, y: -1000 };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      const count = Math.round((width * height) / 10000 * density);
      particles = Array.from({ length: count }, () => makeParticle(width, height));
    };

    const onMouse = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    resize();

    const draw = () => {
      // Trail fade instead of clear → estelas tipo Matrix
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(10, 10, 26, 0.18)";
      ctx.fillRect(0, 0, width, height);

      // Halo ambiental suave siguiendo el cursor
      if (mouse.x > -500) {
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 260);
        g.addColorStop(0, "rgba(168, 85, 247, 0.10)");
        g.addColorStop(1, "rgba(168, 85, 247, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      // Dibuja partículas con modo lighter → glow aditivo
      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        const tail = ctx.createLinearGradient(p.x, p.y - p.len, p.x, p.y);
        tail.addColorStop(0, `hsla(${p.hue}, 85%, 65%, 0)`);
        tail.addColorStop(1, `hsla(${p.hue}, 85%, 70%, ${p.alpha})`);
        ctx.strokeStyle = tail;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - p.len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        // Head dot
        ctx.fillStyle = `hsla(${p.hue}, 90%, 80%, ${Math.min(1, p.alpha * 1.4)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();

        p.y += p.vy;
        // Small horizontal drift for organic feel
        p.x += Math.sin((p.y + p.hue) * 0.005) * 0.15;

        if (p.y - p.len > height) {
          Object.assign(p, makeParticle(width, height, true));
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`fixed inset-0 pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
    />
  );
}

function makeParticle(w: number, h: number, reset = false): Particle {
  return {
    x: Math.random() * w,
    y: reset ? -40 - Math.random() * 200 : Math.random() * h,
    vy: 0.8 + Math.random() * 2.2,
    len: 24 + Math.random() * 60,
    alpha: 0.25 + Math.random() * 0.55,
    // Gama violeta/azul: 240-290 en HSL
    hue: 240 + Math.random() * 60,
  };
}
