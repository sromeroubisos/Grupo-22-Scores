-- ============================================================
-- FIX FAVORITES SCHEMA
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. UNIQUE constraint para prevenir duplicados en favorites
--    Si ya existe alguna fila duplicada, eliminar primero los duplicados:
DELETE FROM public.favorites f
WHERE f.id NOT IN (
    SELECT DISTINCT ON (user_id, entity_type, entity_id) id
    FROM public.favorites
    ORDER BY user_id, entity_type, entity_id, created_at ASC
);

--    Ahora agregar el constraint (crea un índice B-tree implícito en esas 3 cols)
ALTER TABLE public.favorites
    DROP CONSTRAINT IF EXISTS favorites_user_entity_unique;
ALTER TABLE public.favorites
    ADD CONSTRAINT favorites_user_entity_unique
    UNIQUE (user_id, entity_type, entity_id);

-- 2. Índice adicional para la query principal (filtro + sort)
--    El UNIQUE ya cubre el filtro por user_id.
--    Este cubre además el ORDER BY created_at DESC para evitar Sort en memoria.
CREATE INDEX IF NOT EXISTS idx_favorites_user_created
    ON public.favorites (user_id, created_at DESC);

-- 3. Reescribir get_my_favorites_enriched con el schema real
--    Cambios clave respecto a la versión anterior:
--      - clubs.id es TEXT, no UUID → el join es TEXT = TEXT (sin cast)
--      - tournaments.id es UUID → el cast ::text sigue siendo correcto
--      - (select auth.uid()) como InitPlan (evaluado 1 sola vez)
CREATE OR REPLACE FUNCTION public.get_my_favorites_enriched()
RETURNS JSON AS $$
DECLARE
    v_uid  UUID;
    result JSON;
BEGIN
    v_uid := (select auth.uid());
    IF v_uid IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;

    SELECT json_agg(row_to_json(favrow))
    INTO result
    FROM (
        SELECT
            f.id           AS favorite_id,
            f.entity_type,
            f.entity_id,
            f.created_at,
            COALESCE(c.name,   trn.name,   'Pendiente de sincronizar') AS name,
            COALESCE(c.logo_url, trn.logo_url)                         AS logo_url,
            c.primary_color                                             AS color,
            CASE
                WHEN f.entity_type IN ('league', 'tournament') THEN 'Torneo'
                WHEN f.entity_type = 'club'                   THEN 'Club'
                ELSE f.entity_type
            END                                                         AS type_label
        FROM public.favorites f
        -- clubs.id es TEXT → join directo sin cast
        LEFT JOIN public.clubs c
            ON  f.entity_type    = 'club'
            AND (c.id = f.entity_id OR c.external_id = f.entity_id)
        -- tournaments.id es UUID → cast a text para comparar con entity_id (TEXT)
        LEFT JOIN public.tournaments trn
            ON  f.entity_type    IN ('league', 'tournament')
            AND (trn.id::text = f.entity_id OR trn.external_id = f.entity_id)
        WHERE f.user_id = v_uid
        ORDER BY f.created_at DESC
    ) favrow;

    RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Reescribir toggle_favorite para usar el UNIQUE constraint (INSERT ON CONFLICT)
--    Más simple, seguro y atómico que SELECT + IF EXISTS
CREATE OR REPLACE FUNCTION public.toggle_favorite(
    p_entity_type TEXT,
    p_entity_id   TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_uid  UUID;
    v_rows INT;
BEGIN
    v_uid := (select auth.uid());
    IF v_uid IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;

    -- Intentar insertar; si ya existe (conflicto UNIQUE), ignorar
    INSERT INTO public.favorites (user_id, entity_type, entity_id)
    VALUES (v_uid, p_entity_type, p_entity_id)
    ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 1 THEN
        RETURN TRUE;  -- ahora ES favorito
    ELSE
        -- Ya existía → eliminar (toggle off)
        DELETE FROM public.favorites
        WHERE user_id    = v_uid
          AND entity_type = p_entity_type
          AND entity_id   = p_entity_id;
        RETURN FALSE;  -- ahora NO es favorito
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS en favorites usando (select auth.uid()) — evaluado como InitPlan
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own favorites"           ON public.favorites;
DROP POLICY IF EXISTS "users_own_favorites"           ON public.favorites;
CREATE POLICY "users_own_favorites" ON public.favorites
    USING      ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

-- 6. Permisos
GRANT ALL     ON public.favorites                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_favorites_enriched TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_favorite           TO authenticated, service_role;

NOTIFY pgrst, 'reload config';
