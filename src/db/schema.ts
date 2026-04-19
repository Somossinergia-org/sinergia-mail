import { pgTable, text, timestamp, real, boolean, integer, jsonb, serial, varchar, index, primaryKey } from "drizzle-orm/pg-core";

// ═══════ AUTH TABLES (NextAuth) ═══════
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
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
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("contacts_user_idx").on(table.userId),
  emailIdx: index("contacts_email_idx").on(table.email),
  userEmailIdx: index("contacts_user_email_idx").on(table.userId, table.email),
  scoreIdx: index("contacts_score_idx").on(table.score),
  categoryIdx: index("contacts_category_idx").on(table.category),
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
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("visits_user_idx").on(table.userId),
  dateIdx: index("visits_date_idx").on(table.date),
  statusIdx: index("visits_status_idx").on(table.status),
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

// Types
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
