-- Fix: alias 't' conflict between tournaments JOIN and outer derived table
-- El alias 't' estaba usado doble, PostgreSQL no podía resolver t.logo_url

CREATE OR REPLACE FUNCTION public.get_my_favorites_enriched()
RETURNS JSON AS $$
DECLARE
    v_uid UUID;
    result JSON;
BEGIN
    v_uid := auth.uid();

    SELECT json_agg(row_to_json(favrow))
    INTO result
    FROM (
        SELECT
            f.id as favorite_id,
            f.entity_type,
            f.entity_id,
            f.created_at,
            COALESCE(c.name, trn.name, 'Pendiente de sincronizar') as name,
            COALESCE(c.logo_url, trn.logo_url, NULL) as logo_url,
            COALESCE(c.primary_color, NULL) as color,
            CASE
                WHEN f.entity_type IN ('league', 'tournament') THEN 'Torneo'
                WHEN f.entity_type = 'club' THEN 'Club'
                ELSE f.entity_type
            END as type_label
        FROM public.favorites f
        LEFT JOIN public.clubs c
            ON f.entity_type = 'club'
            AND (c.id::text = f.entity_id OR c.external_id = f.entity_id)
        LEFT JOIN public.tournaments trn
            ON f.entity_type IN ('league', 'tournament')
            AND (trn.id::text = f.entity_id OR trn.external_id = f.entity_id)
        WHERE f.user_id = v_uid
        ORDER BY f.created_at DESC
    ) favrow;

    RETURN coalesce(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_favorites_enriched TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_favorites_enriched TO service_role;
NOTIFY pgrst, 'reload config';
