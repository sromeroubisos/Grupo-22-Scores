# Auditoría de logs de Supabase — 2026-08-08

Ventana analizada: **2026-08-07 19:54 → 2026-08-08 19:52 UTC** (postgres, postgrest,
auth y storage, exportados desde el dashboard).

Estado: **diagnóstico cerrado, nada aplicado.** Ningún archivo del proyecto fue
modificado y ninguna sentencia corrió contra la base.

---

## Cómo retomar esta conversación

Lo que falta es una decisión y una ejecución, en este orden:

1. Correr el **bloque 1 (sólo lectura)** de más abajo y pegar los resultados. Eso
   confirma o tumba la hipótesis del problema **A**, que es el más grave.
2. Con eso decidido, correr el **bloque 2** (arreglo de A por el camino
   `CONCURRENTLY`).
3. Después del pico de tráfico, el **bloque 3** (índices de `matches`).
4. Los arreglos de código (B, C, E, I) van en un deploy aparte; F y G en una
   ventana dedicada con rollback escrito.

Lo único que no se puede diferir sin costo visible es **A**: mientras esté roto,
cada resultado que se carga deja la tabla de posiciones desactualizada.

---

## Contexto que condiciona las decisiones

- **La app está en uso real y creciendo.** Entre las 17:49 y las 19:49 del 08/08
  hay **14 altas de cuenta nuevas** por Google, con refresh de token continuo.
  Sábado a la tarde: día de partidos.
- **La base se cayó y se recuperó sola** el 07/08 a las 23:40:49
  (`database system was not properly shut down; automatic recovery in progress`).
  Durante ~20 s PostgREST devolvió 503 a usuarios reales.
- **15 reinicios del proyecto** en 24 h (PostgREST + Realtime + config reload).

O sea: hay más razón para arreglar y más razón para no improvisar.

---

## Triage

| # | Error | Volumen 24 h | ¿Nuestro? | Impacto |
|---|---|---|---|---|
| A | `42P10` no unique constraint matching ON CONFLICT | ~63 | **Sí** | Recálculo de posiciones falla en silencio |
| B | `22P02` uuid inválido: `"2026"` | ~40 | **Sí** | Cron URBA y filtros por temporada rotos |
| C | `22P02` uuid inválido: slugs de torneo | ~30 | **Sí** | Consultas que devuelven vacío sin avisar |
| D | `57014` statement timeout | 1 | **Sí** | 500 en el H2H del detalle de partido |
| E | `42703` `tournament_participants.division_id` | ~10 | Sí (ruido) | Ninguno funcional |
| F | `refresh_token_already_used` (400) | ~65 | **Sí** | Sesiones que se caen solas |
| G | Volumen de `GET /user` | miles | **Sí** | Costo y latencia |
| H | `invalid_credentials` (400) | ~13 | No | Usuarios tipeando mal |
| I | Storage `POST 400` (logo de torneo) | 1 | Sí | Alta de torneo bloqueada |
| J | Caída de la base + reinicios | — | **No** | 503 a usuarios reales |
| K | Checkpoints, `EOF on standby`, ShareLock | muchos | No | Ruido |

---

## A · `42P10` — el recálculo de posiciones está roto

**Dónde.** `src/lib/server/recalculateStandings.ts:387-391` hace upsert con seis
columnas:

```
onConflict: 'tournament_id,season_id,phase_id,group_id,club_id,table_type'
```

Ese `onConflict` sólo funciona si existe el índice
`tournament_standings_scope_unique`, que crea
`supabase/migrations/20260807120000_standings_table_type.sql:98-110`. El UNIQUE
que hay declarado antes en el historial es de **cuatro** columnas
(`supabase/migrations/20260318200000_schema_hardening_v1.sql:59`).

**La deducción.** El código toma el camino del upsert sólo si `table_type` existe
como columna (`supportsTableType`, línea 275). Si la migración no hubiera corrido
en absoluto, el error sería `42703` y caería al camino DELETE+INSERT. Que el
error sea `42P10` significa: **la columna existe pero el constraint de seis
columnas no**. La migración del 07/08 se aplicó a medias — coherente con que se
aplican a mano en el SQL editor.

**Consecuencia.** Cada recálculo devuelve `{ ok: false }` y la tabla no se
actualiza. Los errores vienen en ráfagas (18:04:29, :32, :35, :35): cada carga de
resultado dispara varios recálculos y todos fallan.

**Hipótesis, no hecho comprobado.** No pude consultar la base desde la sesión (el
MCP de Supabase pide autorización). El bloque 1 lo resuelve en cinco segundos.

---

## B · `22P02` con `"2026"` — `season_id` es TEXT en una tabla y UUID en seis

`supabase/migrations/20260501120000_tournament_seasons_and_rosters.sql:284-310`
agregó `season_id UUID` (FK a `tournament_seasons`) a `matches`,
`tournament_phases`, `tournament_groups`, `tournament_rounds`,
`tournament_participants` y `tournament_standings`. Pero `tournaments.season_id`
sigue siendo el **TEXT** original con el año (`'2026'`,
`supabase/migrations/20260217174500_initial_schema.sql:67`).

Dos columnas con el mismo nombre y distinto tipo. Cualquier código que tome la
etiqueta de un lado y la use de filtro del otro revienta.

- **Caso confirmado en código:** `src/app/api/cron/urba-sync/route.ts:201` hace
  `.eq('season_id', String(ANIO))`. Si esa es la consulta que falla, el cron
  **muere en la primera línea** (`throw new Error('no se pudieron leer los
  torneos')`) y no sincroniza nada.
- **Las ráfagas de exactamente 4 errores idénticos** apuntan a un `Promise.all`
  de cuatro consultas: el sospechoso es
  `src/app/api/admin/tournaments/[id]/standings/route.ts:166,204,228,396`, que
  resuelve `seasonId` de `searchParams.get('season')` y lo aplica a tablas UUID.

**Arreglo en dos niveles.**

1. Táctico: guarda `isUuid()` antes de todo `.eq('season_id', x)` sobre las seis
   tablas UUID. Si no es UUID, resolver el `tournament_seasons.id` por etiqueta o
   no aplicar el filtro.
2. De fondo: renombrar `tournaments.season_id` → `season_label`. Mientras el
   nombre esté duplicado con dos tipos, esto se vuelve a escribir solo.

---

## C · `22P02` con slugs de torneo

Valores vistos: `urba-top-14`, `rugby-world-cup`,
`torneo-regional-del-litoral-a`, `top-10-del-centro`,
`copa-plata-del-oeste-1779311499870`, `rugby-championship-u20-1776713443846`, y
también `"pendientes"` y `"3"` — un nombre de pestaña y un número de página
yendo a parar a un `.eq('id', …)`.

Es la regresión ya documentada en memoria (*UUID External-ID Outage*): ids
externos y slugs entrando a columnas uuid sin validar. Mismo arreglo: guarda
`isUuid` antes del lookup y rama explícita para ids externos. Que aparezcan
`"pendientes"` y `"3"` sugiere además que algún parámetro de UI (filtro o
paginación) se está leyendo como id.

---

## D · `57014` — falta un índice compuesto en `matches`

La consulta que se cortó es la de `src/app/api/db/h2h/route.ts:156-171`:

```
matches WHERE home_club_id IN (3 clubes) AND status IN ('final','finished','ft')
ORDER BY date_time DESC LIMIT 100
```

Índices existentes: `idx_matches_home_club_id` (una columna) e
`idx_matches_date_time` (una columna). Ninguno sirve al `ORDER BY … LIMIT` con
filtro: el planner baja por `date_time` hacia atrás filtrando fila por fila, y
para un club con pocos partidos finalizados recorre media tabla hasta juntar 100.

La migración de índices `20260724120000_perf_manual_load_indices.sql` cubrió
`season_id` y `tournament/phase/status`, no este acceso.

De yapa: el endpoint pide `limit(100)` por lado y después hace `.slice(0, 30)`
(línea 196). Se traen 200 filas con tres joins embebidos para usar 30.

---

## E · `42703` `division_id` — ruido caro, no un bug

Ninguna migración del repo agrega esa columna; el endpoint lo sabe y tiene el
fallback por `isMissingColumnError`
(`src/app/api/tournaments/[id]/participants/route.ts:236-245`). Funciona como
está diseñado, pero el sondeo lanza un error contra la base cada vez que el caché
no está caliente (ráfagas de 3-5).

Arreglo barato: cachear el resultado del sondeo en módulo con TTL largo (una vez
por instancia, no por request), o crear la columna. Prioridad baja.

---

## F · `refresh_token_already_used` — el refresh tiene dos dueños

~65 en 24 h, en ráfagas de hasta 20 en 3 minutos, con un patrón que dice todo:

```
17:27:53  remote_addr 181.9.211.50    (IP residencial AR = navegador)
17:27:54  remote_addr 54.245.155.202  (AWS = el server de Next)
```

**El mismo refresh token se rota desde dos clientes.** Supabase lo rota en cada
refresh; el que llega segundo trae uno ya consumido → 400 `Possible abuse
attempt`. Los reintentos siguen minutos porque el cliente perdedor nunca recibe
el token nuevo.

Arreglo: un solo dueño del refresh.

- Que **sólo el middleware SSR** refresque y escriba la cookie, y el cliente del
  browser no autorefresque (o al revés, pero uno solo).
- Verificar que todos los paths de cookie de auth comparten scope — esto ya mordió
  antes, el fix fue `getSupabaseAuthCookieOptions`.
- Subir el *refresh token reuse interval* en Auth settings (10 s por defecto)
  absorbe las carreras legítimas entre pestañas.

**Riesgo alto de blast radius.** No se toca con 14 altas nuevas por hora entrando.

---

## G · Volumen de `GET /user`

No es un error: decenas por minuto, a veces 5-10 por segundo, con colas de 30 a
112 ms. Es `auth.getUser()` llamándose por request o por render en lugar de una
vez por request y compartido. Arreglo: cachear el usuario por request (`cache()`
de React o contexto). Es costo y latencia, no un fallo.

---

## H · `invalid_credentials`

7 intentos desde `181.239.5.69` en 45 s y 6 desde `38.51.28.245` en 25 s. Volumen
y forma de humano olvidándose la contraseña, no de fuerza bruta. No hay nada que
arreglar; si se quiere blindar, rate limit por IP y ofrecer recuperar contraseña
después del tercer fallo.

---

## I · Storage `POST 400` al subir logo de torneo

Un caso, 07/08 23:46:36, sobre `/object/tournaments/logos/3a335922-…-<ts>.png`.
`src/lib/utils/persistTournamentLogo.ts:43-56` sube con el **cliente del browser**
(JWT del usuario) y con `upsert: false`; sólo tolera "bucket not found" y
cualquier otro error **lanza y corta el guardado del torneo**.

Un 400 de Storage suele ser mime no permitido por el bucket o request inválido
(403 sería RLS, 404 bucket, 413 tamaño). Hace falta el cuerpo de la respuesta para
no adivinar: reproducir subiendo un logo y mirar el `uploadError.message`
completo. Aparte: que un logo que no sube no debería impedir crear el torneo.

---

## J · Caída de la base y reinicios — no es código nuestro

- **07/08 23:40:49**: la base se cayó y recuperó sola. Durante ~20 s PostgREST
  devolvió 503 `PGRST002` a usuarios reales (hay un iPhone pidiendo `/sports`
  desde g22scores.com en ese momento).
- **~15 reinicios de PostgREST** en 24 h, cada uno con recarga de schema cache de
  200 ms a 1,4 s, acompañados de reinicios de Realtime (`starting logical decoding
  for slot …`). Se reinicia el proyecto entero, no un servicio.

Qué hacer: mirar en Supabase → Reports el uso de memoria y CPU alrededor de las
23:40 (los checkpoints muestran picos de 21.946 buffers y 176 MB de WAL en 5 min:
si la instancia es chica, presión de memoria o IO es candidata), y confirmar con
soporte si hubo mantenimiento de plataforma. Del lado del código lo único que
aplica es defensivo: reintento con backoff ante `PGRST002` / `57P03` y servir
desde caché, el mismo patrón que se usó para el corte de FlashScore.

---

## K · Ruido que se puede ignorar

- `checkpoint starting/complete`: operación normal.
- `unexpected EOF on standby connection`, `could not receive data from client`:
  desconexiones de réplica y de cliente.
- `process 21842 acquired ShareLock … after 3349 ms` (02:21): 3,3 s esperando un
  lock de escritura. Aislado. Si se repite, es contención de escritura y el
  candidato es el rebuild de ranking o de standings.

---

# Bloques de ejecución

## Bloque 1 — Verificación (SÓLO LECTURA, correr primero)

```sql
-- 1.1 ¿Existe el UNIQUE de seis columnas? (el corazón del problema A)
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.tournament_standings'::regclass
  AND contype = 'u';

-- 1.2 ¿Existe la columna table_type? Si NO existe, el diagnóstico de A cambia
--     entero (sería 42703, no 42P10).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tournament_standings'
  AND column_name IN ('table_type', 'season_id', 'group_id');

-- 1.3 Duplicados bajo la semántica NUEVA (NULLS NOT DISTINCT).
--     Si devuelve 0 filas, el DELETE destructivo de la migración NO hace falta.
SELECT tournament_id, season_id, phase_id, group_id, club_id, table_type,
       count(*) AS repetidas
FROM public.tournament_standings
GROUP BY 1,2,3,4,5,6
HAVING count(*) > 1
ORDER BY count(*) DESC
LIMIT 50;

-- 1.4 ¿El respaldo de la migración existe? Ojo: se creó con IF NOT EXISTS, así
--     que si la corrida parcial ya lo creó, NO se refresca y puede ser viejo.
SELECT to_regclass('public.tournament_standings_bak') AS backup,
       (SELECT count(*) FROM public.tournament_standings) AS filas_vivas;

-- 1.5 El mapa de tipos de season_id (problema B), tabla por tabla.
SELECT table_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'season_id'
ORDER BY table_name;

-- 1.6 Por si A no fuera standings: qué unicidad tienen las otras tablas con upsert.
SELECT c.relname AS tabla, con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE con.contype IN ('u','p')
  AND c.relname IN ('tournament_standings','tournament_rounds',
                    'club_ranking_match_applications','club_derivatives',
                    'club_integrations','prode_events',
                    'tournament_phase_participants')
ORDER BY c.relname;
```

## Bloque 2 — Arreglo de A, camino sin bloqueo

Sólo si 1.1 confirma que falta `tournament_standings_scope_unique` **y** 1.2
confirma que `table_type` existe. Si 1.3 devolvió filas, hay que deduplicar
primero (paso 4 de la migración original) o el `CREATE UNIQUE INDEX` va a fallar.

**Paso 2.1 — en su PROPIA ejecución, solo.** `CONCURRENTLY` no corre dentro de
una transacción y el editor de Supabase envuelve todo lo que pegues en una
(error `25001`).

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS tournament_standings_scope_unique
    ON public.tournament_standings
       (tournament_id, season_id, phase_id, group_id, club_id, table_type)
    NULLS NOT DISTINCT;
```

**Paso 2.2 — verificar que quedó válido.** Un `CONCURRENTLY` interrumpido deja un
índice INVALID que no sirve consultas y que un `IF NOT EXISTS` saltearía.

```sql
SELECT c.relname, i.indisvalid, i.indisready
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'tournament_standings_scope_unique';
```

Si `indisvalid = false`: `DROP INDEX CONCURRENTLY tournament_standings_scope_unique;`
(también solo, fuera de transacción), resolver duplicados y reintentar 2.1.

**Paso 2.3 — adoptar el índice y bajar el viejo.** Las cuatro sentencias juntas,
en una ejecución, SIN `BEGIN`/`COMMIT` (el editor ya las corre en una
transacción). El `USING INDEX` es instantáneo porque el índice ya está
construido: toma `ACCESS EXCLUSIVE` por milisegundos en vez de por toda la
reconstrucción.

```sql
SET lock_timeout = '3s';

ALTER TABLE public.tournament_standings
    DROP CONSTRAINT IF EXISTS tournament_standings_unique_club;

ALTER TABLE public.tournament_standings
    DROP CONSTRAINT IF EXISTS tournament_standings_tournament_id_phase_id_group_id_club_i_key;

ALTER TABLE public.tournament_standings
    ADD CONSTRAINT tournament_standings_scope_unique
    UNIQUE USING INDEX tournament_standings_scope_unique;
```

Con `lock_timeout` el peor caso es "no entró, reintento en un rato": si el `ALTER`
queda encolado detrás de una transacción larga, aborta en vez de bloquear al resto.

**Por qué hay que bajar el UNIQUE viejo de cuatro columnas.** Con
`group_id` no nulo, dos filas del mismo club en la misma fase con distinto
`table_type` colisionan bajo el constraint viejo: publicar la tabla de local o de
visitante en una fase con grupos tiraría `23505`.

**Verificación posterior:** cargar un resultado y confirmar que la tabla de
posiciones se actualiza, y que no aparecen más `42P10` en los logs.

**Rollback:** `ALTER TABLE public.tournament_standings DROP CONSTRAINT
tournament_standings_scope_unique;` y, si hiciera falta, recrear el viejo
`UNIQUE (tournament_id, phase_id, group_id, club_id)`. El código vuelve a fallar
como hoy, no peor.

## Bloque 3 — Índices de `matches` (después del pico de tráfico)

Uno por vez, cada uno en su propia ejecución.

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_home_club_date
    ON public.matches (home_club_id, date_time DESC);
```

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_away_club_date
    ON public.matches (away_club_id, date_time DESC);
```

Después, el mismo chequeo de `indisvalid` del paso 2.2 con estos dos nombres.

---

# Plan por ventana

| Cuándo | Qué | Peor caso si sale mal |
|---|---|---|
| Ahora | Bloque 1 (lectura) | Nada |
| Ahora, si hay partidos cargándose | Bloque 2 (A) | El `ALTER` no entra y no pasa nada |
| Esta noche, bajo el pico | Bloque 3 (D) | IO extra unos minutos; índice inválido que se dropea |
| Próximo deploy tranquilo | B, C, E, I juntos | Un filtro mal puesto vacía una vista; se revierte |
| Ventana dedicada con rollback escrito | F, G | Se desloguean todos, o vuelve el loop de redirección |
| Nunca en este operativo | `EJECUTAR_STANDINGS_RECORTE_ESCUDOS.sql` | Destructivo; la propia migración dice que no se corre |

---

# Lo que NO está confirmado

Marcado explícito para que nadie lo tome como hecho:

1. **Que el `42P10` sea de `tournament_standings`.** Es la hipótesis más fuerte
   (coincide el `onConflict` de seis columnas, coincide la fecha de la migración,
   coinciden las ráfagas con la carga de resultados), pero hay ~15 upserts más en
   el repo. La consulta 1.6 lo cierra.
2. **Cuál es la consulta exacta que tira el `22P02` con `"2026"`.** El log de
   Postgres no trae la sentencia. `urba-sync:201` es el candidato confirmado en
   código; las ráfagas de cuatro apuntan al endpoint de standings. Para atarlo del
   todo hace falta activar `log_statement` un rato o instrumentar el cliente.
3. **La causa del 400 de Storage.** Falta el cuerpo de la respuesta.
4. **La causa de la caída de la base y de los 15 reinicios.** Correlaciona con
   picos de escritura, pero es infraestructura: lo dice el dashboard o soporte, no
   el código.
