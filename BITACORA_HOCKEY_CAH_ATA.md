# Bitácora — Hockey de la CAH y la ATA: cosecha e importación

**Fecha:** 2026-09-02 / 2026-09-03 · **Rama:** `feat/carrera-rugby-v2`

Cosecha con [Scrapling](https://github.com/D4Vinci/Scrapling) de dos fuentes de
hockey y su importación a la base, con los torneos publicados y visibles.

---

## 1. Qué se trajo

### Fuentes

| Fuente | Secciones | Cosechado |
|---|---|---|
| `cahockey.org.ar` (Confederación Argentina) | LNH, Argentino de Clubes, Argentino de Selecciones, Internacionales | 978 torneos · 20.161 partidos |
| `atahockey.com` (Asociación Tucumana) | Masculino, Femenino | 59 divisiones · ~4.000 partidos |

Detalle de la CAH: 79 torneos de LNH (1.762 partidos), 473 del Argentino de
Clubes (10.234), 399 del Argentino de Selecciones (8.165) y 27 historiales
internacionales con 170 ediciones más 5 fichas completas.

### Importado a la base (temporada 2026)

| | |
|---|---|
| Torneos | **86** (29 de la CAH + 57 de la ATA) |
| Partidos | ~4.300 |
| Clubes de `field-hockey` en la base | 390 |
| Tablas de posiciones | 86 de 86 |
| Torneos sin fase o sin tabla | 0 |

Todos con `status: 'published'`, `is_visible: true` y `sport_id: 'field-hockey'`.

---

## 2. Dónde vive el dato (no donde se ve)

### La CAH son tres capas

1. **El listado está en `.col-small`, no en `.contenido`.** `.contenido` muestra
   un solo torneo destacado; el acordeón por años de la columna lateral tiene
   los 79 de LNH y los 473 del Argentino de Clubes.
2. **El detalle se pide por AJAX**: los enlaces tienen `href="#"` y el click hace
   `POST /updateTorneo` con `id=<n>`. Requiere el header `X-Requested-With`: sin
   él contesta 200 con la página entera en lugar del fragmento.
3. **El resultado deportivo está en otro dominio**: `sicah.cahockey.org.ar`, en
   **iso-8859-1**, con posiciones por zona y un modal por partido que trae día,
   hora, cancha, resultado y los dos planteles completos.

`torneos-internacionales` es la excepción: es un índice de historiales, y 169 de
sus 170 ediciones solo linkean a fih.ch. Ahí hay referencia, no resultado propio.
Cuando un historial tiene una sola edición, el sitio muestra la ficha completa
con pestañas (planteles con entrenador, posiciones finales, crónicas, PDF) en
lugar del índice: cuatro torneos parecían vacíos y no lo estaban.

### En la ATA el dato no está en la página

`/index.php/torneo-masculino` y `/torneo-femenino` son WordPress y su cuerpo es
un `<div id="result_stats">..</div>` vacío que se llena por AJAX desde
`/stats/stats.php`. Scrapear el HTML no devuelve nada.

Yendo al endpoint aparece además el catálogo entero: su `<select>` lista cada
combinación torneo × división, o sea 9 divisiones masculinas y 50 femeninas
contra las 2 que muestran las páginas.

| Parámetro | Qué es |
|---|---|
| `FixId` | el torneo (Apertura 2026 = 394, Clausura = 436) |
| `EquipoId` | la división (Primera, Intermedia, Sub 19, Sub 15…) |
| `FixSexo` | `M` o `F` |
| `ultimaFecha` | pagina los resultados |

---

## 3. Los bugs de datos, encontrados comparando contra la fuente

El método que los destapó: **cotejar la tabla de posiciones que calculó la base
contra la que publica la fuente**. Los goles coincidían exacto pero los partidos
jugados decían 14 donde la fuente decía 2.

### 3.1 Un 0-0 que no era empate

ATA pinta el marcador de los partidos **futuros** como `0` y `0`, idéntico a un
empate real. Lo único que los separa es la clase de la fila. Censo sobre 334
filas de cinco divisiones de las dos ramas:

| clase | filas | en 0-0 | con goles |
|---|---|---|---|
| `estado_1` | 146 | 146 | 0 |
| `estado_4` | 14 | 1 | 13 |
| `estado_5` | 174 | 3 | 171 |

`estado_1` es programado; 4 y 5 son jugados y sus pocos 0-0 son empates de
verdad. Tomar el marcador al pie de la letra metía la temporada que falta jugar
como empates. Un estado desconocido se trata como NO jugado: el error seguro es
omitir un resultado, no inventarlo.

**Efecto:** de 3.997 partidos "con resultado" a 2.455 reales más 1.317
programados.

### 3.2 El marcador pegado al nombre del club

En SICAH el encabezado del modal es `EQUIPO GOLES`, pero un partido definido por
penales se escribe `G. Y ESGRIMA 6 (4)` — seis goles, cuatro en la definición.
Sin contemplar el paréntesis nacían clubes llamados "Jockey Club 2 (3)". Y si el
partido no se jugó, en lugar del marcador hay un guión y el nombre queda como
"Federación Cordobesa -".

**Efecto:** 132 → 95 clubes de la CAH (37 eran duplicados), y aparecieron 20
partidos con resultado que se perdían.

### 3.3 La llave publicada antes de jugarse

El Argentino de Selecciones publica el cuadro completo con los cruces por
definir escritos en el lugar del equipo: "1° Zona A", "Ganador N°13", "Perdedor
N°16". Son placeholders, no participantes.

**Efecto:** 43 clubes fantasma evitados y 114 partidos omitidos como "cruce por
definir", sin perder ninguno de los 362 con resultado.

### 3.4 Las comillas rotas del propio sitio

El HTML de la CAH trae la división «A» escrita `?A?`, y el torneo se publicaba
como "Sub 16 ?a? Damas".

---

## 4. Lo que se evitó escribir: homónimos entre provincias

El cotejo por nombre normalizado daba tres "coincidencias" que eran clubes de
otra provincia:

| Cosechado (Tucumán) | Caía sobre | Que está en |
|---|---|---|
| UNIVERSITARIO BLANCO | Universitario "Blanco" | Córdoba |
| UNIVERSITARIO AZUL | Universitario "Azul" | Córdoba |
| JOCKEY D | Jockey D | Rosario |

Escribirlo habría atribuido los partidos de Tucumán a clubes ajenos — el mismo
daño que ya costó caro con San Andrés bajo el id de San Albano. Ahora el id de
club lleva el **ámbito de la federación** (`natacion-tucuman-hockey`,
`jockey-club-cah-hockey`) y el cotejo es por id, nunca por nombre. La homonimia
entre federaciones es la regla: Jockey, Universitario, San Martín y Natación
existen en media docena de provincias.

> Si un import de una federación nueva reporta "0 clubes ya existentes", ese es
> el número correcto.

---

## 5. Por qué un torneo publicado no se veía

Tres causas distintas, y solo dos eran fallas.

### 5.1 El feed servía una foto vieja (falla, propia)

El feed de la portada **no lee `matches`**: lee un snapshot cacheado por día,
deporte y timezone en `matches_feed_cache`. Había uno de
`2026-09-03:field-hockey` generado antes del import, así que los partidos
entraron a la base y la portada seguía mostrando el estado anterior.

Los crons de hockey llaman `invalidateMatchesFeedCaches()` después de escribir;
el importador no lo hacía. **Corregido**: se purgaron los 37 snapshots y el
importador ahora invalida al terminar.

### 5.2 El import había quedado cortado (falla)

Al cerrarse la sesión murió el proceso y dejó 56 tablas sin calcular y un torneo
hecho cascarón: "Apertura Damas A 2026 - Sub 14" con la fila del torneo pero sin
fase, temporada, partidos ni participantes.

**Corregido** con `hockey-recalcular-tablas.ts`, que retoma solo lo que falta; el
cascarón se borró y se re-importó completo.

### 5.3 La audiencia (NO era una falla)

`/api/public/tournaments` devuelve **`mayores` por defecto**; los juveniles salen
con `?audience=juveniles`. De los 86 torneos, 20 están en mayores y 66 en
juveniles: sumadas las dos vistas están todos. El que se juega hoy es Sub 16, así
que vive en la pestaña de juveniles. Un Sub 16 ausente de la lista de mayores no
es un bug.

---

## 6. Un bug preexistente que esto destapó

La lista pública perdía torneos: pedía `.limit(3000)` pero **PostgREST no
devuelve más de 1000 filas por request**, y hay **1.112 torneos con
`is_visible != false`**. O sea 112 quedaban afuera, de todos los deportes.

Corregido paginando con `.range()` y desempatando por `id`, para que el orden sea
total y ninguna fila se repita ni se pierda entre páginas.

**Medido después:** football devuelve 1.205 torneos donde antes topaba en 1.000;
rugby (140 mayores / 142 juveniles), hockey y el resto siguen sin errores.

> Este cambio toca un endpoint público central: conviene revisarlo antes de que
> salga a producción.

---

## 7. Archivos

### Nuevos

| Archivo | Qué hace |
|---|---|
| `scripts/cahockey/scrape_cahockey.py` | Cosecha las 4 secciones de la CAH. `--sicah` baja el detalle; `--anio` + `--fusionar` re-cosechan un año sin volver a bajar el histórico |
| `scripts/cahockey/README.md` | Las tres capas y las trampas |
| `scripts/atahockey/scrape_atahockey.py` | Cosecha las dos ramas de la ATA vía `stats.php` |
| `scripts/atahockey/README.md` | El endpoint oculto y el censo de estados |
| `src/scripts/hockey-importar-2026.ts` | Importa a la base. `--plan` / `--execute` / `--fuente` / `--limite` |
| `src/scripts/hockey-recalcular-tablas.ts` | Retoma las tablas que quedaron sin calcular |

### Modificados

- `src/app/api/public/tournaments/route.ts` — paginación de la consulta (§6).

### Cómo se corre

```bash
# cosecha
python scripts/cahockey/scrape_cahockey.py --sicah
python scripts/atahockey/scrape_atahockey.py

# importación (dry-run primero, siempre)
npx tsx src/scripts/hockey-importar-2026.ts --plan
npx tsx src/scripts/hockey-importar-2026.ts --execute

# si una corrida se corta
npx tsx src/scripts/hockey-recalcular-tablas.ts --execute
```

El importador es **idempotente por `external_id`**: volver a correrlo retoma solo
lo que falta.

---

## 8. Decisiones de diseño que conviene no revertir

- **El orden de escritura respeta las dos FKs circulares.** Torneo sin
  `current_season_id` → temporada → PATCH del torneo; y participante → entrada de
  temporada → PATCH del participante.
- **Las tres tablas de participantes no son opcionales.** Sin
  `tournament_participants` el motor de posiciones descarta el partido en
  silencio; sin `team_season_entries` la página del torneo no lista al club; sin
  `tournament_phase_participants` el club no entra a la tabla.
- **`tournaments.season_id` es TEXT con el año** (`'2026'`), pero
  `matches.season_id` es UUID a `tournament_seasons`. Mismo nombre, tipos
  distintos: es el error más fácil de cometer acá.
- **Los puntos van en `home_base_points` / `away_base_points`.** Con
  `points_autocalculated: false` el motor los toma tal cual; mandarlos en cero
  deja la tabla con todos en 0 aunque los resultados estén bien. Hockey: 3/1/0.
- **Una fecha inventada es peor que un partido omitido.** SICAH agrupa por día de
  la semana sin decir la fecha; se deriva del rango del torneo y, si no cae
  dentro, el partido se omite y se reporta.
- **El reintento solo cubre lo transitorio.** Red y 5xx se reintentan con
  backoff; un 4xx es un error nuestro y tiene que explotar.

---

## 9. Pendiente

- Los archivos están **sin commitear**, incluido el endpoint público.
- Solo se importó **2026**. El histórico cosechado (2011-2025, ~890 torneos y
  ~16.000 partidos) está en `scripts/*/out/` sin importar.
- Los participantes del Argentino de Selecciones son **asociaciones y
  federaciones provinciales**, cargadas como `type: 'club'` por consistencia con
  el resto del pipeline. Si se quieren distinguir, el CHECK admite
  `national_team`.
- `scripts/cahockey/out/` pesa ~22 MB (477 archivos de detalle). Conviene decidir
  si se versiona o se ignora.

---

## 10. Segunda tanda (2026-09-03): escudos, cron de SICAH y audiencia

### Escudos de las uniones

`src/scripts/hockey-escudos-uniones.ts` carga los PNG de
`RECURSOS/HOCKEY/UNIONES` (fuera del repo) cotejando por **nombre de archivo
contra un mapa escrito a mano** — la homonimia entre federaciones es la regla y
un cotejo automático ya costó caro. Van al bucket `club-assets` por
`persistClubLogo`, nunca como base64, achicados a 600 px con `sharp`.

| | |
|---|---|
| Escudos cargados | 21 clubes (19 uniones; San Juan A/B comparten el suyo) |
| Placas | 4 torneos Sub 19 (la tipografía "Argentino de Selecciones Sub 19") |
| Club creado | `federacion-bonaerense-cah-hockey` (FBH: no jugó 2026, pero el próximo import lo va a encontrar) |
| Se dejan afuera | `CÓRDOBA.png` (escudo viejo FACHSC) y `RIO NEGRO.png` (banner) |

Entre Ríos venía como banner 684×270 y se recortó al cuadrado central.

### Cron `/api/cron/cahockey-sync`

Actualiza solos los torneos con `external_id = 'cahockey:<id>'`, cada 15
minutos de 08:00 a 23:59 (hora argentina). Fuera de los días de torneo hace una
consulta a `matches` y se va. Con `?dry=1` muestra el plan; con `?torneo=1580`
fuerza uno.

- `lib/integrations/cahockey/nombres.ts`: la identidad de clubes, **compartida
  con el importador**. Si los dos derivaran el id por su cuenta, el cron crearía
  un segundo "Federación Cordobesa".
- `sicah.ts`: `POST /updateTorneo` (header `X-Requested-With` obligatorio) →
  iframe → página en iso-8859-1 → partidos. Probado contra la página real del
  Sub 14 A Damas (`__fixtures__/sicah-1572.html`).
- `planMatches.ts`: la identidad del partido es el **número de partido de
  SICAH** (`cahockey:1572:13`), que sobrevive a que "1° Zona A" se convierta en
  un equipo real. Un marcador cargado antes de los 70' es `live`; después,
  `final`. Los penales van en `score.penalties`.
- **La etapa decide la fase.** "Zona X" queda en la fase de liga; Cuadrangular,
  Semifinales y Finales van a una fase `playoff` propia (`is_active: false`:
  hay un índice único de una sola fase activa por torneo). Sin eso la tabla de
  la zona sumaba los cruces: el Sub 14 A Damas mostraba 5 jugados donde eran 3.
  Corregido en los seis torneos de agosto.
- **Las zonas son grupos, y el grupo tiene que llegar a la pantalla.** La
  primera versión creaba los `tournament_groups` y asignaba el `group_id` en
  `tournament_phase_participants`, y la página seguía mostrando UNA tabla con
  las dos zonas mezcladas (el Sub 16 A Damas, la noche del 3/9). Dos causas,
  las dos del lado nuestro y ninguna de SICAH: el grupo se insertaba **sin
  `season_id`** y `fetchTournamentData` filtra los grupos por la temporada del
  torneo, así que para la página no existían; y el cliente recalcula la tabla
  con el `group_id` viejo de `tournament_participants`, que quedaba en NULL. El
  cron ahora escribe la temporada en el grupo, repara los que quedaron sin
  ella, y sincroniza las dos tablas de participantes como hace
  `POST /api/tournaments/[id]/phase-participants`; el cliente además toma el
  grupo de la asignación de fase. Los torneos de agosto ya salieron de la
  ventana: se reparan con `?torneo=<id>`.
- Verificado con Scrapling contra la fuente (4/9): los 18 torneos de 2026
  publican sus tablas por zona ("ZONA A"/"ZONA B", cuatro zonas en el Sub 16 D
  y en el Sub 19 Caballeros, "ZONA UNICA" en el Sub 14 B Caballeros) y el
  parser TS ya las distinguía; el parser Python de posiciones cerraba la
  última zona recién al final de la página y la Zona B salía con 24 filas.

Medido el 3/9 a la tarde: el cron encontró los ocho torneos del fin de semana
activos y cargó los primeros resultados del Sub 16 B Caballeros (8-2 y 6-1) con
su tabla.

> Al correrlo por `tsx` fuera de Next, la invalidación del feed falla por
> `server-only` (en Vercel anda) y el proceso queda vivo por el `setInterval`
> del cache de memoria: hay que matarlo o cerrar con `process.exit`.

### Selecciones en la portada de mayores

`isDualAudienceTournament` suma el patrón "Campeonato(s) Argentino(s) de
Seleccionados/Selecciones": los 18 torneos siguen siendo juveniles (Sub 14/16/19)
pero se muestran también en mayores, como el Argentino Juvenil de rugby. El
Argentino de **Clubes** no entra. Se purgaron los 13 snapshots de
`tournaments_feed_cache` y los 2 de `matches_feed_cache` de hockey para que la
lista no sirviera la foto vieja.
