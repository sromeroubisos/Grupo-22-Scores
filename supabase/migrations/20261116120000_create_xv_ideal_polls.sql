-- Votación del XV Ideal de un torneo (o de una zona de un torneo).
--
-- `xv_ideal_polls`: una fila por votación. `group_key` agrupa las votaciones
-- que se muestran juntas en una misma pantalla (/xv-ideal/{group_key}): hoy el
-- Argentino Juvenil M17 2026 tiene dos, Zona Campeonato y Zona Ascenso.
-- `slots` es JSONB, una entrada por camiseta con sus candidatos:
--   [{ jersey: 1, label: 'Pilar izquierdo',
--      candidates: [{ id, name, team, pj, points }] }]
-- La forma la define `XvSlot` en src/lib/xvIdeal/xvIdeal.ts.
--
-- `xv_ideal_votes`: una fila por votante y votación. `picks` es
-- { "{camiseta}": "{candidateId}" }; se puede votar solo algunos puestos y
-- volver a votar pisa la boleta entera (llave primaria poll_id + user_id).
--
-- `tournament_id` es TEXT y sin FK, como video_polls: es solo un vínculo para
-- mostrar de qué torneo sale la votación.
--
-- Hasta que esta migración corra, src/lib/server/xvIdeal.ts contesta "no
-- disponible" y la pantalla lo dice.

CREATE TABLE IF NOT EXISTS public.xv_ideal_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_key TEXT NOT NULL,
    tournament_id TEXT,
    -- Cómo se llama en pantalla: "Zona Campeonato".
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    -- Orden dentro del grupo (0 = primera pestaña).
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    slots JSONB NOT NULL DEFAULT '[]'::jsonb,
    closes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT xv_ideal_polls_slots_is_array CHECK (jsonb_typeof(slots) = 'array')
);

COMMENT ON TABLE public.xv_ideal_polls IS 'Votaciones del XV Ideal: una por zona/torneo, con los candidatos de cada camiseta en JSONB.';

CREATE INDEX IF NOT EXISTS idx_xv_ideal_polls_group_key
    ON public.xv_ideal_polls(group_key);

DROP TRIGGER IF EXISTS trg_xv_ideal_polls_updated_at ON public.xv_ideal_polls;
CREATE TRIGGER trg_xv_ideal_polls_updated_at
    BEFORE UPDATE ON public.xv_ideal_polls
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.xv_ideal_votes (
    poll_id UUID NOT NULL REFERENCES public.xv_ideal_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    picks JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (poll_id, user_id),
    CONSTRAINT xv_ideal_votes_picks_is_object CHECK (jsonb_typeof(picks) = 'object')
);

COMMENT ON TABLE public.xv_ideal_votes IS 'Una boleta por persona y votación: { camiseta: candidato }. Volver a votar la reemplaza.';

CREATE INDEX IF NOT EXISTS idx_xv_ideal_votes_user_id
    ON public.xv_ideal_votes(user_id);

DROP TRIGGER IF EXISTS trg_xv_ideal_votes_updated_at ON public.xv_ideal_votes;
CREATE TRIGGER trg_xv_ideal_votes_updated_at
    BEFORE UPDATE ON public.xv_ideal_votes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.xv_ideal_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xv_ideal_votes ENABLE ROW LEVEL SECURITY;

-- Las votaciones se ven sin login. Los votos NO son públicos: traen el
-- user_id de cada persona y los resultados salen agregados por el servidor.
DROP POLICY IF EXISTS "public_read_xv_ideal_polls" ON public.xv_ideal_polls;
CREATE POLICY "public_read_xv_ideal_polls"
    ON public.xv_ideal_polls
    FOR SELECT
    USING (true);

-- Crear y cerrar votaciones, y votar, pasan por service_role desde el
-- servidor (que valida sesión, que la votación esté abierta y que cada
-- candidato exista). No hay política de escritura para anon/authenticated a
-- propósito.

NOTIFY pgrst, 'reload schema';
