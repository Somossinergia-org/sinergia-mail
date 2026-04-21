/**
 * Email Operational Classifier — Second-pass classification
 *
 * Takes the basic AI category from Gemini + email metadata and produces:
 * 1. Operational category (more granular than Gemini's 10 categories)
 * 2. Routing destination (which department/flow handles this)
 * 3. CRM actions to execute (tasks, notifications, activities)
 * 4. Attachment handling instructions
 */

// --- Types ---

export type OperationalCategory =
  | "publicidad"           // newsletters, promos, mass mailing — SILENCE
  | "spam"                 // junk, phishing — SILENCE
  | "notificacion_auto"    // automated notifications (bank, SaaS, etc.) — LOG ONLY
  | "factura_energia"      // energy bills — RECEPTION → ENERGY FLOW
  | "factura_admin"        // administrative/financial invoices — FINANCE
  | "cliente_urgente"      // client email with urgency signals — TASK + CASE
  | "cliente_normal"       // normal client communication — ACTIVITY LOG
  | "prospecto"            // potential new client — OPPORTUNITY SIGNAL
  | "proveedor_precios"    // supplier with price updates (Tunergia, Procesus, etc.) — STRATEGIC DOC
  | "proveedor_normal"     // normal supplier communication — LOG
  | "legal_contrato"       // contracts, legal docs — ALERT
  | "documentacion_util"   // useful docs, technical annexes — EXTRACT + STORE
  | "interno"              // internal team communication — LOG
  | "otro"                 // unclassifiable — LOG

export type RoutingDestination =
  | "silenciar"            // no action, no CRM
  | "recepcion"            // general reception/triage
  | "energia"              // energy department flow
  | "finanzas"             // finance/accounting
  | "comercial"            // sales/commercial
  | "legal"                // legal department
  | "documentacion"        // document management
  | "log_only"             // just log, no routing needed

export interface AttachmentClassification {
  filename: string;
  type: "pdf" | "excel" | "image" | "other";
  docType: "factura_energia" | "factura_admin" | "tarifa_precios" | "contrato" | "anexo_comercial" | "tabla_datos" | "documento_tecnico" | "otro";
  shouldExtract: boolean;
  isStrategic: boolean;  // Tunergia/Procesus price docs, contracts, etc.
}

export interface CrmAction {
  type: "create_task" | "create_notification" | "log_activity" | "link_company" | "parse_energy_bill" | "extract_document";
  priority: "alta" | "media" | "baja";
  data: Record<string, unknown>;
}

export interface ClassificationResult {
  operationalCategory: OperationalCategory;
  routing: RoutingDestination;
  confidence: number;  // 0-100
  reason: string;
  actions: CrmAction[];
  attachments: AttachmentClassification[];
  shouldIndexMemory: boolean;
  isNoise: boolean;     // true = publicidad/spam/notificacion_auto
  isStrategic: boolean; // true = Tunergia/Procesus/price updates/contracts
}

// --- Constants ---

// Known strategic supplier patterns
const STRATEGIC_SUPPLIERS: Array<{ pattern: RegExp; name: string; type: string }> = [
  { pattern: /tunergia/i, name: "Tunergia", type: "energy_supplier" },
  { pattern: /procesus/i, name: "Procesus", type: "energy_supplier" },
  { pattern: /endesa/i, name: "Endesa", type: "energy_company" },
  { pattern: /iberdrola/i, name: "Iberdrola", type: "energy_company" },
  { pattern: /naturgy/i, name: "Naturgy", type: "energy_company" },
  { pattern: /repsol/i, name: "Repsol", type: "energy_company" },
  { pattern: /totalenergies/i, name: "TotalEnergies", type: "energy_company" },
  { pattern: /holaluz/i, name: "Holaluz", type: "energy_company" },
  { pattern: /factor\s*energ/i, name: "Factor Energía", type: "energy_company" },
  { pattern: /nexus\s*energ/i, name: "Nexus Energía", type: "energy_company" },
];

// Newsletter / mass mailing signals
const NOISE_PATTERNS = {
  senders: [
    /noreply@/i, /no-reply@/i, /newsletter@/i, /marketing@/i, /info@.*\.com$/i,
    /promo@/i, /offers@/i, /news@/i, /digest@/i, /updates@/i,
    /mailchimp/i, /sendgrid/i, /hubspot/i, /mailgun/i, /sendinblue/i, /brevo/i,
  ],
  subjects: [
    /newsletter/i, /boletín/i, /^oferta/i, /promoción/i, /descuento/i,
    /suscripción/i, /unsubscribe/i, /darse de baja/i, /date de baja/i,
    /black friday/i, /cyber monday/i, /flash sale/i,
    /\d+%\s*(off|descuento|dto)/i, /gratis/i, /free trial/i,
  ],
  headers: [
    /list-unsubscribe/i, /precedence:\s*bulk/i, /x-mailer.*campaign/i,
  ],
};

// Urgency signals in client emails
const URGENCY_PATTERNS = [
  /urgente/i, /urgent/i, /inmediato/i, /cuanto antes/i, /lo antes posible/i,
  /asap/i, /emergencia/i, /crítico/i, /problema grave/i, /no funciona/i,
  /avería/i, /corte de luz/i, /sin suministro/i, /reclamación/i, /queja/i,
  /denuncia/i, /incidencia/i, /caído/i, /roto/i,
];

// Energy invoice signals
const ENERGY_BILL_PATTERNS = [
  /factura.*(?:luz|eléctric|energía|suministro|potencia|consumo)/i,
  /(?:luz|eléctric|energía|suministro).*factura/i,
  /cups/i, /kWh/i, /potencia contratada/i, /término de potencia/i,
  /término de energía/i, /peaje/i, /tarifa.*(?:2\.0|3\.0|6\.)/i,
  /comercializadora/i, /distribuidora/i, /lectura.*contador/i,
];

// Administrative/financial invoice signals
const ADMIN_INVOICE_PATTERNS = [
  /factura.*(?:teléfono|internet|móvil|seguro|alquiler|agua|gas natural)/i,
  /recibo.*(?:banco|cuota|mensualidad|anualidad)/i,
  /nómina/i, /pago.*proveedor/i, /cobro.*pendiente/i,
  /vencimiento.*pago/i, /transferencia/i, /domiciliación/i,
];

// Price update signals
const PRICE_UPDATE_PATTERNS = [
  /actualización.*(?:precios|tarifas|condiciones)/i,
  /(?:precios|tarifas|condiciones).*actualiz/i,
  /nuevos?\s*precios/i, /nuevas?\s*tarifas/i, /cambio.*tarifas/i,
  /modificación.*(?:precios|condiciones)/i, /revisión.*(?:precios|tarifas)/i,
  /vigencia/i, /entrar.*en.*vigor/i, /a partir de/i,
  /indexad[oa]/i, /precio.*fijo/i, /margen/i,
  /tabla.*precios/i, /listado.*tarifas/i,
];

// --- Classifier Functions ---

function classifyAttachments(attachmentNames: string[]): AttachmentClassification[] {
  return attachmentNames.map((filename) => {
    const lower = filename.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isExcel = /\.(xlsx?|csv|tsv|ods)$/.test(lower);
    const isImage = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/.test(lower);
    const type = isPdf ? "pdf" as const : isExcel ? "excel" as const : isImage ? "image" as const : "other" as const;

    // Detect document type from filename
    let docType: AttachmentClassification["docType"] = "otro";
    if (/factura.*(?:luz|energ|eléctric|suministro|cups)/i.test(lower) || /(?:luz|energ|eléctric).*factura/i.test(lower)) {
      docType = "factura_energia";
    } else if (/factura|invoice|recibo|albarán/i.test(lower)) {
      docType = "factura_admin";
    } else if (/tarifa|precio|rate|price|oferta.*comercial/i.test(lower)) {
      docType = "tarifa_precios";
    } else if (/contrato|contract|acuerdo|convenio/i.test(lower)) {
      docType = "contrato";
    } else if (/anexo|addendum|apéndice/i.test(lower)) {
      docType = "anexo_comercial";
    } else if (isExcel || /tabla|listado|datos|matrix|cuadro/i.test(lower)) {
      docType = "tabla_datos";
    } else if (/técnic|manual|especificac|ficha/i.test(lower)) {
      docType = "documento_tecnico";
    }

    const shouldExtract = (isPdf || isExcel) && docType !== "otro";
    const isStrategic = ["tarifa_precios", "contrato", "anexo_comercial"].includes(docType);

    return { filename, type, docType, shouldExtract, isStrategic };
  });
}

function isNoiseEmail(fromEmail: string, subject: string, body: string): boolean {
  // Check sender patterns
  if (NOISE_PATTERNS.senders.some((p) => p.test(fromEmail))) return true;
  // Check subject patterns
  if (NOISE_PATTERNS.subjects.some((p) => p.test(subject))) return true;
  // Body noise heuristics: unsubscribe links, tracking pixels
  if (/unsubscribe|darse de baja|click here to stop|opt.out/i.test(body)) {
    // Only mark as noise if it's not from a known important sender
    if (!STRATEGIC_SUPPLIERS.some((s) => s.pattern.test(fromEmail))) return true;
  }
  return false;
}

function detectStrategicSupplier(fromEmail: string, fromName: string): { name: string; type: string } | null {
  const combined = `${fromName} ${fromEmail}`;
  for (const s of STRATEGIC_SUPPLIERS) {
    if (s.pattern.test(combined)) return { name: s.name, type: s.type };
  }
  return null;
}

function hasUrgencySignals(subject: string, body: string): boolean {
  const text = `${subject} ${body.slice(0, 3000)}`;
  return URGENCY_PATTERNS.some((p) => p.test(text));
}

function isEnergyBill(subject: string, body: string, attachments: AttachmentClassification[]): boolean {
  const text = `${subject} ${body.slice(0, 3000)}`;
  if (ENERGY_BILL_PATTERNS.some((p) => p.test(text))) return true;
  if (attachments.some((a) => a.docType === "factura_energia")) return true;
  return false;
}

function isAdminInvoice(subject: string, body: string): boolean {
  const text = `${subject} ${body.slice(0, 3000)}`;
  return ADMIN_INVOICE_PATTERNS.some((p) => p.test(text));
}

function hasPriceUpdateSignals(subject: string, body: string): boolean {
  const text = `${subject} ${body.slice(0, 3000)}`;
  return PRICE_UPDATE_PATTERNS.some((p) => p.test(text));
}

// --- Main Classifier ---

export function classifyEmail(input: {
  aiCategory: string;       // from Gemini first pass
  aiPriority: string;
  aiConfidence: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  attachmentNames: string[];
  accountId?: number;
}): ClassificationResult {
  const { aiCategory, aiPriority, fromName, fromEmail, subject, body, attachmentNames } = input;
  const attachments = classifyAttachments(attachmentNames);
  const actions: CrmAction[] = [];
  const strategicSupplier = detectStrategicSupplier(fromEmail, fromName);
  const hasExcel = attachments.some((a) => a.type === "excel");
  const hasPdf = attachments.some((a) => a.type === "pdf");
  const hasPriceUpdate = hasPriceUpdateSignals(subject, body);

  // ── 1. NOISE CHECK (publicidad, spam, auto-notifications) ──
  if (aiCategory === "SPAM" || isNoiseEmail(fromEmail, subject, body)) {
    // Exception: strategic suppliers are NEVER noise even if they have unsubscribe links
    if (!strategicSupplier) {
      return {
        operationalCategory: aiCategory === "SPAM" ? "spam" : "publicidad",
        routing: "silenciar",
        confidence: 90,
        reason: "Email publicitario/spam detectado — sin acción CRM",
        actions: [],
        attachments,
        shouldIndexMemory: false,
        isNoise: true,
        isStrategic: false,
      };
    }
  }

  // ── 2. MARKETING explicit ──
  if (aiCategory === "MARKETING" && !strategicSupplier) {
    return {
      operationalCategory: "publicidad",
      routing: "silenciar",
      confidence: 85,
      reason: "Marketing/newsletter — silenciado",
      actions: [],
      attachments,
      shouldIndexMemory: false,
      isNoise: true,
      isStrategic: false,
    };
  }

  // ── 3. AUTOMATIC NOTIFICATIONS (banks, SaaS, etc.) ──
  if (aiCategory === "NOTIFICACION" && !strategicSupplier) {
    return {
      operationalCategory: "notificacion_auto",
      routing: "log_only",
      confidence: 80,
      reason: "Notificación automática — solo log",
      actions: [],
      attachments,
      shouldIndexMemory: false,
      isNoise: true,
      isStrategic: false,
    };
  }

  // ── 4. STRATEGIC SUPPLIER (Tunergia, Procesus, energy companies) ──
  if (strategicSupplier) {
    const isPrice = hasPriceUpdate || hasExcel || attachments.some((a) => a.docType === "tarifa_precios");
    const category: OperationalCategory = isPrice ? "proveedor_precios" : "proveedor_normal";
    const routing: RoutingDestination = isPrice ? "documentacion" : "recepcion";

    if (isPrice) {
      actions.push({
        type: "create_task",
        priority: "alta",
        data: {
          title: `Revisar actualización de precios de ${strategicSupplier.name}`,
          source: "suggested",
        },
      });
      actions.push({
        type: "create_notification",
        priority: "alta",
        data: {
          type: "suggested_task",
          message: `${strategicSupplier.name} ha enviado actualización de precios/documentación. Revisar adjuntos.`,
          severity: "warning",
        },
      });
    }

    // Extract documents if they have useful attachments
    for (const att of attachments) {
      if (att.shouldExtract || att.isStrategic) {
        actions.push({
          type: "extract_document",
          priority: isPrice ? "alta" : "media",
          data: { filename: att.filename, docType: att.docType, supplier: strategicSupplier.name },
        });
      }
    }

    return {
      operationalCategory: category,
      routing,
      confidence: 92,
      reason: `Proveedor estratégico: ${strategicSupplier.name}${isPrice ? " — actualización de precios detectada" : ""}`,
      actions,
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: isPrice,
    };
  }

  // ── 5. ENERGY INVOICE ──
  if (aiCategory === "FACTURA" && isEnergyBill(subject, body, attachments)) {
    for (const att of attachments) {
      if (att.type === "pdf") {
        actions.push({
          type: "parse_energy_bill",
          priority: "media",
          data: { filename: att.filename },
        });
      }
    }
    actions.push({
      type: "create_notification",
      priority: "media",
      data: {
        type: "suggested_task",
        message: `Factura energética recibida. Revisar y vincular a empresa.`,
        severity: "info",
      },
    });

    return {
      operationalCategory: "factura_energia",
      routing: "energia",
      confidence: 90,
      reason: "Factura energética detectada — flujo recepción/energía",
      actions,
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 6. ADMINISTRATIVE / FINANCIAL INVOICE ──
  if (aiCategory === "FACTURA" && isAdminInvoice(subject, body)) {
    actions.push({
      type: "log_activity",
      priority: "media",
      data: { type: "nota", summary: `Factura administrativa recibida: ${subject}` },
    });
    return {
      operationalCategory: "factura_admin",
      routing: "finanzas",
      confidence: 85,
      reason: "Factura administrativa — flujo finanzas",
      actions,
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 7. GENERIC INVOICE (not clearly energy or admin) ──
  if (aiCategory === "FACTURA") {
    // Default: route to reception for triage
    actions.push({
      type: "create_notification",
      priority: "media",
      data: {
        type: "suggested_task",
        message: `Factura recibida de ${fromName || fromEmail}. Clasificar y procesar.`,
        severity: "info",
      },
    });
    return {
      operationalCategory: "factura_admin",
      routing: "recepcion",
      confidence: 70,
      reason: "Factura genérica — necesita clasificación manual en recepción",
      actions,
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 8. CLIENT WITH URGENCY ──
  if (aiCategory === "CLIENTE" && hasUrgencySignals(subject, body)) {
    actions.push({
      type: "create_task",
      priority: "alta",
      data: {
        title: `URGENTE: Responder a ${fromName || fromEmail} — ${subject.slice(0, 60)}`,
        source: "suggested",
      },
    });
    actions.push({
      type: "log_activity",
      priority: "alta",
      data: { type: "email", summary: `Email urgente de cliente: ${subject}` },
    });
    return {
      operationalCategory: "cliente_urgente",
      routing: "comercial",
      confidence: 88,
      reason: "Email de cliente con señales de urgencia — tarea creada",
      actions,
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 9. NORMAL CLIENT ──
  if (aiCategory === "CLIENTE") {
    actions.push({
      type: "log_activity",
      priority: "media",
      data: { type: "email", summary: `Email de cliente: ${subject}` },
    });
    return {
      operationalCategory: "cliente_normal",
      routing: "comercial",
      confidence: 80,
      reason: "Comunicación normal de cliente",
      actions,
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 10. LEGAL ──
  if (aiCategory === "LEGAL") {
    actions.push({
      type: "create_notification",
      priority: "alta",
      data: {
        type: "suggested_task",
        message: `Documento legal recibido: ${subject}. Revisar con urgencia.`,
        severity: "warning",
      },
    });
    return {
      operationalCategory: "legal_contrato",
      routing: "legal",
      confidence: 85,
      reason: "Documento legal — alerta creada",
      actions,
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: true,
    };
  }

  // ── 11. SUPPLIER WITH USEFUL DOCS ──
  if (aiCategory === "PROVEEDOR") {
    const hasUsefulDocs = attachments.some((a) => a.shouldExtract || a.isStrategic);
    if (hasUsefulDocs || hasPriceUpdate) {
      actions.push({
        type: "create_notification",
        priority: "media",
        data: {
          type: "suggested_task",
          message: `Documentación de proveedor ${fromName || fromEmail}. Revisar adjuntos.`,
          severity: "info",
        },
      });
      for (const att of attachments) {
        if (att.shouldExtract) {
          actions.push({
            type: "extract_document",
            priority: "media",
            data: { filename: att.filename, docType: att.docType },
          });
        }
      }
      return {
        operationalCategory: "documentacion_util",
        routing: "documentacion",
        confidence: 80,
        reason: "Proveedor con documentación útil — extracción programada",
        actions,
        attachments,
        shouldIndexMemory: true,
        isNoise: false,
        isStrategic: hasPriceUpdate,
      };
    }

    return {
      operationalCategory: "proveedor_normal",
      routing: "recepcion",
      confidence: 75,
      reason: "Comunicación normal de proveedor",
      actions: [],
      attachments,
      shouldIndexMemory: true,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 12. RRHH ──
  if (aiCategory === "RRHH") {
    return {
      operationalCategory: "otro",
      routing: "finanzas",
      confidence: 75,
      reason: "Email de RRHH — derivado a finanzas/admin",
      actions: [],
      attachments,
      shouldIndexMemory: false,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 13. PERSONAL ──
  if (aiCategory === "PERSONAL") {
    return {
      operationalCategory: "otro",
      routing: "log_only",
      confidence: 70,
      reason: "Email personal — solo log",
      actions: [],
      attachments,
      shouldIndexMemory: false,
      isNoise: false,
      isStrategic: false,
    };
  }

  // ── 14. FALLBACK ──
  return {
    operationalCategory: "otro",
    routing: "recepcion",
    confidence: 50,
    reason: "No clasificado con certeza — derivado a recepción",
    actions: [],
    attachments,
    shouldIndexMemory: false,
    isNoise: false,
    isStrategic: false,
  };
}
