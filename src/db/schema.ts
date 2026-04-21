import { pgTable, text, timestamp, real, boolean, integer, jsonb, serial, varchar, index, primaryKey, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

// ═══════ AUTH TABLES (NextAuth) ═══════
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  // ── CRM Unification (Fase 1) ──
  role: varchar("role", { length: 20 }).default("admin"), // admin | comercial | supervisor
  phone: text("phone"),
  firma: text("firma"), // firma email HTML
});

export const accounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (table) => ({
  compoundKey: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ═══════ APP TABLES ═══════
export const emails = pgTable("emails", {
  id: serial("id").primaryKey(),
  gmailId: text("gmail_id").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id),
  // Multi-account: which Gmail account this email came from. Nullable for
  // backward compatibility with rows synced before multi-account migration.
  accountId: integer("account_id"),
  threadId: text("thread_id"),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  subject: text("subject"),
  snippet: text("snippet"),
  body: text("body"),
  date: timestamp("date", { mode: "date" }),
  labels: jsonb("labels").$type<string[]>(),
  // AI-generated
  category: varchar("category", { length: 50 }),
  priority: varchar("priority", { length: 10 }),
  hasAttachments: boolean("has_attachments").default(false),
  attachmentNames: jsonb("attachment_names").$type<string[]>(),
  isRead: boolean("is_read").default(false),
  // Second-pass operational classification (Phase 14)
  operationalCategory: varchar("operational_category", { length: 30 }),
  routing: varchar("routing", { length: 20 }),
  classificationMeta: jsonb("classification_meta").$type<Record<string, unknown>>(),
  // Memory rules
  ruleAction: varchar("rule_action", { length: 20 }), // IGNORAR | ELIMINAR | IMPORTANTE
  // Draft
  draftCreated: boolean("draft_created").default(false),
  // Timestamps
  syncedAt: timestamp("synced_at", { mode: "date" }).defaultNow(),
  // Soft-delete: timestamp cuando el email va a la papelera interna. Gmail
  // mantiene su propia papelera 30 días; esta columna permite restaurar la
  // fila local sin tener que re-sincronizar.
  deletedAt: timestamp("deleted_at", { mode: "date" }),
}, (table) => ({
  userIdx: index("emails_user_idx").on(table.userId),
  categoryIdx: index("emails_category_idx").on(table.category),
  dateIdx: index("emails_date_idx").on(table.date),
  gmailIdx: index("emails_gmail_idx").on(table.gmailId),
  deletedIdx: index("emails_deleted_idx").on(table.deletedAt),
}));

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").references(() => emails.id),
  userId: text("user_id").notNull().references(() => users.id),
  // Extracted by AI from PDF
  invoiceNumber: text("invoice_number"),
  issuerName: text("issuer_name"),
  issuerNif: text("issuer_nif"),
  recipientName: text("recipient_name"),
  recipientNif: text("recipient_nif"),
  concept: text("concept"),
  amount: real("amount"),
  tax: real("tax"),
  totalAmount: real("total_amount"),
  currency: varchar("currency", { length: 5 }).default("EUR"),
  invoiceDate: timestamp("invoice_date", { mode: "date" }),
  dueDate: timestamp("due_date", { mode: "date" }),
  // File info
  pdfFilename: text("pdf_filename"),
  pdfGmailAttachmentId: text("pdf_gmail_attachment_id"),
  category: varchar("category", { length: 50 }),
  // Status
  processed: boolean("processed").default(false),
  rawText: text("raw_text"), // extracted PDF text
  aiResponse: jsonb("ai_response"), // full AI extraction response
  // Normalized for fuzzy/exact lookup (auto-recomputed on insert/update)
  issuerNormalized: text("issuer_normalized"),
  nifNormalized: text("nif_normalized"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("invoices_user_idx").on(table.userId),
  dateIdx: index("invoices_date_idx").on(table.invoiceDate),
  nifIdx: index("invoices_nif_idx").on(table.nifNormalized),
}));

export const memoryRules = pgTable("memory_rules", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  pattern: text("pattern").notNull(),
  // Field to match pattern against: subject, from_email, from_name, body (default: subject)
  field: varchar("field", { length: 20 }).default("subject"),
  // Action: TRASH | MARK_READ | IGNORE | IMPORTANT | LABEL_xxx
  action: varchar("action", { length: 30 }).notNull(),
  // Human description shown to user (e.g. "Creada por el agente desde chat")
  description: text("description"),
  // Count of emails matched so far (stats)
  matchCount: integer("match_count").default(0),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("memory_rules_user_idx").on(table.userId),
  enabledIdx: index("memory_rules_enabled_idx").on(table.enabled),
}));

export const syncState = pgTable("sync_state", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id).unique(),
  lastHistoryId: text("last_history_id"),
  lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
  totalEmails: integer("total_emails").default(0),
});

// ═══════ AI AGENT TABLES ═══════

export const emailSummaries = pgTable("email_summaries", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  keyPoints: jsonb("key_points").$type<string[]>().default([]),
  sentiment: varchar("sentiment", { length: 20 }), // positivo, neutro, negativo
  actionRequired: boolean("action_required").default(false),
  actionDescription: text("action_description"),
  categoryByAi: varchar("category_by_ai", { length: 50 }),
  categoryConfidence: integer("category_confidence"), // 0-100
  priorityByAi: varchar("priority_by_ai", { length: 20 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  emailIdx: index("summaries_email_idx").on(table.emailId),
  userIdx: index("summaries_user_idx").on(table.userId),
}));

export const draftResponses = pgTable("draft_responses", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject"),
  body: text("body").notNull(),
  tone: varchar("tone", { length: 30 }).default("profesional"), // formal, casual, firme, amable, profesional
  status: varchar("status", { length: 20 }).default("draft"), // draft, sent, discarded
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  emailIdx: index("drafts_email_idx").on(table.emailId),
  userIdx: index("drafts_user_idx").on(table.userId),
}));

export const agentLogs = pgTable("agent_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 50 }).notNull(), // categorize, summarize, draft, extract, chat, report
  inputSummary: text("input_summary"), // Resumen del input (NO el email completo — GDPR)
  outputSummary: text("output_summary"), // Resumen del output
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  success: boolean("success").default(true),
  error: text("error"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("logs_user_idx").on(table.userId),
  actionIdx: index("logs_action_idx").on(table.action),
  dateIdx: index("logs_date_idx").on(table.createdAt),
}));

export const agentConfig = pgTable("agent_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  autoCategorizeOnSync: boolean("auto_categorize_on_sync").default(true),
  autoSummarize: boolean("auto_summarize").default(true),
  defaultDraftTone: varchar("default_draft_tone", { length: 30 }).default("profesional"),
  weeklyReportEnabled: boolean("weekly_report_enabled").default(true),
  weeklyReportDay: integer("weekly_report_day").default(1), // 0=dom, 1=lun, ..., 6=sab
  // Extended agent configuration
  agentName: text("agent_name").default("Sinergia IA"),
  agentPersonality: text("agent_personality").default("profesional"), // profesional | casual | formal | tecnico
  customSystemPrompt: text("custom_system_prompt"), // additional instructions injected into every prompt
  businessContext: text("business_context"), // business info always available to the agent
  autoReplies: boolean("auto_replies").default(false), // auto-generate replies for routine emails
  autoCategories: boolean("auto_categories").default(true), // auto-categorize on sync
  escalationEmail: text("escalation_email"), // email to notify when agent can't handle something
  preferredModel: varchar("preferred_model", { length: 50 }).default("auto"), // auto | gemini | gpt5 | fine-tuned
  fineTunedModelId: text("fine_tuned_model_id"), // custom fine-tuned model ID
  maxAutoActions: integer("max_auto_actions").default(5), // max automatic actions per sync
  neverAutoReply: jsonb("never_auto_reply").$type<string[]>().default([]), // email patterns to never auto-reply
  alwaysNotify: jsonb("always_notify").$type<string[]>().default([]), // patterns that always trigger notification
  signatureHtml: text("signature_html"), // email signature to append
  timezone: varchar("timezone", { length: 50 }).default("Europe/Madrid"),
  language: varchar("language", { length: 5 }).default("es"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// ═══════ CONTACTS TABLE ═══════
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  email: text("email").notNull(),
  company: text("company"),
  nif: text("nif"),
  phone: text("phone"),
  phone2: text("phone2"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: varchar("postal_code", { length: 10 }),
  website: text("website"),
  category: varchar("category", { length: 50 }), // CLIENTE, PROVEEDOR, INTERNO, OTRO
  // CRM Scoring (portado de CRM Energía)
  score: integer("score").default(0), // 0-100
  scoreEmail: integer("score_email").default(0),
  scoreInvoice: integer("score_invoice").default(0),
  scoreActivity: integer("score_activity").default(0),
  temperature: varchar("temperature", { length: 10 }), // hot | warm | cold
  priority: varchar("priority", { length: 10 }), // alta | media | baja
  // Engagement tracking
  emailsSent: integer("emails_sent").default(0),
  emailsReceived: integer("emails_received").default(0),
  emailsOpened: integer("emails_opened").default(0),
  emailCount: integer("email_count").default(0),
  lastEmailDate: timestamp("last_email_date", { mode: "date" }),
  lastContactedAt: timestamp("last_contacted_at", { mode: "date" }),
  totalInvoiced: real("total_invoiced").default(0),
  // Tags & metadata
  tags: text("tags").array(),
  notes: text("notes"),
  // Source
  source: varchar("source", { length: 30 }), // email | manual | import | web
  // ── CRM Unification (Fase 1) ──
  companyId: integer("company_id").references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("contacts_user_idx").on(table.userId),
  emailIdx: index("contacts_email_idx").on(table.email),
  userEmailIdx: index("contacts_user_email_idx").on(table.userId, table.email),
  scoreIdx: index("contacts_score_idx").on(table.score),
  categoryIdx: index("contacts_category_idx").on(table.category),
  companyIdx: index("contacts_company_idx").on(table.companyId),
}));

// ═══════ SINERGIA MEMORY ═══════
// Vector store para la memoria semántica del agente. embedding es vector(768)
// generado con text-embedding-004 de Google. Drizzle no tipifica el tipo
// `vector` de pgvector nativamente, pero su I/O es transparente como string
// — lo tratamos como unknown a nivel de TS y lo manejamos en la capa memory.
export const memorySources = pgTable("memory_sources", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Cuenta Gmail origen (null = nota manual o fuente sin cuenta).
  // Permite filtrar la memoria por cuenta desde el sidebar.
  accountId: integer("account_id"),
  kind: varchar("kind", { length: 20 }).notNull(), // email | invoice | pdf | note | url | contact
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  // embedding vector(768) — gestionado vía raw SQL, no expuesto aquí como columna tipada
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  sourceRefId: integer("source_ref_id"),
  chunkIndex: integer("chunk_index"),
  tags: text("tags").array(),
  starred: boolean("starred").default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("memory_sources_user_idx").on(table.userId),
  kindIdx: index("memory_sources_kind_idx").on(table.kind),
  accountIdx: index("memory_sources_account_idx").on(table.accountId),
}));

// ═══════ EMAIL ACCOUNTS (Multi-cuenta) ═══════
// Cada usuario puede conectar varias cuentas de Gmail (futuro: Outlook/iCloud).
// Los OAuth tokens viven aquí, separados de la tabla `accounts` de NextAuth
// (que es solo para el auth principal del dashboard).
export const emailAccounts = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 20 }).notNull().default("google"), // google | microsoft (futuro)
  email: text("email").notNull(),
  displayName: text("display_name"),
  // OAuth tokens (encrypted at rest via DB-level encryption; for now plaintext)
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"), // unix seconds
  scope: text("scope"),
  // State
  isPrimary: boolean("is_primary").default(false),
  enabled: boolean("enabled").default(true),
  lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
  totalEmails: integer("total_emails").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("email_accounts_user_idx").on(table.userId),
  emailIdx: index("email_accounts_email_idx").on(table.email),
}));

// ═══════ ISSUED INVOICES (Ventas) ═══════
// Facturas emitidas por Somos Sinergia hacia clientes. Separadas de las
// `invoices` (recibidas de proveedores) para cálculo fiscal 303:
//  - Repercutido = tax de issued_invoices
//  - Soportado = tax de invoices
export const issuedInvoices = pgTable("issued_invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  number: text("number").notNull(), // e.g. "SINERGIA-2026-0001"
  series: varchar("series", { length: 20 }).default("SINERGIA"),
  year: integer("year").notNull(),
  sequence: integer("sequence").notNull(),
  clientName: text("client_name").notNull(),
  clientNif: text("client_nif"),
  clientAddress: text("client_address"),
  clientEmail: text("client_email"),
  issueDate: timestamp("issue_date", { mode: "date" }).notNull(),
  dueDate: timestamp("due_date", { mode: "date" }),
  concepts: jsonb("concepts").$type<Array<{ description: string; quantity: number; unitPrice: number; taxRate: number }>>().notNull(),
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull(),
  total: real("total").notNull(),
  currency: varchar("currency", { length: 3 }).default("EUR"),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).default("draft"), // draft | sent | paid | cancelled
  sentAt: timestamp("sent_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("issued_invoices_user_idx").on(table.userId),
  yearSeqIdx: index("issued_invoices_year_seq_idx").on(table.year, table.sequence),
  numberIdx: index("issued_invoices_number_idx").on(table.number),
}));

// ═══════ MCP TOKENS ═══════
// Bearer tokens for Claude Desktop / MCP clients to access the /api/mcp endpoint.
// Only a hash is stored; the plaintext is shown ONCE on creation.
export const mcpTokens = pgTable("mcp_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // label, e.g. "Claude Desktop (MacBook)"
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(), // first 8 chars for display (sk_mcp_...)
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  revoked: boolean("revoked").default(false),
}, (table) => ({
  userIdx: index("mcp_tokens_user_idx").on(table.userId),
  hashIdx: index("mcp_tokens_hash_idx").on(table.tokenHash),
}));

// ═══════ EMAIL SEQUENCES (Drip) — portado de CRM Energía ═══════
export const emailSequences = pgTable("email_sequences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  trigger: varchar("trigger", { length: 30 }).default("manual"), // manual | new_contact | invoice_overdue | no_reply
  active: boolean("active").default(false),
  totalEnrolled: integer("total_enrolled").default(0),
  totalCompleted: integer("total_completed").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("sequences_user_idx").on(table.userId),
}));

export const sequenceSteps = pgTable("sequence_steps", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull().references(() => emailSequences.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(1),
  waitDays: integer("wait_days").notNull().default(1),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  condition: varchar("condition", { length: 30 }), // null | opened | not_opened | clicked | not_clicked
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  seqIdx: index("steps_sequence_idx").on(table.sequenceId),
}));

export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull().references(() => emailSequences.id, { onDelete: "cascade" }),
  contactEmail: text("contact_email").notNull(),
  contactName: text("contact_name"),
  currentStep: integer("current_step").default(0),
  status: varchar("status", { length: 20 }).default("active"), // active | completed | paused | cancelled
  nextSendAt: timestamp("next_send_at", { mode: "date" }),
  lastSentAt: timestamp("last_sent_at", { mode: "date" }),
  enrolledAt: timestamp("enrolled_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  seqIdx: index("enrollments_sequence_idx").on(table.sequenceId),
  nextSendIdx: index("enrollments_next_send_idx").on(table.nextSendAt),
  statusIdx: index("enrollments_status_idx").on(table.status),
}));

// ═══════ OUTBOUND MESSAGES (Omnicanal) — portado de Ten21 ═══════
export const outboundMessages = pgTable("outbound_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 10 }).notNull(), // EMAIL | WHATSAPP | PUSH
  destination: text("destination").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: varchar("status", { length: 15 }).default("QUEUED"), // QUEUED | PROCESSING | SENT | FAILED | CANCELLED
  eventType: varchar("event_type", { length: 50 }).notNull(),
  sourceType: varchar("source_type", { length: 30 }),
  sourceId: text("source_id"),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { mode: "date" }),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("outbound_user_idx").on(table.userId),
  statusIdx: index("outbound_status_idx").on(table.status),
  nextAttemptIdx: index("outbound_next_attempt_idx").on(table.nextAttemptAt),
}));

// ═══════ CONTACT SCORING & CRM (upgrade de contacts) ═══════
export const contactInteractions = pgTable("contact_interactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // email_sent | email_received | email_opened | meeting | call | whatsapp | invoice
  subject: text("subject"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  contactIdx: index("interactions_contact_idx").on(table.contactId),
  typeIdx: index("interactions_type_idx").on(table.type),
  dateIdx: index("interactions_date_idx").on(table.createdAt),
}));

// ═══════ BILLING (Stripe) — portado de Ten21 ═══════
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: varchar("plan", { length: 20 }).default("free"), // free | pro | business
  status: varchar("status", { length: 20 }).default("active"), // active | trialing | past_due | cancelled
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("subscriptions_user_idx").on(table.userId),
  stripeIdx: index("subscriptions_stripe_idx").on(table.stripeCustomerId),
}));

export const billingEvents = pgTable("billing_events", {
  id: serial("id").primaryKey(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  processed: boolean("processed").default(false),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// ═══════ VISITS (Comerciales) ═══════
export const visits = pgTable("visits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  address: text("address"),
  phone: text("phone"),
  date: timestamp("date", { mode: "date" }).notNull(),
  time: varchar("time", { length: 5 }), // "09:30"
  status: varchar("status", { length: 20 }).default("scheduled"), // scheduled | in_progress | completed | cancelled
  notes: text("notes"),
  lat: real("lat"),
  lng: real("lng"),
  checkInAt: timestamp("check_in_at", { mode: "date" }),
  checkOutAt: timestamp("check_out_at", { mode: "date" }),
  // ── CRM Unification (Fase 1) ──
  companyId: integer("company_id").references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("visits_user_idx").on(table.userId),
  dateIdx: index("visits_date_idx").on(table.date),
  statusIdx: index("visits_status_idx").on(table.status),
  visitCompanyIdx: index("visits_company_idx").on(table.companyId),
}));

// ═══════ CASES (swarm execution tracking) ═══════
// Cada ejecución del swarm opera sobre un caso. Un caso vincula un usuario
// (owner de la cuenta) con un cliente (contacto externo) y mantiene el
// ownership visible (qué agente "habla" con el cliente).
export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** ID del contacto (cliente externo). Nullable si no se ha identificado aún. */
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  /** Identificador libre del cliente (email, teléfono, etc.) — siempre presente. */
  clientIdentifier: text("client_identifier").notNull(),
  /** Agente visible que "habla" con el cliente. Single-voice principle. */
  visibleOwnerId: varchar("visible_owner_id", { length: 40 }),
  /** Estado del caso */
  status: varchar("status", { length: 20 }).notNull().default("open"), // open | active | waiting | closed
  /** Asunto breve del caso (resumen de la primera consulta) */
  subject: text("subject"),
  /** Canal de origen */
  channel: varchar("channel", { length: 30 }), // email | whatsapp | chat | phone | web
  /** Metadata libre (etiquetas, scoring, prioridad, etc.) */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  /** Número de interacciones del swarm en este caso */
  interactionCount: integer("interaction_count").default(0),
  // ── CRM Unification (Fase 1) ──
  companyId: integer("company_id").references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  opportunityId: integer("opportunity_id").references((): AnyPgColumn => opportunities.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  closedAt: timestamp("closed_at", { mode: "date" }),
}, (table) => ({
  userIdx: index("cases_user_idx").on(table.userId),
  clientIdx: index("cases_client_idx").on(table.clientIdentifier),
  userClientIdx: index("cases_user_client_idx").on(table.userId, table.clientIdentifier),
  statusIdx: index("cases_status_idx").on(table.status),
  ownerIdx: index("cases_owner_idx").on(table.visibleOwnerId),
  contactIdx: index("cases_contact_idx").on(table.contactId),
  caseCompanyIdx: index("cases_company_idx").on(table.companyId),
  caseOpportunityIdx: index("cases_opportunity_idx").on(table.opportunityId),
}));

// ═══════ AUDIT EVENTS (granular observability) ═══════
// Tabla de auditoría granular persistente. Cada evento del swarm (tool calls,
// delegaciones, bloqueos, comunicaciones externas, violaciones de gobernanza)
// se registra aquí para trazabilidad completa.
export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  /** ID del evento (evt_xxxxx) generado en runtime */
  eventId: text("event_id").notNull(),
  /** Caso asociado (null para eventos de sistema) */
  caseId: text("case_id"),
  userId: text("user_id").notNull(),
  agentId: varchar("agent_id", { length: 40 }).notNull(),
  agentLayer: varchar("agent_layer", { length: 30 }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  result: varchar("result", { length: 20 }).notNull(), // success | blocked | failed | info
  toolName: varchar("tool_name", { length: 60 }),
  visibleOwnerId: varchar("visible_owner_id", { length: 40 }),
  targetAgentId: varchar("target_agent_id", { length: 40 }),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  caseIdx: index("audit_events_case_idx").on(table.caseId),
  userIdx: index("audit_events_user_idx").on(table.userId),
  agentIdx: index("audit_events_agent_idx").on(table.agentId),
  eventTypeIdx: index("audit_events_type_idx").on(table.eventType),
  dateIdx: index("audit_events_date_idx").on(table.createdAt),
  resultIdx: index("audit_events_result_idx").on(table.result),
}));

// ═══════ SWARM WORKING MEMORY (persistent ephemeral state) ═══════
// Estado operacional del swarm por usuario. Persiste entre cold starts
// para que tareas multi-paso no pierdan contexto.
export const swarmWorkingMemory = pgTable("swarm_working_memory", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentTask: text("current_task"),
  activeAgentId: varchar("active_agent_id", { length: 40 }),
  pendingDelegations: jsonb("pending_delegations").$type<string[]>().default([]),
  contextSummary: text("context_summary"),
  startedAt: timestamp("started_at", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("swarm_wm_user_idx").on(table.userId),
}));

// ═══════ AGENT CONVERSATIONS (persistent memory) ═══════
export const agentConversations = pgTable("agent_conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // user | assistant | system | summary
  content: text("content").notNull(),
  agentId: varchar("agent_id", { length: 30 }),
  toolCalls: jsonb("tool_calls").$type<Array<{ name: string; result: string }>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(), // for preferences, episodes, etc.
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("agent_conv_user_idx").on(table.userId),
  roleIdx: index("agent_conv_role_idx").on(table.role),
  dateIdx: index("agent_conv_date_idx").on(table.createdAt),
}));

// ─── Rate Limit Counters (persistent across deploys) ─────────────────────────

export const rateLimitCounters = pgTable("rate_limit_counters", {
  id: serial("id").primaryKey(),
  /** Scope: "case", "client", "tool_retry" */
  scope: varchar("scope", { length: 30 }).notNull(),
  /** Entity key: caseId, clientId, or "caseId:toolName" */
  entityKey: varchar("entity_key", { length: 200 }).notNull(),
  /** Counter name: "messages", "calls", "escalations", "highRiskTools" */
  counter: varchar("counter", { length: 50 }).notNull(),
  value: integer("value").notNull().default(0),
  /** Window start for time-windowed counters */
  windowStart: timestamp("window_start", { mode: "date" }).defaultNow(),
  /** Last update timestamp for cooldown tracking */
  lastUpdated: timestamp("last_updated", { mode: "date" }).defaultNow(),
}, (table) => ({
  scopeKeyIdx: index("rlc_scope_key_idx").on(table.scope, table.entityKey, table.counter),
}));

// ─── Runtime Switches (hot kill switches + rate limits) ──────────────────────

export const runtimeSwitches = pgTable("runtime_switches", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// ═══════ CRM UNIFICATION — PHASE 1 NEW TABLES ═══════

// ── Companies (entidad central CRM) ──
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  nif: varchar("nif", { length: 20 }),
  sector: varchar("sector", { length: 50 }),
  cnae: varchar("cnae", { length: 10 }),
  address: text("address"),
  city: text("city"),
  province: varchar("province", { length: 50 }),
  postalCode: varchar("postal_code", { length: 10 }),
  lat: real("lat"),
  lng: real("lng"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  instagram: text("instagram"),
  facebook: text("facebook"),
  source: varchar("source", { length: 30 }), // manual | csv_import | google_places | referido | email_auto
  tags: text("tags").array(),
  notes: text("notes"),
  zoneId: integer("zone_id"), // futuro: FK a zones
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  companyUserIdx: index("companies_user_idx").on(table.userId),
  companyNifIdx: index("companies_nif_idx").on(table.nif),
  companyProvinceIdx: index("companies_province_idx").on(table.province),
  companySourceIdx: index("companies_source_idx").on(table.source),
}));

// ── Supply Points (suministros energéticos con CUPS) ──
export const supplyPoints = pgTable("supply_points", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  cups: varchar("cups", { length: 25 }), // unique per company, NOT globally
  address: text("address"),
  tariff: varchar("tariff", { length: 10 }), // 2.0TD | 3.0TD | 6.1TD
  powerP1Kw: real("power_p1_kw"),
  powerP2Kw: real("power_p2_kw"),
  powerP3Kw: real("power_p3_kw"),
  powerP4Kw: real("power_p4_kw"),
  powerP5Kw: real("power_p5_kw"),
  powerP6Kw: real("power_p6_kw"),
  annualConsumptionKwh: real("annual_consumption_kwh"),
  monthlySpendEur: real("monthly_spend_eur"),
  currentRetailer: varchar("current_retailer", { length: 100 }),
  distributor: varchar("distributor", { length: 100 }),
  contractExpiryDate: timestamp("contract_expiry_date", { mode: "date" }),
  estimatedSavingsEur: real("estimated_savings_eur"),
  estimatedSavingsPct: real("estimated_savings_pct"),
  status: varchar("status", { length: 20 }).default("active"), // active | inactive | pending
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  spCompanyIdx: index("supply_points_company_idx").on(table.companyId),
  spCupsIdx: index("supply_points_cups_idx").on(table.cups),
  spCupsCompanyUniq: uniqueIndex("supply_points_cups_company_uniq").on(table.cups, table.companyId),
  spRetailerIdx: index("supply_points_retailer_idx").on(table.currentRetailer),
  spExpiryIdx: index("supply_points_expiry_idx").on(table.contractExpiryDate),
}));

// ── Opportunities (pipeline de ventas con 10 estados) ──
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  primaryContactId: integer("primary_contact_id").references(() => contacts.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  // Pipeline: pendiente → contactado → interesado → visita_programada → visitado →
  //           oferta_enviada → negociacion → contrato_firmado → cliente_activo → perdido
  status: varchar("status", { length: 30 }).notNull().default("pendiente"),
  temperature: varchar("temperature", { length: 10 }), // frio | tibio | caliente
  priority: varchar("priority", { length: 10 }), // alta | media | baja
  estimatedValueEur: real("estimated_value_eur"),
  expectedCloseDate: timestamp("expected_close_date", { mode: "date" }),
  lostReason: text("lost_reason"),
  source: varchar("source", { length: 30 }), // manual | email | whatsapp | web | referido
  tags: text("tags").array(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  closedAt: timestamp("closed_at", { mode: "date" }),
}, (table) => ({
  oppUserIdx: index("opportunities_user_idx").on(table.userId),
  oppCompanyIdx: index("opportunities_company_idx").on(table.companyId),
  oppStatusIdx: index("opportunities_status_idx").on(table.status),
  oppTempIdx: index("opportunities_temperature_idx").on(table.temperature),
  oppPriorityIdx: index("opportunities_priority_idx").on(table.priority),
  oppCloseDateIdx: index("opportunities_close_date_idx").on(table.expectedCloseDate),
}));

// ── Services (servicios ofertados/contratados — multiproducto) ──
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  supplyPointId: integer("supply_point_id").references(() => supplyPoints.id, { onDelete: "set null" }),
  // Tipo: energia | telecomunicaciones | alarmas | seguros | agentes_ia | web | crm | aplicaciones
  type: varchar("type", { length: 30 }).notNull(),
  // Estado: prospecting | offered | contracted | cancelled
  status: varchar("status", { length: 20 }).default("prospecting"),
  currentProvider: text("current_provider"),
  currentSpendEur: real("current_spend_eur"),
  offeredPriceEur: real("offered_price_eur"),
  estimatedSavings: real("estimated_savings"),
  contractDate: timestamp("contract_date", { mode: "date" }),
  expiryDate: timestamp("expiry_date", { mode: "date" }),
  data: jsonb("data").$type<Record<string, unknown>>(), // extensiones por tipo
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  svcCompanyIdx: index("services_company_idx").on(table.companyId),
  svcOppIdx: index("services_opportunity_idx").on(table.opportunityId),
  svcTypeIdx: index("services_type_idx").on(table.type),
  svcStatusIdx: index("services_status_idx").on(table.status),
}));

// ── Documents (documentos vinculados a empresa) ──
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: varchar("type", { length: 30 }), // contrato | factura | oferta | propuesta | dni | otro
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  fileMime: varchar("file_mime", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  docCompanyIdx: index("documents_company_idx").on(table.companyId),
  docOppIdx: index("documents_opportunity_idx").on(table.opportunityId),
  docTypeIdx: index("documents_type_idx").on(table.type),
}));

// ── Energy Bills (facturas energéticas parseadas) ──
export const energyBills = pgTable("energy_bills", {
  id: serial("id").primaryKey(),
  supplyPointId: integer("supply_point_id").notNull().references(() => supplyPoints.id, { onDelete: "cascade" }),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  billingPeriodStart: timestamp("billing_period_start", { mode: "date" }),
  billingPeriodEnd: timestamp("billing_period_end", { mode: "date" }),
  retailer: varchar("retailer", { length: 100 }),
  totalAmountEur: real("total_amount_eur"),
  energyAmountEur: real("energy_amount_eur"),
  powerAmountEur: real("power_amount_eur"),
  taxAmountEur: real("tax_amount_eur"),
  electricityTaxEur: real("electricity_tax_eur"),
  meterRentalEur: real("meter_rental_eur"),
  reactiveEur: real("reactive_eur"),
  consumptionKwh: jsonb("consumption_kwh").$type<Record<string, number>>(), // {P1: x, P2: y, ...}
  powerKw: jsonb("power_kw").$type<Record<string, number>>(),
  pricesEurKwh: jsonb("prices_eur_kwh").$type<Record<string, number>>(),
  confidenceScore: real("confidence_score"), // 0-100
  rawExtraction: jsonb("raw_extraction").$type<Record<string, unknown>>(),
  fileHash: varchar("file_hash", { length: 64 }), // SHA-256 del archivo original para deduplicación
  parsedAt: timestamp("parsed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  ebSpIdx: index("energy_bills_supply_point_idx").on(table.supplyPointId),
  ebRetailerIdx: index("energy_bills_retailer_idx").on(table.retailer),
  ebPeriodIdx: index("energy_bills_period_idx").on(table.billingPeriodEnd),
  ebDedupIdx: uniqueIndex("energy_bills_dedup_idx").on(table.supplyPointId, table.billingPeriodStart, table.billingPeriodEnd),
  ebFileHashIdx: index("energy_bills_file_hash_idx").on(table.fileHash),
}));

// Types
export type RuntimeSwitch = typeof runtimeSwitches.$inferSelect;
export type AgentConversation = typeof agentConversations.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type MemoryRule = typeof memoryRules.$inferSelect;
export type McpToken = typeof mcpTokens.$inferSelect;
export type IssuedInvoice = typeof issuedInvoices.$inferSelect;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type MemorySource = typeof memorySources.$inferSelect;
export type EmailSummary = typeof emailSummaries.$inferSelect;
export type DraftResponse = typeof draftResponses.$inferSelect;
export type AgentLog = typeof agentLogs.$inferSelect;
export type AgentConfig = typeof agentConfig.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type EmailSequence = typeof emailSequences.$inferSelect;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type SequenceEnrollment = typeof sequenceEnrollments.$inferSelect;
export type OutboundMessage = typeof outboundMessages.$inferSelect;
export type ContactInteraction = typeof contactInteractions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type SwarmWorkingMemoryRow = typeof swarmWorkingMemory.$inferSelect;
// CRM Unification types
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type SupplyPoint = typeof supplyPoints.$inferSelect;
export type NewSupplyPoint = typeof supplyPoints.$inferInsert;
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type EnergyBill = typeof energyBills.$inferSelect;
export type NewEnergyBill = typeof energyBills.$inferInsert;
export type User = typeof users.$inferSelect;

// ── Phase 8: Commercial Activities ──
export const commercialActivities = pgTable("commercial_activities", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  caseId: integer("case_id").references(() => cases.id, { onDelete: "set null" }),
  serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
  // Tipo: llamada | email | whatsapp | visita | nota | seguimiento | cambio_estado | tarea_completada | renovacion | propuesta_enviada
  type: varchar("type", { length: 30 }).notNull(),
  summary: text("summary").notNull(),
  outcome: text("outcome"), // resultado de la actividad
  nextStep: text("next_step"), // próxima acción
  dueAt: timestamp("due_at", { mode: "date" }), // fecha de la próxima acción
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  actCompanyIdx: index("activities_company_idx").on(table.companyId),
  actUserIdx: index("activities_user_idx").on(table.userId),
  actOppIdx: index("activities_opportunity_idx").on(table.opportunityId),
  actTypeIdx: index("activities_type_idx").on(table.type),
  actDueIdx: index("activities_due_idx").on(table.dueAt),
  actCreatedIdx: index("activities_created_idx").on(table.createdAt),
}));

// ── Phase 8: Commercial Tasks ──
export const commercialTasks = pgTable("commercial_tasks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  caseId: integer("case_id").references(() => cases.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 10 }).default("media").notNull(), // alta | media | baja
  status: varchar("status", { length: 20 }).default("pendiente").notNull(), // pendiente | en_progreso | completada | cancelada
  dueAt: timestamp("due_at", { mode: "date" }),
  source: varchar("source", { length: 20 }).default("manual").notNull(), // manual | suggested | followup | renewal | case
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  taskUserIdx: index("tasks_user_idx").on(table.userId),
  taskCompanyIdx: index("tasks_company_idx").on(table.companyId),
  taskOppIdx: index("tasks_opportunity_idx").on(table.opportunityId),
  taskStatusIdx: index("tasks_status_idx").on(table.status),
  taskDueIdx: index("tasks_due_idx").on(table.dueAt),
  taskPriorityIdx: index("tasks_priority_idx").on(table.priority),
}));

export type CommercialActivity = typeof commercialActivities.$inferSelect;
export type NewCommercialActivity = typeof commercialActivities.$inferInsert;
export type CommercialTask = typeof commercialTasks.$inferSelect;
export type NewCommercialTask = typeof commercialTasks.$inferInsert;

// ── Phase 9: Operational Notifications ──
export const operationalNotifications = pgTable("operational_notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  caseId: integer("case_id").references(() => cases.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => commercialTasks.id, { onDelete: "set null" }),
  serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
  type: varchar("type", { length: 40 }).notNull(), // task_overdue | followup_overdue | renewal_upcoming | opportunity_stale | cross_sell | inactivity | suggested_task
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: varchar("severity", { length: 10 }).default("info").notNull(), // info | warning | urgent
  status: varchar("status", { length: 15 }).default("new").notNull(), // new | seen | dismissed | resolved
  source: varchar("source", { length: 15 }).default("system").notNull(), // system | suggested | rule
  /** Dedup key to prevent duplicate notifications for same entity+type */
  dedupKey: varchar("dedup_key", { length: 120 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  seenAt: timestamp("seen_at", { mode: "date" }),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
}, (table) => ({
  notifUserIdx: index("notif_user_idx").on(table.userId),
  notifStatusIdx: index("notif_status_idx").on(table.status),
  notifTypeIdx: index("notif_type_idx").on(table.type),
  notifSeverityIdx: index("notif_severity_idx").on(table.severity),
  notifCompanyIdx: index("notif_company_idx").on(table.companyId),
  notifDedupIdx: uniqueIndex("notif_dedup_idx").on(table.userId, table.dedupKey),
  notifCreatedIdx: index("notif_created_idx").on(table.createdAt),
}));

export type OperationalNotification = typeof operationalNotifications.$inferSelect;
export type NewOperationalNotification = typeof operationalNotifications.$inferInsert;

// ═══════ PHASE 15: BASE OPERATIVA EDITABLE ═══════

/**
 * Catálogo de servicios editable — los 20+ productos de Sinergia.
 * Cada servicio define vertical, modelo económico, agentes, pricing, tipo de cliente.
 */
export const serviceCatalog = pgTable("service_catalog", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  vertical: varchar("vertical", { length: 30 }).notNull(), // energia | telecomunicaciones | seguros | alarmas | ia | web | marketing | crm | apps
  subtype: varchar("subtype", { length: 50 }),              // hogar, pyme, empresa, particular, autonomo...
  active: boolean("active").default(true).notNull(),
  clientType: varchar("client_type", { length: 30 }).notNull(), // particular | autonomo | empresa | todos
  economicModel: varchar("economic_model", { length: 15 }).notNull(), // partner | directo
  priceSetup: real("price_setup"),                            // € one-time
  priceMonthly: real("price_monthly"),                        // € recurrente
  partnerId: integer("partner_id"),                           // FK a partners (nullable)
  commissionFixed: real("commission_fixed"),                   // € fija por venta
  commissionRecurring: real("commission_recurring"),           // € o % recurrente
  agentOwner: varchar("agent_owner", { length: 30 }),         // agente principal responsable
  agentSupport: varchar("agent_support", { length: 30 }),     // agente de apoyo
  requiresDocs: boolean("requires_docs").default(false),
  commercialDescription: text("commercial_description"),
  internalNotes: text("internal_notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  scUserIdx: index("sc_user_idx").on(table.userId),
  scVerticalIdx: index("sc_vertical_idx").on(table.vertical),
  scActiveIdx: index("sc_active_idx").on(table.active),
}));

export type ServiceCatalogItem = typeof serviceCatalog.$inferSelect;
export type NewServiceCatalogItem = typeof serviceCatalog.$inferInsert;

/**
 * Documentación requerida por servicio — qué papeles hay que pedir.
 */
export const serviceDocuments = pgTable("service_documents", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => serviceCatalog.id, { onDelete: "cascade" }),
  documentName: text("document_name").notNull(),             // DNI, CIF, factura reciente, CUPS, IBAN...
  mandatory: boolean("mandatory").default(true).notNull(),
  appliesToClient: varchar("applies_to_client", { length: 30 }), // particular | autonomo | empresa | todos | null=todos
  requestedBy: varchar("requested_by", { length: 30 }),       // agente que lo pide
  reviewedBy: varchar("reviewed_by", { length: 30 }),         // agente que lo revisa
  sortOrder: integer("sort_order").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  sdServiceIdx: index("sd_service_idx").on(table.serviceId),
}));

export type ServiceDocument = typeof serviceDocuments.$inferSelect;
export type NewServiceDocument = typeof serviceDocuments.$inferInsert;

/**
 * Tareas / checklist por servicio — pasos estándar para ejecutar cada servicio.
 */
export const serviceChecklists = pgTable("service_checklists", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => serviceCatalog.id, { onDelete: "cascade" }),
  taskName: text("task_name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  mandatory: boolean("mandatory").default(true).notNull(),
  agentResponsible: varchar("agent_responsible", { length: 30 }),
  flowMoment: varchar("flow_moment", { length: 30 }),        // inicio | proceso | cierre | postventa
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  sclServiceIdx: index("scl_service_idx").on(table.serviceId),
}));

export type ServiceChecklist = typeof serviceChecklists.$inferSelect;
export type NewServiceChecklist = typeof serviceChecklists.$inferInsert;

/**
 * Reglas de correo editables — configuración del pipeline email → IA → acción
 * que se puede mantener sin tocar código.
 */
export const emailRules = pgTable("email_rules", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  emailType: varchar("email_type", { length: 30 }).notNull(),   // publicidad | spam | factura_energia | factura_admin | cliente_urgente | cliente_normal | proveedor_estrategico | documentacion | banco | legal | ambiguo
  senderPattern: text("sender_pattern"),                          // regex o texto
  subjectPattern: text("subject_pattern"),                        // regex o texto
  category: varchar("category", { length: 30 }),
  routing: varchar("routing", { length: 20 }),                    // silenciar | recepcion | energia | finanzas | comercial | legal | documentacion | log_only
  createTask: boolean("create_task").default(false),
  createAlert: boolean("create_alert").default(false),
  createCase: boolean("create_case").default(false),
  extractPdf: boolean("extract_pdf").default(false),
  extractExcel: boolean("extract_excel").default(false),
  saveDocumentation: boolean("save_documentation").default(false),
  requireConfirmation: boolean("require_confirmation").default(false),
  agentResponsible: varchar("agent_responsible", { length: 30 }),
  priority: varchar("priority", { length: 10 }).default("media"), // alta | media | baja
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  erUserIdx: index("er_user_idx").on(table.userId),
  erTypeIdx: index("er_type_idx").on(table.emailType),
  erActiveIdx: index("er_active_idx").on(table.active),
}));

export type EmailRule = typeof emailRules.$inferSelect;
export type NewEmailRule = typeof emailRules.$inferInsert;

/**
 * Partners y comisiones — quién nos paga comisiones y en qué condiciones.
 */
export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  vertical: varchar("vertical", { length: 30 }).notNull(),
  product: text("product"),
  commissionFixed: real("commission_fixed"),
  commissionRecurring: real("commission_recurring"),
  conditions: text("conditions"),
  clawback: text("clawback"),                                     // penalizaciones / clawback
  requiredDocumentation: text("required_documentation"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  pUserIdx: index("p_user_idx").on(table.userId),
  pVerticalIdx: index("p_vertical_idx").on(table.vertical),
}));

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;

/**
 * Roles operativos de agentes — qué hace cada agente, qué verticales toca, qué puede y qué no.
 * Nota: tabla "ops_agent_roles" (distinta de "agent_config" que es config IA del usuario).
 */
export const opsAgentRoles = pgTable("ops_agent_roles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  agentSlug: varchar("agent_slug", { length: 30 }).notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  description: text("description"),
  verticals: jsonb("verticals").$type<string[]>(),
  clientTypes: jsonb("client_types").$type<string[]>(),
  canDo: jsonb("can_do").$type<string[]>(),
  cannotDo: jsonb("cannot_do").$type<string[]>(),
  servicesOwner: jsonb("services_owner").$type<string[]>(),
  servicesSupport: jsonb("services_support").$type<string[]>(),
  taskTypes: jsonb("task_types").$type<string[]>(),
  specialRules: text("special_rules"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  oarUserIdx: index("oar_user_idx").on(table.userId),
  oarSlugIdx: index("oar_slug_idx").on(table.agentSlug),
}));

export type AgentConfigItem = typeof opsAgentRoles.$inferSelect;
export type NewAgentConfigItem = typeof opsAgentRoles.$inferInsert;
