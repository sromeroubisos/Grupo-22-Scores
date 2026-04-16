ALTER TABLE public.external_tournament_standings_overrides
ADD COLUMN IF NOT EXISTS tables JSONB NOT NULL DEFAULT '[]'::jsonb;
