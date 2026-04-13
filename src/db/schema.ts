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
  action: varchar("action", { length: 20 }).notNull(), // IGNORAR | ELIMINAR | IMPORTANTE
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

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

// Types
export type Email = typeof emails.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type MemoryRule = typeof memoryRules.$inferSelect;
export type EmailSummary = typeof emailSummaries.$inferSelect;
export type DraftResponse = typeof draftResponses.$inferSelect;
export type AgentLog = typeof agentLogs.$inferSelect;
export type AgentConfig = typeof agentConfig.$inferSelect;
