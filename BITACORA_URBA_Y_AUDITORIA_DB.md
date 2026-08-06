# URBA + auditoría de base — bitácora

Registro de una sesión que empezó preguntando si se podía alimentar G22 con la API
de la URBA, encontró por qué la base y el repo llevaban cuatro meses y medio
divergiendo, y terminó con un conector listo para ejecutar y una regla nueva sobre
cómo se representa un equipo.

Fechas: 2026-08-04 / 2026-08-05.

---

## Cómo se movió

El pedido inicial era acotado: **¿se puede enganchar la API de URBA sin romper ni
duplicar nada?** Cada respuesta abrió la siguiente:

1. **Diagnóstico de esquema** → falta dónde guardar la identidad externa de un partido.
2. **Inventario del universo URBA** → 1.532 equipos, y `/api/clubs` no es el padrón.
3. **Vinculaciones y altas** → la clave es un triple, no un club.
4. **Esquema del mapeo** → el `UNIQUE` que veníamos manejando rompía en la sexta fila de GEBA.
5. **Marcado de género** → no existía el campo; salió a la luz al modelar el femenino.
6. **Auditoría de migraciones** → 21 objetos que el repo declara y la base no tiene.
7. **Causa raíz** → el workflow de deploy está apagado a mano desde el 2026-03-18.
8. **P0 de datos personales** → `people` legible por la clave anónima, con menores adentro.
9. **El modelo de fases** → se probó, se midió y se abandonó con el número a la vista.
10. **El conector y la corrida en seco** → 10.830 partidos, y un bug mío de 1.946.
11. **La colisión de equipos** → una regla nueva: cada equipo que compite es su propio registro.

---

## Parte 1 — El inventario de URBA

| | |
|---|---|
| Torneos bajados (2021–2026) | **811**, cero fallos HTTP |
| Instituciones en `/api/clubs` | 99 |
| **Instituciones que realmente juegan** | **154** — 55 no están en `/api/clubs` |
| **Equipos distintos** `(club_id, categoría, sufijo)` | **1.532** |
| "Bye" filtrados | 2 |

### Lo que las cifras de control no decían

Los cuatro buckets del control de 2026 coincidieron **al dígito** — A=150, B=153,
C=70, sin sufijo=161 — pero el total no. La diferencia se explicó entera:

- **+8 torneos**: la Segunda Rueda M19, publicada después del snapshot de control.
- **+42 equipos**: sufijos **D, E, F y G**, que el alfabeto A–C del conteo original
  no podía ver. `534 + 42 = 576`.

El alfabeto real va de **A a H**. `Newman H` existe, en *TOP 14 - Preintermedia F*.

### Tres cosas que el enunciado no preveía

- **M18 y M20** son categorías reales de 2021–2022; URBA cambió los cortes de edad
  después. Son 193 equipos.
- **`empresarial`** es una competencia propia.
- **Tres convenciones de nombre** conviven: `Menores de 17 - …`,
  `Juveniles - … - M 17 - …` (con espacio) y `… M17 …` (pegado).

### `/api/clubs` no es el padrón

55 instituciones juegan sin figurar ahí: universitarios (UBA por facultad, UTN,
UCA, UNTREF) y empresariales (SATSAID, TEQNA, Policía de la Ciudad). Sólo existen
dentro de `teams[].club`.

**Cualquier sync enumera clubes recorriendo los torneos, nunca ese endpoint.** Y la
lista de `/api/championships/{año}` **no se cachea nunca**: 2026 pasó de 93 a 99 a
134 torneos durante este trabajo.

### Tres bugs del matcher que valió la pena cazar

- **`R.C.` partido en dos tokens.** Los puntos se reemplazaban por espacio, así que
  `Olivos R.C.` no coincidía con `Olivos`.
- **La columna `sport` no es confiable.** 95 clubes de hockey están cargados como
  `sport: "rugby"`. La señal que sirve es la **unión**.
- **Los parciales no se dan por buenos.** `Atlético San Andrés` comparte dos
  palabras con `San Andrés` y son clubes distintos.

---

## Parte 2 — El mapeo

### La identidad de un equipo es un triple

`teams[].id` cambia cada temporada; `club_id` identifica a la institución, no al
equipo. Un club mete varios equipos a la vez:

```
external_id = {urba_club_id}|{categoria}|{sufijo}      sufijo vacío = string vacío
```

GEBA (club_id 30) tiene once filas que caen todas en el mismo club de G22. Los
Tilos llega a diez. **Por eso `club_external_ids` no lleva `UNIQUE (club_id,
provider)`**: con esa restricción el import se caía en la sexta fila de GEBA, y el
"arreglo" natural —borrar filas del CSV— habría hecho desaparecer categorías
enteras sin error.

### Una sola implementación de cada identidad

`externalId.ts` es el único lugar donde se serializan el triple, el id de torneo
(`urba:{id}`), el id de partido, el nombre normalizado para el cruce y la categoría
derivada del nombre. Lo importan el generador de los CSV **y** el conector. Si
hubiera dos, se desincronizarían y los partidos dejarían de encontrar su club **en
silencio**. 31 tests.

### Entregables

| archivo | filas |
|---|---:|
| `inventario-urba-g22.csv` | 1.532 |
| `vinculaciones.csv` | 426 |
| `altas.csv` | 1.012 |
| `mapeo-pendiente.csv` | 1.106 |
| `stg_urba_torneos_part1.sql` | 134 |
| `stg_urba_equipos_mayores.sql` | 332 |

`426 + 1.106 = 1.532`. Cierra.

### El hueco que faltaba en el plan de carga

El plan original tenía cuatro etapas y **dejaba mudo al 72% del universo**: los
1.012 clubes que crean las etapas 1, 3 y 4 se quedaban sin ninguna fila de mapeo.
De ahí salieron la **etapa 5** (1.106 filas) y la **etapa 6** (prender sólo los
clubes que ya tienen partidos). Los 1.012 entran con `is_visible = FALSE`.

---

## Parte 3 — El género del torneo

No existía el campo. De 83 torneos, 15 se reconocían **sólo por el string del
nombre**. `tournaments.gender` es **nullable y sin default**: lo no marcado es
*desconocido*, no masculino.

Al backfillear aparecieron 12 torneos más que el nombre marca solo y el regex
castellano no veía — cuatro femeninos en inglés (`Asia Rugby Championship Womens`,
`Women's Rugby Europe Championship`, `Rugby Premier League W`, `Six Nations
Festival U18 W`) y ocho que dicen `Caballeros`/`Masculino`.

Estado final: **19 femenino, 8 masculino, 56 en NULL**.

---

## Parte 4 — La divergencia repo ↔ base

### 21 objetos que el repo declara y la base no tiene

12 tablas y 9 funciones, **12 con código vivo encima**. Confirmado con
`to_regclass`: los 13 consultados dieron **NULL**.

### La causa raíz

```
Deploy Supabase Migrations | state: disabled_manually | 60 corridas
última corrida: 2026-03-18
```

El workflow existe y está bien escrito. **Lo apagaron a mano el 2026-03-18**,
después de una cadena de fallos. Candidato de por qué fallaba: **no existía
`supabase/config.toml`**.

**15 de los 21 faltantes** vienen de migraciones posteriores al corte. Los otros 6
son el subsistema viejo de favoritos, reemplazado escribiendo directo en la base.

### Son dos problemas, no uno

- **Workflow apagado**: 110 migraciones nunca corrieron automáticamente.
- **Ramas sin mergear**: `match_clock_transition` ni siquiera está en `main`.

### El historial

59 filas contra 170 archivos, y **un hueco**:
`20260318120000_fix_post_simplification_inconsistencies` está en rango y no está
registrada, con sus dos vecinas sí. Su función **existe en la base**: alguien la
corrió por su cuenta. Es el primer caso documentado de la práctica.

| bucket | cuántas |
|---|---:|
| ya registradas | 40 |
| **aplicadas a mano** | **52** |
| pendientes de verdad | 22 |
| obsoletas (objetos borrados a propósito) | 2 |
| no verificables por existencia de objeto | 54 |

Dos trampas que casi se cuelan: migraciones cuyos objetos se borraron a propósito
después (aplicarlas los recrearía), y **una versión duplicada** —
`20260423153000` la compartían dos archivos y el CLI indexa por versión, así que
una quedaba invisible. Renumerada a `20260423153001`.

---

## Parte 5 — P0 de datos personales

`people`: **1.479 filas legibles con la clave anónima**, que va embebida en el
frontend. Columnas abiertas: `id_number` (DNI), `birth_date`, `email`, `phone`. Y
el padrón incluye juveniles M15 a M19.

La política era explícita: `FOR SELECT TO anon, authenticated USING (true)`. Con
**1.227 usuarios registrados**, restringir sólo `anon` habría dejado el mismo
agujero abierto para todas esas cuentas.

El barrido encontró **tres** tablas: `people`, `club_profile` y `club_venues`.
`users`, `admin_telegram_users` y los logs de agente estaban bien protegidos.

RLS filtra **filas**, no columnas: el arreglo va por `GRANT`/`REVOKE` de columna.
Y un criterio que hubo que corregir sobre la marcha: se cerró `address` y se dejó
`maps_link`, que apunta a la misma ubicación exacta. Quedaron los dos cerrados.

**Cuatro llamadores rotos, cuatro arreglos**, y una invariante que dejó de ser un
comentario: `fetchPersonRowsByIds` ahora exige `RlsScopedPersonIds`, un tipo con
marca que sólo se construye nombrando el origen. **Agregar un llamador no
compila.** Más 5 tests verificados en negativo.

---

## Parte 6 — Dos tickets

**T-1 · Favoritos** escribe contra `favorites`, que no existe. Hoy **no está roto**
porque el error se traga. El riesgo es al revés: el día que la tabla exista, el
camino viejo empieza a escribir y quedan dos fuentes de verdad.

**T-2 · `fixture-sync`** escribía cada hora en una tabla inexistente desde marzo,
~3.300 corridas. Logueaba un `warn`, pero el contador sumaba igual y el endpoint
respondía `{ok: true, synced: 340}` habiendo escrito cero. **La instrumentación
mentía.** Arreglado: los dos crons reportan lo escrito y responden **500** cuando
la caché no existe.

---

## Parte 7 — El modelo de fases, medido y abandonado

URBA parte muchas competencias en dos torneos ("Primera Rueda" / "Segunda Rueda").
La pregunta era si en G22 eso son dos fases de un torneo o dos torneos.

Se probó aparear cada segunda rueda con su primera, **filtrando candidatos antes de
comparar** (mismo año, división, age_grade y grado) y midiendo Jaccard sobre la
identidad completa de equipo. Umbral fijado de antemano: 44 de 49.

**Resultado: 20 de 49.** El filtro no aisló **ni un solo** candidato único, y el
segundo filtro —ventanas de fecha— resolvió **0**: todas las primeras ruedas
comparten la misma ventana al día (12-04 a 12-07), así que "la que termina más
cerca" es un empate de doce.

El porqué está en un caso:

```
Menores de 19 - Segunda Rueda - G2 Nivel 1 Ganadores
   j=0,33  … Primera Rueda - G2 NIVEL 1 A
   j=0,33  … Primera Rueda - G2 NIVEL 1 B
```

**El empate no es ruido: es la estructura.** Los ganadores de dos zonas se juntan
en un torneo de "Ganadores". Esa segunda rueda tiene **dos padres**. Afinar el
matcher no lo arregla porque no hay una respuesta correcta que encontrar.

**Decisión: cada rueda y cada playoff es un torneo separado, con su propio
`external_id`.** Hay además 13 casos de anidación de tres niveles (competencia →
rueda → playoff) que el modelo de fases habría necesitado expresar.

---

## Parte 8 — El conector y la corrida en seco

`client.ts` (HTTP + caché gzip + 250 ms, sin reintento ante 5xx), `planMatches.ts`
(el mapeo, función pura) y `urba-dry-run.ts` (sólo SELECT). 16 tests.

### El bug que la corrida en seco encontró — y era mío

La primera pasada omitía **1.946 partidos**. La causa no eran los datos: tomé la
categoría del triple de `stg_urba_torneos.age_grade`, y esa columna es el **corte
de edad** — vale `mayores` para todo lo adulto. En los torneos de Preintermedia
armaba `{club}|mayores|B` donde el mapeo tiene `{club}|preintermedia|B`.

Ningún error. Sólo partidos que no encontraban su club.

El arreglo fue el principio de siempre: **la categoría se deriva del nombre con la
misma función que generó el mapeo**, ahora `categoriaDeTorneoUrba()` en el módulo
compartido, con 7 tests. **De 1.946 omitidos a 87.**

### El informe

| | |
|---|---:|
| partidos que URBA trae (sin Bye) | 10.917 |
| se crearían | **10.830** |
| omitidos | 87 |
| torneos con cobertura 100% | **121 de 134** |

Estados: `final` 6.180 · `scheduled` 4.650, ninguno fuera del CHECK. Los 4.650
llevan `score` NULL, no 0-0 — `fulfilled: false` trae los scores en cero y
escribirlos habría llenado las tablas de empates falsos.

**Fechas: una sola hora en las 10.830 filas, `03:00:00`.** Es la confirmación de
que no hay corrimiento: URBA publica el día a medianoche local y medianoche en
Buenos Aires son las 03:00 UTC del mismo día.

---

## Parte 9 — La colisión, y la regla que salió de ahí

El conector detectó **27 partidos con el mismo club de los dos lados** (`CUBA E vs
CUBA F` → `cuba` contra `cuba`). Eso falla ruidosamente y queda fuera.

Pero era la punta. El daño real es cuando esos equipos juegan **contra otros**:
ambos escriben `home_club_id='cuba'` y el motor los suma en una sola fila de la
tabla, sin que nada falle.

| | |
|---|---:|
| torneos con al menos un club con 2+ equipos | **6 de 134** |
| partidos en esos torneos | **799** de 10.917 |

Por categoría: **preintermedia 5 torneos, universitario 1**. Mayores, intermedia,
femenino y formativo: **cero**. Los juveniles: **99 torneos, cero colisiones** —
confirmado con el dato, no asumido: cada equipo juvenil ya es su propio club.

El peor caso es `TOP 14 - Preintermedia F`: **Newman F, G y H**, tres equipos del
mismo club en el mismo torneo, sumados en una fila.

### La regla nueva

**Cada equipo que compite es su propio registro en `clubs`.** Sólo la categoría
`mayores` (Superior) sigue apuntando al registro de la institución.

```
SIC                       ← Superior, la institución
SIC Intermedia            ← registro propio
SIC Preintermedia "A"     ← registro propio
```

Resuelve además algo que no habíamos mirado: hoy las tablas de *TOP 14 -
Intermedia* y *TOP 14 - Superior* escriben las dos sobre `san-isidro-club`.

**332 registros nuevos**: preintermedia 205, intermedia 91, femenino 32,
universitario 4.

Para separar "apunta a la institución" de "ya tiene registro dedicado" usé un
criterio **por dato** —un registro es de institución si algún triple de `mayores`
apunta a él— y no el string del id. Bien que así fuera: hay **89 registros
dedicados cuyo id no termina en `-mNN`** que la regla del string habría duplicado.

Y un cabo suelto que se ató solo: `27|femenino|` sugiere `cuq-femenino`, que **ya
existe** — el registro que habíamos dejado oculto. Deja de ser huérfano.

---

## Estado al cerrar

### Aplicado en la base

- `club_external_ids` (1.532 filas) + el CHECK de formato
- `tournaments.gender` con su backfill
- `stg_urba_torneos` (134), `stg_urba_vinculaciones`, `stg_urba_altas`,
  `stg_urba_mapeo_pendiente`
- 1.009 clubes y 126 torneos nuevos, todos con `is_visible = FALSE`

### En el repo, sin aplicar

| archivo | qué es |
|---|---|
| `20260804170000_people_column_privileges.sql` | privilegios de columna, PR listo |
| `20260805120000_stg_urba_torneos.sql` | la tabla de staging de torneos |
| `supabase/config.toml` | creado y **sin usar** a propósito |
| `staging-urba/stg_urba_equipos_mayores.sql` | los 332 equipos de mayores |
| `staging-urba/club_external_ids_faltantes.sql` | 7 triples — y 7 clubes que faltan |
| rama `chore/drop-legacy-fixture-importer` | **sin mergear**, esperando logs |

### Frenado a propósito

- **El workflow sigue apagado.** Prenderlo antes de reparar el historial haría que
  `db push` intentara aplicar 110 migraciones sobre un esquema modificado a mano.
- **`PLAN_REPARACION_MIGRACIONES.md` sin ejecutar** hasta tener el diff.
- **El conector no se ejecutó.** Cuando el repunte de los 332 esté aplicado, se
  vuelve a correr en seco: los omitidos tienen que bajar de 87 a 0 y los 6 torneos
  con colisión tienen que desaparecer.

### Pendiente

- **Base sombra** para las 54 no verificables. Docker no está disponible; el camino
  es un proyecto Supabase descartable.
- **La carga de URBA**, seis etapas con verificación y rollback.
- **95 clubes de hockey con `sport = "rugby"`**, listados y sin tocar.

---

## Lo que conviene no olvidar

**`database.types.ts` no es fuente de esquema.** Se mantiene a mano — el script
`gen:db-types` existe y no se corre. Declaró `favorites`, `get_table_columns` y
`external_data`, que nunca existieron, y omite `clubs.external_id`, que sí existe.

**`supabase/migrations/` tampoco lo es.** Hay objetos creados a mano que no están
en ninguna migración. Lo que manda es `to_regclass` contra el catálogo.

**Un `(supabase as any).from(...)` dejó una pantalla de admin muerta** sin que
TypeScript dijera nada: `provider_entities` no existe y nunca existió.

**Los modos de falla silenciosos fueron el patrón de toda la sesión.** El contador
de la cron que suma sin escribir. El favorito cuyo error se traga. La pantalla que
se vacía porque un select perdió privilegio. El `age_grade` que arma un triple que
no resuelve. Los tres equipos de Newman sumados en una fila. En todos, el sistema
decía que estaba bien.

De ahí salieron las tres defensas que más se repitieron: **una sola implementación
de cada identidad** (y tests que fallan si aparece una segunda), **que la
invariante sea código y no comentario** (el tipo marcado, la unión cerrada de
llamadores), y **que la instrumentación diga la verdad aunque duela** — un cron en
rojo es mejor que un contador inflado en verde.

Y una que no es técnica: **el umbral se fija antes de medir.** El modelo de fases
se abandonó con 20 sobre 49 contra un corte de 44 acordado de antemano. Discutir el
umbral después del resultado es discutir otra cosa.
