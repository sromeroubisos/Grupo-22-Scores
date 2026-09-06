# Conector de RugbyPass

**Fecha:** 2026-09-06 · **Rama:** `feat/carrera-rugby-v2`

Registro del trabajo: qué se investigó, qué se construyó, qué se rompió en el
camino y qué queda pendiente.

---

## 1. El pedido

Reemplazar a FlashScore como proveedor de rugby usando RugbyPass, empezando por
seis torneos, con la lista de partidos y los eventos alimentándose solos, el
partido siguiéndose en vivo y las estadísticas visibles.

**Motivo del cambio:** en FlashScore el rugby llega mutilado. `matches/list` no
completa `match_status`, así que un partido **terminado** llega con
`is_finished: false` y se publica como programado. RugbyPass manda
`sts: "Result"` explícito.

---

## 2. La fuente

No hace falta raspar HTML: RugbyPass tiene una API JSON interna sin
credenciales. `robots.txt` no bloquea `/fixtures/` ni `/live/` (incluso permite
explícitamente a `ClaudeBot`).

| Endpoint | Qué devuelve |
|---|---|
| `POST /fixtures` · `loadaction=load-init-fixtures-data` | Calendario entero, ~2 MB |
| `POST /fixtures` · `action=poll-vue-games&games=<ids>` | Estado + marcador, 318 B para 4 partidos |
| `POST /live/<slug>/?g=<id>` · `action=live-poll-data` | **La ficha completa**, ~126 KB |
| `GET /live/<slug>/?g=<id>` | La página; solo trae la cronología |

El cuerpo llega envuelto en `<html><body><p>…</p></body></html>` aunque sea
JSON, y adentro los `&` de las URLs vienen escritos `&amp;`.

`live-poll-data` es el hallazgo importante: en **una** llamada trae cronología,
estadísticas del partido, estadísticas por jugador, posesión, territorio y las
tablas. Es el mismo endpoint con el que el match centre se refresca solo.

### Cobertura medida

**2555 partidos, 36 competiciones, del 2025-07-28 al 2027-08-29.**

Seis habilitados (1498 partidos):

| Torneo | id | Partidos |
|---|---|---|
| Pro D2 | 211 | 485 |
| Top 14 | 203 | 369 |
| United Rugby Championship | 204 | 295 |
| Gallagher Premiership | 201 | 183 |
| Hilux NPC | 208 | 147 |
| Internationals | 3 | 19 |

---

## 3. Hallazgos que costaron trabajo

### 3.1 La hora que no existe

`t`, `tsm`, `st` y `k` salen en **la zona del visitante**, resuelta por geo-IP.
Medido cambiando la timezone de sesión y volviendo a pedir el mismo feed:

| tz | Partido de hora real 07:10 UTC | Partido placeholder |
|---|---|---|
| AR (−03) | `4:10am`, día `20250731` | `9:00pm`, día **`20260905`** |
| Pacific/Auckland | `7:10pm`, día `20250731` | `12:00pm`, día **`20260906`** |
| UTC | `7:10am`, día `20250731` | `12:00am`, día **`20260906`** |

`gmt` no se movió nunca. **Es el único campo de tiempo confiable.**

**`gmt` a medianoche UTC exacta significa "hora desconocida", no las 00:00.**
Son 444 de 2555 (17,4%) — el valor más frecuente de todo el feed, contra 165 del
segundo. El Top 14 y la Pro D2 son franceses: medianoche UTC serían las 02:00 en
Francia.

Aparece casi solo en partidos **futuros** (Top 14 83%, Pro D2 89%) y 0% en los
ya jugados: es fixture sin horario confirmado, se completa solo. El cron no los
escribe y los cuenta en `skippedNoKickoffTime`.

> **Caso testigo.** Chile XV vs Argentina XV se juega el domingo 6 a las 16:00
> CLT. RugbyPass lo publicaba como sábado 5 a las 21:00 — 20 horas de desfase y
> el día equivocado. Y colapsaba dos partidos separados por tres horas en el
> mismo instante inexistente.

### 3.2 Torneos abandonados

Criterio medible: **% de partidos ya jugados que tienen resultado cargado**.
Los 35 torneos sanos dan 90–100%. El **Americas Rugby Championship da 0%**:

| Partido | Resultado real | RugbyPass |
|---|---|---|
| Argentina XV vs Paraguay (29/8) | 58–11 | `0-0`, `st:"FT"` |
| Chile XV vs Uruguay XV (29/8) | 33–12 | `0-0`, `st:"FT"` |
| Argentina XV vs Uruguay XV (2/9) | 64–10 | `0-0`, `st:"FT"` |
| Chile XV vs Paraguay (2/9) | 54–26 | `0-0`, `st:"FT"` |

Seis partidos, cero horarios reales, cero resultados, cero eventos. Está
excluido en `RUGBYPASS_EXCLUDED` con el motivo escrito. Es el mismo patrón que
ya mordió en AAMH: un `0-0` sin cargar leído como empate.

### 3.3 Los eventos

Muestreo de 97 partidos en 33 torneos. **28 de 33 con eventos en el 100% de los
partidos**, entre 17 y 26 por partido.

| Icono | Tipo del proyecto | Muestras |
|---|---|---|
| `try` | `try` | 731 |
| `con` | `conversion` | 518 |
| *(interval)* | `match_start` / `match_half` / `match_end` | 258 |
| `yc` | **`card_yellow`** | 162 |
| `pg` | `penalty_goal` | 113 |
| `rc` | **`card_red`** | 13 |
| `dg` | `drop_goal` | 1 |

**Trampa del mapeo:** en `matchEventCatalog.ts` el rugby usa
`card_yellow`/`card_red` y el fútbol `yellow_card`/`red_card`, **al revés entre
sí**. El nombre equivocado no rompe el insert pero deja los contadores por
jugador en cero.

Sin línea de tiempo: Farah Palmer Cup y Super Rugby Aupiki (0/3 cada uno),
Super Rugby Women 1/3. Traen marcador, no eventos — y eso no es un error.

### 3.4 El slug de la URL no es decorativo

`/live/?g=<id>` responde **200 y sin eventos**. Un slug inventado da 404. Se
arma con los slugs de los dos equipos, que ya viajan en los ids
(`rp-team-auckland` → `auckland-vs-waikato`); si vuelve vacío se prueba el orden
inverso, porque RugbyPass no siempre pone al local primero.

Costó un diagnóstico entero: con la URL sin slug, las 24 fichas devolvían 0
eventos **sin ningún error**. Con el slug: 24/24, 497 eventos.

### 3.5 FlashScore no manda `country_name` en rugby

El mapper cae a `'International'` y el país real queda **pegado al nombre**:
`"New Zealand: Bunnings NPC"`. Un filtro que compare nombre exacto y país por
separado falla por los dos lados a la vez.

El matcher parte el nombre por `:` y busca el país entre el campo declarado **y**
esos segmentos.

Ojo también con los nombres de campo: el `Match` de `flashscore.ts` los llama
`leagueId` / `leagueName` / `leagueUrl`, **no** `tournament*`.

### 3.6 Nunca filtrar un torneo por nombre solo

Conviven `rugby-france-top-14` y `rugby-argentina-top-14`, los dos llamados
"Top 14". Se resuelve por id del catálogo, por fragmento de URL (que lleva el
país adentro) o por nombre **con** país. Los ids opacos desambiguan solos:

| Torneo | id de FlashScore |
|---|---|
| Top 14 (Francia) | `6LLKpkiU` |
| Top 14 (Argentina) | `ILOhakKD` |
| Bunnings NPC | `jZAJkgK7` |
| Premiership | `pA7BoY5e` |
| URC | `EyHYm58U` |

Hay un test llamado *"EL TOP 14 ARGENTINO NO SE APAGA"*.

### 3.7 La colisión de identidad (el bug más difícil)

Argentina vs Australia del 5/9 salía **dos veces**, y el usuario entraba siempre
a la fila sin datos. Había **cuatro** filas con la misma identidad
(`fecha + rivales`):

```
fisu-match-m-PO03-000300 | 07:30Z   Seven universitario FISU  ← OTRO partido real
ra-761229                | 12:00Z   archivo
8xgaTvZI                 | 21:00Z   FlashScore
rp-949624                | 21:00Z   RugbyPass
```

El pliegue comparaba cada fila nueva contra **la primera guardada**, no contra la
mejor del grupo. El Seven ocupaba el lugar con rango 1 → FlashScore empataba ese
rango y se colaba por la regla de "dos de la misma fuente son dos partidos
reales" → y RugbyPass después reemplazaba al Seven en vez de a FlashScore.

Ahora el pliegue guarda **el mejor rango del grupo y todas las filas que lo
empatan**; cuando llega una mejor, se caen todas las peores.

---

## 4. Cómo quedó armado

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `src/lib/services/rugbyPassParser.ts` | Puro: feed, poll, eventos, `live-poll-data`. Catálogo de los 6 torneos + el ARC excluido con su motivo |
| `src/lib/services/rugbyPass.ts` | Red: `getRugbyPassFixtures`, `getRugbyPassPoll`, `getRugbyPassEventsFor`, `getRugbyPassMatchDetail` |
| `src/lib/services/rugbyPassSupersedes.ts` | Qué torneo de FlashScore se apaga, y bajo qué condición |
| `src/lib/services/rugbyPassMatchBundle.ts` | La ficha de `/api/matches/[id]` |
| `src/app/api/cron/rugbypass-sync/route.ts` | Cron horario → `external_match_cache` + `external_match_events` |
| `supabase/migrations/20260906120000_external_match_events.sql` | Tabla de eventos externos |
| 3 archivos de test | 49 casos |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/lib/matchFeedDedupe.ts` | `feedSourceRank` + pliegue por grupo + `dropSupersededMatches` + `hasStaleRowsNeedingRepair` |
| `src/app/api/matches/route.ts` | Rama de reparación que respeta la cobertura |
| `src/app/api/matches/[id]/route.ts` | Rama para ids `rp-` |
| `src/app/api/cron/live-sync/route.ts` | Sondeo en vivo de RugbyPass |
| `src/lib/services/externalMatchCache.ts` | `resetStaleLiveMatches` excluye las filas `rp-` |
| `next.config.ts` | Host `eu-cdn.rugbypass.com` para los escudos |
| `vercel.json` | Cron `rugbypass-sync` a `20 * * * *` |

### Decisiones de diseño

**El reemplazo se decide al LEER, no al escribir.** FlashScore sigue guardando
esos torneos a propósito: la caché tiene las dos fuentes y el feed elige. Si se
cortara en la escritura, no habría a qué caer el día que RugbyPass falle.

**Y es condicional.** La fila de FlashScore se apaga únicamente si en la misma
tanda vino al menos un partido de RugbyPass de esa competición. *Apagar sin
tener con qué reemplazar es destruir* — la primera versión apagaba siempre y,
como el cron no había corrido, los seis torneos desaparecieron de la pantalla.

**Precedencia:** `feedSourceRank` → rugbypass (2) > proveedor vivo (1) > archivo (0).

**Los eventos no van a `match_events`.** Esa tabla exige
`match_id UUID REFERENCES matches(id)` y un partido externo no está en `matches`
ni tiene id con forma de UUID. Van a `external_match_events` con `match_id TEXT`.

**Una fila vencida no tapa el día entero.** `/api/matches` descartaba la caché
completa de un día al encontrar una fila sin resultado con el kickoff pasado. El
5/9, una sola fila (*"Puma Trophy, Argentina vs Australia, scheduled"*) tiraba
abajo los 12 partidos de RugbyPass — teniendo RugbyPass ese partido cerrado
28-28 en la misma caché.

---

## 5. Estado verificado

```
fixtures: 1498 partidos en 2185 ms (una llamada)
   147  Hilux NPC                   conHora=147  sinHora=  0
   369  Top 14                      conHora=222  sinHora=147
   485  Pro D2                      conHora=285  sinHora=200
   183  Gallagher Premiership       conHora=143  sinHora= 40
   295  United Rugby Championship   conHora=295  sinHora=  0
    19  Internationals              conHora= 17  sinHora=  2
estados: { final: 826, scheduled: 671, live: 1 }   ARC presente? false
```

**Cargado en la base:** 1109 partidos + 497 eventos de 24 fichas.

**Ficha de un partido** (`/api/matches/rp-950809`):

```
North Harbour 57 - 42 Northland | Hilux NPC | Finalizado
CRONOLOGIA → ordenada por minuto? true
   4' home  Try de Tu'ungafasi
  10' away  Try de Ramm
ESTADISTICAS: 10        JUGADORES: 15
  56% Territorio  44%     Avances  1 Rory Taylor  North Harbour  16
  60% Posesión    40%     Quiebres 1 James Ramm   Northland       3
   8  Tries        6
```

**Feed del día** (5/9): 317 partidos, 12 de RugbyPass, **una sola** fila para
Argentina vs Australia (`rp-949624`).

**Suite:** 49/49 tests · `tsc --noEmit` 0 errores · `npm run build` compila.

---

## 6. Operación

```bash
# Cargar la caché a mano (en dev sin CRON_SECRET la ruta pasa sola)
curl http://localhost:3000/api/cron/rugbypass-sync

# En producción
curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/rugbypass-sync
```

Sumar un torneo: agregarlo a `RUGBYPASS_COMPETITIONS` **y** su reemplazo a
`RUGBYPASS_SUPERSEDES`. Hay un test que falla si crece la lista de competiciones
sin reemplazo.

---

## 7. Pendiente

| Tema | Estado |
|---|---|
| **Notificaciones por evento** | No hecho. La infra existe (`user_notifications` + cron `push-notifications` cada minuto). Falta el disparador: en `live-sync`, bajar eventos del partido en vivo, comparar contra `external_match_events` e insertar una notificación por cada nuevo. El texto ya está en un solo lugar (`toTimelineEvent`) |
| **Alineaciones** | **HECHO — existían.** Están en `homeTable` / `awayTable` de `live-poll-data`, la misma llamada que ya se hacía: 23 por lado con número, nombre, slug del jugador y el minuto de entrada o salida. El diagnóstico anterior buscó una clave con nombre de "formación" y no miró las dos tablas |
| **Cambios de jugador** | Están en la pestaña Commentary (play-by-play, 85 comentarios por partido), que todavía no se lee |
| **389 fixtures sin horario** | No se publican. Entran solos cuando RugbyPass les asigna hora. Cerrarlo del todo pide una columna `kickoff_time_known` |
| **`penalty_try`** | **CONFIRMADO y resuelto.** Argentina-Australia del 5/9/2026, 69': llega con el mismo icono `try` y en el lugar del jugador dice el texto `Penalty Try`, sin `<a>` porque no hay ficha. Contarlo como try común dejaba al visitante en 26 con el partido 28-28. Se detecta por ese texto y se emite `penalty_try`, que el catálogo ya valuaba en 7 |
| **Premiership Cup** | **No existe como fixture** en RugbyPass (`fixtures-results/` da 404), ni en premiershiprugby.com |
| **Temporadas** | **HECHO** (§7.5). Corte por mes de inicio declarado por competición. El mes salió de contar el feed, no del ojo: es **julio** en las cuatro del norte —el único sin partidos, y deja las finales de junio del lado correcto—, año calendario en el NPC y ninguno en Internationals. Agosto/septiembre, que era la corazonada, se lleva puestos los 8 partidos de agosto de la Pro D2. El selector no necesitó pantalla nueva: ya se arma con `archives` |
| **Perfiles de equipo y jugador** | **HECHO** (§7.5). `rugbyPassProfiles.ts` + rama en `/api/teams` y `/api/players`. El prefijo se declaró además en las DOS pantallas donde el id caía por el camino del club de la base |
| **Los catálogos como reemplazo** | Los parsers y la red están listos y probados; falta engancharlos donde hoy se ve el equipo o el jugador de FlashScore. El guardarraíl de Super Rugby Americas y el ARC ya está puesto (§7.2) |
| **Deploy** | El cron nuevo solo corre en Vercel después de un deploy: se lee del `vercel.json` desplegado |

---

## 7.1 Lo que se arregló el 2026-09-06

La ficha de un partido no mostraba nada: "Local vs Visitante", 0:0, PROGRAMADO
e "Invalid Date", con la cronología igual visible. El endpoint estaba bien —
devolvía Argentina 28-28 Australia con sus 22 eventos— y el problema era de
ruteo en la pantalla.

**`isExternalMatch` no incluía RugbyPass.** `MatchDetailClientPage` lista siete
proveedores y `rp-` no estaba en ninguno, ni había rama `source === 'rugbypass'`
junto a las de `fih`/`fisu`/`espn`. El id caía por el camino de partido LOCAL,
que lee `home_team` y `date_time` en vez de `home` y `date`. Los eventos se veían
porque ese mismo camino pide `/api/matches/[id]` y encuentra `match.events` de
casualidad: la cabecera se leía con un vocabulario y los eventos con otro.

> Un proveedor nuevo se agrega en DOS lugares de esa pantalla: el predicado del
> id y la rama por `source`. Con uno solo, la página no falla — miente.

**El detalle leía 8 de 38 claves.** Se sumaron:

| Antes | Ahora |
|---|---|
| 8 estadísticas (`statsSummary`) | **26** — los siete bloques: scrums, lines con % de éxito, pases, metros post contacto, tackles y su completitud, patadas, tarjetas |
| Sin alineaciones | 23 + 23, con titulares/suplentes y minuto de cambio |
| Sin planilla de jugadores | 46 filas con nombre, número, tries, puntos y tarjetas |

**El regex de estadísticas estaba muerto.** Buscaba `.home`/`.label`/`.away`,
que RugbyPass no emite: acertaba **nunca** y todo salía por el respaldo de texto
plano, que lee el rótulo con `[A-Za-z .'-]` y por eso perdía justo los que
llevan `%`. Medido: 3 de 6 en `setPlays`, 2 de 3 en `defence`, 1 de 2 en `kicks`.
Un respaldo que funciona a medias es peor que uno que no funciona: nadie lo mira.

**El período de la cronología era un número.** `toTimelineEvent` emitía `1` o `2`
y `normalizeMatchPeriod` espera `'1T'`/`'2T'`: caía al fallback y los 22 eventos
se agrupaban bajo "Primer tiempo", con el minuto 69 adentro. Ahora el período se
arrastra por la secuencia y lo adelanta el entretiempo, como en el resto del
proyecto. El orden descendente NO era el error: `MatchTimeline` hace `.reverse()`
a propósito para todos los deportes.

Los cruces que dan confianza en el resultado: las amarillas contadas desde la
cronología (3 y 1) coinciden con las que declara la planilla del proveedor, y
los puntos derivados por evento cierran 28-28 recién con el try penal valuado
en 7.

---

## 7.2 Los otros tres catálogos: torneos, equipos y jugadores

Investigados y medidos el 2026-09-06. **Ninguno necesita navegador**: los tres
salen con `fetch` plano. Scrapling no hace falta acá.

| Fuente | Cómo se pide | Qué da |
|---|---|---|
| `/players/` | `POST /players` · `action=load-players` (pagina de a 150) o **`action=filter-players`** | JSON **sin** el envoltorio HTML. `filter-players` con `comp=<oid>` devuelve la lista ENTERA sin paginar: Top 14 → 1729, URC → 1158, Internationals → 2453. Campos `{n, p (puesto), t (equipos), l, pid, sqd}` |
| `/tournaments/` | `GET`, más el array embebido en la página | 32 torneos con `title`, `uri`, `id` y `oid` |
| `/teams/` | `GET`, HTML server-rendered | **299** equipos con slug, nombre, id de escudo y competiciones |

El slug de `/teams/` es exactamente el de `rp-team-<slug>`, así que engancha
directo con lo que ya guarda el conector.

### Las trampas medidas

**`id` no es `oid`, y conviven en la misma página.** "International" es `id=107`
pero `oid=3`; el Rugby World Cup es `id=111` / `oid=210`. Y cada consumidor usa
uno distinto:

| Dónde | Cuál usa |
|---|---|
| El campo `c` de un partido del feed | **`oid`** |
| El parámetro `comp` de `filter-players` | **`oid`** |
| El `data-comps` de una fila de `/teams/` | **`id`** |

`RUGBYPASS_COMPETITIONS.id` es el **`oid`**. Leer `data-comps` como si fuera oid
le asigna a cada equipo torneos ajenos sin dar ningún error.

**`/teams/` publica la lista DOS veces.** La página trae dos bloques
`list-players` (una copia por breakpoint): un parseo directo devuelve 598 filas
que son 299 equipos repetidos. Hay que plegar por slug.

**`/teams/` no es catálogo completo.** De los 221 slugs que aparecen en el feed
de partidos, **29 no están en `/teams/`**: todo el rugby femenino (Farah Palmer
Cup, Super Rugby Aupiki, Super W) más `england-a` e `italy-a`. Cruzar contra
`/teams/` y descartar lo que no matchea perdería esos 29.

**Los torneos cuelgan de la raíz**, no de `/tournaments/<slug>/`: son
`/internationals/`, `/rugby-world-cup/`. Buscar links `/tournaments/...` da cero.

### El guardarraíl: lo que no se reemplaza nunca

`RUGBYPASS_NUNCA_REEMPLAZA`, en `rugbyPassSupersedes.ts`. **Super Rugby Americas
y el Americas Rugby Championship se quedan con la fuente que ya los trae**, y
`supersedingEntry` chequea la protección ANTES que cualquier regla, así que ni
un id exacto la pasa por encima.

No es una precaución teórica y tampoco hacía falta forzarla hoy: **Super Rugby
Americas no existe en RugbyPass**. No está entre las 36 competiciones del feed
ni entre las 32 del catálogo —hay Super Rugby *Pacific* (oid 205) y ninguna
Americas— y en los 299 equipos no aparece un solo club del torneo: ni Dogos XV,
ni Pampas, ni Peñarol, ni Selknam, ni Yacaré XV, ni Tarucas. Solo están las
selecciones mayores. La lista existe para que la regla no dependa de que el
catálogo siga como hoy: si mañana RugbyPass suma la Americas, agregarla a
`RUGBYPASS_COMPETITIONS` no alcanza para apagar la fuente actual — hay que
sacarla de la protección a propósito, y hay un test que lo defiende.

### Lo que falta para que reemplacen

Los parsers y la capa de red de los tres catálogos, y después el reemplazo en
las pantallas donde hoy se ve el equipo o el jugador de FlashScore (ficha de
club, buscador, ficha de jugador). El criterio es el mismo que ya rige para los
partidos: **el reemplazo se decide al LEER y solo si RugbyPass trajo el dato**;
apagar sin tener con qué reemplazar es destruir.

---

## 7.3 La pantalla del torneo y los catálogos construidos

`/tournaments/rp-comp-208` daba **"Tournament data unavailable"** y un 503. El
endpoint no existía: la pantalla tomaba el id por un torneo de base y le pedía
`/api/db/tournaments/rp-comp-208/data`, que espera un UUID.

> **Es el mismo hueco que tenía la ficha del partido, y apareció en CINCO
> lugares.** Un proveedor nuevo se declara en una lista de prefijos que está
> repetida por toda la app: `isExternalMatch`, la rama por `source`, la rama de
> torneo externo, la guarda del metadata de base, el selector de temporadas y el
> menú de navegación. Con una sola sin actualizar la pantalla no falla: **miente**
> —dibuja los valores por defecto— o deja un 404 por visita en la consola.

Lo que se agregó:

| Archivo | Qué hace |
|---|---|
| `rugbyPassCatalog.ts` | Parsers puros de torneos, equipos, jugadores y **tabla de posiciones** |
| `rugbyPassTournamentBundle.ts` | La ficha del torneo para `/api/tournaments?id=rp-comp-<oid>` |
| `rugbyPassCatalog.test.ts` | 20 casos |

Los partidos del torneo salen de `external_match_cache` —lo que el cron ya
llena— y no de una llamada nueva al proveedor. La tabla sí se pide, porque no
está en la caché: **viaja adentro de `live-poll-data` y solo si se pide con
`liveStandings=1`**; con `0`, que es lo que manda la ficha del partido, el campo
llega en `0` y parece que el torneo no tuviera tabla.

### La tabla trae los dos bonus del rugby

Once columnas: `P W L D PF PA PD BP-T BP-7 BP Total`. Es la única fuente del
proyecto que separa el bonus **ofensivo** (por tries) del **defensivo** (perder
por 7 o menos).

**Los valores se leen por ENCABEZADO, no por posición.** Son once `<div>`
idénticos sin clase que los distinga: atarse al índice significa que el día que
RugbyPass corra una columna, la tabla sigue mostrando números sin dar ningún
error —los puntos de un equipo pasan a leerse como su diferencia—. Emparejar por
rótulo deja la columna en cero, que se ve.

La lectura se verificó con cuatro igualdades que solo dan si cada valor cayó en
su lugar, en los 14 equipos del NPC: `Pts = G×4 + E×2 + BP`, `BP = BPT + BP7`,
`DG = PF − PA`, `PJ = G + E + P`.

### Etiquetas de zona: RugbyPass no las publica

Medido en cuatro torneos con playoffs (NPC, Top 14, URC, Premiership): las
mismas siete clases estructurales, sin leyenda, sin colores y sin notas. No hay
clasificación ni descenso marcados. No se inventaron.

### Fluidez: una memoria de proceso, no un temporizador

El catálogo de torneos son dos páginas de cientos de KB y la tabla otros 130 KB.
Pedirlos en cada visita era lo que hacía lenta la pantalla. Ahora hay un `Map`
con vencimiento —seis horas el catálogo, cinco minutos la tabla— y el endpoint
responde en ~0,55 s.

Es un `Map` y **no un `setInterval`**: un temporizador de módulo deja el proceso
vivo y cuelga `node --test`. Ya pasó con `cache.ts`.

El logo y los colores de marca del torneo salen de esa misma caché, así que la
cabecera no dispara una descarga por visita.

### Las trampas que se midieron al construir los catálogos

**Un torneo puede tener página y NO tener competición.** El catálogo de ids y la
grilla de `/tournaments/` no son uno superconjunto del otro, así que se unen por
slug y la unión da **34**, no 32:

- Solo en la grilla, **sin `oid`**: `the-rugby-championship` y `celtic-challenge`.
  No hay número con el que pedirles partidos ni jugadores. **Los del Rugby
  Championship llegan por "Internationals" (oid 3)**, que es el cajón de sastre.
- Solo en el catálogo de ids: las cuatro competiciones femeninas —Pacific Four,
  Mundial femenino, WXV y su Challenger—, que no salen en la grilla visual.

Por eso `competitionId` es **nullable**. Asumir que todo torneo tiene `oid` se
rompe justo en el torneo más importante del hemisferio sur, y sin dar error.

**`pid` no es el id del jugador: es el ORDINAL DEL PUESTO** (ver §7.5 — acá
decía "número de camiseta", y no lo es). Los 2453 jugadores
de "Internationals" comparten apenas **16 valores de `pid`**, del 0 al 15, y cada
uno cae siempre en el mismo puesto (1 y 3 Prop, 2 Hooker, 6/7/8 Back Row, 9
Scrum Half, 10 Fly Half). Plegar por `pid` dejaría **16 filas en vez de 2453**.
La identidad es el slug.

**`ti` puede traer más ids que nombres.** Son los ids internos de los equipos, en
el mismo orden que los nombres de `t`. Coinciden en 2450 de 2453; tres jugadores
traen dos ids y un solo nombre. Se parean por índice y el sobrante se ignora.

**El cruce jugador→equipo va por NOMBRE.** El `ti` del jugador y el número del
escudo de `/teams/` son espacios de ids distintos (AUNZ XV es `ti` 30389 y escudo
100030389; Auckland es `ti` 4350 y escudo 501). Dentro de un mismo proveedor
cruzar por nombre es sano; entre proveedores no valdría. Resuelve el 94% de los
13.660 vínculos, y lo que no resuelve queda con `slug: null` en vez de
descartarse: son clubes históricos —Jaguares, Stade Français, Mie Honda Heat—
que no están entre los 299 vigentes, y perderlos borraría la trayectoria.

**Corrida real de los catálogos:**

```
torneos:    34 (32 con oid, 6 habilitados)   2,4 s
            18 de 32 tienen id != oid
equipos:   299 de 598 filas, 0 duplicados    1,9 s
jugadores: 5045 unicos, 0 duplicados         7,2 s
            2498 salian en mas de una competicion
```

---

## 7.4 Las etiquetas de la tabla y el domingo vacío

### Las zonas las pone el proyecto

RugbyPass **no publica etiquetas de zona**. Medido en cuatro torneos con
playoffs (NPC, Top 14, URC, Premiership): las mismas siete clases estructurales,
sin leyenda, sin colores, sin notas. No hay clasificación ni descenso marcados.

El reglamento vive en `RUGBYPASS_ZONES`, en `rugbyPassCatalog.ts`, y es el único
lugar donde se escribe. Los cuatro colores acordados:

| | Tipo | Qué marca |
|---|---|---|
| 🟢 | `primary` | clasificación directa (semifinal) |
| 🔵 | `secondary` | la instancia previa (cuartos, barrages) |
| 🟡 | `playoff` | repechaje: se juega la permanencia o el ascenso |
| 🔴 | `relegation` | descenso |

Lo cargado hoy:

| Torneo | Verde | Azul | Amarillo | Rojo |
|---|---|---|---|---|
| Top 14 (14) | 1-2 | 3-6 | 13 | 14 |
| Pro D2 (16) | 1-2 | 3-6 | — | 15-16 |
| URC (16) | — | 1-8 | — | — |
| Premiership (10) | 1-4 | — | — | — |
| Hilux NPC (14) | 1-4 | — | — | — |

La Premiership **no lleva zona roja a propósito**: el descenso está suspendido
por el sistema de licencias de la RFU, y marcar una consecuencia que no se juega
es inventarla. "Internationals" no lleva zonas porque no tiene tabla.

**El guarda del tamaño.** Cada reglamento declara con cuántos equipos se
escribió, y si RugbyPass devuelve una tabla de otro tamaño las zonas se descartan
**enteras**. Una liga que pasa de 14 a 12 equipos movería el descenso a un puesto
de mitad de tabla, y pintar de rojo la fila equivocada es peor que no pintar
nada: el que la lee no tiene cómo darse cuenta.

Las etiquetas viajan en el `teamLabels` del bundle con la forma que ya entiende
`resolveStandingsRowLabel` (una asignación **por posición**), así que no se abrió
un segundo camino de pintado y la leyenda sale sola.

### Una reparación no puede borrar lo que no sabe reponer

**Síntoma:** el domingo 6/9/2026 no se veía ningún partido de RugbyPass, y el
sábado sí. La caché tenía tres ese domingo —dos del NPC cerrados y uno del
Top 14 por jugar— y la portada mostraba cero.

**Causa:** un puñado de filas **de FlashScore** quedadas en `scheduled` con el
kickoff hace dos a cinco horas marcaba el día como reparable
(`hasStaleRowsNeedingRepair`). El camino de reparación reemplaza el día entero
con lo que contesta FlashScore — y FlashScore **no cubre** las competiciones que
ahora trae RugbyPass, que es justamente el motivo del reemplazo. El día salía con
las filas de FlashScore y sin una sola de RugbyPass.

Y no lo salvaba el respaldo: `servedCacheAsFallback` pide que la reparación no
haya traído **nada**, y había traído quince. Una reparación que "funciona" para
su proveedor y borra a otro es peor que una que falla.

**El arreglo:** después de reparar se reponen desde la caché las filas que la
reparación no trajo, comparando por id. La reparación tiene autoridad sobre las
filas del proveedor que se vuelve a pedir, no sobre las de otro.

```
                 antes   despues
2026-09-04         9        9
2026-09-05        12       12
2026-09-06 (dom)   0  ->    2     ← el reportado
2026-09-12        10       10
2026-09-13 (dom)   2        2
```

Sin duplicados en ninguno de los cinco días.

> **Ojo al reproducirlo:** el bloque externo de `/api/matches` corre solo con
> `?external=true`, y el corte por día usa `timeZone`. Un `curl` sin esos dos
> parámetros da cero partidos externos y parece el bug cuando no lo es. La app
> siempre manda los dos.

---

## 8. Errores propios, para no repetirlos

1. **Apagué FlashScore antes de que existiera un solo dato de RugbyPass.** El
   cron no había corrido y los seis torneos desaparecieron de la pantalla. El
   reemplazo tiene que ser condicional a que haya con qué reemplazar.
2. **Corrí `npm run build` con el dev server levantado.** Los dos escriben en
   `.next/` y se pisan. Después culpé a eso de un bug que era otro.
3. **Diagnostiqué "el servidor tiene código viejo" sin probarlo.** Era una
   colisión de identidad con el Seven universitario. Reiniciar no cambió nada.
4. **Construí la escritura de eventos sin la lectura.** La tabla se llenaba y la
   ficha seguía vacía porque `/api/matches/[id]` no tenía rama para `rp-`.
5. **Armé la URL de la ficha sin el slug.** Devolvía 200 con lista vacía, que es
   la peor forma de fallar.

---

## 9. Nota de sesión

Última corrida: **2026-09-06**. `97/97` tests y `npx tsc --noEmit` sin errores.

**`npm run build` no se corrió**, a propósito: el dev server estaba levantado y
los dos escriben en `.next/`. Es el error propio nº2 de la lista de arriba. Antes
de dar el trabajo por cerrado hay que bajar el dev server y compilar.

Archivos del conector, para retomar:

```
src/lib/services/
  rugbyPassParser.ts           partidos, eventos, ficha, alineaciones, try penal
                               + temporadas (mes de inicio por competición)
  rugbyPassProfiles.ts         la ficha de UN equipo y la de UN jugador
  rugbyPassCatalog.ts          torneos, equipos, jugadores, tabla, zonas
  rugbyPass.ts                 la red, con la memoria de proceso
  rugbyPassMatchBundle.ts      la ficha de UN partido
  rugbyPassTournamentBundle.ts la ficha de UN torneo
  rugbyPassSupersedes.ts       qué reemplaza y qué NO se reemplaza nunca
  + 3 archivos de test (85 casos)
```

**Lo que hay que recordar de esta sesión, en una línea:** un proveedor nuevo se
declara en una lista de prefijos que está **repetida en cinco lugares** de la
app, y con una sin actualizar la pantalla no falla — miente.

---

## 7.5 Lo que se cerró el 2026-09-06 (segunda vuelta)

### Las temporadas se cortan por el mes de inicio, y el mes salió de contar

El Top 14 mezclaba 369 partidos de dos temporadas bajo el mismo torneo, así que
la pantalla abría con los resultados de la pasada — son los más recientes con
marcador.

El corte no se eligió a ojo. Contando el feed entero (1498 partidos habilitados):

| Torneo | Meses con partidos | Corte |
|---|---|---|
| Top 14 · Premiership · URC | sep → jun | **julio** |
| Pro D2 | **ago** → jun | **julio** |
| Hilux NPC | jul → oct, dentro del mismo año | **enero** |
| Internationals | gira de julio, ventana de noviembre, Rugby Championship | **ninguno** |

Julio es el único mes sin un solo partido en las cuatro del norte, y deja junio
—las finales— del lado de la temporada que termina. **Agosto o septiembre, que
era lo que sugería el ojo, se lleva puestos los 8 partidos de agosto de la Pro
D2** y los manda a la temporada anterior. Hay un test por cada uno de esos
bordes.

El rótulo lo decide el mismo dato: mes `1` es año calendario y se escribe con un
año solo (`2025`); cualquier otro cruza el año y se escribe con dos (`2025-26`).

**No hizo falta pantalla nueva.** El selector de temporadas de un torneo externo
ya se arma con `archives` (`buildExternalSeasonOptions`), así que alcanzó con
emitirlas desde el bundle y pasar el `season_id` que ya viajaba en el endpoint.
Van **sin `id`** a propósito: `pickArchiveSeasonIds` toma un `id` no numérico
como `tournament_stage_id` y lo cuelga de la URL, donde para este proveedor no
significa nada.

Una temporada pedida que no existe **no se inventa**: se cae a la de hoy. Y
cuando la de hoy no tiene partidos —en julio una liga del norte no juega— se cae
a la más reciente publicada, que es lo que se quiere ver entre temporadas.

Verificado contra el server: `rp-comp-203` abre en `2026-27`, con `2026-27` y
`2025-26` en el selector, 6 resultados y 29 partidos por jugar en vez de los 369
de las dos temporadas juntas.

### La ficha del equipo y la del jugador: era el camino de lectura

Los datos estaban desde §7.2. Lo que faltaba era que alguien los pidiera.
`rugbyPassProfiles.ts` arma las dos fichas: la identidad sale del catálogo (con
memoria de proceso, que ahora **también cubre equipos y jugadores** — sin eso una
ficha costaba los 7,2 s de la corrida entera por visita) y los partidos salen de
`external_match_cache`, igual que la ficha del torneo.

Tres cosas que el módulo NO hace, a propósito:

- **No inventa lo que el proveedor no publica.** De un jugador hay nombre,
  puesto, número, foto y los clubes por los que pasó. Fecha de nacimiento, altura
  y peso van en `null` explícito. Valor de mercado no existe: el eje económico
  del rugby es el escalafón de empleo.
- **No descarta al equipo que no está en `/teams/`.** De los 221 slugs del feed,
  29 no figuran en la grilla —todo el rugby femenino, más `england-a` e
  `italy-a`—. Cuando el catálogo no lo tiene, la identidad se rearma con lo que
  dicen sus propios partidos.
- **No recorta el slug: lo valida.** Baja derecho a un filtro de PostgREST
  (`home_team->>id.eq.<id>`), y ahí una coma cierra el primer `eq` y agrega una
  condición propia al `or(...)`. Lo que no matchea `[a-z0-9-]` devuelve `null` y
  el endpoint sigue de largo.

Y otra vez el hueco de los prefijos, en **dos** pantallas más:

| Dónde | Qué hacía sin declarar el prefijo |
|---|---|
| `TeamDetailClientPage.adminClubId` | Tomaba `rp-team-auckland` por un club de la base y le abría el panel de gestión a una fila que no existe |
| `PlayerDetailClientPage.buildTeamHref` | Armaba `/clubs/fs-team-rp-team-auckland`, que no es ningún club |

### El domingo no estaba vacío: lo tapaba el filtro de audiencia

Reportado como "siguen sin verse los partidos de los días que no son sábado".
**No era un problema de datos ni de caché.** Medido en el navegador:

| Día | MAYORES | JUVENILES/RESERVA |
|---|---|---|
| domingo 13 | 19 filas | **261** |
| sábado 12 | 137 filas | 165 |

La URBA juega las divisiones de **mayores el sábado** y las **juveniles el
domingo**. La portada abre en MAYORES, así que un domingo con 280 partidos en la
respuesta deja 19 en pantalla. El filtro hace exactamente lo que tiene que hacer
—un juvenil no está en "mayores" por diseño— pero **no había nada que dijera que
los otros 261 estaban a un clic**.

Ahora la portada cuenta cuántos se lleva puestos la audiencia y lo dice, con el
mismo estándar que ya rige para el botón deshabilitado (*decí qué falta*):

> Hay 261 partidos más en **Juveniles/Reserva**

Se muestra **siempre que haya algo tapado, no solo cuando la lista queda vacía**:
un domingo con 19 partidos a la vista tampoco parece vacío, y es justo el caso en
el que nadie sospecha que falta algo.

Lo que este síntoma enseña, y vale para el próximo: **antes de buscar el bug,
comparar lo que devuelve el endpoint con lo que pinta la pantalla.** El endpoint
contestaba 280 los siete días medidos; el server no tenía nada roto. Dos causas
descartadas por medición antes de llegar a la buena: el service worker no cachea
`/api/matches` (solo escudos y estáticos) y `fetchDate` no escribe la caché
cuando aborta.

### Lo que la verificación en pantalla encontró (y el código no)

Las dos fichas compilaban, tenían tests y contestaban `ok: true`. Abrirlas
igual valió la pena: **tres datos estaban mal, y los tres con cara de buenos.**

**`pid` no es el número de camiseta: es el ordinal del PUESTO.** Está medido
sobre los 114 del plantel de Auckland — cada valor cae siempre en el mismo
puesto y ninguno en dos:

```
1 Prop   2 Hooker   3 Prop   4 Lock   5 Lock   6/7/8 Back Row
9 Scrum Half   10 Fly Half   12/13 Centre   11/14/15 Outside Back   0 sin puesto
```

Publicarlo como camiseta pintaba **siete props distintos con un "1" al lado**.
Ahora no se muestra: se usa solo para ordenar, que es para lo que sirve —del 1
al 15 es como se lee un equipo de rugby—. El `0` se va al final y no adelante de
los pilares.

> El doc ya lo decía en §7.2 ("`pid`… es el número de camiseta") y ahí también
> estaba mal escrito. El dato correcto es el de arriba.

**El club actual no se puede deducir del orden de la carrera.** El `t` del
jugador es su trayectoria entera —"New Zealand, Barbarians, All Blacks XV, AUNZ
XV, Blues, Clermont, Auckland"— y el orden no significa nada: en el plantel de
Auckland el club propio cae ÚLTIMO en 67 de 114 y PRIMERO en 8; en el de
Leinster no cae ni último ni primero en **ninguno** de los 100. Tomar el primero
era inventar un club plausible y equivocado, que es el error que no se ve.
Ahora va en `null` y la verdad viaja entera en la trayectoria. Si algún día hace
falta el club de hoy, el camino es `filter-players` con `team=<ti>`, que es la
única pregunta que RugbyPass contesta sin ambigüedad.

**La trayectoria no linkeaba.** La fila lee el club de un `team` **anidado**
(`entry.team?.team_id`) y el bundle emitía un `team_id` plano, así que los siete
clubes salían como texto suelto. El que no resuelve a slug sigue sin link a
propósito: son clubes históricos sin ficha a donde ir.

**Un plantel de 114 NO es un bug.** Es lo que RugbyPass publica: pedirle
`filter-players` con `team=4350` devuelve los mismos 114. Es un registro de club,
no una lista de 23, y recortarlo por nuestra cuenta sería inventar un criterio
que el proveedor no tiene.

Verificado en pantalla: `/clubs/rp-team-auckland` abre con 16 resultados, 4
partidos por jugar y las 114 filas del plantel enlazadas a su ficha, con el
dorsal en `-`; `/players/rp-player-aj-lam` abre con puesto y los siete clubes de
la trayectoria, cada uno linkeado a su club.
