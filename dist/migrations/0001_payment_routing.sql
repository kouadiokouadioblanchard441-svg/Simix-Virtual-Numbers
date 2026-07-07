CREATE TABLE IF NOT EXISTS "mobile_operators" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "logo_url" text,
        "color" text DEFAULT '#6B7280' NOT NULL,
        "country_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "sort_order" integer DEFAULT 100 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "mobile_operators_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_gateways" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "logo_url" text,
        "api_url" text,
        "api_key" text,
        "api_secret" text,
        "webhook_secret" text,
        "type" text DEFAULT 'both' NOT NULL,
        "supported_countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "supported_operators" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "test_mode" boolean DEFAULT false NOT NULL,
        "notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "payment_gateways_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_routes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "country_code" text NOT NULL,
        "operator_slug" text NOT NULL,
        "transaction_type" text DEFAULT 'deposit' NOT NULL,
        "primary_gateway_id" uuid,
        "secondary_gateway_id" uuid,
        "tertiary_gateway_id" uuid,
        "active" boolean DEFAULT true NOT NULL,
        "maintenance_mode" boolean DEFAULT false NOT NULL,
        "maintenance_message" text,
        "notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "payment_routes_country_operator_type_unique" UNIQUE("country_code","operator_slug","transaction_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_route_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "route_id" uuid,
        "gateway_id" uuid,
        "transaction_id" text,
        "event_type" text DEFAULT 'payment' NOT NULL,
        "status" text DEFAULT 'success' NOT NULL,
        "response_time_ms" integer,
        "error_message" text,
        "metadata" jsonb,
        "admin_id" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_routes" ADD CONSTRAINT "payment_routes_primary_gateway_id_payment_gateways_id_fk" FOREIGN KEY ("primary_gateway_id") REFERENCES "public"."payment_gateways"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_routes" ADD CONSTRAINT "payment_routes_secondary_gateway_id_payment_gateways_id_fk" FOREIGN KEY ("secondary_gateway_id") REFERENCES "public"."payment_gateways"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_routes" ADD CONSTRAINT "payment_routes_tertiary_gateway_id_payment_gateways_id_fk" FOREIGN KEY ("tertiary_gateway_id") REFERENCES "public"."payment_gateways"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_route_logs" ADD CONSTRAINT "payment_route_logs_route_id_payment_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."payment_routes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_route_logs" ADD CONSTRAINT "payment_route_logs_gateway_id_payment_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."payment_gateways"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "mobile_operators" ("name", "slug", "color", "country_codes", "sort_order") VALUES
  ('MTN Mobile Money', 'mtn', '#FFCC00', '["CI","CM","GH","SN","BJ","TG","GN","RW","UG","ZA"]', 1),
  ('Orange Money', 'orange', '#FF6600', '["CI","CM","SN","ML","BF","GN","MR","MG","CM"]', 2),
  ('Moov Money', 'moov', '#0099CC', '["CI","BJ","TG","BF","NE","ML"]', 3),
  ('Wave', 'wave', '#1ABCFE', '["SN","CI","ML","BF","GN","UG","TZ"]', 4),
  ('Airtel Money', 'airtel', '#E40000', '["CM","GH","KE","TZ","UG","MW","ZM","CD","RW"]', 5),
  ('Free Money', 'free', '#CC0066', '["SN"]', 6),
  ('Wizall Money', 'wizall', '#6600CC', '["SN","CI"]', 7),
  ('M-Pesa', 'mpesa', '#00A651', '["KE","TZ","GH","MZ","LS","EG"]', 8),
  ('Campay', 'campay', '#1A237E', '["CM"]', 9),
  ('YAS', 'yas', '#9C27B0', '["CI"]', 10);
