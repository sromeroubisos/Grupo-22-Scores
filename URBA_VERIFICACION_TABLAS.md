# URBA — carga completa y verificada

2026-08-05. Los 134 torneos con URBA como fixture. **Los 8 torneos que tenían
fixture manual dan exactos en puntos y en orden contra `/api/positions/{id}`,
calculados por el motor real leyendo la base.**

---

## Los 6 pasos

| paso | qué | resultado |
|---|---|---|
| 1 | emparejar las 49 formaciones del Top 14 | **49/49** con exactamente uno |
| 2 | copiar las formaciones al partido de URBA | 49 · 1.616 jugadores |
| 3 | borrar los 1.256 manuales de los 8 torneos | 1.256, con volcado previo |
| 4 | asignar `phase_id` | 992 |
| 5 | borrar los 72 participantes ajenos | 72 |
| 6 | verificar los 8 contra URBA | **8/8 exactos** |

### Paso 1 — 49 de 49

Emparejados por (día en hora de Buenos Aires, local, visitante). Cero sin
emparejar, cero ambiguos, y ninguno tenía ya formación del lado de URBA.

### Paso 2 — las formaciones

49 copiadas, **1.616 jugadores, el mismo número que en el origen**. Sólo
`lineups`; ni score, ni status, ni venue.

Apareció algo que no era mío: **28 de los 49 partidos manuales tenían los
contadores `lineup_home_count`/`lineup_away_count` en 0 con la formación cargada**.
Es dato derivado —el contador es literalmente el largo del array, como en los 21
coherentes— y el origen se iba a borrar, así que los dejé coherentes en el destino
en vez de arrastrar el defecto.

### Paso 3 — y el prode

El DELETE del Top 14 falló con un **23514**: `prode_events_source_binding_chk`.
Los 182 partidos manuales del Top 14 sostenían **182 `prode_events`** (119 ya
puntuados, 63 programados) con **253 predicciones de usuarios** sobre 42 de ellos.
El FK pone `local_match_id` en NULL al borrar y la fila queda inválida.

Frené con 4 de 8 borrados y lo consulté. Resuelto como acordaste: los 182
`prode_events` se repuntaron al partido de URBA equivalente —**182/182, cero
ambiguos**, el mismo emparejamiento del paso 1— y recién entonces se borraron los
182 manuales. `official_result` y `match_snapshot` ya viven en el evento, así que
lo puntuado no se movió: 783 predicciones y 119 eventos puntuados, intactos.

Los otros 7 torneos no tenían un solo `prode_event`. Por eso 4 borraron a la
primera.

### Paso 4 — las fases

**Sólo el Top 14 tiene dos** ("Fase Regular" y "Playoffs"); los otros 7 tienen una.
Los 8 van a la que no es playoff, todas marcadas como activas.

No fue una elección a ciegas: **URBA no trae ninguna ronda de playoff en ninguno de
los 8** — 26 rondas "Fecha N" en los de Superior, 11 en los juveniles, cero
marcadas con `playoffs: true`. La fase "Playoffs" del Top 14 queda en 0 partidos,
que es lo correcto hasta que URBA los publique.

### Paso 5 — los participantes

72 filas, en los 4 juveniles. **Ninguna llevaba la marca `urba-import`**: son todas
previas, las del campeonato vecino. Los 130 torneos restantes no tenían ninguna de
más. Cada uno quedó con los 12 que trae URBA.

---

## Paso 6 — los 8 contra URBA

Motor real (`StandingsEngine`, importado sin tocarle una línea) sobre la misma
consulta que hace `GET /api/db/standings`.

| torneo | entran | de URBA | equipos | PJ | PF | PC | **puntos** | **orden** |
|---|---:|---:|:--:|:--:|:--:|:--:|:--:|:--:|
| `2025176` Top 14 | 119 | 119 | 14/14 | 14/14 | 14/14 | 14/14 | **14/14** | **14/14** |
| `2025177` Primera "A" | 112 | 112 | 14/14 | 14/14 | 14/14 | 14/14 | **14/14** | **14/14** |
| `2025178` Primera "B" | 112 | 112 | 14/14 | 14/14 | 14/14 | 14/14 | **14/14** | **14/14** |
| `2025179` Primera "C" | 112 | 112 | 14/14 | 14/14 | 14/14 | 14/14 | **14/14** | **14/14** |
| `2025213` M19 Nivel 1 "A" | 66 | 66 | 12/12 | 12/12 | 12/12 | 12/12 | **12/12** | **12/12** |
| `2025215` M19 Nivel 1 "B" | 66 | 66 | 12/12 | 12/12 | 12/12 | 12/12 | **12/12** | **12/12** |
| `2025231` M17 Nivel 1 "A" | 66 | 66 | 12/12 | 12/12 | 12/12 | 12/12 | **12/12** | **12/12** |
| `2025233` M17 Nivel 1 "B" | 66 | 66 | 12/12 | 12/12 | 12/12 | 12/12 | **12/12** | **12/12** |

Los 4 juveniles pasaron de mostrar una tabla equivocada —Newman A con 9 puntos
donde URBA dice 47— a dar exacto.

---

## Estado final: 16 comprobaciones

| | esperado | real |
|---|---:|---:|
| `matches` total | 13.559 | 13.559 |
| de URBA | 10.917 | 10.917 |
| manuales, fuera de los 8 | 2.642 | 2.642 |
| manuales dentro de los 8 | 0 | 0 |
| de URBA con fase, en los 8 | 992 | 992 |
| de URBA sin fase, en los 8 | 0 | 0 |
| de URBA sin fase (los otros 126) | 9.925 | 9.925 |
| de URBA visibles | 0 | 0 |
| formaciones en el Top 14 | 49 | 49 |
| `prode_events` del Top 14 | 182 | 182 |
| `prode_events` sin partido atado | 0 | 0 |
| `prode_predictions` | 783 | 783 |
| `tournament_participants` | 2.181 | 2.181 |
| con marca `urba-import` | 1.487 | 1.487 |
| `match_events` | 2.757 | 2.757 |
| torneos fuera de los 8 | 126 | 126 |

---

## El rollback

Ya no alcanza un archivo: la carga borró 1.256 partidos, 72 participantes, y
repuntó 182 `prode_events`. Son **cuatro archivos en orden**, y el orden importa —
borrar los partidos de URBA antes de soltar el prode da el mismo 23514 que frenó
el paso 3.

| | archivo | |
|---|---|---|
| 1 | `URBA_BACKUP_MANUALES.sql` | 1.256 INSERT, ids originales |
| 2 | `URBA_BACKUP_PRODE.sql` | 182 UPDATE, el prode vuelve al manual |
| 3 | `URBA_BACKUP_PARTICIPANTES.sql` | 72 INSERT |
| 4 | `URBA_ROLLBACK.sql` | borra lo que la carga agregó |

`URBA_PASO3_DELETE.sql` deja escrito el borrado del paso 3 con su count por torneo.

---

## Lo que no se tocó

Los otros 126 torneos · `clubs` · `club_external_ids` · el `ruleset` · los 2.757
`match_events` · la visibilidad de nada · el cron.

**El ruleset sigue pendiente** como ticket aparte: 46 torneos lo declaran en la
forma vieja (`standings.bonus_rules`, `tiebreakers` como objeto). No bloquea nada
—los 46 tienen fase con la forma que el motor lee, y con `points_autocalculated =
false` el bonus derivado ni se evalúa— pero es peso muerto que conviene limpiar.
