-- Partidas guardadas de los minijuegos en la cuenta del usuario.
--
-- Una fila por usuario, juego y casillero (`slot`). En Rugby Seven el slot 0
-- son los equipos propios y la Copa Seven, y del 1 al 3 las tres partidas de
-- torneo o carrera. `data` es el JSON de ese casillero comprimido con gzip y en
-- base64: el servidor no lo abre, solo lo guarda y lo devuelve.
--
-- `saved_at` es la hora en que el juego guardó ese casillero (la del
-- dispositivo): al abrir el juego en otro lado gana el más nuevo.
--
-- El tope de `bytes` evita que una partida rota llene la base: una carrera
-- completa comprimida ronda los 30 KB.

CREATE TABLE IF NOT EXISTS public.minigame_saves (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    slot SMALLINT NOT NULL,
    data TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (user_id, game, slot),
    CONSTRAINT minigame_saves_game_format CHECK (game ~ '^[a-z0-9-]{1,40}$'),
    CONSTRAINT minigame_saves_slot_range CHECK (slot BETWEEN 0 AND 9),
    CONSTRAINT minigame_saves_bytes_max CHECK (bytes > 0 AND bytes <= 400000 AND bytes = length(data))
);

COMMENT ON TABLE public.minigame_saves IS 'Partidas de los minijuegos en la cuenta: un casillero por fila, JSON comprimido (gzip + base64).';

ALTER TABLE public.minigame_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minigame_saves_select_own ON public.minigame_saves;
CREATE POLICY minigame_saves_select_own ON public.minigame_saves
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS minigame_saves_insert_own ON public.minigame_saves;
CREATE POLICY minigame_saves_insert_own ON public.minigame_saves
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS minigame_saves_update_own ON public.minigame_saves;
CREATE POLICY minigame_saves_update_own ON public.minigame_saves
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS minigame_saves_delete_own ON public.minigame_saves;
CREATE POLICY minigame_saves_delete_own ON public.minigame_saves
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.minigame_saves TO authenticated;
