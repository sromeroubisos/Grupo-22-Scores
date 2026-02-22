-- =============================================================================
-- DIAGNÓSTICO COMPLETO: Metadata de usuario en Supabase Auth
-- Ejecutar en: Supabase Studio → SQL Editor (como postgres / service_role)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- QUERY 1: Ver metadata completa del usuario en auth.users
-- (la tabla auth.users es solo visible como postgres/service_role en Studio)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    au.id,
    au.email,
    au.raw_app_meta_data   AS app_metadata,
    au.raw_user_meta_data  AS user_metadata,
    au.role                AS auth_role,
    pu.role                AS public_role
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE au.email = 'deportesgrupo@gmail.com';

-- Resultado esperado (ejemplo A — rol en public.users):
-- app_metadata:  {"provider": "google", "providers": ["google"]}
-- user_metadata: {"name": "...", "email": "..."}
-- auth_role:     "authenticated"
-- public_role:   "super_admin"   ← acá es donde lo guarda este proyecto

-- Resultado esperado (ejemplo B — rol en app_metadata):
-- app_metadata:  {"role": "super_admin", "provider": "google"}
-- public_role:   NULL

-- ─────────────────────────────────────────────────────────────────────────────
-- QUERY 2: Ver TODOS los usuarios admin en public.users
-- ─────────────────────────────────────────────────────────────────────────────
SELECT id, email, role, created_at
FROM public.users
WHERE role IN ('super_admin', 'admin_general', 'admin')
ORDER BY created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- QUERY 3: Confirmar que authorize_admin() existe y su definición
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    proname AS function_name,
    prosrc  AS function_body
FROM pg_proc
JOIN pg_namespace ns ON ns.oid = pronamespace
WHERE ns.nspname = 'public'
  AND proname = 'authorize_admin';
