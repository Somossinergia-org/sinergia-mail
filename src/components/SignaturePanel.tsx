"use client";

import { useState } from "react";
import { Pen, Eye, Save, RotateCcw } from "lucide-react";

const DEFAULT_SIGNATURE = `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #334155; border-top: 2px solid #06b6d4; padding-top: 12px; margin-top: 16px;">
  <p style="margin: 0; font-weight: 700; color: #0f172a;">David Miquel Jordá</p>
  <p style="margin: 2px 0; color: #64748b; font-size: 12px;">Gerente · Somos Sinergia</p>
  <p style="margin: 6px 0 0; font-size: 11px;">
    <span style="color: #06b6d4;">✉</span> orihuela@somossinergia.es
    <span style="margin: 0 6px; color: #cbd5e1;">|</span>
    <span style="color: #06b6d4;">🌐</span> somossinergia.es
  </p>
</div>`;

export default function SignaturePanel() {
  const [html, setHtml] = useState(DEFAULT_SIGNATURE);
  const [preview, setPreview] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    try {
      localStorage.setItem("sinergia-signature", html);
    } catch { /* */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => setHtml(DEFAULT_SIGNATURE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pen size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Firma Digital HTML</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPreview(!preview)}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[#0a1628] border border-[#1a2d4a] text-slate-400 hover:text-white transition">
            <Eye size={10} /> {preview ? "Editar" : "Preview"}
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[#0a1628] border border-[#1a2d4a] text-slate-400 hover:text-white transition">
            <RotateCcw size={10} /> Reset
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition">
            <Save size={10} /> {saved ? "¡Guardada!" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">HTML</p>
          <textarea value={html} onChange={e => setHtml(e.target.value)}
            rows={12} className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50 resize-none" />
        </div>

        {/* Preview */}
        <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Vista previa</p>
          <div className="rounded-lg bg-white p-4 min-h-[200px]" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
