# Las 21 faltantes, una por una

**Nada de esto se aplica como lote.** El caso favoritos es la prueba: hoy no está
roto porque el error se traga, y el día que la tabla exista el código viejo empieza
a escribir y quedan dos fuentes de verdad.

Ordenadas por riesgo, no por fecha. El riesgo combina *qué se rompe hoy* con *qué
se rompe si aparece mañana* — un objeto que hoy no molesta pero que al aparecer
duplica una fuente de verdad es más peligroso que uno que hoy falla ruidosamente.

> Todo lo de acá abajo es **hipótesis hasta que corras el `to_regclass`**. Si un
> objeto resulta existir, el problema es de GRANT o de exposición, no de migración,
> y el veredicto cambia.

---

## 🔴 RIESGO ALTO — aparecer es peor que faltar

### 1. `favorites` · `20260318100000` (2026-03-18)

| | |
|---|---|
| **Hoy** | Nada visible. `getActionError` ([useFavorites.ts:156](src/hooks/useFavorites.ts#L156)) sólo propaga el error cuando fallan **todas** las promesas; como la escritura nueva (`user_favorite_leagues`) funciona, sale un `console.warn` y el favorito se guarda bien. |
| **Si aparece** | El camino viejo deja de fallar y **empieza a escribir**. Conviven `favorites` y `user_favorite_*` para el mismo favorito, sin nada que las sincronice. La UI lee de las nuevas; `favorites` se llena de datos que nadie mira y que se desincronizan al primer unfollow que tome otro camino. |
| **Código** | Vivo y alcanzable: [persistence.ts:288](src/lib/favorites/persistence.ts#L288) y [:306](src/lib/favorites/persistence.ts#L306), llamado desde [useFavorites.ts:431](src/hooks/useFavorites.ts#L431) y [:496](src/hooks/useFavorites.ts#L496). |
| **Veredicto** | **Borrar el código viejo.** `src/lib/favorites/persistence.ts` y `fetchFavorites.ts` quedaron atrás cuando el sistema se rehízo sobre `user_favorite_*` + `get_my_favorites` (que existe y **ninguna migración crea** — se construyó a mano en la base). Sacar la llamada del `Promise.allSettled` y dejar de crear la tabla. |

### 2–6. `import_jobs`, `import_rows`, `import_files`, `import_logs`, `import_match_previews` · `20260321120000` (2026-03-21)

| | |
|---|---|
| **Hoy** | Nada. La ruta `/api/tournaments/[id]/fixture/import` responde 500 si alguien le pega — pero **ninguna UI la llama**. Verificado: cero referencias en `.tsx`. |
| **Si aparece** | Revive un **tercer** importador de fixture compitiendo con dos que sí están vivos: el de Excel (`/api/admin/torneo/import` → `src/lib/tournamentImport/`, enlazado desde el sidebar y el home de `/admin/torneo`) y el de ingesta (`/api/admin/super/tournament-ingestion`). Tres caminos para crear los mismos partidos, con criterios de deduplicación distintos. |
| **Código** | `fixtureImportService.ts`, 18 llamadas, **sin ninguna guarda** de tabla faltante. Vivo como código, muerto como funcionalidad. |
| **Veredicto** | **Borrar la migración y el código.** Es la respuesta a P2: no revivirlo. Antes de borrar conviene confirmar que nadie le pega a la ruta desde afuera (n8n, Postman, un bookmark) — un log de acceso de una semana alcanza. |

### 7–10. `get_my_favorites_enriched`, `get_my_favorites_enriched_v2`, `toggle_favorite`, `toggle_tournament_follow` · 2026-02/03

| | |
|---|---|
| **Hoy** | Nada. Ningún TS las invoca. |
| **Si aparecen** | Mismo problema que `favorites`: son la API vieja de favoritos. `get_my_favorites` (sin `_enriched`) ya existe en la base y es la que se usa. |
| **Código** | Muerto. |
| **Veredicto** | **Borrar las migraciones.** Van juntas con la decisión 1 — son la misma deuda. |

---

## 🟠 RIESGO MEDIO — hoy hay una funcionalidad caída

### 11. `club_rivals` · `20260428190000` (2026-04-28)

| | |
|---|---|
| **Hoy** | **Rompe fuerte.** [club-admin/rivals/route.ts](src/app/api/club-admin/rivals/route.ts) no tiene **ninguna guarda** de tabla faltante: la ruta tira 500. La funcionalidad de rivales del panel de club está caída. |
| **Si aparece** | Empieza a funcionar. No hay implementación paralela que duplicar. |
| **Código** | Vivo: 3 llamadas en `rivals/route.ts`, 2 en `club-admin/matches/route.ts`. |
| **Veredicto** | **Aplicar.** Es aditiva y no compite con nada. Confirmar antes que la pantalla de rivales esté enlazada desde el panel de club. |

### 12. `match_clock_transition` (rpc) · `20260726120000` (2026-07-26)

| | |
|---|---|
| **Hoy** | El reloj del partido no transiciona. Es la migración **más reciente** de las faltantes — nueve días antes de esta auditoría, lo que sugiere que la divergencia sigue produciéndose hoy, no es sólo histórica. |
| **Si aparece** | Funciona. |
| **Código** | Vivo: [matchClockTransition.ts:77](src/lib/server/matchClockTransition.ts#L77). |
| **Veredicto** | **Aplicar.** Chequear si `20260726120100_match_clock_backfill.sql` también quedó sin correr: van en par. |

### 13. `external_match_cache` · `20260701090000` (2026-07-01)

| | |
|---|---|
| **Hoy** | La caché de fallback del feed no existe desde 2026-03-18. Cuando el proveedor se cae, `/api/matches` no tiene de dónde leer — el escenario exacto para el que se construyó. Ya no es silencioso: el fix de P0 hace que los dos crons respondan 500. |
| **Si aparece** | Funciona como fue diseñada. No hay fuente de verdad paralela: es una caché, no un origen. |
| **Código** | Vivo: 6 llamadas en `externalMatchCache.ts`, 1 en `prodePlay.ts:912`. |
| **Veredicto** | **Aplicar.** O dar de baja los dos crons. Lo que no se puede es dejarlos corriendo cada hora contra el vacío. |

### 14. `user_push_subscriptions` · `20260512160000` (2026-05-12)

| | |
|---|---|
| **Hoy** | Las push notifications no funcionan. Degrada con elegancia: el código tiene 2 guardas, así que no tira 500. |
| **Si aparece** | Empieza a funcionar. Ojo: si hay usuarios que "se suscribieron" sin que se guardara nada, van a tener que volver a suscribirse. |
| **Código** | Vivo: `cron/push-notifications:94`, `notifications/system:130` y `:178`. |
| **Veredicto** | **Aplicar si la feature se quiere.** Si no, borrar migración + código + el cron. Es la única de la lista donde la decisión es de producto, no técnica. |

---

## 🟡 RIESGO BAJO — degrada solo, sin duplicar nada

### 15. `club_ranking_leadership_periods` · `20260406103000`

Hoy no se registra el historial de liderazgo del ranking. `clubRankings.ts` tiene
**3 guardas**, así que degrada sin romper. Al aparecer, empieza a acumular desde
cero — el histórico previo no se puede reconstruir.
**Veredicto: aplicar**, asumiendo que el histórico arranca hoy.

### 16. `lineup_rating_audit` · `20260502170000`

Sólo un `INSERT` de auditoría en [lineup-ratings/route.ts:80](src/app/api/admin/super/matches/[id]/lineup-ratings/route.ts#L80), con 2 guardas.
Hoy se pierde la traza de quién puntuó una formación.
**Veredicto: aplicar** si la auditoría importa; si no, **borrar el insert**.

### 17. `external_match_lineup_overrides` · `20260502170000`

Va en la misma migración que la anterior pero **sin ningún uso desde TS**.
**Veredicto: verificar si quedó código a medio hacer.** Si no aparece nada, borrar de la migración.

### 18. `upsert_external_team` (rpc) · `20260228000000`

Sin uso. La escritura en `external_teams` hoy se hace directo, sin RPC.
**Veredicto: borrar la migración.**

---

## ⚫ HAY QUE MIRARLAS ANTES DE CLASIFICARLAS

### 19–21. `can_manage_phase`, `person_in_user_managed_club`, `user_can_manage_club_people`

**No las llama ningún TS — las llaman las políticas RLS**, y ahí está el problema.
`can_manage_phase` aparece en el `USING`/`WITH CHECK` de políticas definidas en la
**misma migración** que la crea ([20260324235500:383-392](supabase/migrations/20260324235500_granular_user_management_access.sql#L383-L392)).

Dos escenarios, y no son equivalentes:

- **La migración no corrió entera.** La función no existe *y las políticas tampoco*.
  Las tablas afectadas quedaron con RLS activo y sin política → deniegan todo a
  `anon`/`authenticated`, y sólo funcionan por `service_role`. Eso puede explicar
  comportamientos raros de permisos que se hayan atribuido a otra cosa.
- **La migración corrió a medias.** La política existe y la función no → **cada
  consulta contra esa tabla tira error de función inexistente**. Sería muy visible;
  que no se note sugiere el primer escenario.

**Veredicto: ninguno todavía.** Es lo primero que hay que resolver después del
`to_regclass`, porque toca permisos y no datos. La consulta está abajo.

---

## Consultas para cerrar el diagnóstico

```sql
-- ¿Existen las políticas que llaman a las funciones faltantes?
SELECT schemaname, tablename, policyname, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual::text LIKE '%can_manage_phase%'
    OR qual::text LIKE '%person_in_user_managed_club%'
    OR qual::text LIKE '%user_can_manage_club_people%');
-- 0 filas  -> la migración no corrió; las tablas quedaron sin política.
-- >0 filas -> corrió a medias; esas tablas están tirando error en cada consulta.

-- Tablas con RLS activo y CERO políticas: deniegan todo salvo service_role.
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)
ORDER BY 1;
```
