-- ============================================================
-- PERFORMANCE FIX: Favorites / Seguidos
-- ============================================================

-- 1. Índice principal: filtro por user + sort por created_at
CREATE INDEX IF NOT EXISTS idx_favorites_user_created
    ON public.favorites (user_id, created_at DESC);

-- 2. RLS fix: (select auth.uid()) = InitPlan, se evalúa 1 sola vez
DROP POLICY IF EXISTS "Users own favorites" ON public.favorites;
CREATE POLICY "Users own favorites" ON public.favorites
    USING ((select auth.uid()) = user_id);

-- 3. Helper de rol (evita subquery por fila en policies de admin)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT role FROM public.users WHERE id = (select auth.uid())
$$;

-- 4. Función v2: LANGUAGE sql (inlinable), RETURNS TABLE (no doble JSON),
--    dos LEFT JOINs separados en lugar de OR (usa índices), paginación por keyset.
--    CORRECCIÓN: reemplaza CTE "uid" (conflicto con built-in) por (select auth.uid()) directo.
CREATE OR REPLACE FUNCTION public.get_my_favorites_enriched_v2(
    p_limit  INT         DEFAULT 20,
    p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    favorite_id  UUID,
    entity_type  TEXT,
    entity_id    TEXT,
    created_at   TIMESTAMPTZ,
    name         TEXT,
    logo_url     TEXT,
    color        TEXT,
    type_label   TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT
        f.id                                                                          AS favorite_id,
        f.entity_type,
        f.entity_id,
        f.created_at,
        COALESCE(c_uuid.name, c_ext.name, trn_uuid.name, trn_ext.name, 'Pendiente') AS name,
        COALESCE(c_uuid.logo_url, c_ext.logo_url, trn_uuid.logo_url, trn_ext.logo_url) AS logo_url,
        COALESCE(c_uuid.primary_color, c_ext.primary_color)                          AS color,
        CASE
            WHEN f.entity_type IN ('league', 'tournament') THEN 'Torneo'
            WHEN f.entity_type = 'club'                   THEN 'Club'
            ELSE f.entity_type
        END                                                                           AS type_label

    FROM public.favorites f

    -- Club por UUID (usa PK directamente) - Nota: en este schema clubs.id es TEXT
    LEFT JOIN public.clubs c_uuid
        ON  f.entity_type = 'club'
        AND c_uuid.id = f.entity_id

    -- Club por external_id (usa índice UNIQUE de external_id)
    LEFT JOIN public.clubs c_ext
        ON  f.entity_type     = 'club'
        AND c_ext.external_id = f.entity_id
        AND c_uuid.id         IS NULL

    -- Torneo por UUID
    LEFT JOIN public.tournaments trn_uuid
        ON  f.entity_type IN ('league', 'tournament')
        AND trn_uuid.id::text = f.entity_id

    -- Torneo por external_id
    LEFT JOIN public.tournaments trn_ext
        ON  f.entity_type        IN ('league', 'tournament')
        AND trn_ext.external_id  = f.entity_id
        AND trn_uuid.id          IS NULL

    WHERE f.user_id = (select auth.uid())
      AND (p_cursor IS NULL OR f.created_at < p_cursor)

    ORDER BY f.created_at DESC
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_favorites_enriched_v2(INT, TIMESTAMPTZ)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload config';
