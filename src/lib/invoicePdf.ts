import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export interface InvoicePdfData {
  number: string;
  issueDate: string;
  dueDate: string | null;
  clientName: string;
  clientNif: string | null;
  clientAddress: string | null;
  concepts: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  notes: string | null;
  // Issuer info (Somos Sinergia defaults)
  issuer?: {
    name: string;
    nif: string;
    address: string;
    email: string;
  };
}

const DEFAULT_ISSUER = {
  name: "Somos Sinergia S.L.",
  nif: "B-XXXXXXXX",
  address: "Orihuela, Alicante, España",
  email: "orihuela@somossinergia.es",
};

const fmtEur = (n: number): string =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a2e" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30, borderBottomWidth: 2, borderBottomColor: "#338dff", paddingBottom: 12 },
  brand: { fontSize: 20, fontWeight: 700, color: "#338dff" },
  brandSub: { fontSize: 9, color: "#64748b", marginTop: 2 },
  issueInfo: { textAlign: "right", fontSize: 9 },
  issueTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 4 },
  twoCols: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  col: { width: "48%" },
  table: { marginTop: 16, marginBottom: 20 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1a2744", color: "#fff", padding: 8, fontWeight: 700, fontSize: 9 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", padding: 8 },
  tableRowAlt: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", padding: 8, backgroundColor: "#f8fafc" },
  colDesc: { flex: 3 },
  colQty: { flex: 0.6, textAlign: "center" },
  colUnit: { flex: 1, textAlign: "right" },
  colRate: { flex: 0.7, textAlign: "center" },
  colAmount: { flex: 1.2, textAlign: "right" },
  totals: { marginTop: 20, alignSelf: "flex-end", width: "40%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", padding: 4 },
  totalRowFinal: { flexDirection: "row", justifyContent: "space-between", padding: 8, backgroundColor: "#1a2744", color: "#fff", marginTop: 4, fontSize: 12, fontWeight: 700 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, textAlign: "center", color: "#64748b", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const issuer = data.issuer || DEFAULT_ISSUER;

  const doc = React.createElement(
    Document as unknown as React.ComponentType<unknown>,
    null,
    React.createElement(
      Page as unknown as React.ComponentType<{ size: string; style: object }>,
      { size: "A4", style: styles.page },
      // Header
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
        ),
        React.createElement(
          View,
          { style: styles.issueInfo },
          React.createElement(Text, { style: styles.issueTitle }, "FACTURA"),
          React.createElement(Text, null, `Nº ${data.number}`),
          React.createElement(Text, null, `Fecha: ${data.issueDate}`),
          data.dueDate ? React.createElement(Text, null, `Vencimiento: ${data.dueDate}`) : null,
        ),
      ),
      // Billing info
      React.createElement(
        View,
        { style: styles.twoCols },
        React.createElement(
          View,
          { style: styles.col },
          React.createElement(Text, { style: styles.sectionLabel }, "Facturar a"),
          React.createElement(Text, { style: { fontWeight: 700, fontSize: 11 } }, data.clientName),
          data.clientNif ? React.createElement(Text, null, `NIF: ${data.clientNif}`) : null,
          data.clientAddress ? React.createElement(Text, { style: { marginTop: 2 } }, data.clientAddress) : null,
        ),
      ),
      // Table header
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: styles.colDesc }, "Concepto"),
          React.createElement(Text, { style: styles.colQty }, "Cant."),
          React.createElement(Text, { style: styles.colUnit }, "Precio"),
          React.createElement(Text, { style: styles.colRate }, "IVA"),
          React.createElement(Text, { style: styles.colAmount }, "Total"),
        ),
        ...data.concepts.map((c, i) =>
          React.createElement(
            View,
            { key: i, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
            React.createElement(Text, { style: styles.colDesc }, c.description),
            React.createElement(Text, { style: styles.colQty }, String(c.quantity)),
            React.createElement(Text, { style: styles.colUnit }, `${fmtEur(c.unitPrice)} €`),
            React.createElement(Text, { style: styles.colRate }, `${c.taxRate}%`),
            React.createElement(Text, { style: styles.colAmount }, `${fmtEur(c.quantity * c.unitPrice * (1 + c.taxRate / 100))} €`),
          ),
        ),
      ),
      // Totals
      React.createElement(
        View,
        { style: styles.totals },
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, null, "Base imponible"),
          React.createElement(Text, null, `${fmtEur(data.subtotal)} €`),
        ),
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, null, "IVA"),
          React.createElement(Text, null, `${fmtEur(data.tax)} €`),
        ),
        React.createElement(
          View,
          { style: styles.totalRowFinal },
          React.createElement(Text, null, "TOTAL"),
          React.createElement(Text, null, `${fmtEur(data.total)} ${data.currency}`),
        ),
      ),
      // Notes
      data.notes
        ? React.createElement(
            View,
            { style: { marginTop: 24 } },
            React.createElement(Text, { style: styles.sectionLabel }, "Notas"),
            React.createElement(Text, { style: { fontSize: 9 } }, data.notes),
          )
        : null,
      // Footer
      React.createElement(
        Text,
        { style: styles.footer },
        `${issuer.name}  ·  NIF ${issuer.nif}  ·  ${issuer.email}`,
      ),
    ),
  );

  return await renderToBuffer(doc as unknown as React.ReactElement);
}
