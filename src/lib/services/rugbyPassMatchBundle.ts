/**
 * La ficha de un partido de RugbyPass, para `/api/matches/[id]`.
 *
 * El endpoint resolvia base -> FlashScore y nada mas, asi que un id `rp-…`
 * contestaba "Match not found" y la pantalla quedaba vacia. Esta es la rama que
 * faltaba, con la misma forma de bundle que usan las otras fuentes externas.
 *
 * ── EN VIVO ─────────────────────────────────────────────────────────────────
 * Mientras el partido se juega, los eventos NO se leen de la tabla: se piden al
 * proveedor en el momento. La tabla la llena el cron cada hora, y para ver un
 * partido evolucionar eso llega tarde. Con el partido cerrado se lee de la
 * tabla, que es gratis y no cambia mas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
    getEventPeriodForType,
    getNextActivePeriodAfterEvent,
    normalizeMatchPeriod,
} from '../matchPeriods.ts';
import { getRugbyPassMatchDetail, getRugbyPassPlayerStats } from './rugbyPass.ts';
import { hayPlanillaParaPuntuar, minutesFromLineup, rateRugbyPlayer } from '../matches/rugbyPlayerRating.ts';
import {
    RUGBYPASS_MATCH_ID_PREFIX,
    RUGBYPASS_PROVIDER,
    type RugbyPassEvent,
    isRugbyPassMatchId,
    PLAYER_STAT_LABEL_ES,
    RUGBYPASS_PLAYER_STAT_KINDS,
    rugbyPassMatchUrl,
    rugbyPassTeamSlugOf,
    type RugbyPassLineupPlayer,
    type RugbyPassMatchStat,
    type RugbyPassPlayerStat,
} from './rugbyPassParser.ts';

/** Como se lee cada evento en la linea de tiempo. */
const ETIQUETA: Readonly<Record<string, string>> = {
    try: 'Try',
    penalty_try: 'Try penal',
    conversion: 'Conversión',
    penalty_goal: 'Penal',
    drop_goal: 'Drop',
    card_yellow: 'Tarjeta amarilla',
    card_red: 'Tarjeta roja',
    match_start: 'Comienza el partido',
    match_half: 'Entretiempo',
    match_end: 'Final del partido',
};

/** Los eventos de reloj no son de nadie y no llevan jugador. */
const SIN_EQUIPO = new Set(['match_start', 'match_half', 'match_end']);

/** El try penal es del equipo, no de un jugador: se lee "Try penal" y nada mas. */
const SIN_JUGADOR = new Set(['penalty_try']);

export interface RugbyPassTimelineEvent {
    type: string;
    team: 'home' | 'away';
    player: string;
    playerId: string | null;
    description: string;
    minute: string;
    time: string;
    minuteNumber: number;
    /** Periodo canonico del proyecto ('1T', '2T', …), NO un numero. */
    period: string;
    order: number;
}

/**
 * Un evento del proveedor a la forma que renderiza la linea de tiempo.
 *
 * El texto se arma aca y no en el componente: es la unica traduccion entre el
 * dato del proveedor y lo que lee el hincha, y tiene que decir lo mismo en la
 * ficha, en el aviso y en cualquier otro lado que lo muestre.
 */
/**
 * EL ORDEN DE LA CRONOLOGIA.
 *
 * Los rotulos de fase (Start, Half Time, Full Time) NO traen minuto. Si se los
 * deja en cero, cualquier pantalla que ordene por minuto manda el "Final del
 * partido" al principio y la cronologia se lee al reves.
 *
 * Como ya vienen en el orden correcto del proveedor, se les presta el minuto
 * del evento anterior: asi quedan donde corresponde ordene por `order` o por
 * `minuteNumber`.
 */
export function toTimeline(eventos: RugbyPassEvent[]): RugbyPassTimelineEvent[] {
    let ultimoMinuto = 0;
    // El periodo se arrastra por la secuencia y lo adelanta el entretiempo, que
    // es como lo resuelve el resto del proyecto. Deducirlo del minuto no sirve:
    // un partido con tiempo cumplido pasa de 40 sin que haya terminado la etapa.
    let periodo = normalizeMatchPeriod(null);
    return eventos.map((evento, i) => {
        if (evento.minute !== null) ultimoMinuto = evento.minute;
        const delEvento = getEventPeriodForType(evento.type, periodo, 'rugby');
        const salida = toTimelineEvent(evento, i, ultimoMinuto, delEvento);
        periodo = getNextActivePeriodAfterEvent(evento.type, delEvento, 'rugby');
        return salida;
    });
}

export function toTimelineEvent(
    evento: RugbyPassEvent,
    orden: number,
    minutoHeredado = 0,
    periodo?: string
): RugbyPassTimelineEvent {
    const etiqueta = ETIQUETA[evento.type] ?? evento.type;
    const minuto = evento.minute ?? minutoHeredado;
    const descripcion = SIN_EQUIPO.has(evento.type) || SIN_JUGADOR.has(evento.type)
        ? etiqueta
        : evento.playerName
            ? `${etiqueta} de ${evento.playerName}`
            : etiqueta;

    return {
        type: evento.type,
        // El tipo pide 'home' | 'away'; un evento de reloj se apoya en 'home'
        // pero no lleva jugador, asi que la pantalla no lo atribuye a nadie.
        team: evento.side === 'away' ? 'away' : 'home',
        player: evento.playerName ?? '',
        playerId: evento.playerSlug,
        description: descripcion,
        minute: evento.minute !== null ? `${evento.minute}'` : '',
        time: evento.minute !== null ? `${evento.minute}'` : '',
        minuteNumber: minuto,
        // Antes salia 1 o 2 numerico, que `normalizeMatchPeriod` NO reconoce
        // (espera '1T'/'2T'): caia al fallback y la cronologia entera se
        // agrupaba bajo "Primer tiempo", con el minuto 69 adentro.
        period: normalizeMatchPeriod(periodo),
        // El orden del proveedor manda: es el unico que no depende del minuto.
        order: orden,
    };
}

/** Cuanto suma cada cosa en el tanteador, para el total por jugador. */
const PUNTOS_POR_EVENTO: Readonly<Record<string, number>> = {
    try: 5,
    // El try penal ya se cobra convertido: son 7 y no hay pateador despues.
    penalty_try: 7,
    conversion: 2,
    penalty_goal: 3,
    drop_goal: 3,
};

/**
 * Una fila por jugador de la planilla, en el vocabulario que ya entiende
 * `buildPlayerStatsTableData`.
 *
 * El cruce entre la alineacion y la cronologia va por SLUG, no por nombre: el
 * evento escribe el apellido solo ("Wilson") y la alineacion el nombre completo
 * ("Harry Wilson"), asi que emparejar por texto perderia la mitad. El slug
 * (`harry-wilson-1`) viaja en los dos lados y es el mismo.
 */
/**
 * El nombre como clave de cruce, plegado: sin acentos, sin puntuacion y con los
 * espacios colapsados.
 *
 * El ranking por rubro NO trae el slug del jugador —solo el nombre y el escudo
 * del club—, asi que este es el unico cruce posible contra la alineacion. Por
 * suerte los dos textos salen del mismo proveedor y coinciden al caracter; el
 * plegado esta por las dudas, no porque hoy haga falta.
 */
function claveNombre(valor: string) {
    return valor
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Como se lee cada rubro, indexado por el `stat` con el que se lo pidio.
 *
 * Los seis del `live-poll-data` viajan en camelCase (`completedTackles`) y los
 * veintidos de `filter-players-stats` en snake_case (`completed_tackles`), asi
 * que la tabla acepta las dos escrituras y la planilla se arma igual venga de
 * donde venga.
 */
const RUBRO = new Map<string, { metricId: string; label: string }>();
for (const kind of RUGBYPASS_PLAYER_STAT_KINDS) {
    RUBRO.set(kind.id, { metricId: kind.metricId, label: kind.label });
}
for (const [category, label] of Object.entries(PLAYER_STAT_LABEL_ES)) {
    if (RUBRO.has(category)) continue;
    // `completedTackles` ES la medida de tackles del jugador: ocupa la columna
    // "Tackles" que ya existe en vez de estrenar una segunda al lado.
    RUBRO.set(category, { metricId: category === 'completedTackles' ? 'tackles' : category, label });
}

/**
 * Los rubros del partido, indexados por jugador.
 *
 * RugbyPass publica SOLO a los tres mejores de cada rubro: del cuarto para
 * abajo no dice nada. Por eso lo que no vino no se completa con un cero —seria
 * inventar que el jugador no hizo ninguno— y la tabla lo muestra como "—".
 */
function rubrosPorJugador(playerStats: RugbyPassPlayerStat[]) {
    const salida = new Map<string, Record<string, { value: number; label: string }>>();
    for (const stat of playerStats) {
        const clave = claveNombre(stat.playerName);
        if (!clave) continue;
        const rubro = RUBRO.get(stat.category);
        const actual = salida.get(clave) ?? {};
        actual[rubro?.metricId ?? stat.category] = {
            value: stat.total,
            label: rubro?.label ?? stat.category,
        };
        salida.set(clave, actual);
    }
    return salida;
}

type Extras = Record<string, { value: number; label: string }>;

export interface PlanillaDelPartido {
    /** Los rubros de cada jugador, para la tabla. Indexado por nombre plegado. */
    extras: Map<string, Extras>;
    /** El puntaje de 1 a 10, por nombre plegado. Sin entrada = sin puntaje. */
    puntajes: Map<string, number>;
}

/**
 * La planilla del partido: los rubros de cada jugador y su puntaje.
 *
 * Se arma una sola vez porque la consumen dos lugares —la tabla de jugadores y
 * la alineacion— y calcular el puntaje dos veces invita a que se separen.
 *
 * Un apellido que aparece en los dos planteles queda AFUERA: no hay como saber
 * de quien es cada numero, y adjudicarselo al primero seria peor que no
 * mostrarlo. Sin rubros tampoco hay puntaje: un 6 pelado diria "jugo correcto"
 * cuando lo cierto es que no se sabe.
 */
export function planillaDelPartido(
    lineups: { home: RugbyPassLineupPlayer[]; away: RugbyPassLineupPlayer[] },
    playerStats: RugbyPassPlayerStat[]
): PlanillaDelPartido {
    const rubros = rubrosPorJugador(playerStats);

    // NO SE PUNTUA CON MEDIA PLANILLA.
    //
    // Cuando `filter-players-stats` no contesta, lo que queda es el podio del
    // `live-poll-data`: seis rubros y solo los tres mejores de cada uno. Con eso
    // se pueden mostrar los rubros —son ciertos— pero no se puede puntuar: los
    // otros cuarenta y tres jugadores figurarian sin un avance ni un tackle, que
    // no es lo que paso sino lo que no se publico. Salian doce puntajes de 46, y
    // todos hundidos.
    //
    // Se mira que esten los rubros de volumen, que son sobre los que se apoya la
    // cuenta, y no un numero de rubros: si falta uno solo de esos, el puntaje
    // sale sesgado parejo para todo el plantel y nadie lo nota.
    const metricasPresentes = new Set<string>();
    for (const extra of rubros.values()) for (const metricId of Object.keys(extra)) metricasPresentes.add(metricId);
    const sePuedePuntuar = hayPlanillaParaPuntuar(metricasPresentes);

    const repetidos = new Set<string>();
    const vistos = new Set<string>();
    for (const jugador of [...lineups.home, ...lineups.away]) {
        const clave = claveNombre(jugador.name);
        if (vistos.has(clave)) repetidos.add(clave);
        vistos.add(clave);
    }

    const extras = new Map<string, Extras>();
    const puntajes = new Map<string, number>();
    for (const jugador of [...lineups.home, ...lineups.away]) {
        const clave = claveNombre(jugador.name);
        if (repetidos.has(clave)) continue;
        const extra = rubros.get(clave);
        if (!extra) continue;
        extras.set(clave, extra);

        if (!sePuedePuntuar) continue;
        const stats: Record<string, number> = {};
        for (const [metricId, metrica] of Object.entries(extra)) stats[metricId] = metrica.value;
        const puntaje = rateRugbyPlayer({
            stats,
            minutes: minutesFromLineup(jugador),
            number: jugador.number,
        });
        if (puntaje) puntajes.set(clave, puntaje.value);
    }

    return { extras, puntajes };
}

export function toPlayerRows(
    lineups: { home: RugbyPassLineupPlayer[]; away: RugbyPassLineupPlayer[] },
    eventos: RugbyPassEvent[],
    planilla: PlanillaDelPartido,
    homeName: string,
    awayName: string
) {
    const porSlug = new Map<string, { tries: number; puntos: number; amarillas: number; rojas: number; total: number }>();
    for (const evento of eventos) {
        const slug = evento.playerSlug;
        if (!slug) continue;
        const acc = porSlug.get(slug) ?? { tries: 0, puntos: 0, amarillas: 0, rojas: 0, total: 0 };
        if (evento.type === 'try') acc.tries += 1;
        if (evento.type === 'card_yellow') acc.amarillas += 1;
        if (evento.type === 'card_red') acc.rojas += 1;
        acc.puntos += PUNTOS_POR_EVENTO[evento.type] ?? 0;
        acc.total += 1;
        porSlug.set(slug, acc);
    }

    const filas = [];
    for (const [lado, jugadores] of [['home', lineups.home], ['away', lineups.away]] as const) {
        for (const jugador of jugadores) {
            const acc = (jugador.slug ? porSlug.get(jugador.slug) : null)
                ?? { tries: 0, puntos: 0, amarillas: 0, rojas: 0, total: 0 };
            const clave = claveNombre(jugador.name);
            const extra = planilla.extras.get(clave);
            filas.push({
                key: `${lado}:${jugador.slug ?? jugador.name}`,
                playerId: jugador.slug,
                name: jugador.name,
                team: lado,
                teamName: lado === 'home' ? homeName : awayName,
                number: jugador.number,
                // RugbyPass no publica el puesto en la planilla; el numero de
                // camiseta ya lo dice en rugby y no hay que inventarlo.
                position: null,
                rating: planilla.puntajes.get(clave) ?? null,
                isCaptain: false,
                // Un suplente que nunca entro no jugo el partido.
                matchesPlayed: jugador.role === 'starter' || jugador.onMinute !== null ? 1 : 0,
                points: acc.puntos,
                tries: acc.tries,
                tackles: 0,
                goals: 0,
                penaltyGoals: 0,
                greenCards: 0,
                yellowCards: acc.amarillas,
                redCards: acc.rojas,
                events: acc.total,
                ...(extra ? { extraMetrics: extra } : {}),
            });
        }
    }
    return filas;
}

/**
 * La alineacion del proveedor a la forma que renderiza la pantalla.
 *
 * El puntaje viaja aca y no solo en la tabla: la alineacion es donde el hincha
 * mira primero, y un 8,4 al lado del nombre dice mas que cualquier columna.
 */
function toLineup(jugadores: RugbyPassLineupPlayer[], puntajes: Map<string, number>) {
    return jugadores.map((j) => ({
        id: j.slug,
        number: j.number,
        name: j.name,
        position: null,
        role: j.role,
        rating: puntajes.get(claveNombre(j.name)) ?? null,
        isCaptain: false,
    }));
}

interface CachedRow {
    id: string;
    sport: string;
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

interface StoredEventRow {
    type: string;
    side: string | null;
    minute: number | null;
    player_name: string | null;
    player_slug: string | null;
    home_score: number | null;
    away_score: number | null;
}

function fromStored(row: StoredEventRow): RugbyPassEvent {
    return {
        type: row.type,
        side: row.side === 'home' || row.side === 'away' ? row.side : null,
        minute: row.minute,
        playerName: row.player_name,
        playerSlug: row.player_slug,
        homeScore: row.home_score,
        awayScore: row.away_score,
    };
}

/** El numero de partido del proveedor, que es lo que pide el poll. */
export function rugbyPassGameIdOf(matchId: string): number | null {
    if (!isRugbyPassMatchId(matchId)) return null;
    const n = Number(matchId.slice(RUGBYPASS_MATCH_ID_PREFIX.length));
    return Number.isFinite(n) ? n : null;
}

/**
 * `null` cuando el id no es de RugbyPass o el partido no esta en la cache — con
 * eso el endpoint sigue de largo a sus otras ramas en vez de romper.
 */
export async function getRugbyPassMatchBundle(matchId: string, supabase: SupabaseClient) {
    const gameId = rugbyPassGameIdOf(matchId);
    if (gameId === null) return null;

    const { data, error } = await supabase
        .from('external_match_cache')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();

    if (error || !data) return null;
    const fila = data as CachedRow;

    const enVivo = fila.status === 'live';
    // El slug sale de los ids de los equipos (`rp-team-auckland`): sin el, la
    // ficha responde 200 pero SIN eventos.
    const homeSlug = rugbyPassTeamSlugOf(String(fila.home_team?.id ?? ''));
    const awaySlug = rugbyPassTeamSlugOf(String(fila.away_team?.id ?? ''));
    const matchUrl = rugbyPassMatchUrl(gameId, homeSlug, awaySlug);

    // La ficha entera sale de `live-poll-data`: cronologia, estadisticas del
    // partido, las de cada jugador, posesion y territorio, todo en una llamada.
    // Se pide SIEMPRE, no solo en vivo: es la unica fuente de las estadisticas,
    // y para un partido cerrado la respuesta ya no cambia.
    // La planilla por jugador va en paralelo porque sale de OTRA accion
    // (`filter-players-stats`, una llamada por rubro) y no depende de la ficha.
    const [detalle, planilla] = await Promise.all([
        getRugbyPassMatchDetail(gameId, homeSlug, awaySlug),
        getRugbyPassPlayerStats(gameId, homeSlug, awaySlug).catch(() => []),
    ]);

    let eventos: RugbyPassEvent[] = detalle?.events ?? [];
    // El marcador de la ficha acompana a sus estadisticas; si no vino, queda el
    // del fixture, que es el que se ve en el listado.
    let home = detalle?.homeScore ?? fila.score?.home ?? null;
    let away = detalle?.awayScore ?? fila.score?.away ?? null;

    const timeline = toTimeline(eventos);
    const kickoff = new Date(fila.date_time);
    const vacio: unknown[] = [];

    const stats = (detalle?.stats ?? []).map((s: RugbyPassMatchStat) => ({
        label: s.label,
        home: s.home,
        away: s.away,
    }));
    if (detalle?.possession.home !== null && detalle?.possession.home !== undefined) {
        stats.unshift({
            label: 'Posesión',
            home: `${detalle.possession.home}%`,
            away: `${detalle.possession.away ?? ''}%`,
        });
    }
    if (detalle?.territory.home !== null && detalle?.territory.home !== undefined) {
        stats.unshift({
            label: 'Territorio',
            home: `${detalle.territory.home}%`,
            away: `${detalle.territory.away ?? ''}%`,
        });
    }

    // Los mejores por categoria, con el rotulo en castellano y el club al lado.
    const playerStats = (detalle?.playerStats ?? []).map((p: RugbyPassPlayerStat) => ({
        category: PLAYER_STAT_LABEL_ES[p.category] ?? p.category,
        categoryKey: p.category,
        rank: p.rank,
        player: p.playerName,
        team: p.teamName,
        total: p.total,
    }));

    // Las alineaciones vienen en la MISMA llamada que la cronologia; hasta ahora
    // se descartaban y la pestana quedaba vacia.
    const alineaciones = detalle?.lineups ?? { home: [], away: [] };
    const hayAlineaciones = alineaciones.home.length > 0 || alineaciones.away.length > 0;
    // La planilla completa manda. El podio del `live-poll-data` queda de
    // respaldo para cuando `filter-players-stats` no conteste.
    const rubrosDelPartido = planilla.length > 0 ? planilla : detalle?.playerStats ?? [];
    const hoja = planillaDelPartido(alineaciones, rubrosDelPartido);

    const lineups = hayAlineaciones
        ? { home: toLineup(alineaciones.home, hoja.puntajes), away: toLineup(alineaciones.away, hoja.puntajes) }
        : null;
    const localPlayerRows = hayAlineaciones
        ? toPlayerRows(alineaciones, eventos, hoja, fila.home_team?.name ?? '', fila.away_team?.name ?? '')
        : [];

    const equipo = (lado: 'home' | 'away') => {
        const t = (lado === 'home' ? fila.home_team : fila.away_team) ?? {};
        return {
            id: t.id ?? '',
            name: t.name ?? '',
            logo: t.logo ?? '',
            score: lado === 'home' ? home : away,
            teamUrl: '',
            league: fila.tournament_id ?? '',
        };
    };

    return {
        source: RUGBYPASS_PROVIDER,
        match: {
            id: fila.id,
            externalProvider: RUGBYPASS_PROVIDER,
            sportId: 'rugby',
            status: fila.status,
            statusText: fila.status === 'final' ? 'Finalizado' : fila.status === 'live' ? 'En vivo' : 'Programado',
            date: kickoff.toISOString(),
            time: kickoff.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Argentina/Buenos_Aires',
            }),
            tournament: fila.tournament_name ?? '',
            tournamentLogo: '',
            tournamentId: fila.tournament_id ?? '',
            tournamentSeason: String(kickoff.getUTCFullYear()),
            category: fila.country_name ?? 'Internacional',
            round: fila.round_label ?? '',
            venue: '',
            referee: null,
            attendance: null,
            currentMinute: enVivo ? (detalle?.minutes ?? undefined) : undefined,
            home: equipo('home'),
            away: equipo('away'),
            scores: { home, away, penalties: null },
            url: matchUrl,
            lineups,
            standings: vacio,
            h2h: vacio,
            events: timeline,
            stats,
            periods: vacio,
            officials: vacio,
            draw: vacio,
            form: vacio,
            topScorers: vacio,
        },
        h2h: vacio,
        standings: vacio,
        events: timeline,
        stats,
        periods: vacio,
        lineups,
        localPlayerRows,
        playerStats,
    };
}
