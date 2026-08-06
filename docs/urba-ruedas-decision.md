# URBA parte competencias en ruedas — decidido: TORNEOS SEPARADOS

> **DECISIÓN (2026-08-05).** Se cargan como torneos separados. El dato que decide
> es el campo de equipos: con solapamientos de 2 sobre 9, una tabla fusionada
> ordena clubes que nunca se enfrentaron — no es una vista fea, es una afirmación
> falsa. Y sería una afirmación NUESTRA: la fuente ya los modela separados. Que
> `tournament_participants` sea por torneo lo remata, porque no hay forma honesta
> de renderizar la unión de dos planteles.
>
> Se guardan dos cosas para no perder la relación, las dos implementadas:
>
> 1. **`series_key`** donde el par aparea, y sólo ahí. **91 series, 182 torneos.**
>    Los **342** restantes quedan sin vínculo y contados — un vínculo inventado es
>    peor que ninguno, la misma disciplina que `ambiguo` → nunca `existe`.
> 2. **Marcador sintetizado.** Un torneo sin marcador con hermano "Segunda Rueda"
>    se muestra como "Primera Rueda": **16 casos**. Vive en `rueda_mostrada`; no
>    pisa `nombre` ni `rueda`, que son lo que dijo la fuente.
>
> Abajo queda el informe con el que se tomó la decisión.

---


URBA publica muchas competencias como **dos torneos con ids distintos**:

```
Menores de 15 - Primera Rueda - G1 A     id 2025261
Menores de 15 - Segunda Rueda - G1 A     id 2025313
```

G22 tiene `tournament_phases`, que sería el lugar natural para eso. Pero también
podrían ser dos torneos. **La decisión es del usuario.** Acá están los tres datos
que pediste para tomarla.

---

## a) Cuántos torneos están partidos en ruedas

Sobre los **811** torneos de 2021–2026:

| año | primera | segunda | otra rueda | única |
|---|---:|---:|---:|---:|
| 2021 | 39 | 73 | 0 | 29 |
| 2022 | 12 | 44 | 2 | 83 |
| 2023 | 1 | 45 | 0 | 81 |
| 2024 | 48 | 48 | 0 | 31 |
| 2025 | 52 | 48 | 4 | 37 |
| 2026 | 49 | 49 | 0 | 36 |
| **total** | **201** | **307** | **6** | **297** |

**514 de 811 llevan marcador de rueda** — el 63%. No es un caso de borde.

### La asimetría es el primer problema

**307 "segunda rueda" contra 201 "primera".** Faltan más de cien primeras
mitades. La causa no es que falten torneos: es que **la primera rueda muchas
veces se publica sin el marcador**. En 2023 hay 1 "primera rueda" y 45 "segunda".

Consecuencia directa: **aparear las dos mitades por el nombre no funciona.** De
las 201 primeras, sólo **75** encuentran su segunda con el mismo nombre base, y
quedan **358 mitades sueltas**:

| año | pares apareados por nombre |
|---|---:|
| 2021 | 39 de 39 |
| 2022 | 12 de 12 |
| 2023 | 1 de 1 |
| 2024 | 11 de 48 |
| 2025 | 10 de 52 |
| 2026 | 2 de 49 |

En 2024–2026 el nombre de las dos mitades **cambia entre una y otra** (cambia la
zona, el nivel o el grupo), así que ni siquiera con el marcador se puede
reconstruir el par automáticamente. Si se elige el modelo de fases, alguien tiene
que decidir a mano qué segunda rueda es continuación de qué primera.

---

## b) La segunda rueda arranca de cero — y además cambia el campo

Sondeo de `/api/positions/{id}` sobre cuatro pares:

**Los puntos NO se arrastran.** Si la segunda rueda continuara la primera, los
`played` se acumularían. No pasa:

| par | `played` primera | `played` segunda |
|---|---:|---:|
| M16 G1 Zona C 2021 (`2021029`/`2021030`) | 6 | 7 |
| Juveniles M19 GII Desarrollo 2025 (`2025059`/`2025119`) | 11 | 10 |

Cada rueda tiene su propia tabla, con `championship_id` propio, `team_id` propios
—los ids de equipo son distintos entre las dos mitades— y los contadores en cero.

**Y hay algo más grande, que el enunciado no anticipaba: el campo de equipos no
es el mismo.** El solapamiento de clubes entre las dos mitades es siempre
parcial, nunca total:

| par | clubes 1ª | clubes 2ª | en común |
|---|---:|---:|---:|
| M16 G1 Zona C 2021 | 9 | 8 | **2** |
| M15 G1 Zona A 2022 | 12 | 11 | **7** |
| Juveniles M19 GII Desarrollo 2025 | 12 | 11 | **9** |
| M15 G1 A 2026 | 13 | 14 | **6** |

La segunda rueda **reagrupa**: es la reclasificación por nivel que hace el rugby
juvenil argentino después de la primera mitad del año. No es "la misma liga
jugando la revancha".

---

## c) Qué implica cada opción para el motor de posiciones

El motor guarda las tablas en `tournament_standings`, particionadas por
`tournament_id` + `phase_id` + `group_id`, y `fetchTournamentData` las trae
filtrando por esas mismas claves. O sea: **las dos opciones son expresables**, y
la diferencia no es técnica sino de qué queda dicho.

### Opción A — dos torneos separados

- Se cargan tal como URBA los publica. `external_id` distinto para cada uno.
- El motor no necesita un solo cambio: cada torneo tiene su tabla y ya.
- El apareamiento de mitades no hace falta nunca. Los 100+ huérfanos de nombre
  dejan de ser un problema.
- **Costo:** el usuario que busca "Menores de 15 G1 A" encuentra dos torneos y
  tiene que saber que son el mismo año partido al medio. La vitrina y el
  historial de un club muestran dos entradas donde hubo una temporada.

### Opción B — un torneo con dos fases

- Una fase por rueda. La tabla por fase ya funciona sin tocar nada, porque
  `phase_id` ya particiona.
- Queda dicho que son la misma temporada, que es lo que un hincha entiende.
- **Costo 1:** hay que aparear las mitades A MANO en 2024–2026, donde el nombre
  no alcanza (126 de 149 primeras no encuentran par).
- **Costo 2, y es el que pesa:** los participantes de las dos fases **no son los
  mismos**. `tournament_participants` es por torneo, no por fase, así que un
  torneo de dos ruedas tendría la unión de los dos campos —hasta 15 clubes donde
  cada rueda tuvo 8— y cualquier pantalla que liste "los equipos del torneo"
  mostraría clubes que jugaron sólo media temporada, sin forma de distinguirlos.

### Opción C — dos torneos, vinculados por metadato

- Se cargan separados (opción A) y se agrega el vínculo como dato, no como
  estructura: un campo que diga "esta es la 2ª rueda de aquel torneo".
- Deja la puerta abierta a mostrarlos juntos más adelante sin comprometer el
  modelo ahora, y no obliga a aparear las 126 mitades antes de poder cargar nada.
- **Costo:** un campo nuevo, y el apareamiento manual sigue pendiente — pero
  deja de ser bloqueante.

---

## Lo que se eligió: C

Torneos separados (A) **más** el vínculo guardado como dato (C). El dato que más
pesa no es el de los puntos sino el del **campo de equipos**: que la segunda
rueda tenga otros clubes hace que "dos fases del mismo torneo" afirme algo que no
es cierto. No es la misma competencia en dos tramos, es una reclasificación.

La opción B además no era ejecutable sin trabajo manual previo: **126 de las 149
primeras ruedas de 2024–2026 no encuentran su par por nombre.**

### Lo que quedó implementado

| | |
|---|---:|
| Series armadas (todas de dos miembros) | **91** |
| Torneos con `series_key` | **182** de 811 |
| Marcadores "Primera Rueda" sintetizados | **16** |
| Mitades marcadas sin vínculo | **342** |

`buildUrbaSeriesKey()` vive en
[externalId.ts](../src/lib/integrations/urba/externalId.ts) con el resto de la
identidad de URBA, con tests, por el mismo motivo que los `external_id`: el
conector y el inventario tienen que armar la misma clave o el vínculo se pierde
en silencio. La clave se ancla al **id más bajo** de la serie y no al nombre —
el nombre es justamente lo único que URBA escribe distinto en cada mitad.

### Lo que la serie NO hace

No fusiona tablas, no fusiona planteles y no afirma que las dos ruedas sean una
competencia. Es un puntero para que la pantalla pueda ofrecer "Segunda Rueda de
este torneo" y nada más.
