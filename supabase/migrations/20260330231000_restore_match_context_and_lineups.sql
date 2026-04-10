BEGIN;

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS home_division_id UUID,
    ADD COLUMN IF NOT EXISTS away_division_id UUID,
    ADD COLUMN IF NOT EXISTS lineups JSONB DEFAULT '{"home": [], "away": []}'::jsonb,
    ADD COLUMN IF NOT EXISTS events JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF to_regclass('public.club_divisions') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'matches_home_division_id_fkey'
              AND conrelid = 'public.matches'::regclass
        ) THEN
            ALTER TABLE public.matches
                ADD CONSTRAINT matches_home_division_id_fkey
                FOREIGN KEY (home_division_id)
                REFERENCES public.club_divisions(id)
                ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'matches_away_division_id_fkey'
              AND conrelid = 'public.matches'::regclass
        ) THEN
            ALTER TABLE public.matches
                ADD CONSTRAINT matches_away_division_id_fkey
                FOREIGN KEY (away_division_id)
                REFERENCES public.club_divisions(id)
                ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_home_division_id ON public.matches(home_division_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_division_id ON public.matches(away_division_id);

COMMENT ON COLUMN public.matches.category IS 'Categoría o división operativa del partido.';
COMMENT ON COLUMN public.matches.home_division_id IS 'Plantel/división elegida para el equipo local.';
COMMENT ON COLUMN public.matches.away_division_id IS 'Plantel/división elegida para el equipo visitante.';
COMMENT ON COLUMN public.matches.lineups IS 'Alineaciones persistidas del partido en formato local { home, away }.';
COMMENT ON COLUMN public.matches.events IS 'Eventos del partido normalizados para compatibilidad con vistas locales.';

COMMIT;
