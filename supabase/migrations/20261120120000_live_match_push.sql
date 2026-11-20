-- Avisos en vivo del celular: un solo aviso por partido que se va reemplazando.
--
-- 1) user_match_push_state: lo ultimo que se le mando a cada usuario de cada
--    partido (marcador, fase, rojas, minuto). El cron lo compara con el partido
--    de ahora para decidir si hay un hito o no. Sin esto cada evento era un push.
--
-- 2) g22_notify_team_event: la campanita de la app mostraba "Nuevo evento de X",
--    "Min 62: Substitution de ..." (tipo en ingles, cambios como aviso, sin marcador)
--    y una carga historica de eventos generaba una rafaga de avisos de partidos
--    viejos. Ahora: texto en castellano, solo jugadas que importan, y nada de
--    partidos de hace mas de 12 horas.
--
-- Revertir: DROP TABLE public.user_match_push_state; y volver a correr el
-- CREATE OR REPLACE de g22_notify_team_event de 20260426180000_user_notifications.sql.

CREATE TABLE IF NOT EXISTS public.user_match_push_state (
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    match_id   UUID        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    home       INTEGER     NOT NULL DEFAULT 0,
    away       INTEGER     NOT NULL DEFAULT 0,
    phase      TEXT        NOT NULL DEFAULT 'first',
    red_cards  INTEGER     NOT NULL DEFAULT 0,
    minute     INTEGER,
    closed     BOOLEAN     NOT NULL DEFAULT FALSE,
    pushed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS user_match_push_state_pushed_at_idx
    ON public.user_match_push_state (pushed_at);

-- Solo la toca el cron con service_role: sin politicas, nadie mas la ve.
ALTER TABLE public.user_match_push_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.g22_notify_team_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_home_name TEXT;
    v_away_name TEXT;
    v_club_name TEXT;
    v_match_date TIMESTAMPTZ;
    v_label TEXT;
    v_title TEXT;
    v_body TEXT;
BEGIN
    IF NEW.club_id IS NULL OR NEW.event_type = '__clock_state__' THEN
        RETURN NEW;
    END IF;

    -- Solo las jugadas que cambian el partido. Cambios, lesiones y amarillas
    -- quedan en la ficha del partido, no en el celular de nadie.
    v_label := CASE NEW.event_type
        WHEN 'try'          THEN 'Try'
        WHEN 'penalty_try'  THEN 'Try penal'
        WHEN 'conversion'   THEN 'Conversión'
        WHEN 'penalty_goal' THEN 'Penal'
        WHEN 'drop_goal'    THEN 'Drop'
        WHEN 'card_red'     THEN 'Tarjeta roja'
        WHEN 'goal'         THEN 'Gol'
        ELSE NULL
    END;

    IF v_label IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT
        coalesce(home.short_name, home.name, 'Local'),
        coalesce(away.short_name, away.name, 'Visitante'),
        coalesce(event_club.short_name, event_club.name, 'Tu club'),
        m.date_time
    INTO v_home_name, v_away_name, v_club_name, v_match_date
    FROM public.matches m
    LEFT JOIN public.clubs home ON home.id = m.home_club_id
    LEFT JOIN public.clubs away ON away.id = m.away_club_id
    LEFT JOIN public.clubs event_club ON event_club.id = NEW.club_id
    WHERE m.id = NEW.match_id;

    -- Una carga historica de eventos no es un partido en juego.
    IF v_match_date IS NULL OR v_match_date < now() - INTERVAL '12 hours' THEN
        RETURN NEW;
    END IF;

    v_title := concat(v_label, ' de ', v_club_name);
    v_body := concat(
        CASE WHEN coalesce(NEW.player_name, '') <> '' THEN concat(NEW.player_name, ' · ') ELSE '' END,
        'min ', coalesce(NEW.minute, 0)::TEXT,
        ' · ', v_home_name, ' vs ', v_away_name
    );

    INSERT INTO public.user_notifications (
        user_id, type, title, body, entity_type, entity_id, match_id,
        club_id, tournament_id, event_id, trigger_key, metadata
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
$function$;
