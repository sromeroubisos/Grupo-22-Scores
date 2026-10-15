-- Cierre de escrituras RLS abiertas a cualquier sesion
--
-- CAUSA: en produccion, estas cuatro tablas tienen policies de escritura cuyo
-- unico predicado es
--
--     (select auth.role()) = 'authenticated'
--
-- y el rol `authenticated` tiene INSERT/UPDATE/DELETE en todas sus columnas.
-- Con eso, cualquiera que se cree una cuenta (el prode la pide) escribe con la
-- anon key publica, sin pasar por ninguna ruta de la app:
--
--     await supabase.from('external_tournament_standings_overrides').update({...})
--
--   * external_tournament_standings_overrides  -> tablas oficiales falseadas
--   * external_tournaments                      -> catalogo de torneos externos
--   * ui_labels / team_labels                   -> bandas de clasificacion y
--                                                  descenso de todas las tablas
--
-- QUIEN ESCRIBE DE VERDAD (relevado antes de cerrar):
--   * external_tournaments y sus overrides: solo /api/admin/super/external-
--     tournaments/**, con requireExactSuperAdmin y cliente service role.
--   * team_labels: /api/admin/team-labels/** con el `writer` de
--     requireTournamentMutationContext (service role).
--   * ui_labels: /api/admin/tournaments/[id]/circuit-labels (service role) y
--     /api/admin/labels/** — este ultimo escribia con la sesion del usuario y
--     pasa a service role en el mismo cambio, despues de su chequeo de rol.
--   * scripts de src/scripts: service role.
-- Ningun camino de la app depende de estas policies para escribir, asi que
-- quedan solo para admins globales (la sesion de un super admin desde la
-- consola, o un entorno sin SUPABASE_SERVICE_ROLE_KEY).
--
-- Las lecturas no se tocan: siguen publicas.

-- external_tournament_standings_overrides
drop policy if exists external_tournament_standings_overrides_insert on public.external_tournament_standings_overrides;
drop policy if exists external_tournament_standings_overrides_update on public.external_tournament_standings_overrides;
create policy external_tournament_standings_overrides_insert
    on public.external_tournament_standings_overrides
    for insert to authenticated
    with check ((select public.is_global_admin()));
create policy external_tournament_standings_overrides_update
    on public.external_tournament_standings_overrides
    for update to authenticated
    using ((select public.is_global_admin()))
    with check ((select public.is_global_admin()));

-- external_tournaments
drop policy if exists external_tournaments_insert on public.external_tournaments;
drop policy if exists external_tournaments_update on public.external_tournaments;
create policy external_tournaments_insert
    on public.external_tournaments
    for insert to authenticated
    with check ((select public.is_global_admin()));
create policy external_tournaments_update
    on public.external_tournaments
    for update to authenticated
    using ((select public.is_global_admin()))
    with check ((select public.is_global_admin()));

-- team_labels
drop policy if exists team_labels_insert on public.team_labels;
drop policy if exists team_labels_update on public.team_labels;
drop policy if exists team_labels_delete on public.team_labels;
create policy team_labels_insert
    on public.team_labels
    for insert to authenticated
    with check ((select public.is_global_admin()));
create policy team_labels_update
    on public.team_labels
    for update to authenticated
    using ((select public.is_global_admin()))
    with check ((select public.is_global_admin()));
create policy team_labels_delete
    on public.team_labels
    for delete to authenticated
    using ((select public.is_global_admin()));

-- ui_labels
drop policy if exists ui_labels_insert on public.ui_labels;
drop policy if exists ui_labels_update on public.ui_labels;
drop policy if exists ui_labels_delete on public.ui_labels;
create policy ui_labels_insert
    on public.ui_labels
    for insert to authenticated
    with check ((select public.is_global_admin()));
create policy ui_labels_update
    on public.ui_labels
    for update to authenticated
    using ((select public.is_global_admin()))
    with check ((select public.is_global_admin()));
create policy ui_labels_delete
    on public.ui_labels
    for delete to authenticated
    using ((select public.is_global_admin()));
