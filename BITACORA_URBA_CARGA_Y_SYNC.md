# URBA — de la corrida en seco a la sincronización automática

Segunda parte de la bitácora. La primera terminó con un conector listo y nada
ejecutado. Ésta arranca con el mapeo cerrado y termina con 10.917 partidos
cargados, ocho tablas de posiciones que dan exactas contra la API de la unión, y
un endpoint de sincronización escrito y apagado esperando que se publiquen los
torneos.

Fecha: 2026-08-05.

---

## Cómo se movió

Cada verificación encontró algo que la anterior no podía ver. Ése es el hilo:

1. **La corrida en seco** contra el mapeo repuntado → queda una colisión, y es una fila.
2. **Las tres tablas** contra `/api/positions` → el mapeo está perfecto y los puntos dan cero.
3. **El bonus** → URBA lo publica por partido y el conector no lo leía.
4. **Los participantes** → 126 torneos darían la tabla vacía.
5. **La ejecución** → dos `NOT NULL` que la corrida en seco no podía ver.
6. **El motor real leyendo la base** → 992 partidos guardados y mudos por `phase_id`.
7. **La decisión** → en los 8 torneos manda URBA; y ahí apareció el prode.
8. **El ranking** → un bug que lo tenía stale hacía 18 días.
9. **La sincronización** → y una comparación de resultados que mentía.

---

## Parte 1 — La segunda corrida en seco

El mapeo llegó cerrado: 2.036 clubes, 1.539 triples, cero compartidos. De seis
cifras objetivo, cinco quedaron a **una sola fila**, y siempre la misma:

```
98|universitario|    -> barcelo-rugby
98|universitario|B   -> barcelo-rugby      <- los dos al mismo registro
```

`Barcelo Rugby B` no había recibido registro dedicado y jugaba contra sí mismo.
Con eso resuelto: **10.917 partidos, 0 omitidos, 134 de 134 torneos al 100%**.

Los 12 torneos que antes omitían pasaron a resolver enteros **sin tocar una línea
del conector**, que era lo que había que probar.

---

## Parte 2 — Las tablas, y lo que faltaba

Se compararon tres torneos contra `/api/positions/{id}`: uno de Superior, uno de
Intermedia y uno juvenil terminado.

**El mapeo dio perfecto: 40 de 40.** Cada fila de URBA resolvió a su `clubs.id`,
incluidos los registros nuevos (`sic-intermedia`, `club-newman-m19-a`).

**Todo lo que sale de los partidos dio exacto**: partidos jugados, ganados, puntos
a favor y en contra, 14/14 y 12/12 en los tres.

**Los puntos dieron 0/14.** Y el porqué estaba a la vista:

| | |
|---|---|
| lo que URBA publica **por partido** | `local_team_offensive_bonus`, `defensive_bonus` y sus pares |
| lo que el conector leía | nada de eso |

CUBA perdía 11 puntos, La Plata 9. Sumando los cuatro campos: **14/14, 14/14 y
12/12 en puntos y en orden**.

El bonus ofensivo **no se puede derivar** —es "4+ tries" y URBA no publica tries,
sólo la bandera ya resuelta—, así que o viene del campo o no existe.

### Dos agujeros más, del mismo tirón

**126 de 134 torneos no tenían participantes.** El motor arma la tabla desde
`tournament_participants` y descarta el partido si falta alguno de los dos clubes.
Medido en Intermedia: 119 partidos terminados, clubes correctos, tabla vacía.

**El `ruleset` está escrito en una forma que el motor no lee** (`standings.bonus_rules`,
`tiebreakers` como objeto). 46 torneos de la base la tienen. Pero los 46 tienen
fase, y las fases traen la forma correcta: **torneos que declaran bonus y no lo
reciben: 0**. Es peso muerto, no un defecto vivo. Y no bloquea: con
`points_autocalculated = false` el motor ni evalúa el bonus derivado —comprobado
rehaciendo la verificación con el bonus del reglamento activado, byte a byte
idéntico.

---

## Parte 3 — La ejecución

El rollback se escribió **antes** de correr. La primera tanda abortó dos veces sin
escribir una fila, y la guarda de "si falla la primera, se aborta" hizo su trabajo:

| | |
|---|---|
| `matches.home_base_points` | **NOT NULL** |
| `matches.home_bonus_points` | **NOT NULL** |

Mi diseño de dejar el base en NULL para que el motor lo derivara **era imposible**,
y no hay forma de tener las dos cosas: el único camino del motor para un bonus que
no puede derivar lee el base de la fila. Así que va materializado en
`PUNTOS_URBA = {4,2,0}`, **congelado**, con el costo escrito en el código.

Ninguna corrida en seco podía encontrar eso: no escribía.

Cargado en 134 tandas, una por torneo, cada una atómica: **10.917 partidos y 1.487
participantes, cero tandas fallidas.**

### Las 24 comprobaciones

Todas contra la base, no contra el plan: 10.917 de URBA · 14.815 total · 3.898
preexistentes intactos · 6.198 final / 4.719 scheduled · 0 con score fuera de
final · 0 con bonus fuera de final · 0 huérfanos · 0 visibles · fechas 2026-03-14
a 2026-11-08 con **una sola hora, `03:00:00`**.

---

## Parte 4 — El motor real, y los 992 mudos

Recalcular las tablas con `StandingsEngine` leyendo la base —no una réplica—
encontró lo que la verificación sobre el plan no podía ver:

`GET /api/db/standings` filtra por **`phase_id`**, y las filas cargadas iban con
`phase_id` NULL.

| torneo | entran | resultado |
|---|---|:--|
| Top 14 | 119 a mano · **0 de URBA** | exacta, pero por el fixture manual |
| Intermedia | **119 de URBA** · 0 a mano | **exacta — ésta sí es la carga** |
| M19 | 36 a mano · **0 de URBA** | difiere, y ya difería antes |

No había doble conteo —era el riesgo real, con 1.256 partidos manuales visibles en
8 torneos— pero **992 partidos habían quedado guardados y mudos**. Los 8 torneos
con fase eran exactamente los 8 que ya tenían fixture manual y los 8 que ya tenían
participantes.

---

## Parte 5 — En los 8 manda URBA

Seis pasos, en orden, y el tercero se frenó solo.

### Las formaciones

49 partidos del Top 14 tenían formación cargada a mano. Emparejados por (día en
hora de Buenos Aires, local, visitante): **49 de 49 con exactamente uno**, cero
ambiguos. Copiadas: 1.616 jugadores, el mismo número que en el origen.

Apareció algo que no era mío: **28 de los 49 tenían los contadores de planilla en
0** con la formación cargada. Es dato derivado —el contador es el largo del array—
y el origen se iba a borrar, así que se dejaron coherentes en el destino.

### El prode

El DELETE del Top 14 falló con un **23514**. Sus 182 partidos manuales sostenían
**182 `prode_events`** (119 puntuados, 63 programados) con **253 predicciones de
usuarios**. El FK pone `local_match_id` en NULL al borrar y el CHECK lo rechaza.

Freno con 4 de 8 borrados. Resuelto: los 182 repuntados al partido de URBA
equivalente —**182/182, cero ambiguos**— y recién entonces el borrado. Los otros 7
torneos no tenían un solo evento; por eso 4 habían borrado a la primera.

### Lo demás

- **1.256 partidos manuales borrados**, con volcado previo como INSERT.
- **992 `phase_id` asignados.** Sólo el Top 14 tiene dos fases; URBA no trae
  ninguna ronda de playoff en ninguno de los 8 (26 "Fecha N" en Superior, 11 en
  juveniles), así que la elección salió del dato.
- **72 participantes ajenos borrados**, ninguno con la marca `urba-import`: eran
  todos previos, del campeonato vecino.

### El resultado

**Los 8 torneos dan exactos en puntos y en orden.** Los 4 juveniles pasaron de
mostrar una tabla equivocada —Newman A con 9 puntos donde URBA dice 47— a dar
12/12.

---

## Parte 6 — El ranking

### Lo que se llevó el borrado

`club_ranking_match_applications.match_id` es **CASCADE**; los tres punteros son
**SET NULL**. De los 1.256 borrados, **231 eran elegibles**. Y no quedó una sola
fila colgando: 0 aplicaciones huérfanas, 0 punteros rotos. Los FK hicieron su
trabajo.

### El bug

```ts
.not('stale_from_match_id', 'is', null)   // criterio de "pendiente"
```

Esa columna es FK con **ON DELETE SET NULL**. Si se borra el partido que marcó el
stale, el puntero se vacía y **el ranking desaparece de la consulta sin haberse
reconstruido**. Estado encontrado: puntero NULL, fecha `2026-07-18`, motivo
intacto. **Dieciocho días stale y el cron no lo veía.**

Arreglado: el predicado mira los tres marcadores, que `markRankingStale` escribe
juntos y el rebuild limpia juntos.

### Y la trampa del snapshot

`syncClubRankingsForMatchUpdate(id)` sin el snapshot previo calcula
`hasKnownMatchChange = false`, y si el partido ya tenía aplicación **no hace nada y
sigue**. Una corrección de resultado quedaría ignorada en silencio.

### El recálculo

Por el camino real del cron. 545 s. **570 → 824 aplicaciones, y 824 == 824 partidos
elegibles**: consistencia exacta.

93 clubes cambiaron de rating. **66 de ellos no tienen una sola aplicación de
URBA** —incluidos los dos que más se movieron, que son de Mendoza y Rosario—: el
grueso del movimiento es el ranking poniéndose al día tras 18 días stale, no la
carga.

### La paridad

Los 231 de URBA contra los 231 manuales que reemplazaron: **224 idénticos**. Los 7
restantes no son ambigüedad, son datos distintos, y en los 7 **el fixture manual
estaba mal**: 6 resultados equivocados y **1 partido con local y visitante
invertidos**. Ese último pesa: con `home_advantage = 3`, invertir los lados cambia
el delta que reparte.

### Lo que cuelga y no se rompió

`club_trainings` 6 filas (SET NULL, 0 rotas) · `user_notifications` 16.280
(CASCADE, 0 huérfanas) · `club_rugby_performance_records` **vacía y sin columna de
partido** · `match_events` intacta en 2.757.

---

## Parte 7 — La sincronización

### Quién se entera de qué

| sistema | cómo | ¿hay que llamarlo? |
|---|---|---|
| notificaciones | trigger `AFTER UPDATE OF status` | **no** |
| prode | cron cada 5 min que sondea `matches` | **no** |
| ranking | `syncClubRankingsForMatchUpdate` | **sí**, y con el snapshot previo |

El trigger es `AFTER UPDATE`, no INSERT: **por eso los 6.198 partidos cargados como
final no generaron una sola notificación**.

### La frecuencia, con el dato

- **Se juega sólo sábado y domingo**: 2.935 partidos en domingo, 1.782 en sábado,
  **cero de lunes a viernes**. Un cron horario haría 120 corridas inútiles por semana.
- **No hay vivo que seguir**: URBA no publica marcador en curso.
- **Cuándo aparece el resultado**: mediana **19,4 h** desde la medianoche local del
  día del partido — 1 a 5 h después del final. **76,1% queda firme dentro de las
  24 h**; el resto se corrige más tarde, p90 a las **399 h (16 días)**.

De ahí: dos ventanas de jornada (sáb y dom, 18:00–02:00 BA, cada 20 min) más un
barrido diario para la cola de correcciones.

### El alcance

Costo medido: **617 ms por pedido**, 258 KB promedio.

| | torneos | tiempo | ¿entra en 60 s? |
|---|---:|---:|:--|
| barrido completo | 134 | **~116 s** | **no** |
| jornada del domingo | 55 | ~48 s | justo |

El alcance no se puede fijar por cantidad. **Presupuesto de tiempo con rotación
por reloj** —sin cursor persistido, sin esquema nuevo— y candidatos ordenados por
prioridad.

### Los dos filtros de visibilidad

**Notificaciones: el trigger no filtra.** Leído su cuerpo: ni una referencia a
`is_visible`. Los destinatarios salen de favoritos, y ahí está el techo: **18
usuarios** tienen en favoritos alguno de los 949 clubes que juegan en los 126
torneos ocultos.

Poner `is_visible = FALSE` en los partidos **no alcanza**: ya lo están, los 10.917,
y el trigger no lee esa columna. La guarda quedó en el endpoint (sólo torneos
visibles); el arreglo durable son 4 líneas en el trigger, escritas y sin aplicar.

**Prode: filtra bien, por otra vía.** Sólo sincroniza torneos atados a una
competencia. 26 activas, 19 atadas a un torneo local, **6 a torneos de URBA, las 6
visibles**. Atadas a un torneo oculto: **0**.

### El bug que encontró la pasada en seco

Primera corrida: **1.992 actualizaciones, todas `score`, ninguna finalizando**.

```
Postgres  {"away":25,"home":27}     <- jsonb, claves alfabéticas
conector  {"home":27,"away":25}     <- orden de inserción
```

`JSON.stringify` es sensible al orden. **Todos** los partidos jugados parecían
cambiados. No es cosmético: cada UPDATE de más mueve `updated_at`, y un UPDATE de
`status` dispara el trigger de notificaciones.

Arreglado comparando por valor. Después del fix: **0 actualizaciones, 3.619 sin
cambios** sobre 44 torneos. El sincronizador es idempotente contra lo cargado.

---

## Lo que quedó abierto

**992 partidos quedaron `is_visible = true` y no fue a propósito.** Son exactamente
los que recibieron `phase_id`, los 992 en el mismo minuto, y el PATCH mandaba sólo
`{phase_id}`. Comprobado que se puede volver a `false` y se queda: el salto está
atado al cambio de fase. **En las migraciones del repo no existe ese trigger** — es
uno de los objetos creados a mano que la auditoría ya había documentado.

Dejarlos visibles restaura lo que esos 8 torneos publicados mostraban antes;
ponerlos en `false` los deja en blanco. Es decisión de Santi, igual que publicar
los 126 torneos y los 1.009 clubes.

Y el ticket del `ruleset`: 46 torneos con la forma vieja. No bloquea nada, pero es
peso muerto.

---

## Lo que conviene no olvidar

**Cada capa de verificación encontró algo que la anterior no podía ver.** La
corrida en seco no encontró los `NOT NULL` porque no escribía. La verificación
sobre el plan no encontró el filtro por `phase_id` porque no leía la base. El motor
real no encontró el bug de comparación de scores porque no sincronizaba. Y la
primera pasada en seco del cron encontró 1.992 falsas actualizaciones que ninguna
de las anteriores podía ver. Ninguna sobraba.

**Escribir por PostgREST no dispara nada.** `FixtureService.updateMatch` es el único
camino que avisa al ranking. Cualquier carga masiva futura tiene que marcarlo stale
a mano.

**`is_visible = false` no excluye del ranking.** No lo mira. Los 231 partidos de
URBA ya están contando aunque no se vean en el sitio.

**Un FK con ON DELETE SET NULL sobre la columna que hace de bandera es una bomba de
tiempo.** El ranking llevaba 18 días stale porque la señal de "pendiente" se
borraba sola.

**Los modos de falla silenciosos siguieron siendo el patrón.** El puntero que se
vacía y apaga el cron. La comparación de scores que dice que todo cambió. Los 992
partidos guardados y mudos. Los 126 torneos que darían la tabla vacía. El trigger
que notifica competencias sin publicar. En todos, el sistema decía que estaba bien.

Y la que se repitió de la primera parte: **el umbral se fija antes de medir.** Los
seis números y las tres tablas estaban acordados antes de ejecutar, y por eso la
única fila que faltaba se vio enseguida en vez de discutirse después.
