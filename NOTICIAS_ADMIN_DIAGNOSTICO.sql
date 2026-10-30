-- Diagnóstico: por qué /noticias no me reconoce como administrador.
-- Correlo entero en el SQL Editor de Supabase (corre como postgres). Solo lee.

-- 1. Las dos cuentas de admin: qué rol tiene cada una en la tabla users.
--    Noticias, votaciones y clips exigen role = 'super_admin' EXACTO.
--    OJO: sromeroubisos@gmail.com está clavado en el código como admin_general
--    (src/lib/types/user.ts) y ese mail gana sobre lo que diga esta tabla.
SELECT u.id, u.email, u.role, u.last_login_at,
       a.last_sign_in_at, a.raw_app_meta_data AS app_metadata
FROM public.users u
LEFT JOIN auth.users a ON a.id = u.id
WHERE lower(u.email) IN ('superadmin@g22scores.com', 'sromeroubisos@gmail.com');

-- 2. Cuentas de auth sin fila en users (si el super admin no tiene perfil,
--    is_super_admin_exact() devuelve false aunque el mail sea el reservado).
SELECT a.id, a.email, a.last_sign_in_at
FROM auth.users a
LEFT JOIN public.users u ON u.id = a.id
WHERE u.id IS NULL
  AND lower(a.email) IN ('superadmin@g22scores.com', 'sromeroubisos@gmail.com');

-- 3. Censo de roles elevados (si aparece alguno que no reconocés, revisalo).
SELECT id, email, role, created_at, last_login_at
FROM public.users
WHERE role NOT IN ('fan', 'user')
ORDER BY created_at;

-- 4. La función y las policies de noticias existen (migración 20260416173100).
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('is_super_admin_exact', 'is_global_admin', 'is_admin');

SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('news', 'video_polls', 'video_poll_votes', 'match_videos'))
   OR (schemaname = 'storage' AND policyname LIKE 'news_%')
ORDER BY schemaname, tablename, policyname;

-- 5. Columnas que /api/news escribe y que la base viva puede no tener
--    (migración 20260826150000_news_sport_scope_tags.sql). Si falta alguna,
--    crear una noticia guarda a medias o falla.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'news'
  AND column_name IN ('author_id', 'created_at', 'sport', 'scope', 'scope_id', 'tags')
ORDER BY column_name;

-- 6. Las tablas de votación y de clips existen (PGRST205 si no).
SELECT to_regclass('public.video_polls')      AS video_polls,
       to_regclass('public.video_poll_votes') AS video_poll_votes,
       to_regclass('public.match_videos')     AS match_videos;

-- 7. El trigger de blindaje de role está vivo ('O' = habilitado).
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal;
