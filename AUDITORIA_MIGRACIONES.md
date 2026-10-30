# Auditoría: migraciones del repo vs. base

Migraciones analizadas: **169** (de `20260217174500_initial_schema.sql` a `20260804160000_tournaments_gender.sql`)
Migraciones con bloques `DO $$` (creación dinámica no parseable): **62**

## TABLAS Y VISTAS
- el repo dice crear: **107**
- existen: **95**
- **faltan: 12**

| objeto | se crea en | fecha | veces creada/dropeada | código vivo que lo usa |
|---|---|---|---|---|
| `club_ranking_leadership_periods` | `20260406103000_club_ranking_leadership_history.sql` | 2026-04-06 | 1C / 0D | `src/lib/server/clubRankings.ts:893`<br>`src/lib/server/clubRankings.ts:1031`<br>`src/lib/server/clubRankings.ts:1060`<br>…+1 |
| `club_rivals` | `20260428190000_club_admin_rivals.sql` | 2026-04-28 | 1C / 0D | `src/app/api/club-admin/matches/route.ts:91`<br>`src/app/api/club-admin/matches/route.ts:100`<br>`src/app/api/club-admin/rivals/route.ts:71`<br>…+2 |
| `external_match_cache` | `20260701090000_restore_external_match_cache.sql` | 2026-07-01 | 2C / 1D | `src/lib/server/prodePlay.ts:912`<br>`src/lib/services/externalMatchCache.ts:185`<br>`src/lib/services/externalMatchCache.ts:210`<br>…+3 |
| `external_match_lineup_overrides` | `20260502170000_lineup_ratings_super_admin.sql` | 2026-05-02 | 1C / 0D | — (sin uso desde TS) |
| `favorites` | `20260318100000_schema_simplification_core.sql` | 2026-03-18 | 4C / 0D | `src/lib/favorites/fetchFavorites.ts:504`<br>`src/lib/favorites/persistence.ts:288`<br>`src/lib/favorites/persistence.ts:306` |
| `import_files` | `20260321120000_restore_fixture_import_tables.sql` | 2026-03-21 | 2C / 1D | `src/lib/services/fixtureImportService.ts:389`<br>`src/lib/services/fixtureImportService.ts:408` |
| `import_jobs` | `20260321120000_restore_fixture_import_tables.sql` | 2026-03-21 | 2C / 1D | `src/lib/services/fixtureImportService.ts:325`<br>`src/lib/services/fixtureImportService.ts:363`<br>`src/lib/services/fixtureImportService.ts:608`<br>…+1 |
| `import_logs` | `20260321120000_restore_fixture_import_tables.sql` | 2026-03-21 | 2C / 1D | `src/lib/services/fixtureImportService.ts:644`<br>`src/lib/services/fixtureImportService.ts:657` |
| `import_match_previews` | `20260321120000_restore_fixture_import_tables.sql` | 2026-03-21 | 2C / 1D | `src/lib/services/fixtureImportService.ts:452`<br>`src/lib/services/fixtureImportService.ts:521`<br>`src/lib/services/fixtureImportService.ts:554`<br>…+3 |
| `import_rows` | `20260321120000_restore_fixture_import_tables.sql` | 2026-03-21 | 2C / 1D | `src/lib/services/fixtureImportService.ts:430`<br>`src/lib/services/fixtureImportService.ts:494`<br>`src/lib/services/fixtureImportService.ts:567`<br>…+1 |
| `lineup_rating_audit` | `20260502170000_lineup_ratings_super_admin.sql` | 2026-05-02 | 1C / 0D | `src/app/api/admin/super/matches/[id]/lineup-ratings/route.ts:80` |
| `user_push_subscriptions` | `20260512160000_system_push_notifications.sql` | 2026-05-12 | 1C / 0D | `src/app/api/cron/push-notifications/route.ts:94`<br>`src/app/api/notifications/system/route.ts:130`<br>`src/app/api/notifications/system/route.ts:178` |

## VISTAS
- el repo dice crear: **1**
- existen: **1**
- **faltan: 0**

## FUNCIONES EXPUESTAS COMO RPC
- el repo dice crear: **44**
- existen: **35**
- **faltan: 9**

| objeto | se crea en | fecha | veces creada/dropeada | código vivo que lo usa |
|---|---|---|---|---|
| `can_manage_phase` | `20260324235500_granular_user_management_access.sql` | 2026-03-24 | 1C / 0D | — (sin uso desde TS) |
| `get_my_favorites_enriched` | `20260219100000_fix_favorites_schema.sql` | 2026-02-19 | 4C / 0D | — (sin uso desde TS) |
| `get_my_favorites_enriched_v2` | `20260219000001_perf_favorites.sql` | 2026-02-19 | 1C / 0D | — (sin uso desde TS) |
| `match_clock_transition` | `20260726120000_match_clock_transition_fn.sql` | 2026-07-26 | 1C / 0D | `src/lib/server/matchClockTransition.ts:77` |
| `person_in_user_managed_club` | `20260430130000_people_rls_include_club_users.sql` | 2026-04-30 | 2C / 0D | — (sin uso desde TS) |
| `toggle_favorite` | `20260219100000_fix_favorites_schema.sql` | 2026-02-19 | 2C / 0D | — (sin uso desde TS) |
| `toggle_tournament_follow` | `20260312000006_global_tournaments_system.sql` | 2026-03-12 | 1C / 0D | — (sin uso desde TS) |
| `upsert_external_team` | `20260228000000_add_external_teams_cache.sql` | 2026-02-28 | 1C / 0D | — (sin uso desde TS) |
| `user_can_manage_club_people` | `20260430130000_people_rls_include_club_users.sql` | 2026-04-30 | 1C / 0D | — (sin uso desde TS) |

## EXISTE EN LA BASE PERO NINGUNA MIGRACIÓN LO CREA

El parser tira dos tipos de resultado acá y **hay que separarlos**. Contrasté cada
uno contra la mención literal del nombre en `supabase/migrations/`:

### a) Creados fuera de las migraciones — huérfanos de verdad

Cero menciones en los 169 archivos. Existen porque alguien los creó a mano en el
editor SQL:

| objeto | tipo |
|---|---|
| `agent_action_logs` | tabla |
| `pending_agent_actions` | tabla |
| `get_my_favorites` | rpc |
| `is_admin_safe` | rpc |
| `rls_auto_enable` | rpc |

`get_my_favorites` es la más interesante: es la RPC que **reemplazó** a
`get_my_favorites_enriched` (que el repo declara y no existe). O sea que el sistema
nuevo de favoritos se construyó directo en la base, sin pasar por una migración.

### b) Falsos positivos del parser — sí están en las migraciones

Mi regex no los agarró (bloques `DO $$`, o una forma de `CREATE` que no matchea).
No son un problema de la base, son un límite de esta auditoría:

| objeto | menciones en migraciones |
|---|---|
| `club_divisions` | 15 |
| `club_person_roles` | (mismo origen que el anterior) |
| `delete_matches_feed_cache_for_scope` | 1 |
| `is_admin_telegram_user_authorized` | (migraciones de telegram) |
| `link_admin_telegram_user_identity` | (migraciones de telegram) |

**Lo que esto dice del parser:** acierta en la mayoría pero no es exhaustivo con
`DO $$`. La lista de FALTANTES es la confiable (si el objeto no está expuesto, no
está expuesto). La de huérfanos hay que leerla con la salvedad de arriba.

## ÍNDICES

El repo dice crear **311** índices. PostgREST no los expone, así que
no se pueden contrastar desde acá: la consulta para verificarlos está al final.

## RESUMEN DE IMPACTO

De los **21** objetos que faltan:

- **12 tienen código vivo que los usa** desde TypeScript. Son los que pueden estar
  fallando hoy: `club_ranking_leadership_periods`, `club_rivals`, `external_match_cache`, `favorites`, `import_files`, `import_jobs`, `import_logs`, `import_match_previews`, `import_rows`, `lineup_rating_audit`, `user_push_subscriptions`, `match_clock_transition`.
- **9 no se usan desde TypeScript**: `external_match_lineup_overrides`, `can_manage_phase`, `get_my_favorites_enriched`, `get_my_favorites_enriched_v2`, `person_in_user_managed_club`, `toggle_favorite`, `toggle_tournament_follow`, `upsert_external_team`, `user_can_manage_club_people`.
  Ojo con estas: `can_manage_phase`, `person_in_user_managed_club` y
  `user_can_manage_club_people` son helpers que las **políticas RLS** invocan por
  dentro, no desde la app. Que no aparezcan acá no significa que no hagan falta —
  significa que si la política que las usa tampoco se creó, el problema es más
  grande, no más chico.

## LO QUE ESTA AUDITORÍA **NO** PUEDE VER

Hay que verificarlo a mano; las consultas están abajo.

1. **Índices.** 311 declarados en las migraciones, PostgREST no los expone.
2. **Objetos creados dentro de bloques `DO $$`.** 62 de las 169 migraciones tienen
   al menos uno. Un `EXECUTE format(...)` que cree una tabla es invisible para el parser.
3. **Tablas que existen pero no están expuestas por PostgREST.** Si a una tabla le
   faltan los GRANT o quedó fuera del schema expuesto, acá figura como "falta" sin faltar.
   Por eso el punto de partida de la verificación es `to_regclass`, que mira el catálogo
   de Postgres y no la vista de la API.
4. **Políticas RLS, triggers y constraints.** No entran en esta pasada.
5. **El historial de migraciones.** El esquema `supabase_migrations` no está expuesto
   (`PGRST106: Only the following schemas are exposed: public, ...`).

## CONSULTAS PARA VERIFICAR (correr en el editor SQL)

### 1. El punto de partida

```sql
SELECT to_regclass('public.favorites') AS favorites,
       to_regclass('public.external_match_cache') AS external_match_cache,
       to_regclass('public.provider_entities') AS provider_entities;
-- NULL = no existe de verdad. No NULL = existe y el problema es de exposición/GRANT.
```

### 2. Los 12 objetos que figuran como faltantes, de una

```sql
SELECT n, to_regclass('public.' || n) AS existe
FROM unnest(ARRAY[
  'club_ranking_leadership_periods',
  'club_rivals',
  'external_match_cache',
  'external_match_lineup_overrides',
  'favorites',
  'import_files',
  'import_jobs',
  'import_logs',
  'import_match_previews',
  'import_rows',
  'lineup_rating_audit',
  'user_push_subscriptions'
]) AS n
ORDER BY existe NULLS FIRST, n;
```

### 3. Las funciones

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname = 'public'
  AND p.proname IN ('can_manage_phase', 'get_my_favorites_enriched', 'get_my_favorites_enriched_v2', 'match_clock_transition', 'person_in_user_managed_club', 'toggle_favorite', 'toggle_tournament_follow', 'upsert_external_team', 'user_can_manage_club_people',
                    'get_table_columns', 'get_table_constraints')
ORDER BY 1;
-- Las que no aparezcan, no existen.
```

### 4. El historial de migraciones vs. el repo

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

El repo tiene **169** archivos. Si esa consulta devuelve menos filas, la diferencia
son las que nunca corrieron. Para cruzarlo sin trabajo manual:

```sql
SELECT v AS version_en_el_repo,
       (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = v) IS NOT NULL AS aplicada
FROM unnest(ARRAY[
  -- pegar acá los prefijos numéricos de supabase/migrations/, uno por línea:
  '20260217174500','20260218100000' /* … */
]) AS v
ORDER BY 1;
```

Si `schema_migrations` está vacía o no existe, quiere decir que las migraciones se
vinieron aplicando a mano en el editor SQL y **no hay historial**: ahí el repo no es
la fuente de verdad de nada y la única forma de saber qué corrió es comparar objeto
por objeto, como hace esta auditoría.

### 5. Índices declarados que no existen

```sql
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1;
-- Contrastar contra los 311 CREATE INDEX de supabase/migrations/.
```
