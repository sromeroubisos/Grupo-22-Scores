-- Votación al mejor try (gol, punto: lo que se anote en ese deporte) dentro
-- del hub de videos de un torneo (/noticias/videos/{torneo}).
--
-- `video_polls`: una fila por votación, las opciones en JSONB. Cada opción es
-- un video ya cargado en la ficha de un partido del torneo, con el título con
-- el que se presenta en la votación:
--   { id: '{matchId}|{videoId}', matchId, videoId, label }
-- La forma la define `VideoPoll` en src/lib/videoHub/polls.ts.
--
-- `video_poll_votes`: una fila por votante y votación. Cambiar el voto la
-- pisa (llave primaria poll_id + user_id), igual que en match_votes.
--
-- `tournament_id` es TEXT y sin FK a propósito, como match_votes.match_id:
-- la llave es la que viaja en la URL del hub.
--
-- Hasta que esta migración corra, `src/lib/server/videoPolls.ts` contesta
-- "no disponible" y el hub se lo dice a quien administra; para el hincha la
-- sección de votación no existe.

CREATE TABLE IF NOT EXISTS public.video_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id TEXT NOT NULL,
    -- El nombre de la votación, casi siempre la fecha ("Fecha 19"); `title` es la pregunta.
    name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Pasada esta fecha la votación se cierra sola (lo decide el servidor al
    -- leer y al votar). NULL = sin fecha de cierre.
    closes_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT video_polls_options_is_array CHECK (jsonb_typeof(options) = 'array')
);

COMMENT ON TABLE public.video_polls IS 'Votaciones al mejor try/gol del hub de videos de un torneo. Las opciones son videos de partidos.';

-- Por si la tabla se creó con una versión anterior de este archivo.
ALTER TABLE public.video_polls ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
ALTER TABLE public.video_polls ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_video_polls_tournament_id
    ON public.video_polls(tournament_id);

DROP TRIGGER IF EXISTS trg_video_polls_updated_at ON public.video_polls;
CREATE TRIGGER trg_video_polls_updated_at
    BEFORE UPDATE ON public.video_polls
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.video_poll_votes (
    poll_id UUID NOT NULL REFERENCES public.video_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (poll_id, user_id)
);

COMMENT ON TABLE public.video_poll_votes IS 'Un voto por persona y votación; volver a votar lo cambia.';

CREATE INDEX IF NOT EXISTS idx_video_poll_votes_user_id
    ON public.video_poll_votes(user_id);

DROP TRIGGER IF EXISTS trg_video_poll_votes_updated_at ON public.video_poll_votes;
CREATE TRIGGER trg_video_poll_votes_updated_at
    BEFORE UPDATE ON public.video_poll_votes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.video_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_poll_votes ENABLE ROW LEVEL SECURITY;

-- Las votaciones y sus resultados son públicos: el hub se ve sin login.
DROP POLICY IF EXISTS "public_read_video_polls" ON public.video_polls;
CREATE POLICY "public_read_video_polls"
    ON public.video_polls
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "public_read_video_poll_votes" ON public.video_poll_votes;
CREATE POLICY "public_read_video_poll_votes"
    ON public.video_poll_votes
    FOR SELECT
    USING (true);

-- Crear/cerrar/borrar una votación pasa por service_role desde
-- /api/video-polls, que exige acceso editorial (hasNewsManagementAccess).
-- El voto también entra por la API (/api/video-polls/{id}/vote), que valida
-- que la votación esté abierta y que la opción exista; no hay política de
-- escritura para anon/authenticated a propósito.

NOTIFY pgrst, 'reload schema';
