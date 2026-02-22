-- =============================================================================
-- SCRIPT COMPLETO: Crear public.admin_audit_log en Supabase
-- Ejecutar en: Supabase Studio → SQL Editor (seleccionar todo y Run)
-- Idempotente: se puede re-ejecutar sin riesgo.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 0: DIAGNÓSTICO (ver si la tabla ya existe en algún schema)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    n.nspname AS schema,
    c.relname AS name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.relname ILIKE '%audit%';
-- Si esto devuelve vacío → la tabla no existe en ningún schema. Seguir adelante.
-- Si devuelve "public" / "admin_audit_log" → ya existe, el resto es idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 1: EXTENSIONES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Provee gen_random_uuid() en Postgres < 13.
-- En Postgres 13+ ya está disponible de base (pero CREATE EXTENSION es no-op).

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 2: FUNCIÓN authorize_admin (SECURITY DEFINER, no recursiva)
-- Crea o reemplaza: seguro de ejecutar aunque ya exista.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin_general')
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 3: TABLA admin_audit_log
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 4: ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx
    ON public.admin_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
    ON public.admin_audit_log (actor_user_id, created_at DESC);

-- Índice adicional útil para la query SQL de auditoría por action
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
    ON public.admin_audit_log (action, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 5: RLS + GRANTS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 6: POLICIES (drop + create → idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT: solo admins (authorize_admin chequea role IN super_admin, admin_general)
DROP POLICY IF EXISTS "Allow select for super_admins" ON public.admin_audit_log;
CREATE POLICY "Allow select for super_admins"
    ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (public.authorize_admin());

-- INSERT: solo el propio actor (auth.uid() = actor_user_id) Y si es admin
-- IMPORTANTE: el código en batchActions.ts envía actor_user_id = user.id
-- Esta policy garantiza que nadie puede insertar audit logs de otro usuario.
DROP POLICY IF EXISTS "Allow insert for actor" ON public.admin_audit_log;
CREATE POLICY "Allow insert for actor"
    ON public.admin_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = actor_user_id
        AND public.authorize_admin()
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 7: VALIDACIÓN FINAL
-- ─────────────────────────────────────────────────────────────────────────────

-- 7a. Confirmar que la tabla existe en public
SELECT to_regclass('public.admin_audit_log') AS table_exists;
-- Resultado esperado: "public.admin_audit_log"  (no NULL)

-- 7b. Confirmar estructura de la tabla
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'admin_audit_log'
ORDER BY ordinal_position;

-- 7c. Confirmar RLS habilitado
SELECT
    relname AS table,
    relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'admin_audit_log';

-- 7d. Confirmar policies
SELECT
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'admin_audit_log';

-- 7e. Confirmar índices
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'admin_audit_log';

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 8: INSERT DE PRUEBA
-- Solo ejecutar desde Supabase Studio cuando estés logueado como super_admin.
-- El SQL Editor de Studio corre como postgres (service role), pero para testear
-- la policy de INSERT desde el lado app, hacer un update desde el Admin Editor.
-- ─────────────────────────────────────────────────────────────────────────────
-- Descomenta para probar manualmente:
/*
INSERT INTO public.admin_audit_log (
    actor_user_id,
    entity_type,
    entity_id,
    action,
    changes,
    source
) VALUES (
    -- Reemplazar con tu user ID real de auth.users:
    '00000000-0000-0000-0000-000000000000'::uuid,
    'match',
    '00000000-0000-0000-0000-000000000001',
    'test_insert',
    '{"status": {"old": "scheduled", "new": "finished"}}'::jsonb,
    'manual-sql-test'
);

SELECT * FROM public.admin_audit_log ORDER BY created_at DESC LIMIT 5;
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 9: QUERY DE AUDITORÍA (usar después de hacer bulk update desde la app)
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- Ver todos los bulk_update logs recientes:
SELECT
    created_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS created_at_arg,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    changes,
    source
FROM public.admin_audit_log
WHERE entity_type = 'match'
  AND action IN ('update', 'bulk_update')
ORDER BY created_at DESC
LIMIT 20;

-- Verificar diff correcto de un bulk update sobre 3 matches específicos:
SELECT
    created_at,
    entity_id,
    changes -> 'status'    AS status_change,
    changes -> 'date_time' AS datetime_change
FROM public.admin_audit_log
WHERE entity_type = 'match'
  AND entity_id IN (
    'UUID-MATCH-1',
    'UUID-MATCH-2',
    'UUID-MATCH-3'
  )
ORDER BY created_at DESC;
*/
