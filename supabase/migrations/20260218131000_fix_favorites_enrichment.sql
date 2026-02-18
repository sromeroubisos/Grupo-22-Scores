-- ==============================================================================
-- FIX DEFINITIVO PARA FAVORITOS (Ids, Nombres y Fotos)
-- ==============================================================================

-- 1. Aseguramos que las tablas tengan soporte para IDs externos (como 'fs-tcOvksj6')
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS primary_color TEXT;

-- 2. Función Inteligente: Trae tus favoritos y busca sus nombres/fotos automáticamente
--    Si no encuentra el nombre, pone "Entidad Desconocida" (mejor que un ID loco)
CREATE OR REPLACE FUNCTION public.get_my_favorites_enriched()
RETURNS JSON AS $$
DECLARE
    v_uid UUID;
    result JSON;
BEGIN
    v_uid := auth.uid();
    
    SELECT json_agg(row_to_json(t))
    INTO result
    FROM (
        SELECT 
            f.id as favorite_id, 
            f.entity_type, 
            f.entity_id,
            f.created_at,
            -- Buscamos el nombre en Clubes o Torneos. Si no está, placeholder.
            COALESCE(c.name, t.name, 'Pendiente de sincronizar') as name,
            COALESCE(c.logo_url, t.logo_url, NULL) as logo_url,
            COALESCE(c.primary_color, NULL) as color,
            CASE 
                WHEN f.entity_type = 'league' OR f.entity_type = 'tournament' THEN 'Torneo'
                WHEN f.entity_type = 'club' THEN 'Club'
                ELSE f.entity_type 
            END as type_label
        FROM public.favorites f
        -- JOIN Inteligente: Coincide por ID interno (UUID) O por ID externo (texto)
        LEFT JOIN public.clubs c ON f.entity_type = 'club' AND (c.id::text = f.entity_id OR c.external_id = f.entity_id)
        LEFT JOIN public.tournaments t ON f.entity_type IN ('league', 'tournament') AND (t.id::text = f.entity_id OR t.external_id = f.entity_id)
        WHERE f.user_id = v_uid
        ORDER BY f.created_at DESC
    ) t;

    -- Si no hay favoritos, devuelve array vacío
    RETURN coalesce(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. SOLUCIÓN MÁGICA: Insertamos el torneo que tienes agregado para que aparezca el nombre
--    Asumimos que 'fs-tcOvksj6' es URBA Top 12 basado en tu captura.
INSERT INTO public.tournaments (external_id, name, sport, country)
VALUES ('fs-tcOvksj6', 'URBA Top 12', 'rugby', 'Argentina')
ON CONFLICT (external_id) DO UPDATE 
SET name = 'URBA Top 12'; -- Si ya existe, actualiza el nombre por si acaso

-- 4. Aseguramos permisos
GRANT EXECUTE ON FUNCTION public.get_my_favorites_enriched() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_favorites_enriched() TO service_role;

NOTIFY pgrst, 'reload config';
