-- ═══════════════════════════════════════════════════════════════════════════
-- URBA — el lunes después de la primera jornada real (domingo 2026-08-09)
--
-- Para pegar en el SQL editor de Supabase, de arriba abajo. Cada bloque es
-- independiente: se puede correr uno solo.
--
-- El domingo 9 hay 289 partidos de URBA cargados y visibles. Es la primera
-- jornada con el cron encendido, así que lo que se mide es si el goteo funcionó.
--
-- ── Cuatro cosas antes de empezar ─────────────────────────────────────────
--
-- 1. LA FECHA VA EN HORA DE BUENOS AIRES. `date_time` se guarda en UTC, y un
--    partido del domingo a las 21:00 argentinas es el LUNES 00:00 UTC. Filtrar
--    por `date_time::date` se come esos partidos sin avisar. Por eso todo usa
--    `(date_time AT TIME ZONE 'America/Argentina/Buenos_Aires')`.
--
-- 2. EL MARCADOR ES JSONB, no dos columnas. `matches.score` es
--    `{"home": 20, "away": 17}` — no existen `home_score` ni `away_score`.
--
-- 3. LA TABLA DE POSICIONES ES `tournament_standings`. No hay tabla `standings`
--    (verificado: `to_regclass` da NULL), y el ranking de clubes vive en
--    `club_ranking_entries`, no en `club_rankings` — ésa es la DEFINICIÓN del
--    ranking (nombre, algoritmo, temporada), no los puntos de cada club.
--
-- 4. `updated_at` ES EL ÚNICO RASTRO DEL CRON en la base. No hay tabla de
--    corridas: una corrida que no escribió nada no deja huella acá. El número de
--    invocaciones sale de los logs de Vercel (bloque 3).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. ¿Cuántos partidos del domingo quedaron con resultado?
--
-- La foto de la jornada. `final` es lo que el cron levantó de URBA; el resto
-- sigue esperando que la unión publique.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
    m.status,
    COUNT(*)                                                 AS partidos,
    -- `->> 'home' IS NOT NULL` y no el operador `?` de jsonb: varios clientes
    -- leen el `?` como un placeholder de parámetro y rompen la consulta.
    COUNT(*) FILTER (WHERE m.score ->> 'home' IS NOT NULL)   AS con_marcador,
    MIN(m.updated_at)                                        AS primera_escritura,
    MAX(m.updated_at)                                        AS ultima_escritura
FROM public.matches m
JOIN public.tournaments t ON t.id = m.tournament_id
WHERE t.union_id = 'urba'
  AND (m.date_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = DATE '2026-08-09'
GROUP BY m.status
ORDER BY partidos DESC;
-- Sobre 289 partidos. Lo bueno sería la mayoría en `final`; el resto, en el
-- bloque 2.


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Los que quedaron en scheduled con la fecha ya pasada
--
-- O sea: URBA no publicó el resultado, o el cron no lo trajo. Los dos casos se
-- ven igual en el total, y la columna `los_toco_el_cron` es la que los separa:
-- `updated_at > created_at` significa que el cron pasó por ahí y no había nada
-- que traer — el problema es de URBA. Si da 0, el cron nunca los miró y el
-- problema es nuestro.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
    t.name                                     AS torneo,
    COUNT(*)                                   AS sin_resultado,
    COUNT(*) FILTER (WHERE m.updated_at > m.created_at + INTERVAL '1 minute') AS los_toco_el_cron,
    MAX(m.updated_at)                          AS ultimo_intento
FROM public.matches m
JOIN public.tournaments t ON t.id = m.tournament_id
WHERE t.union_id = 'urba'
  AND m.status = 'scheduled'
  AND m.date_time < NOW()
  AND (m.date_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date >= DATE '2026-08-08'
GROUP BY t.name
ORDER BY sin_resultado DESC;

-- El total, para leerlo de un vistazo contra los 289.
SELECT COUNT(*) AS scheduled_con_fecha_pasada
FROM public.matches m
JOIN public.tournaments t ON t.id = m.tournament_id
WHERE t.union_id = 'urba'
  AND m.status = 'scheduled'
  AND m.date_time < NOW()
  AND (m.date_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date >= DATE '2026-08-08';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. ¿Cuántas corridas hubo, y cuántas escribieron algo?
--
-- LA PRIMERA MITAD NO SE CONTESTA DESDE LA BASE. Una corrida que no escribió
-- nada no deja rastro. Las invocaciones salen de Vercel:
--
--     Vercel → el proyecto → Logs → filtro  requestPath:/api/cron/urba-sync
--     (o Settings → Cron Jobs → View Logs, que aplica ese filtro solo)
--
-- Esperadas, con las tres entradas de vercel.json y RECORDANDO QUE EL CRON
-- CORRE EN UTC:
--     */20 21-23 * * 6,0   →  9 por día, sábado y domingo UTC
--     */20 0-5  * * 0,1    → 18 por día, domingo y lunes UTC
--     0 9 * * *            →  1 por día, el barrido
--   Para la jornada del domingo 9 argentino, las que cuentan son las 18 de la
--   madrugada del lunes 10 UTC (= domingo 21:00 a lunes 02:59 en Buenos Aires)
--   más las 9 del domingo 9 a la noche UTC (= domingo 18:00-20:59 argentinas).
--
-- En cada log, mirar el campo `scopeDesde` de la respuesta: si dice 'schedule',
-- Vercel dejó de pasar el query string del path y el header lo salvó. Si dijera
-- 'default' en el barrido, el barrido está corriendo como jornada.
--
-- Lo que SÍ se cuenta acá es cuántas ESCRIBIERON: cada escritura mueve
-- `updated_at`, así que agrupando por minuto se ven las tandas.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
    date_trunc('minute', m.updated_at)         AS minuto_utc,
    COUNT(*)                                   AS partidos_escritos,
    COUNT(*) FILTER (WHERE m.status = 'final') AS en_final
FROM public.matches m
JOIN public.tournaments t ON t.id = m.tournament_id
WHERE t.union_id = 'urba'
  AND m.updated_at >= TIMESTAMPTZ '2026-08-08 00:00-03'
GROUP BY 1
ORDER BY 1;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. ¿Se actualizó el ranking de clubes, y con cuántos partidos nuevos?
--
-- Es el sistema que NO se entera solo: el cron lo llama explícitamente con
-- `syncClubRankingsForMatchUpdate`, y con el snapshot PREVIO del partido. Si
-- esto queda en cero mientras el bloque 1 muestra partidos en `final`, el
-- problema es esa llamada y no la sincronización.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
    COUNT(*)                    AS aplicaciones_nuevas,
    COUNT(DISTINCT a.match_id)  AS partidos_distintos,
    COUNT(DISTINCT a.ranking_id) AS rankings_tocados,
    MIN(a.applied_at)           AS primera,
    MAX(a.applied_at)           AS ultima
FROM public.club_ranking_match_applications a
WHERE a.applied_at >= TIMESTAMPTZ '2026-08-08 00:00-03';

-- Los clubes que se movieron, y cuánto. `current_rating` es el valor vigente;
-- los deltas de cada partido están en la tabla de aplicaciones.
SELECT
    e.club_id,
    c.name                AS club,
    e.current_position,
    e.current_rating,
    e.updated_at
FROM public.club_ranking_entries e
LEFT JOIN public.clubs c ON c.id = e.club_id
WHERE e.updated_at >= TIMESTAMPTZ '2026-08-08 00:00-03'
ORDER BY e.updated_at DESC
LIMIT 50;

-- Si el ranking quedó marcado como stale, el rebuild no corrió todavía.
-- `/api/cron/rebuild-stale-rankings` pasa cada 2 minutos, así que el lunes no
-- debería haber nada acá.
SELECT id, name, season, stale_from_match_date, stale_reason, updated_at
FROM public.club_rankings
WHERE stale_from_match_id IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. ¿Alguna tabla de posiciones quedó desfasada?
--
-- Esto NO se cierra con SQL solo: `/api/db/standings?tournament={id}` calcula la
-- tabla al vuelo con el motor, y `tournament_standings` es lo que quedó
-- guardado. Compararlas pide traer las dos.
--
-- (Ojo con el nombre: la ruta NO es `/api/positions/{id}` — no existe. La
-- pública es `/api/db/standings`, con `tournament`, y opcionalmente `phase` y
-- `group`, como query params.)
--
-- El SQL de abajo da la LISTA DE CANDIDATOS: los torneos de 2026 con un partido
-- escrito este fin de semana. Son los únicos que pueden haberse desfasado.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
    t.id,
    t.name                                     AS torneo,
    COUNT(*)                                   AS partidos_tocados,
    COUNT(*) FILTER (WHERE m.status = 'final') AS finales,
    MAX(m.updated_at)                          AS ultima_escritura_partido,
    MAX(s.last_updated)                        AS ultima_escritura_tabla,
    '/api/db/standings?tournament=' || t.id    AS endpoint
FROM public.matches m
JOIN public.tournaments t ON t.id = m.tournament_id
LEFT JOIN public.tournament_standings s ON s.tournament_id = t.id
WHERE t.union_id = 'urba'
  AND t.season_id = '2026'
  AND m.updated_at >= TIMESTAMPTZ '2026-08-08 00:00-03'
GROUP BY t.id, t.name
ORDER BY partidos_tocados DESC;
-- LA SEÑAL: `ultima_escritura_tabla` anterior a `ultima_escritura_partido`.
-- Significa que entraron resultados después del último recálculo, o sea que la
-- tabla guardada está atrasada respecto de los partidos.

-- El contraste fino, para el torneo que quede sospechoso. Reemplazar {id}:
--
--   SELECT position, club_id, played, won, drawn, lost, points, scored, conceded
--   FROM public.tournament_standings
--   WHERE tournament_id = '{id}'
--   ORDER BY position;
--
--   curl -s "https://<dominio>/api/db/standings?tournament={id}" \
--     | jq '.data[]? // .[] | {pos: .position, club: .club_id, pj: .played, pts: .points}'
--
-- Lo que hay que mirar es `played` y `points`: si la guardada tiene MENOS
-- partidos jugados que la calculada, el recálculo no corrió después del cron.

-- Y el chequeo barato de coherencia interna, que no necesita la ruta: una fila
-- con jugados != ganados+empatados+perdidos está rota por su cuenta.
SELECT s.tournament_id, t.name, COUNT(*) AS filas_incoherentes
FROM public.tournament_standings s
JOIN public.tournaments t ON t.id = s.tournament_id
WHERE t.union_id = 'urba'
  AND t.season_id = '2026'
  AND s.played <> (COALESCE(s.won,0) + COALESCE(s.drawn,0) + COALESCE(s.lost,0))
GROUP BY s.tournament_id, t.name;
-- Lo esperado es cero filas.


-- ───────────────────────────────────────────────────────────────────────────
-- 6. Red de seguridad: ¿el cron tocó algo que NO debía?
--
-- El alcance automático es `season_id = 2026` y sólo torneos visibles. Si acá
-- aparece otra temporada, algo salió del carril: o entró el histórico por
-- rotación (no debería: la consulta filtra por temporada) o alguien corrió un
-- `?anio=` a mano.
--
-- Importa porque el trigger de notificaciones NO mira `is_visible`: un partido
-- de un torneo oculto que pase a `final` le manda el aviso a quien tenga ese
-- club en favoritos.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
    t.season_id,
    COUNT(*)                                    AS partidos_escritos,
    COUNT(*) FILTER (WHERE NOT t.is_visible)    AS de_torneos_ocultos
FROM public.matches m
JOIN public.tournaments t ON t.id = m.tournament_id
WHERE t.union_id = 'urba'
  AND m.updated_at >= TIMESTAMPTZ '2026-08-08 00:00-03'
GROUP BY t.season_id
ORDER BY t.season_id DESC;
-- Lo esperado es UNA fila: 2026, con de_torneos_ocultos = 0.
