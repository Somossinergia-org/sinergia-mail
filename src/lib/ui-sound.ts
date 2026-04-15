"use client";

/**
 * Sintetizador UI minimal con Web Audio API.
 *
 * Cero archivos de audio → 0 KB de bandwidth. Todos los sonidos se generan
 * en vivo con osciladores + envolventes ADSR cortas. Suena "sci-fi" / UI
 * futurista tipo cabina de nave.
 *
 * Uso:
 *   import { uiSound } from "@/lib/ui-sound";
 *   uiSound.click();
 *   uiSound.success();
 *   uiSound.setEnabled(false);  // mute global (persistido)
 *
 * Respeta el estado en localStorage. Muted por defecto: false; pero el
 * AudioContext sólo se crea tras la primera interacción del usuario
 * (política del navegador — no hace ruido inesperado al entrar).
 */

type SoundKind = "click" | "hover" | "success" | "error" | "send" | "receive" | "open" | "close" | "type";

const STORAGE_KEY = "sinergia-sound-enabled";

class UISound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled: boolean;
  private lastPlay: Record<string, number> = {};

  constructor() {
    this.enabled =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY) !== "0"
        : true;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    }
    if (!on && this.master) this.master.gain.value = 0;
    else if (on && this.master) this.master.gain.value = 0.15;
  }
  isEnabled() {
    return this.enabled;
  }

  private ensureCtx(): AudioContext | null {
    if (!this.enabled || typeof window === "undefined") return null;
    if (!this.ctx) {
      type W = Window & { webkitAudioContext?: typeof AudioContext };
      const w = window as W;
      const Ctor = window.AudioContext || w.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.15;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Rate-limit por kind para evitar chorros de eventos (p.ej. hover) */
  private throttle(kind: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlay[kind] || 0) < ms) return false;
    this.lastPlay[kind] = now;
    return true;
  }

  play(kind: SoundKind) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;

    switch (kind) {
      case "click":
        if (!this.throttle("click", 50)) return;
        return this.blip(ctx, 880, 0.06, "triangle", 0.22);
      case "hover":
        if (!this.throttle("hover", 80)) return;
        return this.blip(ctx, 1320, 0.03, "sine", 0.08);
      case "success":
        if (!this.throttle("success", 300)) return;
        return this.chord(ctx, [523.25, 659.25, 783.99], 0.22, 0.35);
      case "error":
        if (!this.throttle("error", 300)) return;
        return this.sweep(ctx, 440, 180, 0.28, "sawtooth", 0.4);
      case "send":
        if (!this.throttle("send", 120)) return;
        return this.sweep(ctx, 440, 1200, 0.18, "triangle", 0.3);
      case "receive":
        if (!this.throttle("receive", 120)) return;
        return this.sweep(ctx, 1320, 660, 0.2, "sine", 0.3);
      case "open":
        if (!this.throttle("open", 150)) return;
        return this.sweep(ctx, 220, 880, 0.25, "triangle", 0.25);
      case "close":
        if (!this.throttle("close", 150)) return;
        return this.sweep(ctx, 880, 220, 0.2, "triangle", 0.2);
      case "type":
        if (!this.throttle("type", 40)) return;
        return this.blip(ctx, 2200 + Math.random() * 400, 0.02, "square", 0.04);
    }
  }

  // ─── primitive synth helpers ──────────────────────────────────
  private envelope(gain: GainNode, ctx: AudioContext, peak: number, duration: number) {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  }

  private blip(ctx: AudioContext, freq: number, duration: number, type: OscillatorType, peak: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain).connect(this.master!);
    this.envelope(gain, ctx, peak, duration);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  private sweep(
    ctx: AudioContext,
    fromHz: number,
    toHz: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), t + duration);
    osc.connect(gain).connect(this.master!);
    this.envelope(gain, ctx, peak, duration);
    osc.start();
    osc.stop(t + duration + 0.05);
  }

  private chord(ctx: AudioContext, freqs: number[], duration: number, peak: number) {
    freqs.forEach((f, i) => {
      setTimeout(() => this.blip(ctx, f, duration, "triangle", peak), i * 55);
    });
  }
}

export const uiSound = new UISound();
