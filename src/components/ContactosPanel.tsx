"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Search, RefreshCw, Loader2, Mail, Building2, Trash2 } from "lucide-react";

interface Contact {
  id: number;
  email: string;
  name: string | null;
  company: string | null;
  category: string | null;
  emailCount: number;
  lastEmailDate: string | null;
  totalInvoiced: string | number | null;
}

interface ContactsResponse {
  contacts: Contact[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: { byCategory: Array<{ category: string | null; count: number }> };
}

const CATEGORY_COLORS: Record<string, string> = {
  CLIENTE: "text-green-400 bg-green-500/10",
  PROVEEDOR: "text-blue-400 bg-blue-500/10",
  FACTURA: "text-yellow-400 bg-yellow-500/10",
  LEGAL: "text-purple-400 bg-purple-500/10",
  RRHH: "text-pink-400 bg-pink-500/10",
  OTRO: "text-gray-400 bg-gray-500/10",
};

export default function ContactosPanel() {
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", sort: "emailCount", order: "desc" });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await fetch(`/api/agent/contacts?${params}`);
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, categoryFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleExtract = async () => {
    setExtracting(true); setExtractResult(null);
    try {
      const res = await fetch("/api/agent/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      setExtractResult(`${data.created || 0} nuevos, ${data.updated || 0} actualizados, ${data.total || 0} total`);
      await fetchContacts();
    } catch { setExtractResult("Error"); }
    finally { setExtracting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este contacto?")) return;
    await fetch(`/api/agent/contacts?id=${id}`, { method: "DELETE" });
    await fetchContacts();
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-lime-500/10 flex items-center justify-center text-lime-400 mb-2">
            <Users className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">{data?.pagination.total || 0}</div>
          <div className="text-xs text-[var(--text-secondary)]">Contactos totales</div>
        </div>
        {(data?.stats.byCategory || []).slice(0, 3).map((s) => (
          <div key={s.category} className="glass-card p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${CATEGORY_COLORS[s.category || "OTRO"] || CATEGORY_COLORS.OTRO}`}>
              <Building2 className="w-5 h-5" />
            </div>
            <div className="stat-number text-xl mb-1">{s.count}</div>
            <div className="text-xs text-[var(--text-secondary)]">{s.category || "OTRO"}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="glass-card p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email o empresa..."
            className="pl-9 pr-3 py-2 w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-lime-500 transition"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="py-2 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-lime-500 transition"
        >
          <option value="">Todas</option>
          {(data?.stats.byCategory || []).map((s) => (
            <option key={s.category} value={s.category || ""}>
              {s.category} ({s.count})
            </option>
          ))}
        </select>
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="px-4 py-2 rounded-lg bg-lime-500/10 text-lime-400 text-sm font-medium hover:bg-lime-500/20 transition disabled:opacity-50 flex items-center gap-2"
        >
          {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {extracting ? "Extrayendo..." : "Re-extraer desde emails"}
        </button>
      </div>

      {extractResult && <div className="text-xs text-lime-400">{extractResult}</div>}

      {/* Contacts list */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-lime-400" /></div>
        ) : !data || data.contacts.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-xs">No hay contactos. Haz clic en "Re-extraer desde emails"</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {data.contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-4 hover:bg-[var(--bg-card-hover)] transition group">
                <div className="w-10 h-10 rounded-full bg-lime-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-lime-400">
                    {(c.name || c.email || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{c.name || c.email}</span>
                    {c.category && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${CATEGORY_COLORS[c.category] || CATEGORY_COLORS.OTRO}`}>
                        {c.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-0.5">
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3" /> {c.email}
                    </span>
                    {c.company && <span className="truncate">· {c.company}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-mono">{c.emailCount} emails</div>
                  {c.totalInvoiced && Number(c.totalInvoiced) > 0 && (
                    <div className="text-[10px] text-lime-400">{fmt(Number(c.totalInvoiced))} €</div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 transition p-2 hover:bg-red-500/10 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
