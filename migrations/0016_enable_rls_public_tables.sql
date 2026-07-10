-- Security fix: enable Row-Level Security on all remaining public tables.
--
-- Context: this project connects to Postgres directly via the `postgres`
-- role (BYPASSRLS = true), so the application backend is completely
-- unaffected by RLS. Supabase's auto-generated PostgREST API, however,
-- grants `anon`/`authenticated` roles full CRUD on every table in the
-- `public` schema by default. Since this app never uses the Supabase
-- client/PostgREST API, there is no legitimate use case for direct
-- table access from those roles — enabling RLS with zero policies makes
-- Supabase's public REST API return no rows for these tables (default
-- deny), closing the "rls_disabled_in_public" / "sensitive_columns_exposed"
-- Security Advisor findings without touching app behavior.
--
-- This mirrors the existing convention already used by other tables in
-- this project (RLS enabled, zero policies == default deny), and matches
-- the `rls_auto_enable` event trigger that already auto-enables RLS on
-- newly created tables.

ALTER TABLE public.ai_support_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_payment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_profits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_numbers ENABLE ROW LEVEL SECURITY;
