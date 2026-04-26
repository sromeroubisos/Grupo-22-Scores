-- In-app notifications for followed teams and tournaments.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('match_finished', 'team_event')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('match', 'club', 'tournament')),
    entity_id TEXT NOT NULL,
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
    club_id TEXT REFERENCES public.clubs(id) ON DELETE SET NULL,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    event_id TEXT,
    trigger_key TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notifications
    ADD COLUMN IF NOT EXISTS event_id TEXT,
    ADD COLUMN IF NOT EXISTS trigger_key TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_notifications_user_trigger_key_key'
          AND conrelid = 'public.user_notifications'::regclass
    ) THEN
        ALTER TABLE public.user_notifications
            ADD CONSTRAINT user_notifications_user_trigger_key_key
            UNIQUE (user_id, trigger_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
    ON public.user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
    ON public.user_notifications(user_id, created_at DESC)
    WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_notifications_match_id
    ON public.user_notifications(match_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_club_id
    ON public.user_notifications(club_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_tournament_id
    ON public.user_notifications(tournament_id);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Users delete own notifications" ON public.user_notifications;

CREATE POLICY "Users read own notifications"
    ON public.user_notifications
    FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own notifications"
    ON public.user_notifications
    FOR UPDATE
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own notifications"
    ON public.user_notifications
    FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, UPDATE, DELETE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.g22_is_final_match_status(value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lower(trim(coalesce(value, ''))) = ANY (ARRAY['final', 'finished', 'completed', 'ft']);
$$;

CREATE OR REPLACE FUNCTION public.g22_notify_match_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_home_name TEXT;
    v_away_name TEXT;
    v_tournament_name TEXT;
    v_tournament_external_id TEXT;
    v_home_score TEXT;
    v_away_score TEXT;
    v_team_ids TEXT[];
    v_tournament_ids TEXT[];
    v_title TEXT;
    v_body TEXT;
BEGIN
    IF NOT (
        public.g22_is_final_match_status(NEW.status)
        AND NOT public.g22_is_final_match_status(OLD.status)
    ) THEN
        RETURN NEW;
    END IF;

    SELECT
        coalesce(home.short_name, home.name, 'Local'),
        coalesce(away.short_name, away.name, 'Visitante'),
        coalesce(t.name, 'Torneo'),
        t.external_id
    INTO v_home_name, v_away_name, v_tournament_name, v_tournament_external_id
    FROM public.matches m
    LEFT JOIN public.clubs home ON home.id = m.home_club_id
    LEFT JOIN public.clubs away ON away.id = m.away_club_id
    LEFT JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE m.id = NEW.id;

    v_home_score := coalesce(NEW.score->>'home', '0');
    v_away_score := coalesce(NEW.score->>'away', '0');
    v_team_ids := array_remove(ARRAY[NEW.home_club_id, NEW.away_club_id], NULL);
    v_tournament_ids := array_remove(ARRAY[NEW.tournament_id::TEXT, v_tournament_external_id], NULL);
    v_title := 'Partido finalizado';
    v_body := concat('Final: ', v_home_name, ' ', v_home_score, '-', v_away_score, ' ', v_away_name, ' en ', v_tournament_name, '.');

    WITH recipient_sources AS (
        SELECT user_id, 'club'::TEXT AS source
        FROM public.user_favorite_clubs
        WHERE club_id = ANY (v_team_ids)
           OR canonical_club_id = ANY (v_team_ids)

        UNION ALL

        SELECT user_id, 'tournament'::TEXT AS source
        FROM public.user_favorite_leagues
        WHERE league_id = ANY (v_tournament_ids)
           OR canonical_league_id = ANY (v_tournament_ids)
    ),
    recipients AS (
        SELECT user_id, array_agg(DISTINCT source ORDER BY source) AS sources
        FROM recipient_sources
        GROUP BY user_id
    )
    INSERT INTO public.user_notifications (
        user_id,
        type,
        title,
        body,
        entity_type,
        entity_id,
        match_id,
        club_id,
        tournament_id,
        trigger_key,
        metadata
    )
    SELECT
        r.user_id,
        'match_finished',
        v_title,
        v_body,
        'match',
        NEW.id::TEXT,
        NEW.id,
        NULL,
        NEW.tournament_id,
        concat('match_finished:', NEW.id::TEXT),
        jsonb_build_object(
            'sources', r.sources,
            'homeClubId', NEW.home_club_id,
            'awayClubId', NEW.away_club_id,
            'homeTeam', v_home_name,
            'awayTeam', v_away_name,
            'homeScore', v_home_score,
            'awayScore', v_away_score,
            'tournamentName', v_tournament_name
        )
    FROM recipients r
    ON CONFLICT (user_id, trigger_key) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_g22_notify_match_finished ON public.matches;
CREATE TRIGGER trg_g22_notify_match_finished
    AFTER UPDATE OF status ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION public.g22_notify_match_finished();

CREATE OR REPLACE FUNCTION public.g22_notify_team_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_home_name TEXT;
    v_away_name TEXT;
    v_club_name TEXT;
    v_event_label TEXT;
    v_title TEXT;
    v_body TEXT;
BEGIN
    IF NEW.club_id IS NULL OR NEW.event_type = '__clock_state__' THEN
        RETURN NEW;
    END IF;

    SELECT
        coalesce(home.short_name, home.name, 'Local'),
        coalesce(away.short_name, away.name, 'Visitante'),
        coalesce(event_club.short_name, event_club.name, 'Tu equipo')
    INTO v_home_name, v_away_name, v_club_name
    FROM public.matches m
    LEFT JOIN public.clubs home ON home.id = m.home_club_id
    LEFT JOIN public.clubs away ON away.id = m.away_club_id
    LEFT JOIN public.clubs event_club ON event_club.id = NEW.club_id
    WHERE m.id = NEW.match_id;

    v_event_label := initcap(replace(coalesce(NEW.event_type, 'evento'), '_', ' '));
    v_title := concat('Nuevo evento de ', v_club_name);
    v_body := concat(
        'Min ',
        coalesce(NEW.minute, 0)::TEXT,
        ': ',
        v_event_label,
        CASE WHEN coalesce(NEW.player_name, '') <> '' THEN concat(' de ', NEW.player_name) ELSE '' END,
        ' en ',
        v_home_name,
        ' vs ',
        v_away_name,
        '.'
    );

    INSERT INTO public.user_notifications (
        user_id,
        type,
        title,
        body,
        entity_type,
        entity_id,
        match_id,
        club_id,
        tournament_id,
        event_id,
        trigger_key,
        metadata
    )
    SELECT DISTINCT
        fav.user_id,
        'team_event',
        v_title,
        v_body,
        'match',
        NEW.match_id::TEXT,
        NEW.match_id,
        NEW.club_id,
        m.tournament_id,
        NEW.id::TEXT,
        concat('team_event:', NEW.match_id::TEXT, ':', NEW.id::TEXT),
        jsonb_build_object(
            'eventType', NEW.event_type,
            'minute', NEW.minute,
            'playerName', NEW.player_name,
            'clubName', v_club_name,
            'homeTeam', v_home_name,
            'awayTeam', v_away_name
        )
    FROM public.user_favorite_clubs fav
    JOIN public.matches m ON m.id = NEW.match_id
    WHERE fav.club_id = NEW.club_id
       OR fav.canonical_club_id = NEW.club_id
    ON CONFLICT (user_id, trigger_key) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_g22_notify_team_event ON public.match_events;
CREATE TRIGGER trg_g22_notify_team_event
    AFTER INSERT ON public.match_events
    FOR EACH ROW
    EXECUTE FUNCTION public.g22_notify_team_event();

NOTIFY pgrst, 'reload schema';

COMMIT;
