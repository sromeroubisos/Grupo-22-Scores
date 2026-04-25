BEGIN;

-- =========================================================
-- Club Match Workspace Persistence Hardening
-- Ensures the club-admin match workspace can persist:
-- - broadcast / stream / replay links
-- - referee / venue context
-- - notes / round label / category
-- - live clock
-- - full lineups workspace payload (callups, media, workflow, etc.) in JSONB
-- - full event timeline payload in JSONB
-- - relational match_events support for analytics
-- =========================================================

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS round_label TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS referee TEXT,
    ADD COLUMN IF NOT EXISTS pitch TEXT,
    ADD COLUMN IF NOT EXISTS broadcast_url TEXT,
    ADD COLUMN IF NOT EXISTS stream_url TEXT,
    ADD COLUMN IF NOT EXISTS replay_url TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS clock JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS lineups JSONB DEFAULT '{"home": [], "away": []}'::jsonb,
    ADD COLUMN IF NOT EXISTS events JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS home_division_id UUID,
    ADD COLUMN IF NOT EXISTS away_division_id UUID;

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

UPDATE public.matches
SET
    clock = COALESCE(clock, '{}'::jsonb),
    lineups = COALESCE(lineups, '{"home": [], "away": []}'::jsonb),
    events = COALESCE(events, '[]'::jsonb)
WHERE
    clock IS NULL
    OR lineups IS NULL
    OR events IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'matches_clock_is_object_chk'
          AND conrelid = 'public.matches'::regclass
    ) THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT matches_clock_is_object_chk
            CHECK (clock IS NULL OR jsonb_typeof(clock) = 'object');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'matches_lineups_is_object_chk'
          AND conrelid = 'public.matches'::regclass
    ) THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT matches_lineups_is_object_chk
            CHECK (lineups IS NULL OR jsonb_typeof(lineups) = 'object');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'matches_events_is_array_chk'
          AND conrelid = 'public.matches'::regclass
    ) THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT matches_events_is_array_chk
            CHECK (events IS NULL OR jsonb_typeof(events) = 'array');
    END IF;
END $$;

COMMENT ON COLUMN public.matches.round_label IS 'Etiqueta manual de la jornada (ej: Fecha 1, Semifinal).';
COMMENT ON COLUMN public.matches.category IS 'Categoria o division operativa del partido.';
COMMENT ON COLUMN public.matches.referee IS 'Arbitro principal asignado al partido.';
COMMENT ON COLUMN public.matches.pitch IS 'Cancha o campo especifico dentro de la sede.';
COMMENT ON COLUMN public.matches.broadcast_url IS 'Enlace principal de transmision del partido.';
COMMENT ON COLUMN public.matches.stream_url IS 'Enlace tecnico alternativo de stream en vivo.';
COMMENT ON COLUMN public.matches.replay_url IS 'Enlace de repeticion o video bajo demanda del partido.';
COMMENT ON COLUMN public.matches.notes IS 'Notas operativas o deportivas del partido.';
COMMENT ON COLUMN public.matches.clock IS 'Estado del reloj en vivo { minute, seconds, period, running, syncedAt }.';
COMMENT ON COLUMN public.matches.lineups IS 'Payload completo del workspace de alineaciones y operacion del club.';
COMMENT ON COLUMN public.matches.events IS 'Timeline JSONB compatible con el workspace del club, incluyendo videoTime y jerarquia.';
COMMENT ON COLUMN public.matches.home_division_id IS 'Plantel/division elegida para el equipo local.';
COMMENT ON COLUMN public.matches.away_division_id IS 'Plantel/division elegida para el equipo visitante.';

CREATE INDEX IF NOT EXISTS idx_matches_home_division_id ON public.matches(home_division_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_division_id ON public.matches(away_division_id);
CREATE INDEX IF NOT EXISTS idx_matches_round_label ON public.matches(round_label);
CREATE INDEX IF NOT EXISTS idx_matches_status_date_time ON public.matches(status, date_time DESC);
CREATE INDEX IF NOT EXISTS idx_matches_lineups_gin ON public.matches USING GIN (lineups);
CREATE INDEX IF NOT EXISTS idx_matches_events_gin ON public.matches USING GIN (events);
CREATE INDEX IF NOT EXISTS idx_matches_clock_gin ON public.matches USING GIN (clock);

CREATE TABLE IF NOT EXISTS public.match_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    club_id TEXT REFERENCES public.clubs(id),
    player_id UUID,
    player_name TEXT,
    event_type TEXT NOT NULL,
    minute INTEGER,
    second INTEGER,
    extra_time INTEGER,
    video_time TEXT,
    parent_event_id UUID NULL,
    sequence INTEGER,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.match_events
    ADD COLUMN IF NOT EXISTS video_time TEXT,
    ADD COLUMN IF NOT EXISTS parent_event_id UUID,
    ADD COLUMN IF NOT EXISTS sequence INTEGER;

ALTER TABLE public.match_events
    ALTER COLUMN details SET DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'match_events_parent_event_id_fkey'
          AND conrelid = 'public.match_events'::regclass
    ) THEN
        ALTER TABLE public.match_events
            ADD CONSTRAINT match_events_parent_event_id_fkey
            FOREIGN KEY (parent_event_id)
            REFERENCES public.match_events(id)
            ON DELETE CASCADE
            DEFERRABLE INITIALLY DEFERRED;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'match_events_details_is_object_chk'
          AND conrelid = 'public.match_events'::regclass
    ) THEN
        ALTER TABLE public.match_events
            ADD CONSTRAINT match_events_details_is_object_chk
            CHECK (details IS NULL OR jsonb_typeof(details) = 'object');
    END IF;
END $$;

COMMENT ON TABLE public.match_events IS 'Eventos relacionales del partido para analytics, timeline y automatizaciones.';
COMMENT ON COLUMN public.match_events.video_time IS 'Marca de video MM:SS capturada en la consola de club.';
COMMENT ON COLUMN public.match_events.parent_event_id IS 'Evento padre para eventos derivados, por ejemplo scrum generado por knock-on.';
COMMENT ON COLUMN public.match_events.sequence IS 'Orden relativo entre eventos del mismo minuto o cadena derivada.';
COMMENT ON COLUMN public.match_events.details IS 'Metadata libre del evento: team, detail, playerName, legacy_id, etc.';

CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON public.match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON public.match_events(player_id);
CREATE INDEX IF NOT EXISTS idx_match_events_club_id ON public.match_events(club_id);
CREATE INDEX IF NOT EXISTS idx_match_events_type ON public.match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_match_events_match_minute ON public.match_events(match_id, minute, sequence);
CREATE INDEX IF NOT EXISTS idx_match_events_parent_event_id ON public.match_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_match_events_video_time ON public.match_events(video_time);
CREATE INDEX IF NOT EXISTS idx_match_events_details_gin ON public.match_events USING GIN (details);

ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read match events" ON public.match_events;
DROP POLICY IF EXISTS "Admins can manage match events" ON public.match_events;
DROP POLICY IF EXISTS "match_events_select" ON public.match_events;
DROP POLICY IF EXISTS "match_events_insert" ON public.match_events;
DROP POLICY IF EXISTS "match_events_update" ON public.match_events;
DROP POLICY IF EXISTS "match_events_delete" ON public.match_events;

CREATE POLICY "match_events_select"
    ON public.match_events
    FOR SELECT
    USING (true);

CREATE POLICY "match_events_insert"
    ON public.match_events
    FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "match_events_update"
    ON public.match_events
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "match_events_delete"
    ON public.match_events
    FOR DELETE
    USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
