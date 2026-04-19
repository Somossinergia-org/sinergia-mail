"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Sidebar, { Tab } from "@/components/Sidebar";
import StatsCards from "@/components/StatsCards";
import HudDashboard from "@/components/HudDashboard";
import EmailList from "@/components/EmailList";
import InvoicePanel from "@/components/InvoicePanel";
import CategoryChart from "@/components/CategoryChart";
import AgentPanel from "@/components/AgentPanel";
import AgentBriefing from "@/components/AgentBriefing";
import AutomatizacionPanel from "@/components/AutomatizacionPanel";
import AlertasPanel from "@/components/AlertasPanel";
import ContactosPanel from "@/components/ContactosPanel";
import InformesPanel from "@/components/InformesPanel";
import IntegracionesPanel from "@/components/IntegracionesPanel";
import FacturarPanel from "@/components/FacturarPanel";
import MemoriaPanel from "@/components/MemoriaPanel";
import AccountSelector from "@/components/AccountSelector";
import TopProgressBar from "@/components/TopProgressBar";
import CommandPalette from "@/components/CommandPalette";
import MobileHeader from "@/components/MobileHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import ShortcutsHelp from "@/components/ShortcutsHelp";
import InboxZero from "@/components/InboxZero";
import UniversalSearch from "@/components/UniversalSearch";
import FloatingAgent from "@/components/FloatingAgent";
import GlobalDropZone from "@/components/GlobalDropZone";
import SequencesPanel from "@/components/SequencesPanel";
import OutboundPanel from "@/components/OutboundPanel";
import BillParserPanel from "@/components/BillParserPanel";
import CalendarPanel from "@/components/CalendarPanel";
import DrivePanel from "@/components/DrivePanel";
import TasksPanel from "@/components/TasksPanel";
import KanbanPanel from "@/components/KanbanPanel";
import TemplatesPanel from "@/components/TemplatesPanel";
import RulesPanel from "@/components/RulesPanel";
import ComposePanel from "@/components/ComposePanel";
import SignaturePanel from "@/components/SignaturePanel";
import CampaignPanel from "@/components/CampaignPanel";
import VisitsPanel from "@/components/VisitsPanel";
import RGPDPanel from "@/components/RGPDPanel";
import AgentSuperPanel from "@/components/AgentSuperPanel";
import ScoringPanel from "@/components/ScoringPanel";
import ForecastPanel from "@/components/ForecastPanel";
import KnowledgePanel from "@/components/KnowledgePanel";
import FineTuningPanel from "@/components/FineTuningPanel";
import AgentConfigPanel from "@/components/AgentConfigPanel";
import AgentOfficeMap from "@/components/AgentOfficeMap";
import PWAHead from "@/components/PWAHead";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { useShortcuts } from "@/lib/hooks/useShortcuts";
import { Toaster } from "sonner";
import { Search, RefreshCw } from "lucide-react";

const TAB_TITLES: Record<Tab, string> = {
  overview: "HUD Resumen",
  emails: "Emails",
  invoices: "Facturas",
  analytics: "Analíticas",
  automatizacion: "Automatización IA",
  alertas: "Alertas & IVA",
  contactos: "Contactos CRM",
  informes: "Informes Excel",
  integraciones: "Integraciones — MCP",
  facturar: "Facturar",
  memoria: "Memoria IA",
  agent: "Chat IA",
  sequences: "Secuencias Drip",
  omnicanal: "Centro Omnicanal",
  energia: "Analizador Energía",
  calendar: "Google Calendar",
  drive: "Google Drive",
  tasks: "Google Tasks",
  kanban: "Kanban Emails",
  templates: "Templates",
  rules: "Reglas Automáticas",
  compose: "Redactar con IA",
  signature: "Firma Digital",
  campaigns: "Dashboard Campañas",
  visits: "Visitas Comerciales",
  rgpd: "RGPD / Compliance",
  scoring: "Scoring Predictivo ML",
  forecast: "Tesorería & Forecasting",
  "agent-super": "Agente GPT-5 Swarm",
  brain: "Cerebro IA",
  "fine-tuning": "Entrenar Modelo IA",
  "agent-config": "Configuracion del Agente IA",
  "office-map": "Oficina Virtual IA",
};

interface EmailData {
  emails: any[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: {
    byCategory: Array<{ category: string | null; count: number }>;
    byPriority: Array<{ priority: string | null; count: number }>;
  };
}

interface InvoiceData {
  invoices: any[];
  pagination: any;
  totals: {
    grandTotal: { totalAmount: number; totalTax: number; totalBase: number };
    byCategory: Array<{ category: string | null; count: number; totalAmount: number }>;
    byMonth: Array<{ month: string | null; totalAmount: number; count: number }>;
  };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [darkMode, setDarkMode] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    lastSyncAt: string | null;
    totalEmails: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [inboxZeroOpen, setInboxZeroOpen] = useState(false);
  const [universalSearchOpen, setUniversalSearchOpen] = useState(false);
  const [floatingAgentOpen, setFloatingAgentOpen] = useState(false);
  // Filtro por cuenta Gmail. Persistido en localStorage para que sobreviva a reloads.
  const [selectedAccount, setSelectedAccount] = useState<number | "all">(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem("sinergia-selected-account");
    if (!saved || saved === "all") return "all";
    const n = Number(saved);
    return Number.isFinite(n) ? n : "all";
  });
  const handleSelectAccount = (a: number | "all") => {
    setSelectedAccount(a);
    try {
      window.localStorage.setItem("sinergia-selected-account", String(a));
    } catch {
      /* ignore */
    }
  };

  // Redirect if not authenticated
  if (status === "unauthenticated") {
    redirect("/login");
  }

  // Theme toggle
  const toggleTheme = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("light");
  };

  // Global keyboard shortcuts
  useShortcuts({
    gr: () => setActiveTab("overview"),
    ge: () => setActiveTab("emails"),
    gf: () => setActiveTab("invoices"),
    ga: () => setActiveTab("analytics"),
    gu: () => setActiveTab("automatizacion"),
    gl: () => setActiveTab("alertas"),
    gc: () => setActiveTab("contactos"),
    gi: () => setActiveTab("informes"),
    gt: () => setActiveTab("integraciones"),
    gv: () => setActiveTab("facturar"),
    gx: () => setActiveTab("agent"),
    "?": () => setShortcutsOpen(true),
    escape: () => setShortcutsOpen(false),
    z: () => setInboxZeroOpen(true),
    f: () => setUniversalSearchOpen(true),
    c: () => setFloatingAgentOpen(true),
    s: () => {
      if (!syncing) void handleSync();
    },
    "/": () => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder*="Buscar"]');
      input?.focus();
    },
  });

  // Fetch emails
  const fetchEmails = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        if (search) params.set("search", search);
        if (categoryFilter) params.set("category", categoryFilter);
        if (selectedAccount !== "all") params.set("accountId", String(selectedAccount));
        const res = await fetch(`/api/emails?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEmailData(data);
        }
      } catch (e) {
        console.error("Error fetching emails:", e);
      }
    },
    [search, categoryFilter, selectedAccount]
  );

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedAccount !== "all") params.set("accountId", String(selectedAccount));
      const qs = params.toString();
      const res = await fetch(`/api/invoices${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setInvoiceData(data);
      }
    } catch (e) {
      console.error("Error fetching invoices:", e);
    }
  }, [selectedAccount]);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync");
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      console.error("Error fetching sync status:", e);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([fetchEmails(), fetchInvoices(), fetchSyncStatus()]).then(
        () => setLoading(false)
      );
    }
  }, [status, fetchEmails, fetchInvoices, fetchSyncStatus]);

  // Re-fetch on filter changes
  useEffect(() => {
    if (status === "authenticated") fetchEmails();
  }, [search, categoryFilter, fetchEmails, status]);

  // Re-fetch invoices when switching to tabs that show invoice data
  useEffect(() => {
    if (
      status === "authenticated" &&
      (activeTab === "invoices" || activeTab === "overview" || activeTab === "analytics")
    ) {
      fetchInvoices();
    }
  }, [activeTab, status, fetchInvoices]);

  // Sync Gmail
  const handleSync = async () => {
    setSyncing(true);
    window.dispatchEvent(new Event("sinergia:sound-send"));
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "newer_than:30d", maxResults: 200 }),
      });
      const result = await res.json();
      if (result.success) {
        await Promise.all([fetchEmails(), fetchInvoices(), fetchSyncStatus()]);
        window.dispatchEvent(new Event("sinergia:sound-success"));
      } else {
        window.dispatchEvent(new Event("sinergia:sound-error"));
      }
    } catch (e) {
      console.error("Sync error:", e);
      window.dispatchEvent(new Event("sinergia:sound-error"));
    } finally {
      setSyncing(false);
    }
  };

  // Create draft
  const handleCreateDraft = async (emailId: number) => {
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      if (res.ok) {
        await fetchEmails(); // Refresh to show draft icon
      }
    } catch (e) {
      console.error("Draft error:", e);
    }
  };

  // Download ZIP
  const handleDownloadZip = (category?: string) => {
    const params = category ? `?category=${category}` : "";
    window.open(`/api/download${params}`, "_blank");
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-sinergia-400" />
          <p className="text-[var(--text-secondary)]">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  const totalEmails = emailData?.pagination.total || 0;
  const highPriority =
    emailData?.stats.byPriority.find((p) => p.priority === "ALTA")?.count || 0;
  const unread =
    emailData?.emails.filter((e) => !e.isRead).length || 0;
  const totalInvoices = invoiceData?.invoices.length || 0;
  const totalSpend = invoiceData?.totals.grandTotal.totalAmount || 0;

  return (
    <div className="min-h-screen max-w-[1600px] mx-auto lg:flex lg:gap-4 lg:p-4 lg:items-start">
      <PWAHead />
      <PWAInstallBanner />
      <TopProgressBar visible={syncing} />
      {/* Mobile header (hidden on desktop) */}
      <MobileHeader
        onToggleSidebar={() => setSidebarOpen(true)}
        onSync={handleSync}
        syncing={syncing}
        title={TAB_TITLES[activeTab]}
        onOpenSearch={() => setUniversalSearchOpen(true)}
      />

      {/* Sidebar (drawer on mobile, sticky on desktop) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSync={handleSync}
        syncing={syncing}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
        userName={session?.user?.name}
        userImage={session?.user?.image}
        accountSelector={
          <AccountSelector
            selected={selectedAccount}
            onChange={handleSelectAccount}
          />
        }
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content — key by activeTab for cinematic fade-in */}
      <main
        key={activeTab}
        className="tab-panel flex-1 space-y-4 lg:space-y-6 min-w-0 px-4 pb-24 pt-4 lg:px-0 lg:pt-0 lg:pb-0">
        {/* Proactive Agent Briefing */}
        {activeTab === "overview" && (
          <AgentBriefing onNavigate={(tab) => setActiveTab(tab as Tab)} selectedAccount={selectedAccount} />
        )}

        {/* Header — desktop-only (mobile has MobileHeader) */}
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-shimmer">
              {activeTab === "overview" && "Resumen General"}
              {activeTab === "emails" && "Bandeja de Entrada"}
              {activeTab === "invoices" && "Gestor de Facturas"}
              {activeTab === "analytics" && "Analíticas"}
              {activeTab === "automatizacion" && "Automatización IA"}
              {activeTab === "alertas" && "Alertas & Control Financiero"}
              {activeTab === "contactos" && "Contactos CRM"}
              {activeTab === "informes" && "Informes Excel"}
              {activeTab === "integraciones" && "Integraciones — MCP"}
              {activeTab === "facturar" && "Facturar — Facturas emitidas"}
              {activeTab === "memoria" && "Memoria IA — NotebookLM interno"}
              {activeTab === "agent" && "Chat con el Agente IA"}
              {activeTab === "sequences" && "Secuencias Drip — Follow-ups automáticos"}
              {activeTab === "omnicanal" && "Centro Omnicanal — Email · WhatsApp · Push"}
              {activeTab === "energia" && "Analizador de Facturas Energéticas"}
              {activeTab === "calendar" && "Google Calendar — Eventos y reuniones"}
              {activeTab === "drive" && "Google Drive — Explorador de archivos"}
              {activeTab === "tasks" && "Google Tasks — Tareas pendientes"}
              {activeTab === "kanban" && "Kanban — Gestión visual de emails"}
              {activeTab === "templates" && "Templates — Plantillas de email"}
              {activeTab === "rules" && "Reglas Automáticas — Filtros y acciones"}
              {activeTab === "compose" && "Redactar — Composición con IA"}
              {activeTab === "signature" && "Firma Digital — HTML configurable"}
              {activeTab === "campaigns" && "Dashboard Campañas — Rendimiento"}
              {activeTab === "visits" && "Visitas Comerciales — Ruta y check-in"}
              {activeTab === "rgpd" && "RGPD / Compliance — Proteccion de datos"}
              {activeTab === "scoring" && "Scoring Predictivo — Machine Learning"}
              {activeTab === "forecast" && "Tesorería IA — Forecasting financiero"}
              {activeTab === "brain" && "Cerebro IA — Base de conocimiento empresarial"}
              {activeTab === "agent-super" && "Agente GPT-5 — Swarm multi-agente"}
              {activeTab === "fine-tuning" && "Entrenar Modelo IA — Fine-tuning personalizado"}
              {activeTab === "agent-config" && "Configuracion del Agente IA — Manual del agente"}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Somos Sinergia — orihuela@somossinergia.es
            </p>
          </div>

          {/* Search (desktop only) */}
          {(activeTab === "emails" || activeTab === "overview") && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Buscar emails..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] w-64 transition"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="py-2 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] transition appearance-none"
              >
                <option value="">Todas las categorías</option>
                {emailData?.stats.byCategory.map((c) => (
                  <option key={c.category} value={c.category || ""}>
                    {c.category} ({c.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Mobile-only search */}
        {(activeTab === "emails" || activeTab === "overview") && (
          <div className="lg:hidden flex flex-col gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type="text"
                placeholder="Buscar emails..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-3 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] w-full"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="py-3 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] w-full"
            >
              <option value="">Todas las categorías</option>
              {emailData?.stats.byCategory.map((c) => (
                <option key={c.category} value={c.category || ""}>
                  {c.category} ({c.count})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tab content */}
        {activeTab === "overview" && (
          <HudDashboard
            totalEmails={totalEmails}
            unread={unread}
            highPriority={highPriority}
            totalInvoices={totalInvoices}
            totalSpend={totalSpend}
            lastSync={syncStatus?.lastSyncAt || null}
            byCategory={emailData?.stats.byCategory || []}
            byMonth={invoiceData?.totals.byMonth}
            recentEmails={(emailData?.emails || []).slice(0, 20).map((e: any) => ({
              id: e.id,
              subject: e.subject || "(sin asunto)",
              from: e.from || "",
              category: e.category || null,
              date: e.date || "",
            }))}
          />
        )}

        {activeTab === "emails" && (
          <EmailList
            emails={emailData?.emails || []}
            onCreateDraft={handleCreateDraft}
          />
        )}

        {activeTab === "invoices" && invoiceData && (
          <InvoicePanel
            invoices={invoiceData.invoices}
            totals={invoiceData.totals}
            onDownloadZip={handleDownloadZip}
            onChanged={fetchInvoices}
          />
        )}

        {activeTab === "automatizacion" && <AutomatizacionPanel />}

        {activeTab === "alertas" && <AlertasPanel selectedAccount={selectedAccount} />}

        {activeTab === "contactos" && <ContactosPanel selectedAccount={selectedAccount} />}

        {activeTab === "informes" && <InformesPanel selectedAccount={selectedAccount} />}

        {activeTab === "integraciones" && <IntegracionesPanel />}

        {activeTab === "facturar" && <FacturarPanel />}

        {activeTab === "memoria" && <MemoriaPanel selectedAccount={selectedAccount} />}

        {activeTab === "agent" && <AgentPanel />}

        {activeTab === "sequences" && <SequencesPanel />}

        {activeTab === "omnicanal" && <OutboundPanel />}

        {activeTab === "energia" && <BillParserPanel />}

        {activeTab === "calendar" && <CalendarPanel />}

        {activeTab === "drive" && <DrivePanel />}

        {activeTab === "tasks" && <TasksPanel />}

        {activeTab === "kanban" && <KanbanPanel />}

        {activeTab === "templates" && <TemplatesPanel />}

        {activeTab === "rules" && <RulesPanel />}

        {activeTab === "compose" && <ComposePanel />}

        {activeTab === "signature" && <SignaturePanel />}

        {activeTab === "campaigns" && <CampaignPanel />}

        {activeTab === "visits" && <VisitsPanel />}

        {activeTab === "rgpd" && <RGPDPanel />}

        {activeTab === "scoring" && <ScoringPanel />}

        {activeTab === "forecast" && <ForecastPanel />}

        {activeTab === "brain" && <KnowledgePanel />}

        {activeTab === "agent-super" && <AgentSuperPanel />}

        {activeTab === "fine-tuning" && <FineTuningPanel />}
        {activeTab === "agent-config" && <AgentConfigPanel />}
        {activeTab === "office-map" && <AgentOfficeMap />}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <CategoryChart
              byCategory={emailData?.stats.byCategory || []}
              byMonth={invoiceData?.totals.byMonth}
            />
            {/* Priority distribution */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold mb-4">
                Distribución por Prioridad
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {(emailData?.stats.byPriority || []).map((p) => (
                  <div
                    key={p.priority}
                    className={`p-4 rounded-xl ${
                      p.priority === "ALTA"
                        ? "bg-red-500/10 border border-red-500/20"
                        : p.priority === "MEDIA"
                          ? "bg-yellow-500/10 border border-yellow-500/20"
                          : "bg-green-500/10 border border-green-500/20"
                    }`}
                  >
                    <div className="stat-number text-2xl">{p.count}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                      {p.priority ? `Prioridad ${p.priority}` : "Sin prioridad"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Top senders spending */}
            {invoiceData && (
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold mb-4">
                  Gasto por Categoría
                </h3>
                <div className="space-y-3">
                  {invoiceData.totals.byCategory
                    .sort((a, b) => b.totalAmount - a.totalAmount)
                    .map((cat) => {
                      const pct =
                        (cat.totalAmount /
                          (invoiceData.totals.grandTotal.totalAmount || 1)) *
                        100;
                      return (
                        <div key={cat.category}>
                          <div className="flex justify-between text-xs mb-1">
                            <span>{cat.category}</span>
                            <span className="text-[var(--text-secondary)]">
                              {cat.totalAmount.toLocaleString("es-ES", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              € ({cat.count} fact.)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-[var(--bg-card)] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sinergia-500 to-purple-500 transition-all"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global overlays */}
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          },
        }}
      />
      <CommandPalette onNavigate={setActiveTab} onSync={handleSync} />
      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <UniversalSearch
        open={universalSearchOpen}
        onClose={() => setUniversalSearchOpen(false)}
        onNavigate={setActiveTab}
      />
      <FloatingAgent
        open={floatingAgentOpen}
        onOpen={() => setFloatingAgentOpen(true)}
        onClose={() => setFloatingAgentOpen(false)}
      />
      <GlobalDropZone
        onFileDrop={(file) => {
          setFloatingAgentOpen(true);
          // Defer so FloatingAgent has mounted/listened
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("sinergia:file", { detail: file }));
          }, 100);
        }}
      />
      <InboxZero
        open={inboxZeroOpen}
        onClose={() => setInboxZeroOpen(false)}
        onDone={() => {
          setInboxZeroOpen(false);
          fetchEmails();
        }}
      />
    </div>
  );
}
