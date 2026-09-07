/**
 * EL PUNTAJE DE CADA JUGADOR EN CADA PARTIDO, guardado.
 *
 * El puntaje de 1 a 10 lo calcula `rugbyPlayerRating.ts` con la PLANILLA del
 * partido —avances, metros, tackles, pases y dieciocho rubros mas—, que el
 * proveedor no publica ni en el calendario ni en la ficha del jugador: hay que
 * pedirla partido por partido, y son veintitres requests por partido.
 *
 * Por eso el puntaje se calcula UNA vez, cuando el partido ya termino y no va a
 * cambiar mas, y se guarda en `external_match_player_ratings`. El cron
 * `rugbypass-ratings` lo hace de a tandas; la ficha del jugador solo lee.
 *
 * ── LA IDENTIDAD ES EL SLUG, NO EL NOMBRE ───────────────────────────────────
 * La planilla de rubros viene por NOMBRE y la alineacion trae nombre Y slug. El
 * puntaje se calcula cruzando por nombre plegado —eso ya lo hace
 * `planillaDelPartido`— pero se GUARDA por slug, que es lo que dice el link de
 * la propia alineacion. Un apellido repetido deja de ser un problema en cuanto
 * la fila lleva slug: la ficha pide el suyo y no el de su tocayo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { PUESTO_POR_NUMERO, minutesFromLineup } from '../matches/rugbyPlayerRating.ts';
import { getRugbyPassMatchDetail, getRugbyPassPlayerStats } from './rugbyPass.ts';
import { claveNombre, planillaDelPartido, rugbyPassGameIdOf } from './rugbyPassMatchBundle.ts';
import { rugbyPassTeamSlugOf } from './rugbyPassParser.ts';

/** Una fila de `external_match_player_ratings`, tal como se escribe. */
export interface PlayerRatingRow {
    match_id: string;
    player_slug: string;
    player_name: string;
    rating: number;
    minutes: number;
    position: number | null;
    kickoff: string;
}

/** El partido que hay que puntuar, con lo justo para pedir su planilla. */
export interface RateableMatch {
    id: string;
    dateTime: string;
    homeTeamId: string;
    awayTeamId: string;
}

/**
 * LOS PUNTAJES DE UN PARTIDO.
 *
 * Devuelve las filas listas para guardar y si la planilla alcanzo para puntuar.
 * `ok: false` con cero filas NO es un error: hay competiciones que publican
 * marcador y alineacion pero no rubros, y ahi no hay puntaje que dar. Se
 * distingue del error de red, que tira.
 */
export async function ratePlayersOfMatch(match: RateableMatch): Promise<{
    rows: PlayerRatingRow[];
    ok: boolean;
}> {
    const gameId = rugbyPassGameIdOf(match.id);
    if (gameId === null) return { rows: [], ok: false };

    const homeSlug = rugbyPassTeamSlugOf(match.homeTeamId);
    const awaySlug = rugbyPassTeamSlugOf(match.awayTeamId);

    // La ficha trae las alineaciones —de ahi salen el slug, el numero y los
    // minutos— y la planilla trae los rubros. Van en paralelo porque son dos
    // acciones distintas del proveedor y ninguna depende de la otra.
    const [detalle, planilla] = await Promise.all([
        getRugbyPassMatchDetail(gameId, homeSlug, awaySlug),
        getRugbyPassPlayerStats(gameId, homeSlug, awaySlug).catch(() => []),
    ]);

    const lineups = detalle?.lineups ?? { home: [], away: [] };
    if (lineups.home.length === 0 && lineups.away.length === 0) return { rows: [], ok: false };

    const hoja = planillaDelPartido(lineups, planilla);
    if (hoja.puntajes.size === 0) return { rows: [], ok: false };

    const rows: PlayerRatingRow[] = [];
    const vistos = new Set<string>();
    for (const jugador of [...lineups.home, ...lineups.away]) {
        // Sin slug no hay a quien adjudicarle el puntaje: la ficha lo busca por
        // slug y una fila sin el no la leeria nadie.
        if (!jugador.slug) continue;
        const puntaje = hoja.puntajes.get(claveNombre(jugador.name));
        if (puntaje === undefined) continue;
        // Un slug repetido dentro del mismo partido volaria el upsert entero por
        // clave duplicada. No deberia pasar; si pasa, gana el primero.
        if (vistos.has(jugador.slug)) continue;
        vistos.add(jugador.slug);

        rows.push({
            match_id: match.id,
            player_slug: jugador.slug,
            player_name: jugador.name,
            rating: puntaje,
            // La misma cuenta con la que se puntuo, que es la unica que hay: el
            // mapa de puntajes ya dejo afuera al que no entro.
            minutes: minutesFromLineup(jugador),
            // EL PUESTO, no la camiseta. Venia guardando `jugador.number`, asi
            // que del 16 al 23 la columna decia "23" donde el puntaje habia
            // leido un centro. Nadie lo notaba porque la ficha no la muestra,
            // pero cualquier medicion por puesto sobre esta tabla —la que
            // encontro el sesgo de la v1— salia con el banco contado aparte.
            position: jugador.number == null ? null : PUESTO_POR_NUMERO[jugador.number] ?? null,
            kickoff: match.dateTime,
        });
    }

    return { rows, ok: true };
}

/**
 * Guarda los puntajes y deja la marca de que el partido ya se miro.
 *
 * La marca va SIEMPRE, aunque no haya salido un solo puntaje: sin ella el cron
 * le gastaria veintitres requests a ese partido en cada corrida, para siempre.
 */
export async function saveMatchRatings(
    supabase: SupabaseClient,
    matchId: string,
    rows: PlayerRatingRow[],
    ok: boolean
): Promise<void> {
    if (rows.length > 0) {
        const { error } = await supabase
            .from('external_match_player_ratings')
            .upsert(rows, { onConflict: 'match_id,player_slug' });
        if (error) throw error;
    }

    const { error: marcaError } = await supabase
        .from('external_match_rating_runs')
        .upsert(
            { match_id: matchId, rated_at: new Date().toISOString(), players: rows.length, ok },
            { onConflict: 'match_id' }
        );
    if (marcaError) throw marcaError;
}

interface CachedMatchRow {
    id: string;
    date_time: string;
    home_team: { id?: unknown } | null;
    away_team: { id?: unknown } | null;
}

/**
 * Los partidos terminados que todavia no se puntuaron, del mas nuevo al mas
 * viejo: el hincha mira la fecha pasada, no la de hace un ano.
 *
 * Los ya puntuados se descartan DESPUES de pedirlos, porque PostgREST no tiene
 * `NOT IN (subconsulta)`. Por eso se recorre de a tandas hasta llenar el cupo en
 * vez de pedir una sola pagina: con la tabla llena, la primera tanda es toda de
 * partidos ya vistos y una sola pagina devolveria nada.
 */
export async function pendingMatches(
    supabase: SupabaseClient,
    limit: number,
    { oldestFirst = false }: { oldestFirst?: boolean } = {}
): Promise<RateableMatch[]> {
    const salida: RateableMatch[] = [];
    const TANDA = 200;
    const TOPE_RECORRIDO = 2000;

    for (let desde = 0; desde < TOPE_RECORRIDO && salida.length < limit; desde += TANDA) {
        const { data, error } = await supabase
            .from('external_match_cache')
            .select('id, date_time, home_team, away_team')
            .like('id', 'rp-%')
            .eq('status', 'final')
            .order('date_time', { ascending: oldestFirst })
            .range(desde, desde + TANDA - 1);

        if (error) throw error;
        const filas = (data ?? []) as CachedMatchRow[];
        if (filas.length === 0) break;

        const { data: marcados, error: marcaError } = await supabase
            .from('external_match_rating_runs')
            .select('match_id')
            .in('match_id', filas.map((f) => f.id));
        if (marcaError) throw marcaError;

        const yaEstan = new Set((marcados ?? []).map((m) => String(m.match_id)));
        for (const fila of filas) {
            if (salida.length >= limit) break;
            if (yaEstan.has(fila.id)) continue;
            const homeTeamId = String(fila.home_team?.id ?? '');
            const awayTeamId = String(fila.away_team?.id ?? '');
            // Sin los dos ids no se arma la URL del partido y el proveedor
            // contesta una pagina que no es esa.
            if (!homeTeamId || !awayTeamId) continue;
            salida.push({ id: fila.id, dateTime: fila.date_time, homeTeamId, awayTeamId });
        }

        if (filas.length < TANDA) break;
    }

    return salida;
}

/** Un puntaje guardado, como lo lee la ficha del jugador. */
export interface StoredPlayerRating {
    matchId: string;
    /** ISO 8601 en UTC, copiado del partido. */
    kickoff: string;
    rating: number;
    minutes: number;
    position: number | null;
}

/**
 * TODOS los puntajes de un jugador, del mas nuevo al mas viejo.
 *
 * Devuelve una lista vacia si la tabla todavia no existe —la migracion se corre
 * a mano— o si la consulta falla: la ficha se dibuja igual, con la columna en
 * blanco. Un perfil sin puntajes es una columna de menos; un perfil que no
 * carga es una pantalla rota.
 */
export async function playerRatings(
    supabase: SupabaseClient,
    playerSlug: string
): Promise<StoredPlayerRating[]> {
    const { data, error } = await supabase
        .from('external_match_player_ratings')
        .select('match_id, kickoff, rating, minutes, position')
        .eq('player_slug', playerSlug)
        .order('kickoff', { ascending: false })
        // Un jugador no llega a 400 partidos puntuados con lo que hay en la
        // cache, pero el tope va igual: PostgREST corta en 1000 sin avisar.
        .limit(400);

    if (error || !data) {
        if (error) {
            console.warn(
                `[rugbypass-ratings] no se pudieron leer los puntajes de ${playerSlug}:`,
                error.message
            );
        }
        return [];
    }

    return data.map((fila) => ({
        matchId: String(fila.match_id),
        kickoff: String(fila.kickoff),
        rating: Number(fila.rating),
        minutes: Number(fila.minutes),
        position: fila.position === null ? null : Number(fila.position),
    }));
}
