"use client";

import { useEffect, useState } from "react";
import { Mail, Check, ChevronDown } from "lucide-react";

export interface AccountOption {
  id: number;
  email: string;
  displayName: string | null;
  isPrimary: boolean;
  enabled: boolean;
}

interface Props {
  selected: number | "all";
  onChange: (accountId: number | "all") => void;
}

/**
 * Selector de cuenta Gmail para filtrar emails y facturas en todo el
 * dashboard. Si sólo hay una cuenta, no renderiza nada (evita ruido).
 */
export default function AccountSelector({ selected, onChange }: Props) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/email-accounts")
      .then((r) => r.json())
      .then((d) => setAccounts((d.accounts || []).filter((a: AccountOption) => a.enabled)))
      .catch(() => setAccounts([]));
  }, []);

  // Menos de 2 cuentas: no merece la pena mostrar el selector
  if (accounts.length < 2) return null;

  const active = accounts.find((a) => a.id === selected);
  const label = selected === "all" ? "Todas las cuentas" : active?.email || "Cuenta…";

  return (
    <div className="relative px-2 mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-xs font-medium transition min-h-[40px]"
        aria-label="Filtrar por cuenta"
        aria-expanded={open}
      >
        <Mail className="w-4 h-4 text-sinergia-400 flex-shrink-0" />
        <span className="truncate flex-1 text-left">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-2 right-2 mt-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] shadow-xl z-40 overflow-hidden">
            <button
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-[var(--bg-card-hover)] text-left"
            >
              <span className="flex-1">Todas las cuentas</span>
              {selected === "all" && <Check className="w-3.5 h-3.5 text-sinergia-400" />}
            </button>
            <div className="h-px bg-[var(--border)]" />
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-[var(--bg-card-hover)] text-left"
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{a.email}</span>
                  {a.isPrimary && (
                    <span className="text-[9px] text-[var(--text-secondary)]">Principal</span>
                  )}
                </span>
                {selected === a.id && <Check className="w-3.5 h-3.5 text-sinergia-400" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
