BEGIN;

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS home_division_id UUID REFERENCES public.club_divisions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS away_division_id UUID REFERENCES public.club_divisions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lineups JSONB DEFAULT '{"home": [], "away": []}'::jsonb,
    ADD COLUMN IF NOT EXISTS events JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_matches_home_division_id ON public.matches(home_division_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_division_id ON public.matches(away_division_id);

COMMENT ON COLUMN public.matches.category IS 'Categoría o división operativa del partido.';
COMMENT ON COLUMN public.matches.home_division_id IS 'Plantel/división elegida para el equipo local.';
COMMENT ON COLUMN public.matches.away_division_id IS 'Plantel/división elegida para el equipo visitante.';
COMMENT ON COLUMN public.matches.lineups IS 'Alineaciones persistidas del partido en formato local { home, away }.';
COMMENT ON COLUMN public.matches.events IS 'Eventos del partido normalizados para compatibilidad con vistas locales.';

COMMIT;
