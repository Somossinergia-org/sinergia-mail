import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { fmtEur } from "@/lib/format";

export interface ProposalPdfData {
  // Company info
  companyName: string;
  companyNif: string | null;
  companyAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;

  // Current situation
  currentRetailer: string;
  currentAnnualCost: number;
  tariff: string;
  cups: string | null;
  contractedPowerKW: number;
  monthlyConsumptionKWh: number;

  // Savings analysis
  bestProvider: string;
  bestTariffName: string;
  bestTariffType: string;
  estimatedAnnualCost: number;
  potentialSavingsEur: number;
  potentialSavingsPct: number;
  recommendations: string[];

  // All comparisons (top 5)
  comparisons: Array<{
    provider: string;
    tariffName: string;
    type: string;
    estimatedAnnualCost: number;
    savingsVsCurrent: number;
  }>;

  // Generated date
  date: string;

  // Issuer
  issuer?: { name: string; nif: string; address: string; email: string; phone: string };
}

const DEFAULT_ISSUER = {
  name: "Somos Sinergia S.L.",
  nif: "B-XXXXXXXX",
  address: "Orihuela, Alicante, España",
  email: "orihuela@somossinergia.es",
  phone: "+34 XXX XXX XXX",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a2e" },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, borderBottomWidth: 2, borderBottomColor: "#338dff", paddingBottom: 12 },
  brand: { fontSize: 20, fontWeight: 700, color: "#338dff" },
  brandSub: { fontSize: 9, color: "#64748b", marginTop: 2 },
  headerRight: { textAlign: "right" },
  title: { fontSize: 13, fontWeight: 700, color: "#1a2744", marginBottom: 4 },
  dateText: { fontSize: 9, color: "#64748b" },
  // Client section
  sectionLabel: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 4 },
  clientSection: { marginBottom: 18 },
  clientName: { fontWeight: 700, fontSize: 12 },
  clientDetail: { fontSize: 9, marginTop: 1, color: "#334155" },
  // Current situation box
  situationBox: { backgroundColor: "#f0f4ff", borderWidth: 1, borderColor: "#338dff", borderRadius: 4, padding: 14, marginBottom: 18 },
  situationTitle: { fontSize: 11, fontWeight: 700, color: "#1a2744", marginBottom: 8 },
  situationRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  situationLabel: { fontSize: 9, color: "#64748b" },
  situationValue: { fontSize: 9, fontWeight: 700, color: "#1a2744" },
  // Savings highlight
  savingsBox: { backgroundColor: "#ecfdf5", borderWidth: 2, borderColor: "#16a34a", borderRadius: 6, padding: 18, marginBottom: 20, alignItems: "center" },
  savingsTitle: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1.5, color: "#16a34a", marginBottom: 6 },
  savingsAmount: { fontSize: 22, fontWeight: 700, color: "#16a34a" },
  savingsPct: { fontSize: 12, color: "#15803d", marginTop: 4 },
  savingsProvider: { fontSize: 9, color: "#64748b", marginTop: 6 },
  // Comparison table
  tableSection: { marginBottom: 18 },
  tableSectionTitle: { fontSize: 11, fontWeight: 700, color: "#1a2744", marginBottom: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1a2744", color: "#fff", padding: 8, fontWeight: 700, fontSize: 8 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", padding: 8, fontSize: 9 },
  tableRowAlt: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", padding: 8, fontSize: 9, backgroundColor: "#f8fafc" },
  tableRowBest: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#16a34a", padding: 8, fontSize: 9, backgroundColor: "#f0fdf4" },
  tableRowCurrent: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dc2626", padding: 8, fontSize: 9, backgroundColor: "#fef2f2" },
  colProvider: { flex: 2 },
  colTariff: { flex: 2 },
  colType: { flex: 1, textAlign: "center" },
  colCost: { flex: 1.5, textAlign: "right" },
  colSavings: { flex: 1.5, textAlign: "right" },
  // Recommendations
  recsSection: { marginBottom: 18 },
  recsSectionTitle: { fontSize: 11, fontWeight: 700, color: "#1a2744", marginBottom: 8 },
  recItem: { flexDirection: "row", marginBottom: 6 },
  recNumber: { fontSize: 10, fontWeight: 700, color: "#338dff", marginRight: 8, width: 18 },
  recText: { fontSize: 9, color: "#334155", flex: 1 },
  // Footer
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, textAlign: "center", color: "#64748b", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

export async function generateProposalPdf(data: ProposalPdfData): Promise<Buffer> {
  const issuer = data.issuer || DEFAULT_ISSUER;

  const doc = React.createElement(
    Document as unknown as React.ComponentType<unknown>,
    null,
    React.createElement(
      Page as unknown as React.ComponentType<{ size: string; style: object }>,
      { size: "A4", style: styles.page },

      // ── Header ──
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.brand }, "SINERGIA"),
          React.createElement(Text, { style: styles.brandSub }, issuer.name),
          React.createElement(Text, { style: styles.brandSub }, `NIF: ${issuer.nif}`),
          React.createElement(Text, { style: styles.brandSub }, issuer.address),
          React.createElement(Text, { style: styles.brandSub }, `${issuer.email}  ·  ${issuer.phone}`),
        ),
        React.createElement(
          View,
          { style: styles.headerRight },
          React.createElement(Text, { style: styles.title }, "PROPUESTA DE AHORRO ENERGÉTICO"),
          React.createElement(Text, { style: styles.dateText }, `Fecha: ${data.date}`),
        ),
      ),

      // ── Client section ──
      React.createElement(
        View,
        { style: styles.clientSection },
        React.createElement(Text, { style: styles.sectionLabel }, "Datos del cliente"),
        React.createElement(Text, { style: styles.clientName }, data.companyName),
        data.companyNif
          ? React.createElement(Text, { style: styles.clientDetail }, `NIF: ${data.companyNif}`)
          : null,
        data.companyAddress
          ? React.createElement(Text, { style: styles.clientDetail }, data.companyAddress)
          : null,
        data.contactName
          ? React.createElement(Text, { style: styles.clientDetail }, `Contacto: ${data.contactName}`)
          : null,
        data.contactEmail
          ? React.createElement(Text, { style: styles.clientDetail }, `Email: ${data.contactEmail}`)
          : null,
      ),

      // ── Current situation box ──
      React.createElement(
        View,
        { style: styles.situationBox },
        React.createElement(Text, { style: styles.situationTitle }, "SITUACIÓN ACTUAL"),
        React.createElement(
          View,
          { style: styles.situationRow },
          React.createElement(Text, { style: styles.situationLabel }, "Comercializadora actual"),
          React.createElement(Text, { style: styles.situationValue }, data.currentRetailer),
        ),
        React.createElement(
          View,
          { style: styles.situationRow },
          React.createElement(Text, { style: styles.situationLabel }, "Tarifa"),
          React.createElement(Text, { style: styles.situationValue }, data.tariff),
        ),
        data.cups
          ? React.createElement(
              View,
              { style: styles.situationRow },
              React.createElement(Text, { style: styles.situationLabel }, "CUPS"),
              React.createElement(Text, { style: styles.situationValue }, data.cups),
            )
          : null,
        React.createElement(
          View,
          { style: styles.situationRow },
          React.createElement(Text, { style: styles.situationLabel }, "Potencia contratada"),
          React.createElement(Text, { style: styles.situationValue }, `${data.contractedPowerKW} kW`),
        ),
        React.createElement(
          View,
          { style: styles.situationRow },
          React.createElement(Text, { style: styles.situationLabel }, "Consumo mensual"),
          React.createElement(Text, { style: styles.situationValue }, `${fmtEur(data.monthlyConsumptionKWh)} kWh`),
        ),
        React.createElement(
          View,
          { style: styles.situationRow },
          React.createElement(Text, { style: styles.situationLabel }, "Coste anual actual"),
          React.createElement(Text, { style: { ...styles.situationValue, color: "#dc2626" } }, `${fmtEur(data.currentAnnualCost)} €`),
        ),
      ),

      // ── Savings highlight ──
      React.createElement(
        View,
        { style: styles.savingsBox },
        React.createElement(Text, { style: styles.savingsTitle }, "AHORRO POTENCIAL"),
        React.createElement(
          Text,
          { style: styles.savingsAmount },
          `${fmtEur(data.potentialSavingsEur)} €/año`,
        ),
        React.createElement(
          Text,
          { style: styles.savingsPct },
          `${data.potentialSavingsPct.toFixed(1)}% de ahorro sobre tu coste actual`,
        ),
        React.createElement(
          Text,
          { style: styles.savingsProvider },
          `Mejor oferta: ${data.bestProvider} — ${data.bestTariffName} (${data.bestTariffType})`,
        ),
      ),

      // ── Comparison table ──
      React.createElement(
        View,
        { style: styles.tableSection },
        React.createElement(Text, { style: styles.tableSectionTitle }, "COMPARATIVA DE PROVEEDORES"),
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: styles.colProvider }, "Proveedor"),
          React.createElement(Text, { style: styles.colTariff }, "Tarifa"),
          React.createElement(Text, { style: styles.colType }, "Tipo"),
          React.createElement(Text, { style: styles.colCost }, "Coste Anual"),
          React.createElement(Text, { style: styles.colSavings }, "Ahorro"),
        ),
        // Current provider row (red highlight)
        React.createElement(
          View,
          { style: styles.tableRowCurrent },
          React.createElement(Text, { style: styles.colProvider }, data.currentRetailer),
          React.createElement(Text, { style: styles.colTariff }, data.tariff),
          React.createElement(Text, { style: styles.colType }, "Actual"),
          React.createElement(Text, { style: { ...styles.colCost, color: "#dc2626", fontWeight: 700 } }, `${fmtEur(data.currentAnnualCost)} €`),
          React.createElement(Text, { style: styles.colSavings }, "—"),
        ),
        // Comparison rows
        ...data.comparisons.map((c, i) => {
          const isBest = i === 0;
          const rowStyle = isBest
            ? styles.tableRowBest
            : i % 2 === 0
              ? styles.tableRowAlt
              : styles.tableRow;
          return React.createElement(
            View,
            { key: i, style: rowStyle },
            React.createElement(
              Text,
              { style: isBest ? { ...styles.colProvider, fontWeight: 700, color: "#16a34a" } : styles.colProvider },
              c.provider,
            ),
            React.createElement(Text, { style: styles.colTariff }, c.tariffName),
            React.createElement(Text, { style: styles.colType }, c.type),
            React.createElement(
              Text,
              { style: isBest ? { ...styles.colCost, fontWeight: 700, color: "#16a34a" } : styles.colCost },
              `${fmtEur(c.estimatedAnnualCost)} €`,
            ),
            React.createElement(
              Text,
              { style: isBest ? { ...styles.colSavings, fontWeight: 700, color: "#16a34a" } : styles.colSavings },
              `${fmtEur(c.savingsVsCurrent)} €`,
            ),
          );
        }),
      ),

      // ── Recommendations ──
      data.recommendations.length > 0
        ? React.createElement(
            View,
            { style: styles.recsSection },
            React.createElement(Text, { style: styles.recsSectionTitle }, "RECOMENDACIONES"),
            ...data.recommendations.map((rec, i) =>
              React.createElement(
                View,
                { key: i, style: styles.recItem },
                React.createElement(Text, { style: styles.recNumber }, `${i + 1}.`),
                React.createElement(Text, { style: styles.recText }, rec),
              ),
            ),
          )
        : null,

      // ── Footer ──
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(
          Text,
          null,
          `${issuer.name}  ·  NIF ${issuer.nif}  ·  ${issuer.email}  ·  ${issuer.phone}`,
        ),
        React.createElement(
          Text,
          { style: { marginTop: 4, fontStyle: "italic" } },
          "Propuesta generada automáticamente por Sinergia CRM",
        ),
      ),
    ),
  );

  return await renderToBuffer(doc as unknown as React.ReactElement);
}
