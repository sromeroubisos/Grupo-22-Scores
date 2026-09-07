/**
 * Las fichas de un EQUIPO y de un JUGADOR de RugbyPass.
 *
 * Es el camino de LECTURA que faltaba. Los datos ya estaban —299 equipos y 5045
 * jugadores parseados y probados en `rugbyPassCatalog.ts`— pero nadie los pedia:
 * `/clubs/rp-team-argentina` y `/players/rp-player-pablo-matera` abrian la
 * pagina y la API contestaba 404. Es el mismo hueco de prefijos que ya mordio en
 * la ficha del partido y en la del torneo: un proveedor nuevo se declara en
 * varios lugares y con uno solo la pantalla no falla, MIENTE.
 *
 * ── DE DONDE SALE CADA COSA ─────────────────────────────────────────────────
 * La identidad del equipo y la del jugador salen del catalogo, que queda en
 * memoria seis horas. Los PARTIDOS salen de `external_match_cache` —lo que el
 * cron ya llena cada hora— y no de una llamada nueva al proveedor, igual que la
 * ficha del torneo.
 *
 * Lo que RugbyPass NO publica no se inventa: de un jugador hay nombre, puesto,
 * numero, foto y los clubes por los que paso. No hay fecha de nacimiento, ni
 * altura, ni peso, ni valor de mercado — y en rugby eso ultimo ni siquiera
 * existe como concepto (el eje economico es el escalafon de empleo).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { hayPlanillaParaPuntuar, rateRugbyPlayer } from '../matches/rugbyPlayerRating.ts';

import {
    RUGBYPASS_COMPETITIONS,
    RUGBYPASS_PROVIDER,
    RUGBYPASS_TEAM_ID_PREFIX,
    RUGBYPASS_URL,
    isRugbyPassCompetitionEnabled,
    rugbyPassCompetition,
    rugbyPassTeamId,
    rugbyPassTournamentId,
} from './rugbyPassParser.ts';
import {
    RUGBYPASS_PLAYER_ID_PREFIX,
    resolvePlayerTeamSlugs,
    rugbyPassPlayerId,
    type RugbyPassPlayer,
    type RugbyPassPlayerMatch,
    type RugbyPassPlayerProfile,
    type RugbyPassPlayerSeason,
    type RugbyPassTeamEntry,
} from './rugbyPassCatalog.ts';
import {
    getRugbyPassPlayerProfile,
    getRugbyPassPlayers,
    getRugbyPassTeams,
} from './rugbyPass.ts';
import { playerRatings, type StoredPlayerRating } from './rugbyPassMatchRatings.ts';

/**
 * El slug de un id de equipo. `null` si el id no es de RugbyPass.
 *
 * El slug se VALIDA contra `[a-z0-9-]` y no solo se recorta: baja derecho a un
 * filtro de PostgREST, y ahi un caracter de mas no es un dato feo, es una
 * inyeccion en el `or(...)`.
 */
export function parseRugbyPassTeamSlug(value: unknown): string | null {
    return slugDe(value, RUGBYPASS_TEAM_ID_PREFIX);
}

/** El slug de un id de jugador. `null` si el id no es de RugbyPass. */
export function parseRugbyPassPlayerSlug(value: unknown): string | null {
    return slugDe(value, RUGBYPASS_PLAYER_ID_PREFIX);
}

function slugDe(value: unknown, prefijo: string): string | null {
    const texto = String(value ?? '').trim().toLowerCase();
    if (!texto.startsWith(prefijo)) return null;
    const slug = texto.slice(prefijo.length);
    return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

/** Las competiciones habilitadas a las que pertenece un equipo. */
function competicionesDe(equipo: RugbyPassTeamEntry): number[] {
    const habilitadas = new Set(RUGBYPASS_COMPETITIONS.map((c) => c.id));
    return equipo.competitionIds.filter((id) => habilitadas.has(id));
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

function ladoVista(lado: { id?: string; name?: string; logo?: string } | null) {
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
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

function partidoVista(fila: CachedRow) {
    const fecha = new Date(fila.date_time);
    const valida = !Number.isNaN(fecha.getTime());
    const competicion = fila.tournament_id
        ? rugbyPassCompetition(Number(fila.tournament_id.replace(/^rp-comp-/, '')))
        : null;

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
        tournament_id: fila.tournament_id ?? '',
        tournament_name: competicion?.name ?? fila.tournament_name ?? '',
        tournament_stage_name: fila.round_label ?? '',
        country_name: fila.country_name ?? 'Internacional',
        sport_id: fila.sport ?? 'rugby',
        home_team: ladoVista(fila.home_team),
        away_team: ladoVista(fila.away_team),
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
 * Una fila del plantel, con la forma que ya renderiza la pestana.
 *
 * **Sin numero de camiseta, a proposito.** El `pid` del proveedor NO es la
 * camiseta: es el ORDINAL DEL PUESTO. Medido sobre los 114 del plantel de
 * Auckland, cada valor cae siempre en el mismo puesto y ninguno en dos —
 * 1 Prop, 2 Hooker, 3 Prop, 4 y 5 Lock, 6/7/8 Back Row, 9 Scrum Half,
 * 10 Fly Half, 12/13 Centre, 11/14/15 Outside Back, 0 sin puesto. Publicarlo
 * como camiseta pinta siete props distintos con un "1" al lado, que es un dato
 * falso y con cara de verdadero.
 *
 * Se usa solo para ORDENAR, que es para lo que sirve: 1 a 15 es el orden en el
 * que se lee un equipo de rugby, de pilar a fullback.
 */
function jugadorVista(jugador: RugbyPassPlayer) {
    return {
        id: jugador.id,
        player_id: jugador.id,
        name: jugador.name,
        short_name: jugador.name,
        // RugbyPass rotula el puesto en ingles ("Back Row", "Outside Back") y se
        // deja tal cual: traducirlo a mano inventaria un puesto que el proveedor
        // no dijo, y el rugby tiene nombres que no mapean uno a uno.
        position: jugador.position ?? '',
        type: jugador.position ?? '',
        image_path: jugador.photo,
        photo: jugador.photo,
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

/** El orden de lectura de un equipo: pilar (1) a fullback (15). */
function ordenDePuesto(jugador: RugbyPassPlayer): number {
    // El `0` es "sin puesto" y va al final, no adelante de los pilares.
    const pid = jugador.jerseyNumber;
    return pid === null || pid === 0 ? 99 : pid;
}

/**
 * Los partidos de un equipo, de la cache.
 *
 * El filtro va por el id del equipo dentro del JSON de cada lado, que es el
 * MISMO `rp-team-<slug>` con el que el cron los guarda: no se cruza por nombre,
 * que es lo unico que evita que "Auckland" arrastre los de otro Auckland.
 */
async function partidosDe(supabase: SupabaseClient, teamId: string) {
    const { data } = await supabase
        .from('external_match_cache')
        .select('id, sport, tournament_id, tournament_name, country_name, home_team, away_team, score, status, date_time, round_label')
        .or(`home_team->>id.eq.${teamId},away_team->>id.eq.${teamId}`)
        .order('date_time', { ascending: false })
        // Un club no llega a 400 partidos en el calendario publicado, pero el
        // tope esta puesto igual: PostgREST corta en 1000 sin avisar, y una
        // respuesta cortada en silencio es peor que una corta a proposito.
        .limit(400);

    return (data ?? []) as CachedRow[];
}

export interface RugbyPassTeamBundle {
    details: Record<string, unknown>;
    results: ReturnType<typeof partidoVista>[];
    fixtures: ReturnType<typeof partidoVista>[];
    squad: ReturnType<typeof jugadorVista>[];
}

/**
 * La ficha de un equipo. `null` cuando no hay ni fila en el catalogo ni un solo
 * partido, para que el endpoint siga de largo a sus otras ramas en vez de
 * dibujar un club vacio con un nombre inventado.
 *
 * OJO: `/teams/` NO es catalogo completo. De los 221 slugs que aparecen en el
 * feed de partidos, 29 no estan ahi —todo el rugby femenino, mas `england-a` e
 * `italy-a`—. Por eso, cuando el catalogo no lo tiene, la identidad se rearma
 * con lo que dicen los propios partidos antes que contestar 404: el equipo
 * existe, lo que falta es su fila en la grilla.
 */
export async function getRugbyPassTeamBundle(
    slug: string,
    supabase: SupabaseClient
): Promise<RugbyPassTeamBundle | null> {
    const teamId = rugbyPassTeamId(slug);

    let equipo: RugbyPassTeamEntry | null = null;
    try {
        const equipos = await getRugbyPassTeams();
        equipo = equipos.find((e) => e.slug === slug) ?? null;
    } catch {
        // El catalogo caido no puede dejar sin ficha a un equipo cuyos partidos
        // ya estan en la base: se sigue con lo que digan los partidos.
    }

    const filas = await partidosDe(supabase, teamId);
    if (!equipo && filas.length === 0) return null;

    // El nombre y el escudo que ya usan los partidos, para que la ficha no
    // muestre un equipo distinto del que aparece en el fixture.
    const desdePartido = filas
        .map((f) => (f.home_team?.id === teamId ? f.home_team : f.away_team?.id === teamId ? f.away_team : null))
        .find((lado) => lado?.name);

    const name = equipo?.name || desdePartido?.name || slug;
    const logo = equipo?.logo || desdePartido?.logo || '';

    const vistas = filas.map(partidoVista);
    const results = vistas.filter((v) => v.status === 'final');
    const fixtures = vistas
        .filter((v) => v.status !== 'final')
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    // El plantel sale de los jugadores de las competiciones del equipo, cruzados
    // por NOMBRE contra el catalogo de equipos. Dentro de un mismo proveedor
    // cruzar por nombre es sano —los escribe RugbyPass en los dos lados—; entre
    // proveedores no valdria.
    let squad: ReturnType<typeof jugadorVista>[] = [];
    const competiciones = equipo ? competicionesDe(equipo) : [];
    if (equipo && competiciones.length > 0) {
        try {
            const jugadores = await getRugbyPassPlayers(competiciones);
            const equipos = await getRugbyPassTeams();
            squad = resolvePlayerTeamSlugs(jugadores, equipos)
                .filter((entrada) => entrada.teams.some((t) => t.slug === slug))
                .sort((a, b) => ordenDePuesto(a.player) - ordenDePuesto(b.player))
                .map((entrada) => jugadorVista(entrada.player));
        } catch {
            // Sin plantel el club se dibuja igual: es una pestana de menos, no
            // una pantalla rota. `buildSupportedTabs` la saca sola.
        }
    }

    const country = equipo
        ? rugbyPassCompetition(competiciones[0] ?? -1)?.country ?? ''
        : filas[0]?.country_name ?? '';

    return {
        details: {
            id: teamId,
            team_id: teamId,
            name,
            short_name: name,
            logo,
            image_path: logo,
            country_name: country,
            sport_id: 'rugby',
            team_url: `https://www.rugbypass.com/teams/${slug}/`,
            provider: RUGBYPASS_PROVIDER,
            source: RUGBYPASS_PROVIDER,
        },
        results,
        fixtures,
        squad,
    };
}

export interface RugbyPassPlayerBundle {
    details: Record<string, unknown>;
    career: Record<string, unknown>[];
    /** Por competicion y temporada. Vacio cuando la ficha no las publica. */
    seasons: RugbyPassSeasonView[];
    /** Partido por partido, del mas nuevo al mas viejo. */
    matches: RugbyPassMatchView[];
}

/**
 * Como se rotula en castellano cada rubro de la ficha.
 *
 * La clave es la de opta y NO el titulo en ingles: el titulo lo puede cambiar el
 * proveedor sin avisar y ahi el rubro perderia la traduccion en silencio,
 * mientras que la clave es la que viaja en el dato.
 *
 * Son los DIECISEIS rubros que aparecen, medidos sobre 60 temporadas de 23
 * jugadores. Un rubro nuevo cae al titulo en ingles tal como lo publica
 * RugbyPass, que es preferible a inventarle un nombre: es la misma regla con la
 * que el puesto se deja sin traducir.
 */
const RUBROS_ES: Record<string, { label: string; short: string }> = {
    tackles_success: { label: 'Efectividad en el tackle', short: 'Ef. tackle' },
    carries: { label: 'Carries', short: 'Carries' },
    tries: { label: 'Tries', short: 'Tries' },
    try_assist: { label: 'Asistencias de try', short: 'Asist.' },
    lineout_takes: { label: 'Tomas en el line', short: 'Tomas' },
    turnovers_won: { label: 'Turnovers ganados', short: 'Turnovers' },
    dominant_tackles: { label: 'Tackles dominantes', short: 'T. dominantes' },
    touches: { label: 'Intervenciones', short: 'Interv.' },
    passes: { label: 'Pases completados', short: 'Pases' },
    pass_accuracy: { label: 'Precision de pase', short: 'Prec. pase' },
    lineouts_won: { label: 'Lines ganados', short: 'Lines' },
    lineout_won_steal: { label: 'Lines robados', short: 'L. robados' },
    defenders_beaten: { label: 'Defensores superados', short: 'Def. sup.' },
    kicks_from_hand: { label: 'Patadas en juego', short: 'Patadas' },
    // "Goal Converted" en el original: las patadas a los palos que entraron,
    // conversiones y penales juntos. No son "conversiones" a secas y por eso no
    // se rotula asi.
    goal_kicks: { label: 'Palos convertidos', short: 'Palos' },
    clean_breaks: { label: 'Quiebres', short: 'Quiebres' },
    metres: { label: 'Metros ganados', short: 'Metros' },
};

/**
 * El unico rubro que RugbyPass publica como PROPORCION y no como cuenta.
 *
 * `tackles_success` llega `0.77` mientras que su hermano `pass_accuracy` llega
 * `"96%"` ya formateado: el proveedor es inconsistente consigo mismo. Un "0,77"
 * abajo de un rotulo de tackles no es un numero chico, es un numero que no
 * significa nada para el que lo lee. Se muestra como el propio RugbyPass lo
 * muestra en su grafico: 77%.
 *
 * El `0` se deja como numero a proposito: la pantalla ya esconde los rubros en
 * cero, y un "0%" se le escapa a ese filtro. Una efectividad de tackle en cero
 * con 587 minutos jugados no es un dato, es una competicion que el proveedor no
 * midio.
 */
function valorVista(clave: string, valor: number | string): number | string {
    if (clave !== 'tackles_success') return valor;
    if (typeof valor !== 'number' || valor <= 0 || valor > 1) return valor;
    return `${Math.round(valor * 100)}%`;
}

/**
 * UNA TEMPORADA, tal como la lee el selector de torneos de la pantalla.
 *
 * Lleva el logo y el id del torneo porque el selector los muestra y los linkea.
 * `tournament_id` viene VACIO cuando la competicion no es una de las que el
 * conector importa: RugbyPass publica estadisticas de decenas de torneos y
 * nosotros tenemos pantalla para seis. Linkear las otras mandaria al hincha a un
 * 404 — es la misma regla que ya rige para los clubes historicos.
 */
export interface RugbyPassSeasonView {
    id: string;
    competition_name: string;
    season_label: string;
    display_name: string;
    logo: string;
    /** `rp-comp-<oid>`, o vacio si el torneo no tiene pantalla propia. */
    tournament_id: string;
    /** Los puntos de la temporada, completos. Ver `RugbyPassPlayerSeason`. */
    points: number | null;
    /**
     * EL PUNTAJE DE LA TEMPORADA, de 1 a 10, con el mismo motor y la misma
     * escala que el del partido. `null` cuando no se puede calcular.
     */
    rating: number | null;
    minutes: number | null;
    stats: { key: string; label: string; short_label: string; value: number | string }[];
}

/**
 * EL PUNTAJE DE UNA TEMPORADA, con el MISMO motor que el del partido.
 *
 * `rateRugbyPlayer` no sabe si lo que le dan es un partido o una temporada:
 * pide rubros, minutos y puesto, y devuelve una tasa por ochenta minutos.
 * Darle los totales de la temporada y sus minutos da el nivel del jugador en
 * esa temporada, con los mismos pesos por puesto y la misma escala del 1 al 10
 * que se ve en la ficha del partido. Un numero que significara otra cosa no
 * serviria: el hincha compara el 7,2 de la temporada con el 7,2 del sabado.
 *
 * ── POR QUE NO ES EL PROMEDIO DE LOS PARTIDOS ───────────────────────────────
 * Porque no se puede: el puntaje de UN partido necesita `carries`, `metres`,
 * `tackles` y `passes` DE ESE PARTIDO, y la ficha del jugador no publica
 * ninguno de los cuatro —trae minutos, tries, conversiones y tarjetas—. Esos
 * cuatro solo estan en la planilla del partido, que se pide partido por partido.
 *
 * Y ademas la tasa por ochenta es MEJOR que un promedio de partidos: promediar
 * pone al cameo de cinco minutos a la par del partido entero.
 *
 * ── LO QUE ESTE PUNTAJE NO VE ───────────────────────────────────────────────
 * Las TARJETAS. La planilla de temporada tiene sesenta claves y ninguna es
 * amarilla ni roja (van por partido, sin sumar). Asi que una temporada
 * indisciplinada no paga el castigo que si paga un partido: el eje disciplina
 * queda apoyado solo en los penales cometidos y las pelotas perdidas.
 */

/**
 * De la clave de opta al rubro del motor de puntaje.
 *
 * Solo se traducen las que el motor conoce; el resto de las sesenta claves se
 * ignora. `metres` es el rubro de metros ganados con la pelota —el motor lo
 * llama `carriesMetres`— y `lineout_takes` es la toma en el line, que el motor
 * puntua como `lineoutsWon`.
 */
const OPTA_A_RUBRO: Readonly<Record<string, string>> = {
    carries: 'carries',
    metres: 'carriesMetres',
    tackles: 'tackles',
    passes: 'passes',
    missed_tackles: 'missedTackles',
    dominant_tackles: 'dominantTackles',
    turnovers_won: 'turnoversWon',
    turnovers_conceded: 'turnoversConceded',
    penalties_conceded: 'penaltiesConceded',
    offloads: 'offloads',
    defenders_beaten: 'defendersBeaten',
    lineout_takes: 'lineoutsWon',
    clean_breaks: 'cleanBreaks',
    tries: 'tries',
    try_assists: 'tryAssists',
};

/**
 * El numero de camiseta que representa a cada puesto publicado.
 *
 * El motor lee el puesto del DORSAL, que en rugby lo dice sin ambiguedad, y la
 * ficha del jugador publica un rotulo ("Back Row") en vez del numero. El rotulo
 * agrupa: "Back Row" son el 6, el 7 y el 8, y "Outside Back" son el 11, el 14 y
 * el 15.
 *
 * Se elige uno del grupo y queda dicho que es una aproximacion, igual que
 * `rugbyPlayerRating.ts` hace con el banco: adentro de un grupo los pesos se
 * mueven pocos puntos sobre cien, asi que el error es acotado y cae siempre en
 * el vecino, nunca en otro puesto. Buscar mas precision seria inventarla: la
 * misma ficha de Matera lo llama "Flanker" en un lugar y "Number 8" en otro.
 */
const DORSAL_POR_PUESTO: Readonly<Record<string, number>> = {
    Prop: 1,
    Hooker: 2,
    Lock: 4,
    'Back Row': 6,
    'Scrum Half': 9,
    'Fly Half': 10,
    Centre: 13,
    'Outside Back': 15,
};

/**
 * Los minutos de la temporada. `main.totalMinsPlayed` es la fuente, pero la
 * planilla cruda trae `minutes_played_total` y a veces esta una y no la otra.
 */
function minutosDeTemporada(temporada: RugbyPassPlayerSeason): number | null {
    if (temporada.minutes !== null && temporada.minutes > 0) return temporada.minutes;
    const crudo = temporada.rawStats.minutes_played_total;
    return typeof crudo === 'number' && crudo > 0 ? crudo : null;
}

/**
 * El puntaje de una temporada, de 1 a 10. `null` cuando no alcanza para
 * calcularlo: sin minutos, sin puesto conocido, o con una planilla a la que le
 * falta alguno de los cuatro rubros imprescindibles.
 *
 * `null` NO es un cero ni un seis: es "no se puede decir", y la pantalla no
 * dibuja lo que no se sabe.
 */
function puntajeDeTemporada(
    temporada: RugbyPassPlayerSeason,
    puesto: string | null
): number | null {
    const dorsal = puesto ? DORSAL_POR_PUESTO[puesto] ?? null : null;
    if (dorsal === null) return null;

    const minutos = minutosDeTemporada(temporada);
    if (minutos === null) return null;

    // ── LA TEMPORADA SE LLEVA A UNA VENTANA DE OCHENTA MINUTOS ─────────────
    //
    // El motor topea su vara en ochenta (`min(80, minutes) / 80`), asi que
    // pasarle 1104 minutos compara los TOTALES de la temporada contra la vara de
    // UN partido. Y los rubros puntuales —tries, quiebres, robos— no se
    // prorratean a proposito, asi que ocho tries de temporada entraban como
    // ocho tries en ochenta minutos. Medido: con los totales crudos, cuatro de
    // los seis jugadores probados salian 10,0.
    //
    // Se escala todo a la ventana y se le pasa la ventana como minutos. Para una
    // temporada de mas de ochenta minutos eso es la tasa por ochenta; para una
    // mas corta la escala es 1 y el motor la lee igual que a un partido de esa
    // duracion, con su vara achicada y su confianza reducida.
    const ventana = Math.min(80, minutos);
    const escala = ventana / minutos;

    const stats: Record<string, number> = {};
    for (const [optaKey, rubro] of Object.entries(OPTA_A_RUBRO)) {
        const valor = temporada.rawStats[optaKey];
        if (typeof valor === 'number') stats[rubro] = valor * escala;
    }

    // La planilla tiene que haber contestado entera. Con un rubro de volumen de
    // menos, el puntaje sale bajo por un hueco de la fuente y no por el jugador.
    if (!hayPlanillaParaPuntuar(Object.keys(stats))) return null;

    return rateRugbyPlayer({ stats, minutes: ventana, number: dorsal })?.value ?? null;
}

function temporadasVista(
    seasons: readonly RugbyPassPlayerSeason[],
    puesto: string | null
): RugbyPassSeasonView[] {
    return seasons.map((s, i) => {
        const stats: RugbyPassSeasonView['stats'] = [];

        if (s.minutes !== null) {
            stats.push({
                key: 'minutes',
                label: 'Minutos jugados',
                short_label: 'Minutos',
                value: s.minutes,
            });
        }
        // Los puntos van con los rubros y ademas sueltos en `points`: la tarjeta
        // los destaca y la lista los muestra al lado del resto.
        if (s.points !== null) {
            stats.push({ key: 'points', label: 'Puntos', short_label: 'Puntos', value: s.points });
        }

        for (const rubro of s.stats) {
            // Los puntos y los minutos ya fueron: el proveedor los manda sueltos
            // Y otra vez adentro de la lista de rubros, ahi sin traducir, y la
            // ficha terminaba mostrando "Puntos 72" y "Points 72" pegados.
            if (rubro.key === 'points' || rubro.key === 'minutes') continue;

            const es = RUBROS_ES[rubro.key];
            stats.push({
                key: rubro.key || rubro.title,
                label: es?.label ?? rubro.title,
                short_label: es?.short ?? rubro.title,
                value: valorVista(rubro.key, rubro.value),
            });
        }

        return {
            // Un jugador puede tener la MISMA competicion en dos temporadas
            // (Matera tiene tres del Japan Rugby League One), asi que el id lleva
            // el indice: sin el, el selector abre siempre la primera.
            id: `${s.competitionId ?? 'x'}-${s.seasonLabel || i}-${i}`,
            competition_name: s.competitionName,
            season_label: s.seasonLabel,
            display_name: [s.competitionName, s.seasonLabel].filter(Boolean).join(' '),
            logo: s.logo,
            tournament_id:
                s.competitionId !== null && isRugbyPassCompetitionEnabled(s.competitionId)
                    ? rugbyPassTournamentId(s.competitionId)
                    : '',
            points: s.points,
            rating: puntajeDeTemporada(s, puesto),
            minutes: s.minutes,
            stats,
        };
    });
}

/**
 * UN PARTIDO JUGADO.
 *
 * NO lleva puntos y no es un olvido: el proveedor publica por partido `mins`,
 * `tries`, `conversions` y las dos tarjetas, y con eso los puntos no cierran —
 * faltan penales y drops. Ver `partidosDeLaFicha`. Los puntos estan en la
 * temporada, completos.
 */
export interface RugbyPassMatchView {
    title: string;
    /** ISO 8601 en UTC. La pantalla lo formatea con su zona. */
    date: string | null;
    competition_name: string;
    competition_logo: string;
    opponent_name: string;
    opponent_logo: string;
    result: 'win' | 'loss' | 'draw';
    minutes: number | null;
    /** `tries * 5 + conversiones * 2`. Ver `RugbyPassPlayerMatch.points`. */
    points: number | null;
    tries: number | null;
    conversions: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    /**
     * EL PUNTAJE DEL JUGADOR EN ESE PARTIDO, de 1 a 10.
     *
     * No sale de la ficha: sale de `external_match_player_ratings`, que el cron
     * llena puntuando la PLANILLA de cada partido terminado. `null` cuando ese
     * partido todavia no se puntuo o no esta en la cache —los anteriores a
     * agosto de 2025, y las competiciones que RugbyPass no cubre—, y entonces la
     * columna queda vacia: un hueco es mas honesto que un numero inventado.
     */
    rating: number | null;
    /**
     * EL PARTIDO EN NUESTRA BASE (`rp-950802`), para que la fila se pueda abrir.
     *
     * `null` cuando no lo tenemos, que es exactamente cuando tampoco hay
     * puntaje: los dos salen del mismo cruce. Y ahi la fila NO es un link — la
     * ficha del jugador conoce partidos que nosotros no, y mandarlo a una
     * pantalla que no existe es peor que dejar la fila quieta.
     */
    match_id: string | null;
}

/**
 * LA HORA DE LA FICHA DEL JUGADOR VIENE EN LA ZONA DEL VISITANTE.
 *
 * Es la misma trampa que ya tenian `t`, `tsm`, `st` y `k` del calendario, y hay
 * que asumirla en CUALQUIER campo de tiempo de este proveedor. Medido sobre el
 * mismo partido (`rp-952476`, Stade Rochelais vs Toulouse, que el calendario
 * pone a las 19:05 UTC del 6 de septiembre):
 *
 *     desde Argentina (UTC-3)   la ficha dice 22:05 UTC del 6   (+3 h)
 *     desde el server de Vercel la ficha dice 00:05 UTC del 7   (+5 h)
 *
 * O sea: la ficha publica la hora LOCAL del que mira, con el numero leido como
 * si fuera UTC. No es un desfase fijo del proveedor —eso creimos al medirlo una
 * sola vez desde una sola maquina— sino el huso del que pregunta.
 *
 * ── QUE SE HACE CON ESO ─────────────────────────────────────────────────────
 * 1. El CRUCE contra el puntaje guardado es por cercania, no por igualdad ni
 *    por dia UTC. Por instante no coincide nunca; por dia se pierde todo
 *    partido que el corrimiento empuja al dia siguiente, que en produccion es
 *    justo el caso de arriba.
 * 2. La FECHA QUE SE MUESTRA sale del calendario, no de la ficha, cuando el
 *    partido cruzo — ver `partidosVista`. El calendario guarda el `gmt`, que es
 *    el unico campo invariante del proveedor.
 *
 * La ventana son catorce horas: es el huso mas extremo que existe (UTC+14), asi
 * que cubre cualquier lugar desde donde corra el server. Y sigue siendo segura
 * porque es el dato del deporte: en estas competiciones nadie juega dos partidos
 * con menos de un dia de diferencia, asi que adentro de la ventana hay uno o
 * ninguno.
 */
const VENTANA_DE_CRUCE_MS = 14 * 60 * 60 * 1000;

export function puntajeMasCercano<T extends { ms: number }>(
    kickoffMs: number,
    puntajes: readonly T[]
): T | null {
    let mejor: T | null = null;
    let distancia = VENTANA_DE_CRUCE_MS;
    for (const p of puntajes) {
        const d = Math.abs(p.ms - kickoffMs);
        if (d <= distancia) {
            distancia = d;
            mejor = p;
        }
    }
    return mejor;
}

/**
 * EL MISMO PARTIDO, LISTADO DOS VECES.
 *
 * La ficha agrupa los partidos por CLUB, asi que al que se fue a mitad de
 * temporada le aparece el cruce entre sus dos clubes repetido: una vez en el
 * bloque del club que dejo y otra en el del que llego, con el rival invertido.
 * Cameron Woki, que paso de Bordeaux a Racing 92, tiene `Bordeaux vs Racing 92`
 * dos veces —"vs Racing 92" y "vs Bordeaux"— con el mismo horario y los mismos
 * ochenta minutos.
 *
 * Se pliega por titulo mas horario, que es lo que identifica al partido; el
 * rival no sirve, que es justo lo que cambia. Dos partidos distintos no pueden
 * compartir los dos: el titulo ya nombra a los dos equipos.
 *
 * Importa mas alla de la fila repetida: el duplicado contaba dos veces en el
 * promedio del ano y en los totales de la cabecera, que se suman de esta lista.
 */
export function sinRepetidos(matches: readonly RugbyPassPlayerMatch[]): RugbyPassPlayerMatch[] {
    const vistos = new Set<string>();
    const salida: RugbyPassPlayerMatch[] = [];
    for (const m of matches) {
        const clave = `${m.title}|${m.kickoff ?? ''}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        salida.push(m);
    }
    return salida;
}

function partidosVista(
    matches: readonly RugbyPassPlayerMatch[],
    puntajes: readonly StoredPlayerRating[] = []
): RugbyPassMatchView[] {
    const conFecha = puntajes
        .map((p) => ({
            ms: new Date(p.kickoff).getTime(),
            rating: p.rating,
            matchId: p.matchId,
            kickoff: p.kickoff,
        }))
        .filter((p) => Number.isFinite(p.ms));

    return sinRepetidos(matches).map((m) => {
        const guardado = m.kickoff !== null ? puntajeMasCercano(m.kickoff * 1000, conFecha) : null;
        return {
        title: m.title,
        // LA FECHA SALE DEL CALENDARIO SI LA TENEMOS.
        //
        // El `time` de la ficha son segundos epoch pero en la zona del que mira
        // (ver arriba), asi que en produccion corre partidos al dia siguiente.
        // `guardado.kickoff` viene de `external_match_cache`, que guarda el
        // `gmt` — el unico campo de hora invariante del proveedor.
        //
        // Cuando el partido no cruzo no hay con que corregirlo y queda lo que
        // dice la ficha, que es lo que habia antes: una fecha aproximada es
        // mejor que ninguna.
        date: guardado?.kickoff
            ?? (m.kickoff !== null ? new Date(m.kickoff * 1000).toISOString() : null),
        competition_name: m.competitionName,
        competition_logo: m.competitionLogo,
        opponent_name: m.opponentName,
        opponent_logo: m.opponentLogo,
        result: m.result,
        minutes: m.minutes,
        points: m.points,
        tries: m.tries,
        conversions: m.conversions,
        yellow_cards: m.yellowCards,
        red_cards: m.redCards,
        rating: guardado?.rating ?? null,
        // EL MISMO CRUCE DA LOS DOS DATOS. Si encontramos el puntaje es porque
        // encontramos el partido, asi que el id viene con el: no hay una segunda
        // busqueda que pueda desincronizarse y apuntar la fila a otro partido.
        match_id: guardado?.matchId ?? null,
        };
    });
}

/**
 * LA FICHA DE UN JUGADOR, desde su propia pagina.
 *
 * Antes se armaba con el catalogo —`filter-players` de las seis competiciones,
 * 7,2 s y del orden de 14 MB para encontrar un slug— y devolvia el nombre, el
 * puesto y una lista de clubes. Todo lo demas iba en `null` con un comentario
 * que decia que RugbyPass no lo publicaba. Lo publica: esta en
 * `/players/<slug>/`, server-rendered, y ahora sale de ahi.
 *
 * Y el catalogo ademas DEJABA AFUERA a dos de cada tres: se pide con `squad=1`,
 * que son los planteles vigentes, 5045 jugadores. Con `squad=0` son 14262. Los
 * otros 9217 tenian pagina en RugbyPass y 404 en la nuestra.
 *
 * `null` cuando no hay ni ficha ni fila en el catalogo, para que el endpoint
 * siga a sus otras ramas en vez de dibujar un jugador vacio.
 */
export async function getRugbyPassPlayerBundle(
    slug: string,
    supabase?: SupabaseClient
): Promise<RugbyPassPlayerBundle | null> {
    const perfil = await getRugbyPassPlayerProfile(slug);
    if (perfil) return await fichaDesdePerfil(perfil, supabase);

    // La ficha no esta o llego vacia. Antes de darla por perdida se prueba el
    // catalogo: si algun dia cambia el HTML de la pagina, el jugador sigue
    // teniendo nombre, puesto y trayectoria en vez de desaparecer.
    return await fichaDesdeCatalogo(slug);
}

/**
 * Que clubes de la trayectoria se pueden ABRIR.
 *
 * El slug lo escribe la propia pagina en el link, asi que no hace falta cruzar
 * por nombre. Pero un slug no es una ficha: los clubes historicos (Jaguares,
 * Stade Francais, Mie Honda Heat) no estan entre los 299 vigentes y `/clubs/`
 * les contestaria 404. Se linkean SOLO los que el catalogo tiene, y el resto se
 * escribe sin link — que es lo correcto: borrarlos seria borrar la carrera, y
 * linkearlos seria mandar al jugador a una pantalla que no existe.
 */
async function slugsAbribles(): Promise<Set<string>> {
    try {
        return new Set((await getRugbyPassTeams()).map((e) => e.slug));
    } catch {
        // Sin catalogo la trayectoria sale igual, sin links.
        return new Set<string>();
    }
}

function filaDeCarrera(nombre: string, slug: string | null, logo: string) {
    const id = slug ? rugbyPassTeamId(slug) : '';
    return {
        // La fila lee el club de un `team` ANIDADO (`entry.team?.team_id`), no de
        // un `team_id` plano: sin el objeto, el nombre sale como texto suelto y
        // el club no se puede abrir.
        team: id
            ? { id, team_id: id, name: nombre, short_name: nombre, logo, image_path: logo }
            : null,
        team_id: id,
        team_name: nombre,
        name: nombre,
        // El escudo va TAMBIEN afuera del `team`. Adentro solo viaja cuando hay
        // link, y los clubes sin ficha propia —Jaguares, Argentina XV— son justo
        // los que quedaban con el circulo vacio: no tener a donde ir no es lo
        // mismo que no tener cara.
        logo,
        image_path: logo,
        provider: RUGBYPASS_PROVIDER,
    };
}

async function fichaDesdePerfil(
    perfil: RugbyPassPlayerProfile,
    supabase?: SupabaseClient
): Promise<RugbyPassPlayerBundle> {
    const abribles = await slugsAbribles();

    const temporadas = temporadasVista(perfil.seasons, perfil.position);

    // Los puntajes por partido son OPCIONALES: sin cliente de base, o con la
    // migracion sin correr, la ficha sale igual y la columna queda vacia.
    const puntajes = supabase ? await playerRatings(supabase, perfil.slug) : [];

    const clubActual = perfil.currentTeam;
    const idClubActual = clubActual && abribles.has(clubActual.slug)
        ? rugbyPassTeamId(clubActual.slug)
        : '';

    return {
        details: {
            id: rugbyPassPlayerId(perfil.slug),
            player_id: rugbyPassPlayerId(perfil.slug),
            name: perfil.name,
            image_path: perfil.photo,
            photo: perfil.photo,
            // El puesto se deja como lo rotula RugbyPass ("Back Row", "Outside
            // Back"): traducirlo a mano inventaria un puesto que el proveedor no
            // dijo, y el rugby tiene nombres que no mapean uno a uno.
            position: perfil.position ?? '',
            nationality: perfil.nationality ?? '',
            country: perfil.nationality
                ? { name: perfil.nationality, image_path: perfil.nationalityFlag }
                : null,
            age: perfil.age,
            height: perfil.height,
            weight: perfil.weight,
            // RugbyPass publica la EDAD, no la fecha de nacimiento. Va en `null`
            // explicito y no ausente: la pantalla ya sabe no dibujar un dato
            // nulo, y deducir una fecha a partir de la edad seria inventar un dia
            // y un mes que nadie dijo.
            birth_date: null,
            team: clubActual
                ? {
                      id: idClubActual,
                      team_id: idClubActual,
                      name: clubActual.name,
                      short_name: clubActual.name,
                      logo: clubActual.logo,
                      image_path: clubActual.logo,
                  }
                : null,
            season_stats: temporadas,
            // Si patea a los palos, los puntos por partido son SOLO los de try y
            // conversion: los penales y los drops no vienen por partido. La
            // pantalla lo dice en vez de dar un total que se queda corto.
            goal_kicker: perfil.goalKicker,
            player_url: `${RUGBYPASS_URL}/players/${perfil.slug}/`,
            provider: RUGBYPASS_PROVIDER,
            source: RUGBYPASS_PROVIDER,
        },
        career: perfil.teams.map((t) =>
            filaDeCarrera(t.name, abribles.has(t.slug) ? t.slug : null, t.logo)
        ),
        seasons: temporadas,
        matches: partidosVista(perfil.matches, puntajes),
    };
}

/**
 * El camino viejo: armar la ficha con el catalogo de `filter-players`.
 *
 * Queda como RED, no como via principal. Cuesta las seis competiciones enteras y
 * devuelve mucho menos —ni edad, ni altura, ni peso, ni nacionalidad, ni club
 * actual, ni estadisticas— pero mantiene al jugador en pantalla si algun dia la
 * pagina individual cambia de forma.
 *
 * El slug es la UNICA identidad. `pid` NO es el id del jugador: es el ordinal
 * del puesto —los 2453 de "Internationals" comparten 16 valores, del 0 al 15— y
 * plegar por ahi dejaria 16 fichas en vez de 2453.
 */
async function fichaDesdeCatalogo(slug: string): Promise<RugbyPassPlayerBundle | null> {
    const competiciones = RUGBYPASS_COMPETITIONS.map((c) => c.id);
    let jugador: RugbyPassPlayer | undefined;
    try {
        jugador = (await getRugbyPassPlayers(competiciones)).find((j) => j.slug === slug);
    } catch {
        // Si tambien se cae el catalogo, no hay ficha que dibujar.
        return null;
    }
    if (!jugador) return null;

    let equipos: RugbyPassTeamEntry[] = [];
    try {
        equipos = await getRugbyPassTeams();
    } catch {
        // Sin catalogo de equipos la trayectoria sale igual, con los nombres que
        // trae el propio jugador y sin link al club.
    }

    const [conSlug] = resolvePlayerTeamSlugs([jugador], equipos);
    const trayectoria = conSlug?.teams ?? jugador.teams.map((t) => ({ name: t.name, slug: null }));

    return {
        details: {
            id: jugador.id,
            player_id: jugador.id,
            name: jugador.name,
            image_path: jugador.photo,
            photo: jugador.photo,
            position: jugador.position ?? '',
            // ── El club actual NO se puede deducir de la LISTA ──────────────
            //
            // El `t` del jugador es su CARRERA, no su club de hoy: "New Zealand,
            // Barbarians, All Blacks XV, AUNZ XV, Blues, Clermont, Auckland". Y
            // el orden no dice nada — medido en dos planteles: en el de Auckland
            // el club propio cae ULTIMO en 67 de 114 y PRIMERO en 8, y en el de
            // Leinster no cae ni ultimo ni primero en NINGUNO de los 100.
            //
            // Tomar el primero (o el ultimo) es inventar un club que el
            // proveedor no publica ahi, y el error no se ve: la ficha muestra un
            // club plausible y equivocado. La ficha individual SI lo publica, y
            // ese es el camino de arriba.
            nationality: '',
            country: null,
            age: null,
            height: null,
            weight: null,
            birth_date: null,
            team: null,
            season_stats: [],
            goal_kicker: false,
            player_url: `${RUGBYPASS_URL}/players/${slug}/`,
            provider: RUGBYPASS_PROVIDER,
            source: RUGBYPASS_PROVIDER,
        },
        career: trayectoria.map((t) => filaDeCarrera(t.name, t.slug, '')),
        seasons: [],
        matches: [],
    };
}
