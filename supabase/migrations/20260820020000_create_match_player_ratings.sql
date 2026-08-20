-- Puntaje de la gente: el hincha califica jugadores con un semaforo
-- (1 rojo / 2 amarillo / 3 verde) y elige UNA figura del partido.
--
-- Una sola tabla en vez de dos: la figura es una fila mas con `is_mvp`, y un
-- indice unico parcial garantiza que cada usuario tenga como mucho una figura
-- por partido. Separar en dos tablas obligaria a un join para algo que siempre
-- se lee junto.
--
-- `match_id` es TEXT, no UUID, por la misma razon que en `match_votes`: los
-- partidos externos (fs-*, espn-*, fih-*) no tienen id de Postgres.

CREATE TABLE IF NOT EXISTS public.match_player_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Clave estable del jugador dentro del partido (la misma que arma
    -- `buildPlayerStatsTableData`). No es FK: en los partidos externos el
    -- jugador no existe como fila propia.
    player_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    team TEXT NOT NULL CHECK (team IN ('home', 'away')),
    -- Semaforo. NULL = el usuario lo eligio figura sin puntuarlo.
    rating SMALLINT CHECK (rating BETWEEN 1 AND 3),
    is_mvp BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT match_player_ratings_unique_vote UNIQUE (match_id, user_id, player_key),
    -- Una fila sin puntaje y sin figura no dice nada: se borra en vez de guardarse.
    CONSTRAINT match_player_ratings_not_empty CHECK (rating IS NOT NULL OR is_mvp)
);

CREATE INDEX IF NOT EXISTS idx_match_player_ratings_match
    ON public.match_player_ratings(match_id);

CREATE INDEX IF NOT EXISTS idx_match_player_ratings_user
    ON public.match_player_ratings(user_id);

-- Una figura por usuario y por partido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_player_ratings_one_mvp
    ON public.match_player_ratings(match_id, user_id)
    WHERE is_mvp;

DROP TRIGGER IF EXISTS trg_match_player_ratings_updated_at ON public.match_player_ratings;
CREATE TRIGGER trg_match_player_ratings_updated_at
    BEFORE UPDATE ON public.match_player_ratings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.match_player_ratings ENABLE ROW LEVEL SECURITY;

-- El agregado es publico: el puntaje de la gente se muestra sin login.
DROP POLICY IF EXISTS "public_read_match_player_ratings" ON public.match_player_ratings;
CREATE POLICY "public_read_match_player_ratings"
    ON public.match_player_ratings
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "users_insert_own_match_player_ratings" ON public.match_player_ratings;
CREATE POLICY "users_insert_own_match_player_ratings"
    ON public.match_player_ratings
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_match_player_ratings" ON public.match_player_ratings;
CREATE POLICY "users_update_own_match_player_ratings"
    ON public.match_player_ratings
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_match_player_ratings" ON public.match_player_ratings;
CREATE POLICY "users_delete_own_match_player_ratings"
    ON public.match_player_ratings
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
