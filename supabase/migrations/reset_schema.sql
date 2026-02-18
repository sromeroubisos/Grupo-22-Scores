-- ============================================
-- SCRIPT DE LIMPIEZA TOTAL (DROP CASCADE)
-- ============================================
-- Ejecuta esto para limpiar la base de datos antes de aplicar el nuevo esquema.

-- 1. Eliminar Triggers y Funciones de Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- 2. Eliminar Tablas (Orden inverso de dependencia + CASCADE)
DROP TABLE IF EXISTS public.favorites CASCADE;
DROP TABLE IF EXISTS public.memberships CASCADE;
DROP TABLE IF EXISTS public.phase_configurations CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.tournaments CASCADE;
DROP TABLE IF EXISTS public.clubs CASCADE;
DROP TABLE IF EXISTS public.unions CASCADE;
DROP TABLE IF EXISTS public.folders CASCADE; -- Tabla antigua
DROP TABLE IF EXISTS public.users CASCADE;

-- 3. Limpiar otras tablas potenciales de versiones anteriores
DROP TABLE IF EXISTS public.external_data CASCADE;
DROP TABLE IF EXISTS public.discipline_sanctions CASCADE;
DROP TABLE IF EXISTS public.discipline_incidents CASCADE;
DROP TABLE IF EXISTS public.regulations CASCADE;
DROP TABLE IF EXISTS public.news CASCADE;

-- ============================================
-- BASE DE DATOS LIMPIA
-- ============================================
