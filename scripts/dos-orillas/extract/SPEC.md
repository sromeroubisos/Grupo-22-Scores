# Extracción del Torneo Juvenil Dos Orillas (DOJ) — formato común

Fuente: notas de tercertiemporugby.com.ar, ya convertidas a texto en
`do/txt/<YYYY-MM-DD>_<nnn>.txt` (una nota por archivo, ordenadas por fecha).
Directorio base: `C:\Users\srome\AppData\Local\Temp\claude\c--Users-srome-OneDrive-Escritorio-Grupo-22-Scores\14816d9b-d50d-4afa-9686-cb144f3b98a2\scratchpad\do`

Las notas son de dos tipos:
- **Programación** (antes del sábado): cruces, horarios y árbitros. Suelen traer
  además resultados de partidos POSTERGADOS jugados entre semana
  ("CRAR 14-17 Old Resian (1-4) disputado 10/10") — esos SÍ son resultados.
- **Panorama** (después): resultados y "Posiciones".

## Qué extraer

SOLO divisiones M15, M16, M17 y M19 (en 2014 la mayor se llamó M18: va como
`M19` con `"divisionLabel": "M18"`). Ignorar M14, M1, M2, Trial, amistosos,
seleccionados, TRL (Torneo Regional del Litoral), Clausura USR, y cualquier
partido marcado "amistoso".

Un JSON por año: `do/extract/<YYYY>.json`:

```json
{
  "year": 2026,
  "format": "texto libre: cómo fue el torneo ese año (fases, zonas, copas, cuántas fechas)",
  "champions": [
    { "division": "M19", "cup": "Oro", "club": "Estudiantes", "note": "" }
  ],
  "phases": [
    { "division": "M19", "phase": "Fase clasificatoria", "group": null,
      "teams": ["Santa Fe RC", "Estudiantes", "..."] }
  ],
  "matches": [
    { "division": "M19", "phase": "Fase clasificatoria", "group": null,
      "round": 1, "date": "2026-03-28",
      "home": "Estudiantes", "away": "La Salle",
      "hs": 45, "as": 5, "hp": 5, "ap": 0,
      "status": "final", "note": "", "src": "2026-03-28_551" }
  ],
  "standings": [
    { "division": "M19", "phase": "Fase clasificatoria", "group": null,
      "afterRound": 4, "src": "2026-04-25_557",
      "rows": [ { "club": "Santa Fe RC", "pts": 17 }, { "club": "Estudiantes", "pts": 17 } ] }
  ],
  "issues": ["texto libre: todo lo que no cerró, contradicciones, dudas"]
}
```

Reglas de campos:
- `phase`: nombre tal como lo usa el torneo ese año, normalizado a uno de:
  `Fase clasificatoria`, `Competencia Formación`, `Final Six Oro`,
  `Final Six Plata`, `Final Four Oro`, `Final Four Plata`, `Final Four Bronce`,
  `Apertura`, `Clausura`, `Campeonato` (bloque campeonato), `Reclasificación`,
  `Estímulo`, `Copa Oro`, `Copa Plata`, `Copa Bronce`, `Final`. Si el año usa
  otro nombre, usalo y explicalo en `format`.
- `group`: "Zona A"/"Zona B" si la fase tiene zonas; si no `null`.
- `round`: número de fecha DENTRO de la fase (Final Six 1..5, Final Four 1..3).
- `date`: la fecha en que se jugó (si dice "disputado 10/10" o "(19/5 - 20 hs)",
  esa). Si no, el sábado de la fecha según la nota. Formato ISO.
- `home`/`away`: el nombre del club COMO ALIAS CANÓNICO de la tabla de abajo; el
  primero nombrado es el local.
- `hs`/`as`: tantos. `hp`/`ap`: los puntos de tabla que la nota pone entre
  paréntesis "(5-0)"; si no los pone, `null` (NO los calcules).
- `status`: `final` (con marcador), `walkover` (GP-PP / PP-GP: poner hs/as null y
  en note quién ganó: `"note": "GP local"` o `"GP visitante"`), `postponed`
  (postergado/suspendido y sin resultado posterior), `not_played` ("no se
  disputó", "disputado" sin marcador → `not_played` con note "disputado sin
  marcador publicado").
- Si un partido aparece primero postergado y después con resultado, dejá UNA
  sola fila, la del resultado.
- NO dupliques: la misma fecha se repite en la programación y en el panorama.
- `standings`: copiá CADA línea "Posiciones: ..." que aparezca (sirven de control),
  con `afterRound` = fecha después de la cual se publicó.
- Equipos de reserva / B de M19: alias con sufijo, p. ej. "Santa Fe RC R",
  "CRAI B", "Estudiantes B", "Santa Fe RC B" (en M15-M17 "SFRC B" = Santa Fe RC B
  y "SFRC A" = Santa Fe RC). "SFRC Rojo"/"Azul" (2023): "Santa Fe RC" y
  "Santa Fe RC B". Equipos combinados: "Cha Roga Club / Querandí RC",
  "At. Brown / San Carlos", "At. Brown / San Jorge".

## Alias canónicos

| Alias canónico | Formas en la fuente |
|---|---|
| Santa Fe RC | SFRC, Santa Fe Rugby, Santa Fe R., SFRC A, Santa Fe RC A, Santa Fe Rugby A |
| CRAI | CRAI A |
| CRAR | CRaR (Rafaela) |
| Estudiantes | CAE, Estudiantes de Paraná |
| Rowing | Paraná Rowing, PRC |
| Tilcara | Tilcarra |
| La Salle | La Salle (Santa Fe) |
| Universitario | Uni, Universitario SF, Universitario de Santa Fe |
| Cha Roga Club | Cha Roga, Cha Roga RC, Santoto |
| Alma Juniors | Alma Jrs, Alma Jrs. |
| At. Brown | A. Brown, Atl. Brown, Brown (SV), At Brown |
| San Carlos | San Carlos (Santa Fe) |
| Querandí RC | Querandí |
| Capibá | Capibá |
| Náutico El Quillá | El Quillá, Quillá |
| San Jorge | San Jorge |
| Jorge Newbery Gálvez | Jorge Newbery |

Cualquier otro nombre: usalo tal cual y anotalo en `issues`.

## Control antes de entregar

Para cada fase, sumá los `hp`/`ap` de tus partidos por club y comparalos con la
ÚLTIMA línea de posiciones de esa fase. Si no cierra, buscá el partido que falta
o el que está mal (suele ser un postergado jugado entre semana que aparece en una
nota de programación). Lo que no puedas cerrar va a `issues` con el detalle
(club, puntos calculados vs publicados).

Tu respuesta final: un resumen de 10 líneas máximo por año (fases, cantidad de
partidos por división, campeones, y qué no cerró). El JSON es el entregable.
