# Los dos desplegables — medición sobre los 811 torneos

No se escribió nada. Los 134 de 2026 salen de la base tal como están hoy;
los 677 de 2021-2025, con los valores que les daría la carga histórica.

Total: **811** · de la base 811 · derivados 0


## b) Temporadas — ¿la clave se sostiene entre años?

Clave: `(category, subcategory, age_grade, gender)`.

| | |
|---|---:|
| **claves distintas** | **60** |
| torneos | 811 |
| torneos por clave (promedio) | 13.5 |

### En cuántos años existe cada clave

| años en los que aparece | claves | torneos que caen ahí |
|---:|---:|---:|
| 6 | 22 | 467 |
| 5 | 14 | 221 |
| 4 | 3 | 14 |
| 3 | 5 | 36 |
| 2 | 6 | 19 |
| 1 | 10 | 54 |

**54 torneos (7%) caen en una clave que existe en un solo año.**
Para esos, el desplegable de temporadas tendría un solo item: el año en el
que ya estás.


### Mayores contra juveniles

| grupo | torneos | claves | claves en 1 solo año | torneos sin temporadas para elegir |
|---|---:|---:|---:|---:|
| mayores | 254 | 41 | 7 | **7** (3%) |
| juveniles (M15-M22) | 557 | 19 | 3 | **47** (8%) |

### Las claves que más años cubren

| clave `category ǀ subcategory ǀ age_grade ǀ gender` | años | torneos |
|---|---|---:|
| `otro|juvenil|M15|masculino` | 2021 2022 2023 2024 2025 2026 | 84 |
| `otro|juvenil|M16|masculino` | 2021 2022 2023 2024 2025 2026 | 82 |
| `otro|juvenil|M17|masculino` | 2021 2022 2023 2024 2025 2026 | 78 |
| `Femenino|∅|mayores|femenino` | 2021 2022 2023 2024 2025 2026 | 28 |
| `Formativo|juvenil|M17|masculino` | 2021 2022 2023 2024 2025 2026 | 27 |
| `Universitario|∅|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 22 |
| `Formativo|juvenil|M15|masculino` | 2021 2022 2023 2024 2025 2026 | 21 |
| `Formativo|juvenil|M16|masculino` | 2021 2022 2023 2024 2025 2026 | 19 |
| `Top|Superior|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 11 |
| `Top|Intermedia|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 10 |
| `Top|Preintermedia B|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 10 |
| `Desarrollo|Intermedia|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 8 |
| `Desarrollo|Superior|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 8 |
| `Primera A|Superior|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 8 |
| `Primera B|Superior|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 7 |
| `Primera C|Superior|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 7 |
| `Segunda|Superior|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 7 |
| `Primera A|Preintermedia B|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 6 |
| `Primera B|Intermedia|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 6 |
| `Primera C|Intermedia|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 6 |
| `Tercera|Superior|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 6 |
| `Tercera|Intermedia|mayores|masculino` | 2021 2022 2023 2024 2025 2026 | 6 |
| `otro|juvenil|M19|masculino` | 2022 2023 2024 2025 2026 | 78 |
| `Formativo|juvenil|M19|masculino` | 2022 2023 2024 2025 2026 | 27 |
| `Desarrollo|juvenil|M19|masculino` | 2022 2023 2024 2025 2026 | 19 |

### La máxima categoría, y por qué hizo falta `competitionKey`

Medido con las columnas CRUDAS —sin normalizar nada— mayores salía **menos**
estable que juveniles: 57 claves, 25 en un solo año, 40 torneos (16%) sin
temporadas. La causa no era el histórico sucio:
**la máxima categoría de URBA cambia de nombre con su tamaño.**

| año | cómo se llama la máxima |
|---|---|
| 2021 | Top 12 |
| 2022 | Top 13 |
| 2023 | Top 12 |
| 2024 | Top 12 |
| 2025 | Top 12 |
| 2026 | Top 14 |

Es UNA sola competencia —la Superior de la máxima— y la clave cruda la partía
en tres: parado en el Top 14 de 2026 el desplegable no ofrecía ningún año,
aunque hubiera cinco de la misma competencia debajo.

`competitionKey` colapsa `Top 12` / `Top 13` / `Top 14` a `Top` —y sólo esas,
las que llevan el tamaño en el nombre; `Primera A` y `Primera B` siguen
separadas porque son divisiones distintas de verdad—, además de normalizar
la grafía de `age_grade` y el `gender` en NULL. El efecto, medido:

| | con las columnas crudas | con `competitionKey` |
|---|---:|---:|
| claves distintas | 79 | 60 |
| torneos sin temporadas para elegir | 92 (11%) | 54 (7%) |
| de mayores | 40 (16%) | ver la tabla de arriba |

| | |
|---|---:|
| claves de mayores en un solo año | 7 de 41 |
| **de ésas, las que son Top 12 / 13 / 14** | **0** |
| el resto | 7 |

Juveniles da más "estable" por el motivo contrario, y tampoco es bueno: sus
claves son TAN gruesas que una sola (`otro ǀ juvenil ǀ M15 ǀ masculino`) se
come 84 torneos de los 6 años. Elegir "2024" ahí no te lleva a un torneo:
te lleva a dieciséis.


### Claves de un solo año, por age_grade

| age_grade | claves de 1 año | torneos |
|---|---:|---:|
| M18 | 2 | 31 |
| M20 | 1 | 16 |
| mayores | 7 | 7 |

### Los torneos que rompen la clave por su propia forma

No es un problema del histórico: son torneos que ya existían en G22 antes de
URBA y que la carga vinculó en vez de crear. Traen `age_grade` con otra
grafía y `gender` en NULL, así que caen en una clave propia y quedan solos.

| external_id | nombre | category | subcategory | age_grade | gender |
|---|---|---|---|---|---|

**0 torneos.** Normalizarlos es un UPDATE de dos columnas y los
devuelve a la clave de sus hermanos.


## a) Tipo de torneo — el desplegable de grados

Clave: `(season_id, category, age_grade, gender)`; los hermanos se
distinguen por `subcategory`.

El menú sólo sirve si los hermanos tienen grados **DISTINTOS**. Contar
hermanos infla el número: una división juvenil tiene 28 torneos y los 28
dicen `juvenil`, así que el desplegable listaría 28 veces la misma palabra.

| | |
|---|---:|
| divisiones (grupos) | 145 |
| divisiones con **más de un grado distinto** | 41 |
| **torneos con desplegable ÚTIL** | **174** |
| torneos con hermanos pero TODOS del mismo grado | 546 |
| torneos con `subcategory` NULL (sin desplegable, a propósito) | 77 |
| torneos sin hermanos | 14 |

### Dónde sirve y dónde no

| grupo | torneos | con desplegable útil | colapsados en un solo grado | NULL |
|---|---:|---:|---:|---:|
| mayores | 254 | **174** | 0 | 77 |
| juveniles (M15-M22) | 557 | **0** | 546 | 0 |

### Las divisiones con más grados distintos

| año · category · age_grade · gender | grados distintos |
|---|---|
| `2026|Top|mayores|masculino` | Intermedia · Preintermedia · Preintermedia B · Preintermedia C · Preintermedia D · Preintermedia E · Preintermedia F · Superior |
| `2025|Top|mayores|masculino` | Intermedia · Preintermedia A · Preintermedia B · Preintermedia C · Preintermedia D · Preintermedia E · Superior |
| `2022|Top|mayores|masculino` | Intermedia · Preintermedia A · Preintermedia B · Preintermedia C · Preintermedia D · Superior |
| `2023|Top|mayores|masculino` | Intermedia · Preintermedia A · Preintermedia B · Preintermedia C · Preintermedia D · Superior |
| `2024|Top|mayores|masculino` | Intermedia · Preintermedia A · Preintermedia B · Preintermedia C · Preintermedia D · Superior |
| `2024|Primera A|mayores|masculino` | Intermedia · Preintermedia · Preintermedia A · Preintermedia B · Preintermedia C · Superior |
| `2025|Primera A|mayores|masculino` | Intermedia · Preintermedia A · Preintermedia B · Preintermedia C · Preintermedia D · Superior |
| `2026|Primera A|mayores|masculino` | Intermedia · Preintermedia · Preintermedia B · Preintermedia C · Preintermedia D · Superior |
| `2023|Primera A|mayores|masculino` | Intermedia · Preintermedia A · Preintermedia B · Preintermedia C · Superior |
| `2026|Primera B|mayores|masculino` | Intermedia · Preintermedia · Preintermedia B · Preintermedia C · Superior |
| `2021|Top|mayores|masculino` | Intermedia · Preintermedia · Preintermedia B · Superior |
| `2022|Primera A|mayores|masculino` | Intermedia · Preintermedia A · Preintermedia B · Superior |

### Las divisiones que colapsan en un solo grado

Acá el desplegable no distingue nada: el eje que separa a estos torneos es
Grupo / Zona / Nivel, que no tiene columna. La identidad sigue siendo el
nombre completo.

| año · category · age_grade · gender | torneos | único grado | ejemplo de nombres |
|---|---:|---|---|
| `2021|otro|M18|masculino` | 28 | juvenil | Menores de 18 - Grupo 1 - Zona A - Prime · Menores de 18 - Grupo 1 - Zona A - Segun · Menores de 18 - Grupo 1 - Zona B - Prime … |
| `2021|otro|M16|masculino` | 23 | juvenil | Menores de 16 - Grupo 1 - Zona A - Segun · Menores de 16 - Grupo 1 - Zona B - Segun · Menores de 16 - Grupo 1 - Zona C - Prime … |
| `2022|otro|M19|masculino` | 17 | juvenil | Menores de 19 - Grupo 1 - Ganadores - Se · Menores de 19 - Grupo 1 - Zona A · Menores de 19 - Grupo 1 - Zona B … |
| `2021|otro|M17|masculino` | 16 | juvenil | Menores de 17 - Grupo 1 - Zona A - Prime · Menores de 17 - Grupo 1 - Zona A - Segun · Menores de 17 - Grupo 1 - Zona B - Prime … |
| `2021|otro|M20|masculino` | 16 | juvenil | Menores de 20 - Grupo 1 - Zona A - Prime · Menores de 20 - Grupo 1 - Zona A - Segun · Menores de 20 - Grupo 1 - Zona B … |
| `2022|otro|M15|masculino` | 16 | juvenil | Menores de 15 - Grupo 1 - Zona A - Prime · Menores de 15 - Grupo 1 - Zona A - Segun · Menores de 15 - Grupo 1 - Zona B - Prime … |
| `2024|otro|M19|masculino` | 16 | juvenil | Juveniles - Primera rueda - M19 - Grupo  · Juveniles - Primera rueda - M19 - Grupo  · Juveniles - Primera rueda - M19 - Grupo  … |
| `2025|otro|M15|masculino` | 16 | juvenil | Juveniles - Primera rueda - M 15 - Nivel · Juveniles - Primera rueda - M 15 - Nivel · Juveniles - Primera rueda - M 15 - Nivel … |

### Todos los valores de subcategory que existirían

| subcategory | torneos |
|---|---:|
| juvenil | 515 |
| Intermedia | 87 |
| **NULL** | 77 |
| Superior | 54 |
| Preintermedia B | 22 |
| Preintermedia A | 18 |
| Preintermedia C | 12 |
| Preintermedia | 11 |
| Preintermedia D | 9 |
| M22 | 3 |
| Preintermedia E | 2 |
| Preintermedia F | 1 |
