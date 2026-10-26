CREATE TYPE "public"."agent_status" AS ENUM('active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."agreement_state" AS ENUM('proposed', 'funded', 'accepted', 'delivered', 'released', 'refunded', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."budget_window" AS ENUM('daily', 'monthly', 'per_request');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'under_review', 'resolved', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('received', 'shortlisted', 'accepted', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('draft', 'open', 'pending_approval', 'approved', 'rejected', 'awarded', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('held', 'captured', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'procurement_manager', 'approver', 'finance', 'auditor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivering', 'delivered', 'failed', 'abandoned');--> statement-breakpoint
CREATE TABLE "agent_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"window" "budget_window" NOT NULL,
	"limit_amount" numeric(78, 0) NOT NULL,
	"spent_amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"reserved_amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"label" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_credentials_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"wallet_address" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"trust_level" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onchain_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"escrow_address" text NOT NULL,
	"buyer_address" text NOT NULL,
	"vendor_address" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"fee_amount" numeric(78, 0) NOT NULL,
	"offer_hash" text NOT NULL,
	"terms_hash" text NOT NULL,
	"state" "agreement_state" DEFAULT 'proposed' NOT NULL,
	"accept_by" timestamp with time zone NOT NULL,
	"deliver_by" timestamp with time zone NOT NULL,
	"dispute_window_seconds" integer NOT NULL,
	"funding_tx_hash" text,
	"funding_block" bigint,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"dispute_id" uuid,
	"budget_reservation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_event_block" bigint,
	"last_event_log_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"offer_id" uuid,
	"required_role" "user_role" DEFAULT 'approver' NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"policy_id" uuid,
	"policy_version" integer,
	"requested_by" text,
	"decided_by_user_id" uuid,
	"decision_note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"org_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"request_id" uuid,
	"amount" numeric(78, 0) NOT NULL,
	"status" "reservation_status" DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"transaction_index" integer DEFAULT 0 NOT NULL,
	"event_name" text NOT NULL,
	"agreement_onchain_id" text,
	"decoded" jsonb NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"opened_by" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"vendor_share" numeric(78, 0),
	"ruling_hash" text,
	"resolved_by_user_id" uuid,
	"resolution_note" text,
	"resolution_tx_hash" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "indexer_cursors" (
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"last_processed_block" bigint NOT NULL,
	"last_block_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indexer_cursors_chain_id_contract_address_pk" PRIMARY KEY("chain_id","contract_address")
);
--> statement-breakpoint
CREATE TABLE "indexer_reorgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rewound_to_block" bigint NOT NULL,
	"previous_block" bigint NOT NULL,
	"orphaned_logs" integer NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"service_id" uuid,
	"price_amount" numeric(78, 0) NOT NULL,
	"currency" text DEFAULT 'MUSD' NOT NULL,
	"delivery_days" integer NOT NULL,
	"terms" jsonb NOT NULL,
	"notes" text,
	"canonical_hash" text NOT NULL,
	"signature" text,
	"signer" text,
	"status" "offer_status" DEFAULT 'received' NOT NULL,
	"rank_score" integer,
	"rank_breakdown" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"chain_id" integer,
	"onchain_org_id" text,
	"wallet_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "policy_status" DEFAULT 'draft' NOT NULL,
	"document" jsonb NOT NULL,
	"document_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"activated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid,
	"policy_id" uuid,
	"policy_version" integer NOT NULL,
	"policy_hash" text NOT NULL,
	"decision" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"context_hash" text NOT NULL,
	"evaluated_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"requirements" jsonb NOT NULL,
	"budget_amount" numeric(78, 0) NOT NULL,
	"currency" text DEFAULT 'MUSD' NOT NULL,
	"status" "request_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_by_agent_id" uuid,
	"policy_id" uuid,
	"policy_version" integer,
	"policy_decision" text,
	"deadline_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"from_status" "request_status",
	"to_status" "request_status" NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"regions" jsonb NOT NULL,
	"price_model" text NOT NULL,
	"base_price" numeric(78, 0),
	"min_price" numeric(78, 0),
	"max_price" numeric(78, 0),
	"currency" text DEFAULT 'MUSD' NOT NULL,
	"sla_hours" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"description" text,
	"status" "vendor_status" DEFAULT 'pending' NOT NULL,
	"payout_address" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_response_code" integer,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"secret_hash" text NOT NULL,
	"secret_sealed" text NOT NULL,
	"events" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_budgets" ADD CONSTRAINT "agent_budgets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_budgets" ADD CONSTRAINT "agent_budgets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_request_id_procurement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_request_id_procurement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_budget_id_agent_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."agent_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_request_id_procurement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_id_procurement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_service_id_vendor_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."vendor_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_procurement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_budgets_unique_window" ON "agent_budgets" USING btree ("agent_id","window","period_start");--> statement-breakpoint
CREATE INDEX "agent_budgets_agent_idx" ON "agent_budgets" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_credentials_agent_idx" ON "agent_credentials" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agents_org_idx" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_wallet_uq" ON "agents" USING btree ("org_id","wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_chain_onchain_uq" ON "agreements" USING btree ("chain_id","onchain_id");--> statement-breakpoint
CREATE INDEX "agreements_org_idx" ON "agreements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agreements_request_idx" ON "agreements" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "agreements_state_idx" ON "agreements" USING btree ("state");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "approvals_org_status_idx" ON "approvals" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_request_pending_uq" ON "approvals" USING btree ("request_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "budget_reservations_agent_idx" ON "budget_reservations" USING btree ("agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_unique_log" ON "chain_events" USING btree ("chain_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "chain_events_block_idx" ON "chain_events" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "chain_events_agreement_idx" ON "chain_events" USING btree ("agreement_onchain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_agreement_open_uq" ON "disputes" USING btree ("agreement_id") WHERE status <> 'resolved';--> statement-breakpoint
CREATE UNIQUE INDEX "offers_request_vendor_uq" ON "offers" USING btree ("request_id","vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_canonical_hash_uq" ON "offers" USING btree ("canonical_hash");--> statement-breakpoint
CREATE INDEX "offers_request_idx" ON "offers" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "offers_org_idx" ON "offers" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_org_version_uq" ON "policies" USING btree ("org_id","version");--> statement-breakpoint
CREATE INDEX "policies_org_status_idx" ON "policies" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "policy_eval_org_idx" ON "policy_evaluations" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_org_reference_uq" ON "procurement_requests" USING btree ("org_id","reference");--> statement-breakpoint
CREATE INDEX "requests_org_status_idx" ON "procurement_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "requests_org_created_idx" ON "procurement_requests" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "request_events_request_idx" ON "request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_uq" ON "users" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "vendor_services_vendor_idx" ON "vendor_services" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_services_category_idx" ON "vendor_services" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_services_vendor_name_uq" ON "vendor_services" USING btree ("vendor_id","name");--> statement-breakpoint
CREATE INDEX "vendors_org_idx" ON "vendors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "vendors_status_idx" ON "vendors" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_idempotent" ON "webhook_deliveries" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_org_idx" ON "webhook_deliveries" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_org_idx" ON "webhook_endpoints" USING btree ("org_id");