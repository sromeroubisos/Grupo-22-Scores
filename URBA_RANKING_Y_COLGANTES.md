# URBA — el ranking y todo lo que cuelga de `matches`

Criterio: **un partido de URBA tiene que producir exactamente los mismos efectos
que uno cargado a mano.** Se cumple, y está medido. Lo que apareció es otra cosa:
un bug propio del ranking, y 7 partidos donde el fixture manual estaba mal.

---

## a) Qué se llevó el CASCADE

`club_ranking_match_applications.match_id` es **ON DELETE CASCADE**; los tres
punteros (`stale_from_match_id`, `last_incremental_match_id`,
`last_applied_match_id`) son **ON DELETE SET NULL**.

| | |
|---|---:|
| partidos borrados | 1.256 |
| de esos, **elegibles para el ranking** | **231** |
| aplicaciones que quedaron tras el borrado | 570 |
| **aplicaciones apuntando a un partido inexistente** | **0** |
| entradas con `last_applied_match_id` roto | **0** |

**No quedaron punteros rotos.** Los FK hicieron su trabajo: el CASCADE se llevó
las 231 aplicaciones y el SET NULL vació los punteros sin dejar nada colgando.

La inconsistencia era otra, y más silenciosa: el ranking tenía 570 aplicaciones
que ya no describían el conjunto de partidos de la base — le faltaban las 231 que
se borraron y no sabía de las 231 nuevas.

---

## b) Cómo se alimenta

**Un solo disparador:** `FixtureService.updateMatch` →
`syncClubRankingsForMatchUpdate(matchId, previousMatch)`.

- Partido nuevo, todavía no aplicado → **incremental**, se agrega al final.
- Partido ya aplicado que cambió → **no recalcula en el request**: marca el
  ranking stale con un write barato y el cron `/api/cron/rebuild-stale-rankings`
  (cada 2 minutos) hace el rebuild completo. Es el arreglo del cuello de edición.
- El rebuild completo resetea todo a `initial_rating`, **borra todas** las
  aplicaciones del ranking y re-aplica los partidos elegibles en orden de fecha.

**Mi carga masiva entró por PostgREST, no por `FixtureService`, así que nunca
disparó nada.** Ni la carga de los 10.917 ni el borrado de los 1.256.

---

## c) Con qué condiciones elige los partidos

Consulta (`listEligibleSeasonMatches`) más filtro por partido
(`isRankingEligibleForMatch`):

| | condición |
|---|---|
| 1 | `status = 'final'` |
| 2 | `date_time` dentro del año de `results_season` (2026) |
| 3 | **ambos** clubes entre las entradas activas del ranking (151 designados) |
| 4 | el deporte del partido coincide con el del ranking (`matches.sport_id`, o el del torneo) |
| 5 | el score se puede parsear |

**Lo que NO mira: `is_visible`, `review_status`, `external_id`, la unión, si el
torneo es visible, ni `phase_id`.**

Por eso un partido de URBA entra igual que uno cargado a mano: el ranking no tiene
forma de distinguirlos. De los 6.198 finales de URBA, **entran 231** — los que
tienen los dos clubes entre los 151 designados.

Que estén con `is_visible = false` **no los excluye**. Conviene saberlo: la
visibilidad no es un freno para el ranking.

---

## d) El bug: el ranking llevaba 18 días stale y el cron no lo veía

```ts
.not('stale_from_match_id', 'is', null)   // <- el criterio de "pendiente"
```

`stale_from_match_id` es una **FK a `matches` con ON DELETE SET NULL**. Si se
borra el partido que dejó el ranking sucio, el puntero se vacía solo y el ranking
**desaparece de esa consulta sin haberse reconstruido**: sigue stale, con su fecha
y su motivo intactos, pero el cron ya no lo levanta.

Estado que encontré:

```
stale_from_match_id       : NULL
stale_from_match_date     : 2026-07-18T18:30:00+00:00
stale_reason              : "Se guardo un partido anterior al ultimo resultado
                             aplicado; requiere recalculo…"
```

**Stale desde el 2026-07-18, y hoy es 2026-08-05.** Dieciocho días sin recalcular.

Arreglado en `rebuildStaleClubRankings`: el criterio ahora mira los tres
marcadores, no sólo el puntero.

```ts
.or('stale_from_match_id.not.is.null,stale_from_match_date.not.is.null,stale_reason.not.is.null')
```

`markRankingStale` escribe los tres y el rebuild los limpia los tres, así que
cualquiera alcanza como señal. `tsc` limpio, 63 tests en verde.

---

## e) Las otras tablas

| tabla | columna | FK | filas | rotas | a partidos de URBA |
|---|---|---|---:|---:|---:|
| `club_trainings` | `source_match_id` | SET NULL | 6 | **0** | 0 |
| `user_notifications` | `match_id` | **CASCADE** | 16.280 | **0** | 0 |
| `club_rugby_performance_records` | — | — | **0** | — | — |

- `club_trainings`: 6 filas, todas con su partido vivo. Ninguna apuntaba a los
  borrados.
- `user_notifications`: CASCADE, así que las de los 1.256 se fueron con ellos. No
  quedó ninguna huérfana. Ninguna apunta a un partido de URBA — se crean cuando la
  app notifica, y una carga por PostgREST no notifica a nadie.
- `club_rugby_performance_records`: **la tabla está vacía y no tiene columna de
  partido**. No la afecta nada.

`match_events` sigue en 2.757, intacta: los 8 torneos no tenían un solo evento.

---

## El recálculo

Corrido por el camino real del cron (`rebuildStaleClubRankings`), no por un atajo.
**545 segundos** — el cuello conocido de round-trips seriales.

| | antes | después |
|---|---:|---:|
| aplicaciones | 570 | **824** |
| de URBA | 0 | **231** |
| a mano | 570 | 593 |
| huérfanas | 0 | **0** |
| stale | 2026-07-18 | **limpio** |

**824 aplicaciones == 824 partidos elegibles en la base.** Consistencia exacta.

### Los primeros 20

| # | club | pos | rating | Δ |
|---:|---|---|---|---:|
| 1 | Newman | 1 → 1 | 95,59 → 95,37 | −0,22 |
| 2 | Jockey C. Córdoba | 2 → 2 | 92,03 → 92,83 | +0,80 |
| 3 | Tala R.C. | 3 → 3 | 89,26 → 89,69 | +0,44 |
| 4 | C.A.S.I. | 5 → 4 | 86,32 → 87,09 | +0,77 |
| 5 | Duendes | 4 → 5 | 87,74 → 86,87 | −0,87 |
| 6 | Jockey C. Rosario | 7 → 6 | 85,86 → 86,79 | +0,94 |
| 7 | Natación y Gimnasia | 6 → 7 | 86,24 → 86,29 | +0,05 |
| 8 | Alumni | 10 → 8 | 84,48 → 86,01 | +1,54 |
| 9 | C.A.E. Paraná | 9 → 9 | 84,49 → 84,55 | +0,06 |
| 10 | S.I.C. | 8 → 10 | 85,25 → 83,73 | −1,52 |
| 11 | **Marista R.C.** | **18 → 11** | 80,42 → 83,59 | **+3,17** |
| 12 | Tucumán R.C. | 11 → 12 | 84,35 → 83,59 | −0,77 |
| 13 | Belgrano A.C. | 14 → 13 | 82,40 → 82,78 | +0,38 |
| 14 | Los Tilos | 16 → 14 | 81,82 → 82,31 | +0,49 |
| 15 | Hindú | 15 → 15 | 82,29 → 81,79 | −0,50 |
| 16 | La Tablada | 12 → 16 | 83,64 → 81,56 | −2,08 |
| 17 | G.E.R. | 19 → 17 | 80,41 → 80,55 | +0,13 |
| 18 | Tucumán L.T.C. | 24 → 18 | 78,80 → 79,86 | +1,07 |
| 19 | Regatas Bella Vista | 21 → 19 | 79,50 → 79,85 | +0,35 |
| 20 | **Los Tordos** | **13 → 20** | 82,86 → 79,58 | **−3,28** |

### Por qué se movieron — y no es por URBA

93 de 151 clubes cambiaron de rating. **66 de esos 93 no tienen una sola
aplicación de URBA**, incluidos los dos que más se movieron:

| club | Δ | apps de URBA | apps a mano |
|---|---:|---:|---:|
| Los Tordos | −3,28 | **0** | 15 |
| Marista R.C. | +3,17 | **0** | 17 |
| U.N.S.J. | +2,65 | **0** | 18 |
| Liceo R.C. | −2,44 | **0** | 15 |
| La Tablada | −2,08 | **0** | 18 |

**El grueso del movimiento es el ranking poniéndose al día después de 18 días
stale, no la carga de URBA.** Los Tordos y Marista son de Mendoza y Rosario: no
juegan un solo partido de la URBA. Se movieron porque sus resultados posteriores
al 18 de julio nunca se habían aplicado.

Sólo **28 clubes** tienen alguna aplicación de URBA, y 27 de ellos cambiaron.

---

## La prueba de paridad

Los 231 partidos de URBA que entraron reemplazan a los 231 manuales que se
borraron. Comparados por (día en hora de Buenos Aires, local, visitante,
resultado):

| | |
|---|---:|
| **idénticos** | **224** |
| distintos | 7 |

Los 7 no son ambigüedad del emparejamiento: **son datos distintos**, y en los 7 el
fixture manual estaba mal.

**Seis con el resultado equivocado:**

| día | partido | manual | URBA |
|---|---|---|---|
| 04-11 | Buenos Aires C&RC vs Hindú | 12-**38** | 12-**34** |
| 06-06 | Los Matreros vs Buenos Aires C&RC | 26-**34** | 26-**36** |
| 07-18 | CUBA vs Hindú | **18**-26 | **16**-26 |
| 04-11 | San Albano vs Curupaytí | 31-**36** | 31-**39** |
| 05-23 | Hurling vs San Luis | 17-**20** | 17-**29** |
| 07-11 | Pueyrredón vs Lomas Athletic | 20-**45** | 20-**47** |

**Uno con local y visitante invertidos:**

| día | manual | URBA |
|---|---|---|
| 04-18 | San Albano 17-27 Lomas Athletic | **Lomas Athletic 27-17 San Albano** |

Ese importa más de lo que parece: el algoritmo tiene `home_advantage = 3`, así que
invertir los lados cambia el delta que reparte, no sólo la presentación.

En los 7 casos manda URBA — es la API de la unión, y la verificación de posiciones
ya probó que sus datos reproducen exactamente las tablas oficiales de los 8
torneos. O sea: **el fixture manual tenía 6 resultados mal cargados y 1 partido
invertido sobre 231, y la carga los corrigió.**

---

## Conclusión sobre el criterio

**Ningún sistema trata distinto a un partido de URBA.** El ranking no mira
`external_id` ni `is_visible`; `club_trainings`, `user_notifications` y
`club_rugby_performance_records` tampoco. Los 224 partidos idénticos producen
exactamente el mismo efecto, y los 7 que difieren lo hacen porque el dato manual
estaba equivocado.

Lo que sí hay que saber, y no es un bug sino una consecuencia:

- **Cargar por PostgREST no dispara nada.** `FixtureService.updateMatch` es el
  único camino que marca stale o aplica incremental. Cualquier carga masiva futura
  tiene que marcar el ranking stale a mano, o pasar por el servicio.
- **`is_visible = false` no excluye del ranking.** Los 231 ya están contando
  aunque los partidos no se vean en el sitio.
