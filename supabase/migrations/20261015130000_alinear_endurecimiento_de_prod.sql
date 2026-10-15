-- Alinear el repo con el endurecimiento que produccion ya tiene
--
-- CAUSA: en produccion alguien cerro a mano tres cosas que ninguna migracion
-- del repo registra. La base viva esta bien; el problema es reconstruirla desde
-- `supabase/migrations` (rama de preview, recuperacion, entorno nuevo): ahi
-- vuelven los agujeros originales.
--
--   * club_invite_links: las cuatro policies de 20260429143000 son USING (true)
--     / WITH CHECK (true). Con ellas cualquier sesion forja una invitacion con
--     `created_by` de un admin real y la acepta en
--     /api/club-admin/invites/accept -> admin de cualquier club. Toda la app
--     entra con service role (invites/route.ts, invites/accept/route.ts), asi
--     que en prod la tabla tiene RLS sin policies.
--   * recalculate_tournament_standings / complete_round: SECURITY DEFINER sin
--     chequeo de permisos ni REVOKE en el repo, ejecutables por anon. En prod
--     solo los ejecutan postgres y service_role, y tienen search_path fijo.
--   * generate_rounds_for_phase: el repo tiene la version original, sin
--     chequeo. En prod valida la fase contra can_manage_tournament y queda
--     ejecutable por authenticated.
--
-- Esta migracion es idempotente: contra prod no cambia nada.

-- club_invite_links: RLS prendida y sin policies (solo service role).
alter table public.club_invite_links enable row level security;
drop policy if exists "club_invite_links_select_any" on public.club_invite_links;
drop policy if exists "club_invite_links_insert_admin" on public.club_invite_links;
drop policy if exists "club_invite_links_delete_admin" on public.club_invite_links;
drop policy if exists "club_invite_links_update_admin" on public.club_invite_links;

-- recalculate_tournament_standings / complete_round: solo service role.
alter function public.recalculate_tournament_standings(uuid) set search_path = public, pg_temp;
alter function public.complete_round(uuid) set search_path = public, pg_temp;
revoke execute on function public.recalculate_tournament_standings(uuid) from public, anon, authenticated;
revoke execute on function public.complete_round(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_tournament_standings(uuid) to service_role;
grant execute on function public.complete_round(uuid) to service_role;

-- generate_rounds_for_phase: cuerpo copiado de produccion.
create or replace function public.generate_rounds_for_phase(
    p_phase_id uuid,
    p_num_rounds integer,
    p_name_pattern text default 'Fecha {n}'::text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE v_round_name TEXT; v_i INT; v_tournament_id TEXT;
BEGIN
    IF p_num_rounds IS NULL OR p_num_rounds < 1 OR p_num_rounds > 200 THEN
        RAISE EXCEPTION 'p_num_rounds fuera de rango (1-200)' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
        SELECT ph.tournament_id::text INTO v_tournament_id FROM public.tournament_phases ph WHERE ph.id = p_phase_id;
        IF v_tournament_id IS NULL OR NOT (public.is_global_admin()
            OR public.can_manage_tournament(v_tournament_id, ARRAY['admin', 'editor', 'operator'])) THEN
            RAISE EXCEPTION 'Sin permiso sobre la fase' USING ERRCODE = '42501';
        END IF;
    END IF;
    FOR v_i IN 1..p_num_rounds LOOP
        v_round_name := REPLACE(LEFT(COALESCE(p_name_pattern, 'Fecha {n}'), 120), '{n}', v_i::TEXT);
        INSERT INTO public.tournament_rounds (phase_id, name, order_index)
        VALUES (p_phase_id, v_round_name, v_i) ON CONFLICT (phase_id, order_index) DO NOTHING;
    END LOOP;
END;
$function$;

revoke execute on function public.generate_rounds_for_phase(uuid, integer, text) from public, anon;
grant execute on function public.generate_rounds_for_phase(uuid, integer, text) to authenticated, service_role;
