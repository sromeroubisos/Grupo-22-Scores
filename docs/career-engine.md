# Motor de "Carrera de Rugby" — cómo funciona hoy

Estado del motor al cerrar la **Fase 0** (reconocimiento). Este documento
describe lo que el código **hace**, no lo que se quiere que haga. Si algo acá no
coincide con `src/features/career/`, gana el código y hay que corregir el
documento.

Versiones selladas en este momento:

| Constante | Valor | Dónde |
|---|---|---|
| `ENGINE_VERSION` | `1.6.0` | `types/career.ts` |
| `SCHEMA` (guardado) | `6` | `carrera-rugby/careerStorage.ts` |
| `CLUB_CATALOG_VERSION` | `2026-27.6` | `data/clubs.ts` |
| `SA_SNAPSHOT_VERSION` | `464399ffada4` | `data/clubs2026/saClubs.generated.ts` |
| `NATIONS_VERSION` | `2026-07.2` | `data/nations.ts` |
| `COMPETITION_LEVELS_VERSION` | `2026-27.1` | `data/competition-levels2026.ts` |
| `CAREER_ENVIRONMENT_VERSION` | `2026-27.2` | `engine/environment.ts` |
| `TRANSFER_RULES_VERSION` | `2026-07.3` | `engine/market-routes.ts` |
| `CAREER_MARKET_VERSION` | `2026-27.1` | `engine/event-selector.ts` |

Contenido: **61 eventos** declarativos (club 8, entorno 10, lesiones 6, medios 7,
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
  └─ resolveAndPlay()
       ├─ applyDecision()         solo si había evento pendiente
       ├─ simulateSeason()        LA temporada
       └─ shouldRetire() ? phase='retired' : beginSeason()
```

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

`selectEvent(state, rng)` (`engine/event-selector.ts`):

1. **El mercado es una fase, no un evento raro.** Se evalúa **todas** las
   temporadas (`marketEvaluatedSeason`). El cooldown está anclado en un **pase
   real** (`lastMoveSeason`), no en "vi una oferta": rechazar no silencia el
   mercado, solo mudarse lo frena (`MARKET_COOLDOWN_SEASONS = 2`).
   Si hay ofertas, `surfaceMarketProbability` decide si aparece la decisión: sube
   con la chance de subir de banda, profesionalizarse o entrar a una academia
   joven, y con la incomodidad (suplente, moral baja); baja para el titular feliz.
2. Si no hubo mercado, con probabilidad `SEASON_EVENT_PROB = 0.82` se elige un
   **evento estático** del pool elegible, ponderado por `weight`, con penalización
   ×0.35 si se vio recientemente. Puede no haber evento: temporada sin decisión.

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

> **Las rutas pro miran el país entero, no solo la escalera doméstica.** La
> pirámide `sa-ar` es íntegramente amateur: el profesionalismo argentino vive en
> Super Rugby Americas, que el catálogo marca como `countryCode: 'multi'`.
> `NATIONAL_FRANCHISES` (market-routes.ts) declara qué franquicias representan a
> qué país. Sin eso, un "profesional argentino" degradaba a amateur.

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

### Digest congelado — línea de base del motor 1.6.0

Con el `rotatingChooser` del test (opción elegida por
`hashSeed(eventId:temporada) % nOpciones`), una ruta distinta en cada caso:

| Caso | Ruta | Semilla | Temporadas | Retiro | OVR pico | Caps | Clubes | Empleo final |
|---|---|---|---|---|---|---|---|---|
| Apertura argentino | amateur | 20260726 | 16 | 36 | **55** | 0 | 4 | Compensado |
| Pilar neozelandés | profesional | 424242 | 19 | 37 | **80** | 59 | 1 | Profesional |
| Wing francés | desarrollo | 7919 | 14 | 33 | **66** | 11 | 4 | Profesional |

> Sirve además como **calibración real del techo de OVR** para las bandas de
> color de la Fase 4: una carrera amateur pica cerca de 55-60 y una profesional
> cerca de 75-80. Las bandas de Copero (85+ dorado) no aplican acá.

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
