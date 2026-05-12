CREATE TABLE IF NOT EXISTS "banners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "image_data" text,
  "image_url" text,
  "link_url" text,
  "link_label" text,
  "bg_from" text DEFAULT '#7C3AED' NOT NULL,
  "bg_to" text DEFAULT '#4C1D95' NOT NULL,
  "text_color" text DEFAULT '#FFFFFF' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform" text NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "color" text DEFAULT '#8B5CF6',
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_operators" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "logo_url" text,
  "logo_data" text,
  "website_url" text,
  "countries" text,
  "bg_color" text DEFAULT '#1a1a2e',
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
