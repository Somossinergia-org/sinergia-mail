"use client";

import { useState, useEffect } from "react";
import { FileText, Copy, Eye, Send, Plus, Sparkles } from "lucide-react";

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  category: string;
}

const DEFAULT_TEMPLATES: Template[] = [
  { id: "acuse", name: "Acuse de recibo", subject: "Re: {{originalSubject}}", body: "Estimado/a {{senderName}},\n\nAcuso recibo de su email. Lo revisaremos y le responderemos a la mayor brevedad.\n\nUn saludo cordial,\nSomos Sinergia", variables: ["senderName", "originalSubject"], category: "General" },
  { id: "presupuesto", name: "Solicitud presupuesto", subject: "Solicitud de presupuesto - Somos Sinergia", body: "Estimado/a {{senderName}},\n\nNos ponemos en contacto para solicitar un presupuesto por los siguientes servicios/productos:\n\n{{detalles}}\n\nQuedamos a la espera de su respuesta.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "detalles"], category: "Comercial" },
  { id: "pago", name: "Confirmación de pago", subject: "Confirmación de pago - {{amount}}", body: "Estimado/a {{senderName}},\n\nLe confirmamos que hemos realizado el pago por importe de {{amount}} correspondiente a la factura {{invoiceRef}}.\n\nAdjuntamos justificante.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "amount", "invoiceRef"], category: "Finanzas" },
  { id: "seguimiento", name: "Seguimiento", subject: "Seguimiento: {{originalSubject}}", body: "Estimado/a {{senderName}},\n\nLe escribo para hacer seguimiento de nuestra conversación anterior sobre {{tema}}.\n\n¿Ha tenido oportunidad de revisarlo?\n\nQuedamos a su disposición.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "originalSubject", "tema"], category: "Comercial" },
  { id: "agradecimiento", name: "Agradecimiento", subject: "Gracias - {{originalSubject}}", body: "Estimado/a {{senderName}},\n\nMuchas gracias por su pronta respuesta y colaboración.\n\n{{mensaje}}\n\nUn saludo cordial,\nSomos Sinergia", variables: ["senderName", "originalSubject", "mensaje"], category: "General" },
  { id: "reclamacion", name: "Reclamación", subject: "Reclamación - {{referencia}}", body: "Estimado/a {{senderName}},\n\nNos ponemos en contacto para presentar una reclamación respecto a:\n\n{{descripcion}}\n\nReferencia: {{referencia}}\nFecha: {{fecha}}\n\nSolicitamos una resolución a la mayor brevedad.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "referencia", "descripcion", "fecha"], category: "Legal" },
  { id: "bienvenida", name: "Bienvenida cliente", subject: "Bienvenido/a a Somos Sinergia", body: "Estimado/a {{senderName}},\n\nEs un placer darle la bienvenida como nuevo cliente de Somos Sinergia.\n\nA partir de ahora contará con:\n- Gestión integral de sus comunicaciones\n- Asistente IA para automatización\n- Panel de facturas y analíticas\n\nNo dude en contactarnos para cualquier consulta.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName"], category: "Onboarding" },
];

export default function TemplatesPanel() {
  const [templates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [selected, setSelected] = useState<Template | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [filter, setFilter] = useState("");

  const categories = Array.from(new Set(templates.map(t => t.category)));

  const applyVars = (text: string) => {
    let result = text;
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val || `{{${key}}}`);
    }
    return result;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(applyVars(text));
  };

  const filteredTemplates = filter ? templates.filter(t => t.category === filter) : templates;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Templates de Email</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setFilter("")} className={`text-[10px] px-2 py-1 rounded-lg transition ${!filter ? "bg-cyan-500/10 text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}>Todos</button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} className={`text-[10px] px-2 py-1 rounded-lg transition ${filter === cat ? "bg-cyan-500/10 text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}>{cat}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Template list */}
        <div className="space-y-1.5">
          {filteredTemplates.map(t => (
            <button key={t.id} onClick={() => { setSelected(t); setVars({}); setPreview(false); }}
              className={`w-full text-left rounded-xl bg-[#0a1628] border px-4 py-3 transition-colors ${selected?.id === t.id ? "border-cyan-500/40 bg-cyan-500/5" : "border-[#1a2d4a] hover:border-cyan-500/20"}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-300">{t.name}</p>
                <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">{t.category}</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-1 truncate">{t.subject}</p>
            </button>
          ))}
        </div>

        {/* Detail / Preview */}
        {selected ? (
          <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-cyan-400">{selected.name}</h3>
              <div className="flex gap-1.5">
                <button onClick={() => setPreview(!preview)} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-slate-400 hover:text-white transition">
                  <Eye size={10} /> {preview ? "Editar" : "Preview"}
                </button>
                <button onClick={() => copyToClipboard(selected.body)} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-slate-400 hover:text-white transition">
                  <Copy size={10} /> Copiar
                </button>
              </div>
            </div>

            {/* Variables */}
            {selected.variables.length > 0 && !preview && (
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">Variables</p>
                <div className="grid grid-cols-2 gap-2">
                  {selected.variables.map(v => (
                    <input key={v} value={vars[v] || ""} onChange={e => setVars({...vars, [v]: e.target.value})}
                      placeholder={`{{${v}}}`} className="px-2 py-1.5 rounded-lg text-xs bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50" />
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="rounded-lg bg-[#050a14] border border-[#1a2d4a] p-3 max-h-[300px] overflow-y-auto">
              <p className="text-[10px] text-slate-500 mb-1">Asunto: <span className="text-slate-300">{applyVars(selected.subject)}</span></p>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{applyVars(selected.body)}</pre>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-8 flex items-center justify-center">
            <div className="text-center text-slate-600">
              <Sparkles size={24} className="mx-auto mb-2 text-cyan-500/20" />
              <p className="text-xs">Selecciona un template</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
