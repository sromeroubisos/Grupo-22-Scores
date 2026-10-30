-- Salida 22 Awards y Corner Corto Awards (/awards).
--
-- Tres etapas por edición: postulaciones → votación → resultados. La gente
-- postula (jugadores, clubes y jugadas de los pibes), un editor revisa, el
-- sistema arma la terna con los MÁS POSTULADOS de cada categoría y después
-- vota quien tenga mail verificado. Las categorías viven en código
-- (src/lib/awards/config.ts); acá solo se guarda lo que la gente hace.
--
-- Todo se lee y escribe con service_role desde las rutas /api/awards: RLS
-- queda prendida y sin políticas, y se le quita el acceso a anon y a
-- authenticated (lección de la auditoría del 2026-10-15: una tabla con
-- escritura abierta es una tabla pública).
--
-- Hasta que esta migración corra, src/lib/server/awards.ts contesta
-- "no disponible" y la página se lo dice a quien administra.

CREATE TABLE IF NOT EXISTS public.award_editions (
    slug TEXT PRIMARY KEY,
    season INTEGER NOT NULL,
    stage TEXT NOT NULL DEFAULT 'postulaciones'
        CHECK (stage IN ('postulaciones', 'votacion', 'resultados')),
    -- Fechas informativas que muestra la página; las etapas las cambia un editor.
    nominations_close_at TIMESTAMPTZ,
    voting_close_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Una fila por persona que postula. Postular a la misma persona dos veces
-- (mismo usuario, misma categoría) no suma: la unicidad lo impide. El
-- "apoyo" de un candidato es la cantidad de usuarios distintos que lo postularon.
CREATE TABLE IF NOT EXISTS public.award_nominations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition TEXT NOT NULL REFERENCES public.award_editions(slug) ON DELETE CASCADE,
    category TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Identidad del candidato: el id de people / clubs si está en la base,
    -- o "n:nombre|club" para un nombre escrito a mano.
    subject_key TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    person_id TEXT,
    club_id TEXT,
    club_name TEXT,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (edition, category, user_id, subject_key)
);

CREATE INDEX IF NOT EXISTS idx_award_nominations_edition_category
    ON public.award_nominations(edition, category);

-- Jugadas de los pibes: el link (o el mail que se cargó a mano) y quién la mandó.
CREATE TABLE IF NOT EXISTS public.award_plays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition TEXT NOT NULL REFERENCES public.award_editions(slug) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    club_id TEXT,
    club_name TEXT,
    age_group TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    consent BOOLEAN NOT NULL DEFAULT false,
    -- 'email' = la jugada llegó por mail y la cargó un editor.
    via TEXT NOT NULL DEFAULT 'link' CHECK (via IN ('link', 'email')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_award_plays_edition_status
    ON public.award_plays(edition, status);

-- La terna: lo que efectivamente se vota. La arma "Armar terna" con los más
-- postulados (o con las jugadas aprobadas) y se fija al abrir la votación.
CREATE TABLE IF NOT EXISTS public.award_finalists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition TEXT NOT NULL REFERENCES public.award_editions(slug) ON DELETE CASCADE,
    category TEXT NOT NULL,
    rank INTEGER NOT NULL,
    subject_key TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    person_id TEXT,
    club_id TEXT,
    club_name TEXT,
    support INTEGER NOT NULL DEFAULT 0,
    -- Nuestra lectura, en las categorías editoriales (los mejores del mundo).
    note TEXT NOT NULL DEFAULT '',
    play_id UUID REFERENCES public.award_plays(id) ON DELETE SET NULL,
    play_url TEXT,
    UNIQUE (edition, category, subject_key)
);

CREATE INDEX IF NOT EXISTS idx_award_finalists_edition_category
    ON public.award_finalists(edition, category);

-- Un voto por persona y categoría; volver a votar lo cambia.
CREATE TABLE IF NOT EXISTS public.award_votes (
    edition TEXT NOT NULL REFERENCES public.award_editions(slug) ON DELETE CASCADE,
    category TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    finalist_id UUID NOT NULL REFERENCES public.award_finalists(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (edition, category, user_id)
);

CREATE INDEX IF NOT EXISTS idx_award_votes_finalist ON public.award_votes(finalist_id);

ALTER TABLE public.award_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_finalists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_votes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.award_editions FROM anon, authenticated;
REVOKE ALL ON public.award_nominations FROM anon, authenticated;
REVOKE ALL ON public.award_plays FROM anon, authenticated;
REVOKE ALL ON public.award_finalists FROM anon, authenticated;
REVOKE ALL ON public.award_votes FROM anon, authenticated;

INSERT INTO public.award_editions (slug, season) VALUES
    ('salida-22', 2026),
    ('corner-corto', 2026)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.award_votes IS 'Un voto por persona y categoría de una edición de los Awards; volver a votar lo cambia.';
