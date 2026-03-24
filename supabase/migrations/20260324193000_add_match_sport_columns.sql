ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS sport_id TEXT,
ADD COLUMN IF NOT EXISTS sport TEXT;

CREATE INDEX IF NOT EXISTS idx_matches_sport_id ON public.matches (sport_id);

UPDATE public.matches AS m
SET sport_id = COALESCE(
  m.sport_id,
  (
    SELECT COALESCE(t.sport_id, t.sport)
    FROM public.tournaments AS t
    WHERE t.id = m.tournament_id
    LIMIT 1
  ),
  (
    SELECT COALESCE(c.sport_id, c.sport)
    FROM public.clubs AS c
    WHERE c.id = m.home_club_id
    LIMIT 1
  ),
  (
    SELECT COALESCE(c.sport_id, c.sport)
    FROM public.clubs AS c
    WHERE c.id = m.away_club_id
    LIMIT 1
  )
)
WHERE m.sport_id IS NULL;

UPDATE public.matches AS m
SET sport = COALESCE(
  m.sport,
  m.sport_id,
  (
    SELECT COALESCE(t.sport_id, t.sport)
    FROM public.tournaments AS t
    WHERE t.id = m.tournament_id
    LIMIT 1
  ),
  (
    SELECT COALESCE(c.sport_id, c.sport)
    FROM public.clubs AS c
    WHERE c.id = m.home_club_id
    LIMIT 1
  ),
  (
    SELECT COALESCE(c.sport_id, c.sport)
    FROM public.clubs AS c
    WHERE c.id = m.away_club_id
    LIMIT 1
  )
)
WHERE m.sport IS NULL;
