"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calculator,
  TrendingDown,
  Loader2,
  AlertCircle,
  Zap,
} from "lucide-react";

interface ProviderComparison {
  provider: string;
  annualCost: number;
  savingsVsCurrent: number;
}

interface SavingsResult {
  currentAnnualCost: number;
  bestAlternativeCost: number;
  annualSavings: number;
  savingsPercent: number;
  bestProvider: string;
  providers: ProviderComparison[];
  recommendations: string[];
}

interface CrmSavingsCalculatorProps {
  companyId?: number;
  onClose?: () => void;
}

const TARIFF_OPTIONS = ["2.0TD", "3.0TD", "6.1TD", "6.2TD", "6.3TD", "6.4TD"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export default function CrmSavingsCalculator({
  companyId,
  onClose,
}: CrmSavingsCalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SavingsResult | null>(null);

  // Manual form fields
  const [currentRetailer, setCurrentRetailer] = useState("");
  const [currentAnnualCost, setCurrentAnnualCost] = useState<number | "">("");
  const [monthlyConsumptionKWh, setMonthlyConsumptionKWh] = useState<number | "">("");
  const [contractedPowerKW, setContractedPowerKW] = useState<number | "">("");
  const [tariff, setTariff] = useState("2.0TD");

  const fetchSavings = useCallback(
    async (body: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/crm/energy-bills/savings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Error al calcular el ahorro.");
        }
        const data: SavingsResult = await res.json();
        setResult(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error al calcular el ahorro.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-fetch when companyId is provided
  useEffect(() => {
    if (companyId) {
      fetchSavings({ companyId });
    }
  }, [companyId, fetchSavings]);

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const body: Record<string, unknown> = {
        currentRetailer,
        currentAnnualCost: Number(currentAnnualCost),
        monthlyConsumptionKWh: Number(monthlyConsumptionKWh),
        contractedPowerKW: Number(contractedPowerKW),
        tariff,
      };
      if (companyId) body.companyId = companyId;
      fetchSavings(body);
    },
    [currentRetailer, currentAnnualCost, monthlyConsumptionKWh, contractedPowerKW, tariff, companyId, fetchSavings]
  );

  const glassCard: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 24,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
    display: "block",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Calculator size={22} style={{ color: "var(--accent)" }} />
          <h2 style={{ color: "var(--text-primary)", margin: 0, fontSize: 20, fontWeight: 700 }}>
            Calculadora de Ahorro Energetico
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 20,
              padding: 4,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Manual input form */}
      <form onSubmit={handleManualSubmit} style={glassCard}>
        <h3
          style={{
            color: "var(--text-primary)",
            fontSize: 14,
            fontWeight: 600,
            marginTop: 0,
            marginBottom: 16,
          }}
        >
          Datos de consumo
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          <div>
            <label style={labelStyle}>Comercializadora actual</label>
            <input
              type="text"
              value={currentRetailer}
              onChange={(e) => setCurrentRetailer(e.target.value)}
              placeholder="Ej. Iberdrola"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Coste anual actual (EUR)</label>
            <input
              type="number"
              value={currentAnnualCost}
              onChange={(e) =>
                setCurrentAnnualCost(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="12000"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Consumo mensual (kWh)</label>
            <input
              type="number"
              value={monthlyConsumptionKWh}
              onChange={(e) =>
                setMonthlyConsumptionKWh(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="5000"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Potencia contratada (kW)</label>
            <input
              type="number"
              value={contractedPowerKW}
              onChange={(e) =>
                setContractedPowerKW(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="50"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Tarifa</label>
            <select
              value={tariff}
              onChange={(e) => setTariff(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {TARIFF_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 20px",
                background: "var(--accent)",
                color: "#000",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
                width: "100%",
                justifyContent: "center",
              }}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Calculator size={14} />
              )}
              Calcular
            </button>
          </div>
        </div>
      </form>

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

      {/* Loading */}
      {loading && !result && (
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

      {/* Results */}
      {result && (
        <>
          {/* Highlight cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div style={{ ...glassCard, padding: 20, textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 6 }}>
                Coste actual anual
              </div>
              <div style={{ color: "var(--text-primary)", fontSize: 26, fontWeight: 700 }}>
                {formatCurrency(result.currentAnnualCost)}
              </div>
            </div>
            <div style={{ ...glassCard, padding: 20, textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 6 }}>
                Mejor alternativa
              </div>
              <div style={{ color: "var(--accent)", fontSize: 26, fontWeight: 700 }}>
                {formatCurrency(result.bestAlternativeCost)}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
                {result.bestProvider}
              </div>
            </div>
            <div
              style={{
                ...glassCard,
                padding: 20,
                textAlign: "center",
                borderColor: "rgba(34,197,94,0.3)",
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 6 }}>
                Ahorro estimado
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <TrendingDown size={20} style={{ color: "#22c55e" }} />
                <span style={{ color: "#22c55e", fontSize: 26, fontWeight: 700 }}>
                  {formatCurrency(result.annualSavings)}
                </span>
              </div>
              <div style={{ color: "#22c55e", fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                {result.savingsPercent}% de ahorro
              </div>
            </div>
          </div>

          {/* Comparison table */}
          {result.providers && result.providers.length > 0 && (
            <div style={{ ...glassCard, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <h3
                  style={{
                    color: "var(--text-primary)",
                    fontSize: 14,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  Comparativa de proveedores
                </h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Proveedor", "Coste anual", "Ahorro vs actual"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
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
                  {result.providers
                    .sort((a, b) => a.annualCost - b.annualCost)
                    .map((p) => (
                      <tr key={p.provider} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td
                          style={{
                            padding: "10px 16px",
                            color:
                              p.provider === result.bestProvider
                                ? "var(--accent)"
                                : "var(--text-primary)",
                            fontWeight: p.provider === result.bestProvider ? 600 : 400,
                          }}
                        >
                          {p.provider}
                          {p.provider === result.bestProvider && (
                            <span
                              style={{
                                marginLeft: 8,
                                background: "rgba(6,182,212,0.15)",
                                color: "var(--accent)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                            >
                              MEJOR
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", color: "var(--text-primary)" }}>
                          {formatCurrency(p.annualCost)}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            color: p.savingsVsCurrent > 0 ? "#22c55e" : "var(--text-muted)",
                            fontWeight: 600,
                          }}
                        >
                          {p.savingsVsCurrent > 0
                            ? `- ${formatCurrency(p.savingsVsCurrent)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div style={glassCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Zap size={16} style={{ color: "var(--accent)" }} />
                <h3
                  style={{
                    color: "var(--text-primary)",
                    fontSize: 14,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  Recomendaciones
                </h3>
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  lineHeight: 1.8,
                }}
              >
                {result.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
