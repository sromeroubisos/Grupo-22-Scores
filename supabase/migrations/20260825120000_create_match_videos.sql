-- Videos del partido: highlights, partido completo o clips, cargados a mano
-- como links (YouTube, Vimeo, Dailymotion, Facebook o cualquier otro sitio).
--
-- Una fila por partido con la lista en JSONB, no una fila por video: la lista
-- se edita entera desde la pestaña y son pocos links por partido. Así el
-- guardado es un solo upsert y no hay que borrar e insertar en dos pasos.
--
-- `match_id` es TEXT por la misma razón que en match_votes y
-- match_player_ratings: los partidos externos (FlashScore, ESPN, FIH) no
-- tienen id de Postgres, y el video se cuelga de cualquiera de los dos.
--
-- Hasta que esta migración corra, `src/lib/server/matchVideos.ts` guarda en
-- external_tournament_standings_overrides con id 'match-videos:{matchId}'
-- (el mismo respaldo que usan los overrides de alineación externa). Al
-- aplicarla, las filas viejas se siguen leyendo; el próximo guardado de cada
-- partido ya escribe acá.

CREATE TABLE IF NOT EXISTS public.match_videos (
    match_id TEXT PRIMARY KEY,
    -- Lista de { id, url, kind, title, provider, addedAt }. La forma la
    -- define `MatchVideoLink` en src/lib/matches/videoLinks.ts.
    videos JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT match_videos_is_array CHECK (jsonb_typeof(videos) = 'array')
);

COMMENT ON TABLE public.match_videos IS 'Links de video de un partido (highlights, partido completo, clips). Una fila por partido.';

DROP TRIGGER IF EXISTS trg_match_videos_updated_at ON public.match_videos;
CREATE TRIGGER trg_match_videos_updated_at
    BEFORE UPDATE ON public.match_videos
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.match_videos ENABLE ROW LEVEL SECURITY;

-- La lista es pública: la pestaña se ve sin login.
DROP POLICY IF EXISTS "public_read_match_videos" ON public.match_videos;
CREATE POLICY "public_read_match_videos"
    ON public.match_videos
    FOR SELECT
    USING (true);

-- Escritura solo por service_role desde PUT /api/matches/[id]/videos, que
-- valida el permiso sobre el torneo del partido (ensureMatchManagementAccess).
-- No hay política de escritura para anon/authenticated a propósito.

NOTIFY pgrst, 'reload schema';
