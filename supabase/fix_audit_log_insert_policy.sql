-- =============================================================================
-- FIX DEFINITIVO: admin_audit_log INSERT policy
-- 
-- PROBLEMA: La policy original exige authorize_admin() en el INSERT.
-- Esto significa que si authorize_admin() devuelve false (bug, JWT timing, etc.)
-- el insert de audit falla → el log no se escribe aunque el update sí ocurrió.
--
-- SOLUCIÓN:
--   - INSERT: solo requiere auth.uid() = actor_user_id (cualquier usuario autenticado
--     puede insertar su propio log). El hecho de que lleguen a esta call significa
--     que ya pasaron las policies de la tabla 'matches' (que sí requieren authorize_admin).
--   - SELECT: mantener authorize_admin() (solo admins ven los logs).
--
-- Esta es la política correcta para un sistema de audit fail-open.
-- =============================================================================

-- Pisar la policy de INSERT con una versión menos restrictiva
DROP POLICY IF EXISTS "Allow insert for actor" ON public.admin_audit_log;

CREATE POLICY "Allow insert for actor"
    ON public.admin_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Solo puede insertar logs de sí mismo
        auth.uid() = actor_user_id
    );

-- Verificar policies resultantes
SELECT
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'admin_audit_log';
