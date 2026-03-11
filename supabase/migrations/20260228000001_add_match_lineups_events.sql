-- Add lineups and events columns to matches table
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS lineups JSONB DEFAULT '{"home": [], "away": []}'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS events JSONB DEFAULT '[]'::jsonb;

-- Comment on columns for clarity
COMMENT ON COLUMN public.matches.lineups IS 'Stores match lineups for both teams as JSON';
COMMENT ON COLUMN public.matches.events IS 'Stores match events (tries, cards, subs, etc.) as JSON';
