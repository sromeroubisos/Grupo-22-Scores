-- Linter de Supabase: "View public.user_active_plan is defined with the
-- SECURITY DEFINER property".
--
-- Una vista sin `security_invoker` corre con los permisos y el RLS de quien
-- la creó (postgres), no de quien la consulta. Eso hacía que cualquier
-- `authenticated` pudiera leer el plan de CUALQUIER usuario a través de la
-- vista, salteando `subscriptions_select_self`.
--
-- Con `security_invoker = on` la vista respeta las políticas de
-- `public.subscriptions`: cada usuario ve su propio plan, y los admins
-- globales ven todos (`subscriptions_select_admin`). Las lecturas del plan
-- de un tercero (el dueño del torneo desde el panel de un colaborador)
-- pasan por el cliente service_role, que no está sujeto a RLS.
--
-- Se recrea con la misma definición: mismas columnas, mismo orden, así
-- ningún `select` existente cambia.

CREATE OR REPLACE VIEW public.user_active_plan
WITH (security_invoker = on) AS
SELECT DISTINCT ON (s.user_id)
    s.user_id,
    s.plan,
    s.status,
    s.current_period_end,
    s.is_founder_price,
    s.provider,
    s.id AS subscription_id
FROM public.subscriptions s
WHERE s.status = 'active'
ORDER BY s.user_id, s.current_period_end DESC NULLS LAST;

GRANT SELECT ON public.user_active_plan TO authenticated;

COMMENT ON VIEW public.user_active_plan IS
    'Plan vigente (status=active) por usuario. Respeta el RLS de subscriptions (security_invoker). Usar para resolver permisos.';
