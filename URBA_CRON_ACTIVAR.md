# URBA — la sincronización automática

Las cinco entradas de cron están en `vercel.json` y el conector escribe solo. Este
documento es el runbook: qué hace cada corrida, qué mirar cuando algo no cuadra, y
las decisiones que quedaron tomadas.

## Las entradas de cron

```json
{ "path": "/api/cron/urba-sync", "schedule": "*/20 18-23 * * 6,0" },
{ "path": "/api/cron/urba-sync", "schedule": "*/20 0-5 * * 0,1"  },
{ "path": "/api/cron/urba-sync", "schedule": "0 9 * * *"  },
{ "path": "/api/cron/urba-sync", "schedule": "0 10 * * *" },
{ "path": "/api/cron/urba-sync", "schedule": "0 11 * * *" }
```

**El `path` va SIN query string, y eso no es cosmética.** Las cinco entradas
llevaban `?scope=…` y Vercel no las invocó nunca: el path de un cron no admite
`?`, así que la entrada se descarta entera. El síntoma no fue un error sino
silencio — cero corridas, cero logs, la base quieta. El fin de semana del 15 y 16
de agosto no sincronizó una sola vez y los resultados entraron a mano el lunes a
la noche. El scope ahora sale del header `x-vercel-cron-schedule`
(`resolverScope` en la ruta); el query string sigue andando para dispararlo a
mano con curl. Si alguna vez volvés a ver un `?` acá, ése es el bug.

Los horarios son **UTC**, que es lo que usa Vercel. En hora de Buenos Aires (UTC-3):

| entrada | UTC | Buenos Aires |
|---|---|---|
| jornada (tarde/noche) | sáb y dom 18:00–23:59 | sáb y dom 15:00–20:59 |
| jornada (madrugada) | dom y lun 00:00–05:59 | sáb y dom 21:00–02:59 |
| barrido | todos los días 09, 10 y 11 | todos los días 06, 07 y 08 |

**El domingo está cubierto igual que el sábado**, y conviene verlo escrito porque
el `dayOfWeek` de las dos ventanas no coincide y da la impresión contraria: la de
la tarde dice `6,0` y la de la madrugada `0,1`, pero es el MISMO día visto desde
dos husos. `0` en la ventana de la madrugada es la noche del sábado, no la del
domingo; la del domingo es el `1`. Corrido a hora de Buenos Aires queda:

| día en Buenos Aires | cobertura |
|---|---|
| sábado | 06, 07, 08 · 15:00 → 02:59 del domingo, cada 20' |
| domingo | 06, 07, 08 · 15:00 → 02:59 del lunes, cada 20' |

Simétrico, y hace falta que lo sea: en 2026 la URBA juega MÁS el domingo que el
sábado en cantidad de partidos por jornada (247–303 contra 192), aunque el sábado
sume más en el total de la temporada.

El hueco de 09:00 a 14:59 es a propósito en los dos días, por lo que sigue.

**El barrido son tres entradas y la hora de cada una importa.** El catálogo se
parte en tres y qué parte toca sale de `(día + hora) % 3`
(`parteDelBarrido` en `syncPlan.ts`): separadas por una hora, las tres corridas
caen en las tres partes y el catálogo entero se barre todos los días. Sacar dos
entradas no rompe nada —el barrido sigue rotando de a una parte por día— pero la
cola de correcciones pasa a tardar tres días.

Los `schedule` del barrido están declarados **también** en la ruta
(`SCHEDULES_BARRIDO`): se comparan contra el header `x-vercel-cron-schedule` para
resolver el scope cuando Vercel no pasa el query string. Si se cambian acá, hay
que cambiarlos allá.

## Por qué estas ventanas

Medido sobre los partidos cargados: en la URBA se juega **sólo sábado y domingo**
(cero partidos de lunes a viernes). URBA no publica marcador en vivo —`fulfilled`
pasa a true recién cuando cargan el resultado—, así que durante el partido no hay
nada que traer. La mediana de publicación son 19,4 h desde la medianoche local del
día del partido, o sea 1 a 5 h después del final. El 76,1% queda firme dentro de
las 24 h; el resto se corrige más tarde, con p90 a las 399 h (16 días).

La ventana de jornada levanta ese 76%; el barrido, la cola de correcciones.

**La ventana del fin de semana abre a las 15:00 BA, no a las 18:00.** Estaba
calibrada sobre la mediana —19,5 h, cómoda adentro— y la mediana esconde la cola
de la izquierda. Medido sobre los 6.424 resultados de 2026: de los 4.747 que URBA
carga el mismo día del partido, el **26% entra antes de las 18:00 BA**, y sólo la
hora de las 16:00 son 966 partidos (20,3%). Uno de cada cuatro resultados ya
estaba publicado en urba.org.ar cuando el cron todavía no había abierto.

El caso testigo: la Fecha 18 del Top 14, que URBA cargó a las 17:24 del sábado
15/8 — treinta y seis minutos antes de la primera corrida del día. La carga más
temprana medida en toda la temporada es a las 15:00 BA, así que la ventana abre
ahí. Más temprano son pedidos a una API que no tiene nada para dar.

## Qué hace una corrida

1. Lee los torneos de la temporada en curso (`season_id = temporadaEnCurso()`,
   que sale del RELOJ, no de una constante).
2. Elige a cuáles les toca: los que juegan hoy o ayer (jornada) o la parte del
   catálogo que corresponde (barrido).
3. Por cada uno le pide el torneo a URBA y compara contra la base.
4. Escribe **sólo lo que cambió**, y sólo las columnas de la lista blanca
   (`CAMPOS_SINCRONIZABLES`): nada de lo que edita una persona se pisa.
5. **Rehace la tabla de posiciones de ese torneo**, ahí mismo y antes de pasar al
   siguiente.
6. Borra los partidos que URBA sacó de su fixture.

El corte por tiempo se toma **entre torneo y torneo**, nunca entre escribir sus
partidos y rehacer su tabla: no existe el estado "resultado escrito, tabla sin
rehacer". Lo que no entró en una corrida queda pendiente entero y lo levanta la
siguiente con su diff intacto.

## Lo que dispara, y lo que no hace falta disparar

| sistema | cómo se entera |
|---|---|
| notificaciones | trigger `trg_g22_notify_match_finished`, `AFTER UPDATE OF status` |
| prode | el cron `/api/cron/prode-scoring`, cada 5 minutos |
| ranking de clubes | el cron de los martes, que lo rehace entero |
| **tabla de posiciones** | **la llama este cron**: `tournament_standings` es materializada y no se entera sola |

## Las palancas, para cuando haga falta

Todas piden `Authorization: Bearer $CRON_SECRET`.

| parámetro | para qué |
|---|---|
| `?scope=jornada\|barrido` | qué torneos entran |
| `&dry=1` | reporta sin escribir una sola fila |
| `&anio=2024` | un año viejo, a mano. Nunca entra por rotación |
| `&ocultos=1` | incluye los torneos sin publicar (el histórico entró oculto) |
| `&parte=0\|1\|2` | fuerza una parte del barrido en vez de la que toca por reloj |
| `&posiciones=todas` | **modo recálculo**: rehace las tablas y no le pide nada a URBA |
| `&huerfanos=conservar` | apaga el borrado de los partidos que URBA sacó |

`&posiciones=todas` existe para una tabla que quedó vieja por algo que pasó FUERA
del conector: ahí el partido ya está bien y no hay diff que dispare nada, así que
sola no se arregla nunca. Va por los torneos con la tabla más vieja primero.

## Qué mirar en los logs

Una línea por corrida:

```
[urba-sync] anio=2026 scope=jornada(query) torneos=50/55 written=0 updated=21 skipped=563 tablas=5 filas=55 huerfanos=0 errors=0 en 47849ms
```

| campo | qué esperar | qué significa si no |
|---|---|---|
| `torneos` | el segundo número o cerca | si el primero es 0, no leyó nada → mirar `errors` |
| `updated` | crece durante la jornada | 0 toda la noche con resultados publicados = no los está viendo |
| `tablas` | > 0 siempre que `updated` > 0 | **`updated > 0` con `tablas: 0` es el síntoma de que los resultados entran y las posiciones se quedan atrás** |
| `errors` | `[]` | cualquier cosa acá va con el `external_id` adelante |
| `elapsed` | < 55.000 | si se acerca a 60.000, el presupuesto quedó corto |
| `torneosNuevos` | `[]` | si trae algo, URBA agregó torneos y **no se sincronizan hasta darlos de alta** |

Y el HTTP: **200 con `ok: true`**. Un **500** significa que no leyó un solo torneo,
o que la temporada en curso no tiene torneos cargados (ver abajo).

## El 1 de enero

`temporadaEnCurso()` sale del reloj, así que el cron pasa solo a la temporada
nueva. Los torneos de esa temporada los da de alta una persona: hasta que se
carguen, no hay nada que sincronizar. Eso **no** responde en verde — si URBA
publica torneos del año y en la base no hay ninguno, la corrida devuelve 500 con
el motivo escrito. Es a propósito: un cron en verde sin hacer nada es peor que uno
en rojo.

## Decisiones tomadas

**Lo que no está en la API, no está.** Cuando URBA rehace un fixture —borra las
fechas publicadas y las crea de nuevo con ids nuevos—, los partidos viejos se
borran solos. Con tres frenos: uno con resultado no se borra nunca (se reporta),
un torneo que llega sin un solo partido no cuenta como fixture vacío, y un payload
que no se entiende ni llega hasta ahí.

**Un `fulfilled` en 0-0 no es un empate.** Para URBA "cumplido" quiere decir
cerrado, no jugado: los suspendidos llegan con las dos banderas prendidas y en
0-0. Contarlos como empate repartía 2 puntos por lado que la tabla de URBA no
reparte. Acá se espejan: no cuentan. Contrastadas las 134 tablas contra
`/api/positions`, 133 dan idéntico; la que no es un 0-0 que URBA sí cuenta en ese
torneo y no en otros ocho, con el mismo payload.

**La guarda de visibilidad sigue.** El cron sólo toca torneos con
`is_visible = true`, porque el trigger de notificaciones no mira esa columna y un
partido que pasa a final en un torneo sin publicar le manda el aviso igual a quien
tenga ese club en favoritos. Los 134 de 2026 están publicados, así que hoy no
saltea ninguno. El histórico entró oculto: para alcanzarlo hace falta
`&anio=2024&ocultos=1`.

## Lo que corre en producción no es lo que dice este documento

`deploy-vercel.yml` despliega **`main`**, y `main` quedó atrás del conector que
está descrito acá. Verificado el 2026-08-15, la versión desplegada tiene dos
diferencias que no fallan, no se ven en los logs y explican una temporada entera
quieta:

| en `main` (producción) | acá | qué provoca |
|---|---|---|
| `const tercio = Math.floor(Date.now() / 3_600_000) % 3` | `parteDelBarrido` = `(día + hora) % 3` | el barrido corre una vez por día, a la misma hora, y entre dos corridas pasan 24 h exactas: 24 % 3 = 0. **Cae siempre en el mismo tercio.** Dos tercios del catálogo no se barren nunca |
| una sola entrada de barrido (`0 9 * * *`) | tres (09, 10, 11) | con una sola, el catálogo entero tarda tres días en vez de uno |
| ninguna llamada a `recalculatePhaseStandingsScopes` | recálculo por torneo, adentro del presupuesto | el resultado entra en `matches` y **la tabla publicada no se rehace nunca**. Es la señal 2 de acá abajo, de fábrica |

Ninguna de las tres levanta un error: la corrida responde `ok: true` con todo en
cero, que es idéntico a un día tranquilo. Mientras `main` no tenga estos commits,
el goteo automático no funciona por más que el endpoint esté sano.

## Las tres señales de que algo anda mal

1. **`updated: 0` en todas las corridas de la noche** con resultados ya publicados
   en urba.org.ar → el conector no ve el cambio. Correr con `dry=1` y mirar el
   `detalle`.
2. **`updated > 0` y `tablas: 0`** → los resultados entran y las posiciones no se
   rehacen. Es el bug que este cron ya tuvo una vez.
3. **`errors` con muchos `equipo_no_resuelto`** → URBA inscribió un equipo nuevo
   sin triple. El partido no se escribe, y el arreglo es agregar la fila a
   `club_external_ids`.

Nada de esto pide apagar el cron: escribe sólo lo que cambió y es idempotente.

## Contra la base, para verificar

```sql
-- 1. cuántos se cerraron en la jornada
SELECT count(*) FROM public.matches
WHERE external_id LIKE 'urba:%' AND status = 'final'
  AND date_time >= '2026-08-09' AND date_time < '2026-08-10';

-- 2. las tablas se rehicieron con los partidos
SELECT count(DISTINCT tournament_id) FROM public.tournament_standings
WHERE last_updated >= CURRENT_DATE;

-- 3. ninguna tabla puede quedar más vieja que su último partido terminado
SELECT t.external_id, max(s.last_updated) AS tabla, max(m.updated_at) AS ultimo_partido
FROM public.tournaments t
JOIN public.matches m ON m.tournament_id = t.id AND m.status = 'final'
LEFT JOIN public.tournament_standings s ON s.tournament_id = t.id
WHERE t.external_id LIKE 'urba:%' AND t.season_id = '2026'
GROUP BY t.external_id
HAVING max(s.last_updated) IS NULL OR max(s.last_updated) < max(m.updated_at);

-- 4. las notificaciones salieron
SELECT count(*) FROM public.user_notifications
WHERE type = 'match_finished' AND created_at >= CURRENT_DATE;
```

## Una fase sin inscriptos no tiene tabla

`tournament_phase_participants` es de dónde saca el motor los participantes de una
fase. Una fase con partidos jugados y **sin una sola fila ahí** devuelve la tabla
vacía, y la guarda de `recalculateStandings` conserva lo último publicado — que
puede ser de meses atrás y de otros clubes. Pasó con `urba:2025233` y
`urba:2025215`, que además tenían la fase declarada `group_stage` con dos zonas
vacías. Si una tabla no se mueve con partidos jugados, es lo primero que hay que
mirar.
