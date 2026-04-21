"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap,
  FileText,
  Upload,
  Calculator,
  TrendingDown,
  Loader2,
  AlertCircle,
  Download,
} from "lucide-react";

interface EnergyBill {
  id: number;
  supplyPointId: number;
  documentId: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  retailer: string | null;
  totalAmountEur: number | null;
  energyAmountEur: number | null;
  powerAmountEur: number | null;
  taxAmountEur: number | null;
  confidenceScore: number | null;
  consumptionKwh: Record<string, number> | null;
  cups: string | null;
  createdAt: string;
}

interface SavingsResult {
  currentProvider: string;
  currentAnnualCost: number;
  bestAlternative: { provider: string; tariffName: string; type: string; estimatedAnnualCost: number };
  potentialSavingsEur: number;
  potentialSavingsPct: number;
  allComparisons: Array<{ provider: string; tariffName: string; estimatedAnnualCost: number; savingsVsCurrent: number }>;
  recommendations: string[];
}

interface CrmEnergyBillsPanelProps {
  companyId: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export default function CrmEnergyBillsPanel({ companyId }: CrmEnergyBillsPanelProps) {
  const [bills, setBills] = useState<EnergyBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [calculatingSavings, setCalculatingSavings] = useState(false);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [savingsResult, setSavingsResult] = useState<SavingsResult | null>(null);
  const [showSavings, setShowSavings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/energy-bills?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills ?? []);
      } else {
        setError("Error al cargar las facturas.");
      }
    } catch (e) {
      console.error("Error fetching bills:", e);
      setError("Error de conexión al cargar las facturas.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // Stats computed from bills
  const stats = (() => {
    if (bills.length === 0) return null;
    const totalCost = bills.reduce((sum, b) => sum + (b.totalAmountEur ?? 0), 0);
    const avgMonthlyCost = totalCost / bills.length;
    const latestBill = bills.reduce((latest, b) => {
      const bDate = b.billingPeriodEnd ? new Date(b.billingPeriodEnd) : new Date(0);
      const lDate = latest.billingPeriodEnd ? new Date(latest.billingPeriodEnd) : new Date(0);
      return bDate > lDate ? b : latest;
    });
    return {
      totalBills: bills.length,
      totalCost,
      avgMonthlyCost,
      latestDate: latestBill.billingPeriodEnd,
    };
  })();

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", String(companyId));
      const res = await fetch("/api/crm/energy-bills/parse", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al procesar la factura.");
      }
      await fetchBills();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al subir la factura.";
      setError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [companyId, fetchBills]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleCalculateSavings = useCallback(async () => {
    setCalculatingSavings(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/energy-bills/savings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) throw new Error("Error al calcular el ahorro.");
      const data: SavingsResult = await res.json();
      setSavingsResult(data);
      setShowSavings(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al calcular el ahorro.";
      setError(msg);
    } finally {
      setCalculatingSavings(false);
    }
  }, [companyId]);

  const handleGenerateProposal = useCallback(async () => {
    setGeneratingProposal(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/energy-bills/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) throw new Error("Error al generar la propuesta.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `propuesta-energia-${companyId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al generar la propuesta.";
      setError(msg);
    } finally {
      setGeneratingProposal(false);
    }
  }, [companyId]);

  const confidenceBadge = (confidence: number) => {
    let bg: string;
    let color: string;
    if (confidence >= 75) {
      bg = "rgba(34,197,94,0.15)";
      color = "#22c55e";
    } else if (confidence >= 50) {
      bg = "rgba(245,158,11,0.15)";
      color = "#f59e0b";
    } else {
      bg = "rgba(239,68,68,0.15)";
      color = "#ef4444";
    }
    return (
      <span
        style={{
          background: bg,
          color,
          padding: "2px 8px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {confidence}%
      </span>
    );
  };

  const glassCard: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 24,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Zap size={22} style={{ color: "var(--accent)" }} />
          <h2 style={{ color: "var(--text-primary)", margin: 0, fontSize: 20, fontWeight: 700 }}>
            Facturas Energeticas
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "var(--accent)",
              color: "#000",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: uploading ? "wait" : "pointer",
              opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Subir factura
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <button
            onClick={handleCalculateSavings}
            disabled={calculatingSavings || bills.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "transparent",
              color: "var(--accent)",
              border: "1px solid var(--accent)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: calculatingSavings || bills.length === 0 ? "not-allowed" : "pointer",
              opacity: calculatingSavings || bills.length === 0 ? 0.5 : 1,
            }}
          >
            {calculatingSavings ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Calculator size={14} />
            )}
            Calcular ahorro
          </button>
          <button
            onClick={handleGenerateProposal}
            disabled={generatingProposal || bills.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: generatingProposal || bills.length === 0 ? "not-allowed" : "pointer",
              opacity: generatingProposal || bills.length === 0 ? 0.5 : 1,
            }}
          >
            {generatingProposal ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileText size={14} />
            )}
            Generar propuesta
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            ...glassCard,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 14,
            borderColor: "rgba(239,68,68,0.4)",
          }}
        >
          <AlertCircle size={16} style={{ color: "#ef4444" }} />
          <span style={{ color: "#ef4444", fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Total facturas", value: String(stats.totalBills) },
            { label: "Coste total", value: formatCurrency(stats.totalCost) },
            { label: "Coste medio mensual", value: formatCurrency(stats.avgMonthlyCost) },
            { label: "Ultima factura", value: formatDate(stats.latestDate) },
          ].map((s) => (
            <div key={s.label} style={{ ...glassCard, padding: 16, textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          style={{
            ...glassCard,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 48,
          }}
        >
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && bills.length === 0 && (
        <div
          style={{
            ...glassCard,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: 48,
          }}
        >
          <Zap size={36} style={{ color: "var(--text-muted)" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
            No hay facturas energeticas. Sube una factura PDF para comenzar.
          </p>
        </div>
      )}

      {/* Bills table */}
      {!loading && bills.length > 0 && (
        <div style={{ ...glassCard, padding: 0, overflow: "hidden" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {["Periodo", "Comercializadora", "Total", "Confianza", "CUPS"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr
                  key={bill.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <td style={{ padding: "10px 16px", color: "var(--text-primary)" }}>
                    {formatDate(bill.billingPeriodStart)} — {formatDate(bill.billingPeriodEnd)}
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>
                    {bill.retailer ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px 16px",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                    }}
                  >
                    {bill.totalAmountEur != null ? formatCurrency(bill.totalAmountEur) : "—"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>{confidenceBadge(bill.confidenceScore ?? 0)}</td>
                  <td
                    style={{
                      padding: "10px 16px",
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    {bill.cups}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Savings inline section */}
      {showSavings && savingsResult && (
        <div style={{ ...glassCard, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingDown size={18} style={{ color: "#22c55e" }} />
              <h3
                style={{ color: "var(--text-primary)", margin: 0, fontSize: 16, fontWeight: 700 }}
              >
                Resultado del calculo de ahorro
              </h3>
            </div>
            <button
              onClick={() => setShowSavings(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 18,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div
              style={{
                ...glassCard,
                padding: 16,
                textAlign: "center",
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>
                Coste actual anual
              </div>
              <div style={{ color: "var(--text-primary)", fontSize: 22, fontWeight: 700 }}>
                {formatCurrency(savingsResult.currentAnnualCost)}
              </div>
            </div>
            <div style={{ ...glassCard, padding: 16, textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>
                Mejor alternativa ({savingsResult.bestAlternative?.provider})
              </div>
              <div style={{ color: "var(--accent)", fontSize: 22, fontWeight: 700 }}>
                {formatCurrency(savingsResult.bestAlternative?.estimatedAnnualCost ?? 0)}
              </div>
            </div>
            <div style={{ ...glassCard, padding: 16, textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>
                Ahorro estimado
              </div>
              <div style={{ color: "#22c55e", fontSize: 22, fontWeight: 700 }}>
                {formatCurrency(savingsResult.potentialSavingsEur)} ({savingsResult.potentialSavingsPct}%)
              </div>
            </div>
          </div>

          {savingsResult.recommendations.length > 0 && (
            <div>
              <h4
                style={{
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 8,
                  marginTop: 0,
                }}
              >
                Recomendaciones
              </h4>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                {savingsResult.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
