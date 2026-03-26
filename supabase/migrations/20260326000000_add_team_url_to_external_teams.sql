-- Add team_url column to external_teams to cache the exact FlashScore path
-- e.g. /team/san-isidro-club/2aBj1cCr/
-- This avoids re-computing (and potentially wrong) slugs on every request.
ALTER TABLE public.external_teams
    ADD COLUMN IF NOT EXISTS team_url TEXT;

COMMENT ON COLUMN public.external_teams.team_url IS
    'Exact FlashScore team URL path, e.g. /team/slug/id/. Cached on first successful details fetch.';

NOTIFY pgrst, 'reload schema';
