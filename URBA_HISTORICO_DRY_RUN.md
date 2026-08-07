# URBA histórico 2021-2025 — corrida en seco

**No se escribió nada.** Este informe es para decidir si se ejecuta.

Los partidos salen de la caché en disco de los 811 torneos ya bajados:
esta corrida no le pide un solo byte a la API de URBA.


## El corte: ¿haría falta crear algún club?

El mapeo de clubes se generó del inventario **2021-2026**, así que la carga
histórica no tiene que crear ni uno. Si este número no es cero, no se ejecuta.

| | |
|---|---:|
| **triples sin mapeo** | **0** |
| partidos que se caen por eso | 0 |
| partidos con el mismo `external_id` que uno ya cargado | 0 |

## Qué se crearía, por año

| año | torneos | fases | partidos | participantes | omitidos (sin Bye) | primera fecha | última fecha |
|---|---:|---:|---:|---:|---:|---|---|
| 2021 | 141 | 141 | 3876 | 1113 | 0 | 2021-07-17 | 2021-12-08 |
| 2022 | 141 | 141 | 8210 | 1375 | 0 | 2022-03-19 | 2022-11-13 |
| 2023 | 127 | 127 | 8660 | 1351 | 0 | 2023-03-18 | 2023-11-12 |
| 2024 | 127 | 127 | 9886 | 1462 | 1 | 2024-03-16 | 2024-11-16 |
| 2025 | 141 | 141 | 10709 | 1572 | 0 | 2025-03-15 | 2025-11-22 |
| **total** | **677** | **677** | **41341** | **6873** | **1** | | |

De los 677 del inventario: **677 se crearían**, 0 ya están en la base,
0 sin categoría derivable, 0 sin payload.


## Visibilidad

Todo lo histórico entra OCULTO, y eso es política de esta carga, no del conector.

| | |
|---|---:|
| torneos con `is_visible = FALSE` | 677 de 677 |
| torneos con `is_visible = TRUE` | 0 |
| partidos, todos con `is_visible = FALSE` | 41341 |

Y hay un segundo cerrojo, que es el que de verdad manda: la política de RLS
de `tournaments` para el anónimo es `USING (is_active = true)` — **no mira
`is_visible`**. Estos 677 entran con `is_active = false` y `status = draft`,
igual que los 134 de 2026, así que el visitante no los ve por dos motivos
independientes.

Prenderlos después es un UPDATE de una columna. Cargar visible y arrepentirse
ya ensució el home.


## Subcategory

Un torneo sin `subcategory` queda fuera del desplegable de grados y no se
entera nadie. Por eso se cuenta acá y no se descubre después.

| subcategory | torneos |
|---|---:|
| juvenil | 426 |
| Intermedia | 71 |
| **NULL** | 71 |
| Superior | 47 |
| Preintermedia B | 18 |
| Preintermedia A | 18 |
| Preintermedia C | 9 |
| Preintermedia | 7 |
| Preintermedia D | 7 |
| M22 | 2 |
| Preintermedia E | 1 |

**71 en NULL.** Tienen que ser todas competencias de un solo nivel
(femenino, universitario, empresarial, formativo), igual que las 6 de 2026.
Cualquier otra cosa acá es un torneo que hay que mirar:

| category | torneos en NULL |
|---|---:|
| Femenino | 25 |
| Universitario | 21 |
| Empresarial | 11 |
| Formativo | 8 |
| Desarrollo | 6 |

Fuera de esas cinco: **0** (ninguno)

## Category

| category | torneos |
|---|---:|
| otro | 314 |
| Formativo | 85 |
| Desarrollo | 56 |
| Top 12 | 35 |
| Intermedia | 30 |
| Femenino | 26 |
| Primera A | 25 |
| Universitario | 21 |
| Primera B | 20 |
| Top 13 | 18 |
| Primera C | 15 |
| Empresarial | 12 |
| Segunda | 10 |
| Tercera | 10 |

`otro` no es un default ni un faltante: es el valor de las competencias
juveniles, que tienen otra estructura entera (`Grupo N - Zona X` hasta 2023,
`G2 NIVEL x` desde 2024) y no cuelgan de ningún escalón de mayores.


## Age grade

M18 y M20 son de 2021-2023: URBA cambió los cortes de edad después. Entran
igual, son la historia real.

| age_grade | torneos |
|---|---:|
| mayores | 219 |
| M19 | 112 |
| M17 | 105 |
| M16 | 99 |
| M15 | 93 |
| M18 | 31 |
| M20 | 16 |
| M22 | 2 |

## Fases

Los 126 de 2026 se cargaron sin fase y hubo que backfillear: sin fila en
`tournament_phases` y sin `matches.phase_id`, el torneo no tiene tabla y no
falla nada. Acá la fase se planifica junto con el torneo.

| | |
|---|---:|
| fases `Fase Regular` (league, order 1, activa) | 677 |
| con `legs = 1` (partido único) | 515 |
| con `legs = 2` (ida y vuelta) | 162 |
| partidos que quedarían con `phase_id` apuntando a su fase | 41341 |
| partidos que quedarían **sin** `phase_id` | 0 |

`legs` sale de cuántas veces se cruza el par que más se cruza en el payload,
no del nombre del torneo. Contra las 126 fases de 2026 acierta 125.


## Estados que se escribirían

| status | partidos |
|---|---:|
| final | 41332 |
| scheduled | 9 |

Estados fuera del CHECK de `matches.status`: **0** (ninguno)


## Rango de fechas y horas

URBA publica el DÍA, no la hora: todo llega a medianoche local de Buenos
Aires, que en UTC son las **03:00 del MISMO día**. La excepción es la
Superior, que lleva el horario por defecto de las 15:30 → **18:30Z**. Es la
misma regla que ya rige los 10.917 partidos de 2026.

| hora UTC | partidos |
|---|---:|
| 03:00:00 | 36578 |
| 18:30:00 | 4763 |

- primera: `2021-07-17T03:00:00.000Z`
- última: `2025-11-22T03:00:00.000Z`

Partidos cuya fecha cae fuera del año de su torneo: **0**

## Bonus

| | |
|---|---:|
| partidos terminados | 41332 |
| con bonus escrito (`points_autocalculated = false`) | 41332 |
| puntos bonus en total | 25212 |
| no jugados con bonus > 0 (tiene que ser 0) | 0 |
| no jugados con base > 0 (tiene que ser 0) | 0 |

## Omitidos, por motivo

| motivo | partidos |
|---|---:|
| bye | 1948 |
| equipo_ausente_en_el_torneo | 1 |

### Equipos que no resolvieron (0)

Ninguno. **No haría falta crear un solo club.**


### Sin fecha (0)

`matches.date_time` es NOT NULL y no tiene default: sin fecha no hay fila.

Ninguno.


### Mismo club de los dos lados (0)

Dos equipos del mismo club en el mismo torneo apuntando al mismo registro.
El partido cae ruidosamente; el daño silencioso es cuando esos equipos juegan
contra OTROS y el motor los suma en una sola fila de la tabla.

Ninguno.


## Torneos con cobertura incompleta

| external_id | año | torneo | URBA trae | se crean | omitidos |
|---|---:|---|---:|---:|---:|
| `urba:202401` | 2024 | TOP 12 - Superior | 136 | 135 | 1 |

Torneos con cobertura 100%: **676 de 677**
