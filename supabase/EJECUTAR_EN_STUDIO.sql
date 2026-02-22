-- =============================================================================
-- EJECUTAR COMPLETO EN: https://supabase.com/dashboard/project/vxsolicapdcpemfsahbk/sql/new
-- Pegar TODO y hacer Run (F5)
-- =============================================================================

-- ─── PASO 1: Ver metadata real del usuario admin ─────────────────────────────
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

-- ─── PASO 2: Ver todos los admins en public.users ────────────────────────────
SELECT id, email, role FROM public.users
WHERE role IN ('super_admin', 'admin_general', 'admin');

-- ─── PASO 3: Asegurar que admin_audit_log existe ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    actor_user_id  uuid        NOT NULL,
    entity_type    text        NOT NULL,
    entity_id      text        NOT NULL,
    action         text        NOT NULL DEFAULT 'update',
    changes        jsonb       NOT NULL,
    request_id     text            NULL,
    source         text            NULL,
    CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx
    ON public.admin_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
    ON public.admin_audit_log (actor_user_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;

-- ─── PASO 4: authorize_admin() ROBUSTA (cubre todos los paths del JWT) ───────
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- PATH 1 (este proyecto): rol en public.users.role
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin_general', 'admin')
    )
    OR
    -- PATH 2: rol en app_metadata.role
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('super_admin', 'admin_general', 'admin')
    OR
    -- PATH 3: rol en app_metadata.roles[]
    (auth.jwt() -> 'app_metadata' -> 'roles') ? 'super_admin'
    OR
    (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin_general'
    OR
    -- PATH 4: rol en user_metadata.role
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'admin_general', 'admin');
$$;

-- ─── PASO 5: Policies admin_audit_log ────────────────────────────────────────
-- SELECT: solo admins
DROP POLICY IF EXISTS "Allow select for super_admins" ON public.admin_audit_log;
CREATE POLICY "Allow select for super_admins"
    ON public.admin_audit_log FOR SELECT TO authenticated
    USING (public.authorize_admin());

-- INSERT: cualquier usuario autenticado puede insertar SU PROPIO log
-- (authorize_admin NO requerido aquí — el gatekeeping lo hacen las policies de matches)
DROP POLICY IF EXISTS "Allow insert for actor" ON public.admin_audit_log;
CREATE POLICY "Allow insert for actor"
    ON public.admin_audit_log FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = actor_user_id);

-- ─── PASO 6: Validación ──────────────────────────────────────────────────────
SELECT to_regclass('public.admin_audit_log') AS tabla_existe;

SELECT policyname, cmd, with_check
FROM pg_policies WHERE tablename = 'admin_audit_log';

-- ─── PASO 7: Insert de prueba (como postgres/service_role desde Studio) ──────
-- Studio corre como postgres, no como authenticated, así que la policy no aplica.
-- Este insert prueba que la tabla acepta datos:
INSERT INTO public.admin_audit_log
    (actor_user_id, entity_type, entity_id, action, changes, source)
VALUES (
    (SELECT id FROM auth.users WHERE email = 'deportesgrupo@gmail.com' LIMIT 1),
    'match',
    '00000000-0000-0000-0000-000000000001',
    'test_from_studio',
    '{"status": {"old": "scheduled", "new": "finished"}}'::jsonb,
    'sql-studio-test'
);

-- ─── PASO 8: Confirmar que el log quedó guardado ─────────────────────────────
SELECT created_at, actor_user_id, entity_type, entity_id, action, changes, source
FROM public.admin_audit_log
ORDER BY created_at DESC
LIMIT 5;
