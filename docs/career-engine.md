# Motor de "Carrera de Rugby" — cómo funciona hoy

Estado del motor al cerrar la **Fase 0** (reconocimiento). Este documento
describe lo que el código **hace**, no lo que se quiere que haga. Si algo acá no
coincide con `src/features/career/`, gana el código y hay que corregir el
documento.

Versiones selladas en este momento:

| Constante | Valor | Dónde |
|---|---|---|
| `ENGINE_VERSION` | `1.10.0` | `types/career.ts` |
| `SCHEMA` (guardado) | `7` | `carrera-rugby/careerStorage.ts` |
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

### Digest congelado — línea de base del motor 1.10.0

Con el `rotatingChooser` del test (opción elegida por
`hashSeed(eventId:temporada) % nOpciones`), una ruta distinta en cada caso:

| Caso | Ruta | Semilla | Temporadas | Retiro | OVR pico | Techo | Caps | Clubes | Arquetipo |
|---|---|---|---|---|---|---|---|---|---|
| Apertura argentino | amateur | 20260726 | 14 | 34 | **57** | 63 | 0 | 3 | Amateur de ley |
| Pilar neozelandés | profesional | 424242 | 21 | 39 | **77** | **77** | 76 | 2 | Emblema de la selección |
| Wing francés | desarrollo | 7919 | 14 | 33 | **63** | 63 | 11 | 4 | Guerrero |

> El pilar cierra con OVR pico 77 y techo declarado 77, y el wing 63 sobre 63:
> desde 1.9.0 el potencial es un número que la carrera **alcanza** (ver §11).

> Sirve además como **calibración real del techo de OVR**: una carrera amateur
> pica cerca de 55-60 y una profesional cerca de 70-77. Las bandas de color de
> Copero (85+ dorado) no aplican acá.

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
