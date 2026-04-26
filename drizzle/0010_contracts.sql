-- Phase Legal Step 2 — contracts table for legal-rgpd agent
-- Stores analyzed contracts (clients, suppliers, NDAs, DPAs, etc.) with
-- the latest legal_analyze_contract result + workflow status.

CREATE TABLE IF NOT EXISTS "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" integer,
	"contact_id" integer,
	"title" text NOT NULL,
	"type" varchar(30),
	"reference" text,
	"original_text" text,
	"original_filename" text,
	"original_url" text,
	"parties" jsonb,
	"start_date" timestamp,
	"end_date" timestamp,
	"duration" text,
	"auto_renewal" boolean,
	"notice_days" integer,
	"value" real,
	"currency" varchar(3) DEFAULT 'EUR',
	"payment_terms" text,
	"jurisdiction" text,
	"applicable_law" text DEFAULT 'espanol',
	"analysis" jsonb,
	"risk_score" integer,
	"ready_to_sign" boolean,
	"red_flags" jsonb,
	"missing_clauses" jsonb,
	"summary" text,
	"analyzed_by" varchar(50),
	"analyzed_at" timestamp,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"signed_date" timestamp,
	"notes" text,
	"created_by" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_user_idx" ON "contracts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_company_idx" ON "contracts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_status_idx" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_end_date_idx" ON "contracts" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_type_idx" ON "contracts" USING btree ("type");
