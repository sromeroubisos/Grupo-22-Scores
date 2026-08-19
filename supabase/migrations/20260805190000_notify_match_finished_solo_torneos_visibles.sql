-- El aviso de "partido finalizado" sólo para torneos publicados.
--
-- `g22_notify_match_finished` es `AFTER UPDATE OF status` y no mira la
-- visibilidad: ni la del partido ni la del torneo. Leído el cuerpo original, no
-- hay una sola referencia a `is_visible`. Los destinatarios salen de
-- `user_favorite_clubs` y `user_favorite_leagues`, así que el alcance está
-- acotado por favoritos — pero acotado no es correcto: un usuario recibe el aviso
-- de una competencia que no puede abrir.
--
-- Medido antes de escribir esto: de los 949 clubes que juegan en los 126 torneos
-- de URBA sin publicar, 18 usuarios tienen alguno en favoritos.
--
-- Poner `is_visible = FALSE` en los partidos NO alcanza: los 10.917 de URBA ya
-- están así y el trigger dispara igual, porque no lee esa columna. Por eso el
-- filtro va acá y no en el dato.
--
-- Y va en el trigger y no en el envío porque el envío llega tarde: las filas de
-- `user_notifications` ya se crearon y se ven en la campanita de la app.
--
-- Lo único que cambia respecto del original es el bloque marcado abajo.

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

    -- ── lo único que se agrega ────────────────────────────────────────────────
    -- Sin torneo publicado no hay aviso. `COALESCE(..., FALSE)` deja afuera
    -- también al partido sin torneo: si no se sabe de qué competencia es, no se
    -- notifica.
    IF NOT COALESCE(
        (SELECT t.is_visible FROM public.tournaments t WHERE t.id = NEW.tournament_id),
        FALSE
    ) THEN
        RETURN NEW;
    END IF;
    -- ──────────────────────────────────────────────────────────────────────────

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
        user_id, type, title, body, entity_type, entity_id,
        match_id, club_id, tournament_id, trigger_key, metadata
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

-- El trigger no se recrea: sigue siendo el mismo `trg_g22_notify_match_finished`
-- sobre `AFTER UPDATE OF status`. Sólo cambia el cuerpo de la función.

-- Verificación después de aplicar:
--   SELECT prosrc LIKE '%t.is_visible%' AS tiene_el_filtro
--   FROM pg_proc WHERE proname = 'g22_notify_match_finished';   -- true
