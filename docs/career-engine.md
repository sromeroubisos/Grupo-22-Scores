# Motor de "Carrera de Rugby" — cómo funciona hoy

Estado del motor al cerrar la **Fase 0** (reconocimiento). Este documento
describe lo que el código **hace**, no lo que se quiere que haga. Si algo acá no
coincide con `src/features/career/`, gana el código y hay que corregir el
documento.

Versiones selladas en este momento:

| Constante | Valor | Dónde |
|---|---|---|
| `ENGINE_VERSION` | `1.11.0` | `types/career.ts` |
| `SCHEMA` (guardado) | `8` | `carrera-rugby/careerStorage.ts` |
| `CLUB_CATALOG_VERSION` | `2026-27.6` | `data/clubs.ts` |
| `SA_SNAPSHOT_VERSION` | `464399ffada4` | `data/clubs2026/saClubs.generated.ts` |
| `NATIONS_VERSION` | `2026-07.2` | `data/nations.ts` |
| `COMPETITION_LEVELS_VERSION` | `2026-27.1` | `data/competition-levels2026.ts` |
| `CAREER_ENVIRONMENT_VERSION` | `2026-27.2` | `engine/environment.ts` |
| `TRANSFER_RULES_VERSION` | `2026-07.3` | `engine/market-routes.ts` |
| `CAREER_MARKET_VERSION` | `2026-27.1` | `engine/event-selector.ts` |

Contenido: **67 eventos** declarativos (club 8, entorno 16, lesiones 6, medios 7,
hitos 8, selección 7, personal 8, táctica 7).

---

## 1. Determinismo: de dónde sale el azar

`engine/random.ts` expone un **mulberry32** cuyo estado es un `uint32`
serializable. No hay ninguna otra fuente de azar en el motor: un `grep` de
`Math.random|Date.now(|new Date(|performance.now(|localStorage|window.|navigator`
sobre `src/features/career/**` (excluyendo tests) devuelve **una sola línea, y es
un comentario**.

El estado del RNG viaja dentro de `CareerState.rngState`. El reducer lo restaura
con `createRng(next.rngState)`, opera, y vuelve a guardarlo. Por eso una partida
guardada a mitad de camino retoma exactamente la misma carrera: no se re-siembra
nada.

`hashSeed(string) → uint32` (FNV-1a) convierte texto en semilla estable.

El único `Math.random()` legítimo del proyecto está en `CareerFlow.tsx:43`, para
sortear la semilla inicial de una partida nueva.

---

## 2. Forma del estado

`CareerState` (en `types/career.ts`) es **JSON puro**. Campos:

- **Identidad y azar** — `version`, `clubCatalogVersion`,
  `competitionLevelsVersion`, `seed`, `rngState`.
- **Elecciones selladas** — `startRoute` (§4b) y `paceMode` (§13). Las dos se
  fijan al crear y no cambian: si el ritmo pudiera cambiarse a mitad de camino,
  (semilla + decisiones) dejaría de reproducir la carrera.
- **Jugador** — `player: Player` (atributos, dinámicas, empleo, track, club,
  elegibilidad, lesiones, flags, hitos alcanzados).
- **Ciclo** — `phase: 'setup' | 'season' | 'event' | 'retired'`,
  `pendingEventId`, `recentEventIds` (últimos 8, para cooldowns).
- **Mercado** — `offers`, `marketEvaluatedSeason`, `lastMoveSeason`.
- **Continuidad de temporada** — `lastStanding` (posición del club en su liga, es
  lo que habilita copas al año siguiente), `previousSeasonLoad` (carga
  normalizada de la temporada anterior; el **salto** es lo que dispara lesiones).
- **Trayectoria** — `seasons: SeasonResult[]` (resultado detallado) e
  `history: CareerSeasonEntry[]` (**snapshot congelado** por temporada: club,
  competición, banda, empleo, OVR, hitos…). La UI lee `history`, no recalcula
  desde el catálogo, así que cambiar el catálogo no reescribe el pasado.
- **Modificadores pendientes** — `pendingTitleBoost`, `pendingCapBoost`, que una
  decisión deja para la temporada que está por jugarse.
- **`decisionLog`** — `{ seasonIndex, eventId, optionId, text }`.

Dos ejes que conviene no confundir (`engine/contracts.ts`):

- **`EmploymentStatus`** — el vínculo económico. Ordinal:
  `amateur → amateur-compensated → semi-professional → full-time-professional`.
- **`SquadTrack`** — `development | senior`. **No** es un escalón económico: un
  juvenil de academia en un club grande puede tener mejor vínculo que un semipro
  de una liga menor.

---

## 3. El ciclo de una temporada

Todo pasa por `careerReducer(state, action)` (`state/career-reducer.ts`), que es
puro: clona con `structuredClone`, restaura el RNG, opera, y regraba `rngState`.

```
createInitialCareer(input, seed)
  └─ createPlayer(...)            atributos, potencial, club inicial, contrato
  └─ beginSeason()                selectEvent → phase 'event' o 'season'

careerReducer CHOOSE/ADVANCE
  └─ resolveAndPlay()             juega el TRAMO (1, 2 o 3 temporadas: §13)
       ├─ applyDecision()         solo si había evento pendiente
       ├─ simulateSeason()        LA temporada
       ├─ shouldRetire() ? phase='retired'
       ├─ … resto del tramo: selectEvent(marketOnly) + simulateSeason()
       │     (el mercado corta el tramo; los eventos estáticos no)
       └─ beginSeason()
```

Con `paceMode: 'intense'` —el default— el tramo es **una** temporada, el bucle no
se ejecuta ni una vez y el ciclo es exactamente el de 1.10.0.

`simulateSeason()` (`engine/simulate-season.ts`), en orden:

0. **Entorno** (`deriveEnvironment`) — deriva del club + empleo + track + edad +
   rol + copas + si es internacional.
1. **Envejecimiento** (`applyAging`) — el entorno modula *cuánto rinde el
   trabajo*, no el techo. `growthScale = growthScaleFor(ovr, potencial) ×
   environmentSupport × loadPenalty × youthDrive × developmentRoll`.
2. **Rol** de la temporada (`roleAtClub(ovrEfectivo, prestigio)`).
3. **Lesión** — el riesgo sale de la **carga** y de su **salto** respecto del año
   anterior, nunca del enum de contrato. Una lesión grave baja
   `power/speed/stamina`, así que el OVR de la temporada **puede caer**.
4. **Rendimiento** — partidos, minutos, rating y planilla por puesto.
5. **Selección nacional** — en paralelo al club; el `capBoost` de un evento solo
   cuenta si el jugador puede representar a una unión de verdad.
6. **Competiciones** — cadena explícita
   `ELEGIBLE → CLASIFICADO → INSCRIPTO → SIMULADO → CAMPEÓN → título del CLUB →
   (con ≥3 apariciones senior) título del JUGADOR`.
7. **Dinámicas** (forma, fatiga, moral, fama) + **tope duro de +9 OVR** por
   temporada + `renewContract` (el empleo sube o baja **un escalón por vez**).
8. Avanza el reloj, congela la entrada de `history` y detecta hitos.

**Retiro** (`shouldRetire`): edad `hard` de la posición → seguro; por debajo de
`soft` → nunca; en el medio, presión creciente por edad, OVR bajo, moral baja y
lesiones graves acumuladas. La causa se redacta en `career-reducer.ts`.

---

## 4. Cómo se elige el evento

`selectEvent(state, rng, options?)` (`engine/event-selector.ts`):

1. **El mercado es una fase, no un evento raro.** Se evalúa **todas** las
   temporadas (`marketEvaluatedSeason`). El cooldown está anclado en un **pase
   real** (`lastMoveSeason`), no en "vi una oferta": rechazar no silencia el
   mercado, solo mudarse lo frena (`MARKET_COOLDOWN_SEASONS = 1`).
   Si hay ofertas, `surfaceMarketProbability` decide si aparece la decisión: sube
   con la chance de subir de banda, profesionalizarse o entrar a una academia
   joven, y con la incomodidad (suplente, moral baja); baja para el titular feliz.
2. Si no hubo mercado, con probabilidad `SEASON_EVENT_PROB = 0.82` se elige un
   **evento estático** del pool elegible, ponderado por `weight`, con penalización
   ×0.35 si se vio recientemente. Puede no haber evento: temporada sin decisión.

`options.marketOnly` corta después del paso 1. Lo usan las temporadas silenciosas
de un tramo (§13): el mercado se sigue mirando **todas** las temporadas, los
eventos estáticos no interrumpen.

**Elegibilidad de un evento** (`eligible` + `meetsRequirements`): posición,
origen, edad, OVR, flags requeridas/prohibidas, `repeatable`, `cooldown` contra
`recentEventIds`, y `requires: { employment, squadTrack, economicModels,
min/maxSportingBand, min/maxAge, requiresRecentPromotion, requiresRecentInjury,
requiresInternationalLoad, requiresEligibleUnion }`.

> Ese `requires` es el punto de extensión: contenido nuevo se agrega como **dato**
> en `data/events/*.ts`. Si hace falta una precondición nueva, se extiende
> `EventRequirements` y su evaluador — nunca un `if` por evento en el selector.

---

## 4b. La elección inicial: amateur, desarrollo o profesional

`CareerState.startRoute` (1.6.0) es la **primera decisión del juego**, antes de
que la carrera empiece. Fija los dos ejes independientes de `contracts.ts`:

| Ruta | `employment` | `squadTrack` | Modelo del club | Debut | OVR inicial (mediana) |
|---|---|---|---|---|---|
| `amateur` | `amateur` | `senior` | `amateur` | +1 año | 37 |
| `development` | `amateur-compensated` | `development` | `mixed`/`professional` | — | 40 |
| `professional` | `semi-professional` | `senior` | `professional` | — | 43 |

La ruta **acota el universo** de clubes por `economicModelOf`; el `rng` sigue
eligiendo el club concreto dentro de ese universo, ponderado a la inversa del
rating. Si la ruta pide un modelo que el país no tiene, se **degrada** al modelo
disponible más cercano y queda registrado en `player.startRouteModel` +
`player.routeDowngraded` — nunca falla.

> **Las rutas pro miran el país entero, no solo la escalera doméstica.** El
> rugby de clubes argentino es íntegramente amateur —del Top 14 de la URBA al
> último torneo local— porque lo es por regulación de la UAR: el profesionalismo
> argentino vive en Super Rugby Americas, que el catálogo marca como
> `countryCode: 'multi'`. El pool se arma con los clubes del país **más** los
> destinos de las vías que salen de su escalera (`pathwaysFrom`), que es
> exactamente el dato que dice por dónde se profesionaliza un sudamericano. Sin
> eso, un "profesional argentino" degradaba a amateur.

Los eventos `env-semi-pro-offer` y `env-compensated-semi-offer` llevan
`requires.startRoutes: ['amateur', 'development']`: son el ascenso **dentro** de
la ruta amateur, no el origen del profesionalismo. Al que arrancó con contrato no
le aparecen nunca (verificado sobre 200 carreras completas).

---

## 5. Cómo se asigna el club inicial

`createPlayer` → `pickInitialClub(nacionalidad, origen, startTier, rng)`
(`engine/market-routes.ts`):

1. **`resolveStartRoute`** — si el país de la nacionalidad tiene escalera
   doméstica modelada, se arranca ahí (`kind: 'domestic'`). Si no (o si el origen
   es `exterior-academia`), se sortea destino por **ruta migratoria** ponderada
   por afinidad real, corrigiendo a favor de las ligas con escalón de entrada más
   bajo. Un sudamericano sin liga propia cae al circuito rioplatense con pesos
   `ar 6 / uy 2 / cl 2`.
2. **`entryMode`** — si el piso de la liga destino ya es profesional
   (banda > `FOREIGN_SENIOR_MAX_BAND = 4`), el migrante entra por
   `external-development` (academia), no como senior.
3. **Escalón** — el más bajo de la escalera, +1 si el origen lo justifica
   (`startTier ≤ 2`), sin pasar nunca de `MAX_ENTRY_RUNG = 4`.
4. **Club dentro del escalón** — orden estable por `id` y `rng.weighted` a la
   **inversa del rating**: un prospecto cae más seguido en un club modesto.

Escaleras domésticas modeladas: `fr`, `gb-eng`, `es`, `jp`, `nz`, `za` (estáticas)
y `ar`/`uy`/`cl` (derivadas del snapshot de Supabase, por `divisionTier`).

> **Esa limitación está RESUELTA (catálogo 2026-27.7).** La pirámide se cortaba
> en Nationale, Championship, NPC, Currie Cup First y League One D3, que ya son
> competiciones profesionales o mixtas: elegir la ruta amateur en esos países
> degradaba en silencio a un club profesional. Se agregó el **piso amateur** de
> cada una — Fédérale 1 y 2, National League 1 y 2, Heartland Championship,
> Community Cup y las ligas regionales japonesas: **74 clubes**. Son
> competiciones reales; los rosters cargados son representativos y no la lista
> oficial de la temporada, y por eso llevan `evidence: 'game-calibration'`.
>
> Efecto medido: la tabla de degradaciones nacionalidad × ruta pasó de **6 casos
> a 1** — España + profesional, que no es un hueco del catálogo sino un hecho
> del rugby español (no tiene liga profesional).

El **escalafón de mercado** (`marketRung`) es exactamente la `sportingBand` de
`competition-levels2026.ts`: una sola tabla, para que competiciones paralelas no
se lean como ascenso.

---

## 6. Cómo se calcula el entorno

`deriveEnvironment` (`engine/environment.ts`) es **puro, sin RNG**. No existe un
multiplicador único: cada dimensión se calcula por separado porque los ejes tiran
en direcciones opuestas (el profesional entrena más fuerte *pero* tiene mejor
medicina; el amateur juega menos *pero* suma trabajo y viajes de su bolsillo).

Punto de partida por empleo — **esto es lo que la Fase 1 tiene que hacer
visible**:

| Empleo | trainingQuality | trainingLoad | recoverySupport | medicalSupport | lifeLoad |
|---|---|---|---|---|---|
| `amateur` | 0.32 | 0.34 | 0.22 | 0.20 | 0.82 |
| `amateur-compensated` | 0.46 | 0.48 | 0.38 | 0.36 | 0.62 |
| `semi-professional` | 0.66 | 0.68 | 0.58 | 0.56 | 0.44 |
| `full-time-professional` | 0.90 | 0.82 | 0.86 | 0.88 | 0.10 |

Modificadores: `DEVELOPMENT_TRACK` (quality 0.84 / load 0.90 — la academia
entrena como profesional sin serlo), `STRUCTURE_BONUS` por modelo económico
(`amateur -0.06`, `mixed +0.03`, `professional +0.10`), riqueza del club
(`marketBand`), banda deportiva, rol y copas.

Salidas derivadas: `matchIntensity`, `travelLoad`, `selectionPressure`,
`exposure`, `teamMatchesAvailable`.

**Carga y riesgo**: `computeSeasonLoad` normaliza cada componente a [0,1] y los
combina con pesos que suman 1 — `training 0.42 · matches 0.30 · life 0.16 ·
travel 0.12`. `seasonInjuryRisk` se arma por partes y se acota a [0.03, 0.68]: el
**salto relativo** de carga pesa más que el nivel absoluto.

---

## 7. Mercado de pases

`generateOffers` (`engine/club-offers.ts`) devuelve **hasta dos** ofertas, por
tres puertas declaradas en la propia oferta (`via`):

- **`window`** — ventana habitual de ±1 escalón (±2 solo con
  `qualifiesForExceptionalJump`: forma ≥78, titular, ≤27 años, con techo).
- **`pathway`** — vía profesional normal entre sistemas (NPC → Super Rugby,
  Currie Cup → URC, clubes AR/UY/CL → Super Rugby Americas). Es un grafo de
  **circulación de jugadores**, distinto del grafo institucional de ascensos.
  `minSourceBand` impide el salto "4ª división amateur → franquicia".
- **`homecoming`** — desde los 33, el regreso al país sin límite de escalones
  hacia abajo.

El pool se ordena por `id` antes de sortear (determinismo). `classifyMovement`
decide el **texto**: un club amateur nunca "firma contrato", hace un **pase**.

---

## 8. Persistencia

`careerStorage.ts`, clave `g22-carrera-rugby`. El payload lleva **seis campos de
versión** (schema, engine, catálogo de clubes, países, niveles, entorno). Si
cualquiera no coincide, el guardado se descarta entero y `loadCareer()` devuelve
`{ kind: 'outdated' }` — nunca se intenta migrar parcialmente un estado que el
motor ya no sabe interpretar. Todo va envuelto en `try/catch`: sin acceso a
`localStorage` la partida sigue en memoria.

---

## 9. Red de seguridad (Fase 0)

`src/features/career/engine/__tests__/`:

- **`determinism.test.ts`** — misma semilla + mismas decisiones ⇒ mismo estado
  final (comparación profunda); round-trip por JSON a mitad de carrera ⇒ el
  resultado no cambia; y un **digest congelado** por caso que detecta cualquier
  cambio de comportamiento no intencional.
- **`storage.test.ts`** — `save → load` devuelve `ok` con el estado idéntico; un
  schema/versión viejos devuelven `outdated` sin tirar; un JSON corrupto también;
  y sin `localStorage` no explota.
- **`no-entropy.test.ts`** — recorre `engine/` y falla si aparece `Math.random`,
  `Date.now(`, `new Date(`, `performance.now(`, `localStorage`, `window.` o
  `navigator`, o si el motor importa React o algo de `app/`.

Correr con `npm test` (runner nativo `node --test`, **no** Vitest).

### Digest congelado — línea de base 1.29.0

| Caso | Rama | Semilla | Temporadas | Retiro | OVR pico | Caps | Títulos | Clubes | Empleo final |
|---|---|---|---|---|---|---|---|---|---|
| Apertura argentino | desarrollo | 20260726 | 16 | 34 | **81** | 39 | 3 | 7 | profesional |
| Pilar neozelandés | profesional | 424242 | 17 | 35 | **85** | 34 | 3 | 6 | profesional |
| Wing francés | desarrollo | 7919 | 17 | 35 | **65** | 0 | 1 | 3 | compensado |

> De 1.28.0 a 1.29.0 se movió todo en los tres casos, por dos cambios que se
> suman: **quince decisiones nuevas** en el pool (el sorteo ponderado elige
> distinto desde la primera temporada) y **los clubes ascienden y descienden**
> (§22), así que la banda y el campo de la liga pueden cambiar sin que el jugador
> se mueva de club.
>
> Lo que se midió aparte, y es la parte que había que probar: con la mecánica de
> los ejes aplicada y **antes** de agregar contenido, los tres casos movían sólo
> `engineVersion` y `stateHash`. Los modificadores nuevos no cambian una carrera
> mientras nadie los use.
>
> Para leer: el apertura cierra a los 34 por retiro **elegido**, el wing baja de 5
> clubes a 3 (quedarse en un club que sube puede ganarle a una oferta lateral) y
> nadie se retira por edad antes de los 39.
>
> **Catálogo `2026-27.8` (sistema argentino de dos ramas, §23):** los valores de
> esta tabla NO se movieron. De los once campos del digest cambió uno solo,
> `stateHash`, en los tres casos. Es lo esperado: ninguna de las tres carreras
> congeladas pasa por un club argentino (arrancan en Tarucas, Kamaishi y
> Richmond), y lo que cambió es el **pool de destinos** del mercado —224 clubes
> argentinos con divisiones y ratings nuevos—, así que las ofertas que reciben y
> rechazan son otras y las ofertas viven en el estado. El camino es el mismo; la
> foto del estado, no.

### Línea de base anterior — 1.28.0

| Caso | Rama | Semilla | Temporadas | Retiro | OVR pico | Caps | Títulos | Clubes | Empleo final |
|---|---|---|---|---|---|---|---|---|---|
| Apertura argentino | desarrollo | 20260726 | 17 | 35 | **82** | 39 | 3 | 8 | profesional |
| Pilar neozelandés | profesional | 424242 | 17 | 35 | **84** | 22 | 1 | 8 | compensado |
| Wing francés | desarrollo | 7919 | 17 | 35 | **65** | 0 | 0 | 4 | semipro |

> De 1.27.0 a 1.28.0 se movió todo, y era inevitable: el club inicial se elige
> ahora **antes** que los atributos, porque el nivel a los 18 sale del club. Eso
> corre el stream del rng desde la primera tirada.
>
> Lo que hay que mirar no es el hash sino tres cosas: los `firstClub` dejaron de
> colapsar en el pool argentino (Tarucas, Kamaishi, Richmond), aparecieron los
> caps en dos de los tres, y **el wing se quedó en 65 con 4 clubes** — la carrera
> que se queda abajo, que antes prácticamente no existía.

### Línea de base anterior — 1.27.0

> La versión de referencia **la declara cada entrada de `EXPECTED`** en su campo
> `engineVersion`, que el digest produce desde `ENGINE_VERSION`. Esta tabla es una
> copia para leer; la fuente es el test.

Con el `rotatingChooser` del test (opción elegida por
`hashSeed(eventId:temporada) % nOpciones`), una rama declarada en cada caso:

| Caso | Rama | Semilla | Temporadas | Retiro | OVR pico | Caps | Títulos | Clubes | Empleo final |
|---|---|---|---|---|---|---|---|---|---|
| Apertura argentino | desarrollo | 20260726 | 17 | 35 | **78** | 20 | 0 | 8 | profesional |
| Pilar neozelandés | profesional | 424242 | 17 | 35 | **81** | 0 | 3 | 8 | profesional |
| Wing francés | desarrollo | 7919 | 17 | 35 | **68** | 0 | 2 | 5 | compensado |

> De 1.26.0 a 1.27.0 el único caso que se movió es el **apertura argentino**, y se
> movió por el motivo correcto: Argentina bajó de 84 a 78 y el jugador —que picaba
> en 78— pasó de 0 a 20 caps. Con la convocatoria cambia el stream del RNG y con él
> el resto de la carrera: termina profesional en los Sharks en vez de semipro en
> Japón. Los otros dos son el control y no se movieron ni un campo.

> Sirve además como **calibración real del techo de OVR**: una carrera amateur
> pica cerca de 55-60 y una profesional puede llegar a los 90. Las bandas de
> color se calibran contra estos números, no contra los de Copero.

> De 1.21.0 a 1.22.0 se movió **sólo el `stateHash`** de los tres, porque el
> estado guarda `version`: 1.22.0 absorbe parches que ya estaban aplicados y
> medidos en la línea de base anterior, así que no podía mover comportamiento.
> El pilar bajó de 65 a 29 caps en **1.21.0**, con el estado `trial`.

> **El número del encabezado es parte del dato.** Dos veces seguidas se
> refrescaron los valores de esta tabla sin tocarlo, y quedó diciendo 1.14.0 con
> valores de 1.17.0 y después 1.20.0 con valores de 1.21.0. Si no coincide con
> `ENGINE_VERSION`, no se sabe contra qué se está comparando.

### La técnica que protege el stream del RNG

Cuando un cambio necesita tiradas nuevas pero **no** debe alterar el resto de la
carrera, se re-siembra un RNG local con una clave descriptiva en vez de tocar el
principal:

```ts
const detailRng = rngFromState(hashSeed(`${careerSeed}:stats-detail:${seasonIndex}`));
```

Así se hizo el desglose del pie y los scrums (1.6.0): las tres carreras de la
línea de base quedaron **byte-idénticas** ignorando solo las claves nuevas, con
el mismo `rngState` final. Si hubieran salido del stream principal, habrían
corrido clubes, lesiones y convocatorias, y no habría forma de distinguir el
cambio buscado del daño colateral.

**Si un cambio de motor rompe el digest**: es esperado cuando el cambio es
intencional. Verificá que el resto de los tests pase, actualizá la tabla de
`EXPECTED` en `determinism.test.ts` y subí `ENGINE_VERSION`.

---

## 10. Rutas diferenciadas y arquetipos (Fase 4)

### El problema que resuelve

De los 61 eventos del catálogo, **solo los 10 de `environment-events.ts`
declaraban `requires`**. Los otros 51 no tenían ningún filtro de entorno, así que
un amateur de Federale 2 era elegible para casi el mismo pool que un profesional
del Top 14: elegir la ruta cambiaba los números de arranque y nada más.

### `familyBoost` — mover la frecuencia, no filtrar

`engine/event-selector.ts` multiplica el peso de cada evento por un factor que
sale del entorno del jugador. La familia se deduce del prefijo del id
(`env-amateur-derby` → `env`).

```
peso efectivo = weight × penalizaciónPorRepetición × familyBoost(id, state)

familyBoost = BOOST_BY_EMPLOYMENT[employment][familia]
            × BOOST_BY_SQUAD_TRACK[squadTrack][familia]
            × lerp(BOOST_BY_ROUTE[startRoute][familia] → 1, seasonsPlayed / 5)
```

El eje principal es el **entorno vivo** (`employment` + `squadTrack`), no la ruta
sellada: el que arrancó amateur y llegó a profesional a los 26 tiene que empezar
a ver el mundo profesional. La ruta inicial aporta un empujón extra que **se
diluye hacia la temporada 5**, que es cuando de verdad define cómo se siente la
carrera.

**Ningún multiplicador puede ser 0.** Es una regla, no una casualidad: hay un
test (`route-weighting.test.ts`) que recorre todas las combinaciones de empleo ×
ruta × track × antigüedad y falla si alguna familia queda anulada. Un amateur
tiene que poder recibir un evento de club — solo que mucho menos seguido.

Reparto medido sobre 300 carreras por ruta:

| Familia | Amateur | Desarrollo | Profesional |
|---|---|---|---|
| `env` | **25,6 %** | 5,3 % | 4,7 % |
| `per` | **16,7 %** | 10,9 % | 10,5 % |
| `med` | 1,8 % | 12,0 % | **14,0 %** |
| `nt` | 0,6 % | 5,1 % | **6,9 %** |

### `requires` en eventos que daban por sentado un contrato

Cuatro eventos hablaban de sueldo o de prensa en contextos donde no existen:

| Evento | Gate | Por qué |
|---|---|---|
| `club-contract-renewal` | `employment` semipro+ | Habla de sueldo y de cláusula |
| `club-salary-cap` | `employment` semipro+ | No se le pide un recorte a quien no cobra |
| `med-sponsor`, `med-punditry`, `med-charity`, `med-transfer-rumor` | `minSportingBand: 3` | Abajo de la banda 3 no hay prensa cubriendo la liga |

### Seis eventos de vida amateur

`env-amateur-commute` (dos horas de viaje), `env-amateur-no-physio` (el club sin
kinesiólogo), `env-amateur-tour-leave` (el laburo que no da franco para la gira),
`env-amateur-no-cover` (jugar lastimado porque no hay recambio),
`env-amateur-club-dues` (la cuota social), `env-amateur-teammate-quits` (el
compañero que deja por el trabajo).

Dos de ellos otorgan la flag `leal`, que es la base del arquetipo "Un club, toda
la vida".

### `engine/archetypes.ts` — el titular del retiro

Antes era una función de nueve líneas dentro de `RetirementSummary.tsx`. Ahora
vive en el motor: es testeable, determinística y la va a reusar el resumen
compartible. `CareerSummary.archetype` es **derivado** (no se guarda en
`CareerState`), así que agregarlo **no invalida ninguna partida guardada**.

**El orden de la tabla ES la regla: gana el primero que se cumple.** Los
arquetipos de la ruta amateur se ubican alto a propósito — debajo de
"Multicampeón" no se verían nunca.

| # | Arquetipo | Condición |
|---|---|---|
| 1 | Campeón del Mundo | flag `campeon_mundo` |
| 2 | Miembro del Salón de la Fama | honor `Salón de la Fama` |
| 3 | **De la quinta al seleccionado** | ruta amateur + ≥ 8 caps |
| 4 | Un club, toda la vida | 1 club + ≥ 12 temporadas |
| 5 | Multicampeón | ≥ 4 títulos |
| 6 | Emblema de la selección | ≥ 30 caps |
| 7 | **El que llegó tarde** | ruta ≠ profesional + primer contrato a los 27+ |
| 8 | **Se hizo solo** | ruta amateur + llegó a profesional |
| 9 | Crack de su generación | OVR pico ≥ 80 |
| 10 | Un jugador de jerarquía | OVR pico ≥ 72 |
| 11 | **El que estuvo cerca** | ruta amateur + techo semipro |
| 12 | **Amateur de ley** | ruta amateur + nunca profesional + ≥ 8 temporadas |
| 13 | Un guerrero de mil batallas | ≥ 12 temporadas |
| 14 | Una carrera de pura entrega | fallback |

Los cinco en negrita **solo se desbloquean desde la ruta amateur** (salvo "El que
llegó tarde", que también admite desarrollo). Hay un test que verifica que las
rutas de desarrollo y profesional nunca los saquen.

`peakEmployment` mira **toda la trayectoria**, no el empleo final: el escalafón
puede bajar al retirarse, así que el último valor no dice hasta dónde llegó.

Distribución medida sobre 300 carreras por ruta con el `rotatingChooser`:

| Ruta | Reparto |
|---|---|
| Amateur | Amateur de ley 67 % · De la quinta 13,3 % · Estuvo cerca 9 % · Llegó tarde 4,3 % · Un club 3,7 % · Multicampeón 1,7 % · Se hizo solo 1 % |
| Desarrollo | Guerrero 41,7 % · Emblema 30,3 % · Llegó tarde 11 % · Un club 9,3 % · resto 7,6 % |
| Profesional | Emblema 35,3 % · Guerrero 35 % · Un club 15 % · Multicampeón 6 % · resto 8,6 % |

> El `rotatingChooser` es una estrategia mecánica, no un jugador. Un jugador
> ambicioso asciende bastante más (ver la tabla de balance), así que en juego
> real la ruta amateur reparte más hacia los arquetipos de ascenso.

---

## 11. Progresión: el techo alcanzable (1.9.0)

### El bug

Jugando una carrera completa aparecieron dos síntomas que resultaron ser el
mismo problema:

- el OVR se congelaba a mitad de carrera, hasta **ocho temporadas** seguidas con
  el mismo número;
- el `potential` **nunca se alcanzaba**. Medido sobre 1080 carreras de los nueve
  puestos y las tres rutas: brecha mediana **12**, media 13,7, máxima 35, y solo
  **9 de 1080** llegaban a 3 puntos o menos de su techo.

### La causa

No era redondeo. Los atributos son `number` y `clampAttr` solo recorta a [1,99],
así que los incrementos fraccionarios **sí** se acumulan — durante una meseta el
OVR interno se movía de 63,0 a 63,8, y el redondeo lo volvía invisible.

La causa es la **forma** de la curva. El crecimiento era `(potential − ovr)/12`:
una asíntota. El pico se asienta donde el crecimiento iguala al declive y, con
esa forma, eso ocurre a una distancia **constante** por debajo del objetivo,
*independiente de cuánto valga el objetivo*. Con `GROWTH_ROOM` de 37-44 puntos y
una ventana de edad que entrega 15-25, el potencial era inalcanzable por
construcción.

### Lo que no funcionó

Vale dejarlo escrito para no volver a intentarlo:

| Intento | Resultado medido |
|---|---|
| Brecha con `sqrt` (menos asintótica) | No mueve el pico y **alarga** la meseta en un caso |
| Bajar `GROWTH_ROOM` a secas | El pico baja lo mismo que el techo: desinfla la escala, no cierra la brecha |
| Correr el objetivo interno una distancia fija por puesto | `environmentSupport` multiplica la escala ⇒ la distancia de equilibrio **no** es constante, y un tercio de las carreras terminaba **pasándose** del techo |

### La solución

Cambiar la forma: **empuje sostenido mientras falte recorrido, cero al llegar.**

```ts
export function growthScaleFor(ovr, potential, position?) {
    const gap = potential - ovr;
    if (gap <= 0) return 0;              // el techo es un techo
    const push = position === undefined ? 0 : CEILING_PUSH; // 0.85
    return clamp(gap / 12 + push, 0, 2.8);
}
```

Así el techo **se alcanza** (el empuje le gana al declive incipiente) y además
**se respeta** (no hay crecimiento por encima). `GROWTH_ROOM` bajó en paralelo
para que el pico logrado no se moviera: lo que cambia es que el número declarado
es ahora el que se toca.

Acompañan dos cambios más:

- **`meritDrive`** — el rendimiento de la temporada ANTERIOR (rating + rol)
  empuja o frena el desarrollo, entre 0,80 y 1,26. Hasta 1.8.0 la progresión no
  miraba nada de lo que el jugador hacía en la cancha: un titular con gran rating
  crecía exactamente igual que un suplente del mismo OVR, edad y techo.
- **Pisos de `attributeDelta`** — taper 0,25 → **0,45** y rampa de declive 6 →
  **4,5**, para que la curva *atraviese* el pico en vez de sentarse encima.

### Resultado medido (1080 carreras)

| Métrica | 1.8.0 | 1.9.0 |
|---|---|---|
| Brecha mediana techo − pico | 12 | **1** |
| Carreras a ≤3 del techo | <1 % | **64 %** |
| Carreras que se pasan del techo | — | 1 % |
| Racha plana mediana | 4 | **3** |
| Carreras con 5+ temporadas planas | 28 % | **20 %** |

Los picos por ruta y la duración de las carreras no se movieron.

### La meseta que queda es correcta

**El 82 % de las mesetas largas que sobreviven ocurre EN el techo**: son los años
de plenitud, no un desarrollo trabado. Un pilar sostiene su pico una temporada
más que un wing porque sus atributos pican más tarde (potencia 30, tackle 30,
resistencia 31 contra la velocidad 25 de un back), y eso es biología del modelo.

Para que esos años no se lean como tiempo muerto, la UI dejó de decir
"sin cambios": ahora dice **"en tu techo"** y agrega el récord personal de la
temporada ("Tu mejor temporada con el seleccionado", "Tu mejor cosecha de
puntos"). El OVR no se mueve, la carrera sí.

`progression-ceiling.test.ts` congela todo esto como propiedades estadísticas,
incluida la que de verdad importa: que una meseta larga sea un pico y no un
estancamiento.

---

## 12. Perfiles de desarrollo e identidad (1.10.0)

### Por qué todas las carreras se parecían

Los `PEAKS` de `aging.ts` son fijos por grupo: todos los wings picaban en
velocidad a los 25 exactamente. Con el techo ya alcanzable (§11), lo único que
distinguía dos partidas era el número sorteado — no la **forma** de la carrera.

### `engine/development-profile.ts`

Cada jugador saca un perfil al crearse, oculto como el techo:

| | `early` | `normal` | `late` |
|---|---|---|---|
| Crecimiento ≤23 | **1,30** | 1,0 | 0,72 (≤22) |
| Crecimiento 24-26 | 0,92 | 1,0 | 1,05 |
| Crecimiento 27+ | 0,70 | 1,0 | **1,45** |
| Desplazamiento del pico | 0 | 0 | **+2** |

**Al `early` no se le adelanta el pico.** Se probó con −1 y quedaba a 3 puntos de
su techo mientras el `late` llegaba a 1: con la ventana recortada no le alcanzaba
para cerrar la brecha — el bug de §11 reapareciendo por perfil. `early` significa
llegar antes, no romperse antes. Y el `late` suma 2 y no 3 porque con 3 llegaba
más arriba que los otros dos y dejaba de ser una forma distinta de carrera para
ser sencillamente la mejor.

### El reparto NO es plano

| Grupo | early | normal | late |
|---|---|---|---|
| Backs | **35** | 50 | 15 |
| Forwards | 15 | 50 | **35** |

Los backs viven de la velocidad, que pica joven; los forwards de la fuerza y la
técnica de scrum, que maduran cerca de los 30. Elegir pilar o wing cambia la
forma esperable de la carrera, no solo la edad del pico.

### Resultado medido (1080 carreras, controlado por grupo)

| Grupo · perfil | Pico | Edad del pico | OVR a los 22 | OVR a los 30 |
|---|---|---|---|---|
| Back · early | 63 | 25 | **60** | 62 |
| Back · normal | 63 | 26 | 59 | 62 |
| Back · late | 66 | **29** | 55 | **66** |
| Forward · early | 67 | 27 | **63** | 67 |
| Forward · normal | 67 | 29 | 56 | 67 |
| Forward · late | 68 | **30** | 53 | 67 |

Los picos quedan dentro de 1-3 puntos entre perfiles: cambia el **cuándo**, no el
**cuánto**. Hay que comparar SIEMPRE dentro del grupo — los forwards tienen más
recorrido de OVR y además tiran a `late`, así que mezclarlos hace parecer que el
`late` es mejor cuando lo que pasa es que hay más pilares entre los `late`.

> Un residuo honesto: en los backs, `early` y `normal` terminan pareciéndose (a
> los 22 los separa un punto). No es falta de calibración sino del deporte — un
> back ya pica joven por su puesto, así que "madurar temprano" le agrega poco. El
> perfil se nota en los forwards y en el contraste contra `late` en todos lados.

### Revelado al retiro

El perfil está oculto toda la partida y se nombra recién en el resumen final
("Maduró tarde: siguió creciendo pasados los 30"). Convierte un número escondido
en un descubrimiento y le da respaldo al arquetipo *El que llegó tarde*, que
hasta ahora se sostenía solo en la edad del primer contrato.

### Identidad del jugador

- **`surname`** — texto libre, saneado en `sanitizeSurname` y acotado a 15. Se
  sanea al CREAR y no al mostrar: React escapa al renderizar, pero el valor
  también va a `localStorage` y —cuando exista la tarjeta compartible— a un
  canvas, donde no hay escapado. Se quitan controles, marcas de ancho cero y
  overrides bidi (que pueden dar vuelta el texto que los rodean). Si no queda
  nada usable, cae al apodo que el motor ya generaba.
- **`number`** — deja de sortearse: el default es el canónico del puesto
  (`numbers[0]`, o sea 10 el apertura, 2 el hooker, 15 el fullback). Los puestos
  que comparten varios (pilar 1/3, segunda 4/5, tercera 6/7/8, centro 12/13,
  wing 11/14) dejan elegir; un número que no es del puesto se ignora.

### Una lección sobre los tests de balance

El guard de apariciones de academia bajó de 60% a 48% y parecía una regresión.
No lo era: la muestra eran **46 temporadas**, y la tirada del perfil corre el
stream del rng, así que las mismas semillas producen otras carreras. Con la
muestra ampliada a n≈250 el valor real es 60-64%.

**Un test de balance con muestra chica no mide balance: mide el stream del rng.**
Antes de aflojar un umbral, agrandá la muestra — el umbral que se había relajado
a 0,55 volvió a 0,60 al medirlo bien.

---

## 13. Modos de duración (1.11.0)

### El problema

Una decisión por temporada y veinte temporadas por carrera dan veinte decisiones.
Es el ritmo correcto para quien ya se enganchó, y demasiado para quien está
probando el juego por primera vez.

### `paceMode` en `CareerState`

```ts
export type PaceModeId = 'intense' | 'normal' | 'express';

export const SEASONS_PER_DECISION = { intense: 1, normal: 2, express: 3 };
```

Se elige al crear el jugador y **se sella**, igual que `startRoute`. No se puede
cambiar a mitad de carrera: si se pudiera, `(semilla + decisiones)` dejaría de
reproducir la carrera —haría falta registrar además *cuándo* se cambió el
ritmo— y esa reproducibilidad es la garantía sobre la que se apoya todo.

### El tramo, y las dos únicas cosas que lo cortan

`resolveAndPlay` (en `state/career-reducer.ts`) juega un **tramo**: la decisión
del jugador, la temporada, y después las que falten para completar el modo.

Un tramo se corta antes de tiempo **solo** por retiro o por **mercado**. Los
eventos estáticos sí se saltean — son exactamente el ruido que los modos largos
vienen a bajar. Para eso `selectEvent` acepta `{ marketOnly: true }`.

Esa distinción no es un detalle de implementación: es la diferencia entre un modo
de duración y un rebalanceo encubierto. El ascenso de amateur a profesional pasa
por el mercado, así que un modo que lo mirara un año de cada tres ascendería a la
tercera parte de la gente. Por eso el número del modo es un **máximo** de
temporadas por decisión, no un paso fijo, y la UI lo dice así
(*"El mercado te frena igual"*).

### Resultado medido (200 carreras por celda, 5 puestos, ruta amateur)

| Estilo | Modo | → compensado | → semipro | → profesional | Decisiones | Temporadas |
|---|---|---|---|---|---|---|
| Ambicioso | intensa | 100 % | 52 % | 30 % | 15,4 | 15,4 |
| Ambicioso | normal | 100 % | 52 % | 31 % | 8,6 | 15,2 |
| Ambicioso | exprés | 100 % | 53 % | 27 % | 6,6 | 15,3 |
| Conservador | intensa | 21 % | 0 % | 0 % | 15,3 | 15,3 |
| Conservador | normal | 21 % | 0 % | 0 % | 9,3 | 15,2 |
| Conservador | exprés | 21 % | 0 % | 0 % | 7,5 | 15,2 |

El ascenso y el largo de la carrera no se mueven; lo que cae a la mitad o menos
es la cantidad de veces que se le pregunta algo al jugador. Exprés no llega a un
tercio de las decisiones (6,6 y no 5,1) justamente porque el mercado corta
tramos, que es lo que se buscaba.

### Por qué el digest congelado se movió sin que cambiara el comportamiento

En `intense` el bucle del tramo **no se ejecuta ni una vez** y no consume RNG. De
los once campos del digest se movió uno solo, `stateHash`, y solo porque el
estado creció dos campos (`paceMode` y el bump de `version`), que el hash cubre a
propósito. Verificado, no supuesto: al estado de 1.11.0 se le puso
`version: '1.10.0'` y se le sacó `paceMode`, y el hash dio **exactamente** el de
1.10.0 en los tres casos.

### La UI de un tramo

`SeasonResultInline` renderiza dos tarjetas distintas, no una con contador:

- **Una temporada** — el detalle de siempre, con la ranura de estadística del
  puesto (`secondaryStat`) y la nota de temporada quieta.
- **Un tramo** — el saldo del período arriba (partidos, puntos, tries, tackles,
  caps, OVR final y delta acumulado) y **una línea por temporada** abajo, para
  que ningún año quede sin figurar. La ranura del puesto no se suma: la del
  apertura es un porcentaje de palos y promediar tres temporadas con distinta
  cantidad de intentos daría un número que no es el de nadie. En el tramo van los
  tackles, que sí se suman.

---

## 14. Carrera compartible (token + og:image)

El link de una carrera **no lleva el resultado: lleva la receta**. Semilla,
jugador y decisiones en orden; el servidor vuelve a correr el motor y obtiene la
misma carrera. Es el determinismo de la Fase 0 cobrándose de golpe: no hace falta
tabla, ni id, ni moderar nada que no haya escrito el propio jugador.

`engine/share-token.ts` codifica el payload con dos decisiones que valen la pena:

- **Diccionario de ids.** En una carrera fiel `"stay"` aparece quince veces.
  Se guarda el diccionario de ids únicos y una lista de índices.
- **base64url y UTF-8 propios**, sin `btoa` ni `Buffer`: el códec corre igual en
  el navegador, en una route handler y en un test de Node sin DOM. Y el apellido
  lo escribe el jugador — *Ñandú* no puede volver roto de una URL.

Medido sobre 27 carreras reales (3 rutas × 3 ritmos × 3 estrategias): token de
194 a 552 caracteres, URL completa de 608 en el peor caso.

### El recibo: por qué el link no muere con el próximo `ENGINE_VERSION`

Un link compartido vive en un chat para siempre, y un bump de motor los mataría a
todos de una vez. Por eso el token embebe además un **recibo** — arquetipo, caps,
temporadas, mejor OVR — que cuesta **+73 caracteres promedio**:

| Motor del token | Qué se muestra |
|---|---|
| Coincide | La carrera entera, reconstruida. El recibo ni se mira. |
| No coincide | La tarjeta con el recibo, y el aviso de que está incompleta. |

No duplica la verdad viva: es lo que era cierto al compartir. Lo que **no** se
hace es reconstruir la carrera con el motor nuevo — daría una carrera distinta de
la que se jugó y la haría pasar por la del que compartió el link.

El recibo se agregó **sin subir `SHARE_TOKEN_VERSION`**: es aditivo, y un token
anterior sigue decodificando entero (sólo se queda sin respaldo). Subir la
versión habría roto todos los links para no ganar nada.

### Una sola tarjeta para los dos destinos

`CareerCard.tsx` la dibujan la página y la og:image. Por eso está escrita con
**estilos en línea y sólo flexbox**: es lo que entiende Satori, el renderer que
convierte JSX en la imagen. Nada de CSS modules, grid, `gap` ni pseudo-elementos
ahí adentro, aunque el resto del juego los use. La página la escala con container
queries; la imagen la toma tal cual.

Los escudos van **reales** siempre que el catálogo tenga `sourceId`. El monograma
queda sólo para los clubes internacionales estáticos, que no tienen ningún asset
que pedir: es la ausencia de un escudo, no una letra puesta en su lugar.

### Trampa: `navigator.share` en Chromium de escritorio

`navigator.share` **existe** en Chromium de escritorio y abre un diálogo nativo
del sistema. Al automatizar el botón de compartir con Playwright, eso **cuelga el
`page.evaluate()` hasta el timeout** — no falla, se queda esperando una hoja de
compartir que nadie va a cerrar. Lo mismo pasa con `navigator.clipboard.readText()`,
que espera un permiso que en automatización no se resuelve.

Para probarlo hay que neutralizar los dos antes de hacer clic:

```js
Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (t) => { window.__captured = t; return Promise.resolve(); } },
    configurable: true,
});
```

El código de producción no tiene el problema (si se cancela la hoja de compartir
cae al portapapeles, y si el portapapeles falla muestra el link para copiarlo a
mano). Es la PRUEBA la que se cuelga.

---

## 15. Convocatoria: reputación de la unión y recargo del amateur (1.12.0)

### Lo que se creía y lo que medía el motor

La sospecha era que la ruta amateur **nunca** llegaba a la selección: en tres
carreras de prueba había dado 0 caps. Con 240 carreras por país y 8 puestos, el
número real era el opuesto — el amateur llegaba **en todos lados y por igual**,
contando sólo los caps ganados *siendo* amateur o compensado:

| | NZ | AR | UY | CL | Samoa | Namibia |
|---|---|---|---|---|---|---|
| cap siendo amateur (umbral 63 global) | 15,0% | 13,3% | 16,3% | 17,5% | 13,3% | 15,0% |

El amateur neozelandés se ponía la camiseta de los All Blacks en 1 de cada 7
carreras. Los 0 caps de la prueba chica eran ruido: con 13% de base, sacar 0 de 3
tiene 65% de probabilidad.

El techo tampoco era el problema. El pico de OVR **efectivo** del percentil 90
del amateur es 65-68 y el umbral era 63: el decil superior lo pasaba siempre.

### Por qué una sola perilla no alcanzaba

`TEST_MATCH_LEVEL` contestaba dos preguntas distintas: *cuán bueno hay que ser*
y *el amateurismo descalifica*. Subirlo arreglaba una y rompía la otra:

| umbral global | amateur NZ | profesional NZ: convocado / caps |
|---|---|---|
| 63 | 15,0% | 86% / 33 |
| 70 | 1,7% | 59% / 21 |
| 75 | 0,4% | 44% / 12 |
| 80 | 0,0% | **33% / 5** |

Un All Black convocado 1 de cada 3 veces y con 5 caps no es una selección
difícil: es una selección rota.

### La solución: dos perillas

`data/nations.ts` guarda `UNION_REPUTATION` (0-5) y `engine/national-team.ts`
resuelve el umbral con dos tablas:

```ts
BASE_BY_REPUTATION = [63, 63, 64, 65, 66, 67]  // toca a TODOS, sube apenas
AMATEUR_SURCHARGE  = [ 3,  3,  8, 14, 20, 26]  // lo paga sólo el amateur
```

Un uruguayo amateur pelea contra 66; un neozelandés amateur, contra 93, que no
existe. El profesional neozelandés pelea contra 67 y no se entera del recargo.

El recargo se cobra **sólo para entrar**. Una vez capturado por la unión (Reg.
8.2), el jugador se sostiene con la regla de cualquiera: cobrárselo todas las
temporadas sería expulsarlo justo por lo que lo hace memorable. Los caps por
temporada se calculan también contra el nivel de sostenerse, no contra el de
entrar — si no, el que más caro la peleó sería además el que menos suma.

### Resultado medido (240 carreras por país, 8 puestos)

| país | rep | amateur en la selección | profesional: convocado / caps |
|---|---|---|---|
| Nueva Zelanda | 5 | **0,0%** | 71% / 25 |
| Francia | 5 | 1,3% | 65% / 23 |
| Argentina | 4 | **0,0%** | 72% / 26 |
| Italia | 4 | 1,3% | 70% / 26 |
| Japón · EEUU | 3 | 1,7% | 79-81% / 29 |
| Canadá · Rumanía | 2 | 1,3-1,7% | 84-85% / 30 |
| **Uruguay** | 1 | **7,9%** | 89% / 32 |
| **Chile** | 1 | **9,2%** | 85% / 30 |
| **Portugal** | 1 | **7,1%** | 85% / 32 |
| **Namibia** | 1 | **6,7%** | 88% / 30 |
| **Samoa** | 1 | **9,2%** | 86% / 31 |
| **Georgia** | 1 | **6,7%** | 84% / 31 |
| Paraguay | 0 | 10,8% | 90% / 32 |

Objetivo cumplido: 5-10% en las naciones donde el rugby real todavía alinea
gente que labura de otra cosa, 0-1,7% en las profesionalizadas. El profesional
de una potencia bajó de 86% a 71% de convocatoria — ser All Black es más difícil
que ser Teros, que es como debe ser.

### El arquetipo

`amateur-internacional` — *"El amateur que llegó a la selección"*. Condición
estricta: `capsAsAmateur > 0`, o sea caps ganados **mientras** el vínculo era
amateur o compensado. No alcanza con haber empezado amateur — para eso ya está
`de-la-quinta-al-seleccionado`, que se conforma con el punto de partida. Va antes
en la lista de reglas porque es el caso más específico.

`capsAsAmateur` es **derivado** (`buildCareerSummary` cruza `seasons[].capsGained`
con `history[].employment`), así que no toca `CareerState` ni invalida partidas.

### Qué se movió en el digest congelado

`ENGINE_VERSION` 1.11.0 → 1.12.0 y `NATIONS_VERSION` → `2026-07.3`. De los tres
casos de `determinism.test.ts`, el apertura argentino movió **sólo** `stateHash`
(no llegaba a la selección antes ni llega ahora: es el control). Los otros dos
cambiaron de verdad — el pilar neozelandés de 77 a 64 caps, y el wing francés de
18 a 0, porque se retiró como `amateur-compensated` y Francia es reputación 5.

---

## 16. Techos: cuánta gente puede llegar (1.13.0)

### El diagnóstico

Sobre 540 carreras por ruta: el **97-100% de las que no llegaban a OVR 80 se
quedaban POR TECHO**, no por no alcanzarlo. La curva estaba sana — brecha
mediana techo−pico de **0,4 puntos** y 87-90% terminando a 3 o menos de su
techo. La palanca nunca fue cuán rápido crece la gente sino **cuánta puede
llegar**: `potential ≥ 82` lo tenía el 3,5% de la ruta profesional, y `≥ 92` era
imposible por construcción con `POTENTIAL_MAX = 91`.

### Las tres palancas, y por qué las tres

| palanca | qué hace | por qué no alcanzaba sola |
|---|---|---|
| `POTENTIAL_MAX` 91 → **95** | permite que exista el techo de 92+ | sin ensanche, casi nadie lo saca |
| `ROOM_LIFT` (+0,38 al reparto, sólo en desarrollo y profesional) | mueve el grueso de la distribución | el techo alto no se alcanzaba |
| `GROWTH_SCALE_CAP` 2,8 → **3,4** | deja que el ritmo escale con el margen | — |

El recorte de la escala de crecimiento era el cuello escondido. La forma de la
curva ya era proporcional al margen (`gap/12 + 0.85`), pero **el recorte mordía
justo a quien más margen tenía**: un juvenil de OVR 40 con techo 90 pide 5,0 y
recibía 2,8, o sea el mismo ritmo que uno de techo 70. Resultado medido: sólo el
**61%** de las mesetas largas ocurría EN el techo, contra el 70% que exige el
invariante de 1.9.0 — el bug del "tiempo muerto", de vuelta. Con 3,4 se cumple.
No es que todos crezcan más rápido: el de techo 70 nunca tocó el recorte y su
carrera es idéntica.

### El ensanche NO es uniforme por ruta

`ceilingLift` vale 0 en amateur y 1 en desarrollo y profesional. Aplicárselo
también al amateur hacía saltar su brecha techo−pico de **6,6 a 14,0 puntos**:
su entorno lo frena mucho antes de los 80, así que un techo de 88 no le da una
carrera mejor, le da un número que no toca nunca. Es el techo decorativo que
arregló 1.9.0, reintroducido justo donde más molesta.

### Resultado medido (540 carreras por ruta, 9 puestos × 8 países)

| ruta | OVR pico ≥80 | ≥90 |
|---|---|---|
| amateur | 0,0% | 0,0% |
| desarrollo | 32% | ~3% |
| profesional | 51% | ~8% |
| **desarrollo + profesional** | **40,0%** | **5,6%** |

La ruta amateur conserva su identidad: topea por debajo de 80 y su techo
declarado vuelve a ser honesto.

### El mercado se arregló solo

El punto 2 —"es casi imposible que te fiche un gran club"— resultó estar aguas
abajo de éste. Sin tocar una línea del mercado:

| ruta profesional (jugador realista) | antes | después |
|---|---|---|
| vio una oferta de élite (rating ≥ 80) | 36,0% | **61,0%** |
| jugó en un club de élite | 19,5% | **36,0%** |

La oferta más alta que recibe un jugador persigue a su valor de mercado, y su
valor lo topea su OVR. Subido el techo, el pool se abre solo.

### Dos cosas que se descubrieron midiendo

**El desborde del techo es RUIDO, no crecimiento.** `growthScaleFor` da cero en
el techo, pero `attributeDelta` sigue sumando su ±0,4 por atributo, y el pico de
la carrera es un máximo sobre veinte temporadas: captura la mayor excursión
positiva. Medido sobre 29.411 temporadas: 3,44% queda por encima del techo, el
85% de esas por 1 punto, máximo observado 4.

**El arquetipo `amateur-internacional` exige DEBUTAR siendo amateur**, no sólo
sumar caps siéndolo. Sin esa condición entraba el veterano que llegó a la
selección como profesional y termina en un club amateur —sigue siendo
internacional porque la unión ya lo capturó—, que es la historia opuesta. Se
descubrió porque Argentina medía 2,5% y parecía un problema de umbral cuando era
de definición.

---

## 17. Convocatoria: dos umbrales, OVR crudo y pérdida de la camiseta (1.18.0)

### El diagnóstico

`BASE_BY_REPUTATION = [63,63,64,65,66,67]` daba un abanico de **cuatro puntos**
entre la unión más chica del mundo y Nueva Zelanda. Medido sobre 1.917 carreras,
el resultado era un abanico de 8 puntos porcentuales **y encima invertido en el
medio**:

| Tier | ≥1 cap (antes) | Objetivo |
|---|---|---|
| Tier 1 (rep 3-5) | 61,8 % | 20-25 % |
| Tier 2 (rep 2) | 66,7 % | 45-55 % |
| Tier 3 (rep 0-1) | 69,3 % | 70-80 % |

Por ruta, el que arrancaba profesional era internacional en **9 de cada 10**
carreras, jugara para quien jugara (94,4 % en NZ, 99,3 % en rep 0).

### Cuatro cambios, no uno

**1 · Reputaciones reasignadas** (`NATIONS_VERSION` → `2026-07.4`). EEUU bajó de
3 a 1, Georgia y Samoa subieron de 1 a 2, Kenia bajó de 2 a 0. NZ y Sudáfrica
quedan solas en 5 a propósito: jugar para los All Blacks es lo más difícil que
hay. Sólo dos consumidores — el umbral y el `winRate` de los tests.

**2 · Sobre OVR CRUDO, con seis modificadores nombrados.** `evaluateNationalTeam`
dejó de usar `computeEffectiveOvr`. Tres razones: `minOvr` de los eventos ya
comparaba contra crudo (dos escalas en la misma feature), la forma se contaba dos
veces, y con los modificadores nombrados se puede auditar cuál mueve el número.
Moral y fatiga quedan afuera de la decisión.

```
valor = ovr + forma(0..+3) + nivelDeClub(+2/−3) + escasez(0/+2) + edad(+2/−2/−5)
```

La escasez vive en `data/positions.ts`, no en el motor: hooker y segunda línea la
cobran siempre, el pilar sólo con la 3 (el escaso es el derecho).

**3 · Dos umbrales y descuento por titularidad.** El de titular decide si arranca
de titular o del banco, y con eso qué fracción de los tests juega. Estando en el
plantel el umbral baja 3 puntos; dos temporadas seguidas por debajo y sale
(`nationalStatus: 'dropped'`, que conserva los caps).

**4 · Tests por temporada según la unión.** Una tier 1 juega 11-13 por año y una
rep 0, cuatro o cinco. Sin esto los caps promedio estaban al revés: el
internacional de una unión rep 0 juntaba más caps que el irlandés.

### La puerta de atrás, cerrada de raíz

`nt-first-callup-nerves` otorgaba `capBoost` con `minOvr: 66` y sin pasar por la
convocatoria. Con umbrales de 63-67 era inofensivo (0,1 % de las carreras); con
los nuevos habría regalado caps de los All Blacks a un jugador de 66.

El arreglo no fue gatearlo: **`capBoost` se eliminó del motor**. Un evento ahora
sólo puede mover `testShare` —cuánto juega el que YA fue convocado— y hay un
invariante en la suite que falla si algún `effect` toca `caps`, `capBoost`,
`nationalTeam` o `nationalStatus`.

### Resultado medido (1.917 carreras, mismo protocolo que la medición previa)

Denominador desarrollo + profesional. Los objetivos de rep 0 y rep 1 se separaron
a mitad de camino: pedirle escasez a una unión sin profesionales era el objetivo
equivocado. Tailandia tiene tres profesionales y los tres juegan para Tailandia.

| Tier | Antes | Después | Objetivo |
|---|---|---|---|
| Tier 1 (rep 3-5) | ~87,8 % | **21,3 %** | 20-25 % |
| Tier 2 (rep 2) | ~93,0 % | **46,7 %** | 45-55 % |
| rep 1 | ~95,5 % | **95,1 %** | 85-95 % |
| rep 0 | ~95,9 % | **99,7 %** | 92-99 % |

Ruta amateur, contra su propio denominador: rep 0 **34,9 %** (obj 35-50), rep 1
**13,6 %** (obj 12-22), rep 2 **0 %** (obj 3-8), rep 3-5 **0 %** ✓.

Escalera de esta calibración: `DEBUT = [63, 67, 80, 84, 87, 90]`,
`STARTER = [67, 71, 84, 88, 90, 93]`. Saltos `4, 13, 4, 3, 3`: monótona y ninguno
por debajo de 3.

> **La de debut ya no es ésta**: bajó 6 puntos pareja en 1.27.0 (§20). La de
> titular sigue vigente tal cual.

### La proyección: por qué el debut bajó de los 27 a los 24

El bono de edad fijo (+2 con `potential >= 80`) no alcanzaba: el portón terminaba
midiendo el OVR PICO, que llega a los 27, y por eso el internacional de un tier 1
debutaba a los 27,5 cuando los de verdad debutan entre los 21 y los 24.

Ahora el bono es proporcional a lo que le falta al jugador para su techo, pleno
hasta los 24 y apagándose hasta los 28. **El tope es lo que hace que el cruce se
reparta por edad**: con el bono descubierto todos cruzarían a los 19; con tope 18
cruzan cuando su OVR crece lo suficiente.

| Tier 1 | Antes | Después | Objetivo |
|---|---|---|---|
| Edad media de primer cap | 27,5 | **24,3** | ≤ 25 |
| ≤21 años | 0,0 % | **12,3 %** | 15-25 % |
| 22-26 | 36,4 % | **65,9 %** | 50-60 % |
| 27+ | 63,6 % | **21,7 %** | 20-30 % |

### `dropped` con vuelta

Medio descuento (−3, tres temporadas) más dos eventos que pueden costarte el
puesto sin que sea la edad (`nt-place-under-threat`, `nt-long-injury-place-lost`).
Los eventos NO escriben `nationalStatus`: aplican un `selectionPenalty` de puntos
por temporadas y quien decide sigue siendo `evaluateNationalTeam`.

Retornos, abiertos por edad de caída — el promedio plano escondía dos fenómenos
distintos:

| Caída | Casos | Vuelven |
|---|---|---|
| antes de los 31 | 39 | **28,2 %** (obj 25-40) |
| a los 31 o más | 176 | 0,6 % |

La caída tardía no es perder el puesto: es apagarse. La temprana sí se juega.

> **Esa frase se escribió cuando la única caída tardía posible era por decadencia,
> y describía una limitación del modelo, no una decisión de diseño.** Con la
> presión del titular (§19) hay dos clases de caída tardía y son distintas:
>
> · **por decadencia** — el jugador ya no da el nivel. No vuelve, y no tiene que
>   volver.
> · **por presión** — a uno de 32 lo empuja el que viene atrás, no su propio
>   declive. Ése puede recuperar el puesto, y que lo haga es una buena historia.
>
> Medido con la presión puesta, el retorno tras una caída a los 31 o más pasó de
> 0,6 % a 9,1 %. Sigue siendo una excepción y no la norma, que es lo que
> corresponde: el que se apaga es la enorme mayoría.

### Lo que sigue abierto

- **Caps promedio**: tier 1 70,5 (obj 45-70), tier 2 71,2 (obj 30-45), tier 3
  59,3 (obj 15-30). Con debut a los ~21 en uniones chicas y carreras de 15-18
  temporadas, la permanencia en el plantel es larga y bajar los tests a 3-5 no
  alcanza. Bajar más contradiría la tabla de tests acordada.
- **Amateur en rep 2**: 0 % contra un objetivo de 3-8 %. El umbral es 80 y el
  recargo de rep 2 era +8, o sea 88, con un techo de ruta que ronda 79. Sólo se
  abre tocando el recargo.

  > **Cerrado, y no bajando el número.** En 1.19.0 el recargo de rep 2 bajó de 8
  > a 4 y aun así el umbral queda en 84 contra un techo de ruta de 79. El
  > objetivo de 3-8 % era el equivocado: ver la regla de diseño de acá abajo.

### La regla de diseño de la ruta amateur

**La ruta amateur llega hasta las uniones rep 1 y ahí se termina.** Si sos lo
bastante bueno como para jugar para Fiyi o Georgia, alguien te ofrece un contrato,
y en ese momento dejás de estar en la ruta amateur. El techo de 79 no te impide
llegar a la selección de un tier 2: te impide llegar *siendo amateur*, que es otra
cosa y es correcta.

Por eso el 0 % de amateurs en una unión rep 2 no es un agujero a tapar. La medida
que importa no es "cuántos amateurs llegan a Georgia" sino **cuántos de los que
empezaron por la ruta amateur llegan a una selección**, y ésos llegan por el
camino que corresponde: firmando antes.

Es la misma disciplina que el resto de la feature. El escalafón de empleo es el
eje económico del rugby (CLAUDE.md §5), así que la pregunta "¿puede un amateur
jugar para un tier 2?" está mal planteada de entrada: en el momento en que podría,
ya no es amateur.

---

## 18. El calendario internacional: los caps salen del fixture (1.20.0)

### El problema

El tope de caps por temporada era una tabla por reputación
(`TESTS_BY_REPUTATION`: una tier 1 juega 11-13 tests, una rep 0 juega 3-5). Los
números eran razonables y no salían de ningún lado: eran una aproximación sin
fixture detrás, y una **segunda fuente de verdad** sobre algo que el calendario
real contesta mejor. Tailandia no juega tres partidos al año porque una tabla lo
diga: los juega porque el Asia Rugby Championship son tres partidos.

### `data/international-calendar.ts`

Un array de competiciones, cada una con sus participantes, cuántos partidos juega
cada participante por edición, cada cuántas temporadas hay edición y desde qué
año. Los códigos de país son los de `countries.generated` y hay un test que lo
verifica: la vuelta anterior se escribió `gb-wal` donde va `gb-wls`, y una lista
con un código inventado no falla — deja a Gales sin fixture y nadie se entera.

| Torneo | Partidos | Cada |
|---|---|---|
| Seis Naciones | 5 | 1 año |
| The Rugby Championship | 6 | 1 año |
| Nations Championship (los 12 de arriba) | 6 + final | 2 años |
| Rugby Europe Championship | 5 | 1 año |
| Pacific Nations Cup | 4 | 1 año |
| Sudamérica Rugby Championship | 4 | 1 año |
| Rugby Africa Cup | 3 | 1 año |
| Asia Rugby Championship | 3 | 1 año |
| Mundial (24 clasificados) | 4 de grupo + llave | 4 años (2027, 2031…) |

Más dos términos que no son torneos: la **ventana de giras** (noviembre y mitad
de año, repartida por reputación porque es lo que decide a quién invitan) y las
**clasificatorias**, para el que no entró directo al Mundial, en las dos
temporadas previas.

Dos reglas de reemplazo evitan que las cosas se sumen dos veces: en un año de
Nations Championship los cruzados **son** la ventana de noviembre, y en un año de
Mundial la ventana se reduce a los amistosos de preparación. Sin eso Irlanda
terminaba con 16 tests en una temporada, que no existe.

### El tope duro

```
caps(temporada) = min(disponibles, round(disponibles × share))
```

Nadie suma más caps que partidos jugó su unión: ni por evento, ni por
`testShare`, ni por redondeo. Hay un invariante en la suite que lo verifica sobre
**todas las temporadas de 2000 carreras** (36.118 temporadas con caps revisadas,
0 violaciones). Es el tipo de regla que se rompe callada.

Una unión sin fixture da cero partidos y cero caps, y eso no es un borde a
parchear: Rusia figura en el catálogo de uniones y no juega ninguna competición
porque está suspendida.

### Lo que produce (2000 carreras, 24 uniones destacadas)

| Unión | Fixture/temp. | % con cap | Caps prom. | Caps/temporada internacional |
|---|---|---|---|---|
| Nueva Zelanda | 12,75 | 8,5 % | 59,6 | 6,6 |
| Irlanda | 11,75 | 15,8 % | 66,2 | 6,0 |
| Argentina | 12,50 | 18,5 % | 64,5 | 5,9 |
| Georgia | 8,00 | 32,5 % | 56,2 | 4,3 |
| Uruguay | 6,75 | 68,3 % | 67,0 | 4,5 |
| Namibia | 6,00 | 69,5 % | 61,1 | 4,1 |
| Tailandia | 4,00 | 74,0 % | 42,9 | 2,7 |

La última columna es el efecto buscado y está: **los caps por temporada siguen al
fixture**. El georgiano suma 4,3 por año y el argentino 5,9.

### Lo que NO arregló — y qué lo arregló después

Medido con 1.20.0, el **total** de caps de una carrera seguía chato: 4,5 % de los
internacionales terminaba con menos de 10 caps contra un objetivo de 25-40 %, y
la mediana (74) quedaba por encima del promedio (67,9) en vez de por debajo.

**La causa no era el fixture sino la permanencia**: la mediana de temporadas con
la camiseta era 14, el 84,8 % jugaba diez temporadas o más y sólo el 3,7 % duraba
dos o menos. Cualquier fixture razonable multiplicado por catorce temporadas da
un número grande. El calendario acotó la tasa por temporada, no la duración — y
la distribución de caps la decide la duración.

> Los números de arriba son de 1.20.0 y **quedaron viejos a propósito**: son el
> diagnóstico que llevó al estado `trial` y a la presión del titular. Con
> `trial`, el `<10 caps` pasó de 4,5 % a 31,2 %. La medición vigente no es ésta.

### El Mundial dejó de tener dos calendarios

`mil-world-cup-callup` y `mil-world-cup-final` salían por cooldown, cayera donde
cayera: había convocatorias al Mundial en 2029 y en 2030. Ahora los dos piden
`isWorldCupYear`, que sale del calendario y de ningún otro lado.

---

## 19. La presión del titular, y hasta dónde llega (1.23.0)

### Qué es

El motor no modela el plantel: no hay un rival concreto disputándote la camiseta.
Pero el EFECTO de esa competencia se escribe como un número que se suma al umbral
de convocatoria.

```ts
const PRESSURE_BY_REPUTATION = [0, 0, 0.3, 0.6, 0.9, 1.1];
const PRESSURE_GRACE_SEASONS = 2;
presión = Math.max(0, antigüedadEnPlantel - PRESSURE_GRACE_SEASONS) * PRESSURE_BY_REPUTATION[rep];
```

Sólo desde `squad`/`starter` —el que está a prueba tiene su propia puerta— y con
la antigüedad contada como racha desde el final de `state.seasons`, así que el que
cae y vuelve arranca de nuevo. No se guarda ningún contador.

**En rep 0 y rep 1 vale cero, y no es una simplificación**: en una unión con tres
profesionales no hay nadie atrás empujando, y las carreras internacionales largas
de las uniones chicas son correctas.

### Qué hace, medido

A/B sobre la MISMA muestra —diez uniones de tier 1 × 200 carreras, 303
internacionales— apagando la constante a ceros y volviéndola a encender. Es la
única forma de atribuir: comparar contra una corrida vieja de otra muestra no
prueba nada.

| Banda de caps | sin presión | presión, gracia 3 | presión, gracia 2 |
|---|---|---|---|
| < 10 | 24,8 % | 24,8 % | **24,8 %** |
| 10-30 | 9,6 % | 9,9 % | **10,9 %** |
| 30-60 | 13,9 % | 19,1 % | **18,2 %** |
| 60+ | 51,8 % | 46,2 % | **46,2 %** |
| mediana | 62 | 55 | **55** |
| permanencia mediana | 9 temporadas | 8 | **8** |
| ≥ 10 temporadas | 49,8 % | 42,2 % | **40,9 %** |
| caídas | 96 | 161 | **171** |

Bajar la gracia de 3 a 2 usa el margen que sobraba —el `<10` está quince puntos
debajo de su techo de 40 % y no se movió ni un décimo— y compra un punto de 10-30.

El retorno tras una caída antes de los 31 quedó en **39,7 %** global, contra un
objetivo de 25-40 %. Está en el borde: **una gracia de 1 lo sacaría del rango.**

### El límite, que no es de calibración

**El 10-30 no se llena con presión y no hay que insistir.** La aritmética:

Para caer en 10-30 en tier 1 —donde un titular junta 7 a 10 caps por temporada— la
caída tiene que llegar en la tercera o cuarta temporada de plantel, con el jugador
en 25 o 26 años. **A esa edad el OVR todavía crece 2 o 3 puntos por temporada**, y
la presión sube 1,1. Nunca lo alcanza. Para que lo alcanzara habría que ponerla en
3 por temporada, y eso reventaría el `<10` y borraría el 60+ entero.

No está mal calibrada: **la población que tendría que caer ahí está mejorando más
rápido de lo que cualquier presión razonable puede empujar.** Se ve en el dato
crudo — de las 171 caídas de tier 1, **148 son a los 31 o más**. Aun con la
presión puesta, perder la camiseta sigue siendo un fenómeno de edad.

### La hipótesis, para verificar después

Quiénes son, en el rugby real, los internacionales de 10 a 30 caps:

- el que **se fue a una liga más débil** y salió de la consideración;
- el que **bajó de categoría con su club**;
- el que **pasó a ser suplente en un club grande** y dejó de jugar;
- el que se rompió.

**Ninguna de las cuatro es un fenómeno de selección: las cuatro son del club.** El
modificador de nivel de club ya existe en el valor de selección (+2 / −3); cuando
además existan el rol en el plantel, los partidos jugados y el descenso, un
jugador de 26 años va a poder perder cinco o seis puntos de valor efectivo **sin
que su OVR baje un punto**. Ése es el mecanismo que falta.

> **EL 10-30 SE LLENA DESDE EL CLUB, NO DESDE LA SELECCIÓN.** Volver a medir esta
> distribución cuando el rol, los partidos y los descensos estén andando. Si sigue
> en 10 %, ahí sí se discute la presión. Antes de eso, calibrar la pendiente sería
> apretar una palanca para compensar un mecanismo que todavía no existe.

## 20. La tabla de debut baja 6 puntos (1.27.0)

`DEBUT_BY_REPUTATION` pasa de `[63, 67, 80, 84, 87, 90]` a `[57, 61, 74, 78, 81, 84]`.

**Baja pareja a propósito.** Lo que se quería mover es cuánta gente llega a una
selección, no la distancia entre uniones: los saltos (`4, 13, 4, 3, 3`) y el
abanico (27 puntos) quedan idénticos, así que ninguna frontera entre bandas se
corrió. Jugar para Nueva Zelanda sigue costando tres puntos más que jugar para
Irlanda.

**`STARTER_BY_REPUTATION` no se tocó**, y ahí está la mitad interesante: el hueco
entre entrar al plantel y ganarse el puesto pasó de 4 a **10 puntos** en las tres
bandas de abajo. Se debuta antes y se pasa más tiempo en el banco.

**`AMATEUR_SURCHARGE` tampoco se tocó**, porque es un sobreprecio y no un umbral
propio: la ruta amateur bajó los mismos 6. El caso que cambia de naturaleza es rep
2, que pasa de 88 —imposible por construcción contra un techo medido de 77— a 82,
o sea apenas rozable por un amateur de pico absoluto con forma y escasez a favor.
El objetivo de 3-8 % del §17 deja de ser inalcanzable.

### Resultado medido (200 carreras por unión, rama profesional declarada)

| Unión | Rep | Debut antes → después | % con cap antes | % con cap después | Edad 1er cap |
|---|---|---|---|---|---|
| Chequia | 0 | 63 → 57 | 99,0 % | **100,0 %** | 19,1 |
| Rumanía | 1 | 67 → 61 | 95,0 % | **100,0 %** | 19,3 |
| Uruguay | 2 | 80 → 74 | 55,5 % | **81,5 %** | 21,1 |
| Argentina | 3 | 84 → 78 | 33,0 % | **65,0 %** | 22,5 |
| Irlanda | 4 | 87 → 81 | 16,0 % | **41,5 %** | 23,9 |
| Nueva Zelanda | 5 | 90 → 84 | 12,0 % | **28,5 %** | 24,0 |

Seis puntos sobre el modo de la distribución valen **el doble de internacionales**
en las tres bandas de arriba. Es la consecuencia esperable de mover un umbral que
cae justo donde se amontonan los OVR pico, y conviene tenerla escrita: la tabla no
es lineal en su efecto aunque el cambio sí lo haya sido.

Punto de comparación por si hace falta un intermedio: con **−3**
(`[60, 64, 77, 81, 84, 87]`) queda Uruguay 70,5 %, Argentina 48,5 %, Irlanda
27,5 % y Nueva Zelanda 16,0 %.

### Lo que NO cambió

La ruta amateur medida por temporada: **0,0 %** de las temporadas jugadas siendo
amateur suma caps en Argentina o Nueva Zelanda, igual que antes. El umbral con
recargo queda en 92 y 110 contra un valor máximo alcanzable de 82.

### Dos tests que se estaban mintiendo, y se arreglaron acá

- **`un amateur NO llega a los All Blacks ni a Los Pumas`** dejó de medir amateurs
  en **1.26.0**, cuando la ruta pasó a ser una rama sorteada: `carreras(code,
  'development')` dejó de significar "carreras amateurs" y pasó a significar
  "carreras que arrancan abajo", la mayoría de las cuales termina profesional.
  Seguía verde porque el umbral era alto, no porque midiera lo que decía — con la
  tabla nueva saltó a 24,2 % y la lectura literal habría sido "un cuarto de los
  amateurs juega para los All Blacks" cuando el número real es 0,0 %. Ahora cuenta
  **temporadas jugadas siendo amateur** que sumaron caps, que además da un
  denominador grande en cualquier unión (filtrar carreras 100 % amateurs en Nueva
  Zelanda daba 2 de 120: no probaba nada).
- **`la ruta amateur … es imposible de rep 3 para arriba`** comparaba contra
  `TECHO_AMATEUR + 15`, un margen inventado. El umbral de rep 3 quedó en 92, o sea
  exactamente ese margen, y el test se puso rojo sin que "imposible" dejara de ser
  cierto. Ahora la frontera es la real —el valor máximo que un amateur puede
  alcanzar, `77 + 3 + 2`— y no se mueve cuando se recalibra la tabla.

### Deuda que este cambio NO tocó

`el amateur de una unión sin profesionales llega` **ya estaba en rojo antes**: la
banda dice 25-60 % y la rama medía **97,3 %** con la tabla vieja. Con la nueva da
99,2 %. Son 1,9 puntos de empeoramiento sobre un test que ya estaba violado por 37,
así que no es una regresión de 1.27.0 — pero sí confirma lo que la banda quería
evitar: **en una unión rep 0 la selección dejó de ser un objetivo**. Si se quiere
recuperar, la palanca no es el umbral de debut sino el fixture: una unión rep 0 con
tres partidos por temporada ya reparte caps a todo el que esté vivo.

## 21. El arranque sale del club y el destino sigue al nivel (1.28.0)

1.26.0 había unificado el arranque: todos a los 18, todos en el mismo club
amateur, y una tabla decidía si valías 47 o 58. El nivel quedaba colgado de una
etiqueta que el jugador no podía ver en ningún lado.

### Lo que cambió

| | Antes | Ahora |
|---|---|---|
| Club inicial | siempre amateur | amateur (70 %) o academia de club pago (30 %) |
| Banda de OVR a los 18 | de la rama: 45-55 / 55-60 | del **club**: amateur 45-55, pago 50-55 |
| Track del que entra a club pago | senior | **academia** (`development`, compensado) |
| Partidos del juvenil de academia | fracción marginal del calendario senior | **su propio campeonato** (45-75 %) |
| Tolerancia de fichaje | 8 puntos fijos para todos | élite 2 · regional 4,4 · resto 8 |
| Éxito del club en el desarrollo | no existía | `leaguePosition` → ±6 % |
| `POTENTIAL_MAX` | 95 | **99** |

### Los nombres de rama cambiaron de sentido

`development` es ahora la **academia** de un club pago y `amateur` el plantel
senior de un club amateur. Hasta 1.27.0 `development` era, literalmente, la rama
que **no** iba a desarrollo — la clase de nombre que termina en un bug, y que de
hecho ya había roto dos tests sin que nadie se enterara. `professional` queda como
valor legado de lectura para que las partidas de 1.26.0 no exploten al cargar.

### Resultado medido (900 carreras, 9 puestos × 8 países)

| | Objetivo | Antes | Después |
|---|---|---|---|
| Pico ≥ 80 | 40 % | 44,3 % | 45,4 % |
| Pico ≥ 90 | 5 % | 7,3 % | 7,6 % |
| Pico ≥ 99 | 1,8 % | 0,0 % | **0,0 %** ✗ |
| Crack (titular en club 85+) | ~20 % | — | **16,2 %** |
| Nunca titular de club 70+ | ~30 % | — | 18,3 % |
| Racha plana mediana | ≤ 3 | 3 | 3 |

**El destino ahora sigue al nivel**, que era el problema de fondo:

| Pico del jugador | Llegó a liga top (antes) | (después) |
|---|---|---|
| menos de 70 | 23,1 % | **10,9 %** |
| 90 o más | 66,7 % | 63,2 % |

### Élite no es haber pisado una liga top

El test de reparto medía `marketRung >= 8` y daba 44 % contra un objetivo de 20 %,
un número **imposible de arreglar sin romper otro**: si 4 de cada 10 carreras pican
en OVR 80 y un club de Top 14 ficha con 80, entonces 4 de cada 10 pueden entrar a
un club de Top 14. Es aritmética, no calibración.

Lo que estaba mal era la definición. El Top 14 tiene 23 puntos de amplitud
—Toulouse 95, el último ronda 72— así que entrar al más flojo con 75 es creíble y
no te hace crack. Midiendo **lo que el jugador fue adentro del club** (titular o
indiscutido en un plantel de rating 85+) el reparto da 16,2 % sin tocar una sola
constante del motor.

### Las franquicias regionales entran por vía, no por país

Dogos, Pampas, Peñarol y Selknam llevan `countryCode: 'multi'`, así que filtrar
`CLUBS` por `'ar'` devolvía cero y el 97 % de los argentinos arrancaba amateur
aunque hubiera sacado la rama de academia. El pool se arma ahora con los clubes
del país **más los destinos de las vías que salen de su escalera** — el dato que
el motor ya tenía para decir "por acá se profesionaliza un sudamericano".

### Pendiente, con hipótesis descartadas

**El 1 de cada 55 a 99 no se cumple.** El tope subió a 99 y el 0,8 % de los techos
llega ahí, pero **ningún pico lo alcanza**: el máximo observado es 97. La causa es
estructural — `clampAttr` topea cada atributo en 99 y el OVR es un promedio
ponderado, así que llegar a 99 exige todos los atributos en 99 a la vez, y los
atributos pican a edades distintas. No se arregla subiendo el techo.

**El `late` no pasa al `early` a los 30** (77 contra 79). Dos hipótesis probadas y
descartadas, anotadas en `development-profile.ts`: bajar el factor de crecimiento
del precoz no mueve nada (a los 27 ya está en su techo, y `growthScaleFor` devuelve
0 con brecha 0), y adelantarle el pico rompe el invariante de que al `early` no se
le adelanta el declive. Lo que los separa a los 30 es el declive, y mover eso pide
un mecanismo propio.

---

## 22. Los ejes de una decisión, y el ascenso (1.29.0)

Dos cambios que se cuentan juntos porque salieron juntos.

### 22.1 Una decisión se lee en el idioma del deporte

El jugador elegía entre dos frases y descubría después, leyendo una tabla, si le
había ido bien. Ahora cada opción muestra sus desenlaces **con probabilidad y
consecuencia**, y al elegir se revela el que salió con los números girando y la
tarjeta iluminada en verde o en rojo (`OutcomeRoll.tsx`).

Lo importante no es la animación: es que **nada de eso se declara a mano**. La ⭐
de un efecto es el OVR que ese efecto mueve de verdad en ese puesto — suma
ponderada de los deltas, la misma cuenta que `ovrExact` (`engine/impact.ts`). Por
eso las 71 decisiones que ya existían hablan el idioma nuevo sin reescribir
ninguna, y por eso no hay forma de que la tarjeta prometa una cosa y el motor haga
otra. El día que cambien los pesos de un puesto, cambia la ⭐ de todo el catálogo
sola.

Se muestran **dos** ejes, ⭐ y 🕒, y no siete. Con siete la tarjeta dejaba de
decidirse y pasaba a leerse. La lesión y la suspensión no se esconden: son tiempo
de juego que se pierde y se cuentan ahí, que es literalmente lo que son. El color
sí se calcula con el modelo completo, así que una suspensión se ilumina en rojo
aunque su ficha no esté a la vista.

Tres ejes necesitaban motor porque no existían:

| Eje | Cómo entra | Dónde |
|---|---|---|
| 🕒 `playingTime` | escalones que multiplican la fracción de fechas del lugar en el plantel | `season-modifiers.ts` |
| 🚫 `sanction` | tarjetas y suspensiones; los partidos entran por la **disponibilidad**, igual que una lesión | `player.sanctions` |
| 📋 `statBoost` | el premio material se cobra en cancha (tries, tackles) y no en dinero | `pendingStatBoost` |

Medido al calibrar el contenido: **la ⭐ de una tarjeta tiene que quedarse en ±1 o
±2**. Con +2 en eventos repetibles el jugador llegaba a su techo dos o tres
temporadas antes y la meseta del pico se estiraba. Y `valoracion` está acotada por
el techo (`appliedValoracion`): una decisión no puede pasar el potencial por
arriba.

### 22.2 Los clubes ascienden y descienden

Si tu club sale primero en segunda, la temporada que viene la jugás en primera; si
sale último en primera, en segunda. Las plazas salen del dato: bajan dos del Top 14
y sube uno de Nationale, así que no hay un "último" universal.

**El grafo ya existía y no lo leía nadie.** `MOVEMENTS` (competitions2026.ts)
declaraba desde el primer día quién sube a dónde, con cuántas plazas y si es
directo o por promoción; estaba escrito, testeado en su forma, y ninguna línea del
motor lo consumía. `engine/promotion.ts` es el consumidor que faltaba: no hay
reglas nuevas, sólo la lectura del grafo.

Sólo se mueven las escaleras **verticales** declaradas. El NPC, el Super Rugby, la
URC y la SRA son paralelas —no son la primera de nada— y los sistemas paraguas
sudamericanos son uniones en paralelo, no divisiones: salir primero en la URBA no
sube a nadie al Top 14.

El movimiento vive en `CareerState.divisions` (clubId → competición) y no en el
catálogo, que es un dato congelado y compartido entre partidas: un club que
ascendió en una carrera no ascendió en la otra. Se resuelve al leer, con
`resolveClub`.

Y de ahí sale todo lo demás **sin una regla extra**: la banda deportiva, el modelo
económico, las copas a las que entra y el techo de contrato se derivan de la
competición. El club ascendido conserva su rating, así que pelea abajo — eso ya lo
dice la resta `valor − rating del club`.

Medido sobre 1080 carreras: **dos de cada tres tienen al menos un ascenso o
descenso**. Eso movió la meseta total mediana de 4 a 5 temporadas, y al mirarlo de
cerca la mitad exacta de la población pasa 5+ temporadas quieta **en su pico**
(brecha mediana con el techo: 0). Por eso el invariante de §11 pasó a medir la
meseta **por debajo del pico** —el desarrollo trabado, que es el bug que quería
atrapar— donde la mediana es 2 y sólo el 5% llega a 5.

---

## 23. El rugby argentino son dos ramas, no una pirámide (catálogo `2026-27.8`)

### El problema que resuelve

Argentina venía de una única competición paraguas, `sa-ar`, con un campo
`divisionTier` de 1 a 4 deducido del **nombre del torneo** en el que cada club
tenía partidos jugados. Eso producía tres cosas concretas:

1. **La jerarquía estaba dada vuelta.** Los siete regionales del interior estaban
   todos etiquetados tier 2, igual que URBA Primera A, así que el Torneo Local de
   la URNE (34-43) le pasaba por arriba a URBA Primera B (29-36). El canon dice lo
   contrario: la URBA hasta Primera B inclusive está por encima de todo el
   interior, con tres excepciones (las primeras divisiones de Oeste, Centro y
   Litoral).
2. **Faltaba la primera división del Litoral entera.** Duendes, Jockey Club de
   Rosario, Gimnasia y Esgrima de Rosario, Old Resian, Universitario de Rosario,
   Santa Fe y Estudiantes de Paraná caían en el bucket "sin división", y un club
   sin división resoluble no acredita título (§7): el máximo ganador histórico del
   Torneo del Interior no tenía torneo que ganar.
3. **No se podía declarar un ascenso.** Con una sola liga no hay forma de decir
   "el campeón de Primera A sube al Top 14" sin que suba también el campeón de
   Córdoba, y los cupos del TDI —que se reparten por región y por posición final
   en cada regional— no tenían liga de origen desde donde declararse.

### La forma nueva

`data/clubs2026/arSystem2026.ts` es el canon: datos puros, sin dependencias.
Declara **24 divisiones**, cada una con su propio `competitionId` igual que Pro D2
o Fédérale 1, agrupadas en dos ramas que no se tocan:

| Rama | Divisiones | Clubes |
|---|---|---|
| URBA | Top 14 · Primera A · B · C · Segunda · Tercera (11) · Desarrollo (10) | 91 |
| Interior | primera y segunda de las 7 regiones + 4 de locales (Nivel 6/7) | 133 |

El ascenso vive en `promotesTo`/`relegatesTo` y **nunca cruza de rama ni de
región** (hay un test que lo recorre): un club de la URBA no puede ascender al
interior ni al revés. Eso además activó `engine/promotion.ts` para Argentina, que
hasta ahora no movía a nadie ahí porque no había divisiones entre las que moverse.

### La escala: por qué las bandas del canon no se copian

El canon trae bandas 0-100 (Nivel 1 = 88-100). Copiarlas dejaría a Newman en 95,
o sea arriba de Leinster (94) y de Toulouse (95), y borraría el salto al
profesionalismo. Se remapean al rango amateur conservando **el orden y la
frontera**, que es lo único que el canon declara inviolable:

| Nivel | Divisiones | Canon | Juego |
|---|---|---|---|
| 1 | URBA Top 14 | 88-100 | 48-52 |
| 2 | URBA Primera A | 74-88 | 45-48 |
| 2 | Córdoba Top 10 A · Litoral Top 10 · Copa de Oro cuyana | 74-88 | 43-46 |
| 3 | URBA Primera B | 64-75 | **39**-42 |
| 4 | Primera C · NOA A · 2ª del Litoral · Súper 9 B · Copa de Plata | 52-63 | 34-**38** |
| 5 | URBA Segunda · NEA A · Pampeano A · Patagónico | 42-56 | 30-36 |
| 6 | URBA Tercera · NOA B · Pampeano B · Ascenso NEA · locales | 32-48 | 27-32 |
| 7 | URBA Desarrollo · torneos locales del interior | 22-37 | 24-29 |

La frontera es el 38 contra el 39: ningún club del interior fuera de las tres
excepciones llega al piso de URBA Primera B. Los solapamientos entre niveles
adyacentes se conservan a propósito (son los upsets creíbles) y la banda amateur
de `LEVEL_RATING` pasó de topear en 46 a topear en 52 — el invariante que importa
no era 46 sino que el techo amateur quede **debajo del piso de Super Rugby
Americas** (56), y ese sigue medido.

### El techo del escalafón sigue en 3, y es carga estructural

`AR_SPORTING_BAND` mapea los siete niveles a las bandas 0-3, con tres empates
(N2/N3, N4/N5, N6/N7) elegidos donde el canon declara los solapamientos más
grandes. La tentación es darle al Top 14 la banda 4 para que Primera A y Primera B
no compartan escalón. Se probó y **se revirtió**: la banda define la ventana de
fichaje (±1 es un pase normal y no pide nada), Super Rugby Americas está en la
banda 5, y con el Top 14 en 4 la SRA quedaba a ±1 — medido, un jugador de **56 en
La Plata** recibía oferta de franquicia sin pasar por el `minOvr: 59` de la vía.
Lo que se pierde con los empates es el matiz del texto del movimiento; lo que se
gana es que el salto al profesionalismo siga siendo un salto.

### El Torneo del Interior y el Nacional de Clubes

Las plazas del TDI **pertenecen a la región, no al club**, así que la
clasificación se declara por posición final en cada regional con los cupos 2026
(Córdoba 6, Litoral 6, Oeste 2, NOA 1, NEA 1 para el A; 16 en total). El TDI A y
el TDI B **no son una escalera**: no aparecen en `MOVEMENTS`, porque un campeón
del A puede terminar jugando el B si su regional lo relega — le pasó a Tucumán
Lawn Tennis. El ciclo anual que reasigna las plazas (tabla general de 1 a 32,
reválidas de los puestos 29-32) todavía no está modelado: los cupos son fijos.

El **Nacional de Clubes** es la única competencia del año donde se cruzan las dos
ramas. Simplificación documentada: en la realidad es un partido único entre el
campeón del Top 14 y el campeón del TDI A, pero el motor resuelve las copas en
paralelo y no puede leer "el que ganó el TDI A" (el ganador de una copa no es un
criterio de clasificación disponible). Se aproxima con el campeón de cada primera
división regional que tiene cupo al TDI A: son los cinco clubes que pueden llegar
a esa final, y entrar exige lo mismo que en la realidad —salir campeón—. Lo que se
pierde es que compitan entre sí antes.

### El puente con el catálogo real: los escudos

El escudo de un club se pide con su `sourceId` (`crestKeyOf`), que sale del
snapshot de Supabase. Un canon escrito de cero habría dejado a los 181 clubes
argentinos con monograma en vez de escudo, y en este proyecto los equipos van
siempre con escudo real. `arCatalog.ts` cruza canon contra catálogo real por
nombre normalizado (sin acentos, sin puntuación y sin las palabras de relleno:
"Club", "Rugby", "R.C.", "de", "la") y hereda `id` y `sourceId` de la fila que
matchea. Resultado medido: **180 de los 181 clubes argentinos del catálogo real
conservan su escudo y su id**, y 44 clubes nuevos (las tres divisiones bajas de la
URBA, los dos de Villa María, los dos paraguayos del NEA) quedan declarados sin
escudo en `AR_CATALOG.created`. Total: 224 clubes argentinos.

Donde la normalización no llega hay **alias explícitos**, no coincidencia difusa.
Son quince, y se justifican por uno de dos motivos: la sigla que no se parece a
nada (`SIC` ≠ `San Isidro Club`) o el **homónimo**, donde dos filas normalizan
igual y hay que decir cuál es cuál. El canon prohíbe fusionar homónimos y el
catálogo conserva los siete Jockey Club, los tres Tiro Federal, los dos San
Patricio (URBA y Corrientes), los dos Pueyrredón, los dos Argentino, los dos La
Salle, los dos Santa Rosa y los dos San Jorge.

Los clubes del catálogo real que el canon no nombra **no se borran**: van al
Nivel 7 de su región, que es exactamente lo que el canon llama "torneos locales y
de desarrollo de las uniones del interior". Queda uno afuera, declarado en
`AR_SNAPSHOT_UNPLACED`: Policía Ciudad de Buenos Aires, que no aparece en ninguna
división del canon y que meter en Desarrollo rompería el plantel de 10 que el
canon declara.

---

## 23. La ventana del amateur no cruza la frontera (1.30.0)

Encontrado jugando, y es el mejor ejemplo de por qué se juega: a un **sudafricano
de 18** en un club amateur el mercado le ofrecía **Paraná Rowing Club, Tucumán Lawn
Tennis y Berazategui**. Medido sobre 60 carreras `za`, sus primeras ofertas venían
46 de Argentina, 28 de Francia, 12 de Inglaterra y **11 de Sudáfrica**: el mercado
de un pibe sudafricano era, sobre todo, argentino.

### 23.1 No era el peso, era el volumen

`proximityWeight` multiplica ×2,2 el país propio y ×0,5 el resto, y eso está bien.
Lo que cambió abajo es el CATÁLOGO: el sistema argentino declarado (§22.2 del
catálogo, `2026-27.8`) puso ~200 clubes en los escalones bajos. **Doscientos
candidatos a 0,5 le ganan a doce a 2,2** sin que ninguna constante esté mal
calibrada.

Subir el multiplicador habría tapado el síntoma hasta que entrara el próximo
catálogo nacional. Lo que no existe en el rugby es la PUERTA, no el peso: a un
amateur de 18 no lo ficha por mercado abierto un club de otro continente.

### 23.2 La regla

Mientras el vínculo sea **amateur o compensado**, o el jugador esté en la
**academia**, la ventana se queda en su sistema: el país de su club actual y el
suyo de origen (volver a casa nunca deja de ser una opción). El extranjero se
alcanza por **vía declarada**, que es la puerta real —un convenio, una academia,
una franquicia que scoutea— y que el motor ya modelaba con nivel mínimo y
tolerancia. Se abre sola al profesionalizarse o al graduar a senior: un semipro
sudafricano sí puede firmar en Japón.

El ancla es el país del **club**, no el pasaporte: un argentino en la academia de
Toulouse recibe ofertas francesas, y Groenlandia o Fiyi —que no tienen liga propia
en el catálogo— no se quedan sin mercado.

### 23.3 El convenio, declarado

Con eso entra `za-domestic-to-cobras`: la franquicia brasileña se nutre de
sudafricanos, así que su oferta sigue llegando, pero **por su puerta** y con su
piso de nivel (59, el rating de la franquicia, igual que las vías a la SRA
sudamericana) en vez de por el mismo mercado abierto que traía clubes de la Tercera
de la URBA. Una vía no garantiza oferta: sin nivel no hay convenio que alcance.

### 23.4 Medición

Nueve nacionalidades (za, ar, fr, nz, jp, es, gb-eng, fj, gl), 25 carreras cada
una:

| | Antes | Después |
|---|---|---|
| Ofertas `za` a un sudafricano amateur | 11 | 87 |
| Ofertas `ar` a un sudafricano amateur | 46 | **0** |
| Ofertas extranjeras de ventana siendo amateur | — | **0** en las nueve |
| Ofertas extranjeras de ventana siendo profesional | — | 100-270 por nacionalidad |
| Carreras sin una sola oferta | — | 0 de 25 en las nueve |

Clubes por carrera (5,7-8,2) y temporadas (~17) quedan iguales.

**Y el digest congelado cuenta el arreglo**: el pilar neozelandés debutaba en
`kamaishi-seawaves` —Japón— y ahora arranca en `north-harbour`. Un neozelandés de
18 aceptaba una oferta japonesa que le llegaba por mercado abierto; con la frontera
cerrada se queda en el NPC. Los otros dos casos del digest movieron sólo el hash.

---

## 24. Cinco ligas nuevas: EE.UU., Portugal, Italia y Brasil (catálogo `2026-27.9`)

Entran siete competiciones en cuatro países, y las cinco que el pedido nombra
comparten una misma tensión que conviene decir antes que ningún dato: **la liga
doméstica no es donde está el mejor rugby del país.**

| País | Cómo se expresa esa tensión |
|---|---|
| Italia | **Estructural y explícita**: Benetton y Zebre juegan la URC y están fuera de la pirámide. |
| Portugal | **Geográfica**: el núcleo de Os Lobos juega en Francia; Lusitanos XV es el puente. |
| Brasil | **Institucional**: los Cobras son de la confederación, no de un club. |
| EE.UU. | **Doble**: la MLR se contrae y el universitario está partido en dos pirámides. |

Y en formato hay dos familias: las que terminan en final única con playoff (MLR,
Italia, Brasil, D1A universitaria) y **la excepción portuguesa**, que corona al 1º
de un grupo final de seis sin final.

### 24.1 Qué entró

| Competición | Clubes | Banda | Modelo | Fechas |
|---|---|---|---|---|
| `us-mlr` Major League Rugby | 6 | 5 | professional | 10 |
| `us-d1a` D1A universitaria (CRAA) | 12 | 2 | amateur | 10 |
| `us-ncr-d1` DI universitaria (NCR) | 8 | 1 | amateur | 8 |
| `pt-honra` Divisão de Honra | 12 | 4 | mixed | 16 |
| `ita-serie-a-elite` Serie A Élite | 10 | 4 | mixed | 18 |
| `ita-serie-a` Serie A | 12 | 1 | amateur | 18 |
| `br-super12` Super 12 | 12 | 2 | amateur | 11 |

Más tres copas (`taca-portugal`, `supertaca-pt`, `coppa-italia`), cuatro escaleras
domésticas nuevas (`us`, `it`, `pt`, `br`) y seis vías de circulación.

### 24.2 Las decisiones que se pueden discutir

**La MLR es profesional Y de banda regional, a la vez.** Los dos ejes dicen cosas
distintas y no es una contradicción: el convenio colectivo con la USRPA se firmó en
febrero de 2026 y los jugadores son profesionales a tiempo completo, pero el tope
salarial reportado ronda los 500.000 USD por club. Eso es nivel de Super Rugby
Americas, no de Pro D2, y por eso comparten banda 5. El mecanismo de ampliación del
tope es particular y vale anotarlo aunque el motor todavía no lo modele: se gana
**desarrollando la base** —participantes sub-14, academias de secundaria, formación
de entrenadores— y no existe exención tipo *marquee player*.

**El universitario son dos competiciones, no una.** El rugby masculino no es deporte
NCAA y desde la escisión de 2021 hay dos pirámides con campeonatos nacionales
separados: la CRAA corona en primavera y NCR en diciembre. Fusionarlas "para
simplificar" habría borrado el hecho más importante del país. El joint venture que
USA Rugby y la CRAA anunciaron el 28 de julio de 2026 **no menciona a NCR**: la
fragmentación sigue, y por eso siguen siendo dos. La Ivy League entera está en NCR
desde 2022 (Liberty Conference), aunque se siga dando el título Ivy por dentro.

Dos rosters son **parciales y declarados**: los doce mejores programas D1A por
ranking, y los ocho de la Ivy en NCR. El segundo es un conjunto real y cerrado; el
resto de NCR DI queda sin cargar en vez de completarse con candidatos plausibles.

**El Super 12 va en banda 2 y no en 3.** Si empatara con el URBA Top 14, Cobras
quedaría a ±1 escalón de un brasileño y la vía declarada dejaría de hacer falta: la
oferta entraría por la ventana normal, salteándose el `minOvr`. Es exactamente el
error que se corrigió en Argentina (§23 del catálogo), y hay un test que lo cuida.

**Italia es la única de las cinco con ascenso declarado.** La reforma 2026-27 deja
la Élite congelada en 10 y Parabiago sube desde la Serie A: diez plazas fijas con un
ascenso comprobado son un intercambio de uno por uno. No se congela en el grafo lo
que pasó en 2025-26 —Colorno excluido el 2 de marzo, plaza de descenso anulada, 16
partidos en vez de 18—, que fue una temporada accidentada y no el formato.

### 24.3 El reparto de academias pedía un contrato nuevo

El vínculo entre las capas del rugby italiano es explícito y bastante original, y va
en **dos direcciones**:

- `ita-elite-to-franchises` — los *permit players*: un jugador de club doméstico
  convocable por Benetton o Zebre. Es la vía de ascenso individual, con piso 64 (el
  rating de Zebre, la más floja del par).
- `ita-franchise-academy-to-elite` — el reparto: desde 2023-24 la FIR distribuye a
  los juveniles de las academias de Benetton y Zebre entre los clubes de la Serie A
  Élite para garantizarles minutos, **con lógica declaradamente inspirada en el
  draft de la NBA** (favorecer a los peor clasificados). Va hacia abajo y sin
  `minOvr`: el mecanismo existe justamente para el que todavía no tiene nivel de
  primera.

La segunda no se podía expresar. `TransferPathway` declaraba el destino por club
(`toClubIds`) pero el origen sólo por competición, y las dos franquicias viven en
`urc`: declarar la vía desde ahí le habría llevado ofertas de Viadana a un juvenil
de Leinster por un mecanismo que sólo existe en Italia. Entra **`fromClubIds`**,
que es la simetría que faltaba, y con ella un invariante nuevo: toda vía tiene que
declarar algún origen.

### 24.4 Portugal entra con un hueco, y está declarado

La Divisão de Honra es el **único escalón portugués del catálogo** y es
semiprofesional, porque la I Divisão no está cargada —y el dato que falta para
cargarla es justamente el que quedó sin confirmar: quién la ganó en 2025-26, o sea
cuál es el 12º equipo de 2026-27—. Consecuencia concreta: la **ruta amateur de un
portugués degrada** a un club pago y lo declara con `routeDowngraded`.

Es el mismo hueco que tenían Francia y Nueva Zelanda antes de la Fédérale 2 y la
Heartland, y se cierra igual: cargando el escalón real, no bajándole el nivel a la
DH para que encaje. El caso está **testeado y nombrado** (`start-routes.test.ts`) en
vez de saltado con una excepción por país: el día que entre la I Divisão, el
invariante estricto vuelve a valer solo.

Por el mismo motivo **Portugal no entra en `MIGRATION_ROUTES.europe`**. Se probó y
el resultado medido fue un francés de 18 debutando en el Técnico de Lisboa: mandar
migrantes a una escalera de un solo peldaño semiprofesional convierte una liga nueva
en un atajo. Los portugueses llegan igual por ruta doméstica.

### 24.5 Medición (60 carreras completas por nacionalidad)

Lo que había que comprobar no es que las ligas existan, sino que **la carrera pase
por donde el rugby real pasa**:

| | Arranque más frecuente | Ligas más pisadas | Pico mediano |
|---|---|---|---|
| `us` | D1A 25 · NCR 13 | **MLR 145** · Pro D2 67 · Championship 58 | 71 |
| `pt` | Divisão de Honra 39 | **Pro D2 94 · Championship 83 · Nationale 68** · DH 56 | 71 |
| `it` | Serie A 38 | **Serie A Élite 115 · URC 72** · Pro D2 62 | 71 |
| `br` | Super 12 38 · Cobras 16 | **SRA 97** · Super 12 94 · Championship 53 | 70 |

Las cuatro filas dicen lo mismo que el pedido: el estadounidense sale del
universitario a la MLR y de ahí a Europa; **el portugués termina en Francia**, que
es donde está el núcleo de Os Lobos; el italiano que llega a profesional pleno
termina en la URC —Benetton o Zebre— o en Francia; y el brasileño pasa por los
Cobras, que son la antesala de los Tupis (55 de 60 carreras `br` suman caps: el pool
es fino y por eso el Super 12 llega al seleccionado).

Y el mercado **no se desbalanceó**: de todos los saltos de más de un escalón que hoy
entran por la ventana, **cero** pasan por una de las siete competiciones nuevas.

### 24.6 Lo que quedó sin confirmar

Anotado en `OPEN_QUESTIONS_2026_27` (`rosters2026.ts`) y no en un comentario suelto,
porque son datos que el motor modelaría si existieran:

- **MLR** — el límite vigente de extranjeros por plantel en 2026. Hoy no cambia
  nada: el motor no modela cupos de extranjero en ninguna liga (Brasil sí lo tiene
  declarado en prosa: 5 por planilla, con excepción para residentes de +3 años).
- **Portugal** — el campeón de la I Divisão 2025-26 (§24.4).
- **Universitario de EE.UU.** — las reglas de elegibilidad académica. **No se asume
  el modelo NCAA** de "cinco años para cuatro temporadas": cada organización fija
  las suyas y no las tenemos.

---

## 25. Los títulos de selección, que no existían (1.34.0)

Reportado jugando, en una frase: *"nunca me aparecen cuando salgo campeón de algo
con mi selección"*. No era que no se mostraran. **El motor nunca coronaba campeona
a una selección.**

### 25.1 La medición que lo confirmó

200 carreras de uniones tier 1 y 2 (nz, ie, fr, ar, za, gb-eng, it, uy), rama de
academia:

| | |
|---|---|
| Carreras con caps | 174 de 200 |
| Caps disputados | **8.881** |
| Títulos acreditados al jugador | 349 |
| …con `scope: 'national-team'` | **0** |
| …con id de un torneo internacional | **0** |

Casi nueve mil caps y cero títulos de selección.

### 25.2 El enchufe estaba puesto y el cable no

Lo llamativo del agujero es cuánto había construido a su alrededor:

- `data/international-calendar.ts` declaraba **diecinueve trofeos** con nombre,
  jerarquía (`tier`), subconjunto elegible y hasta condición extra (`requires`);
- `CompetitionScope` tenía `'national-team'` desde el primer día;
- y el único lector de `trophies` en todo el repo era un test de forma.

`simulate-season.ts` resolvía campeón en dos lugares —§6a la liga primaria, §6b las
copas— y los dos salen de `participatingCompetitions`, que sólo devuelve
competiciones de CLUB. `NationalTeamResult` devolvía convocatoria, caps, debut,
estado y pérdida de la camiseta; ningún campo de título. Y `TitleWon` tenía
`club: string`, así que un campeón sin club **ni siquiera entraba en la forma**.

### 25.3 Lo que entra

`engine/international-results.ts`, que no inventa reglas: hace para las selecciones
lo mismo que `competition-results.ts` para los clubes —fuerza más ruido seedeado,
orden estable, campo real— y por eso los dos honores se leen igual en la vitrina.

**La fuerza sale de dos ejes que ya existían**: la reputación de la unión (el eje
principal, mide la profundidad del plantel) y el puesto vivo en el ranking mundial
(el matiz, que se mueve solo temporada a temporada).

**El rng se RE-SIEMBRA** desde `semilla:nt-title:torneo:temporada` en vez de
consumir el stream de la carrera, y eso tiene una consecuencia que importa: el
Seis Naciones 2031 lo gana el mismo país para dos carreras distintas de la misma
semilla, jueguen ellas lo que jueguen. **El torneo existe con o sin vos.**

**El título se acredita con la misma regla que el club**: la unión gana por su
cuenta y a vos se te suma sólo si lo jugaste. Para el club el corte son las
apariciones senior; acá es haber sumado al menos un cap esa temporada. Estar en la
lista y no entrar nunca no es haber salido campeón.

`TitleWon` pasa a llevar `club` y `union` **excluyentes** (hay un test que lo
exige): un título de club se muestra con el escudo y uno de selección con la
bandera, y colapsarlos en un string "ganador" obligaría a adivinar cuál es cuál.

### 25.4 Dos calibraciones que salieron de medir, no de opinar

**El alfabeto estaba por repartir campeonatos.** Con el peso de ranking en 1,6 por
puesto, el Seis Naciones daba fr 43%, gb-eng 27%, gb-sct 19%, ie 11% — que es
exactamente el orden alfabético de sus códigos. No era casualidad: las cuatro
tienen la misma reputación, así que su puesto base sale del desempate por código
que `data/nations.ts` documenta como *arbitrario y honesto*, y multiplicarlo por
1,6 por puesto lo convertía en el factor decisivo. Sudamérica igual: Chile 82%,
Uruguay 18%, y la única diferencia entre las dos es que `cl` va antes que `uy`.

Un desempate arbitrario puede ordenar una lista; no puede repartir títulos. El peso
bajó a **0,35**: diez puestos de ranking valen ahora menos que medio escalón de
reputación.

**Argentina no podía ganar nada, y eso no es dificultad: es ausencia.** Con el peso
de reputación en 9, la distancia entre Nueva Zelanda (rep 5) y Argentina (rep 3)
eran 18 puntos contra una dispersión de 5. Medido: 25 carreras argentinas, 1.729
caps, **cero** torneos. Bajó a **7**, con lo que un escalón de reputación vale ~1,2
dispersiones y el favorito gana unas tres veces más seguido que el de un escalón
abajo.

### 25.5 Cómo quedó el reparto

Campeón de 200 ediciones, semillas distintas:

| Torneo | Reparto |
|---|---|
| Seis Naciones | fr 31 · gb-eng 25 · gb-sct 24 · ie 16 · gb-wls 3 · it 2 |
| Rugby Championship | za 49 · nz 45 · au 6 |
| Mundial | nz 29 · za 25 · fr 10 · au 8 · ie 7 · gb-eng 7 · gb-sct 7 · ar 3 · jp 2 · fj 2 |
| Sudamérica | cl 54 · uy 38 · br 6 · py 3 |
| Rugby Europe | ge 35 · es 34 · pt 25 · be 4 · ch 3 · de 2 |

Y en carreras completas (25 por unión), cuántas terminan con al menos un título de
selección: **pt 24/25 · uy 24/25 · gb-eng 21/25 · ie 19/25 · fr 19/25 · za 17/25 ·
nz 16/25 · us 15/25 · it 4/25 · ar 3/25**.

**Argentina sigue siendo el caso más duro de todos los tier 1, y conviene decir por
qué**: es reputación 3 y su torneo anual lo juega contra dos reputación 5, así que
gana el Rugby Championship menos del 1% de las ediciones —los tres títulos que
aparecen en la muestra son Mundiales—. Eso es fiel al deporte (los Pumas nunca
ganaron el Rugby Championship), pero si algún día se quiere mover, la palanca NO es
este archivo: es `UNION_REPUTATION` en `data/nations.ts`, y tocarla mueve además los
umbrales de convocatoria de toda la carrera. Queda anotado y no hecho.

### 25.6 Lo que sigue sin otorgarse

El **Grand Slam** y la **Triple Corona**. Sus condiciones son `win-all` y
`beat-all-home-unions`, o sea que dependen del RESULTADO PARTIDO A PARTIDO: el
motor sabe cuántos tests juega una unión por temporada y no sabe contra quién ni
cómo terminó cada uno. Otorgarlos exigiría generar el fixture de cada edición y
resolver cinco partidos, que es otro trabajo.

Se prefiere no darlos a darlos mal: un Grand Slam sorteado entre los campeones del
Seis Naciones sería un trofeo que dice haber ganado cinco partidos que nunca se
jugaron. `unresolvedTrophies()` los expone y hay un test que comprueba que ninguna
carrera los gana.

Hay además una duplicación anotada y no tocada: la distinción **"Campeón del
Mundo"** existe desde antes y la enciende una FLAG de evento, no el resultado del
Mundial. Ahora que el Mundial se puede ganar de verdad, una misma carrera podría
mostrar el título "Mundial" en la vitrina y la distinción por otro camino. Son dos
cosas distintas por diseño (§ títulos ≠ distinciones) y unificarlas es una decisión
de contenido, no de motor.

### 25.7 Verificado en el navegador

Carrera uruguaya completa: 26 caps, 10 títulos, y la vitrina del retiro muestra

```
TÍTULOS
  Super Rugby Americas ×4
  Sudamérica Rugby Championship ×6
```

con el guardado en `schema: 15` y `engineVersion: 1.34.0`. Un título de selección
también deja de contar para la etapa en el club: un Seis Naciones ganado mientras
jugabas en Benfica ya no se lee como un título de Benfica.

### 25.8 Un test que medía tres semillas y no lo que decía medir

Los títulos de selección suman moral y fama, así que la carrera lee otra parte del
stream — y eso puso en rojo un test que no tiene nada que ver con ellos: *"los modos
largos piden bastantes menos decisiones"*. La media daba **0,81 contra un umbral de
0,80**, o sea que se rompía por UNA decisión de diferencia en UNO de sus tres casos.

Se comprobó que era eso y no otra cosa desactivando la acreditación de títulos con
una línea: con ella apagada el test pasaba, con ella encendida fallaba.

La corrección NO fue aflojar el umbral. Medido sobre **40 carreras** (cinco puestos
× seis países × las dos ramas), exprés pide menos decisiones por temporada en **40
de 40** y la media es **0,754**: la propiedad es sólida y lo frágil era la muestra.
Se agrandó la muestra —la misma decisión que ya se había tomado en el test de
apariciones de desarrollo— y se agregó un invariante que antes no existía: ninguna
carrera puede pedir MÁS decisiones por temporada en exprés que en intensa.

Un umbral que se rompe con cualquier cambio de stream no está midiendo el ritmo.
