# Estado — reloj de partido

Última actualización: 2026-07-26. Rama `feat/reloj-derivado`.

## En main y deployado (`297080b`)

| Commit | Qué arregla |
|---|---|
| `ccc5cfa` | `start_period` abre el período **pendiente** en vez de volver siempre a 1T — mata el dead-end de cargar "Inicio de período" después de "Fin 1T". |
| `2b11904` | INICIAR/REANUDAR ahora **persisten `status: 'live'`** en la DB (antes era solo estado local, y el partido no entraba al feed público ni activaba el guard del prode) + una sola cola para todos los PATCH optimistas. |
| `297080b` | El rótulo corto de hockey sobre césped pasa de "Hockey C." a "Hockey". Solo el rótulo: los `sport_id` no se tocaron. |

Los tres son código puro: **no hay migraciones pendientes** para lo que está en producción.

## En la rama, sin aplicar (P1 — `1c3ad15`)

El reloj deja de ser un snapshot que un `setInterval` incrementa a mano y pasa a **derivarse**:

```
display = is_running ? accumulated_seconds + (now - period_started_at) : accumulated_seconds
```

Resuelve, en este orden de importancia: que el reloj sobreviva a un refresh, a la pestaña en background (donde Chrome throttlea el interval) y al cambio de dispositivo; que INICIO 2T salte al offset del período; y que dos operadores en simultáneo no se pisen (la transición es atómica en una sola sentencia SQL).

Toca 7 archivos: `src/lib/matchClock.ts`, `src/hooks/useMatchClock.ts`, `src/lib/server/matchClockTransition.ts`, dos migraciones, más `MatchCenterClient.tsx` y `api/admin/matches/[id]/route.ts`.

**Pendiente conocido:** `ClubMatchWorkspace.tsx` sigue en modelo snapshot. Lee el espejo legacy, así que no se rompe, pero su reloj no es derivado.

## Decisiones tomadas — no re-discutir

- **Decisión A: `accumulated_seconds` es cumulativo del partido**, no del período. El 2T arranca en el offset (rugby 2400). Motivo: el espejo legacy `minute`/`seconds` que leen la ficha pública y `ClubMatchWorkspace` sale cumulativo y solo cumulativo, así que esos consumidores siguen correctos sin tocarles una línea.
- **ET colapsado en uno solo** (offset 4800 en rugby). No se agrega ET2: `PERIOD_ORDER` ordenaría un código nuevo después de FT, y con acumulado cumulativo el offset propio de ET2 no compra nada.
- **Hockey = mitades de 30'**, `sport_id` real **`field-hockey`** (23 torneos, 105 partidos; `hockey` es hielo y no tiene ninguno). Son 4 cuartos de 15' pero el vocabulario solo expresa 1T/2T; el número del reloj sale bien igual porque el acumulado es cumulativo. Q1..Q4 es otro ticket.
- **El ancla la estampa el servidor**, nunca `Date.now()` del navegador. El cliente declara intención con un modo: `start` / `pause` / `set` / `keep`. En `pause` el server calcula contra el ancla guardada e **ignora el número del cliente**.
- **Guarda: el rebase de arranque solo aplica con el reloj pausado.** El flujo natural es apretar INICIAR y recién después cargar el evento "Inicio partido"; sin la guarda ese evento borraría el tiempo ya corrido y frenaría un reloj andando.
- **El rebase se engancha al evento de arranque, no al cambio de período.** `match_half` / `end_period` / `match_end` pausan conservando el tiempo real (FIN 1T a los 41:30 queda 41:30). `match_start` / `start_period` rebasan al offset.

## Orden de despliegue de P1

1. `supabase/migrations/20260726120000_match_clock_transition_fn.sql` — la función de transición.
2. `supabase/migrations/20260726120100_match_clock_backfill.sql` — el backfill (idempotente, trae su query de verificación al pie).
3. Recién ahí, el código.

Al revés también funciona — sin la función, `runMatchClockTransition` cae al path JS, que ancla igual a hora de server pero **no es atómico**. No dejarlo así en un fin de semana con partidos.

## Antes de mergear

Correr entero el checklist de 11 casos: **[RELOJ_DERIVADO_PRUEBAS.md](RELOJ_DERIVADO_PRUEBAS.md)**. Incluye cómo armar un partido de prueba que no aparezca en el feed público ni en el prode.
