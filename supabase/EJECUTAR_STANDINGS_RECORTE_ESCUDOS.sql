-- =============================================================================
-- table_type en tournament_standings — PASO 4 de 4: RECORTE DE ESCUDOS
--
--                    *** DESTRUCTIVO. LEER ANTES DE CORRER. ***
-- =============================================================================
--
-- Borra `stats.team_logo` de todas las filas de tournament_standings. Esos
-- escudos son data URIs en base64 de decenas de kilobytes, repetidos en cada
-- fila de cada tabla de cada torneo: son casi todo el peso de la tabla.
--
-- El archivo está armado para correrse en TRES tandas, no de un saque. El editor
-- SQL de Supabase muestra sólo el resultado de la última sentencia, así que cada
-- tanda termina en la consulta que hay que leer para decidir si seguir.
--
--   TANDA 1 (abajo, activa)  respaldo + veredicto de si se puede recortar
--   TANDA 2 (comentada)      el recorte
--   TANDA 3 (comentada)      VACUUM y comprobación del tamaño final
--
--
-- REQUISITO QUE NINGÚN SQL PUEDE COMPROBAR
-- ----------------------------------------
-- Los escudos se sirven ahora por proxy (`/api/assets/team-logo`), resueltos por
-- id de club. Eso ya está en el código. Pero hasta verificarlo EN PRODUCCIÓN,
-- borrar el respaldo del JSONB deja los escudos en blanco.
--
-- Verificá con tus propios ojos, en producción, que se ven los escudos en:
--
--   [ ] La tabla de posiciones del gestor (?tab=operacion&subtab=tabla)
--   [ ] La página pública del torneo (/tournaments/[id])
--   [ ] El panel de competiciones de un club (usa /standings/lite, que era el
--       único que servía el base64 sin respaldo — el más expuesto de los tres)
--
-- Recién con los tres tildados, seguí.


-- =============================================================================
-- TANDA 1 · Respaldo y veredicto. Pegá hasta acá y corré.
-- =============================================================================

-- Respaldo de los escudos: es lo que hace REVERSIBLE al recorte de la tanda 2.
CREATE TABLE IF NOT EXISTS public.tournament_standings_logo_bak AS
SELECT id, stats->'team_logo' AS team_logo
FROM public.tournament_standings
WHERE stats ? 'team_logo';

-- El veredicto. Una sola fila; es lo que el editor te va a mostrar.
--
--   escudos_en_tabla ..... cuántas filas tienen el base64 embebido
--   escudos_respaldados .. cuántas guardó el respaldo de arriba
--   listo_para_recortar .. sólo dice OK si los dos números coinciden
--   tamano_actual ........ para comparar contra el final
WITH conteos AS (
    SELECT
        (
            SELECT count(*) FROM public.tournament_standings
            WHERE stats ? 'team_logo'
        ) AS escudos_en_tabla,
        (SELECT count(*) FROM public.tournament_standings_logo_bak) AS escudos_respaldados,
        (SELECT count(*) FROM public.tournament_standings)          AS filas_totales
)
SELECT
    CASE
        WHEN escudos_en_tabla = 0
            THEN 'NADA QUE HACER - no hay escudos embebidos.'
        WHEN escudos_en_tabla = escudos_respaldados
            THEN 'OK - respaldo completo. Si ya verificaste los escudos en produccion, corre la TANDA 2.'
        ELSE 'NO SIGAS - el respaldo no cubre todas las filas.'
    END                    AS listo_para_recortar,
    escudos_en_tabla,
    escudos_respaldados,
    filas_totales,
    pg_size_pretty(pg_total_relation_size('public.tournament_standings')) AS tamano_actual
FROM conteos;


-- =============================================================================
-- TANDA 2 · EL RECORTE. Descomentá las tres líneas y corré SOLO eso.
--
-- Es el único punto de todo el operativo que borra datos. Va comentado a
-- propósito: tiene que ser un acto deliberado, no el efecto de pegar un archivo.
-- =============================================================================

-- UPDATE public.tournament_standings
-- SET stats = stats - 'team_logo'
-- WHERE stats ? 'team_logo';


-- =============================================================================
-- TANDA 3 · Recuperar el espacio y comprobar. Después del recorte.
--
-- El VACUUM no corre dentro de una transacción: va SOLO, seleccionalo y ejecutá
-- la selección. Después corré la consulta de abajo para ver la caída.
-- =============================================================================

-- VACUUM (ANALYZE) public.tournament_standings;

-- SELECT
--     pg_size_pretty(pg_total_relation_size('public.tournament_standings')) AS tamano_final,
--     count(*) FILTER (WHERE stats ? 'team_logo')                           AS quedan_con_escudo
-- FROM public.tournament_standings;


-- =============================================================================
-- REPONER, si algo salió mal:
--
--   UPDATE public.tournament_standings s
--   SET stats = jsonb_set(s.stats, '{team_logo}', b.team_logo)
--   FROM public.tournament_standings_logo_bak b
--   WHERE s.id = b.id AND b.team_logo IS NOT NULL;
--
-- Y cuando ya no haga falta la red (una release después, con los escudos
-- funcionando):
--
--   DROP TABLE public.tournament_standings_logo_bak;
--   DROP TABLE public.tournament_standings_bak;
-- =============================================================================
