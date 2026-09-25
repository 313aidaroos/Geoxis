-- SECURITY: current_asset_positions ran as its owner (bypassing RLS) and anon/authenticated
-- could SELECT it, exposing every tenant's asset positions. The dashboard reads it with the
-- service role filtered by tenant (lib/supabaseServer.js). Applied live 2026-09-23.
alter view public.current_asset_positions set (security_invoker = true);
revoke all on public.current_asset_positions from anon, authenticated;
grant select on public.current_asset_positions to service_role;
