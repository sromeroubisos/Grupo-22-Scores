# Auditoría de datos — El Entrenador (2026-10-14)

## Fuente de verdad

El Entrenador dejó de usar su propia pirámide (portada de `rugby-manager-pro`) y
juega sobre el **canon del rugby argentino** que ya usa Carrera de Rugby:
`src/features/career/data/clubs2026/arSystem2026.ts` (versión `2026.3`). Se lee
de ahí en tiempo de ejecución: no hay una segunda copia.

| entidad | dónde vive | cómo se valida |
|---|---|---|
| clubes | canon (`AR_DIVISIONS[].clubs`) + `coach/data/club-meta.generated.ts` (ciudad, unión, escudo) | `coach/data/canon-catalog.test.ts` |
| divisiones | canon → `coach/data/competitions.ts` | mismo test |
| relación club ↔ división ↔ temporada | `homeCompetitionId` del canon; la pirámide de la partida deriva desde ahí | "cada club juega UNA división, y es la que declara el canon" |
| ascensos y descensos | grafo del canon (`promotesTo` / `relegatesTo`), dentro de su rama y región | "no cruzan de rama ni de región" + harness de 1.000 carreras |
| cupos al Torneo del Interior A | `TDI_CUPOS_2026` del canon | las plazas suman 16 |
| escudo | id del catálogo real (el mismo que en Carrera) → `public/clubs/<id>.png` | 235 de 264 con escudo |

## Lo que cambió en los datos

- **554 → 264 clubes.** Quedan solo los del canon. De los 554 del catálogo viejo,
  228 cruzaron con un club del canon; los otros 326 no se muestran: el canon no
  los ubica en ninguna división y no se puede afirmar en qué torneo juegan. El archivo viejo sigue en
  `coach/data/legacy-clubs.generated.ts` para la migración de partidas.
- **Nombres oficiales.** Ejemplo: el catálogo viejo decía "Círculo Ex Cadetes…" y
  ahora dice **Liceo Militar**, como lo declara el canon. Los homónimos quedan
  separados (San Patricio de la URBA y San Patricio de Corrientes; el Pueyrredón
  de la URBA y el de Mar del Plata).
- **Divisiones reales.** La URBA tiene sus 7 niveles (Top 14 a Desarrollo), y cada
  región del interior su propia estructura, en vez de una plantilla común.
- **Duplicados:** 0 por id y 0 por nombre normalizado (test).

## Pendiente de validación (no se presenta como oficial)

- **36 clubes sin ciudad ni unión verificadas.** La pantalla dice "Ciudad sin
  verificar". Lista en `CLUB_META_PENDING`. Son sobre todo de la Patagonia, el
  desarrollo de la URBA y dos paraguayos del NEA.
- **Las ciudades que sí aparecen vienen del catálogo viejo** (rugby-manager-pro).
  No se contrastaron una por una con las uniones; para la URBA suele decir
  "Buenos Aires" en vez de la localidad.
- **Divisiones que no se juegan:** la Copa de Bronce del Oeste tiene 2 clubes
  identificados y la nómina completa no está publicada. Sus clubes figuran como
  "todavía no". El canon declara también pendientes el NEA B/C (8 de 16), el
  UROBA-Sur y las uniones patagónicas (`AR_PENDING_ROSTERS`), y no modela el
  Pampeano C, el Desarrollo de Córdoba ni la Liga Norte Grande
  (`AR_NOT_MODELLED`).

## Simplificaciones del juego (simulación, no dato)

- **Fechas.** El canon anota 18 fechas para las divisiones de la URBA. El juego
  las juega **ida y vuelta (26 con 14 clubes)**, que es el formato real que
  informó el usuario. Hay que corregir el canon (`regularSeasonMatches`) en una
  tarea aparte: tocarlo cambia Carrera de Rugby y su digest.
- **Segundo ascenso.** Donde el canon declara dos ascensos (campeón directo +
  reducido del 2° al 5°), el juego no juega el reducido: asciende el mejor ubicado
  que no salió campeón.
- **Playoff.** Semifinales 1°-4° y 2°-3° y final, para las divisiones de 8 o más.
  El formato real de cada torneo es más variado (zonas, Copa de Oro/Plata,
  arrastre) y está en la nota del canon.
- **Desarrollos que alimentan a otra división sin descenso de vuelta** (Andina →
  NOA B, las uniones patagónicas → Torneo Austral): se muestran, pero no mueven
  clubes. Si no, la división de arriba crecería cada año.
- La fuerza de cada club (orden del canon) se reescala a la escala del motor; la
  reputación usa un piso de 10 (medido: con 2, la base cerraba en rojo el año 1).

## Bug corregido en esta pasada: "15° de 14"

La temporada jugada ascendía a uno (el campeón) y el ajuste anual de la pirámide
bajaba a dos. La división de arriba quedaba con 15 clubes y la de abajo con 13.
Corregido en tres lugares: asciende lo que declara el canon
(`season.ts → movementOf`), el ajuste empareja siempre los que suben con los que
bajan (`world.ts → tickWorld`) y la planilla usa el tamaño de la tabla jugada. Lo
vigila el harness: "ninguna división termina un año con un club de más o de
menos", en 1.000 carreras de 12 temporadas.
