/**
 * La ficha de un TORNEO de RugbyPass, para `/api/tournaments?id=rp-comp-<oid>`.
 *
 * Sin esta rama, un id `rp-comp-208` no lo reconocia nadie: la pantalla lo
 * tomaba por un torneo de la base, le pedia `/api/db/tournaments/rp-comp-208/data`
 * —que espera un UUID— y contestaba 503 con "Tournament data unavailable". Es el
 * MISMO hueco que tenia la ficha del partido: un proveedor nuevo se agrega en
 * varios lugares y con uno solo la pantalla no falla, miente.
 *
 * ── DE DONDE SALE CADA COSA ─────────────────────────────────────────────────
 * Los partidos salen de `external_match_cache`, que es lo que el cron ya llena
 * cada hora: no se le vuelve a pedir el calendario entero a RugbyPass para
 * dibujar un torneo. La TABLA, en cambio, no esta en la cache — viaja adentro de
 * `live-poll-data`, o sea colgada de un partido— asi que se pide UNA vez, con un
 * partido de esa competicion como percha.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
    RUGBYPASS_PROVIDER,
    RUGBYPASS_TOURNAMENT_ID_PREFIX,
    rugbyPassCompetition,
    rugbyPassDefaultSeason,
    rugbyPassSeasonOf,
    rugbyPassSeasonsIn,
    rugbyPassTournamentId,
} from './rugbyPassParser.ts';
import { rugbyPassZonesFor, type RugbyPassStandingRow } from './rugbyPassCatalog.ts';
import { getRugbyPassStandings, getRugbyPassTournamentBranding } from './rugbyPass.ts';

/** `208` de `rp-comp-208`. `null` si el id no es de un torneo de RugbyPass. */
export function parseRugbyPassTournamentId(value: unknown): number | null {
    const texto = String(value ?? '').trim().toLowerCase();
    if (!texto.startsWith(RUGBYPASS_TOURNAMENT_ID_PREFIX)) return null;
    const n = Number(texto.slice(RUGBYPASS_TOURNAMENT_ID_PREFIX.length));
    return Number.isFinite(n) ? n : null;
}

interface CachedRow {
    id: string;
    sport: string | null;
    tournament_id: string | null;
    tournament_name: string | null;
    country_name: string | null;
    home_team: { id?: string; name?: string; logo?: string } | null;
    away_team: { id?: string; name?: string; logo?: string } | null;
    score: { home: number | null; away: number | null } | null;
    status: string;
    date_time: string;
    round_label: string | null;
}

function equipoVista(lado: { id?: string; name?: string; logo?: string } | null) {
    const id = lado?.id ?? '';
    const name = lado?.name ?? '';
    const logo = lado?.logo ?? '';
    return {
        id,
        team_id: id,
        name,
        short_name: name,
        logo,
        image_path: logo,
        small_image_path: logo,
        team_url: '',
        country_name: name,
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

/** Una fila de la cache a la forma que renderiza la lista del torneo. */
function partidoVista(fila: CachedRow, nombreTorneo: string, logoTorneo: string) {
    const fecha = new Date(fila.date_time);
    const valida = !Number.isNaN(fecha.getTime());

    return {
        match_id: fila.id,
        event_key: fila.id,
        timestamp: valida ? Math.floor(fecha.getTime() / 1000) : null,
        date: valida ? fecha.toISOString() : fila.date_time,
        match_status: fila.status,
        event_status: fila.status,
        status: fila.status,
        status_text: fila.status === 'final' ? 'Finalizado' : fila.status === 'live' ? 'En vivo' : 'Programado',
        event_name: fila.round_label ?? '',
        round_number: null,
        tournament_id: fila.tournament_id ?? '',
        tournament_name: nombreTorneo,
        tournament_name_short: nombreTorneo,
        tournament_logo: logoTorneo,
        tournament_stage_name: fila.round_label ?? '',
        country_name: fila.country_name ?? 'Internacional',
        sport_id: fila.sport ?? 'rugby',
        home_team: equipoVista(fila.home_team),
        away_team: equipoVista(fila.away_team),
        home_team_name: fila.home_team?.name ?? '',
        away_team_name: fila.away_team?.name ?? '',
        home_team_logo: fila.home_team?.logo ?? '',
        away_team_logo: fila.away_team?.logo ?? '',
        scores: {
            home: fila.score?.home ?? null,
            away: fila.score?.away ?? null,
            penalties: null,
        },
        url: '',
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

/**
 * Una fila de la tabla a la forma de la pantalla.
 *
 * El equipo de la tabla se empareja por NOMBRE con el de los partidos, porque la
 * tabla de RugbyPass trae el rotulo y el escudo pero no el slug. Cuando empareja
 * hereda el `rp-team-…` que ya usan los partidos; cuando no, queda con el id
 * vacio antes que con uno inventado que despues no vincule con nada.
 */
function filaTablaVista(
    fila: RugbyPassStandingRow,
    equipoPorNombre: ReadonlyMap<string, { id: string; logo: string }>
) {
    const conocido = equipoPorNombre.get(fila.teamName.toLowerCase().trim());
    const identidad = {
        id: conocido?.id ?? '',
        team_id: conocido?.id ?? '',
        name: fila.teamName,
        short_name: fila.teamName,
        logo: conocido?.logo || fila.logo,
        image_path: conocido?.logo || fila.logo,
        team_url: '',
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };

    return {
        position: fila.position,
        rank: fila.position,
        name: fila.teamName,
        team_name: fila.teamName,
        team_id: identidad.team_id,
        team_logo: identidad.logo,
        logo: identidad.logo,
        team_url: '',
        team: identidad,
        participant: identidad,
        group_name: '',
        matches_played: fila.played,
        matches_total: fila.played,
        played: fila.played,
        wins: fila.won,
        won: fila.won,
        draws: fila.drawn,
        drawn: fila.drawn,
        losses: fila.lost,
        lost: fila.lost,
        goals_for: fila.pointsFor,
        goals_against: fila.pointsAgainst,
        scored: fila.pointsFor,
        conceded: fila.pointsAgainst,
        goal_difference: fila.pointsDiff,
        // Los dos bonus del rugby, que ninguna otra fuente del proyecto trae
        // separados: el ofensivo por tries y el defensivo por perder por 7.
        try_bonus: fila.tryBonus,
        losing_bonus: fila.losingBonus,
        bonus_points: fila.bonusPoints,
        points: fila.points,
        points_total: fila.points,
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

/**
 * Todo lo que la pantalla de un torneo necesita: cabecera, resultados, fixture
 * y tabla.
 *
 * Devuelve `null` cuando la competicion no esta habilitada en
 * `RUGBYPASS_COMPETITIONS`, para que el endpoint siga de largo a sus otras ramas
 * en vez de dibujar un torneo vacio con un nombre inventado.
 */
export async function getRugbyPassTournamentBundle(
    competitionId: number,
    supabase: SupabaseClient,
    /** La que pidio la pantalla por `season_id`. Sin ella se elige la de hoy. */
    requestedSeason?: string | null,
    /** Solo para los tests: el "hoy" con el que se elige la temporada. */
    nowIso: string = new Date().toISOString()
) {
    const competicion = rugbyPassCompetition(competitionId);
    if (!competicion) return null;

    const tournamentId = rugbyPassTournamentId(competitionId);

    const { data } = await supabase
        .from('external_match_cache')
        .select('id, sport, tournament_id, tournament_name, country_name, home_team, away_team, score, status, date_time, round_label')
        .eq('tournament_id', tournamentId)
        .order('date_time', { ascending: false });

    const todas = (data ?? []) as CachedRow[];

    // ── Temporadas ──────────────────────────────────────────────────────────
    // La cache tiene el calendario ENTERO de la competicion, que en el Top 14
    // son 369 partidos de dos temporadas. Sin este corte la pantalla abria con
    // los resultados de la pasada, que son los mas recientes con marcador.
    //
    // Una temporada que se pide y no existe NO se inventa: se cae a la de hoy,
    // porque devolver un torneo vacio con el rotulo de una temporada que nunca
    // se jugo es peor que ignorar el parametro.
    const temporadas = rugbyPassSeasonsIn(competitionId, todas.map((f) => f.date_time));
    const pedida = String(requestedSeason ?? '').trim();
    const temporada = temporadas.includes(pedida)
        ? pedida
        : rugbyPassDefaultSeason(competitionId, temporadas, nowIso);

    // `temporada` en `null` es Internationals, que no tiene temporadas: ahi
    // entran todos los partidos y no se dibuja selector.
    const filas = temporada === null
        ? todas
        : todas.filter((f) => rugbyPassSeasonOf(competitionId, f.date_time) === temporada);

    // El logo y los colores son los que publica RugbyPass en su grilla de
    // torneos. Salen del catalogo, que queda en memoria por seis horas: la
    // cabecera no dispara una descarga por visita.
    const { logo: logoTorneo, colors } = await getRugbyPassTournamentBranding(competitionId);

    const vistas = filas.map((f) => ({ fila: f, vista: partidoVista(f, competicion.name, logoTorneo) }));

    // Los resultados van del mas nuevo al mas viejo y el fixture al reves: es
    // como se leen las dos listas, y es lo que hacen los otros proveedores.
    const results = vistas
        .filter(({ fila }) => fila.status === 'final')
        .map(({ vista }) => vista);

    const fixtures = vistas
        .filter(({ fila }) => fila.status !== 'final')
        .sort((a, b) => (a.vista.timestamp ?? 0) - (b.vista.timestamp ?? 0))
        .map(({ vista }) => vista);

    // El escudo y el id que ya tienen los partidos, para que la tabla no muestre
    // un equipo distinto del que aparece en el fixture.
    const equipoPorNombre = new Map<string, { id: string; logo: string }>();
    for (const { fila } of vistas) {
        for (const lado of [fila.home_team, fila.away_team]) {
            const nombre = String(lado?.name ?? '').toLowerCase().trim();
            if (!nombre || equipoPorNombre.has(nombre)) continue;
            equipoPorNombre.set(nombre, { id: lado?.id ?? '', logo: lado?.logo ?? '' });
        }
    }

    // La tabla cuelga de un partido, no de la competicion: se usa el mas
    // reciente que tenga con que armar la URL. Si no hay ninguno —un torneo que
    // todavia no empezo— queda sin tabla, que es lo correcto.
    let standings: ReturnType<typeof filaTablaVista>[] = [];
    const percha = vistas.find(({ fila }) => fila.home_team?.id && fila.away_team?.id);
    if (percha) {
        try {
            const tabla = await getRugbyPassStandings(
                percha.fila.id,
                String(percha.fila.home_team?.id ?? ''),
                String(percha.fila.away_team?.id ?? '')
            );
            standings = tabla.map((f) => filaTablaVista(f, equipoPorNombre));
        } catch {
            // Sin tabla el torneo se dibuja igual: es una pestana de menos, no
            // una pantalla rota.
        }
    }

    // Las etiquetas de zona van por POSICION y en la forma que ya entiende
    // `resolveStandingsRowLabel`, para no abrir un segundo camino de pintado.
    // RugbyPass no las publica: el reglamento sale de `RUGBYPASS_ZONES`.
    const teamLabels = rugbyPassZonesFor(competitionId, standings.length).map((zona) => ({
        id: `rp-zone-${competitionId}-${zona.position}`,
        label_id: `rp-zone-${competitionId}-${zona.kind}`,
        club_id: null,
        position: zona.position,
        tournament_id: tournamentId,
        // Un torneo externo no tiene fases: sin `phase_id`, la etiqueta aplica a
        // la unica tabla que hay.
        phase_id: null,
        group_id: null,
        created_at: null,
        label: {
            id: `rp-zone-${competitionId}-${zona.kind}`,
            name: zona.name,
            color: zona.color,
            scope: 'standings',
        },
    }));

    // El selector de temporadas de la pantalla se arma con `archives` cuando el
    // torneo no vive en la base (`buildExternalSeasonOptions`), asi que no hace
    // falta abrir un segundo camino: alcanza con emitirlas con `season_id`.
    //
    // Va SIN `id` a proposito: `pickArchiveSeasonIds` toma un `id` no numerico
    // como `tournament_stage_id` y lo cuelga de la URL, que para este proveedor
    // no significa nada.
    const archives = temporadas.map((t) => ({
        season_id: t,
        display_name: t,
        name: `Temporada ${t}`,
    }));

    return {
        ids: {
            tournamentId,
            stageId: tournamentId,
            templateId: tournamentId,
            seasonId: temporada,
        },
        details: {
            id: tournamentId,
            tournament_id: tournamentId,
            tournament_stage_id: tournamentId,
            tournament_template_id: tournamentId,
            // El rotulo de una liga del norte cruza el ano ('2025-26'), asi que
            // NO es un numero. Convertirlo daba NaN.
            season_id: temporada,
            season: temporada,
            name: competicion.name,
            full_name: competicion.name,
            country: { name: competicion.country },
            sport: { sport_id: 'rugby', name: 'Rugby' },
            logo: logoTorneo,
            image_path: logoTorneo,
            logo_url: logoTorneo,
            banner_url: '',
            primary_color: colors?.background ?? null,
            secondary_color: colors?.foreground ?? null,
            url: `https://www.rugbypass.com/${competicion.slug}/`,
            source: RUGBYPASS_PROVIDER,
            provider: RUGBYPASS_PROVIDER,
        },
        results,
        fixtures,
        standings: standings.length > 0
            ? [{ group_name: competicion.name, name: competicion.name, note: '', rows: standings }]
            : [],
        standingsForm: [] as unknown[],
        standingsHtFt: [] as unknown[],
        standingsOverUnder: [] as unknown[],
        teamLabels,
        topScorers: [] as unknown[],
        draw: [] as unknown[],
        archives,
    };
}
