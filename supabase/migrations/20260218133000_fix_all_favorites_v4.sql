-- ==============================================================================
-- FIX FAVORITOS V4: SOLUCIÓN COMPLETA
-- Ejecuta esto en el SQL Editor de Supabase para arreglar todos los errores.
-- ==============================================================================

-- 1. Extensiones y Tablas Base
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Aseguramos que existan las tablas de entidades con columnas clave
CREATE TABLE IF NOT EXISTS public.clubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
    external_id TEXT UNIQUE,
    name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id TEXT UNIQUE,
    name TEXT NOT NULL,
    logo_url TEXT,
    sport TEXT DEFAULT 'rugby',
    country TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patch: Añadir columnas si las tablas ya existían
DO $$ 
BEGIN
    ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
    ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS primary_color TEXT;
    ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
END $$;

-- 2. Tabla Favoritos (Re-creamos para asegurar integridad)
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL, -- Puede ser UUID o External ID (texto)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_type, entity_id)
);

-- 3. Seguridad (RLS)
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own favorites" ON public.favorites;
CREATE POLICY "Users own favorites" ON public.favorites USING (auth.uid() = user_id);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public clubs" ON public.clubs;
CREATE POLICY "Public clubs" ON public.clubs FOR SELECT USING (true);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public tournaments" ON public.tournaments;
CREATE POLICY "Public tournaments" ON public.tournaments FOR SELECT USING (true);


-- 4. FUNCIÓN 1: Toggle (Marcar/Desmarcar)
CREATE OR REPLACE FUNCTION public.toggle_favorite(
    p_entity_type TEXT,
    p_entity_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;

    IF EXISTS (SELECT 1 FROM public.favorites WHERE user_id = v_uid AND entity_id = p_entity_id AND entity_type = p_entity_type) THEN
        DELETE FROM public.favorites WHERE user_id = v_uid AND entity_id = p_entity_id AND entity_type = p_entity_type;
        RETURN FALSE; -- Ahora NO es favorito
    ELSE
        INSERT INTO public.favorites (user_id, entity_type, entity_id) VALUES (v_uid, p_entity_type, p_entity_id);
        RETURN TRUE; -- Ahora ES favorito
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. FUNCIÓN 2: Obtener Favoritos Enriquecidos (Nombres + Fotos)
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
            -- Buscar nombre (prioridad: Club -> Torneo -> Fallback)
            COALESCE(c.name, t.name, 'Pendiente de sincronizar') as name,
            COALESCE(c.logo_url, t.logo_url, NULL) as logo_url,
            COALESCE(c.primary_color, NULL) as color,
            CASE 
                WHEN f.entity_type IN ('league', 'tournament') THEN 'Torneo'
                WHEN f.entity_type = 'club' THEN 'Club'
                ELSE f.entity_type 
            END as type_label
        FROM public.favorites f
        -- Joins robustos (UUID o External ID)
        LEFT JOIN public.clubs c ON f.entity_type = 'club' AND (c.id::text = f.entity_id OR c.external_id = f.entity_id)
        LEFT JOIN public.tournaments t ON f.entity_type IN ('league', 'tournament') AND (t.id::text = f.entity_id OR t.external_id = f.entity_id)
        WHERE f.user_id = v_uid
        ORDER BY f.created_at DESC
    ) t;

    RETURN coalesce(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Insertar Datos Mock (Para que se vea bonito ya mismo)
INSERT INTO public.tournaments (external_id, name, sport, country)
VALUES ('fs-tcOvksj6', 'URBA Top 12 (Oficial)', 'rugby', 'Argentina')
ON CONFLICT (external_id) DO UPDATE SET name = 'URBA Top 12 (Oficial)';


-- 7. Permisos Finales
GRANT ALL ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_favorite TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_favorites_enriched TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_favorite TO service_role;

-- Recargar caché de API
NOTIFY pgrst, 'reload config';
