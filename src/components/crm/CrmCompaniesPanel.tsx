"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Search,
  Loader2,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Briefcase,
} from "lucide-react";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

type ClientType = "all" | "particular" | "autonomo" | "empresa";

interface Company {
  id: number;
  name: string;
  legalName: string | null;
  nif: string | null;
  sector: string | null;
  province: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  clientType: string | null;
  createdAt: string;
}

interface CompaniesResponse {
  companies: Company[];
  total: number;
}

interface CrmCompaniesPanelProps {
  onSelectCompany: (id: number) => void;
}

const PAGE_LIMIT = 50;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function CrmCompaniesPanel({ onSelectCompany }: CrmCompaniesPanelProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Filtro persistente por tipo de cliente (Empresa/Autónomo/Particular)
  const [clientTypeFilter, setClientTypeFilter] = useLocalStorage<ClientType>("crm-client-type-filter", "all");

  // New company form
  const [formName, setFormName] = useState("");
  const [formNif, setFormNif] = useState("");
  const [formSector, setFormSector] = useState("");
  const [formProvince, setFormProvince] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formClientType, setFormClientType] = useState<"empresa" | "autonomo" | "particular">("empresa");

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      });
      if (search) params.set("search", search);
      if (clientTypeFilter !== "all") params.set("clientType", clientTypeFilter);
      const res = await fetch(`/api/crm/companies?${params}`);
      if (res.ok) {
        const data: CompaniesResponse = await res.json();
        setCompanies(data.companies ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error("Error fetching companies:", e);
    } finally {
      setLoading(false);
    }
  }, [search, offset, clientTypeFilter]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Reset offset when search or filter changes
  useEffect(() => {
    setOffset(0);
  }, [search, clientTypeFilter]);

  const handleSubmit = useCallback(async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const body: Record<string, string> = { name: formName.trim(), clientType: formClientType };
      if (formNif.trim()) body.nif = formNif.trim();
      if (formSector.trim()) body.sector = formSector.trim();
      if (formProvince.trim()) body.province = formProvince.trim();
      if (formEmail.trim()) body.email = formEmail.trim();
      if (formPhone.trim()) body.phone = formPhone.trim();

      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setFormName("");
        setFormNif("");
        setFormSector("");
        setFormProvince("");
        setFormEmail("");
        setFormPhone("");
        setShowForm(false);
        setOffset(0);
        fetchCompanies();
      }
    } catch (e) {
      console.error("Error creating company:", e);
    } finally {
      setSubmitting(false);
    }
  }, [formName, formNif, formSector, formProvince, formEmail, formPhone, fetchCompanies]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Stats */}
      <div className="glass-card p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
          <Building2 className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <p className="text-xs text-[var(--text-secondary)]">
            {clientTypeFilter === "all" ? "Total cuentas" :
             clientTypeFilter === "empresa" ? "Empresas" :
             clientTypeFilter === "autonomo" ? "Autónomos" : "Particulares"}
          </p>
          <p className="text-lg font-semibold text-[var(--text-primary)]">{total}</p>
        </div>
      </div>

      {/* Filtros por tipo de cliente — chips persistentes */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: "all" as ClientType, label: "Todas", icon: <Building2 className="w-3.5 h-3.5" /> },
          { id: "empresa" as ClientType, label: "Empresas", icon: <Briefcase className="w-3.5 h-3.5" /> },
          { id: "autonomo" as ClientType, label: "Autónomos", icon: <User className="w-3.5 h-3.5" /> },
          { id: "particular" as ClientType, label: "Particulares", icon: <User className="w-3.5 h-3.5" /> },
        ]).map((chip) => {
          const active = clientTypeFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setClientTypeFilter(chip.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                active
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                  : "bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-cyan-500/30 hover:text-[var(--text-primary)]"
              }`}
            >
              {chip.icon}
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Search + New button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-cyan-500 rounded-lg"
          />
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition-colors whitespace-nowrap"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nueva cuenta"}
        </button>
      </div>

      {/* Inline creation form */}
      {showForm && (
        <div className="glass-card p-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">Nueva cuenta</p>

          {/* Selector de tipo de cliente */}
          <div className="flex items-center gap-2">
            {([
              { id: "empresa" as const, label: "Empresa", icon: <Briefcase className="w-3.5 h-3.5" /> },
              { id: "autonomo" as const, label: "Autónomo", icon: <User className="w-3.5 h-3.5" /> },
              { id: "particular" as const, label: "Particular", icon: <User className="w-3.5 h-3.5" /> },
            ]).map((opt) => {
              const active = formClientType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormClientType(opt.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                      : "bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-cyan-500/30"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder={formClientType === "particular" ? "Nombre completo *" : "Nombre *"}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-cyan-500 rounded-lg"
            />
            <input
              type="text"
              placeholder="NIF"
              value={formNif}
              onChange={(e) => setFormNif(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-cyan-500 rounded-lg"
            />
            <input
              type="text"
              placeholder="Sector"
              value={formSector}
              onChange={(e) => setFormSector(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-cyan-500 rounded-lg"
            />
            <input
              type="text"
              placeholder="Provincia"
              value={formProvince}
              onChange={(e) => setFormProvince(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-cyan-500 rounded-lg"
            />
            <input
              type="email"
              placeholder="Email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-cyan-500 rounded-lg"
            />
            <input
              type="tel"
              placeholder="Teléfono"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-cyan-500 rounded-lg"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!formName.trim() || submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear Empresa
            </button>
          </div>
        </div>
      )}

      {/* Company list */}
      <div className="glass-card flex-1 flex flex-col overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[100px_2fr_1fr_1fr_1fr_100px] gap-2 px-4 py-2 border-b border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          <span>Tipo</span>
          <span>Nombre</span>
          <span>NIF/CIF</span>
          <span>Provincia</span>
          <span>Email</span>
          <span>Fecha</span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Building2 className="w-8 h-8 text-[var(--text-secondary)] opacity-40" />
              <p className="text-sm text-[var(--text-secondary)]">
                {clientTypeFilter === "all" ? "No hay cuentas todavía" : `No hay ${clientTypeFilter === "empresa" ? "empresas" : clientTypeFilter === "autonomo" ? "autónomos" : "particulares"} todavía`}
              </p>
            </div>
          ) : (
            companies.map((c) => {
              const ct = c.clientType || "empresa";
              const badgeStyle =
                ct === "empresa" ? "bg-blue-500/15 border-blue-500/30 text-blue-300" :
                ct === "autonomo" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" :
                ct === "particular" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" :
                "bg-slate-500/15 border-slate-500/30 text-slate-300";
              const badgeLabel =
                ct === "empresa" ? "Empresa" :
                ct === "autonomo" ? "Autónomo" :
                ct === "particular" ? "Particular" :
                ct;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectCompany(c.id)}
                  className="w-full grid grid-cols-[100px_2fr_1fr_1fr_1fr_100px] gap-2 px-4 py-3 text-left text-sm hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--border)] last:border-b-0 items-center"
                >
                  <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeStyle}`}>
                    {badgeLabel}
                  </span>
                  <span className="text-[var(--text-primary)] font-medium truncate">{c.name}</span>
                  <span className="text-[var(--text-secondary)] truncate font-mono text-xs">{c.nif ?? "—"}</span>
                  <span className="text-[var(--text-secondary)] truncate">{c.province ?? "—"}</span>
                  <span className="text-[var(--text-secondary)] truncate text-xs">{c.email ?? "—"}</span>
                  <span className="text-[var(--text-secondary)] text-xs">{formatDate(c.createdAt)}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {!loading && total > PAGE_LIMIT && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--text-secondary)]">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
                disabled={offset === 0}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_LIMIT)}
                disabled={offset + PAGE_LIMIT >= total}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
