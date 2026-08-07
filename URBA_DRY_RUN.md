# URBA — corrida en seco

**No se escribió nada.** Este informe es para decidir si se ejecuta.

Torneos evaluados: **134** de 134


## Qué pasaría

| | |
|---|---:|
| partidos que URBA trae (sin Bye) | 10917 |
| **se crearían** | **10917** |
| se actualizarían | 0 |
| sin cambios | 0 |
| **omitidos (sin Bye)** | **0** |

## Participantes

Sin fila en `tournament_participants` el torneo **no tiene tabla**, por
muchos partidos que se carguen: el motor arma el mapa desde ahí y descarta
el partido si alguno de los dos clubes falta, sin error y sin aviso.

| | |
|---|---:|
| **se crearían** | **1487** |
| ya estaban | 80 |
| torneos que quedarían sin ninguno | 0 |

Pares `(tournament_id, club_id)` repetidos dentro del plan: **0**
(`tournament_participants` no tiene UNIQUE: la protección es el `NOT EXISTS`
del INSERT más este chequeo, nunca un `ON CONFLICT` sin índice donde apoyarse.)


## Bonus

URBA publica los cuatro bonus por partido. El ofensivo **no se puede derivar**
—es "4+ tries" y URBA no publica tries— así que o viene del campo o no existe.

| | |
|---|---:|
| partidos terminados | 6198 |
| con bonus escrito (`points_autocalculated = false`) | 6198 |
| puntos bonus en total | 4694 |
| partidos no jugados con bonus (tiene que ser 0) | 0 |
| filas con base congelado (tiene que ser 0) | 0 |

## Estados que se escribirían

| status | partidos |
|---|---:|
| final | 6198 |
| scheduled | 4719 |

Estados fuera del CHECK de `matches.status`: **0** (ninguno)


## Rango de fechas resultante

Para confirmar que no hay corrimiento de día: `playdate` viene a medianoche
local de Buenos Aires, así que en UTC tiene que dar **03:00 del MISMO día**.

- primera: `2026-03-14T03:00:00.000Z`
- última: `2026-11-08T03:00:00.000Z`
- horas distintas presentes: 03:00:00
  (URBA no publica hora de partido: se espera una sola, `03:00:00`)

## Omitidos, por motivo

| motivo | partidos |
|---|---:|
| bye | 1220 |

### Equipos que no resolvieron (0)

Cada uno con el triple que se intentó. **No se creó ningún club.**

Ninguno.


### Sin fecha (0)

`matches.date_time` es NOT NULL y no tiene default: sin fecha no hay fila.

Ninguno.


## Por torneo

| external_id | torneo | URBA trae | resueltos | crear | actualizar | omitidos | particip. |
|---|---|---:|---:|---:|---:|---:|---:|
| `urba:2025176` | Top 14 de la URBA | 182 | 182 | 182 | 0 | 0 | +0 |
| `urba:2025177` | Primera "A" de la URBA | 182 | 182 | 182 | 0 | 0 | +0 |
| `urba:2025178` | Primera "B" de la URBA | 182 | 182 | 182 | 0 | 0 | +0 |
| `urba:2025179` | Primera "C" de la URBA | 182 | 182 | 182 | 0 | 0 | +0 |
| `urba:2025180` | URBA: SEGUNDA - Superior | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025181` | URBA: TERCERA - Superior | 110 | 110 | 110 | 0 | 0 | +11 |
| `urba:2025182` | URBA: DESARROLLO - Superior | 90 | 90 | 90 | 0 | 0 | +10 |
| `urba:2025184` | URBA: TOP 14 - Intermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025185` | URBA: TOP 14 - Preintermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025186` | URBA: TOP 14 - Preintermedia B | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025187` | URBA: PRIMERA A - Intermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025188` | URBA: PRIMERA A - Preintermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025189` | URBA: PRIMERA A - Preintermedia B | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025190` | URBA: PRIMERA B - Intermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025191` | URBA: PRIMERA B - Preintermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025192` | URBA: PRIMERA B - Preintermedia B | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025193` | URBA: PRIMERA C - Intermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025195` | URBA: PRIMERA C - Preintermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025196` | URBA: SEGUNDA - Intermedia | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025197` | URBA: TOP 14 - Preintermedia C | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025198` | URBA: TOP 14 - Preintermedia D | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025199` | URBA: TERCERA - Intermedia | 110 | 110 | 110 | 0 | 0 | +11 |
| `urba:2025200` | URBA: TOP 14 - Preintermedia E | 132 | 132 | 132 | 0 | 0 | +12 |
| `urba:2025201` | URBA: TOP 14 - Preintermedia F | 156 | 156 | 156 | 0 | 0 | +13 |
| `urba:2025202` | URBA: PRIMERA A - Preintermedia C | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025203` | URBA: PRIMERA A - Preintermedia D | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025204` | URBA: PRIMERA B - Preintermedia C | 56 | 56 | 56 | 0 | 0 | +8 |
| `urba:2025205` | URBA: PRIMERA C - Preintermedia B | 90 | 90 | 90 | 0 | 0 | +10 |
| `urba:2025206` | URBA: TOP 14 - Menores de 22 | 182 | 182 | 182 | 0 | 0 | +14 |
| `urba:2025207` | URBA: DESARROLLO - Intermedia | 90 | 90 | 90 | 0 | 0 | +10 |
| `urba:2025208` | URBA: FEMENINO - TOP 9 | 72 | 72 | 72 | 0 | 0 | +9 |
| `urba:2025209` | URBA: FEMENINO - Primera División | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025210` | URBA: FEMENINO - Segunda División | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025212` | URBA: Rugby Universitario - Campeonato | 91 | 91 | 91 | 0 | 0 | +14 |
| `urba:2025213` | URBA: MENORES DE 19 - G2 NIVEL 1 "A" | 66 | 66 | 66 | 0 | 0 | +0 |
| `urba:2025214` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025215` | URBA: MENORES DE 19 - G2 NIVEL 1 "B" | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025216` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025217` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025218` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025219` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025220` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025224` | URBA: Menores de 19 - Primera Rueda - G1 A | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025225` | URBA: Menores de 19 - Primera Rueda - G1 B | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025226` | URBA: Menores de 19 - Primera Rueda - G1 Forma | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025227` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 77 | 77 | 77 | 0 | 0 | +14 |
| `urba:2025228` | URBA: Menores de 19 - Primera Rueda - G2 NIVEL | 77 | 77 | 77 | 0 | 0 | +14 |
| `urba:2025229` | URBA: Menores de 19 - Primera Rueda - G1 Forma | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025230` | URBA: Menores de 19 - Primera Rueda - G1 Forma | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025231` | URBA: Menores de 17 - G2 NIVEL 1 "A" | 66 | 66 | 66 | 0 | 0 | +0 |
| `urba:2025232` | URBA: Menores de 17 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025233` | URBA: Menores de 17 - G2 NIVEL 1 "B" | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025234` | URBA: Menores de 17 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025235` | URBA: Menores de 17 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025236` | URBA: Menores de 17 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025237` | URBA: Menores de 17 - Primera Rueda - G1 A | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025238` | URBA: Menores de 17 - Primera Rueda - G1 B | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025239` | URBA: Menores de 17 - Primera Rueda - G1 C | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025240` | URBA: Menores de 17 - Primera Rueda - G1 Forma | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025241` | URBA: Menores de 17 - Primera Rueda - G1 Forma | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025242` | URBA: Menores de 17 - Primera Rueda - G1 Forma | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025243` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025244` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025245` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025246` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025247` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025248` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025249` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025250` | URBA: Menores de 16 - Primera Rueda - G2 NIVEL | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025251` | URBA: Menores de 16 - Primera Rueda - G1 A | 66 | 66 | 66 | 0 | 0 | +13 |
| `urba:2025252` | URBA: Menores de 16 - Primera Rueda - G1 B | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025253` | URBA: Menores de 16 - Primera Rueda - G1 Forma | 21 | 21 | 21 | 0 | 0 | +7 |
| `urba:2025254` | URBA: Menores de 16 - Primera Rueda - G1 Forma | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025255` | URBA: Menores de 15 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025256` | URBA: Menores de 15 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025257` | URBA: Menores de 15 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025258` | URBA: Menores de 15 - Primera Rueda - G2 NIVEL | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025259` | URBA: Menores de 15 - Primera Rueda - G2 NIVEL | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025260` | URBA: Menores de 15 - Primera Rueda - G2 NIVEL | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025261` | URBA: Menores de 15 - Primera Rueda - G1 A | 66 | 66 | 66 | 0 | 0 | +13 |
| `urba:2025262` | URBA: Menores de 15 - Primera Rueda - G1 B | 77 | 77 | 77 | 0 | 0 | +14 |
| `urba:2025263` | URBA: Menores de 15 - Primera Rueda - G1 Forma | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025264` | URBA: Menores de 15 - Primera Rueda - G1 Forma | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025265` | URBA: Rugby Formativo - Campeonato | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025266` | URBA: Rugby Formativo - Primera Division | 42 | 42 | 42 | 0 | 0 | +7 |
| `urba:2025267` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025268` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025269` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025270` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025271` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025272` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025273` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +13 |
| `urba:2025274` | URBA: Menores de 19 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +13 |
| `urba:2025275` | URBA: Menores de 19 - Segunda Rueda - G2 Desar | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025276` | URBA: Menores de 19 - Segunda Rueda - G2 Desar | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025277` | URBA: Menores de 19 - Segunda Rueda -  G1 Gana | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025278` | URBA: Menores de 19 - Segunda Rueda - G1 Desar | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025279` | URBA: Menores de 19 - Segunda Rueda - Formativ | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025282` | URBA: Menores de 19 - Segunda Rueda - Formativ | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025283` | URBA: Menores de 17 - Segunda Rueda - G2 Ganad | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025284` | URBA: Menores de 17 - Segunda Rueda - G2 Ganad | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025285` | URBA: Menores de 17 - Segunda Rueda - G2  Inte | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025286` | URBA: Menores de 17 - Segunda Rueda - G2 Inter | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025287` | URBA: Menores de 17 - Segunda Rueda - G2  Desa | 66 | 66 | 66 | 0 | 0 | +13 |
| `urba:2025288` | URBA: Menores de 17 - Segunda Rueda - G2 Desar | 66 | 66 | 66 | 0 | 0 | +13 |
| `urba:2025289` | URBA: Menores de 17 - Segunda Rueda - G1 Ganad | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025290` | URBA: Menores de 17 - Segunda Rueda - G1 Inter | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025291` | URBA: Menores de 17 - Segunda Rueda - G1 Desar | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025292` | URBA: Menores de 17 - Segunda Rueda - Formativ | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025293` | URBA: Menores de 17 - Segunda Rueda - Formativ | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025294` | URBA: Menores de 17 - Segunda Rueda - Formativ | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025295` | URBA: Menores de 16 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025296` | URBA: Menores de 16 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025297` | URBA: Menores de 16 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025298` | URBA: Menores de 16 - Segunda Rueda - G2 Nivel | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025299` | URBA: Menores de 16 - Segunda Rueda - G2 Nivel | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025300` | URBA: Menores de 16 - Segunda Rueda - G2 Nivel | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025301` | URBA: Menores de 16 - Segunda Rueda - G2 Desar | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025302` | URBA: Menores de 16 - Segunda Rueda - G2 Desar | 55 | 55 | 55 | 0 | 0 | +11 |
| `urba:2025303` | URBA: Menores de 16 - Segunda Rueda - G1 Ganad | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025304` | URBA: Menores de 16 - Segunda Rueda - G1 Desar | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025305` | URBA: Menores de 16 - Segunda Rueda - Formativ | 21 | 21 | 21 | 0 | 0 | +7 |
| `urba:2025306` | URBA: Menores de 16 - Segunda Rueda - Formativ | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025307` | URBA: Menores de 15 - Segunda Rueda - G2 A | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025308` | URBA: Menores de 15 - Segunda Rueda - G2 A Eq  | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025309` | URBA: Menores de 15 - Segunda Rueda - G2 B | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025310` | URBA: Menores de 15 - Segunda Rueda - G2 B Eq  | 66 | 66 | 66 | 0 | 0 | +12 |
| `urba:2025311` | URBA: Menores de 15 - Segunda Rueda - G2 Desar | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025312` | URBA: Menores de 15 - Segunda Rueda - G2 Desar | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025313` | URBA: Menores de 15 - Segunda Rueda - G1 A | 77 | 77 | 77 | 0 | 0 | +14 |
| `urba:2025314` | URBA: Menores de 15 - Segunda Rueda - G1 B | 77 | 77 | 77 | 0 | 0 | +14 |
| `urba:2025315` | URBA: Menores de 15 - Segunda Rueda - Formativ | 45 | 45 | 45 | 0 | 0 | +10 |
| `urba:2025316` | URBA: Menores de 15 - Segunda Rueda - Formativ | 36 | 36 | 36 | 0 | 0 | +9 |
| `urba:2025317` | URBA: Menores de 15 - Segunda Rueda - Formativ | 21 | 21 | 21 | 0 | 0 | +6 |
