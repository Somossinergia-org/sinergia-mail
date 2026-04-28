"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Sidebar, { Tab } from "@/components/Sidebar";
import SubTabs from "@/components/SubTabs";
import SectionNav from "@/components/SectionNav";
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
// AgentSuperPanel removed — chat now integrated into AgentOfficeMap
import ScoringPanel from "@/components/ScoringPanel";
import ForecastPanel from "@/components/ForecastPanel";
import KnowledgePanel from "@/components/KnowledgePanel";
import FineTuningPanel from "@/components/FineTuningPanel";
import OperationsPanel from "@/components/operations/OperationsPanel";
import AgentConfigPanel from "@/components/AgentConfigPanel";
import ImportPanel from "@/components/ImportPanel";
import AgentOfficeMap from "@/components/AgentOfficeMap";
import WordPressPanel from "@/components/WordPressPanel";
import WordPressLivePanel from "@/components/WordPressLivePanel";
import CrmPanel from "@/components/crm/CrmPanel";
import CrmOpportunitiesPanel from "@/components/crm/CrmOpportunitiesPanel";
import CrmCommercialOpsPanel from "@/components/crm/CrmCommercialOpsPanel";
import CrmActivityPanel from "@/components/crm/CrmActivityPanel";
import CrmTasksPanel from "@/components/crm/CrmTasksPanel";
import CrmNotificationsPanel from "@/components/crm/CrmNotificationsPanel";
import CrmAgendaPanel from "@/components/crm/CrmAgendaPanel";
import CrmExecutivePanel from "@/components/crm/CrmExecutivePanel";
import OpsConfigPanel from "@/components/OpsConfigPanel";
import TodayWidget from "@/components/TodayWidget";
import QuickActionFab from "@/components/QuickActionFab";
import PWAHead from "@/components/PWAHead";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import MobilePullToRefresh from "@/components/MobilePullToRefresh";
import MobileSwipeTabs from "@/components/MobileSwipeTabs";
import OfflineBanner from "@/components/OfflineBanner";
import MobileChatFab from "@/components/MobileChatFab";
import MobileQuickActions from "@/components/MobileQuickActions";
import MobileQuickPanel from "@/components/MobileQuickPanel";
import MobileFinanzasFab from "@/components/MobileFinanzasFab";
import { useShortcuts } from "@/lib/hooks/useShortcuts";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { Toaster } from "sonner";
import {
  Search, RefreshCw, Mail, Columns3, PenTool, FileText, Receipt, Globe,
  Zap, Filter, FileText as FileTemplate, Send, MessageCircle, BarChart3,
  Users, TrendingUp, MapPin, Bell, Wallet, Activity, FileSpreadsheet,
  Calendar, HardDrive, CheckSquare, Cpu, Building2, Brain, BookOpen,
  Sliders, Plug, Pen, Shield, Target, LayoutGrid, Briefcase, Package,
} from "lucide-react";

const TAB_TITLES: Record<Tab, string> = {
  overview: "Mi día",
  crm: "CRM",
  emails: "Emails",
  campanas: "Campañas",
  finanzas: "Finanzas",
  config: "Ajustes",
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
  // Tab persistente — sobrevive al reload de pestaña.
  const [activeTab, setActiveTab] = useLocalStorage<Tab>("sinergia-active-tab", "overview");
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // SSR-safe — default a dark, hidrata con localStorage en useEffect
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("sinergia-theme");
    if (saved === "light") return false;
    if (saved === "dark") return true;
    // Sin preferencia guardada → respeta prefers-color-scheme
    return !window.matchMedia?.("(prefers-color-scheme: light)").matches;
  });

  // Sincroniza la clase del <html> con el estado y persiste
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (darkMode) {
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
    }
    try {
      window.localStorage.setItem("sinergia-theme", darkMode ? "dark" : "light");
    } catch { /* localStorage bloqueado en algunos modos privados */ }
  }, [darkMode]);
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
    } catch { /* ignore */ }
  };

  // Notification counts para badges en MobileBottomNav (refresh cada 60s)
  const [notifCounts, setNotifCounts] = useState<{
    emails: number;
    crm: number;
    finanzas: number;
  }>({ emails: 0, crm: 0, finanzas: 0 });

  // Quick panel (atajos de Inicio: Calendario, Drive, Importar)
  const [quickPanel, setQuickPanel] = useState<null | "calendar" | "drive" | "import">(null);

  // Auto-scroll-to-top al cambiar de tab principal — UX mobile
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  if (status === "unauthenticated") {
    redirect("/login");
  }

  const toggleTheme = () => {
    // El useEffect de arriba se encarga de aplicar/persistir
    setDarkMode((d) => !d);
  };

  useShortcuts({
    gr: () => setActiveTab("overview"),
    gc: () => setActiveTab("crm"),
    ge: () => setActiveTab("emails"),
    gp: () => setActiveTab("campanas"),
    gf: () => setActiveTab("finanzas"),
    ga: () => setActiveTab("config"),
    "?": () => setShortcutsOpen(true),
    escape: () => setShortcutsOpen(false),
    z: () => setInboxZeroOpen(true),
    f: () => setUniversalSearchOpen(true),
    c: () => setFloatingAgentOpen(true),
    s: () => { if (!syncing) void handleSync(); },
    "/": () => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder*="Buscar"]');
      input?.focus();
    },
  });

  const fetchEmails = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        if (search) params.set("search", search);
        if (categoryFilter) params.set("category", categoryFilter);
        if (selectedAccount !== "all") params.set("accountId", String(selectedAccount));
        const res = await fetch(`/api/emails?${params}`);
        if (res.ok) setEmailData(await res.json());
      } catch (e) { console.error("Error fetching emails:", e); }
    },
    [search, categoryFilter, selectedAccount]
  );

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedAccount !== "all") params.set("accountId", String(selectedAccount));
      const qs = params.toString();
      const res = await fetch(`/api/invoices${qs ? `?${qs}` : ""}`);
      if (res.ok) setInvoiceData(await res.json());
    } catch (e) { console.error("Error fetching invoices:", e); }
  }, [selectedAccount]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync");
      if (res.ok) setSyncStatus(await res.json());
    } catch (e) { console.error("Error fetching sync status:", e); }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([fetchEmails(), fetchInvoices(), fetchSyncStatus()]).then(() => setLoading(false));
    }
  }, [status, fetchEmails, fetchInvoices, fetchSyncStatus]);

  useEffect(() => {
    if (status === "authenticated") fetchEmails();
  }, [search, categoryFilter, fetchEmails, status]);

  useEffect(() => {
    if (status === "authenticated" && (activeTab === "overview" || activeTab === "finanzas")) {
      fetchInvoices();
    }
  }, [activeTab, status, fetchInvoices]);

  // Notification counts polling (cada 60s) para badges móvil
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const [emailsRes, notifRes, invoicesRes] = await Promise.allSettled([
          fetch("/api/emails?limit=1&unreadOnly=true"),
          fetch("/api/crm/notifications?view=summary"),
          fetch("/api/invoices/pending-count"),
        ]);
        if (cancelled) return;
        const next = { emails: 0, crm: 0, finanzas: 0 };
        if (emailsRes.status === "fulfilled" && emailsRes.value.ok) {
          const d = await emailsRes.value.json();
          next.emails = d?.pagination?.total || 0;
        }
        if (notifRes.status === "fulfilled" && notifRes.value.ok) {
          const d = await notifRes.value.json();
          // Sólo "new" — son las realmente pendientes de revisar
          next.crm = d?.summary?.totalNew || 0;
        }
        if (invoicesRes.status === "fulfilled" && invoicesRes.value.ok) {
          const d = await invoicesRes.value.json();
          next.finanzas = d?.pendingCount || 0;
        }
        setNotifCounts(next);
      } catch { /* silent */ }
    };
    fetchCounts();
    const intervalId = setInterval(fetchCounts, 60_000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [status]);

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

  const handleCreateDraft = async (emailId: number) => {
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      if (res.ok) await fetchEmails();
    } catch (e) { console.error("Draft error:", e); }
  };

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
  const highPriority = emailData?.stats.byPriority.find((p) => p.priority === "ALTA")?.count || 0;
  const unread = emailData?.emails.filter((e) => !e.isRead).length || 0;
  const totalInvoices = invoiceData?.invoices.length || 0;
  const totalSpend = invoiceData?.totals.grandTotal.totalAmount || 0;

  return (
    <MobileSwipeTabs
      activeTab={activeTab}
      onTabChange={setActiveTab}
      disabled={sidebarOpen || universalSearchOpen || floatingAgentOpen || inboxZeroOpen}
    >
    <div className="min-h-screen max-w-[1600px] mx-auto lg:flex lg:gap-4 lg:p-4 lg:items-start">
      <PWAHead />
      <PWAInstallBanner />
      <OfflineBanner />
      <TopProgressBar visible={syncing} />
      <MobileHeader
        onToggleSidebar={() => setSidebarOpen(true)}
        onSync={handleSync}
        syncing={syncing}
        title={TAB_TITLES[activeTab]}
        onOpenSearch={() => setUniversalSearchOpen(true)}
        notifTotal={(notifCounts.emails || 0) + (notifCounts.crm || 0) + (notifCounts.finanzas || 0)}
      />

      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSync={handleSync}
        syncing={syncing}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
        userName={session?.user?.name}
        userImage={session?.user?.image}
        accountSelector={<AccountSelector selected={selectedAccount} onChange={handleSelectAccount} />}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <MobilePullToRefresh
        onRefresh={async () => {
          await Promise.all([fetchEmails(), fetchInvoices(), fetchSyncStatus()]);
          window.dispatchEvent(new Event("sinergia:sound-success"));
        }}
        disabled={syncing}
      >
      <main
        key={activeTab}
        className="tab-panel flex-1 space-y-3 lg:space-y-6 min-w-0 px-3 pb-24 pt-3 lg:px-0 lg:pt-0 lg:pb-0">
        {/* Proactive Agent Briefing */}
        {activeTab === "overview" && (
          <AgentBriefing onNavigate={(tab) => setActiveTab(tab as Tab)} selectedAccount={selectedAccount} />
        )}

        {/* Atajos móvil: Calendario · Drive · Importar · IA (sólo Inicio) */}
        {activeTab === "overview" && (
          <MobileQuickActions
            onCalendar={() => setQuickPanel("calendar")}
            onDrive={() => setQuickPanel("drive")}
            onImport={() => setQuickPanel("import")}
            onAgent={() => setFloatingAgentOpen(true)}
          />
        )}

        {/* Header — desktop */}
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-shimmer">{TAB_TITLES[activeTab]}</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">Somos Sinergia — orihuela@somossinergia.es</p>
          </div>
          {activeTab === "emails" && (
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
                  <option key={c.category} value={c.category || ""}>{c.category} ({c.count})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Mobile search — only on emails tab */}
        {activeTab === "emails" && (
          <div className="lg:hidden flex flex-col gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input type="text" placeholder="Buscar emails..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-3 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] w-full" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="py-3 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] w-full">
              <option value="">Todas las categorías</option>
              {emailData?.stats.byCategory.map((c) => (
                <option key={c.category} value={c.category || ""}>{c.category} ({c.count})</option>
              ))}
            </select>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB CONTENT                                                     */}
        {/* ════════════════════════════════════════════════════════════════ */}

        {/* 0. MI AGENDA HOY — visible inmediatamente al abrir */}
        {activeTab === "overview" && (
          <TodayWidget onNavigate={(tab) => setActiveTab(tab as Tab)} />
        )}

        {/* 1. HUD RESUMEN (overview + analytics merged) */}
        {activeTab === "overview" && (
          <SubTabs tabs={[
            { id: "hud", label: "Hoy", icon: <BarChart3 className="w-4 h-4" /> },
            { id: "analytics", label: "Analíticas", icon: <TrendingUp className="w-4 h-4" /> },
          ]}>
            {(sub) => (
              <>
                {sub === "hud" && (
                  <HudDashboard />
                )}
                {sub === "analytics" && (
                  <div className="space-y-6">
                    <CategoryChart byCategory={emailData?.stats.byCategory || []} byMonth={invoiceData?.totals.byMonth} />
                    <div className="glass-card p-6">
                      <h3 className="text-sm font-semibold mb-4">Distribución por Prioridad</h3>
                      <div className="grid grid-cols-3 gap-4">
                        {(emailData?.stats.byPriority || []).map((p) => (
                          <div key={p.priority} className={`p-4 rounded-xl ${
                            p.priority === "ALTA" ? "bg-red-500/10 border border-red-500/20"
                            : p.priority === "MEDIA" ? "bg-yellow-500/10 border border-yellow-500/20"
                            : "bg-green-500/10 border border-green-500/20"
                          }`}>
                            <div className="stat-number text-2xl">{p.count}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-1">
                              {p.priority ? `Prioridad ${p.priority}` : "Sin prioridad"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {invoiceData && (
                      <div className="glass-card p-6">
                        <h3 className="text-sm font-semibold mb-4">Gasto por Categoría</h3>
                        <div className="space-y-3">
                          {invoiceData.totals.byCategory.sort((a, b) => b.totalAmount - a.totalAmount).map((cat) => {
                            const pct = (cat.totalAmount / (invoiceData.totals.grandTotal.totalAmount || 1)) * 100;
                            return (
                              <div key={cat.category}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>{cat.category}</span>
                                  <span className="text-[var(--text-secondary)]">
                                    {cat.totalAmount.toLocaleString("es-ES", { minimumFractionDigits: 2 })} € ({cat.count} fact.)
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-[var(--bg-card)] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-sinergia-500 to-purple-500 transition-all"
                                    style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </SubTabs>
        )}

        {/* 2. EMAILS (inbox + kanban + compose) */}
        {activeTab === "emails" && (
          <SubTabs tabs={[
            { id: "inbox", label: "Bandeja", icon: <Mail className="w-4 h-4" /> },
            { id: "kanban", label: "Kanban", icon: <Columns3 className="w-4 h-4" /> },
            { id: "compose", label: "Redactar", icon: <PenTool className="w-4 h-4" /> },
          ]}>
            {(sub) => (
              <>
                {sub === "inbox" && <EmailList emails={emailData?.emails || []} onCreateDraft={handleCreateDraft} />}
                {sub === "kanban" && <KanbanPanel />}
                {sub === "compose" && <ComposePanel />}
              </>
            )}
          </SubTabs>
        )}

        {/* 3. CAMPAÑAS (automatización + outreach) */}
        {activeTab === "campanas" && (
          <SubTabs tabs={[
            { id: "batch", label: "Automatización", icon: <Zap className="w-4 h-4" /> },
            { id: "templates", label: "Templates", icon: <FileTemplate className="w-4 h-4" /> },
            { id: "rules", label: "Reglas", icon: <Filter className="w-4 h-4" /> },
            { id: "sequences", label: "Secuencias", icon: <Send className="w-4 h-4" /> },
            { id: "omnicanal", label: "Mensajes", icon: <MessageCircle className="w-4 h-4" /> },
            { id: "wordpress", label: "WordPress", icon: <Globe className="w-4 h-4" /> },
            { id: "campaigns", label: "Dashboard", icon: <BarChart3 className="w-4 h-4" /> },
          ]}>
            {(sub) => (
              <>
                {sub === "batch" && <AutomatizacionPanel />}
                {sub === "templates" && <TemplatesPanel />}
                {sub === "rules" && <RulesPanel />}
                {sub === "sequences" && <SequencesPanel />}
                {sub === "omnicanal" && <OutboundPanel />}
                {sub === "wordpress" && <WordPressPanel />}
                {sub === "campaigns" && <CampaignPanel />}
              </>
            )}
          </SubTabs>
        )}

        {/* 5. CRM — refactor 2026-04-28: 8 sub-tabs en 3 secciones (era 12 en 4).
            - Energía movida de Especializado → Negocio (es vertical de servicios normal)
            - Visitas eliminada (las visitas son actividades; usa Actividad)
            - Operativa eliminada (era duplicado de Commercial Ops; merge con Actividad)
            - Scoring eliminado como sub-tab (vive en CrmCompanyDetailPanel por empresa) */}
        {activeTab === "crm" && (
          <SectionNav sections={[
            { title: "Día a día", defaultOpen: true, items: [
              { id: "agenda", label: "Agenda", icon: <Calendar className="w-4 h-4" /> },
              { id: "tareas", label: "Tareas", icon: <CheckSquare className="w-4 h-4" /> },
              { id: "alertas", label: "Alertas", icon: <Bell className="w-4 h-4" /> },
            ]},
            { title: "Negocio", items: [
              { id: "empresas", label: "Empresas", icon: <Building2 className="w-4 h-4" /> },
              { id: "contactos", label: "Contactos", icon: <Users className="w-4 h-4" /> },
              { id: "oportunidades", label: "Oportunidades", icon: <Target className="w-4 h-4" /> },
              { id: "energia", label: "Energía", icon: <Zap className="w-4 h-4" /> },
            ]},
            { title: "Análisis", items: [
              { id: "direccion", label: "Resumen", icon: <BarChart3 className="w-4 h-4" /> },
              { id: "actividad", label: "Actividad", icon: <Activity className="w-4 h-4" /> },
            ]},
          ]}>
            {(sub) => (
              <>
                {sub === "agenda" && <CrmAgendaPanel />}
                {sub === "direccion" && <CrmExecutivePanel />}
                {sub === "alertas" && <CrmNotificationsPanel />}
                {sub === "actividad" && (
                  <div className="space-y-4">
                    <CrmActivityPanel />
                    <CrmCommercialOpsPanel />
                    <VisitsPanel />
                  </div>
                )}
                {sub === "tareas" && <CrmTasksPanel />}
                {sub === "empresas" && <CrmPanel />}
                {sub === "oportunidades" && <CrmOpportunitiesPanel />}
                {sub === "energia" && <BillParserPanel />}
                {sub === "contactos" && <ContactosPanel selectedAccount={selectedAccount} />}
              </>
            )}
          </SectionNav>
        )}

        {/* 5. FINANZAS (facturas + alertas + forecast + informes — energía movida a CRM) */}
        {activeTab === "finanzas" && (
          <SubTabs tabs={[
            { id: "recibidas", label: "Facturas", icon: <FileText className="w-4 h-4" /> },
            { id: "emitidas", label: "Facturar", icon: <Receipt className="w-4 h-4" /> },
            { id: "alertas", label: "Alertas & IVA", icon: <Bell className="w-4 h-4" /> },
            { id: "forecast", label: "Tesorería", icon: <Wallet className="w-4 h-4" /> },
            { id: "informes", label: "Informes", icon: <FileSpreadsheet className="w-4 h-4" /> },
          ]}>
            {(sub) => (
              <>
                {sub === "recibidas" && invoiceData && (
                  <InvoicePanel invoices={invoiceData.invoices} totals={invoiceData.totals}
                    onDownloadZip={handleDownloadZip} onChanged={fetchInvoices} />
                )}
                {sub === "emitidas" && <FacturarPanel />}
                {sub === "alertas" && <AlertasPanel selectedAccount={selectedAccount} />}
                {sub === "forecast" && <ForecastPanel />}
                {sub === "informes" && <InformesPanel selectedAccount={selectedAccount} />}
              </>
            )}
          </SubTabs>
        )}

        {/* 6. AJUSTES — refactor 2026-04-28: solo configuración real.
            Calendario/Drive/Importar → atajos en Inicio (Fase 2)
            WordPress → Campañas
            Tareas (Google) → eliminado, usa CRM > Tareas
            Conocimiento → eliminado del sub-tab (lo usa el chat IA internamente)
            Base Operativa → fundido con Operaciones
            Oficina IA → mini-widget en Inicio + acceso completo aquí */}
        {activeTab === "config" && (
          <SectionNav sections={[
            { title: "Cuenta", defaultOpen: true, items: [
              { id: "integraciones", label: "Conexiones", icon: <Plug className="w-4 h-4" /> },
              { id: "signature", label: "Firma", icon: <Pen className="w-4 h-4" /> },
              { id: "rgpd", label: "RGPD", icon: <Shield className="w-4 h-4" /> },
            ]},
            { title: "Sistema", items: [
              { id: "agent-config", label: "Agente IA", icon: <Sliders className="w-4 h-4" /> },
              { id: "monitor-ia", label: "Oficina IA", icon: <Cpu className="w-4 h-4" /> },
              { id: "memoria", label: "Memoria", icon: <Brain className="w-4 h-4" /> },
              { id: "entrenar", label: "Fine-tuning", icon: <LayoutGrid className="w-4 h-4" /> },
              { id: "operaciones", label: "Operaciones", icon: <Briefcase className="w-4 h-4" /> },
            ]},
          ]}>
            {(sub) => (
              <>
                {sub === "integraciones" && <IntegracionesPanel />}
                {sub === "signature" && <SignaturePanel />}
                {sub === "rgpd" && <RGPDPanel />}
                {sub === "agent-config" && <AgentConfigPanel />}
                {sub === "monitor-ia" && (
                  <div className="space-y-4">
                    <AgentOfficeMap />
                    <WordPressLivePanel />
                  </div>
                )}
                {sub === "memoria" && <MemoriaPanel selectedAccount={selectedAccount} />}
                {sub === "entrenar" && <FineTuningPanel />}
                {sub === "operaciones" && (
                  <div className="space-y-4">
                    <OperationsPanel />
                    <OpsConfigPanel />
                  </div>
                )}
              </>
            )}
          </SectionNav>
        )}
      </main>
      </MobilePullToRefresh>

      {/* Global overlays */}
      <Toaster position="top-right" theme="dark" toastOptions={{
        style: { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" },
      }} />
      <CommandPalette onNavigate={setActiveTab} onSync={handleSync} />
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        notifCounts={notifCounts}
      />
      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <UniversalSearch open={universalSearchOpen} onClose={() => setUniversalSearchOpen(false)} onNavigate={setActiveTab} />
      <FloatingAgent open={floatingAgentOpen} onOpen={() => setFloatingAgentOpen(true)} onClose={() => setFloatingAgentOpen(false)} />
      <QuickActionFab />
      <MobileChatFab onClick={() => setFloatingAgentOpen(true)} />
      <MobileFinanzasFab visible={activeTab === "finanzas"} />

      {/* Atajos de Inicio que abren panel completo en modal full-screen */}
      <MobileQuickPanel
        open={quickPanel === "calendar"}
        onClose={() => setQuickPanel(null)}
        title="Calendario"
      >
        <CalendarPanel />
      </MobileQuickPanel>
      <MobileQuickPanel
        open={quickPanel === "drive"}
        onClose={() => setQuickPanel(null)}
        title="Drive"
      >
        <DrivePanel />
      </MobileQuickPanel>
      <MobileQuickPanel
        open={quickPanel === "import"}
        onClose={() => setQuickPanel(null)}
        title="Importar datos"
      >
        <ImportPanel />
      </MobileQuickPanel>
      <GlobalDropZone onFileDrop={(file) => {
        setFloatingAgentOpen(true);
        setTimeout(() => { window.dispatchEvent(new CustomEvent("sinergia:file", { detail: file })); }, 100);
      }} />
      <InboxZero open={inboxZeroOpen} onClose={() => setInboxZeroOpen(false)}
        onDone={() => { setInboxZeroOpen(false); fetchEmails(); }} />
    </div>
    </MobileSwipeTabs>
  );
}
