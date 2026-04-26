-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0012: BASELINE RECOVERY
-- ═══════════════════════════════════════════════════════════════════════════
-- 35 tablas que existen en el schema.ts pero NO tenían migración SQL en
-- drizzle/. Auditoría 2026-04-26 detectó el gap. Estas tablas SÍ existen
-- en la BD de producción (creadas manualmente vía drizzle-kit push o WP-CLI),
-- por eso este archivo usa IF NOT EXISTS — es no-op en prod actual.
--
-- Si alguna vez hay que recrear la BD desde cero (DR, nuevo entorno),
-- aplicar todas las migraciones en orden recreará el schema completo.
--
-- Tablas: users, accounts, sessions, emails, contacts, invoices,
-- issued_invoices, agent_config, agent_logs, agent_conversations,
-- memory_sources, memory_rules, draft_responses, email_summaries,
-- email_accounts, email_rules, email_sequences, sequence_steps,
-- sequence_enrollments, sync_state, mcp_tokens, billing_events,
-- subscriptions, partners, visits, contact_interactions,
-- commercial_activities, commercial_tasks, operational_notifications,
-- service_catalog, service_checklists, service_documents,
-- runtime_switches, rate_limit_counters, ops_agent_roles
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"auto_categorize_on_sync" boolean DEFAULT true,
	"auto_summarize" boolean DEFAULT true,
	"default_draft_tone" varchar(30) DEFAULT 'profesional',
	"weekly_report_enabled" boolean DEFAULT true,
	"weekly_report_day" integer DEFAULT 1,
	"agent_name" text DEFAULT 'Sinergia IA',
	"agent_personality" text DEFAULT 'profesional',
	"custom_system_prompt" text,
	"business_context" text,
	"auto_replies" boolean DEFAULT false,
	"auto_categories" boolean DEFAULT true,
	"escalation_email" text,
	"preferred_model" varchar(50) DEFAULT 'auto',
	"fine_tuned_model_id" text,
	"max_auto_actions" integer DEFAULT 5,
	"never_auto_reply" jsonb DEFAULT '[]'::jsonb,
	"always_notify" jsonb DEFAULT '[]'::jsonb,
	"signature_html" text,
	"timezone" varchar(50) DEFAULT 'Europe/Madrid',
	"language" varchar(5) DEFAULT 'es',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"agent_id" varchar(30),
	"tool_calls" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" varchar(50) NOT NULL,
	"input_summary" text,
	"output_summary" text,
	"tokens_used" integer,
	"duration_ms" integer,
	"success" boolean DEFAULT true,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"processed" boolean DEFAULT false,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commercial_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" integer NOT NULL,
	"contact_id" integer,
	"opportunity_id" integer,
	"case_id" integer,
	"service_id" integer,
	"type" varchar(30) NOT NULL,
	"summary" text NOT NULL,
	"outcome" text,
	"next_step" text,
	"due_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commercial_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" integer,
	"opportunity_id" integer,
	"case_id" integer,
	"title" text NOT NULL,
	"description" text,
	"priority" varchar(10) DEFAULT 'media' NOT NULL,
	"status" varchar(20) DEFAULT 'pendiente' NOT NULL,
	"due_at" timestamp,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contact_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"subject" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"company" text,
	"nif" text,
	"phone" text,
	"phone2" text,
	"address" text,
	"city" text,
	"province" text,
	"postal_code" varchar(10),
	"website" text,
	"category" varchar(50),
	"score" integer DEFAULT 0,
	"score_email" integer DEFAULT 0,
	"score_invoice" integer DEFAULT 0,
	"score_activity" integer DEFAULT 0,
	"temperature" varchar(10),
	"priority" varchar(10),
	"emails_sent" integer DEFAULT 0,
	"emails_received" integer DEFAULT 0,
	"emails_opened" integer DEFAULT 0,
	"email_count" integer DEFAULT 0,
	"last_email_date" timestamp,
	"last_contacted_at" timestamp,
	"total_invoiced" real DEFAULT 0,
	"tags" text[],
	"notes" text,
	"source" varchar(30),
	"company_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "draft_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"tone" varchar(30) DEFAULT 'profesional',
	"status" varchar(20) DEFAULT 'draft',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" varchar(20) DEFAULT 'google' NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" integer,
	"scope" text,
	"is_primary" boolean DEFAULT false,
	"enabled" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"total_emails" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email_type" varchar(30) NOT NULL,
	"sender_pattern" text,
	"subject_pattern" text,
	"category" varchar(30),
	"routing" varchar(20),
	"create_task" boolean DEFAULT false,
	"create_alert" boolean DEFAULT false,
	"create_case" boolean DEFAULT false,
	"extract_pdf" boolean DEFAULT false,
	"extract_excel" boolean DEFAULT false,
	"save_documentation" boolean DEFAULT false,
	"require_confirmation" boolean DEFAULT false,
	"agent_responsible" varchar(30),
	"priority" varchar(10) DEFAULT 'media',
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" varchar(30) DEFAULT 'manual',
	"active" boolean DEFAULT false,
	"total_enrolled" integer DEFAULT 0,
	"total_completed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"summary" text NOT NULL,
	"key_points" jsonb DEFAULT '[]'::jsonb,
	"sentiment" varchar(20),
	"action_required" boolean DEFAULT false,
	"action_description" text,
	"category_by_ai" varchar(50),
	"category_confidence" integer,
	"priority_by_ai" varchar(20),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"gmail_id" text NOT NULL,
	"user_id" text NOT NULL,
	"account_id" integer,
	"thread_id" text,
	"from_name" text,
	"from_email" text,
	"subject" text,
	"snippet" text,
	"body" text,
	"date" timestamp,
	"labels" jsonb,
	"category" varchar(50),
	"priority" varchar(10),
	"has_attachments" boolean DEFAULT false,
	"attachment_names" jsonb,
	"is_read" boolean DEFAULT false,
	"operational_category" varchar(30),
	"routing" varchar(20),
	"classification_meta" jsonb,
	"rule_action" varchar(20),
	"draft_created" boolean DEFAULT false,
	"synced_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "emails_gmail_id_unique" UNIQUE("gmail_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer,
	"user_id" text NOT NULL,
	"invoice_number" text,
	"issuer_name" text,
	"issuer_nif" text,
	"recipient_name" text,
	"recipient_nif" text,
	"concept" text,
	"amount" real,
	"tax" real,
	"total_amount" real,
	"currency" varchar(5) DEFAULT 'EUR',
	"invoice_date" timestamp,
	"due_date" timestamp,
	"pdf_filename" text,
	"pdf_gmail_attachment_id" text,
	"category" varchar(50),
	"processed" boolean DEFAULT false,
	"raw_text" text,
	"ai_response" jsonb,
	"issuer_normalized" text,
	"nif_normalized" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issued_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"number" text NOT NULL,
	"series" varchar(20) DEFAULT 'SINERGIA',
	"year" integer NOT NULL,
	"sequence" integer NOT NULL,
	"client_name" text NOT NULL,
	"client_nif" text,
	"client_address" text,
	"client_email" text,
	"issue_date" timestamp NOT NULL,
	"due_date" timestamp,
	"concepts" jsonb NOT NULL,
	"subtotal" real NOT NULL,
	"tax" real NOT NULL,
	"total" real NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR',
	"notes" text,
	"status" varchar(20) DEFAULT 'draft',
	"sent_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"revoked" boolean DEFAULT false,
	CONSTRAINT "mcp_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pattern" text NOT NULL,
	"field" varchar(20) DEFAULT 'subject',
	"action" varchar(30) NOT NULL,
	"description" text,
	"match_count" integer DEFAULT 0,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" integer,
	"kind" varchar(20) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"metadata" jsonb,
	"source_ref_id" integer,
	"chunk_index" integer,
	"tags" text[],
	"starred" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "operational_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" integer,
	"opportunity_id" integer,
	"case_id" integer,
	"task_id" integer,
	"service_id" integer,
	"type" varchar(40) NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" varchar(10) DEFAULT 'info' NOT NULL,
	"status" varchar(15) DEFAULT 'new' NOT NULL,
	"source" varchar(15) DEFAULT 'system' NOT NULL,
	"dedup_key" varchar(120),
	"created_at" timestamp DEFAULT now(),
	"seen_at" timestamp,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_agent_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_slug" varchar(30) NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"description" text,
	"verticals" jsonb,
	"client_types" jsonb,
	"can_do" jsonb,
	"cannot_do" jsonb,
	"services_owner" jsonb,
	"services_support" jsonb,
	"task_types" jsonb,
	"special_rules" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"vertical" varchar(30) NOT NULL,
	"product" text,
	"commission_fixed" real,
	"commission_recurring" real,
	"conditions" text,
	"clawback" text,
	"required_documentation" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" varchar(30) NOT NULL,
	"entity_key" varchar(200) NOT NULL,
	"counter" varchar(50) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now(),
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runtime_switches" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence_id" integer NOT NULL,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"current_step" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active',
	"next_send_at" timestamp,
	"last_sent_at" timestamp,
	"enrolled_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence_id" integer NOT NULL,
	"step_order" integer DEFAULT 1 NOT NULL,
	"wait_days" integer DEFAULT 1 NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"condition" varchar(30),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"vertical" varchar(30) NOT NULL,
	"subtype" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"client_type" varchar(30) NOT NULL,
	"economic_model" varchar(15) NOT NULL,
	"price_setup" real,
	"price_monthly" real,
	"partner_id" integer,
	"commission_fixed" real,
	"commission_recurring" real,
	"agent_owner" varchar(30),
	"agent_support" varchar(30),
	"requires_docs" boolean DEFAULT false,
	"commercial_description" text,
	"internal_notes" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"task_name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"mandatory" boolean DEFAULT true NOT NULL,
	"agent_responsible" varchar(30),
	"flow_moment" varchar(30),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"document_name" text NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"applies_to_client" varchar(30),
	"requested_by" varchar(30),
	"reviewed_by" varchar(30),
	"sort_order" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" varchar(20) DEFAULT 'free',
	"status" varchar(20) DEFAULT 'active',
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last_history_id" text,
	"last_sync_at" timestamp,
	"total_emails" integer DEFAULT 0,
	CONSTRAINT "sync_state_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"role" varchar(20) DEFAULT 'admin',
	"phone" text,
	"firma" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contact_name" text NOT NULL,
	"address" text,
	"phone" text,
	"date" timestamp NOT NULL,
	"time" varchar(5),
	"status" varchar(20) DEFAULT 'scheduled',
	"notes" text,
	"lat" real,
	"lng" real,
	"check_in_at" timestamp,
	"check_out_at" timestamp,
	"company_id" integer,
	"contact_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_conv_user_idx" ON "agent_conversations" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_conv_role_idx" ON "agent_conversations" USING btree ("role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_conv_date_idx" ON "agent_conversations" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logs_user_idx" ON "agent_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logs_action_idx" ON "agent_logs" USING btree ("action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logs_date_idx" ON "agent_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_company_idx" ON "commercial_activities" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_user_idx" ON "commercial_activities" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_opportunity_idx" ON "commercial_activities" USING btree ("opportunity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_type_idx" ON "commercial_activities" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_due_idx" ON "commercial_activities" USING btree ("due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_created_idx" ON "commercial_activities" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_idx" ON "commercial_tasks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_company_idx" ON "commercial_tasks" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_opportunity_idx" ON "commercial_tasks" USING btree ("opportunity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "commercial_tasks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_idx" ON "commercial_tasks" USING btree ("due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_priority_idx" ON "commercial_tasks" USING btree ("priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_contact_idx" ON "contact_interactions" USING btree ("contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_type_idx" ON "contact_interactions" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_date_idx" ON "contact_interactions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_user_idx" ON "contacts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_user_email_idx" ON "contacts" USING btree ("user_id","email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_score_idx" ON "contacts" USING btree ("score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_category_idx" ON "contacts" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_company_idx" ON "contacts" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_email_idx" ON "draft_responses" USING btree ("email_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_user_idx" ON "draft_responses" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_accounts_user_idx" ON "email_accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_accounts_email_idx" ON "email_accounts" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "er_user_idx" ON "email_rules" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "er_type_idx" ON "email_rules" USING btree ("email_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "er_active_idx" ON "email_rules" USING btree ("active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequences_user_idx" ON "email_sequences" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "summaries_email_idx" ON "email_summaries" USING btree ("email_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "summaries_user_idx" ON "email_summaries" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_user_idx" ON "emails" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_category_idx" ON "emails" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_date_idx" ON "emails" USING btree ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_gmail_idx" ON "emails" USING btree ("gmail_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_deleted_idx" ON "emails" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_user_idx" ON "invoices" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_date_idx" ON "invoices" USING btree ("invoice_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_nif_idx" ON "invoices" USING btree ("nif_normalized");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_invoices_user_idx" ON "issued_invoices" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_invoices_year_seq_idx" ON "issued_invoices" USING btree ("year","sequence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_invoices_number_idx" ON "issued_invoices" USING btree ("number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_user_idx" ON "mcp_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_hash_idx" ON "mcp_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_rules_user_idx" ON "memory_rules" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_rules_enabled_idx" ON "memory_rules" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_sources_user_idx" ON "memory_sources" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_sources_kind_idx" ON "memory_sources" USING btree ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_sources_account_idx" ON "memory_sources" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notif_user_idx" ON "operational_notifications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notif_status_idx" ON "operational_notifications" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notif_type_idx" ON "operational_notifications" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notif_severity_idx" ON "operational_notifications" USING btree ("severity");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notif_company_idx" ON "operational_notifications" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notif_dedup_idx" ON "operational_notifications" USING btree ("user_id","dedup_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notif_created_idx" ON "operational_notifications" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oar_user_idx" ON "ops_agent_roles" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oar_slug_idx" ON "ops_agent_roles" USING btree ("agent_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "p_user_idx" ON "partners" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "p_vertical_idx" ON "partners" USING btree ("vertical");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rlc_scope_key_idx" ON "rate_limit_counters" USING btree ("scope","entity_key","counter");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_sequence_idx" ON "sequence_enrollments" USING btree ("sequence_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_next_send_idx" ON "sequence_enrollments" USING btree ("next_send_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_status_idx" ON "sequence_enrollments" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "steps_sequence_idx" ON "sequence_steps" USING btree ("sequence_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sc_user_idx" ON "service_catalog" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sc_vertical_idx" ON "service_catalog" USING btree ("vertical");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sc_active_idx" ON "service_catalog" USING btree ("active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scl_service_idx" ON "service_checklists" USING btree ("service_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sd_service_idx" ON "service_documents" USING btree ("service_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_idx" ON "subscriptions" USING btree ("stripe_customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_user_idx" ON "visits" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_date_idx" ON "visits" USING btree ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_status_idx" ON "visits" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_company_idx" ON "visits" USING btree ("company_id");
