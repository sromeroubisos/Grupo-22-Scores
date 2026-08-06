# URBA — cómo se prende la sincronización

**El cron NO está en `vercel.json`.** No es un olvido: JSON no admite comentarios,
y Vercel valida `vercel.json` contra un esquema cerrado — una clave desconocida
(`"crons_desactivado"`, `"_nota"`) puede tumbar el deploy entero. Un cron
"comentado" ahí adentro no existe sin ese riesgo, así que el bloque vive acá y se
pega cuando se decida.

## Lo que hay que pegar en `vercel.json`

Dentro del array `crons`, junto a los cinco que ya están:

```json
{
  "path": "/api/cron/urba-sync?scope=jornada",
  "schedule": "*/20 21-23 * * 6,0"
},
{
  "path": "/api/cron/urba-sync?scope=jornada",
  "schedule": "*/20 0-5 * * 0,1"
},
{
  "path": "/api/cron/urba-sync?scope=barrido",
  "schedule": "0 9 * * *"
}
```

Los horarios son **UTC**, que es lo que usa Vercel. En hora de Buenos Aires (UTC-3):

| entrada | UTC | Buenos Aires |
|---|---|---|
| jornada (tarde/noche) | sáb y dom 21:00–23:59 | sáb y dom 18:00–20:59 |
| jornada (madrugada) | dom y lun 00:00–05:59 | sáb y dom 21:00–02:59 |
| barrido | todos los días 09:00 | todos los días 06:00 |

## Antes de prender

1. **Publicar los torneos.** Mientras los 126 sigan en `is_visible = FALSE`, el
   cron los saltea a propósito y sólo sincroniza los 8 visibles. Es la guarda de
   la que se habla abajo.
2. **Confirmar `CRON_SECRET`** en las variables de entorno de Vercel. Es el mismo
   que usan los otros cinco crones.
3. **Correr una pasada en seco** y mirar el informe:
   ```
   curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://<host>/api/cron/urba-sync?scope=barrido&ocultos=1&dry=1"
   ```

## La guarda de visibilidad, y por qué está

`trg_g22_notify_match_finished` es `AFTER UPDATE OF status` y **no mira
`is_visible`** — ni el del partido ni el del torneo. Leí el cuerpo del trigger: no
hay una sola referencia. Los destinatarios salen de `user_favorite_clubs` y
`user_favorite_leagues`.

Medido: de los 949 clubes que juegan en los 126 torneos ocultos, **18 usuarios**
tienen alguno en favoritos. Cero usuarios tienen uno de esos torneos como
favorito. La primera jornada del 2026-08-09 son 289 partidos, **los 289 en torneos
ocultos**.

O sea: prender el cron sin publicar mandaría avisos de competencias que no existen
para el usuario. Por eso el endpoint sólo toca torneos visibles, y hay que pasarle
`ocultos=1` a mano para que entre en los otros.

**Ojo con lo que NO alcanza:** poner `is_visible = FALSE` en los partidos no sirve
— ya lo están, los 10.917, y el trigger igual dispara porque no lee esa columna.

**El arreglo durable, si se quiere cerrar de raíz** (no aplicado, es tu decisión):

```sql
-- dentro de g22_notify_match_finished(), después del SELECT que arma los nombres
IF NOT COALESCE((SELECT t.is_visible FROM public.tournaments t
                 WHERE t.id = NEW.tournament_id), FALSE) THEN
    RETURN NEW;
END IF;
```

Va en el trigger y no en el envío porque el envío llega tarde: las filas de
`user_notifications` ya se crearon y se ven en la campanita de la app.

## Qué mirar el domingo 9

Es la primera jornada con el cron vivo: **289 partidos en 55 torneos**, la más
grande del semestre. Se juega de tarde y URBA publica los resultados entre 1 y 5 h
después del final, así que la acción está entre las **18:00 y las 02:00 de Buenos
Aires** — las dos ventanas del cron.

### El primer indicio, 21:00 UTC (18:00 BA)

En los logs de Vercel, una línea por corrida:

```
[urba-sync] scope=jornada torneos=55/55 written=0 updated=N skipped=M errors=0 en 48000ms
```

| campo | qué esperar | qué significa si no |
|---|---|---|
| `torneos` | 55/55 | si el primero es 0, no llegó a leer nada → mirar `errors` |
| `updated` | crece corrida a corrida | 0 toda la noche con resultados publicados = no los está viendo |
| `finalizados` | los que pasaron a final | es el número que dispara notificaciones y ranking |
| `errors` | `[]` | cualquier cosa acá va con el `external_id` adelante |
| `elapsed` | < 50.000 | si se acerca a 60.000, el presupuesto quedó corto |
| `torneosNuevos` | `[]` | si trae algo, URBA agregó torneos: hay que revisarlos a mano |

Y el HTTP: **200 con `ok: true`**. Un **500** significa que no leyó un solo torneo.

### Contra la base, el lunes a la mañana

```sql
-- 1. cuántos se cerraron en la jornada
SELECT count(*) FROM public.matches
WHERE external_id LIKE 'urba:%' AND status = 'final'
  AND date_time >= '2026-08-09' AND date_time < '2026-08-10';
-- de 289; los que falten son los que URBA todavía no publicó

-- 2. el ranking no puede quedar stale
SELECT stale_from_match_date, stale_reason FROM public.club_rankings;
-- tiene que estar en NULL. El cron de rankings corre cada 2 min: si a la
-- mañana sigue con fecha, el rebuild está fallando.

-- 3. las aplicaciones tienen que haber crecido
SELECT count(*) FROM public.club_ranking_match_applications;   -- eran 824

-- 4. las notificaciones salieron
SELECT count(*) FROM public.user_notifications
WHERE type = 'match_finished' AND created_at >= '2026-08-09';

-- 5. y ninguna de un torneo sin publicar (el trigger nuevo)
SELECT count(*) FROM public.user_notifications n
JOIN public.tournaments t ON t.id = n.tournament_id
WHERE n.created_at >= '2026-08-09' AND t.is_visible = FALSE;   -- 0
```

### Las tres señales de que algo anda mal

1. **`updated: 0` en todas las corridas de la noche** con resultados ya publicados
   en urba.org.ar → el conector no ve el cambio. Correr el endpoint con `dry=1` y
   mirar el `detalle`.
2. **El ranking sigue stale el lunes** → el rebuild falla. Está en los logs de
   `/api/cron/rebuild-stale-rankings`.
3. **`errors` con muchos `equipo_no_resuelto`** → URBA inscribió un equipo nuevo
   que no tiene triple. El partido no se escribe, y el arreglo es agregar la fila
   a `club_external_ids`.

Nada de esto pide apagar el cron: escribe sólo lo que cambió y es idempotente. Si
hay que frenar, se sacan las tres entradas de `vercel.json`.

## Aviso: 992 partidos quedaron visibles, y no fue a propósito

Al asignar `phase_id` en el paso 4 de la carga, **992 partidos pasaron solos a
`is_visible = true`**. Son exactamente los de los 8 torneos que recibieron fase, y
los 992 cambiaron en el mismo minuto (`2026-08-05T18:05`). El PATCH mandaba
únicamente `{phase_id}`.

Comprobado: `is_visible` se puede volver a poner en `false` y se queda, así que no
hay nada que lo fuerce en cada escritura — **el salto está atado al cambio de
`phase_id`**. En las migraciones del repo no existe ese trigger: es uno de los
objetos creados a mano que la auditoría ya había documentado.

Los otros 9.925 partidos de URBA (los 126 torneos ocultos) siguen invisibles,
porque no tienen fase.

Qué hacer con los 992 es una decisión:

- **Dejarlos visibles** restaura lo que esos 8 torneos mostraban antes: estaban
  publicados y tenían sus 1.256 partidos manuales a la vista. Ahora muestran los
  de URBA, que además están verificados contra `/api/positions`.
- **Ponerlos en `false`** deja esos 8 torneos publicados pero en blanco.

## Prode: no hace falta tocar nada

`syncActiveProdeCompetitionsBaseEvents` lee `matches` con `.eq('tournament_id',…)`
**sin filtro de visibilidad**, pero sólo de torneos atados explícitamente a una
competencia (`prode_competitions.local_tournament_id`).

Medido: 26 competencias activas, 19 atadas a un torneo local, **6 a torneos de
URBA — las 6 visibles**. Atadas a un torneo de URBA oculto: **0**.

No va a inventar eventos de prode sobre los 126. Lo que sí conviene saber: si
alguien ata una competencia a un torneo oculto, prode lo sincroniza igual, porque
la consulta no mira `is_visible`.
