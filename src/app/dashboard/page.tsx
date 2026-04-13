"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import StatsCards from "@/components/StatsCards";
import EmailList from "@/components/EmailList";
import InvoicePanel from "@/components/InvoicePanel";
import CategoryChart from "@/components/CategoryChart";
import AgentPanel from "@/components/AgentPanel";
import { Search, Filter, RefreshCw } from "lucide-react";

type Tab = "overview" | "emails" | "invoices" | "analytics" | "agent";

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

  // Redirect if not authenticated
  if (status === "unauthenticated") {
    redirect("/login");
  }

  // Theme toggle
  const toggleTheme = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("light");
  };

  // Fetch emails
  const fetchEmails = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        if (search) params.set("search", search);
        if (categoryFilter) params.set("category", categoryFilter);
        const res = await fetch(`/api/emails?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEmailData(data);
        }
      } catch (e) {
        console.error("Error fetching emails:", e);
      }
    },
    [search, categoryFilter]
  );

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoiceData(data);
      }
    } catch (e) {
      console.error("Error fetching invoices:", e);
    }
  }, []);

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
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "newer_than:30d", maxResults: 200 }),
      });
      const result = await res.json();
      if (result.success) {
        // Refresh data
        await Promise.all([fetchEmails(), fetchInvoices(), fetchSyncStatus()]);
      }
    } catch (e) {
      console.error("Sync error:", e);
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
    <div className="flex gap-4 p-4 min-h-screen max-w-[1600px] mx-auto">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSync={handleSync}
        syncing={syncing}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
        userName={session?.user?.name}
        userImage={session?.user?.image}
      />

      {/* Main content */}
      <main className="flex-1 space-y-6 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {activeTab === "overview" && "Resumen General"}
              {activeTab === "emails" && "Bandeja de Entrada"}
              {activeTab === "invoices" && "Gestor de Facturas"}
              {activeTab === "analytics" && "Analíticas"}
              {activeTab === "agent" && "Agente IA — Gemini"}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Somos Sinergia — orihuela@somossinergia.es
            </p>
          </div>

          {/* Search (for emails tab) */}
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

        {/* Tab content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <StatsCards
              totalEmails={totalEmails}
              totalInvoices={totalInvoices}
              highPriority={highPriority}
              totalSpend={totalSpend}
              lastSync={syncStatus?.lastSyncAt || null}
              unread={unread}
            />
            <CategoryChart
              byCategory={emailData?.stats.byCategory || []}
              byMonth={invoiceData?.totals.byMonth}
            />
            {/* Recent emails */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Emails Recientes</h3>
              <EmailList
                emails={(emailData?.emails || []).slice(0, 10)}
                onCreateDraft={handleCreateDraft}
              />
            </div>
          </div>
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
          />
        )}

        {activeTab === "agent" && <AgentPanel />}

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
                      Prioridad {p.priority}
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
    </div>
  );
}
