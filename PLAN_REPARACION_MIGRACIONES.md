# Reparación del historial de migraciones

Total en el repo: **170**

- ✅ marcar como `applied` sin ejecutar: **92**
- ❌ realmente pendientes: **22**
- ❔ no verificables por existencia de objeto: **54**

## ❌ Pendientes de verdad — NO marcar como applied

Son las que crean algo que no existe. Cada una necesita el juicio de AUDITORIA_21_FALTANTES.md.

- `20260217174500` — 20260217174500_initial_schema.sql
    faltan: favorites
- `20260218100000` — 20260218100000_schema_v2.sql
    faltan: favorites
- `20260218131000` — 20260218131000_fix_favorites_enrichment.sql
    faltan: get_my_favorites_enriched
- `20260218133000` — 20260218133000_fix_all_favorites_v4.sql
    faltan: favorites, toggle_favorite, get_my_favorites_enriched
- `20260218140000` — 20260218140000_fix_favorites_alias.sql
    faltan: get_my_favorites_enriched
- `20260219000001` — 20260219000001_perf_favorites.sql
    faltan: get_my_favorites_enriched_v2
- `20260219100000` — 20260219100000_fix_favorites_schema.sql
    faltan: get_my_favorites_enriched, toggle_favorite
- `20260228000000` — 20260228000000_add_external_teams_cache.sql
    faltan: upsert_external_team
- `20260312000005` — 20260312000005_fixture_import_system.sql
    faltan: import_jobs, import_files, import_rows, import_match_previews, import_logs
- `20260312000006` — 20260312000006_global_tournaments_system.sql
    faltan: toggle_tournament_follow
- `20260315000001` — 20260315000001_external_match_cache.sql
    faltan: external_match_cache
- `20260318100000` — 20260318100000_schema_simplification_core.sql
    faltan: favorites
- `20260321120000` — 20260321120000_restore_fixture_import_tables.sql
    faltan: import_jobs, import_files, import_rows, import_match_previews, import_logs
- `20260324235500` — 20260324235500_granular_user_management_access.sql
    faltan: can_manage_phase
- `20260406103000` — 20260406103000_club_ranking_leadership_history.sql
    faltan: club_ranking_leadership_periods
- `20260428190000` — 20260428190000_club_admin_rivals.sql
    faltan: club_rivals
- `20260430120000` — 20260430120000_people_rls_widen_management.sql
    faltan: person_in_user_managed_club
- `20260430130000` — 20260430130000_people_rls_include_club_users.sql
    faltan: user_can_manage_club_people, person_in_user_managed_club
- `20260502170000` — 20260502170000_lineup_ratings_super_admin.sql
    faltan: external_match_lineup_overrides, lineup_rating_audit
- `20260512160000` — 20260512160000_system_push_notifications.sql
    faltan: user_push_subscriptions
- `20260701090000` — 20260701090000_restore_external_match_cache.sql
    faltan: external_match_cache
- `20260726120000` — 20260726120000_match_clock_transition_fn.sql
    faltan: match_clock_transition

## ✅ Marcar como applied, sin ejecutar

```bash
supabase migration repair --status applied \
  20260218140100 20260218140200 20260219000000 20260219200000 20260219300000 20260219400000 \
  20260221200000 20260222000000 20260223110000 20260223174700 20260224000000 20260224100000 \
  20260225000000 20260225130000 20260225180000 20260226130000 20260228000001 20260306000000 \
  20260309220000 20260311000000 20260311200000 20260311210000 20260311220000 20260312000000 \
  20260312000001 20260312000002 20260312000003 20260312000004 20260312000007 20260312000008 \
  20260314000001 20260314000002 20260314000003 20260316000000 20260317000000 20260318001122 \
  20260318100001 20260318110000 20260318120000 20260318200001 20260318230000 20260319120000 \
  20260321160000 20260324110000 20260325013000 20260327220000 20260403120000 20260405170000 \
  20260406183000 20260407120000 20260407143000 20260407184000 20260407190000 20260408170000 \
  20260409110000 20260409133000 20260410000100 20260410123000 20260412200000 20260413170000 \
  20260413230000 20260416133000 20260416173100 20260417193000 20260417200000 20260421173000 \
  20260422180000 20260423113000 20260423153000 20260423153000 20260423162000 20260423170000 \
  20260424180000 20260425120000 20260426180000 20260426193000 20260428000000 20260428090000 \
  20260428200000 20260429143000 20260501120000 20260504100000 20260505120000 20260508120000 \
  20260509230000 20260513120000 20260515120000 20260516190000 20260630120000 20260713120000 \
  20260804120000 20260804140000
```

## 🗑️ Obsoletas — crean objetos que una migración POSTERIOR borra a propósito

Van también a `applied`: corrieron en su momento. Reaplicarlas recrearía tablas
que se eliminaron adrede en la simplificación de esquema.

- `20260223000000` — sólo crea objetos que una migración posterior borra a propósito: tournament_rulesets
- `20260227000000` — sólo crea objetos que una migración posterior borra a propósito: squad_members

## ❔ No verificables por existencia de objeto

No crean tablas ni funciones (son `ALTER`, `CREATE POLICY`, `CREATE INDEX`), así que
no se puede saber si corrieron mirando el catálogo de objetos. **Antes de tocarlas**,
revisar si la columna/política/índice que agregan está en la base.

- `20260318002000` — 20260318002000_fix_fixture_rls_recursion.sql
- `20260318003000` — 20260318003000_comprehensive_rls_cleanup.sql
- `20260318200000` — 20260318200000_schema_hardening_v1.sql
- `20260318210000` — 20260318210000_match_points_fields.sql
- `20260318220000` — 20260318220000_perf_composite_indexes.sql
- `20260318240000` — 20260318240000_fix_tournaments_sport_index.sql
- `20260319130000` — 20260319130000_schema_backward_compat.sql
- `20260320110000` — 20260320110000_schema_backward_compat_more.sql
- `20260324193000` — 20260324193000_add_match_sport_columns.sql
- `20260326000000` — 20260326000000_add_team_url_to_external_teams.sql
- `20260326110000` — 20260326110000_team_labels_by_position.sql
- `20260330231000` — 20260330231000_restore_match_context_and_lineups.sql
- `20260407150000` — 20260407150000_add_group_name_to_club_family_divisions.sql
- `20260407183000` — 20260407183000_decimal_match_points.sql
- `20260407200000` — 20260407200000_add_external_tournament_priority.sql
- `20260408193000` — 20260408193000_allow_prode_private_league_admins.sql
- `20260409123000` — 20260409123000_matches_feed_cache_metadata.sql
- `20260410124500` — 20260410124500_user_export_presets_query_index.sql
- `20260411110000` — 20260411110000_fix_rls_policy_performance.sql
- `20260411143000` — 20260411143000_cleanup_favorite_alias_duplicates.sql
- `20260411160000` — 20260411160000_cleanup_internal_external_favorite_duplicates.sql
- `20260412183000` — 20260412183000_harden_unfollow_favorites.sql
- `20260413183000` — 20260413183000_align_super_admin_emails.sql
- `20260413203000` — 20260413203000_repair_role_and_club_family_constraints.sql
- `20260413212000` — 20260413212000_revoke_deportesgrupo_super_admin.sql
- `20260414170000` — 20260414170000_extend_user_export_presets_for_design_customizations.sql
- `20260416120000` — 20260416120000_add_tables_to_external_tournament_standings_overrides.sql
- `20260416173000` — 20260416173000_add_familia_club_user_role.sql
- `20260416174500` — 20260416174500_fix_news_updated_at_trigger.sql
- `20260417164000` — 20260417164000_restore_external_override_public_select.sql
- `20260420183000` — 20260420183000_restore_match_media_and_officials.sql
- `20260425223000` — 20260425223000_restore_tournament_api_compat_columns.sql
- `20260425224500` — 20260425224500_harden_user_export_presets_upserts.sql
- `20260426200000` — 20260426200000_restore_phase_round_date_columns.sql
- `20260427192000` — 20260427192000_db_outage_compat_and_match_indexes.sql
- `20260428180000` — 20260428180000_club_admin_pending_tournaments.sql
- `20260429170000` — 20260429170000_people_club_admin_rls.sql
- `20260430143000` — 20260430143000_club_admin_match_review.sql
- `20260430153000` — 20260430153000_hide_legacy_club_admin_matches.sql
- `20260501233000` — 20260501233000_remove_user_export_presets_conflict_trigger.sql
- `20260515130000` — 20260515130000_playoff_scheduling.sql
- `20260603120000` — 20260603120000_prode_cleanup_phantom_one_team_exact.sql
- `20260603130000` — 20260603130000_prode_rankings_unique_hardening.sql
- `20260701090100` — 20260701090100_unique_round_per_phase.sql
- `20260701090200` — 20260701090200_tournaments_external_id_unique.sql
- `20260701090300` — 20260701090300_matches_status_allow_cancelled.sql
- `20260701090400` — 20260701090400_prode_events_external_upsert_index.sql
- `20260701090500` — 20260701090500_tournaments_sync_locked.sql
- `20260720120000` — 20260720120000_single_active_phase_per_season.sql
- `20260724120000` — 20260724120000_perf_manual_load_indices.sql
- `20260726120100` — 20260726120100_match_clock_backfill.sql
- `20260804150000` — 20260804150000_club_external_ids_format_check.sql
- `20260804160000` — 20260804160000_tournaments_gender.sql
- `20260804170000` — 20260804170000_people_column_privileges.sql
