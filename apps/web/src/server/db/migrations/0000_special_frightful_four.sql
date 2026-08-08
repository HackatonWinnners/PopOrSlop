CREATE TYPE "public"."ledger_reason" AS ENUM('SIGNUP_GRANT', 'DAILY_DRIP', 'REFERRAL', 'TRADE', 'PAYOUT', 'NA_REFUND', 'DISPUTE_STAKE', 'DISPUTE_RETURN', 'DISPUTE_BOUNTY', 'DISPUTE_SLASH', 'SEED_SUBSIDY', 'ADMIN_ADJUST');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('OPEN', 'LOCKED', 'PROPOSED', 'DISPUTE_WINDOW', 'RESOLVED', 'ESCALATED', 'NA_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."market_type" AS ENUM('COHORT_INDEX', 'SURVIVAL', 'REG_EVENT', 'EXIT', 'FUNDING_BINARY', 'FUNDING_BUCKET', 'INVESTOR_IN', 'MILESTONE_PUBLIC', 'EVENT_DEMO');--> statement-breakpoint
CREATE TABLE "api_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_url" text,
	"snapshot" jsonb,
	"snapshot_hash" text,
	"frozen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text,
	"cohort_id" uuid,
	"ext_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"stake" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_company_matches" (
	"oracle_event_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "event_company_matches_oracle_event_id_company_id_pk" PRIMARY KEY("oracle_event_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_group" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" bigint NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"ref_id" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lmsr_state" (
	"market_id" uuid PRIMARY KEY NOT NULL,
	"q" bigint[] NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "magic_link_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" "market_type" NOT NULL,
	"company_id" uuid,
	"cohort_id" uuid,
	"criteria_md" text NOT NULL,
	"criteria_hash" text NOT NULL,
	"outcomes" text[] NOT NULL,
	"b" bigint NOT NULL,
	"close_at" timestamp with time zone NOT NULL,
	"resolve_by" timestamp with time zone,
	"status" "market_status" DEFAULT 'OPEN' NOT NULL,
	"i_class" smallint DEFAULT 0 NOT NULL,
	"m_class" smallint DEFAULT 0 NOT NULL,
	"position_cap" bigint,
	"seed_priors" jsonb,
	"proposed_at" timestamp with time zone,
	"dispute_deadline" timestamp with time zone,
	"resolved_outcome" smallint,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_slug_unique" UNIQUE("slug"),
	CONSTRAINT "outcomes_card" CHECK (cardinality("markets"."outcomes") BETWEEN 2 AND 64),
	CONSTRAINT "i_class_range" CHECK ("markets"."i_class" BETWEEN 0 AND 3),
	CONSTRAINT "m_class_range" CHECK ("markets"."m_class" BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE "odds_snapshots" (
	"market_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"prices" integer[] NOT NULL,
	CONSTRAINT "odds_snapshots_market_id_ts_pk" PRIMARY KEY("market_id","ts")
);
--> statement-breakpoint
CREATE TABLE "oracle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_ref" text NOT NULL,
	"raw_url" text,
	"archived_url" text,
	"raw_content" "bytea",
	"parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_ts" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hash" text,
	CONSTRAINT "oracle_events_source_ref" UNIQUE("source","external_ref")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"outcome_idx" smallint NOT NULL,
	"shares" bigint DEFAULT 0 NOT NULL,
	"cost_basis" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "positions_user_id_market_id_outcome_idx_pk" PRIMARY KEY("user_id","market_id","outcome_idx")
);
--> statement-breakpoint
CREATE TABLE "resolution_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"outcome_idx" smallint NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposer" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"outcome_idx" smallint NOT NULL,
	"delta_shares" bigint NOT NULL,
	"cost" bigint NOT NULL,
	"p_before" integer[] NOT NULL,
	"p_after" integer[] NOT NULL,
	"self_flagged" boolean DEFAULT false NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"handle" text NOT NULL,
	"team" text,
	"device_fp" text,
	"points_balance" bigint DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "points_balance_nonneg" CHECK ("users"."points_balance" >= 0 OR "users"."is_system")
);
--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"fund_name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_company_matches" ADD CONSTRAINT "event_company_matches_oracle_event_id_oracle_events_id_fk" FOREIGN KEY ("oracle_event_id") REFERENCES "public"."oracle_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_company_matches" ADD CONSTRAINT "event_company_matches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lmsr_state" ADD CONSTRAINT "lmsr_state_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_proposals" ADD CONSTRAINT "resolution_proposals_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_cik_idx" ON "companies" USING btree (("ext_ids" ->> 'cik'));--> statement-breakpoint
CREATE INDEX "companies_ch_idx" ON "companies" USING btree (("ext_ids" ->> 'ch'));--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger" USING btree ("user_id","ts");--> statement-breakpoint
CREATE INDEX "ledger_group_idx" ON "ledger" USING btree ("entry_group");--> statement-breakpoint
CREATE INDEX "ledger_reason_ref_idx" ON "ledger" USING btree ("reason","ref_id");--> statement-breakpoint
CREATE INDEX "markets_lock_idx" ON "markets" USING btree ("status","close_at");--> statement-breakpoint
CREATE INDEX "markets_finalize_idx" ON "markets" USING btree ("status","dispute_deadline");--> statement-breakpoint
CREATE INDEX "positions_market_idx" ON "positions" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "trades_tape_idx" ON "trades" USING btree ("market_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trades_user_idx" ON "trades" USING btree ("user_id","ts" DESC NULLS LAST);