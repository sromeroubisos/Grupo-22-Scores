# El `club_id` 14 de URBA: dos clubes, un id

Hay un caso especial en la derivación del triple de equipo
(`corregirUrbaClubId` en [externalId.ts](../src/lib/integrations/urba/externalId.ts)).
Este documento es el porqué, con las mediciones que lo sostienen.

**El hecho:** entre 2021 y 2023, URBA publicó los equipos de **San Andrés** con
el `club_id` de **San Albano** (el 14). Desde 2024 San Andrés tiene su propio id,
el 31, y el error no se repite.

**Por qué importa:** el triple `(club_id, categoría, sufijo)` es la única
identidad estable de un equipo de URBA. Si el `club_id` está mal, el partido se
escribe bajo el club equivocado **sin que falle nada**. Medido: 553 partidos de
San Andrés se habrían cargado como San Albano, y sólo 13 fallaban de forma
visible — los cruces directos entre ambos, que caen por "mismo equipo de los dos
lados". Los otros 553 entraban en silencio, y el motor de posiciones los sumaba
en la fila de San Albano. Es el mismo modo de falla que los tres equipos de
Newman en un mismo torneo.

---

## Las cinco pruebas

La duda razonable no era *si* había un error —dos nombres bajo un id lo prueban—
sino **cuál de los dos nombres es el intruso**. Estas cinco lo contestan, y las
cinco apuntan al mismo lado.

### 1. El id 31 no existe antes de 2024

Torneos con al menos un equipo de cada id, sobre los 811 payloads en caché:

| club_id | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---:|---:|---:|---:|---:|---:|
| **31** (San Andrés) | 0 | 0 | 0 | 22 | 27 | 27 |
| **14** (San Albano) | 27 | 31 | 30 | 23 | 24 | 21 |

Contando equipos en vez de torneos, la continuidad se ve mejor:

| año | id 14 llamado "San Albano" | id 14 llamado "San Andres" | id 31 | total San Andrés |
|---|---:|---:|---:|---:|
| 2021 | 11 | 16 | 0 | 16 |
| 2022 | 19 | 18 | 0 | 18 |
| 2023 | 18 | 19 | 0 | 19 |
| 2024 | 23 | **0** | 22 | 22 |
| 2025 | 24 | **0** | 27 | 27 |
| 2026 | 21 | **0** | 27 | 27 |

San Andrés no se interrumpe (16 · 18 · 19 · 22 · 27 · 27). Lo que cambia en 2024
es el id, no el club. Y "San Andres" bajo el 14 cae a cero el mismo año.

### 2. Los dos nombres conviven, y juegan entre ellos

**13 torneos de 2022-2023 tienen los dos nombres bajo el mismo `club_id` 14**,
como planteles separados y en la misma zona:

| año | torneo | fecha | partido |
|---|---|---|---|
| 2022 | M15 G2 Zona C 2ª rueda | 25-09 | San Albano A **12 - 29** San Andres A |
| 2022 | M15 G2 Zona C Eq. B | 25-09 | San Albano B **36 - 21** San Andres B |
| 2022 | M16 G2 Intermedia 2ª rueda | 25-09 | San Andres A **38 - 26** San Albano A |
| 2022 | M16 G2 Intermedia Eq. B | 25-09 | San Andres B **19 - 24** San Albano B |
| 2022 | M17 G2 Zona C Eq. A | 12-06 | San Albano A **7 - 24** San Andres A |
| 2022 | M17 G2 Zona C Eq. B | 12-06 | San Albano B **31 - 19** San Andres B |
| 2023 | M15 G2 Zona B | 16-04 | San Albano A **14 - 28** San Andres A |
| 2023 | M15 G2 Zona B Eq. B | 16-04 | San Albano B **17 - 40** San Andres B |
| 2023 | M16 G2 Zona C | 02-04 | San Albano A **7 - 59** San Andres A |
| 2023 | M17 G2 Zona B | 02-04 | San Albano A **17 - 26** San Andres A |
| 2023 | M17 G2 Zona B Eq. B | 02-04 | San Albano B **22 - 14** San Andres B |
| 2023 | M19 G2 N2 Desarrollo Eq. B | 17-09 | San Albano B **50 - 21** San Andres B |
| 2023 | M19 G2 N2 Desarrollo 2ª rueda | 17-09 | San Albano A **38 - 35** San Andres A |

Un club no puede tener dos equipos "A" en la misma zona jugando entre sí. Es
error seguro. En otros 40 torneos aparece "San Andres" bajo el 14 sin San Albano
al lado.

### 3. Partidos concretos, contrastables contra el sitio público

```
torneo urba:2021116 · Primera B - Superior 2021
  partido urba:202111604 · Fecha 1 · 31-07-2021
     San Andres [id 14]     26 - 19   Ciudad de Bs.As.

torneo urba:2022034 · M15 G2 Zona C 2ª rueda 2022
  partido urba:2022034029 · Fecha 6 · 25-09-2022
     San Albano A [id 14]   12 - 29   San Andres A [id 14]

torneo urba:2023093 · M19 G2 Nivel 2 Desarrollo 2ª rueda 2023
  partido urba:2023093033 · Fecha 7 · 17-09-2023
     San Albano A [id 14]   38 - 35   San Andres A [id 14]
```

### 4. La inconsistencia está adentro del mismo registro

URBA sirve **un solo** objeto `club` por id — no hay dos escudos:

```
id 14 → { name: "San Albano", image_uri: "img/clubs/sanalbano.png" }
id 31 → { name: "San Andres", image_uri: "img/clubs/sanandres.png" }
```

Lo que prueba el error es que el equipo se llama de un modo y trae colgado el
club del otro:

```json
{ "id": 202203306, "name": "San Andres B", "club_id": 14,
  "club": { "id": 14, "name": "San Albano", "image_uri": "img/clubs/sanalbano.png" } }
```

En el sitio de URBA ese equipo sale con el nombre San Andrés y el escudo de San
Albano.

### 5. La continuidad de división, que es la concluyente

En qué división de mayores juega la primera de cada club, año a año:

| equipo | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|
| San Albano (id 14) | Primera A | Primera A | Primera A | Primera A | Primera A | Primera A |
| San Andres (id 14) | Primera B | Primera B | Primera B | — | — | — |
| San Andres (id 31) | — | — | — | Primera B | Primera A | Primera A |

La línea de Primera B pasa de un id al otro sin cortarse. San Albano no se mueve
de Primera A en seis años.

**Si la corrección estuviera al revés**, San Albano habría tenido dos primeros
equipos a la vez —uno en Primera A y otro en Primera B— durante tres años, y
habría abandonado Primera B justo en 2024, el año en que San Andrés aparece ahí.
No se sostiene.

---

## Que no haya un segundo caso

El barrido cubre los 811 payloads. De los **153 `club_id` distintos, 44 aparecen
con más de un nombre**, y **43 son variantes de escritura del mismo club**:

```
club_id 7  → "Belgrano Athletic" / "Belgrano Athl."
club_id 62 → "Tiro Federal de San Pedro" / "T.F. de San Pedro" / "Tiro F San Pedro" …
club_id 91 → "Municipalidad de Berazategui" / "Munic. de Berazategui" / "Munc de Berazategui"
```

Esas son inofensivas: el nombre no entra en el triple, sólo el `club_id` y el
sufijo. **Queda uno solo donde los dos nombres son instituciones distintas: el
14.** Por eso la corrección es una tabla de una entrada y no una heurística.

Para rehacer el barrido: agrupar `teams[].club_id` de los 811 payloads y listar
los que tienen más de un nombre normalizado (sin acentos, sin el sufijo de
equipo A-H).

---

## Qué se reparó en la base

La corrección del conector hace que los triples pidan el 31. Seis de ellos no
existían en `club_external_ids`, porque el mapeo se había generado del dato malo.
Lo aplicó [urba-san-andres-fix.ts](../src/scripts/urba-san-andres-fix.ts), con
rollback en `URBA_SAN_ANDRES_ROLLBACK.sql`. Ninguno de los registros tocados
tenía partidos ni participantes colgando — se verificó antes de escribir.

**Renombrados (3)** — el triple `14|…` lo usó SÓLO San Andrés, así que el
registro era suyo y estaba mal nombrado:

| antes | después | triple |
|---|---|---|
| `san-albano-m19` | `san-andres-m19` | `14\|M19\|` → `31\|M19\|` |
| `san-albano-m20-a` | `san-andres-m20-a` | `14\|M20\|A` → `31\|M20\|A` |
| `san-albano-m20-b` | `san-andres-m20-b` | `14\|M20\|B` → `31\|M20\|B` |

**Retirado (1)** — también era sólo de San Andrés, pero el registro correcto ya
existía y estaba en uso, así que éste era un duplicado del dato malo:

| registro | triple | por qué |
|---|---|---|
| `san-albano-m15-c` | `14\|M15\|C` | `san-andres-m15-c` ya existe, con 17 partidos de 2026 |

**Creados (3)** — acá el triple lo usaron LOS DOS clubes: San Albano puso un
equipo de verdad, así que su registro se queda y San Andrés necesitaba uno propio:

| registro nuevo | triple | compartido en |
|---|---|---|
| `san-andres-m15` | `31\|M15\|` | 2022 |
| `san-andres-m18-a` | `31\|M18\|A` | 2021 |
| `san-andres-m18-b` | `31\|M18\|B` | 2021 |

Después de esto, la corrida en seco del histórico pasa de 6 triples sin mapeo y
72 partidos perdidos a **0 y 0**, y los 13 "mismo equipo de los dos lados"
desaparecen: ahora resuelven a clubes distintos, que es lo que son.

---

## Si mañana aparece otro caso

No agregues una heurística. `CLUB_ID_CORREGIDO` es una tabla de datos a propósito:
una corrección por parecido de nombre reasignaría equipos legítimos, y ese daño es
peor y más difícil de ver que el que vino a arreglar. `Atlético San Andrés` es un
club distinto de `San Andrés`, con su propio id (75), y está cubierto por un test
en [clubIdCorregido.test.ts](../src/lib/integrations/urba/clubIdCorregido.test.ts)
justamente porque un `contains` se lo llevaría puesto.

El camino es: correr el barrido, confirmar con las cinco pruebas de arriba de qué
lado está el error, agregar la entrada a la tabla y su test.
