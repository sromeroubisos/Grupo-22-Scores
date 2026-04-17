-- Restore public read access for external override caches.
-- These tables are read from public server routes when the app falls back
-- to the anon Supabase client (for example when service_role is not present
-- in the runtime). Without SELECT policies, overrides can be written by
-- authenticated admins but remain invisible in the deployed public views.

ALTER TABLE IF EXISTS public.external_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.external_tournament_standings_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.external_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "External tournaments are viewable by everyone"
    ON public.external_tournaments;
DROP POLICY IF EXISTS external_tournaments_select
    ON public.external_tournaments;
CREATE POLICY external_tournaments_select
    ON public.external_tournaments
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "External tournament standings overrides are viewable by everyone"
    ON public.external_tournament_standings_overrides;
DROP POLICY IF EXISTS external_tournament_standings_overrides_select
    ON public.external_tournament_standings_overrides;
CREATE POLICY external_tournament_standings_overrides_select
    ON public.external_tournament_standings_overrides
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "External teams are viewable by everyone"
    ON public.external_teams;
DROP POLICY IF EXISTS external_teams_select
    ON public.external_teams;
CREATE POLICY external_teams_select
    ON public.external_teams
    FOR SELECT
    TO anon, authenticated
    USING (true);
