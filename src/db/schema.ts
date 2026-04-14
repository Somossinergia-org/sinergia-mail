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
}, (table) => ({
  userIdx: index("emails_user_idx").on(table.userId),
  categoryIdx: index("emails_category_idx").on(table.category),
  dateIdx: index("emails_date_idx").on(table.date),
  gmailIdx: index("emails_gmail_idx").on(table.gmailId),
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
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("invoices_user_idx").on(table.userId),
  dateIdx: index("invoices_date_idx").on(table.invoiceDate),
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
  category: varchar("category", { length: 50 }), // CLIENTE, PROVEEDOR, INTERNO, OTRO
  emailCount: integer("email_count").default(0),
  lastEmailDate: timestamp("last_email_date", { mode: "date" }),
  totalInvoiced: real("total_invoiced").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
}, (table) => ({
  userIdx: index("contacts_user_idx").on(table.userId),
  emailIdx: index("contacts_email_idx").on(table.email),
  userEmailIdx: index("contacts_user_email_idx").on(table.userId, table.email),
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

// Types
export type Email = typeof emails.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type MemoryRule = typeof memoryRules.$inferSelect;
export type McpToken = typeof mcpTokens.$inferSelect;
export type IssuedInvoice = typeof issuedInvoices.$inferSelect;
export type EmailSummary = typeof emailSummaries.$inferSelect;
export type DraftResponse = typeof draftResponses.$inferSelect;
export type AgentLog = typeof agentLogs.$inferSelect;
export type AgentConfig = typeof agentConfig.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
