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
} from "lucide-react";

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

  // New company form
  const [formName, setFormName] = useState("");
  const [formNif, setFormNif] = useState("");
  const [formSector, setFormSector] = useState("");
  const [formProvince, setFormProvince] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      });
      if (search) params.set("search", search);
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
  }, [search, offset]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Reset offset when search changes
  useEffect(() => {
    setOffset(0);
  }, [search]);

  const handleSubmit = useCallback(async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const body: Record<string, string> = { name: formName.trim() };
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
          <p className="text-xs text-[var(--text-secondary)]">Total empresas</p>
          <p className="text-lg font-semibold text-[var(--text-primary)]">{total}</p>
        </div>
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
          {showForm ? "Cancelar" : "Nueva Empresa"}
        </button>
      </div>

      {/* Inline creation form */}
      {showForm && (
        <div className="glass-card p-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">Nueva Empresa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Nombre *"
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
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-2 px-4 py-2 border-b border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          <span>Nombre</span>
          <span>NIF</span>
          <span>Sector</span>
          <span>Provincia</span>
          <span>Origen</span>
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
              <p className="text-sm text-[var(--text-secondary)]">No hay empresas todavía</p>
            </div>
          ) : (
            companies.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCompany(c.id)}
                className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-2 px-4 py-3 text-left text-sm hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--border)] last:border-b-0"
              >
                <span className="text-[var(--text-primary)] font-medium truncate">{c.name}</span>
                <span className="text-[var(--text-secondary)] truncate">{c.nif ?? "—"}</span>
                <span className="text-[var(--text-secondary)] truncate">{c.sector ?? "—"}</span>
                <span className="text-[var(--text-secondary)] truncate">{c.province ?? "—"}</span>
                <span className="text-[var(--text-secondary)] truncate">{c.source ?? "—"}</span>
                <span className="text-[var(--text-secondary)]">{formatDate(c.createdAt)}</span>
              </button>
            ))
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
