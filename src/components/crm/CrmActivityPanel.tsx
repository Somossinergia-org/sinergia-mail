"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Phone, Mail, MessageCircle, MapPin, FileText,
  ArrowRight, CheckCircle, RotateCcw, Send, Plus, Clock, AlertTriangle,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface Activity {
  id: number;
  companyId: number;
  contactId: number | null;
  opportunityId: number | null;
  type: string;
  summary: string;
  outcome: string | null;
  nextStep: string | null;
  dueAt: string | null;
  createdAt: string;
}

interface ActivityWithCompany {
  activity: Activity;
  companyName: string;
}

interface FollowUp {
  activity: Activity;
  companyName: string;
}

const ACTIVITY_TYPES = [
  { value: "llamada", label: "Llamada", icon: <Phone className="w-3.5 h-3.5" /> },
  { value: "email", label: "Email", icon: <Mail className="w-3.5 h-3.5" /> },
  { value: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { value: "visita", label: "Visita", icon: <MapPin className="w-3.5 h-3.5" /> },
  { value: "nota", label: "Nota", icon: <FileText className="w-3.5 h-3.5" /> },
  { value: "seguimiento", label: "Seguimiento", icon: <ArrowRight className="w-3.5 h-3.5" /> },
  { value: "propuesta_enviada", label: "Propuesta", icon: <Send className="w-3.5 h-3.5" /> },
  { value: "renovacion", label: "Renovación", icon: <RotateCcw className="w-3.5 h-3.5" /> },
  { value: "tarea_completada", label: "Tarea", icon: <CheckCircle className="w-3.5 h-3.5" /> },
];

function getActivityIcon(type: string) {
  return ACTIVITY_TYPES.find((t) => t.value === type)?.icon || <FileText className="w-3.5 h-3.5" />;
}

function getActivityLabel(type: string) {
  return ACTIVITY_TYPES.find((t) => t.value === type)?.label || type;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60));
  if (diff < 60) return `hace ${diff}m`;
  if (diff < 1440) return `hace ${Math.floor(diff / 60)}h`;
  return `hace ${Math.floor(diff / 1440)}d`;
}

// ─── Activity Form (inline) ────────────────────────────────────────────

function ActivityForm({ companyId, onCreated }: { companyId?: number; onCreated: () => void }) {
  const [type, setType] = useState("llamada");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!summary.trim() || !companyId) return;
    setSaving(true);
    try {
      await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          type,
          summary: summary.trim(),
          outcome: outcome.trim() || null,
          nextStep: nextStep.trim() || null,
          dueAt: dueAt || null,
        }),
      });
      setSummary(""); setOutcome(""); setNextStep(""); setDueAt("");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-xs border rounded px-2 py-1 bg-white"
        >
          {ACTIVITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Resumen de la actividad..."
          className="flex-1 text-sm border rounded px-2 py-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Resultado (opcional)"
          className="flex-1 text-xs border rounded px-2 py-1"
        />
        <input
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="Próxima acción (opcional)"
          className="flex-1 text-xs border rounded px-2 py-1"
        />
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="text-xs border rounded px-2 py-1"
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !summary.trim()}
          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// ─── Activity Timeline ─────────────────────────────────────────────────

function ActivityTimeline({ activities, showCompany = false }: {
  activities: (Activity | ActivityWithCompany)[];
  showCompany?: boolean;
}) {
  if (activities.length === 0) {
    return <p className="text-sm text-gray-500 py-3 text-center">Sin actividad registrada</p>;
  }

  return (
    <div className="space-y-1.5">
      {activities.map((item) => {
        const act = "activity" in item ? item.activity : item;
        const company = "companyName" in item ? item.companyName : null;
        const isOverdue = act.dueAt && new Date(act.dueAt) < new Date() && act.nextStep;

        return (
          <div key={act.id} className="flex items-start gap-2 py-1.5 border-b last:border-0 text-sm">
            <div className="mt-0.5 text-gray-500">{getActivityIcon(act.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-700">{getActivityLabel(act.type)}</span>
                {showCompany && company && (
                  <span className="text-xs text-blue-600">{company}</span>
                )}
                <span className="text-xs text-gray-400">{timeAgo(act.createdAt)}</span>
              </div>
              <p className="text-gray-800 truncate">{act.summary}</p>
              {act.outcome && <p className="text-xs text-gray-500">Resultado: {act.outcome}</p>}
              {act.nextStep && (
                <p className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-blue-600"}`}>
                  {isOverdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                  Próximo: {act.nextStep}
                  {act.dueAt && <span className="ml-1">({new Date(act.dueAt).toLocaleDateString("es-ES")})</span>}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Panel (for company detail or global) ─────────────────────────

export default function CrmActivityPanel({ companyId }: { companyId?: number }) {
  const [activities, setActivities] = useState<(Activity | ActivityWithCompany)[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"recent" | "overdue" | "upcoming">("recent");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (companyId) {
        const res = await fetch(`/api/crm/activities?view=company&companyId=${companyId}`);
        const data = await res.json();
        setActivities(data.activities || []);
      } else {
        const [recentRes, overdueRes] = await Promise.all([
          fetch("/api/crm/activities?view=recent&limit=20"),
          fetch("/api/crm/activities?view=overdue&limit=10"),
        ]);
        const recent = await recentRes.json();
        const overdue = await overdueRes.json();
        setActivities(recent.activities || []);
        setOverdueFollowUps(overdue.followUps || []);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Cargando actividad...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Actividad Comercial</h3>
        <div className="flex items-center gap-2">
          {companyId && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-700"
            >
              <Plus className="w-3 h-3" /> Registrar
            </button>
          )}
          <button onClick={fetchData} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showForm && companyId && (
        <ActivityForm companyId={companyId} onCreated={() => { setShowForm(false); fetchData(); }} />
      )}

      {!companyId && overdueFollowUps.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span className="text-xs font-bold text-red-700">{overdueFollowUps.length} seguimiento(s) vencido(s)</span>
          </div>
          {overdueFollowUps.slice(0, 5).map((f) => (
            <div key={f.activity.id} className="text-xs text-red-800 py-0.5">
              <span className="font-medium">{f.companyName}</span>: {f.activity.nextStep}
            </div>
          ))}
        </div>
      )}

      {!companyId && (
        <div className="flex gap-1 border-b pb-1">
          {(["recent", "overdue", "upcoming"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-2 py-1 rounded-t ${tab === t ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t === "recent" ? "Reciente" : t === "overdue" ? "Vencidos" : "Próximos"}
            </button>
          ))}
        </div>
      )}

      <ActivityTimeline activities={activities} showCompany={!companyId} />
    </div>
  );
}

export { ActivityForm, ActivityTimeline };
