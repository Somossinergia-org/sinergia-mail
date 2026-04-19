import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  serial,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// ═══════ GDPR / RGPD COMPLIANCE TABLES ═══════

/**
 * Consent records — tracks every consent given or revoked by a contact
 * for a specific processing purpose.
 */
export const gdprConsents = pgTable(
  "gdpr_consents",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactEmail: text("contact_email").notNull(),
    consentType: varchar("consent_type", { length: 30 }).notNull(), // email_marketing | data_processing | analytics | third_party
    granted: boolean("granted").default(false),
    source: varchar("source", { length: 30 }), // web_form | email | verbal | contract
    ipAddress: text("ip_address"),
    consentText: text("consent_text"), // exact text shown to user
    grantedAt: timestamp("granted_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    userIdx: index("gdpr_consents_user_idx").on(table.userId),
    contactIdx: index("gdpr_consents_contact_idx").on(table.contactEmail),
    typeIdx: index("gdpr_consents_type_idx").on(table.consentType),
  })
);

/**
 * Data retention policies — configurable per data type.
 * When `enabled`, the system will automatically apply the `action`
 * (delete | anonymize | archive) after `retentionDays` have passed.
 */
export const gdprRetentionPolicies = pgTable(
  "gdpr_retention_policies",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dataType: varchar("data_type", { length: 30 }).notNull(), // emails | invoices | contacts | logs | memory
    retentionDays: integer("retention_days").notNull(),
    action: varchar("action", { length: 20 }).notNull(), // delete | anonymize | archive
    enabled: boolean("enabled").default(true),
    lastExecutedAt: timestamp("last_executed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    userIdx: index("gdpr_retention_user_idx").on(table.userId),
    dataTypeIdx: index("gdpr_retention_data_type_idx").on(table.dataType),
  })
);

/**
 * Right to be forgotten / data subject requests — tracks RGPD requests
 * (erasure, rectification, portability, restriction of processing).
 */
export const gdprDeletionRequests = pgTable(
  "gdpr_deletion_requests",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull(), // email of person requesting
    requestType: varchar("request_type", { length: 30 }).notNull(), // erasure | rectification | portability | restriction
    status: varchar("status", { length: 20 }).default("pending"), // pending | processing | completed | rejected
    dataScope: jsonb("data_scope").$type<string[]>(), // what data: ["emails", "contacts", "invoices", "memory"]
    completedAt: timestamp("completed_at", { mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    userIdx: index("gdpr_deletion_user_idx").on(table.userId),
    statusIdx: index("gdpr_deletion_status_idx").on(table.status),
  })
);

/**
 * Processing activity register — Art. 30 RGPD
 * Documents each processing activity with its legal basis, purposes,
 * data categories, recipients, and security measures.
 */
export const gdprProcessingActivities = pgTable(
  "gdpr_processing_activities",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityName: text("activity_name").notNull(),
    purpose: text("purpose").notNull(),
    legalBasis: varchar("legal_basis", { length: 30 }).notNull(), // consent | contract | legal_obligation | legitimate_interest | vital_interest | public_task
    dataCategories: jsonb("data_categories").$type<string[]>(),
    dataSubjects: text("data_subjects"), // "clientes", "empleados", "proveedores"
    recipients: text("recipients"),
    retentionPeriod: text("retention_period"),
    securityMeasures: text("security_measures"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    userIdx: index("gdpr_activities_user_idx").on(table.userId),
  })
);

// ─── Types ───

export type GdprConsent = typeof gdprConsents.$inferSelect;
export type GdprRetentionPolicy = typeof gdprRetentionPolicies.$inferSelect;
export type GdprDeletionRequest = typeof gdprDeletionRequests.$inferSelect;
export type GdprProcessingActivity = typeof gdprProcessingActivities.$inferSelect;
